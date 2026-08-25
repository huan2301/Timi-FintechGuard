import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from src.app.agents import (
    AgentId,
    ChatSupportResult,
    ChatSupportTask,
    TaskNavigationResult,
    TaskNavigationTask,
    get_multi_agent_supervisor,
)
from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.db.session import get_db
from src.app.models.user import User
from src.app.schemas.assistant import (
    AssistantChatHistoryResponse,
    AssistantChatRequest,
    AssistantChatResponse,
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
    HISTORY_GUIDANCE_ANSWER,
    SENSITIVE_CREDENTIAL_ANSWER,
    contains_sensitive_credential,
    is_admin_policy_message,
    is_history_guidance_question,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])


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
    # This is a deterministic product-capability question. Answer it locally
    # so a temporary Task/Chat Agent outage cannot turn a basic FAQ into a
    # generic connection error. History persistence remains best-effort.
    if is_history_guidance_question(payload.message):
        try:
            save_exchange(
                db,
                user_id=current_user.id,
                message=payload.message,
                answer=HISTORY_GUIDANCE_ANSWER,
                out_of_scope=False,
                response_source="policy",
                settings=settings,
                now=now,
            )
            prune_expired_exchanges(db, user_id=current_user.id, now=now)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Unable to persist local history guidance answer")
        return AssistantChatResponse(
            answer=HISTORY_GUIDANCE_ANSWER,
            task_state=payload.task_state,
        )
    try:
        navigation = get_multi_agent_supervisor().dispatch(
            AgentId.TASK_NAVIGATOR,
            TaskNavigationTask(
                message=payload.message,
                task_state=payload.task_state,
            ),
        )
        if not isinstance(navigation, TaskNavigationResult):
            raise TypeError("Task Navigation Agent trả về kết quả không hợp lệ")
    except Exception:
        logger.exception("Timi task navigation request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Timi chưa thể xử lý thao tác này. Vui lòng thử lại sau.",
        ) from None

    if navigation.handled:
        # Task Navigator has no authority to transfer money.  Its only
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

    # Admin safety wording is server-owned and may have changed since an old
    # cached transfer-routing answer was stored. Never replay that stale pair.
    cached = None if is_admin_policy_message(payload.message) else find_cached_exchange(
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
            task_state=navigation.task_state,
        )

    history = recent_context(
        db,
        user_id=current_user.id,
        exchanges=settings.assistant_chat_context_exchanges,
        now=now,
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
        task_state=navigation.task_state,
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
