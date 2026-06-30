"""
🏥 Tapep AI FastAPI Backend v3.0
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
import google.generativeai as genai

from langchain_core.messages import HumanMessage, AIMessage
from agent.agent import agent
from agent.utils.vision import analyze_medical_image

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="🏥 Tapep AI API",
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
from models import (
    HealthProfile,
    HistoryEntry,
    ChatMessage,
    ChatResponse,
    HealthCheck,
    DrugInteractionRequest,
    DrugInteractionResponse,
    LabReportResponse
)


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
            "dialect":     "Preferred response dialect / اللهجة المفضلة للرد",
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
            pref_dialect = str(health_profile.get("dialect", "")).strip()
            if pref_dialect:
                profile_msg += f"\n\nCRITICAL LANGUAGE INSTRUCTION: You MUST write your response in the patient's preferred dialect/language: '{pref_dialect}'. If they requested a dialect like Egyptian Arabic, Gulf Arabic, or Levantine Arabic, speak naturally and authentically in that dialect. Do not use Modern Standard Arabic (Fusha) unless they chose Standard Arabic."
            messages.append(HumanMessage(content=profile_msg))
            messages.append(AIMessage(
                content="✅ Health profile and preferred dialect noted. I will personalise all my responses and speak in their preferred language/dialect."
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
    """🏠 Serve the main Tapep AI interface"""
    try:
        html_file = Path("templates/index.html")
        if html_file.exists():
            with open(html_file, "r", encoding="utf-8") as f:
                content = f.read()
            return HTMLResponse(content=content, status_code=200)
        return HTMLResponse(
            content="<h1>🏥 Tapep AI API is running</h1><p>Place template in templates/index.html</p>",
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
async def chat_with_tapep(message: ChatMessage):
    """💬 Standard (non-streaming) chat with memory + health profile support"""
    start_time = datetime.now()
    try:
        msgs = _build_messages(message.message, message.history, message.health_profile)
        response = agent.invoke({"messages": msgs})

        response_text = "I apologize, but I'm having trouble processing your request. Please try again."
        tools_used: List[str] = []

        if response and "messages" in response:
            raw_content  = response["messages"][-1].content
            # Gemini may return content as a list of parts — normalize to str
            if isinstance(raw_content, list):
                response_text = "".join(
                    part.get("text", "") if isinstance(part, dict) else str(part)
                    for part in raw_content
                )
            else:
                response_text = raw_content or response_text
            tools_used = _extract_tools_used(response["messages"])

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
async def stream_chat_with_tapep(message: ChatMessage):
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
                    raw_chunk = event["data"]["chunk"].content
                    # Gemini sometimes returns a list of content parts instead of a plain string
                    if isinstance(raw_chunk, list):
                        chunk = "".join(
                            part.get("text", "") if isinstance(part, dict) else str(part)
                            for part in raw_chunk
                        )
                    else:
                        chunk = raw_chunk or ""
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


def clean_json_response(text: str) -> str:
    """
    Cleans markdown code block wraps from LLM JSON outputs.
    """
    text = text.strip()
    # Remove leading ```json or ``` if present
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


# ── Lab Scanner & Drug Checker Endpoints ─────────────────────────────────────

@app.post("/api/meds/check-interactions", response_model=DrugInteractionResponse)
async def check_drug_interactions(request: DrugInteractionRequest):
    """
    Check for potential interactions between a list of medications using Gemini.
    """
    meds = request.medications
    if len(meds) < 2:
        return DrugInteractionResponse(
            interactions=[],
            summary="الرجاء إدخال دواءين على الأقل للتحقق من وجود تعارض."
        )
    
    try:
        meds_str = ", ".join(meds)
        prompt = (
            "You are a clinical pharmacologist. Check for any drug-drug interactions between these medications:\n"
            f"{meds_str}\n\n"
            "Analyze every pair of medications in the list. Provide the severity (\"🔴 Major\", \"🟡 Moderate\", or \"🟢 Safe\"), "
            "a clinical explanation in Arabic, and recommendations or safer alternatives in Arabic.\n\n"
            "You MUST return your response as a valid JSON object matching the following structure:\n"
            "{\n"
            "  \"interactions\": [\n"
            "    {\n"
            "      \"drugs\": [\"Medication A\", \"Medication B\"],\n"
            "      \"severity\": \"🔴 Major\" or \"🟡 Moderate\" or \"🟢 Safe\",\n"
            "      \"description\": \"شرح التعارض الدوائي بالتفصيل بالعربية ولماذا يحدث وما هي آثاره الجانبية\",\n"
            "      \"recommendation\": \"النصيحة الطبية والبدائل الأكثر أماناً للمريض بالعربية\"\n"
            "    }\n"
            "  ],\n"
            "  \"summary\": \"ملخص أمان عام لجميع الأدوية المدرجة ونصائح وقائية عامة بالعربية\"\n"
            "}\n\n"
            "Strictly return ONLY the raw JSON object. Do not include markdown codeblocks or any additional commentary."
        )

        response_text = None
        last_err = None

        # Try Gemini models first
        for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                logger.info(f"🔄 [Tapep AI] Trying drug interaction check with model: {model_name}")
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                if response and response.text:
                    response_text = response.text
                    logger.info(f"✅ [Tapep AI] Drug check successful with {model_name}")
                    break
            except Exception as ex:
                logger.warning(f"⚠️ [Tapep AI] Model {model_name} failed: {ex}")
                last_err = ex
                continue

        # Fallback to Groq Llama 3.3 70B if Gemini fails and Groq API key is present
        if not response_text:
            groq_key = os.getenv("GROQ_API_KEY")
            if groq_key:
                try:
                    logger.info("🔄 [Tapep AI] Falling back to Groq llama-3.3-70b-versatile for drug check")
                    from langchain_groq import ChatGroq
                    from langchain_core.messages import SystemMessage, HumanMessage
                    groq_model = ChatGroq(
                        model="llama-3.3-70b-versatile",
                        groq_api_key=groq_key,
                        temperature=0.2,
                        model_kwargs={"response_format": {"type": "json_object"}}
                    )
                    res = groq_model.invoke([
                        SystemMessage(content="You are a clinical pharmacologist. Always respond in valid JSON format only."),
                        HumanMessage(content=prompt)
                    ])
                    if res and res.content:
                        response_text = res.content
                        logger.info("✅ [Tapep AI] Drug check successful with Groq llama-3.3-70b-versatile")
                except Exception as ex:
                    logger.error(f"❌ [Tapep AI] Groq drug check fallback failed: {ex}")
                    last_err = ex

        if not response_text:
            raise last_err if last_err else Exception("All LLM providers failed for drug interaction check.")

        cleaned = clean_json_response(response_text)
        data = json.loads(cleaned)
        return DrugInteractionResponse(**data)

    except Exception as e:
        logger.error(f"Drug interaction check error: {e}")
        status_code = 500
        detail_msg = f"Failed to check interactions: {str(e)}"
        err_str = str(e).lower()
        if "quota exceeded" in err_str or "429" in err_str or "resource exhausted" in err_str:
            status_code = 429
            detail_msg = "لقد تجاوزت الحصة اليومية المجانية لمفتاح Gemini API الخاص بك (Rate Limit / Quota Exceeded). يرجى المحاولة لاحقاً أو استخدام مفتاح مدفوع."
        raise HTTPException(status_code=status_code, detail=detail_msg)


@app.post("/api/lab-scanner/analyze", response_model=LabReportResponse)
async def analyze_lab_report(
    image: UploadFile = File(...),
    notes: str = Form(default=""),
):
    """
    Upload an image of a lab test and get a structured analysis of parameters.
    """
    mime = image.content_type or ""
    if not mime.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")
        
    try:
        from agent.utils.vision import analyze_lab_report_structured
        image_bytes = await image.read()
        
        result_json = analyze_lab_report_structured(
            image_bytes=image_bytes,
            mime_type=mime,
            notes=notes,
        )
        
        cleaned = clean_json_response(result_json)
        data = json.loads(cleaned)
        return LabReportResponse(**data)
        
    except Exception as e:
        logger.error(f"Lab report endpoint error: {e}")
        status_code = 500
        detail_msg = f"Failed to analyze lab report: {str(e)}"
        err_str = str(e).lower()
        if "quota exceeded" in err_str or "429" in err_str or "resource exhausted" in err_str:
            status_code = 429
            detail_msg = "لقد تجاوزت الحصة اليومية المجانية لمفتاح Gemini API الخاص بك (Rate Limit / Quota Exceeded). يرجى المحاولة لاحقاً أو استخدام مفتاح مدفوع."
        raise HTTPException(status_code=status_code, detail=detail_msg)


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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, log_level="warning")