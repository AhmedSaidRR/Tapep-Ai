from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

class HealthProfile(BaseModel):
    name: Optional[str] = ""
    age: Optional[str] = ""
    gender: Optional[str] = ""
    weight: Optional[str] = ""
    height: Optional[str] = ""
    blood_type: Optional[str] = ""
    conditions: Optional[str] = ""
    medications: Optional[str] = ""
    allergies: Optional[str] = ""
    dialect: Optional[str] = ""

class HistoryEntry(BaseModel):
    role: str   # "user" or "assistant"
    content: str

class ChatMessage(BaseModel):
    message: str
    session_id: str = "default"
    health_profile: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, str]]] = None   # [{role, content}, ...]

class ChatResponse(BaseModel):
    response: str
    response_html: str
    timestamp: datetime
    processing_time: float
    tools_used: List[str] = []

class HealthCheck(BaseModel):
    status: str
    timestamp: datetime
    version: str
    services: Dict[str, str]

# ── Lab Scanner & Drug Checker Schemas ─────────────────────────────────────────

class DrugInteractionRequest(BaseModel):
    medications: List[str]

class DrugInteractionEntry(BaseModel):
    drugs: List[str]
    severity: str          # "🔴 Major" / "🟡 Moderate" / "🟢 Safe"
    description: str       # Arabic explanation of the interaction mechanism
    recommendation: str    # Clinical advice / safer alternatives

class DrugInteractionResponse(BaseModel):
    interactions: List[DrugInteractionEntry]
    summary: str           # Overall safety summary

class LabIndicator(BaseModel):
    parameter: str         # e.g., Hemoglobin, Glucose
    value: str             # e.g., 11.2, 140
    reference_range: str   # e.g., 12.0 - 16.0
    unit: str              # e.g., g/dL, mg/dL
    status: str            # "Low" / "High" / "Normal"
    interpretation: str    # Arabic description of the indicator's meaning

class LabReportResponse(BaseModel):
    indicators: List[LabIndicator]
    summary: str           # Clinical overall summary & recommendation
