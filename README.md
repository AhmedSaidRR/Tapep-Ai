# 🏥 Tapep AI - Advanced Medical Assistant

Tapep AI is an intelligent AI-powered medical assistant that provides comprehensive health information through a modern web interface. It combines medical knowledge base retrieval (RAG) with real-time web search to deliver accurate, up-to-date health guidance.

## ✨ Features

### 🧠 AI-Powered Health Assistant
- Medical knowledge base with RAG (Retrieval Augmented Generation) via Pinecone
- Real-time web search for latest medical information (DuckDuckGo, restricted to trusted medical sites)
- Smart tool selection — uses RAG first, web search when needed
- Comprehensive health domain coverage

### 💻 Modern Web Interface
- Real-time streaming responses with markdown rendering
- Tool usage indicators ("Thinking...", "Searching web...")
- Responsive UI with health-themed styling

### 🔧 Technical Stack
- FastAPI backend with async streaming (Server-Sent Events)
- LangGraph agent workflow with 4-tier LLM fallback
- Google Gemini AI (`gemini-2.0-flash` → `gemini-2.5-flash` → Groq Llama 3.3 70B → Groq Llama 3.1 8B)
- Pinecone vector database for RAG

## 📁 Project Structure

```
Tabeeb-AI/
├── agent/
│   ├── __init__.py
│   ├── agent.py            # LangGraph agent (LLM + tool routing)
│   └── utils/
│       ├── __init__.py
│       ├── prompt.py       # System prompt
│       ├── tools.py        # rag_tool + medical_web_search
│       └── vision.py       # Medical image & lab report analysis
├── main.py                  # FastAPI application entry point
├── ingest.py                # Script to upload PDFs from Data/ into Pinecone
├── models.py                # Pydantic request/response models
├── requirements.txt
├── .env.example
├── .gitignore
├── DEPLOYMENT.md            # Deployment guide
├── templates/
│   └── index.html           # Web chat interface
├── static/
│   ├── styles.css           # UI styling
│   ├── app.js               # Frontend logic
│   └── auth.js              # Supabase authentication
└── Data/                    # Put your own PDF(s) here (NOT committed to git)
```

> ⚠️ **About `Data/`**: This folder is intentionally excluded from git (see `.gitignore`).
> Medical reference PDFs are frequently copyrighted commercial publications, so they
> should never be pushed to a public repository. Keep your source PDF(s) local, or
> use openly-licensed sources (e.g. WHO / NIH public-domain materials) if you want to
> version-control your knowledge base.

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Google AI API Key ([Google AI Studio](https://aistudio.google.com/app/apikey))
- Pinecone API Key ([Pinecone Console](https://www.pinecone.io/))
- Groq API Key ([Groq Console](https://console.groq.com/))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ahmedsaalmann/Tabeeb-AI.git
cd Tabeeb-AI

# 2. Create & activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables
cp .env.example .env
# Edit .env and add your API keys

# 5. Add your medical PDF(s) into the Data/ folder
#    e.g. Data/Book.pdf

# 6. Upload the PDFs to Pinecone (run once, or again whenever Data/ changes)
python ingest.py

# 7. Run the application
python main.py
```

Then open:
- Web interface: http://localhost:8000
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## ⚠️ Keep index name & embedding model in sync

`ingest.py` and `agent/utils/tools.py` (`rag_tool`) **must** use the exact same:
- Pinecone index name → `mediblaze-index`
- Embedding model → `multilingual-e5-large`

If you ever change one, change the other — otherwise the chatbot will query an empty
or mismatched index and the RAG tool will return nothing useful.

## 🔧 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Web chat interface |
| `/chat` | POST | Standard chat (`{"message": "..."}`) |
| `/chat/stream` | POST | Streaming chat (Server-Sent Events) |
| `/chat/image/stream` | POST | Medical image analysis |
| `/api/meds/check-interactions` | POST | Drug interaction checker |
| `/api/lab-scanner/analyze` | POST | Lab report scanner |
| `/health` | GET | Health check |
| `/docs` | GET | Interactive API documentation |

## 🧠 How It Works

1. User sends a message to `/chat` or `/chat/stream`.
2. The LangGraph agent (`agent/agent.py`) decides whether to call:
   - `rag_tool` — searches the Pinecone knowledge base built from your PDFs, or
   - `medical_web_search` — searches the web (restricted to trusted medical sites) via DuckDuckGo.
3. Gemini combines the results into a structured, formatted medical answer.

## 🛡️ Disclaimer

Tapep AI provides educational health information only — it is **not** a substitute
for professional medical diagnosis or emergency care. Always consult a qualified
healthcare professional. In a medical emergency, contact emergency services immediately.

## 📝 License

This project is for educational and informational purposes. Ensure compliance with
medical information regulations and copyright law (especially regarding any source
documents placed in `Data/`) in your jurisdiction.
