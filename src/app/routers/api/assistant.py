import logging
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.app.agents import (
    AgentId,
    ChatIntent,
    ChatSupportIntentResult,
    ChatSupportIntentTask,
    ChatSupportResult,
    ChatSupportTask,
    TaskNavigationResult,
    TaskNavigationTask,
    get_multi_agent_supervisor,
)
from src.app.agents.task_navigation import is_semantic_product_question
from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.db.session import get_db
from src.app.models.risk_assessment import RiskSignal, TransactionRiskAssessment, TransactionWarning
from src.app.models.transaction import Transaction
from src.app.models.user import User
from src.app.schemas.assistant import (
    AssistantChatHistoryResponse,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantRiskCoachRequest,
    AssistantRiskCoachResponse,
    AssistantRiskContext,
)
from src.app.services.agent_provider_config import is_rate_limit_error
from src.app.services.assistant_chat_history import (
    clear_history,
    find_cached_exchange,
    list_history,
    mark_exchange_reused,
    prune_expired_exchanges,
    recent_context,
    save_exchange,
)
from src.app.services.public_content_rag import format_context, retrieve_public_context
from src.app.services.timi_assistant import (
    SENSITIVE_CREDENTIAL_ANSWER,
    contains_sensitive_credential,
    is_admin_policy_message,
    is_conversational_message,
    risk_coach_questions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])


def _mask_risk_coach_account(account: str) -> str:
    """Expose no more than the final four recipient-account digits to the coach."""

    compact = account.replace(" ", "").strip()
    return f"***{compact[-4:]}" if len(compact) > 4 else "[đã ẩn]"


def _risk_coach_context_from_persisted_data(
    transaction: Transaction,
    assessment: TransactionRiskAssessment,
    signals: list[RiskSignal],
    warning: TransactionWarning | None,
) -> AssistantRiskContext:
    """Create the Risk Coach context from records owned by the current user.

    The browser may render similar fields, but it must not be an authority for
    the score, recipient, note, or warning that the model will explain.
    """

    user_safe_signals = [
        signal.explanation.strip()[:500]
        for signal in signals
        if signal.score is not None and float(signal.score) > 0 and signal.explanation.strip()
    ]
    risk_level = assessment.risk_level
    if risk_level not in {"low", "medium", "high"}:
        # Risk Coach is called only for an existing warning.  Keep the prompt
        # schema stable if historic data contains an obsolete level value.
        risk_level = "medium"
    return AssistantRiskContext(
        transaction_id=str(transaction.id),
        recipient_name=transaction.payee_name,
        recipient_account_masked=_mask_risk_coach_account(transaction.payee_account),
        bank_name=transaction.bank_code,
        amount=transaction.amount,
        note=transaction.note,
        risk_level=risk_level,
        risk_score=float(assessment.risk_score),
        signals=user_safe_signals[:8],
        warning_message=(warning.message if warning is not None else assessment.explanation),
    )


def _load_verified_risk_coach_context(
    db: Session,
    *,
    user_id: uuid.UUID,
    transaction_id: str | None,
) -> AssistantRiskContext:
    """Load one owned transaction and its latest persisted warning evidence."""

    if not transaction_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Thiếu mã giao dịch cần giải thích cảnh báo.",
        )
    try:
        parsed_id = uuid.UUID(transaction_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Mã giao dịch cần giải thích không hợp lệ.",
        ) from None

    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == parsed_id,
            Transaction.user_id == user_id,
        )
    )
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy giao dịch cần giải thích cảnh báo.",
        )
    assessment = db.scalar(
        select(TransactionRiskAssessment)
        .where(TransactionRiskAssessment.transaction_id == transaction.id)
        .order_by(desc(TransactionRiskAssessment.created_at))
        .limit(1)
    )
    if assessment is None or not assessment.should_warn:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Giao dịch này hiện không có cảnh báo để giải thích.",
        )
    signals = list(
        db.scalars(
            select(RiskSignal)
            .where(RiskSignal.assessment_id == assessment.id)
            .order_by(desc(RiskSignal.created_at))
            .limit(8)
        ).all()
    )
    warning = db.scalar(
        select(TransactionWarning)
        .where(
            TransactionWarning.transaction_id == transaction.id,
            TransactionWarning.assessment_id == assessment.id,
        )
        .order_by(desc(TransactionWarning.displayed_at))
        .limit(1)
    )
    return _risk_coach_context_from_persisted_data(transaction, assessment, signals, warning)


@router.post("/chat", response_model=AssistantChatResponse)
def chat_with_timi(
    payload: AssistantChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssistantChatResponse:
    """Chat with per-user history and exact-repeat reuse, never a shared cache."""
    # Never persist a message that appears to contain an OTP, PIN, or password.
    if contains_sensitive_credential(payload.message):
        return AssistantChatResponse(answer=SENSITIVE_CREDENTIAL_ANSWER)

    settings = get_settings()
    now = datetime.now(UTC)
    # Every message enters through Chat Support's bounded intent selector. It
    # returns only a hand-off label; Task Navigation still owns all browser
    # actions and transfer-draft mutations.
    # Conversational closing phrases are intentionally context-sensitive: let
    # Chat Support read the recent turns instead of replaying a cached answer.
    semantic_question = is_semantic_product_question(payload.message) or is_conversational_message(
        payload.message
    )
    try:
        history = recent_context(
            db,
            user_id=current_user.id,
            exchanges=settings.assistant_chat_context_exchanges,
            now=now,
        )
    except Exception:
        # Chat routing must remain available even when an old/optional history
        # table is unavailable. No cross-user data is used as a fallback.
        logger.exception("Timi chat history lookup failed before intent routing")
        db.rollback()
        history = []
    try:
        intent_result = get_multi_agent_supervisor().dispatch(
            AgentId.CHAT_SUPPORT,
            ChatSupportIntentTask(
                message=payload.message,
                task_state=payload.task_state,
                history=history,
            ),
        )
        if not isinstance(intent_result, ChatSupportIntentResult):
            raise TypeError("Chat Support Intent trả về kết quả không hợp lệ")
    except Exception:
        logger.exception("Timi Chat Support intent request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timi chưa thể xử lý thao tác này. Vui lòng thử lại sau.",
        ) from None

    current_task_state = intent_result.task_state
    navigation: TaskNavigationResult | None = None
    if intent_result.intent in {
        ChatIntent.TRANSFER,
        ChatIntent.NAVIGATION,
        ChatIntent.GUARDIAN_PREFERENCE,
    }:
        try:
            navigation_result = get_multi_agent_supervisor().dispatch(
                AgentId.TASK_NAVIGATOR,
                TaskNavigationTask(
                    message=payload.message,
                    task_state=current_task_state,
                ),
            )
            if not isinstance(navigation_result, TaskNavigationResult):
                raise TypeError("Task Navigation Agent trả về kết quả không hợp lệ")
            navigation = navigation_result
        except Exception:
            logger.exception("Timi task navigation request failed")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Timi chưa thể xử lý thao tác này. Vui lòng thử lại sau.",
            ) from None

        if navigation.handled:
            # Task Navigator has no authority to transfer money. Its only
            # possible action is a browser-side transfer-review prefill or an
            # explicit local Guardian preference change.
            save_exchange(
                db,
                user_id=current_user.id,
                message=navigation.history_message or payload.message,
                answer=navigation.answer or "Timi đã xử lý yêu cầu.",
                out_of_scope=False,
                response_source="task_agent",
                settings=settings,
                now=now,
            )
            prune_expired_exchanges(db, user_id=current_user.id, now=now)
            db.commit()
            return AssistantChatResponse(
                answer=navigation.answer or "Timi đã xử lý yêu cầu.",
                task_state=navigation.task_state,
                action=navigation.action,
            )

        # A model hand-off can be too broad for the deterministic specialist.
        # In that case fall through to Chat Support; never invent an action.
        current_task_state = navigation.task_state

    # Admin safety wording is server-owned and may have changed since an old
    # cached transfer-routing answer was stored. Never replay that stale pair.
    cached = None if is_admin_policy_message(payload.message) or semantic_question else find_cached_exchange(
        db,
        user_id=current_user.id,
        message=payload.message,
        settings=settings,
        now=now,
    )
    if cached is not None:
        mark_exchange_reused(cached, now=now)
        # Retention cleanup and the reuse counter are both scoped to this user.
        prune_expired_exchanges(db, user_id=current_user.id, now=now)
        db.commit()
        return AssistantChatResponse(
            answer=cached.answer,
            out_of_scope=cached.out_of_scope,
            cache_hit=True,
            task_state=current_task_state,
        )

    try:
        knowledge_context = format_context(
            retrieve_public_context(db, payload.message)
        )
    except Exception:
        # RAG is an evidence enhancement, never a reason to take Chat Support
        # offline when the embedding provider or index is unavailable.
        logger.exception("Public content RAG retrieval failed")
        # PostgreSQL marks the current transaction as aborted after an
        # UndefinedTable/provider-backed query error.  Reset it before the
        # chat/history path continues; otherwise the later retention DELETE
        # surfaces a misleading 500 (InFailedSqlTransaction).
        db.rollback()
        knowledge_context = ""
    try:
        result = get_multi_agent_supervisor().dispatch(
            AgentId.CHAT_SUPPORT,
            ChatSupportTask(
                message=payload.message,
                history=history,
                knowledge_context=knowledge_context,
                force_provider=semantic_question,
            ),
        )
        if not isinstance(result, ChatSupportResult):
            raise TypeError("Chat Support Agent trả về kết quả không hợp lệ")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trợ lý Timi chưa được cấu hình API. Vui lòng thử lại sau.",
        ) from None
    except Exception as exc:
        logger.exception("Timi assistant request failed")
        if is_rate_limit_error(exc):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Chat Agent đang hết quota hoặc bị giới hạn tốc độ. "
                    "Vui lòng thử lại sau hoặc cấu hình key dự phòng khác tài khoản."
                ),
            ) from None
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timi chưa thể trả lời lúc này. Vui lòng thử lại sau.",
        ) from None
    save_exchange(
        db,
        user_id=current_user.id,
        message=payload.message,
        answer=result.answer,
        out_of_scope=result.out_of_scope,
        response_source="policy" if result.out_of_scope else "model",
        settings=settings,
        now=now,
    )
    prune_expired_exchanges(db, user_id=current_user.id, now=now)
    db.commit()
    return AssistantChatResponse(
        answer=result.answer,
        out_of_scope=result.out_of_scope,
        task_state=current_task_state,
    )


@router.post("/risk-coach", response_model=AssistantRiskCoachResponse)
def coach_transaction_risk(
    payload: AssistantRiskCoachRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssistantRiskCoachResponse:
    """Explain one owned warning with the Chat Support Agent, without side effects.

    The request's transaction ID is only a locator.  The server reloads all
    explainable fields from the user's persisted transaction, assessment, and
    warning so a browser cannot alter the evidence the model sees.
    """

    safe_context = _load_verified_risk_coach_context(
        db,
        user_id=current_user.id,
        transaction_id=payload.context.transaction_id,
    )
    if safe_context.note and contains_sensitive_credential(safe_context.note):
        safe_context = safe_context.model_copy(update={"note": "[đã ẩn nội dung nhạy cảm]"})
    # The selected suggestion is a conversational aid, not free-form client
    # context. Only pass it through when it exactly matches a question this
    # server generated from the persisted warning evidence.
    guided_question = (payload.guided_question or "").strip()
    if guided_question not in risk_coach_questions(safe_context):
        guided_question = ""

    try:
        result = get_multi_agent_supervisor().dispatch(
            AgentId.CHAT_SUPPORT,
            ChatSupportTask(
                message=payload.message,
                history=payload.history,
                risk_context=safe_context,
                risk_guided_question=guided_question or None,
            ),
        )
        if not isinstance(result, ChatSupportResult):
            raise TypeError("Risk Coach trả về kết quả không hợp lệ")
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trợ lý cảnh báo Timi chưa được cấu hình API. Vui lòng thử lại sau.",
        ) from None
    except Exception as exc:
        logger.exception("Timi risk coach request failed")
        if is_rate_limit_error(exc):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Trợ lý cảnh báo Timi đang bận. Vui lòng thử lại sau một chút.",
            ) from None
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timi chưa thể phân tích cảnh báo lúc này. Vui lòng thử lại sau.",
        ) from None

    return AssistantRiskCoachResponse(
        answer=result.answer,
        questions=risk_coach_questions(safe_context),
    )


@router.get("/history", response_model=AssistantChatHistoryResponse)
def get_timi_chat_history(
    limit: int = Query(default=40, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssistantChatHistoryResponse:
    """Return only the authenticated user's retained conversation pairs."""
    now = datetime.now(UTC)
    prune_expired_exchanges(db, user_id=current_user.id, now=now)
    db.commit()
    return AssistantChatHistoryResponse(
        items=list_history(db, user_id=current_user.id, limit=limit)
    )


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def delete_timi_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete the current user's chat history and no other user's records."""
    clear_history(db, user_id=current_user.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
