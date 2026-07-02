"""
🔧 Tapep AI — Agent Tools
RAG retriever (Pinecone) + Medical web search (DuckDuckGo).
"""

import os
import logging
from functools import lru_cache
from dotenv import load_dotenv

from langchain_core.tools import tool, create_retriever_tool
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_pinecone import PineconeVectorStore, PineconeEmbeddings

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - [Tapep AI] %(message)s",
)
logger = logging.getLogger(__name__)

# ── Constants — MUST match ingest.py exactly ──────────────────────────────────
INDEX_NAME      = "mediblaze-index"
EMBEDDING_MODEL = "multilingual-e5-large"
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Trusted medical sources filter for DuckDuckGo
TRUSTED_MEDICAL_SITES = (
    "site:who.int OR site:mayoclinic.org OR site:webmd.com OR "
    "site:healthline.com OR site:medlineplus.gov OR site:cdc.gov OR "
    "site:nih.gov OR site:pubmed.ncbi.nlm.nih.gov OR site:nhs.uk"
)


# ── Cached vectorstore & retriever initialisation ─────────────────────────────

@lru_cache(maxsize=1)
def _get_vectorstore() -> PineconeVectorStore:
    """
    Lazy-initialise and cache the Pinecone vectorstore.
    Called at most once per process lifetime.
    """
    logger.info("🔗 Initialising Pinecone vectorstore (first call, will be cached)…")
    embeddings   = PineconeEmbeddings(model=EMBEDDING_MODEL)
    vectorstore  = PineconeVectorStore(
        index_name=INDEX_NAME,
        embedding=embeddings,
        pinecone_api_key=PINECONE_API_KEY,
    )
    logger.info("✅ Pinecone vectorstore ready.")
    return vectorstore


@lru_cache(maxsize=1)
def _get_rag_retriever_tool():
    """
    Build and cache the RAG retriever tool.
    Creating the retriever tool is cheap but we cache it anyway to avoid
    repeated object creation on every agent call.
    """
    vectorstore = _get_vectorstore()
    retriever   = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 10},
    )
    return create_retriever_tool(
        retriever,
        "search_health_knowledge_base",
        (
            "🏥 Searches the Tapep AI medical knowledge base for comprehensive "
            "information about diseases, treatments, medications, symptoms, prevention, "
            "diagnosis, lifestyle health, and wellness."
        ),
    )


# ── DuckDuckGo wrapper (module-level, created once) ───────────────────────────
_duckduckgo_wrapper = DuckDuckGoSearchAPIWrapper(max_results=5)
_duckduckgo_search  = DuckDuckGoSearchResults(api_wrapper=_duckduckgo_wrapper)


# ── Tools ─────────────────────────────────────────────────────────────────────

@tool
def rag_tool(query: str) -> str:
    """
    📚 Retrieve relevant health information from the Tapep AI knowledge base.
    This knowledge base contains comprehensive medical documents covering diseases,
    treatments, symptoms, medications, procedures, and wellness topics.
    Always call this tool FIRST before considering a web search.
    """
    try:
        logger.info(f"📖 RAG search: {query[:80]}…")
        retriever_tool = _get_rag_retriever_tool()
        result = retriever_tool.invoke(query)

        if not result or len(str(result).strip()) < 20:
            logger.warning("⚠️ RAG returned no useful results.")
            return (
                "📚 No specific information found in the health knowledge base for this query. "
                "Consider using the web search tool to find current information."
            )

        logger.info("✅ RAG search completed successfully.")
        return f"**📚 From Tapep AI Health Knowledge Base:**\n\n{result}"

    except Exception as e:
        logger.error(f"❌ RAG error: {e}")
        return (
            "⚠️ An error occurred while searching the health knowledge base. "
            "Please try again or rephrase your question."
        )


@tool
def medical_web_search(query: str) -> str:
    """
    🔍 Search the web for comprehensive medical, health, and wellness information.
    Use this tool ONLY when the RAG knowledge base does not have sufficient information.
    Best for: recent medical developments, current guidelines, new drug approvals,
    niche wellness topics, mental health strategies, nutritional guidance.
    """
    try:
        logger.info(f"🔍 Web search: {query[:80]}…")
        medical_query = f"{query} {TRUSTED_MEDICAL_SITES}"
        results = _duckduckgo_search.invoke(medical_query)

        if not results or len(str(results).strip()) < 20:
            logger.warning("⚠️ Web search returned no relevant results.")
            return (
                "🔍 No relevant medical information found online for this query. "
                "Please consult a healthcare professional for the most accurate guidance."
            )

        logger.info("✅ Web search completed successfully.")
        return (
            "🔍 **Searching the web for latest medical information…**\n\n"
            f"**🌐 Latest Health Information from Trusted Medical Sources:**\n\n{results}"
        )

    except Exception as e:
        logger.error(f"❌ Web search error: {e}")
        return (
            "⚠️ An error occurred while searching for health information online. "
            "Please try again or consult a healthcare professional."
        )
