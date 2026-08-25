"""Deterministic, least-privilege task routing for the in-app assistant."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from src.app.schemas.assistant import (
    AssistantTaskState,
    AssistantTransferDraft,
    AssistantUiAction,
)

_TRANSFER_START_PHRASES = (
    "muon chuyen tien",
    "muon chuyen khoan",
    "can chuyen tien",
    "can chuyen khoan",
    "hay chuyen tien",
    "hay chuyen khoan",
    "chuyen tien ngay",
    "chuyen tien cho",
    "chuyen khoan cho",
    "muon gui",
    "can gui",
    "gui tien cho",
    "tao giao dich",
)
_TRANSFER_CANCEL_PHRASES = (
    "huy chuyen tien",
    "huy chuyen khoan",
    "dung chuyen tien",
    "dung chuyen khoan",
    "khong chuyen nua",
)
_TRANSFER_GUIDANCE_PHRASES = (
    "cach chuyen tien",
    "cach chuyen khoan",
    "chuyen tien nhu the nao",
    "chuyen khoan nhu the nao",
    "nhu nao",
    "nhu the nao",
    "the nao",
    "bang cach nao",
    "lam the nao",
    "lam sao chuyen",
    "lam sao",
    "huong dan chuyen",
    "kieu gi",
    "ra sao",
    "can lam gi",
    "bat dau tu dau",
    "duoc khong",
)
_TRANSFER_CONTEXT_TERMS = ("chuyen tien", "chuyen khoan", "gui tien", "tao giao dich")
_REPEAT_RECIPIENT_CUES = (
    "nguoi nay",
    "nguoi do",
    "nguoi vua roi",
    "nguoi vua chuyen",
    "chuyen them",
    "gui them",
    "chuyen tiep",
    "gui tiep",
)
_TRANSFER_AMOUNT_CHANGE_CUES = (
    "thay doi so tien",
    "doi so tien",
    "sua so tien",
    "cap nhat so tien",
    "chinh so tien",
)
_TRANSFER_QUESTION_CUES = (
    "co the",
    "co phai",
    "can gi",
    "lam gi",
    "phai lam",
    "khong biet",
    "bao nhieu",
    "cho ai",
    "nao",
    "co an toan",
)
_GUARDIAN_TERMS = (
    "nghe va bao ve cuoc goi",
    "bao ve cuoc goi",
    "tu dong nghe",
    "guardian",
)
_ADMIN_TERMS = ("admin", "quan tri", "quan trị")
_ADMIN_TRANSFER_CUES = (
    "chuyen tien",
    "chuyen khoan",
    "gui tien",
    "gui admin",
    "gui vao",
    "chuyen vao",
    "nap tien",
    "thanh toan cho",
)
_NAVIGATION_INTENTS: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "/me?open=password",
        ("doi mat khau", "thay mat khau", "cap nhat mat khau"),
        "Đã mở phần đổi mật khẩu. Nhập mật khẩu hiện tại, mật khẩu mới và xác nhận để lưu thay đổi.",
    ),
    (
        "/me?open=pin",
        ("doi pin", "thay pin", "cap nhat pin", "pin giao dich", "ma pin giao dich"),
        "Đã mở phần cập nhật mã PIN giao dịch. Nhập PIN hiện tại, PIN mới và xác nhận để hoàn tất.",
    ),
    (
        "/setup-pin",
        ("tao pin", "tao ma pin", "ma pin moi", "cai dat pin", "dang ky pin"),
        "Đã mở phần tạo mã PIN giao dịch. Chọn một PIN dễ nhớ với bạn nhưng khó đoán, rồi xác nhận lại mã.",
    ),
    (
        "/setup-face",
        ("face id", "faceid", "khuon mat", "nhan dien khuon mat"),
        "Đã mở phần cài đặt Face ID. Chọn thiết lập Face ID và làm theo hướng dẫn hiển thị trên camera.",
    ),
    (
        "/qr?mode=scan",
        ("quet qr", "quet ma qr", "thanh toan qr", "mo qr"),
        "Đã mở quét mã QR an toàn. Cấp quyền camera nếu được hỏi, rồi đưa mã QR vào giữa khung quét.",
    ),
    (
        "/qr?mode=create",
        ("tao qr", "ma qr cua toi", "nhan tien bang qr", "tao ma qr"),
        "Đã mở phần tạo mã QR nhận tiền. Nhập số tiền hoặc nội dung nếu cần, sau đó chia sẻ mã QR cho người gửi.",
    ),
    (
        "/history",
        ("lich su giao dich", "xem lich su", "giao dich gan day", "lich su chuyen tien"),
        "Đã mở lịch sử giao dịch. Bạn có thể chọn giao dịch bất kỳ để xem đầy đủ thông tin và trạng thái.",
    ),
    (
        "/me",
        (
            "ho so",
            "tai khoan cua toi",
            "thong tin ca nhan",
            "quan ly tai khoan",
            "cai dat tai khoan",
            "doi anh dai dien",
            "thay anh dai dien",
            "thay anh",
            "cap nhat anh dai dien",
            "anh dai dien",
            "dang xuat",
        ),
        "Đã mở trang Hồ sơ và cài đặt tài khoản. Chọn mục bạn muốn quản lý để tiếp tục.",
    ),
    (
        "/transfer",
        (
            "trang chuyen tien",
            "mo chuyen tien",
            "vao chuyen tien",
            "den chuyen tien",
            "vao phan chuyen tien",
            "mo phan chuyen tien",
            "phan chuyen tien",
            "man hinh chuyen tien",
            "sang chuyen tien",
            "qua chuyen tien",
        ),
        "Đã mở trang Chuyển tiền. Nhập số tài khoản, ngân hàng và số tiền; kiểm tra lại trước khi xác nhận.",
    ),
    (
        "/dashboard",
        (
            "trang chu",
            "man hinh chinh",
            "tong quan",
            "ve trang chu",
            "mo trang tong quan",
        ),
        "Đã mở trang Tổng quan. Từ đây bạn có thể xem số dư, hoạt động gần đây hoặc chọn chức năng cần dùng.",
    ),
    (
        "/terms",
        (
            "dieu khoan",
            "dieu khoan su dung",
            "trang dieu khoan",
            "xem dieu khoan",
            "terms",
        ),
        "Đã mở Điều khoản sử dụng của Timi để bạn xem lại các điều kiện và trách nhiệm khi dùng dịch vụ.",
    ),
    (
        "/privacy",
        (
            "bao mat du lieu",
            "chinh sach bao mat",
            "quyen rieng tu",
            "trang bao mat",
            "privacy",
        ),
        "Đã mở Chính sách bảo mật để bạn xem cách Timi bảo vệ và sử dụng dữ liệu cá nhân.",
    ),
    (
        "/mission",
        (
            "su menh",
            "su menh timi",
            "tam nhin timi",
            "gioi thieu timi",
            "trang su menh",
        ),
        "Đã mở trang Sứ mệnh của Timi để bạn xem định hướng và các cam kết của chúng tôi.",
    ),
    (
        "/help",
        (
            "tro giup",
            "trung tam tro giup",
            "trang ho tro",
            "cau hoi thuong gap",
            "help",
        ),
        "Đã mở Trung tâm trợ giúp. Bạn có thể xem câu hỏi thường gặp hoặc thông tin liên hệ hỗ trợ.",
    ),
)
_NAVIGATION_RESPONSE_OVERRIDES: tuple[tuple[str, tuple[str, ...], str], ...] = (
    (
        "/me",
        ("doi anh dai dien", "thay anh dai dien", "thay anh", "cap nhat anh dai dien", "anh dai dien"),
        "Đã mở Hồ sơ. Bấm biểu tượng máy ảnh trên ảnh đại diện để chọn và thay ảnh mới.",
    ),
)
_KNOWN_BANKS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("ABB", ("abbank", "abb")),
    ("ACB", ("acb",)),
    ("AGRIBANK", ("agribank",)),
    ("BAB", ("bac a bank", "bab")),
    ("BIDV", ("bidv",)),
    ("BVB", ("baoviet bank", "bvb")),
    ("CAKE", ("cake by vpbank", "cake")),
    ("CIMB", ("cimb",)),
    ("CTG", ("vietinbank", "vietin", "ctg")),
    ("EIB", ("eximbank", "eib")),
    ("GPB", ("gpbank", "gpb")),
    ("HDB", ("hdbank", "hdb")),
    ("HSBC", ("hsbc",)),
    ("IVB", ("indovina", "ivb")),
    ("KBANK", ("kasikornbank", "kbank")),
    ("KLB", ("kienlongbank", "klb")),
    ("LPB", ("lpbank", "lienvietpostbank", "lpb")),
    ("MBB", ("mb bank", "mbbank", "mbb")),
    ("MSB", ("msb", "maritime bank")),
    ("NAB", ("nam a bank", "nab")),
    ("OCB", ("ocb",)),
    ("PGB", ("pgbank", "pgb")),
    ("PVCB", ("pvcombank", "pvcb")),
    ("SCB", ("scb",)),
    ("SCVN", ("standard chartered", "scvn")),
    ("SEAB", ("seabank", "seab")),
    ("SGB", ("saigonbank", "sgb")),
    ("SHB", ("shb",)),
    ("SHINHAN", ("shinhan",)),
    ("STB", ("sacombank", "stb")),
    ("TCB", ("techcombank", "techcom", "tcb")),
    ("TIMO", ("timo",)),
    ("TIMI", ("timi bank", "timi")),
    ("TPB", ("tpbank", "tpb")),
    ("UBANK", ("ubank",)),
    ("UOB", ("uob",)),
    ("VAB", ("viet a bank", "vab")),
    ("VCB", ("vietcombank", "vietcom", "vcb")),
    ("VIB", ("vib",)),
    ("VPB", ("vpbank", "vp bank", "vpb")),
    ("WOORI", ("woori",)),
)
_ACCOUNT_PATTERN = re.compile(r"(?<!\d)(?:\d[ .-]?){6,19}\d(?!\d)")
_ACCOUNT_LABEL_PATTERN = re.compile(
    r"(?:stk|so\s*tk|so\s*tai\s*khoan|tai\s*khoan)\s*(?:la|:|=)?\s*"
    r"((?:\d[ .-]?){5,18}\d)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class TaskNavigationDecision:
    """A routing result; only the browser can execute its allowed UI action."""

    handled: bool
    answer: str | None
    task_state: AssistantTaskState
    action: AssistantUiAction | None = None
    history_message: str | None = None
    # Some messages intentionally fall through to Chat Support.  Those must
    # not be reinterpreted by the contextual page-navigation model.
    allow_contextual_navigation: bool = True


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    without_accents = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    return without_accents.replace("đ", "d")


def _canonical_bank_code(message: str) -> str | None:
    normalized = _normalize(message)
    for code, aliases in _KNOWN_BANKS:
        if any(alias in normalized for alias in aliases):
            return code
    return None


def _extract_account(
    message: str,
    *,
    allow_bare: bool,
    exclude_value: int | None = None,
) -> str | None:
    match = _ACCOUNT_LABEL_PATTERN.search(_normalize(message))
    if match:
        account = re.sub(r"\D", "", match.group(1) if match.lastindex else match.group(0))
        return account if 6 <= len(account) <= 19 else None
    if not allow_bare:
        return None
    for candidate in _ACCOUNT_PATTERN.finditer(message):
        account = re.sub(r"\D", "", candidate.group(0))
        if 6 <= len(account) <= 19 and (
            exclude_value is None or int(account) != exclude_value
        ):
            return account
    return None


def _extract_amount(message: str, *, allow_bare: bool) -> int | None:
    normalized = _normalize(message)
    compact = normalized.replace(" ", "")
    multiplier = 1
    match = re.search(r"(?<!\d)(\d+(?:[.,]\d{3})*)(?:\s*)(trieu|tr|nghin|k|vnd|dong|d)(?![a-z])", normalized)
    if match:
        value, unit = match.groups()
        if unit in {"trieu", "tr"}:
            multiplier = 1_000_000
        elif unit in {"nghin", "k"}:
            multiplier = 1_000
    else:
        match = re.search(
            r"(?:so\s*tien|chuyen\s*(?:tien|khoan)?|gui)\s*(?:la|:|=)?\s*"
            r"(\d+(?:[.,]\d{3})*)",
            compact,
        )
        if not match and allow_bare:
            match = re.fullmatch(r"\s*(\d+(?:[.,]\d{3})*)\s*", normalized)
        if not match:
            return None
        value = match.group(1)
    amount = int(re.sub(r"\D", "", value)) * multiplier
    return amount if 1 <= amount <= 999_999_999 else None


def _is_transfer_start(message: str) -> bool:
    normalized = _normalize(message)
    if any(phrase in normalized for phrase in _TRANSFER_START_PHRASES):
        return True
    if not re.search(r"\b(?:chuyen|gui)\b", normalized):
        return False
    # Natural voice/text variants often place the amount or account between
    # the verb and recipient (e.g. "chuyển khoản 1 triệu cho..."). Those are
    # still explicit transaction starts, while guidance questions are filtered
    # by _is_transfer_guidance_question before this function is called.
    return _extract_amount(message, allow_bare=True) is not None or _extract_account(
        message,
        allow_bare=True,
    ) is not None


def _is_transfer_guidance_question(message: str) -> bool:
    """Keep informational transfer questions on the Chat Support path."""

    normalized = _normalize(message)
    if "huong dan" in normalized and any(
        phrase in normalized for phrase in _TRANSFER_CONTEXT_TERMS
    ):
        return True
    if any(phrase in normalized for phrase in _TRANSFER_GUIDANCE_PHRASES):
        return True
    if not any(phrase in normalized for phrase in _TRANSFER_CONTEXT_TERMS):
        return False
    return (
        any(phrase in normalized for phrase in _TRANSFER_QUESTION_CUES)
        or normalized.rstrip().endswith((" khong", " a", " ha", " nhi"))
    )


def _is_repeat_recipient_request(message: str) -> bool:
    """Recognize an explicit reference to the previously used recipient.

    This intentionally does not treat an amount-only message as a repeat:
    the user must say who to reuse (for example, "người này" or "chuyển
    thêm") before any remembered account is put back into a draft.
    """

    normalized = _normalize(message)
    return any(phrase in normalized for phrase in _REPEAT_RECIPIENT_CUES)


def _is_transfer_amount_change_request(message: str) -> bool:
    """Recognize an explicit request to edit the amount in the last draft."""

    normalized = _normalize(message)
    return any(phrase in normalized for phrase in _TRANSFER_AMOUNT_CHANGE_CUES)


def _is_history_guidance_question(message: str) -> bool:
    """Keep history capability questions out of contextual page navigation."""

    normalized = _normalize(message)
    return (
        "lich su" in normalized
        and any(
            cue in normalized
            for cue in (
                "tra cuu",
                "co the xem gi",
                "xem gi",
                "bo loc",
                "tim giao dich",
            )
        )
    )


def _is_admin_transfer_request(message: str) -> bool:
    """Keep admin-role questions out of the transfer draft flow.

    ``admin`` describes a permission role, not a recipient identity. A user
    mentioning a transfer to an admin must receive a safety explanation first,
    never an account-number collection prompt or automatic navigation.
    """

    normalized = _normalize(message)
    mentions_admin = any(term in normalized for term in _ADMIN_TERMS)
    mentions_transfer = any(phrase in normalized for phrase in _ADMIN_TRANSFER_CUES)
    return mentions_admin and mentions_transfer


def _is_transfer_cancel(message: str) -> bool:
    normalized = _normalize(message)
    return any(phrase in normalized for phrase in _TRANSFER_CANCEL_PHRASES)


def _is_guardian_disable_request(message: str) -> bool:
    normalized = _normalize(message)
    if any(
        phrase in normalized
        for phrase in (
            "khong tat",
            "dung tat",
            "khong muon tat",
            "cach tat",
            "huong dan tat",
            "lam sao tat",
        )
    ):
        return False
    return (
        any(term in normalized for term in _GUARDIAN_TERMS)
        and normalized.startswith(
            (
                "tat ",
                "dung ",
                "toi muon tat",
                "toi can tat",
                "hay tat",
                "toi muon dung",
                "toi can dung",
                "hay dung",
            )
        )
    )


def _is_guardian_enable_request(message: str) -> bool:
    """Accept only a direct request to enable the caller's Guardian preference."""
    normalized = _normalize(message)
    if any(
        phrase in normalized
        for phrase in (
            "khong bat",
            "dung bat",
            "khong muon bat",
            "cach bat",
            "huong dan bat",
            "lam sao bat",
        )
    ):
        return False
    return (
        any(term in normalized for term in _GUARDIAN_TERMS)
        and normalized.startswith(
            (
                "bat ",
                "mo ",
                "kich hoat ",
                "toi muon bat",
                "toi can bat",
                "hay bat",
                "toi muon mo",
                "toi can mo",
                "hay mo",
                "toi muon kich hoat",
                "toi can kich hoat",
                "hay kich hoat",
            )
        )
    )


def _navigation_request(message: str) -> tuple[str, str] | None:
    """Map clear product-navigation requests to a browser allowlist only."""
    normalized = _normalize(message)
    # Never soften a destructive account request into a harmless-looking page
    # navigation just because it happens to include words such as "tài khoản".
    # Such requests must remain out of this agent's authority.
    if any(
        phrase in normalized
        for phrase in (
            "xoa tai khoan",
            "dong tai khoan",
            "khoa tai khoan",
            "huy tai khoan",
            "xoa du lieu",
            "xoa giao dich",
        )
    ):
        return None
    for route, phrases, answer in _NAVIGATION_INTENTS:
        if any(_contains_whole_phrase(normalized, phrase) for phrase in phrases):
            for override_route, override_phrases, override_answer in _NAVIGATION_RESPONSE_OVERRIDES:
                if override_route == route and any(
                    _contains_whole_phrase(normalized, phrase) for phrase in override_phrases
                ):
                    return route, override_answer
            return route, answer
    return None


def navigation_action_for_route(
    route: str,
    state: AssistantTaskState,
    *,
    history_message: str | None = None,
    response_text: str | None = None,
) -> TaskNavigationDecision | None:
    """Turn one validated allowlist route into a server-owned UI action.

    This is deliberately the only bridge from an LLM navigation intent to the
    browser. A model cannot supply its own URL, response wording, or action.
    """

    for allowed_route, _phrases, answer in _NAVIGATION_INTENTS:
        if route == allowed_route:
            return TaskNavigationDecision(
                handled=True,
                answer=response_text or answer,
                task_state=state,
                action=AssistantUiAction(type="navigate_app", route=allowed_route),
                history_message=_redact_history_message(history_message or ""),
            )
    return None


def _contains_whole_phrase(text: str, phrase: str) -> bool:
    """Match route intents on word boundaries, never on a word prefix.

    Vietnamese text is normalized before matching.  A raw substring check made
    ``trang chu`` (home) match ``trang chuyen tien`` (transfer) because
    ``chuyen`` begins with ``chu`` after removing accents.  This helper keeps
    the phrase readable while rejecting that unsafe partial match.
    """

    return bool(
        re.search(
            rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])",
            text,
        )
    )


def _redact_history_message(message: str) -> str:
    def mask(match: re.Match[str]) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        return f"••••{digits[-4:]}"

    return _ACCOUNT_PATTERN.sub(mask, message)


def _remember_recipient(draft: AssistantTransferDraft) -> AssistantTransferDraft | None:
    """Keep only an account/bank pair for an explicit follow-up."""

    if not draft.recipient_account or not draft.bank_code:
        return None
    return AssistantTransferDraft(
        recipient_name=draft.recipient_name,
        recipient_account=draft.recipient_account,
        bank_code=draft.bank_code,
        amount=None,
        note=None,
    )


def _empty_state(
    *, last_recipient: AssistantTransferDraft | None = None,
) -> AssistantTaskState:
    return AssistantTaskState(last_recipient=last_recipient)


def _next_question(draft: AssistantTransferDraft, newly_recorded: str | None) -> str:
    prefix = f"Đã ghi nhận {newly_recorded}. " if newly_recorded else ""
    if not draft.recipient_account:
        return f"{prefix}Vui lòng nhập số tài khoản người nhận (6–19 chữ số)."
    if not draft.bank_code:
        return f"{prefix}Số tài khoản này thuộc ngân hàng nào?"
    if not draft.amount:
        return f"{prefix}Bạn muốn chuyển bao nhiêu tiền?"
    return prefix


def _route_transfer(message: str, state: AssistantTaskState) -> TaskNavigationDecision:
    draft = state.transfer.model_copy(deep=True)
    newly_recorded: str | None = None
    amount = _extract_amount(message, allow_bare=bool(draft.recipient_account))
    account = _extract_account(message, allow_bare=True, exclude_value=amount)
    bank_code = _canonical_bank_code(message)
    if account and account != draft.recipient_account:
        draft.recipient_account = account
        newly_recorded = "số tài khoản"
    if bank_code and bank_code != draft.bank_code:
        draft.bank_code = bank_code
        newly_recorded = f"ngân hàng {bank_code}"
    if amount and amount != draft.amount:
        draft.amount = amount
        newly_recorded = f"số tiền {amount:,.0f}đ".replace(",", ".")

    # Timi Bank uses the user's verified 10-digit phone number as the account
    # number.  Do not navigate to a review whose recipient lookup will fail.
    if draft.bank_code == "TIMI" and draft.recipient_account and len(draft.recipient_account) != 10:
        draft.recipient_account = None
        return TaskNavigationDecision(
            handled=True,
            answer="Tài khoản Timi Bank cần đúng 10 chữ số. Vui lòng nhập lại số tài khoản.",
            task_state=AssistantTaskState(
                task="transfer",
                transfer=draft,
                last_recipient=state.last_recipient,
            ),
            history_message=_redact_history_message(message),
        )

    if all((draft.recipient_account, draft.bank_code, draft.amount)):
        return TaskNavigationDecision(
            handled=True,
            answer=(
                "Mình đã có đủ thông tin. Mở trang xem lại giao dịch để Timi tra cứu đúng "
                "tên chủ tài khoản. Bạn hãy kiểm tra lại người nhận, số tiền và tự bấm kiểm tra "
                "rủi ro/xác nhận nếu đồng ý."
            ),
            task_state=_empty_state(last_recipient=_remember_recipient(draft)),
            action=AssistantUiAction(
                type="navigate_transfer_review",
                transfer=draft,
            ),
            history_message=_redact_history_message(message),
        )

    return TaskNavigationDecision(
        handled=True,
        answer=_next_question(draft, newly_recorded),
        task_state=AssistantTaskState(
            task="transfer",
            transfer=draft,
            last_recipient=state.last_recipient,
        ),
        history_message=_redact_history_message(message),
    )


def route_task(message: str, state: AssistantTaskState) -> TaskNavigationDecision:
    """Route only the two explicit, least-privilege task families.

    Unknown requests deliberately return ``handled=False`` so the chat support
    agent can answer product questions.  This agent cannot execute transfers,
    change account data, or control any role outside its declared capabilities.
    """
    if _is_guardian_disable_request(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã tắt tự động nghe và bảo vệ cuộc gọi theo yêu cầu của bạn.",
            task_state=state,
            action=AssistantUiAction(
                type="set_guardian_voice_monitoring",
                voice_monitoring_enabled=False,
            ),
            history_message=message,
        )

    if _is_guardian_enable_request(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã bật tự động nghe và bảo vệ cuộc gọi theo yêu cầu của bạn.",
            task_state=state,
            action=AssistantUiAction(
                type="set_guardian_voice_monitoring",
                voice_monitoring_enabled=True,
            ),
            history_message=message,
        )

    # An admin is a role in Timi, not a recipient selected by the assistant.
    # Route these messages to Chat Support for the safety/policy explanation;
    # never collect account details or open the transfer review screen.
    if _is_admin_transfer_request(message):
        return TaskNavigationDecision(
            handled=False,
            answer=None,
            task_state=_empty_state(),
            allow_contextual_navigation=False,
        )

    navigation = _navigation_request(message)
    if navigation:
        route, answer = navigation
        decision = navigation_action_for_route(
            route,
            state,
            history_message=message,
            response_text=answer,
        )
        if decision is not None:
            return decision

    if state.task == "transfer" and _is_transfer_cancel(message):
        return TaskNavigationDecision(
            handled=True,
            answer="Đã hủy phần chuẩn bị chuyển tiền. Mình chưa tạo hay thực hiện giao dịch nào.",
            task_state=_empty_state(),
            history_message=message,
        )

    # A question about how to transfer is not transaction data.  Clear an
    # unfinished draft as well: otherwise a stale draft can make a later
    # message look like consent to continue a transaction the user did not
    # intend to create.
    if _is_transfer_guidance_question(message):
        return TaskNavigationDecision(
            handled=False,
            answer=None,
            task_state=_empty_state(),
            allow_contextual_navigation=False,
        )

    if _is_history_guidance_question(message):
        return TaskNavigationDecision(
            handled=False,
            answer=None,
            task_state=state,
            allow_contextual_navigation=False,
        )

    # A completed transfer leaves a recipient-only context.  Rehydrate it
    # only for an explicit follow-up reference; never for a bare amount.
    if state.task == "none" and _is_repeat_recipient_request(message):
        remembered = state.last_recipient
        if remembered and remembered.recipient_account and remembered.bank_code:
            repeat_draft = remembered.model_copy(deep=True)
            repeat_draft.amount = None
            repeat_draft.note = None
            return _route_transfer(
                message,
                AssistantTaskState(
                    task="transfer",
                    transfer=repeat_draft,
                    last_recipient=remembered,
                ),
            )

    # After the review screen opens, the user may correct only the amount and
    # ask to review again.  Reuse the recipient pair, but never bypass the
    # transfer page's fresh lookup, risk check, or final confirmation.
    if state.task == "none" and _is_transfer_amount_change_request(message):
        remembered = state.last_recipient
        if remembered and remembered.recipient_account and remembered.bank_code:
            amount_draft = remembered.model_copy(deep=True)
            amount_draft.amount = None
            amount_draft.note = None
            return _route_transfer(
                message,
                AssistantTaskState(
                    task="transfer",
                    transfer=amount_draft,
                    last_recipient=remembered,
                ),
            )

    if state.task == "transfer":
        return _route_transfer(message, state)

    if _is_transfer_start(message) and not _is_transfer_guidance_question(message):
        return _route_transfer(message, _empty_state())

    return TaskNavigationDecision(
        handled=False,
        answer=None,
        task_state=state,
    )
