"""Schemas for internal bank-recipient lookups."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class RecipientLookupRequest(BaseModel):
    account_number: str = Field(..., min_length=6, max_length=19)
    bank_code: str = Field(..., min_length=2, max_length=100)

    @field_validator("account_number", mode="before")
    @classmethod
    def normalize_account_number(cls, value: object) -> str:
        account_number = re.sub(r"\s+", "", str(value or ""))
        if not account_number.isdigit():
            raise ValueError("Số tài khoản chỉ được chứa chữ số")
        return account_number

    @field_validator("bank_code")
    @classmethod
    def trim_bank_code(cls, value: str) -> str:
        return value.strip()


class RecipientLookupResponse(BaseModel):
    account_number: str
    bank_code: str
    account_name: str
    source: Literal["directory", "blacklist", "trusted_recipient", "timi"]
    risk_status: Literal["clear", "caution"] = "clear"
    risk_message: str | None = None
    verification_token: str
