from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..core.security import get_current_admin
from ..services.excel_importer import ExcelImporter
from ..core.security import get_current_user, get_current_admin
import shutil
import os

router = APIRouter(prefix="/api/v1/blacklist", tags=["Blacklist"])

@router.post("/import-excel")
async def import_blacklist_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """
    Import file Excel chứa dữ liệu blacklist (tên, stk, ngân_hàng).
    Yêu cầu: file .xlsx, các cột: ten, stk, ngan_hang
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel (.xlsx, .xls)")
    
    temp_path = f"/tmp/{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = ExcelImporter.import_to_blacklist(db, temp_path)
        return {
            "success": True,
            "message": f"Import hoàn tất: {result['imported']} bản ghi mới",
            "details": result
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/preview-excel")
async def preview_blacklist_excel(
    file: UploadFile = File(...),
    current_admin = Depends(get_current_admin)
):
    """Xem trước dữ liệu Excel trước khi import"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel")
    
    temp_path = f"/tmp/preview_{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        preview = ExcelImporter.preview_data(temp_path, limit=10)
        return {"preview": preview, "total_columns": ["ten", "stk", "ngan_hang"]}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
@router.post("/import-excel")
async def import_blacklist_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_admin)
):
    """
    Import file Excel scam data (scams-done.xlsx format).
    Các cột: Người bị tố cáo, Tên tài khoản, Số tiền, SDT, STK, Ngân hàng, Lượt xem
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel (.xlsx, .xls)")
    
    temp_path = f"/tmp/{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Preview trước
        preview = ExcelImporter.preview_data(temp_path, limit=3)
        
        # Import
        result = ExcelImporter.import_to_blacklist(db, temp_path)
        
        return {
            "success": True,
            "preview_sample": preview,
            "import_result": result,
            "message": f"Import hoàn tất: {result['imported_accounts']} STK + {result['imported_phones']} SDT"
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("/statistics")
async def blacklist_statistics(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Thống kê blacklist hiện tại"""
    total_accounts = db.query(Blacklist).filter(
        Blacklist.entity_type == "account", Blacklist.is_active == True
    ).count()
    total_phones = db.query(Blacklist).filter(
        Blacklist.entity_type == "phone", Blacklist.is_active == True
    ).count()
    
    # Top ngân hàng
    from sqlalchemy import func
    top_banks = db.query(
        Blacklist.evidence['ngan_hang'].astext.label('bank'),
        func.count(Blacklist.id).label('count')
    ).filter(
        Blacklist.entity_type == "account",
        Blacklist.is_active == True
    ).group_by('bank').order_by(func.count(Blacklist.id).desc()).limit(10).all()
    
    return {
        "total_accounts": total_accounts,
        "total_phones": total_phones,
        "total_active": total_accounts + total_phones,
        "top_banks": [{"bank": b.bank, "count": b.count} for b in top_banks]
    }