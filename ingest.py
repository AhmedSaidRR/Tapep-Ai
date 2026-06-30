"""
📚 Tapep AI Ingestion Script
Loads PDF(s) from ./Data, splits them into optimised chunks, and uploads them to Pinecone.

IMPORTANT: INDEX_NAME and EMBEDDING_MODEL MUST match agent/utils/tools.py exactly,
otherwise the RAG retriever will query an empty / mismatched index.

Usage:
    1. Place your PDF file(s) inside the Data/ folder.
    2. python ingest.py
"""

import os
import time
from pathlib import Path
from dotenv import load_dotenv

from langchain_community.document_loaders import PyPDFLoader, DirectoryLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore, PineconeEmbeddings
from pinecone import Pinecone, ServerlessSpec

load_dotenv()

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
if not PINECONE_API_KEY:
    raise RuntimeError("❌ PINECONE_API_KEY is missing. Add it to your .env file.")

# ── Must match agent/utils/tools.py exactly ──────────────────────────────────
INDEX_NAME = "mediblaze-index"
EMBEDDING_MODEL = "multilingual-e5-large"
EMBEDDING_DIMENSION = 1024          # dimension for multilingual-e5-large

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "Data"


# ── Loaders ──────────────────────────────────────────────────────────────────

def load_pdfs(data_dir: Path):
    """Load all PDFs from *data_dir* and return a flat list of LangChain Documents."""
    if not data_dir.exists():
        raise FileNotFoundError(
            f"❌ Data directory not found: {data_dir}\n"
            f"   Create it and place your PDF(s) inside, e.g. {data_dir / 'Book.pdf'}"
        )
    loader = DirectoryLoader(str(data_dir), glob="**/*.pdf", loader_cls=PyPDFLoader)
    documents = loader.load()
    if not documents:
        raise FileNotFoundError(f"❌ No PDF files found in {data_dir}")
    return documents


# ── Splitter ─────────────────────────────────────────────────────────────────

def split_documents(documents):
    """
    Split documents into overlapping chunks optimised for medical text:
    - chunk_size=800  → enough context for a clinical paragraph
    - chunk_overlap=150 → preserves cross-chunk continuity for multi-sentence answers
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""],  # respect paragraph boundaries first
    )
    chunks = splitter.split_documents(documents)

    # Enrich each chunk with source metadata for traceability
    for chunk in chunks:
        src = chunk.metadata.get("source", "unknown")
        page = chunk.metadata.get("page", "?")
        chunk.metadata["source_label"] = f"{Path(src).name} — page {page}"

    return chunks


# ── Pinecone Index Management ─────────────────────────────────────────────────

def ensure_index_exists(pc: Pinecone):
    """Create the Pinecone index if it doesn't exist yet."""
    existing = [idx.name for idx in pc.list_indexes()]
    if INDEX_NAME in existing:
        print(f"✅ Index '{INDEX_NAME}' already exists — uploading into it.")
        return
    print(f"⏳ Creating index '{INDEX_NAME}' (dimension={EMBEDDING_DIMENSION}, metric=cosine)…")
    pc.create_index(
        name=INDEX_NAME,
        dimension=EMBEDDING_DIMENSION,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1"),
    )
    print("⏳ Waiting 60 s for the index to become ready…")
    time.sleep(60)
    print("✅ Index is ready.")


# ── Uploader ──────────────────────────────────────────────────────────────────

def upload_in_batches(chunks, embeddings, batch_size: int = 90):
    """Upload document chunks to Pinecone in batches with automatic retry."""
    total = len(chunks)
    uploaded = 0
    vectorstore = None

    for i in range(0, total, batch_size):
        batch = chunks[i: i + batch_size]
        batch_num = i // batch_size + 1
        print(f"⬆️  Batch {batch_num}: chunks {i + 1}–{i + len(batch)} of {total}…")
        try:
            if vectorstore is None:
                vectorstore = PineconeVectorStore.from_documents(
                    documents=batch,
                    index_name=INDEX_NAME,
                    embedding=embeddings,
                    pinecone_api_key=PINECONE_API_KEY,
                )
            else:
                vectorstore.add_documents(documents=batch)
            uploaded += len(batch)
            print(f"   ✅ Uploaded {uploaded}/{total}")
            time.sleep(2)
        except Exception as e:
            print(f"   ⚠️ Batch {batch_num} failed: {e} — retrying after 10 s…")
            time.sleep(10)
            try:
                if vectorstore is None:
                    vectorstore = PineconeVectorStore.from_documents(
                        documents=batch,
                        index_name=INDEX_NAME,
                        embedding=embeddings,
                        pinecone_api_key=PINECONE_API_KEY,
                    )
                else:
                    vectorstore.add_documents(documents=batch)
                uploaded += len(batch)
                print(f"   ✅ Retry succeeded. Total: {uploaded}/{total}")
            except Exception as retry_err:
                print(f"   ❌ Retry failed for batch {batch_num}: {retry_err} — skipping.")

    return uploaded


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"\n📄 Loading PDFs from: {DATA_DIR}")
    documents = load_pdfs(DATA_DIR)
    print(f"   Loaded {len(documents)} page(s)")

    chunks = split_documents(documents)
    print(f"✂️  Split into {len(chunks)} chunks (size=800, overlap=150)\n")

    embeddings = PineconeEmbeddings(model=EMBEDDING_MODEL)
    pc = Pinecone(api_key=PINECONE_API_KEY)
    ensure_index_exists(pc)

    uploaded = upload_in_batches(chunks, embeddings)
    print(f"\n🎉 Done! Uploaded {uploaded}/{len(chunks)} chunks to Pinecone index '{INDEX_NAME}'")


if __name__ == "__main__":
    main()