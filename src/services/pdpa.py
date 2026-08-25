"""PDPA Compliance utilities.

3 điểm BẮT BUỘC phải áp dụng mask:
  1. Trước khi ghi vào AuditLog.metadata_json
  2. Trong mọi logger.info/error có chứa dữ liệu giao dịch
  3. Trong response trả lỗi (không bao giờ echo receiver_account đầy đủ)

Encrypt/decrypt (Bước 4c) là tùy chọn cho scope demo — ưu tiên mask trước.
"""

from __future__ import annotations

import logging

from src.config import get_settings

logger = logging.getLogger(__name__)


# ── Masking ─────────────────────────────────────────────────────────────────

def mask_account_number(acc: str) -> str:
    """Mask số tài khoản: giữ 3 đầu + 3 cuối, thay giữa bằng *.

    Ví dụ: "0123456789" → "012****789"
    """
    if not acc:
        return "***"
    if len(acc) <= 6:
        return "***"
    return acc[:3] + "*" * (len(acc) - 6) + acc[-3:]


def mask_name(name: str) -> str:
    """Mask tên người: giữ họ, thay tên bằng *.

    Ví dụ: "Nguyễn Văn A" → "Nguyễn ***"
    """
    if not name:
        return "***"
    parts = name.strip().split()
    if len(parts) <= 1:
        return "*" * len(name)
    return parts[0] + " " + "*" * len(" ".join(parts[1:]))


def mask_transaction_metadata(data: dict) -> dict:
    """Trả về bản copy của dict với các PII fields đã được mask.

    Dùng trước khi ghi vào AuditLog.metadata_json.
    """
    masked = dict(data)
    if "receiver_account" in masked:
        masked["receiver_account"] = mask_account_number(str(masked["receiver_account"]))
    if "receiver" in masked:
        masked["receiver"] = mask_name(str(masked["receiver"]))
    if "sender" in masked:
        # Sender thường là user ID, nhưng nếu là tên thì cũng mask
        masked["sender"] = mask_name(str(masked["sender"]))
    return masked


# ── Encryption (optional — Bước 4c) ────────────────────────────────────────

def _get_fernet():
    """Lazy-load Fernet với key từ settings. Raise rõ ràng nếu key trống."""
    try:
        from cryptography.fernet import Fernet
    except ImportError as e:
        raise RuntimeError(
            "cryptography chưa được cài. Chạy: pip install cryptography"
        ) from e

    key = get_settings().pii_encryption_key
    if not key:
        raise ValueError(
            "PII_ENCRYPTION_KEY chưa được cấu hình trong .env. "
            "Sinh key: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_field(value: str) -> str:
    """Mã hóa field nhạy cảm (receiver_account) trước khi lưu DB.

    Lưu ý: đây là mã hóa đối xứng với key tĩnh — đủ cho demo,
    không đạt chuẩn production (cần key rotation / secret manager).
    Xem ADR-003 mục 'Known limitations'.
    """
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_field(value: str) -> str:
    """Giải mã field đã encrypt."""
    return _get_fernet().decrypt(value.encode()).decode()
