from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db

router = APIRouter(prefix="/api/v1/health", tags=["Health"])

@router.get("/db")
async def test_db_connection(db: Session = Depends(get_db)):
    """
    Test kết nối PostgreSQL + kiểm tra các bảng đã tạo chưa
    """
    try:
        # Test 1: Ping database
        result = db.execute(text("SELECT version()")).fetchone()
        pg_version = result[0] if result else "unknown"
        
        # Test 2: Đếm số bảng trong schema public
        tables = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)).fetchall()
        table_list = [t[0] for t in tables]
        
        # Test 3: Đếm số dòng blacklist (nếu đã import Excel)
        blacklist_count = 0
        try:
            count_result = db.execute(text("SELECT COUNT(*) FROM blacklist")).fetchone()
            blacklist_count = count_result[0] if count_result else 0
        except Exception:
            pass  # Bảng chưa tạo hoặc chưa có dữ liệu
        
        return {
            "status": "connected",
            "postgresql_version": pg_version,
            "total_tables": len(table_list),
            "tables": table_list,
            "blacklist_records": blacklist_count,
            "message": "Kết nối PostgreSQL thành công!"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "disconnected",
                "error": str(e),
                "message": "Không thể kết nối PostgreSQL"
            }
        )
