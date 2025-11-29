import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";

export interface Env {
  RESEARCH_WORKFLOW: Workflow;
  RESEARCH_CACHE: KVNamespace;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

type SearchResult = {
  title: string;
  url: string;
  extract?: string;
};

type Section = {
  title: string;
  focus: string;
};

interface UploadRequest {
  text: string;
  filename?: string;
}

interface ChatRequest {
  query: string;
  documentId: string;
}

// --- Prompts ---
const plannerPrompt = (query: string): string => {
  return `You are a research planner. Given the following research question, break it down into 3-5 distinct, comprehensive sections or chapters that would form a detailed report.

Research Question: ${query}

Respond with a JSON object in this exact format, ensuring the "focus" for each section is a concise summary of what that section should cover:
{
  "sections": [
    { "title": "Section Title 1", "focus": "Key aspects of Section 1" },
    { "title": "Section Title 2", "focus": "Detailed explanation of Section 2" }
  ]
}

Only return the JSON, no additional text or markdown formatting outside the JSON.`;
};

const searchQueriesPrompt = (sectionTitle: string, sectionFocus: string): string => {
  return `Given the following section title and its focus for a research report, generate 2-3 highly relevant search queries that would help find information for this specific section.

Section Title: ${sectionTitle}
Section Focus: ${sectionFocus}

Respond with a JSON object in this exact format:
{
  "queries": ["query 1", "query 2"]
}

Only return the JSON, no additional text or markdown formatting outside the JSON.`;
};

const writerPrompt = (sectionTitle: string, context: string): string => {
  return `You are a research writer. Your task is to write a detailed and well-structured markdown section for a research report.

Section Title: ${sectionTitle}

Provided Research Context:
${context}

Based *only* on the provided research context, write a comprehensive markdown section for the report.

- Start with a heading for the section (e.g., "## ${sectionTitle}").
- Include subheadings (###) where appropriate.
- Ensure the content is well-organized, informative, and directly addresses the section's topic using the provided context.
- Do NOT include any introductory or concluding remarks outside the section content itself.
- Do NOT include a "References" section here; that will be compiled separately.
- Do NOT wrap the markdown in a JSON object. Just return the raw markdown text.`;
};

// --- Helper Functions ---
function extractJson(text: string): any {
  try {
    // 1. Try parsing directly
    return JSON.parse(text);
  } catch (e) {
    // 2. Try extracting from markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // continue
      }
    }
    // 3. Try finding the first '{' and last '}'
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.substring(start, end + 1));
      } catch (e3) {
        throw new Error("Failed to extract JSON: " + text.substring(0, 100) + "...");
      }
    }
    throw new Error("No JSON found in response");
  }
}

// --- Workflow ---
export class ResearchWorkflow extends WorkflowEntrypoint<Env, { query: string; sessionId: string }> {
  async run(event: WorkflowEvent<{ query: string; sessionId: string }>, step: WorkflowStep) {
    const { query, sessionId } = event.payload;

    // Step 1: Plan Research
    const plan = await step.do("plan-research", async () => {
      console.log(`[Step 1] Planning research for: ${query}`);
      const response = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
        messages: [{ role: "user", content: plannerPrompt(query) }],
      });
      console.log("[Step 1] Raw response:", (response as any).response);
      return extractJson((response as any).response);
    });

    const sections = (plan as any).sections || [];
    console.log(`[Step 1] Generated ${sections.length} sections.`);

    // Step 2: Research & Write All Sections (Combined Step)
    // We process all sections in ONE workflow step but use Promise.all for parallelism.
    // Since we have ~5 sections and ~3 calls each, total subrequests ~15-20 (< 50 limit).
    const sectionResults = await step.do("research-all-sections", async () => {
      console.log(`[Step 2] Starting research for ${sections.length} sections...`);
      
      const results = await Promise.all(sections.map(async (section: Section) => {
          console.log(`[Step 2] Processing section: ${section.title}`);

          // 2a. Generate Search Queries
          const queriesResponse = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
            messages: [{ role: "user", content: searchQueriesPrompt(section.title, section.focus) }],
          });
          const queriesData = extractJson((queriesResponse as any).response);
          const queries = (queriesData as any).queries || [];

          // 2b. Fetch Sources (Wikipedia + ArXiv)
          const sources: SearchResult[] = [];
          // Limit queries to 2 per section to be safe
          const limitedQueries = queries.slice(0, 2);
          
          for (const q of limitedQueries) {
            // Wikipedia Search
            try {
              const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json`, {
                headers: { "User-Agent": "CloudflareResearchAssistant/1.0" }
              });
              const searchData = await searchRes.json() as any;
              if (searchData.query?.search?.length > 0) {
                 const title = searchData.query.search[0].title;
                 const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
                    headers: { "User-Agent": "CloudflareResearchAssistant/1.0" }
                 });
                 if (summaryRes.ok) {
                    const summaryData = await summaryRes.json() as any;
                    sources.push({ title: summaryData.title, extract: summaryData.extract, url: summaryData.content_urls?.desktop?.page || "" });
                 } else {
                    sources.push({ title: title, extract: searchData.query.search[0].snippet.replace(/<[^>]*>?/gm, ''), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` });
                 }
              }
            } catch (e) { console.error("Wiki Error", e); }
            
            // ArXiv Search (Only 1 call)
            try {
               const arxivRes = await fetch(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&start=0&max_results=1`);
               const arxivText = await arxivRes.text();
               const entryMatch = arxivText.match(/<entry>([\s\S]*?)<\/entry>/);
               if (entryMatch) {
                  const titleMatch = entryMatch[1].match(/<title>([\s\S]*?)<\/title>/);
                  const summaryMatch = entryMatch[1].match(/<summary>([\s\S]*?)<\/summary>/);
                  const idMatch = entryMatch[1].match(/<id>([\s\S]*?)<\/id>/);
                  if (titleMatch && summaryMatch && idMatch) {
                     sources.push({
                        title: titleMatch[1].trim(),
                        extract: summaryMatch[1].trim(),
                        url: idMatch[1].trim()
                     });
                  }
               }
            } catch (e) { console.error("ArXiv Error", e); }
          }

          // 2c. Write Section
          const context = sources.map(s => `Title: ${s.title}\nSummary: ${s.extract}`).join("\n\n");
          
          if (!context) return { title: section.title, content: "No sources found for this section.", sources: [] };

          const writeResponse = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
            messages: [{ role: "user", content: writerPrompt(section.title, context) }],
          });
          
          return {
            title: section.title,
            content: (writeResponse as any).response,
            sources: sources.map(s => ({ title: s.title, url: s.url }))
          };
      }));
      
      return results;
    });

    // Step 3: Compile Report
    await step.do("compile-report", async () => {
      console.log("[Step 3] Compiling final report");
      
      let fullContent = `# ${query}\n\n`;
      const allSources: {title: string, url: string}[] = [];
      
      for (const section of sectionResults) {
        fullContent += section.content + "\n\n";
        allSources.push(...(section.sources || []));
      }

      // Deduplicate sources
      const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());

      const result = {
        query,
        answer: fullContent,
        sources: uniqueSources
      };

      await this.env.RESEARCH_CACHE.put(sessionId, JSON.stringify(result));
    });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // PDF UPLOAD & EMBEDDING
    if (url.pathname === "/api/pdf/upload" && request.method === "POST") {
      try {
        const { text, filename } = await request.json() as UploadRequest;
        const documentId = crypto.randomUUID();

        // 1. Chunk text (simple chunking for now)
        const chunks = text.match(/[\s\S]{1,1500}/g) || []; // ~500 words chunks

        // 2. Generate embeddings for chunks
        const vectors = await Promise.all(chunks.map(async (chunk, i) => {
          const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [chunk] }) as any;
          return {
            id: `${documentId}_${i}`,
            values: embedding.data[0],
            metadata: {
              documentId,
              filename: filename || "unknown.pdf",
              text: chunk
            }
          };
        }));

        // 3. Store in Vectorize
        await env.VECTORIZE.upsert(vectors);

        return Response.json({ documentId, filename, chunks: chunks.length }, { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
      }
    }

    // CHAT WITH PDF
    if (url.pathname === "/api/pdf/chat" && request.method === "POST") {
      try {
        const { query, documentId } = await request.json() as ChatRequest;
        console.log(`[PDF Chat] Query: "${query}", DocumentID: ${documentId}`);

        // 1. Embed Query
        const queryEmbedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] }) as any;

        // 2. Search Vector Index
        // Increased topK to 10 to get more context for summaries/broad questions
        const searchResults = await env.VECTORIZE.query(queryEmbedding.data[0], {
          topK: 10,
          returnMetadata: true
        });
        
        // Filter manually to ensure strict document isolation
        const relevantMatches = searchResults.matches.filter(m => m.metadata?.documentId === documentId);
        console.log(`[PDF Chat] Found ${relevantMatches.length} relevant matches (from top 10).`);

        // 3. Prepare Context
        const context = relevantMatches
          .map(m => m.metadata?.text)
          .join("\n---\n");

        if (!context) {
           console.log("[PDF Chat] No context found.");
           return Response.json({ answer: "I couldn't find any specific information in the document about that. Could you rephrase or ask something else?" }, { headers: corsHeaders });
        }

        // 4. Generate Answer
        // Improved System Prompt for better formatting and natural conversation
        const prompt = `You are an intelligent research assistant helping a user analyze a PDF document.

Document Context:
${context}

User Question: "${query}"

Instructions:
1.  **Answer based ONLY on the provided context.** Do not hallucinate facts not present in the text.
2.  **Be Conversational:** If the user asks for a summary or "what is this about?", provide a coherent, high-level overview using the available snippets.
3.  **Format Beautifully:**
    *   Use **bold** for key terms.
    *   Use *bullet points* or numbered lists for tasks, items, or steps.
    *   Use clear headers (###) if the answer is long.
4.  **Honesty:** If the context is missing the specific answer, say "The provided document context doesn't seem to mention that directly," but try to give related info if available.

Answer:`;

        const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 800 // Increased for longer summaries
        });

        const answer = (response as any).response;
        console.log(`[PDF Chat] Answer generated: ${answer.substring(0, 50)}...`);

        return Response.json({ 
          answer: answer,
          sources: relevantMatches.map(m => m.metadata?.filename)
        }, { headers: corsHeaders });

      } catch (e) {
        console.error("[PDF Chat Error]", e);
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
      }
    }

    // RESEARCH ENDPOINTS
    if (url.pathname === "/api/research" && request.method === "POST") {
      const body = await request.json() as { query: string };
      const sessionId = crypto.randomUUID();
      
      try {
        const workflow = env.RESEARCH_WORKFLOW as any;
        await workflow.create({
          id: sessionId,
          params: { query: body.query, sessionId }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
      }

      return Response.json({ sessionId }, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/status/") && request.method === "GET") {
      const sessionId = url.pathname.split("/api/status/")[1];
      const result = await env.RESEARCH_CACHE.get(sessionId, "json");
      
      if (result) {
        return Response.json(result, { headers: corsHeaders });
      }
      return new Response("Not ready", { status: 202, headers: corsHeaders });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
