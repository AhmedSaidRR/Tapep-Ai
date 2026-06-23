# 🏥 MediBlaze AI - Advanced Medical Assistant

MediBlaze is an intelligent AI-powered medical assistant that provides comprehensive health information through a modern web interface. It combines medical knowledge base retrieval (RAG) with real-time web search to deliver accurate, up-to-date health guidance.

## ✨ Features

### 🧠 AI-Powered Health Assistant
- Medical knowledge base with RAG (Retrieval Augmented Generation) via Pinecone
- Real-time web search for latest medical information (DuckDuckGo, restricted to trusted medical sites)
- Smart tool selection — uses RAG first, web search when needed
- Comprehensive health domain coverage

### 💻 Modern Web Interface
- Real-time streaming responses with markdown rendering
- Tool usage indicators ("Thinking...", "Searching web...")
- Responsive Bootstrap-based UI with health-themed styling

### 🔧 Technical Stack
- FastAPI backend with async streaming (Server-Sent Events)
- LangGraph agent workflow
- Google Gemini AI (`gemini-2.0-flash-lite`)
- Pinecone vector database for RAG

## 📁 Project Structure

```
MediBlaze/
├── agent/
│   ├── __init__.py
│   ├── agent.py            # LangGraph agent (LLM + tool routing)
│   └── utils/
│       ├── __init__.py
│       ├── prompt.py       # System prompt
│       └── tools.py        # rag_tool + medical_web_search
├── main.py                  # FastAPI application entry point
├── ingest.py                 # Script to upload PDFs from Data/ into Pinecone
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .dockerignore
├── DEPLOYMENT.md             # Docker / cloud deployment guide
├── tests/                    # Sample request bodies for manual curl testing
│   ├── test_message.json
│   ├── test_stream.json
│   ├── test_web_search.json
│   └── test_broader_health.json
├── templates/
│   └── index.html            # Web chat interface
├── static/
│   └── styles.css            # UI styling
└── Data/                      # Put your own PDF(s) here (NOT committed to git)
```

> ⚠️ **About `Data/`**: This folder is intentionally excluded from git (see `.gitignore`).
> Medical reference PDFs are frequently copyrighted commercial publications, so they
> should never be pushed to a public repository. Keep your source PDF(s) local, or
> use openly-licensed sources (e.g. WHO / NIH public-domain materials) if you want to
> version-control your knowledge base.

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Google AI API Key ([Google AI Studio](https://makersuite.google.com/app/apikey))
- Pinecone API Key ([Pinecone Console](https://www.pinecone.io/))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ahmedsaalmann/MediBlaze.git
cd MediBlaze

# 2. Create & activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment variables
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY and PINECONE_API_KEY

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

## 🐳 Docker Deployment

```bash
# Build and run with Docker
docker build -t mediblaze .
docker run -p 8000:8000 \
  -e GOOGLE_API_KEY=your_key \
  -e PINECONE_API_KEY=your_key \
  mediblaze
```

### Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env with your API keys
docker-compose up -d
docker-compose logs -f mediblaze
```

See `DEPLOYMENT.md` for AWS / GCP / Azure / Kubernetes deployment instructions.

## 🔧 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Web chat interface |
| `/chat` | POST | Standard chat (`{"message": "..."}`) |
| `/chat/stream` | POST | Streaming chat (Server-Sent Events) |
| `/health` | GET | Health check |
| `/docs` | GET | Interactive API documentation |

## 🧪 Testing

Sample request bodies are in `tests/`. Example:

```bash
curl http://localhost:8000/health

curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/json" \
  -d @tests/test_message.json

curl -N -X POST "http://localhost:8000/chat/stream" \
  -H "Content-Type: application/json" \
  -d @tests/test_stream.json
```

## 🧠 How It Works

1. User sends a message to `/chat` or `/chat/stream`.
2. The LangGraph agent (`agent/agent.py`) decides whether to call:
   - `rag_tool` — searches the Pinecone knowledge base built from your PDFs, or
   - `medical_web_search` — searches the web (restricted to trusted medical sites) via DuckDuckGo.
3. Gemini combines the results into a structured, formatted medical answer.

## 🛡️ Disclaimer

MediBlaze provides educational health information only — it is **not** a substitute
for professional medical diagnosis or emergency care. Always consult a qualified
healthcare professional. In a medical emergency, contact emergency services immediately.

## 📝 License

This project is for educational and informational purposes. Ensure compliance with
medical information regulations and copyright law (especially regarding any source
documents placed in `Data/`) in your jurisdiction.
