"""
Pydantic models for MediBlaze / Tapep AI API.
"""

from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional
from datetime import datetime


# ── Health Profile ─────────────────────────────────────────────────────────────

class HealthProfile(BaseModel):
    name:        Optional[str] = ""
    age:         Optional[str] = ""
    gender:      Optional[str] = ""
    weight:      Optional[str] = ""
    height:      Optional[str] = ""
    blood_type:  Optional[str] = ""
    conditions:  Optional[str] = ""
    medications: Optional[str] = ""
    allergies:   Optional[str] = ""
    dialect:     Optional[str] = ""


# ── Chat ───────────────────────────────────────────────────────────────────────

class HistoryEntry(BaseModel):
    role: str    # "user" or "assistant"
    content: str


class ChatMessage(BaseModel):
    message:        str
    session_id:     str = "default"
    health_profile: Optional[Dict[str, Any]] = None
    history:        Optional[List[Dict[str, str]]] = None  # [{role, content}, …]


class ChatResponse(BaseModel):
    response:         str
    response_html:    str
    timestamp:        datetime
    processing_time:  float
    tools_used:       List[str] = []


# ── System Health ──────────────────────────────────────────────────────────────

class HealthCheck(BaseModel):
    status:    str
    timestamp: datetime
    version:   str
    services:  Dict[str, str]


# ── Drug Interaction Checker ───────────────────────────────────────────────────

class DrugInteractionRequest(BaseModel):
    medications: List[str]

    @field_validator("medications")
    @classmethod
    def at_least_two_medications(cls, v: List[str]) -> List[str]:
        cleaned = [m.strip() for m in v if m.strip()]
        if len(cleaned) < 2:
            raise ValueError("يجب إدخال دواءين على الأقل للتحقق من وجود تعارض.")
        return cleaned


class DrugInteractionEntry(BaseModel):
    drugs:          List[str]
    severity:       str   # "🔴 Major" / "🟡 Moderate" / "🟢 Safe"
    description:    str   # Arabic explanation of the interaction mechanism
    recommendation: str   # Clinical advice / safer alternatives


class DrugInteractionResponse(BaseModel):
    interactions: List[DrugInteractionEntry]
    summary:      str   # Overall safety summary in Arabic


# ── Lab Report Scanner ────────────────────────────────────────────────────────

class LabIndicator(BaseModel):
    parameter:       str   # e.g. "Hemoglobin"
    value:           str   # e.g. "11.2"
    reference_range: str   # e.g. "12.0 - 16.0"
    unit:            str   # e.g. "g/dL"
    status:          str   # "Low" / "High" / "Normal"
    interpretation:  str   # Arabic description of what this indicator means


class LabReportResponse(BaseModel):
    indicators: List[LabIndicator]
    summary:    str   # Clinical overall summary & recommendation in Arabic
