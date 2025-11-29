# Development Prompts & Specifications

This document records the key prompt specifications used to architect and build this AI Research Assistant. These instructions drove the development of the Cloudflare Workers backend, the Agentic Workflow, and the Next.js frontend.

## 1. Initial Architecture Specification (MVP)

**Goal:** Create a minimal, functional AI Research Assistant using Cloudflare's serverless ecosystem.

**Requirements:**
*   **Stack:** Cloudflare Workers + Cloudflare Workflows.
*   **Endpoints:**
    *   `POST /api/research`: Trigger the research workflow.
    *   `GET /api/status/:sessionId`: Poll for results from KV storage.
*   **Workflow Logic (Linear):**
    1.  **Plan:** Use Llama 3 to generate sub-questions from the user's query.
    2.  **Fetch:** Retrieve Wikipedia summaries for each sub-question.
    3.  **Synthesize:** Aggregate findings into a short summary.
*   **Storage:** Use Cloudflare KV (`RESEARCH_CACHE`) to store results.
*   **Frontend:** A simple HTML/JS interface for testing inputs and polling status.

## 2. "Deep Research" Agent Upgrade

**Goal:** Evolve the simple summarizer into a comprehensive "Deep Research" agent capable of producing detailed reports.

**Requirements:**
*   **Enhanced Workflow:**
    *   **Planner Agent:** Break the topic into 3-5 distinct chapters/sections (JSON format).
    *   **Fetcher Agent:** For *each* section, generate specific search queries and fetch data from multiple sources (Wikipedia + ArXiv API).
    *   **Writer Agent:** Synthesize the fetched data into a detailed, Markdown-formatted section.
    *   **Compiler:** Combine all sections into a single final report.
*   **Source Verification:** Ensure every claim is backed by a fetched source (URL + Title).
*   **Concurrency:** Execute research for different sections in parallel using `Promise.all` within the Workflow step to speed up execution.

## 3. UI/UX Overhaul (Next.js + shadcn/ui)

**Goal:** Replace the basic HTML frontend with a professional, modern web application.

**Requirements:**
*   **Framework:** Next.js (App Router) + Tailwind CSS.
*   **Component Library:** shadcn/ui for a polished look (Cards, Buttons, Inputs).
*   **Visual Style:**
    *   Clean, "A4 Paper" layout for the final report to mimic a real academic document.
    *   Professional typography (Serif fonts for headers).
*   **Features:**
    *   **Export:** Ability to download the generated report as both **PDF** (using `html2canvas`/`jspdf`) and **DOCX**.
    *   **Real-time Feedback:** Polling mechanism with status updates (e.g., "Researching...", "Compiling...").

## 4. RAG Feature: "Chat with PDF"

**Goal:** Implement a Retrieval-Augmented Generation (RAG) system to allow users to upload and talk to their own documents.

**Requirements:**
*   **Infrastructure:**
    *   **Vector Database:** Cloudflare Vectorize (`pdf-index`).
    *   **Embeddings:** `@cf/baai/bge-base-en-v1.5`.
    *   **LLM:** `@cf/meta/llama-3.2-3b-instruct`.
*   **Backend Flow:**
    *   `POST /api/pdf/upload`: Receive PDF text, chunk it (approx. 500 words), generate embeddings, and upsert vectors with metadata (`documentId`, `text`).
    *   `POST /api/pdf/chat`: Embed user question → Query Vectorize (top-k) → Inject retrieved context into Llama prompt → Return answer.
*   **Frontend:**
    *   Tabbed interface to switch between "Deep Research" and "Chat with PDF".
    *   Client-side PDF parsing using `pdfjs-dist` to extract text before uploading (reduces server load).
    *   Chat interface with markdown rendering for AI responses.
