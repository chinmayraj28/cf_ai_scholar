# AI Research Assistant & PDF Chat

A comprehensive AI-powered research assistant and document analysis platform built on the Cloudflare Developer Platform. This application leverages Cloudflare Workflows for autonomous multi-step research tasks and Cloudflare Vectorize for Retrieval-Augmented Generation (RAG) applications.

## Features

### 1. Deep Research Agent
An autonomous agent designed to perform comprehensive research on user-defined topics.
- **Planning:** Deconstructs research queries into distinct, logical chapters.
- **Researching:** Generates targeted search queries and retrieves real-time data from verified sources such as Wikipedia and ArXiv.
- **Writing:** Synthesizes findings into well-structured, Markdown-formatted reports complete with citations.
- **Export Options:** Supports downloading reports in PDF and DOCX formats.

### 2. Document Analysis (RAG)
Enables natural language interaction with uploaded documents.
- **Processing:** Automatically chunks, embeds, and stores PDF content using Cloudflare Vectorize.
- **Semantic Search:** Utilizes vector embeddings to retrieve contextually relevant information in response to user queries.
- **Interactive Chat:** Supports summarization, specific fact-checking, and follow-up questions through a conversational interface.

---

## Technology Stack

### Backend (Cloudflare Ecosystem)
- **Cloudflare Workers:** Serverless compute environment for API handling and orchestration.
- **Cloudflare Workflows:** Durable execution engine for managing long-running, multi-step research processes.
- **Cloudflare Vectorize:** Vector database for storing and querying high-dimensional document embeddings.
- **Cloudflare KV:** Key-Value storage for persisting research sessions and generated reports.
- **Workers AI:** Edge-based inference platform running `llama-3.2-3b-instruct` (LLM) and `bge-base-en-v1.5` (Embeddings).

### Frontend
- **Next.js 14:** React framework optimized for performance and developer experience.
- **Tailwind CSS:** Utility-first CSS framework for responsive design.
- **shadcn/ui:** Component library for accessible and consistent user interface elements.
- **Client-Side Processing:** Utilizes `pdfjs-dist` for text extraction, `jspdf` for PDF generation, and `docx` for document creation.

---

## Setup and Installation

### Prerequisites
- Node.js (v18 or higher)
- Cloudflare Account
- Wrangler CLI (`npm install -g wrangler`)

### 1. Repository Setup
Clone the repository and install dependencies:
```bash
git clone <repository-url>
cd cf-ai-research-assistant
npm install
```

### 2. Authentication
Authenticate with your Cloudflare account:
```bash
npx wrangler login
```

### 3. Resource Provisioning
Cloudflare Vectorize requires remote resources for operation. Run the following commands to create the necessary infrastructure:

**KV Namespaces:**
```bash
npx wrangler kv:namespace create RESEARCH_CACHE
npx wrangler kv:namespace create RESEARCH_CACHE --preview
```

**Vectorize Index:**
```bash
npx wrangler vectorize create pdf-index --dimensions=768 --metric=cosine
```

**Configuration:**
Update `wrangler.toml` with the `id` and `preview_id` values returned by the commands above.

### 4. Development Environment

**Backend (Worker):**
Start the worker in remote mode to ensure connectivity with the Vectorize index:
```bash
npx wrangler dev --remote
```

**Frontend (Next.js):**
In a separate terminal, start the frontend development server:
```bash
npm run dev
```

Access the application at [http://localhost:3000](http://localhost:3000).

---

## Project Structure

- **`src/worker.ts`**: Core backend logic handling API endpoints and the `ResearchWorkflow` class.
- **`src/prompts.ts`**: System prompts defining the behavior of the Planner, Researcher, and Writer agents.
- **`app/page.tsx`**: Main React component for the Research and Chat interfaces.
- **`wrangler.toml`**: Configuration file for Cloudflare bindings (KV, AI, Vectorize, Workflows).

## Technical Notes
- **Vectorize Development:** Local simulation for Vectorize is not currently supported. The `wrangler dev --remote` flag is mandatory for development.
- **AI Model Access:** Ensure your Cloudflare account is enabled for Workers AI usage.
