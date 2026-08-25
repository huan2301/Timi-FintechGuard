import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ScamReportType = Literal["false_positive", "new_scam", "bypass"]
ScamReportStatus = Literal["open", "reviewing", "resolved", "rejected"]


class ScamReportCreate(BaseModel):
    report_type: ScamReportType = "new_scam"
    description: str = Field(..., min_length=10, max_length=2000)


class ScamReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID | None
    report_type: ScamReportType
    description: str
    status: ScamReportStatus
    created_at: datetime


class ScamReportReview(BaseModel):
    status: ScamReportStatus
    admin_note: str | None = Field(default=None, max_length=2000)
