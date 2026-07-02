"""
🧠 Tapep AI — LangGraph Agent
4-tier LLM fallback chain:
  Tier 1: Gemini 2.0 Flash  (1 500 req/day free)
  Tier 2: Gemini 2.5 Flash  (smarter, higher quota)
  Tier 3: Groq Llama 3.3 70B (separate free quota, very fast)
  Tier 4: Groq Llama 3.1 8B  (ultra-light emergency fallback)
"""

import os
import logging
from typing_extensions import Literal
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, START, END, MessagesState
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq

from agent.utils.prompt import system_prompt
from agent.utils.tools import rag_tool, medical_web_search

load_dotenv()

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")

# ── Tier 1: Gemini 2.0 Flash ─────────────────────────────────────────────────
primary_llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash",
    google_api_key=GOOGLE_API_KEY,
    temperature=0.3,
    max_tokens=2048,   # raised from 900 — medical answers need more space
    max_retries=1,
)

# ── Tier 2: Gemini 2.5 Flash ─────────────────────────────────────────────────
gemini_25_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    temperature=0.3,
    max_tokens=2048,
    max_retries=1,
)

# ── Tier 3: Groq Llama 3.3 70B ───────────────────────────────────────────────
groq_llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY,
    temperature=0.3,
    max_tokens=2048,
    max_retries=1,
    request_timeout=30,
)

# ── Tier 4: Groq Llama 3.1 8B ────────────────────────────────────────────────
groq_fast_llm = ChatGroq(
    model="llama-3.1-8b-instant",
    groq_api_key=GROQ_API_KEY,
    temperature=0.3,
    max_tokens=2048,
    max_retries=1,
    request_timeout=20,
)

# ── Fallback chain: Tier 1 → 2 → 3 → 4 ──────────────────────────────────────
resilient_llm = primary_llm.with_fallbacks(
    [gemini_25_llm, groq_llm, groq_fast_llm],
    exceptions_to_handle=(Exception,),
)

# ── Bind medical tools to the full chain ──────────────────────────────────────
tools          = [rag_tool, medical_web_search]
tools_by_name  = {t.name: t for t in tools}
llm_with_tools = resilient_llm.bind_tools(tools)


# ── Graph Nodes ───────────────────────────────────────────────────────────────

def llm_call(state: MessagesState) -> dict:
    """Call the LLM with the system prompt prepended to all messages."""
    logger.info("🧠 Calling LLM (4-tier fallback chain active).")
    return {
        "messages": [
            llm_with_tools.invoke(
                [SystemMessage(content=system_prompt)] + state["messages"]
            )
        ]
    }


def tool_node(state: dict) -> dict:
    """Execute tool calls requested by the LLM, with full error handling."""
    results = []
    for tc in state["messages"][-1].tool_calls:
        try:
            tool        = tools_by_name[tc["name"]]
            observation = tool.invoke(tc["args"])
            results.append(ToolMessage(content=str(observation), tool_call_id=tc["id"]))
        except Exception as e:
            logger.error(f"❌ Tool execution error for '{tc['name']}': {e}")
            results.append(ToolMessage(
                content=(
                    "⚠️ حدث خطأ أثناء تشغيل الأداة. "
                    "سنعتمد على المعرفة السريرية المباشرة للرد على سؤالك."
                ),
                tool_call_id=tc["id"],
            ))
    return {"messages": results}


def should_continue(state: MessagesState) -> Literal["Action", "END"]:
    """Route: use tools if LLM requested them, otherwise return final response."""
    last = state["messages"][-1]
    return "Action" if last.tool_calls else "END"


# ── Build LangGraph workflow ───────────────────────────────────────────────────
agent_builder = StateGraph(MessagesState)
agent_builder.add_node("llm_call",    llm_call)
agent_builder.add_node("environment", tool_node)
agent_builder.add_edge(START, "llm_call")
agent_builder.add_conditional_edges(
    "llm_call",
    should_continue,
    {"Action": "environment", "END": END},
)
agent_builder.add_edge("environment", "llm_call")

# 🚀 Compile the agent — ready to invoke
agent = agent_builder.compile()