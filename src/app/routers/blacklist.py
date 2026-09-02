"""Legacy blacklist routes kept importable for compatibility.

The maintained admin API lives under :mod:`src.app.routers.api.admin.routes`.
These routes use the same ORM models and authorization dependencies so older
deployments cannot bypass current access control.
"""

from __future__ import annotations

import shutil
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.app.core.deps import get_current_user, require_admin
from src.app.database import get_db
from src.app.models.blacklist import Blacklist
from src.app.services.excel_importer import ExcelImporter

router = APIRouter(prefix="/api/v1/blacklist", tags=["Blacklist"])
_ALLOWED_EXCEL_SUFFIXES = {".xlsx", ".xls"}


def _excel_suffix(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_EXCEL_SUFFIXES:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel (.xlsx, .xls)")
    return suffix


@contextmanager
def _temporary_upload(source: BinaryIO, suffix: str) -> Iterator[Path]:
    """Copy an upload to a generated path and always remove it afterward."""
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as target:
            shutil.copyfileobj(source, target)
            temporary_path = Path(target.name)
        yield temporary_path
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


@router.post("/import-excel")
async def import_blacklist_excel(
    file: UploadFile,
    db: Session = Depends(get_db),
    _current_admin=Depends(require_admin),
) -> dict:
    """Import scam-report accounts and phone numbers from a validated workbook."""
    suffix = _excel_suffix(file)
    with _temporary_upload(file.file, suffix) as temporary_path:
        preview = ExcelImporter.preview_data(str(temporary_path), limit=3)
        result = ExcelImporter.import_to_blacklist(db, str(temporary_path))
    return {
        "success": True,
        "preview_sample": preview,
        "import_result": result,
        "message": (f"Import hoàn tất: {result['imported_accounts']} STK + {result['imported_phones']} SĐT"),
    }


@router.post("/preview-excel")
async def preview_blacklist_excel(
    file: UploadFile,
    _current_admin=Depends(require_admin),
) -> dict:
    """Preview normalized rows without writing them to the database."""
    suffix = _excel_suffix(file)
    with _temporary_upload(file.file, suffix) as temporary_path:
        preview = ExcelImporter.preview_data(str(temporary_path), limit=10)
    return {"preview": preview, "total_columns": ["ten", "stk", "ngan_hang", "sdt"]}


@router.get("/statistics")
async def blacklist_statistics(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
) -> dict:
    """Return active blacklist totals and the ten most frequent banks."""
    active = Blacklist.is_active.is_(True)
    total_accounts = db.query(func.count(Blacklist.id)).filter(Blacklist.entity_type == "account", active).scalar() or 0
    total_phones = db.query(func.count(Blacklist.id)).filter(Blacklist.entity_type == "phone", active).scalar() or 0
    top_banks = (
        db.query(Blacklist.bank.label("bank"), func.count(Blacklist.id).label("count"))
        .filter(Blacklist.entity_type == "account", active, Blacklist.bank.is_not(None))
        .group_by(Blacklist.bank)
        .order_by(func.count(Blacklist.id).desc())
        .limit(10)
        .all()
    )
    return {
        "total_accounts": total_accounts,
        "total_phones": total_phones,
        "total_active": total_accounts + total_phones,
        "top_banks": [{"bank": row.bank, "count": row.count} for row in top_banks],
    }
