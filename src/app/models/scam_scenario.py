from sqlalchemy import Column, String, Text, ARRAY, JSON, Boolean  # <-- thêm Boolean
from sqlalchemy.dialects.postgresql import UUID
import uuid
from src.app.database import Base

class ScamScenario(Base):
    __tablename__ = "scam_scenarios"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    keywords = Column(ARRAY(String))
    vector_embedding = Column(JSON)
    is_active = Column(Boolean, default=True)