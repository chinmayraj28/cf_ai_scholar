# AI Research Assistant & PDF Chat

A powerful AI-powered research assistant and document analysis tool built on the Cloudflare Developer Platform. This application demonstrates the power of **Cloudflare Workflows** for long-running agentic tasks and **Cloudflare Vectorize** for RAG (Retrieval-Augmented Generation) applications.

## ✨ Features

### 1. Deep Research Agent
An autonomous agent that performs comprehensive research on any topic.
- **Planning:** Breaks down a user query into distinct chapters/sections.
- **Researching:** Generates targeted search queries for each section, fetching real-time data from **Wikipedia** and **ArXiv**.
- **Writing:** Synthesizes information into a well-structured, markdown-formatted report with citations.
- **Export:** Download reports as PDF or DOCX.

### 2. Chat with PDF (RAG)
Interact with your documents naturally.
- **Upload:** Chunk, embed, and store PDF content using **Cloudflare Vectorize**.
- **Chat:** Ask questions about your document. The AI uses semantic search to retrieve relevant context and provide accurate answers.
- **Natural Conversation:** Supports summarization and follow-up questions.

---

## 🛠️ Tech Stack

**Backend (Cloudflare Stack):**
- **Cloudflare Workers:** Serverless compute for API and orchestration.
- **Cloudflare Workflows:** Manages the multi-step, long-running "Deep Research" process.
- **Cloudflare Vectorize:** Vector database for storing and retrieving PDF embeddings.
- **Cloudflare KV:** Key-Value storage for caching research reports.
- **Workers AI:** Runs LLMs (`@cf/meta/llama-3.2-3b-instruct`) and Embedding models (`@cf/baai/bge-base-en-v1.5`) at the edge.

**Frontend:**
- **Next.js 14:** React framework for a fast, modern UI.
- **Tailwind CSS:** Utility-first styling.
- **shadcn/ui:** Beautiful, accessible UI components.
- **Client Libraries:** `pdfjs-dist` (PDF parsing), `jspdf`/`html2canvas` (PDF generation), `docx` (Word doc generation).

---

## 🚀 Setup & Start

### Prerequisites
- Node.js (v18+)
- A Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd cf-ai-research-assistant
npm install
```

### 2. Cloudflare Auth
Login to your Cloudflare account:
```bash
npx wrangler login
```

### 3. Create Remote Resources
Since Vectorize does not support local simulation yet, we must create resources on Cloudflare.

**KV Namespaces:**
```bash
npx wrangler kv:namespace create RESEARCH_CACHE
npx wrangler kv:namespace create RESEARCH_CACHE --preview
```

**Vectorize Index:**
```bash
npx wrangler vectorize create pdf-index --dimensions=768 --metric=cosine
```

> **Important:** Update your `wrangler.toml` with the `id` (and `preview_id`) values returned by these commands!

### 4. Running Locally

**Backend (Worker):**
Because we use Vectorize, we must run the worker in **remote mode** to access the index.
```bash
# Terminal 1
npx wrangler dev --remote
```

**Frontend (Next.js):**
```bash
# Terminal 2
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

---

## 📂 Project Structure

- **`src/worker.ts`**: The brain of the backend. Handles API requests (`/api/research`, `/api/pdf/*`) and defines the `ResearchWorkflow` class.
- **`src/prompts.ts`**: System prompts for the Planner, Search Query Generator, and Writer agents.
- **`app/page.tsx`**: The main React frontend containing the Research and Chat interfaces.
- **`wrangler.toml`**: Configuration for bindings (KV, AI, Vectorize, Workflows).

## ⚠️ Important Notes
- **Vectorize Local Dev**: Currently, Cloudflare Vectorize bindings only work when connected to the remote Cloudflare network. This is why `wrangler dev --remote` is required.
- **AI Models**: This project uses `llama-3.2-3b-instruct` for text generation and `bge-base-en-v1.5` for embeddings. Ensure your Cloudflare account has access to Workers AI.
