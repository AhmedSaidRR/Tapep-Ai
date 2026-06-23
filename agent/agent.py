import os
import logging
from typing_extensions import Literal
from dotenv import load_dotenv

from langchain_core.messages import SystemMessage, ToolMessage
from langgraph.graph import StateGraph, START, END, MessagesState
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI # الـ LLM الاحتياطي لضمان التشغيل

from agent.utils.prompt import system_prompt
from agent.utils.tools import rag_tool, medical_web_search

load_dotenv()
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# الموديل الأساسي (Llama 3.3 على Groq)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
primary_llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=GROQ_API_KEY,
    temperature=0.3,
    max_tokens=1200,
)

# الموديل الاحتياطي (Gemini 2.5 Flash كـ Fallback سريع ومجاني)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
backup_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=GOOGLE_API_KEY,
    temperature=0.3,
)

# دمج الموديلين بمرونة عالية: سيعمل Gemini تلقائياً كدرع حماية عند توقف Groq أو نفاذ حد الاستهلاك (HTTP 429)
resilient_llm = primary_llm.with_fallbacks([backup_llm])

# ربط الـ Tools الطبية بالموديل المدمج
tools = [rag_tool, medical_web_search]
tools_by_name = {tool.name: tool for tool in tools}
llm_with_tools = resilient_llm.bind_tools(tools)


def llm_call(state: MessagesState):
    """🧠 يعالج الاستفسار الطبي ويحدد الـ Tool المناسبة للتشغيل"""
    logger.info("🧠 [MediBlaze] Calling LLM with feedback safeguards.")
    return {
        "messages": [
            llm_with_tools.invoke(
                [SystemMessage(content=system_prompt)] + state["messages"]
            )
        ]
    }


def tool_node(state: dict):
    """🔧 ينفذ الأدوات الطبية مع معالجة استثنائية كاملة للأخطاء"""
    result = []
    for tool_call in state["messages"][-1].tool_calls:
        try:
            tool = tools_by_name[tool_call["name"]]
            observation = tool.invoke(tool_call["args"])
            result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
        except Exception as e:
            logger.error(f"❌ [MediBlaze] Tool execution error: {str(e)}")
            result.append(ToolMessage(
                content="⚠️ حدث خطأ أثناء تشغيل قاعدة البيانات الطبية. سنعتمد على المعرفة السريرية المباشرة للموديل.", 
                tool_call_id=tool_call["id"]
            ))
    return {"messages": result}


def should_continue(state: MessagesState) -> Literal["Action", "END"]:
    """🔄 تحديد نقل الحالة: هل نحتاج لتشغيل أدوات أم نرسل الرد النهائي للمستخدم"""
    messages = state["messages"]
    last_message = messages[-1]
    if last_message.tool_calls:
        return "Action"
    return "END"


# 🏗️ بناء الـ LangGraph Workflow
agent_builder = StateGraph(MessagesState)
agent_builder.add_node("llm_call", llm_call)
agent_builder.add_node("environment", tool_node)
agent_builder.add_edge(START, "llm_call")
agent_builder.add_conditional_edges(
    "llm_call",
    should_continue,
    {
        "Action": "environment",
        "END": END,
    },
)
agent_builder.add_edge("environment", "llm_call")

# 🚀 تجميع الوكيل ليكون جاهزاً للتشغيل
agent = agent_builder.compile()