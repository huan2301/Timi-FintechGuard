import uuid

import pandas as pd
from sqlalchemy.orm import Session

from ..models import Blacklist


class ExcelImporter:
    """
    Import du lieu scam tu file Excel vao blacklist.
    File Excel co cac cot: Nguoi bi to cao, Ten tai khoan, So tien, SDT, STK, Ngan hang, Luot xem
    """

    REQUIRED_COLUMNS = ["Nguoi bi to cao", "Ten tai khoan", "So tien", "SDT", "STK", "Ngan hang", "Luot xem"]

    @classmethod
    def validate_file(cls, file_path: str) -> bool:
        """Kiem tra file Excel co dung cau truc khong"""
        try:
            df = pd.read_excel(file_path)
            # Bo qua dong header trung neu co
            df = df[df["STK"] != "STK"].copy() if "STK" in df.columns else df
            missing = [col for col in cls.REQUIRED_COLUMNS if col not in df.columns]
            if missing:
                raise ValueError(f"Thieu cot: {missing}. Cac cot phai co: {cls.REQUIRED_COLUMNS}")
            return True
        except Exception as e:
            raise ValueError(f"Loi doc file Excel: {str(e)}")

    @classmethod
    def _clean_dataframe(cls, df: pd.DataFrame) -> pd.DataFrame:
        """Lam sach DataFrame truoc khi import"""
        # Bo dong header trung (neu dong dau cung la header text)
        df = df[df["STK"] != "STK"].copy()

        # Lam sach STK: bo khoang trang, giu nguyen noi dung
        df["STK_clean"] = df["STK"].astype(str).str.strip().str.replace(" ", "")

        # Loai bo dong khong co STK hop le
        df = df[df["STK_clean"].notna() & (df["STK_clean"] != "nan") & (df["STK_clean"] != "")]

        # Lam sach ten: uu tien Nguoi bi to cao, fallback Ten tai khoan
        df["ten"] = df["Nguoi bi to cao"].fillna(df["Ten tai khoan"]).astype(str).str.strip()
        df["ten"] = df["ten"].replace("nan", "").replace("None", "")

        # ✅ Lam sach ngan hang — se dua vao cot bank RIENG
        df["ngan_hang"] = df["Ngan hang"].astype(str).str.strip().replace("nan", "Khong ro")

        # Lam sach SDT
        def clean_phone(x):
            if pd.isna(x):
                return ""
            try:
                s = str(int(float(x)))
                return s
            except (TypeError, ValueError, OverflowError):
                s = str(x).strip().replace(".0", "")
                return s if s != "nan" else ""

        df["sdt"] = df["SDT"].apply(clean_phone)

        # Lam sach so tien (bo dau phay phan cach hang nghin)
        def clean_amount(val):
            if pd.isna(val):
                return None
            s = str(val).replace(",", "").strip()
            try:
                return float(s)
            except (TypeError, ValueError, OverflowError):
                return None

        df["so_tien"] = df["So tien"].apply(clean_amount)

        # Lam sach luot xem
        def clean_views(val):
            if pd.isna(val):
                return None
            s = str(val).replace(" luot xem", "").replace(",", "").strip()
            try:
                return int(float(s))
            except (TypeError, ValueError, OverflowError):
                return None

        df["luot_xem"] = df["Luot xem"].apply(clean_views)

        return df

    @classmethod
    def import_to_blacklist(
        cls, db: Session, file_path: str, source: str = "excel_scam_report", base_risk_score: float = 0.90
    ) -> dict:
        """
        Import du lieu tu Excel vao bang blacklist.
        Moi STK = 1 entity account. Moi SDT (neu co) = 1 entity phone.

        ✅ Dieu kien KIEN QUYET: STK + Ngan hang
        Ten co the thay doi, KHONG dung de match.
        """
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))

        imported_accounts = 0
        imported_phones = 0
        skipped = 0
        errors = []

        for idx, row in df.iterrows():
            try:
                stk = row["STK_clean"]
                ten = row["ten"] if row["ten"] else row["STK_clean"]
                ngan_hang = row["ngan_hang"]
                sdt = row["sdt"]
                so_tien = row["so_tien"]
                luot_xem = row["luot_xem"]

                # --- Import STK (account) ---
                # ✅ Kiem tra trung lap: STK + Ngan hang (dieu kien KIEN QUYET)
                existing_acc = (
                    db.query(Blacklist)
                    .filter(
                        Blacklist.entity_value == stk,
                        Blacklist.bank == ngan_hang,  # ✅ Check ca bank
                        Blacklist.entity_type == "account",
                        Blacklist.is_active.is_(True),
                    )
                    .first()
                )

                if not existing_acc:
                    # Tinh risk score dua tren luot xem
                    risk_score = base_risk_score
                    if luot_xem and luot_xem > 1000:
                        risk_score = min(0.99, base_risk_score + 0.05)
                    elif luot_xem and luot_xem > 100:
                        risk_score = min(0.98, base_risk_score + 0.03)

                    # ✅ Evidence CHI chua: ten, so_tien_bi_lua, sdt, luot_xem
                    # ❌ KHONG chua ngan_hang (da ra cot bank rieng)
                    evidence = {
                        "ten": ten,
                        "so_tien_bi_lua": so_tien,
                        "sdt": sdt if sdt else None,
                        "luot_xem": luot_xem,
                        "imported_from": file_path,
                        "row_index": int(idx),
                    }

                    # Loc bo None values de JSON gon hon
                    evidence = {k: v for k, v in evidence.items() if v is not None}

                    # ✅ Them cot bank rieng
                    blacklist_entry = Blacklist(
                        id=uuid.uuid4(),
                        entity_type="account",
                        entity_value=stk,
                        bank=ngan_hang,  # ✅ Cot rieng
                        source=source,
                        risk_score=risk_score,
                        evidence=evidence,
                        is_active=True,
                    )
                    db.add(blacklist_entry)
                    imported_accounts += 1
                else:
                    skipped += 1

                # --- Import SDT (phone) neu co ---
                if sdt and len(sdt) >= 9:
                    existing_phone = (
                        db.query(Blacklist)
                        .filter(
                            Blacklist.entity_value == sdt,
                            Blacklist.entity_type == "phone",
                            Blacklist.is_active.is_(True),
                        )
                        .first()
                    )

                    if not existing_phone:
                        phone_evidence = {
                            "ten": ten,
                            "sdt": sdt,
                            "stk_lien_quan": stk,
                            "so_tien_bi_lua": so_tien,
                            "luot_xem": luot_xem,
                            "imported_from": file_path,
                            "row_index": int(idx),
                        }
                        phone_evidence = {k: v for k, v in phone_evidence.items() if v is not None}

                        phone_entry = Blacklist(
                            id=uuid.uuid4(),
                            entity_type="phone",
                            entity_value=sdt,
                            source=source,
                            risk_score=base_risk_score,
                            evidence=phone_evidence,
                            is_active=True,
                        )
                        db.add(phone_entry)
                        imported_phones += 1
                    else:
                        skipped += 1

            except Exception as e:
                errors.append({"row": int(idx), "stk": str(stk), "error": str(e)})
                skipped += 1

        db.commit()

        return {
            "total_rows_processed": len(df),
            "imported_accounts": imported_accounts,
            "imported_phones": imported_phones,
            "skipped": skipped,
            "errors": errors[:20],  # Gioi han 20 loi dau
        }

    @classmethod
    def preview_data(cls, file_path: str, limit: int = 10) -> list[dict]:
        """Xem truoc du lieu trong file Excel sau khi lam sach"""
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))
        preview_df = df.head(limit)[["ten", "STK_clean", "ngan_hang", "sdt", "so_tien", "luot_xem"]]
        preview_df.columns = ["ten", "stk", "ngan_hang", "sdt", "so_tien", "luot_xem"]
        return preview_df.to_dict("records")

    @classmethod
    def get_statistics(cls, file_path: str) -> dict:
        """Thong ke du lieu trong file Excel"""
        cls.validate_file(file_path)
        df = cls._clean_dataframe(pd.read_excel(file_path))

        return {
            "total_records": len(df),
            "has_phone": (df["sdt"] != "").sum(),
            "missing_phone": (df["sdt"] == "").sum(),
            "unique_banks": df["ngan_hang"].nunique(),
            "top_banks": df["ngan_hang"].value_counts().head(5).to_dict(),
            "amount_stats": {
                "min": df["so_tien"].min(),
                "max": df["so_tien"].max(),
                "mean": round(df["so_tien"].mean(), 2) if df["so_tien"].notna().any() else None,
            },
            "view_stats": {
                "min": df["luot_xem"].min(),
                "max": df["luot_xem"].max(),
                "mean": round(df["luot_xem"].mean(), 2) if df["luot_xem"].notna().any() else None,
            },
        }
