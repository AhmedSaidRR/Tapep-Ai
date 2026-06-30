import os
import logging
from functools import lru_cache
from dotenv import load_dotenv

from langchain_core.tools import tool
from langchain_community.utilities import DuckDuckGoSearchAPIWrapper
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_pinecone import PineconeVectorStore, PineconeEmbeddings
from langchain_core.tools import create_retriever_tool

# Load environment variables
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - [Tapep AI] %(message)s",
)
logger = logging.getLogger(__name__)

# ── Constants — MUST match ingest.py exactly ──────────────────────────────────
INDEX_NAME = "mediblaze-index"
EMBEDDING_MODEL = "multilingual-e5-large"

# ── DuckDuckGo wrapper ────────────────────────────────────────────────────────
_duckduckgo_wrapper = DuckDuckGoSearchAPIWrapper(max_results=5)
_duckduckgo_search = DuckDuckGoSearchResults(api_wrapper=_duckduckgo_wrapper)

# Trusted medical sources for the web-search query filter
TRUSTED_MEDICAL_SITES = (
    "site:who.int OR site:mayoclinic.org OR site:webmd.com OR "
    "site:healthline.com OR site:medlineplus.gov OR site:cdc.gov OR "
    "site:nih.gov OR site:pubmed.ncbi.nlm.nih.gov OR site:nhs.uk"
)


# ── Cached vectorstore initialiser ────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_vectorstore() -> PineconeVectorStore:
    """
    Lazy-initialise and cache the Pinecone vectorstore.
    Subsequent calls return the same instance, avoiding repeated network round-trips.
    """
    logger.info("🔗 [Tapep AI] Initialising Pinecone vectorstore (cached)…")
    embeddings = PineconeEmbeddings(model=EMBEDDING_MODEL)
    vectorstore = PineconeVectorStore(
        index_name=INDEX_NAME,
        embedding=embeddings,
        pinecone_api_key=PINECONE_API_KEY,
    )
    logger.info("✅ [Tapep AI] Pinecone vectorstore ready.")
    return vectorstore


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
        logger.info(f"📖 [Tapep AI] RAG search: {query}")
        vectorstore = _get_vectorstore()

        # Retrieve top-10 most relevant chunks for richer context
        retriever = vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 10},
        )

        _rag_instance = create_retriever_tool(
            retriever,
            "search_health_knowledge_base",
            (
                "🏥 Searches the Tapep AI medical knowledge base for comprehensive "
                "information about diseases, treatments, medications, symptoms, prevention, "
                "diagnosis, lifestyle health, and wellness."
            ),
        )

        result = _rag_instance.invoke(query)

        if not result or len(str(result).strip()) < 20:
            logger.warning("⚠️ [Tapep AI] RAG returned no useful results.")
            return (
                "📚 No specific information found in the health knowledge base for this query. "
                "Consider using the web search tool to find current information."
            )

        logger.info("✅ [Tapep AI] RAG search completed successfully.")
        return f"**📚 From Tapep AI Health Knowledge Base:**\n\n{result}"

    except Exception as e:
        logger.error(f"❌ [Tapep AI] RAG error: {str(e)}")
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
        logger.info(f"🔍 [Tapep AI] Web search: {query}")

        # Restrict search to trusted medical domains
        medical_query = f"{query} {TRUSTED_MEDICAL_SITES}"
        results = _duckduckgo_search.invoke(medical_query)

        if not results or len(str(results).strip()) < 20:
            logger.warning("⚠️ [Tapep AI] Web search returned no relevant results.")
            return (
                "🔍 No relevant medical information found online for this query. "
                "Please consult a healthcare professional for the most accurate guidance."
            )

        logger.info("✅ [Tapep AI] Web search completed successfully.")
        return (
            "🔍 **Searching the web for latest medical information…**\n\n"
            f"**🌐 Latest Health Information from Trusted Medical Sources:**\n\n{results}"
        )

    except Exception as e:
        logger.error(f"❌ [Tapep AI] Web search error: {str(e)}")
        return (
            "⚠️ An error occurred while searching for health information online. "
            "Please try again or consult a healthcare professional."
        )
