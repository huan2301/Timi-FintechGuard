import pandas as pd
from sqlalchemy.orm import Session
from typing import List, Dict
from ..models import Blacklist
import uuid

class ExcelImporter:
    """
    Import dữ liệu mẫu từ file Excel vào blacklist.
    File Excel yêu cầu các cột: ten, stk, ngan_hang
    """
    
    REQUIRED_COLUMNS = ["ten", "stk", "ngan_hang"]
    
    @classmethod
    def validate_file(cls, file_path: str) -> bool:
        """Kiểm tra file Excel có đúng cấu trúc không"""
        try:
            df = pd.read_excel(file_path)
            missing = [col for col in cls.REQUIRED_COLUMNS if col not in df.columns]
            if missing:
                raise ValueError(f"Thiếu cột: {missing}. Các cột phải có: {cls.REQUIRED_COLUMNS}")
            return True
        except Exception as e:
            raise ValueError(f"Lỗi đọc file Excel: {str(e)}")
    
    @classmethod
    def import_to_blacklist(
        cls, 
        db: Session, 
        file_path: str,
        source: str = "excel_import",
        risk_score: float = 0.95
    ) -> Dict:
        """
        Import dữ liệu từ Excel vào bảng blacklist.
        Mỗi dòng = 1 entity trong blacklist (account).
        """
        cls.validate_file(file_path)
        df = pd.read_excel(file_path)
        
        imported = 0
        skipped = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Chuẩn hóa dữ liệu
                ten = str(row["ten"]).strip() if pd.notna(row["ten"]) else None
                stk = str(row["stk"]).strip() if pd.notna(row["stk"]) else None
                ngan_hang = str(row["ngan_hang"]).strip() if pd.notna(row["ngan_hang"]) else None
                
                if not stk:
                    skipped += 1
                    continue
                
                # Kiểm tra trùng lặp
                existing = db.query(Blacklist).filter(
                    Blacklist.entity_value == stk,
                    Blacklist.entity_type == "account",
                    Blacklist.is_active == True
                ).first()
                
                if existing:
                    skipped += 1
                    continue
                
                # Tạo bản ghi blacklist
                blacklist_entry = Blacklist(
                    id=uuid.uuid4(),
                    entity_type="account",
                    entity_value=stk,
                    source=source,
                    risk_score=risk_score,
                    evidence={
                        "ten": ten,
                        "ngan_hang": ngan_hang,
                        "imported_from": file_path,
                        "row_index": int(idx)
                    },
                    is_active=True
                )
                
                db.add(blacklist_entry)
                imported += 1
                
            except Exception as e:
                errors.append({"row": idx, "error": str(e)})
        
        db.commit()
        
        return {
            "total_rows": len(df),
            "imported": imported,
            "skipped": skipped,
            "errors": errors
        }
    
    @classmethod
    def preview_data(cls, file_path: str, limit: int = 10) -> List[Dict]:
        """Xem trước dữ liệu trong file Excel"""
        cls.validate_file(file_path)
        df = pd.read_excel(file_path)
        return df.head(limit).to_dict("records")