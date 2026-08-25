from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Optional
import numpy as np

class VectorStore:
    """
    Quản lý vector embeddings cho scam patterns và blacklist.
    Sử dụng pgvector (PostgreSQL extension).
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def search_similar_patterns(
        self, 
        query_text: str, 
        embedding_model,  # SentenceTransformer hoặc OpenAI embedding
        top_k: int = 5,
        threshold: float = 0.7
    ) -> List[Dict]:
        """
        Tìm kiếm pattern lừa đảo tương tự bằng semantic search.
        """
        # Tạo embedding cho query text
        query_embedding = embedding_model.encode(query_text).tolist()
        
        # Truy vấn pgvector
        sql = text("""
            SELECT 
                id, pattern_name, description, keywords, risk_weight,
                1 - (vector_embedding <=> :embedding) as similarity
            FROM scam_patterns
            WHERE is_active = true
            AND 1 - (vector_embedding <=> :embedding) > :threshold
            ORDER BY vector_embedding <=> :embedding
            LIMIT :limit
        """)
        
        results = self.db.execute(sql, {
            "embedding": str(query_embedding),
            "threshold": threshold,
            "limit": top_k
        }).fetchall()
        
        return [{
            "id": str(r.id),
            "pattern_name": r.pattern_name,
            "description": r.description,
            "keywords": r.keywords,
            "risk_weight": float(r.risk_weight),
            "similarity": float(r.similarity)
        } for r in results]
    
    def add_pattern_embedding(
        self,
        pattern_id: str,
        description: str,
        embedding_model
    ):
        """Thêm embedding cho pattern mới"""
        embedding = embedding_model.encode(description).tolist()
        
        sql = text("""
            UPDATE scam_patterns 
            SET vector_embedding = :embedding 
            WHERE id = :pattern_id
        """)
        
        self.db.execute(sql, {
            "embedding": str(embedding),
            "pattern_id": pattern_id
        })
        self.db.commit()
    
    def search_similar_blacklist(
        self,
        query_text: str,
        embedding_model,
        top_k: int = 5,
        threshold: float = 0.8
    ) -> List[Dict]:
        """
        Tìm kiếm blacklist tương tự bằng semantic search.
        Hữu ích khi người dùng mô tả scam mà không có số tài khoản cụ thể.
        """
        query_embedding = embedding_model.encode(query_text).tolist()
        
        # Lưu ý: blacklist không có vector_embedding mặc định, 
        # có thể mở rộng thêm cột vector cho bảng blacklist nếu cần
        sql = text("""
            SELECT 
                id, entity_type, entity_value, source, risk_score, evidence,
                1 - (evidence_embedding <=> :embedding) as similarity
            FROM blacklist
            WHERE is_active = true
            AND evidence_embedding IS NOT NULL
            AND 1 - (evidence_embedding <=> :embedding) > :threshold
            ORDER BY evidence_embedding <=> :embedding
            LIMIT :limit
        """)
        
        results = self.db.execute(sql, {
            "embedding": str(query_embedding),
            "threshold": threshold,
            "limit": top_k
        }).fetchall()
        
        return [{
            "id": str(r.id),
            "entity_type": r.entity_type,
            "entity_value": r.entity_value,
            "source": r.source,
            "risk_score": float(r.risk_score),
            "similarity": float(r.similarity)
        } for r in results]