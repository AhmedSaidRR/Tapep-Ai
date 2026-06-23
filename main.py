"""
🏥 MediBlaze FastAPI Backend v3.0
Advanced Medical AI Assistant — with Conversation Memory & Health Profile
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, AsyncGenerator, Optional
import logging
import os
from pathlib import Path
import markdown
from datetime import datetime
import json
import asyncio

from langchain_core.messages import HumanMessage, AIMessage
from agent.agent import agent
from agent.utils.vision import analyze_medical_image

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="🏥 MediBlaze API",
    description="Advanced Medical AI Assistant — RAG + Web Search + Vision + Memory",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static", check_dir=False), name="static")


# ── Pydantic Models ───────────────────────────────────────────────────────────

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


# ── In-memory conversation store ──────────────────────────────────────────────
conversation_history: Dict[str, List[Dict]] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_tools_used(response_messages: list) -> List[str]:
    tools = []
    for msg in response_messages:
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                if tc["name"] not in tools:
                    tools.append(tc["name"])
    return tools


def _store_history(session_id: str, user_msg: str, bot_response: str,
                   ts: datetime, tools: List[str]):
    if session_id not in conversation_history:
        conversation_history[session_id] = []
    conversation_history[session_id].append({
        "user_message": user_msg,
        "bot_response": bot_response,
        "timestamp": ts.isoformat(),
        "tools_used": tools,
    })
    if len(conversation_history[session_id]) > 20:
        conversation_history[session_id] = conversation_history[session_id][-20:]


def _build_messages(message_text: str,
                    history: Optional[List[Dict]] = None,
                    health_profile: Optional[Dict] = None) -> list:
    """
    Build a LangChain messages list that includes:
    1. Patient health profile context (if provided)
    2. Full conversation history for memory (last 8 exchanges)
    3. The current user message
    """
    messages = []

    # ── 1. Health Profile Context ─────────────────────────────────────────────
    if health_profile:
        field_labels = {
            "name":        "Name",
            "age":         "Age (years)",
            "gender":      "Gender",
            "weight":      "Weight (kg)",
            "height":      "Height (cm)",
            "blood_type":  "Blood type",
            "conditions":  "Chronic conditions / مشاكل مزمنة",
            "medications": "Current medications / أدوية حالية",
            "allergies":   "Known allergies / حساسية",
        }
        parts = []
        for key, label in field_labels.items():
            val = str(health_profile.get(key, "")).strip()
            if val:
                parts.append(f"• {label}: {val}")

        if parts:
            profile_msg = (
                "⚕️ PATIENT HEALTH PROFILE — always consider this when formulating your response:\n"
                + "\n".join(parts)
            )
            messages.append(HumanMessage(content=profile_msg))
            messages.append(AIMessage(
                content="✅ Health profile noted. I will personalise all my responses based on this patient information."
            ))

    # ── 2. Conversation History (Memory) ──────────────────────────────────────
    # Keep last 8 exchanges (= 16 messages) to stay within context limits
    for h in (history or [])[-16:]:
        role    = h.get("role", "")
        content = h.get("content", "")
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    # ── 3. Current Message ────────────────────────────────────────────────────
    messages.append(HumanMessage(content=message_text))
    return messages


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """🏠 Serve the main MediBlaze interface"""
    try:
        html_file = Path("templates/index.html")
        if html_file.exists():
            with open(html_file, "r", encoding="utf-8") as f:
                content = f.read()
            return HTMLResponse(content=content, status_code=200)
        return HTMLResponse(
            content="<h1>🏥 MediBlaze API is running</h1><p>Place template in templates/index.html</p>",
            status_code=200,
        )
    except Exception as e:
        logger.error(f"Error serving root: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health", response_model=HealthCheck)
async def health_check():
    """🔍 Health check endpoint"""
    agent_ok = bool(agent)
    env_ok   = bool(os.getenv("PINECONE_API_KEY") and os.getenv("GOOGLE_API_KEY") and os.getenv("GROQ_API_KEY"))
    return HealthCheck(
        status="🟢 Healthy",
        timestamp=datetime.now(),
        version="3.0.0",
        services={
            "agent":       "✅ Online" if agent_ok else "❌ Offline",
            "environment": "✅ Configured" if env_ok else "⚠️ Missing Keys",
            "api":         "✅ Online",
        },
    )


@app.post("/chat", response_model=ChatResponse)
async def chat_with_mediblaze(message: ChatMessage):
    """💬 Standard (non-streaming) chat with memory + health profile support"""
    start_time = datetime.now()
    try:
        msgs = _build_messages(message.message, message.history, message.health_profile)
        response = agent.invoke({"messages": msgs})

        response_text = "I apologize, but I'm having trouble processing your request. Please try again."
        tools_used: List[str] = []

        if response and "messages" in response:
            response_text = response["messages"][-1].content
            tools_used    = _extract_tools_used(response["messages"])

        response_html    = markdown.markdown(response_text, extensions=["extra", "codehilite", "toc"])
        processing_time  = (datetime.now() - start_time).total_seconds()
        _store_history(message.session_id, message.message, response_text, start_time, tools_used)

        return ChatResponse(
            response=response_text,
            response_html=response_html,
            timestamp=datetime.now(),
            processing_time=processing_time,
            tools_used=tools_used,
        )
    except Exception as e:
        processing_time = (datetime.now() - start_time).total_seconds()
        logger.error(f"Chat error: {e}")
        err = "❌ An error occurred while processing your query. Please try again."
        return ChatResponse(
            response=err,
            response_html=f"<p>{err}</p>",
            timestamp=datetime.now(),
            processing_time=processing_time,
            tools_used=[],
        )


@app.post("/chat/stream")
async def stream_chat_with_mediblaze(message: ChatMessage):
    """⚡ True token-by-token streaming with conversation memory + health profile"""

    async def generate() -> AsyncGenerator[str, None]:
        tools_used: List[str] = []
        full_content = ""
        try:
            yield f"data: {json.dumps({'type': 'start', 'status': 'Processing…'})}\n\n"

            msgs = _build_messages(message.message, message.history, message.health_profile)

            async for event in agent.astream_events({"messages": msgs}, version="v2"):
                etype = event["event"]

                if etype == "on_tool_start":
                    tool_name = event.get("name", "tool")
                    tools_used.append(tool_name)
                    if "web" in tool_name.lower():
                        display = "🔍 Searching the web for latest medical info…"
                    elif "rag" in tool_name.lower() or "knowledge" in tool_name.lower():
                        display = "📚 Searching medical knowledge base…"
                    else:
                        display = f"⏳ Using: {tool_name}…"
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool_name': tool_name, 'message': display})}\n\n"

                elif etype == "on_tool_end":
                    yield f"data: {json.dumps({'type': 'tool_end'})}\n\n"

                elif etype == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk:
                        full_content += chunk
                        yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"

            yield f"data: {json.dumps({'type': 'complete', 'tools_used': tools_used})}\n\n"
            _store_history(message.session_id, message.message, full_content, datetime.now(), tools_used)

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': f'⚠️ Error: {str(e)}'})}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'end'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "Content-Type":     "text/event-stream",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/chat/image/stream")
async def stream_chat_with_image(
    image: UploadFile = File(...),
    message: str = Form(default=""),
):
    """🖼️ Medical image analysis — Gemini Vision with auto language detection"""
    mime = image.content_type or ""
    if not mime.startswith("image/"):
        async def _err():
            yield f"data: {json.dumps({'type': 'error', 'content': '⚠️ Please upload an image file.'})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
        return StreamingResponse(_err(), media_type="text/event-stream")

    async def generate() -> AsyncGenerator[str, None]:
        try:
            image_bytes   = await image.read()
            user_question = message.strip()

            yield f"data: {json.dumps({'type': 'tool_start', 'tool_name': 'vision', 'message': '👁️ Analyzing your medical image…'})}\n\n"

            try:
                result = analyze_medical_image(
                    image_bytes=image_bytes,
                    mime_type=image.content_type,
                    user_question=user_question,
                )
            except Exception as ve:
                yield f"data: {json.dumps({'type': 'error', 'content': f'Image analysis failed: {ve}'})}\n\n"
                yield f"data: {json.dumps({'type': 'end'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'tool_end'})}\n\n"
            yield f"data: {json.dumps({'type': 'response_start'})}\n\n"

            for line in result.split("\n"):
                chunk = line + "\n"
                if chunk.strip():
                    yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                    await asyncio.sleep(0.03)

            yield f"data: {json.dumps({'type': 'complete', 'tools_used': ['vision_analysis']})}\n\n"

        except Exception as e:
            logger.error(f"Image endpoint error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'end'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "Content-Type":     "text/event-stream",
            "X-Accel-Buffering": "no",
        },
    )


# ── Conversation History Endpoints ────────────────────────────────────────────

@app.get("/conversation/{session_id}")
async def get_conversation(session_id: str = "default"):
    return JSONResponse(content={
        "history": conversation_history.get(session_id, []),
        "total":   len(conversation_history.get(session_id, [])),
    })

@app.delete("/conversation/{session_id}")
async def clear_conversation(session_id: str = "default"):
    conversation_history.pop(session_id, None)
    return JSONResponse(content={"message": f"Cleared session: {session_id}"})

@app.get("/sessions")
async def list_sessions():
    return JSONResponse(content={
        "sessions": {sid: len(msgs) for sid, msgs in conversation_history.items()}
    })


# ── Error Handlers ────────────────────────────────────────────────────────────

@app.exception_handler(404)
async def not_found(request, exc):
    return JSONResponse(status_code=404, content={"message": "Not found"})

@app.exception_handler(500)
async def server_error(request, exc):
    return JSONResponse(status_code=500, content={"message": "Internal server error"})


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="warning")