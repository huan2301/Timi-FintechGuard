import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    """Thông tin user trả về client, tuyệt đối không chứa password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    avatar_url: str | None
    role: str
    is_active: bool
    balance: int
    timi_bank_enabled: bool
    is_google_account: bool
    created_at: datetime
