import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";

export interface Env {
  RESEARCH_WORKFLOW_V2: Workflow;
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

type SectionResult = {
  title: string;
  content: string;
  sources: Array<{ title: string; url: string }>;
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
  if (!text || typeof text !== 'string') {
    throw new Error("Invalid input: not a string");
  }
  
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to other methods
  }
  
  // Try extracting from markdown code blocks
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || 
                    text.match(/```\n([\s\S]*?)\n```/) ||
                    text.match(/```([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e2) {
      // Continue
    }
  }
  
  // Try finding JSON object boundaries
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const jsonStr = text.substring(start, end + 1);
      return JSON.parse(jsonStr);
    } catch (e3) {
      // Try to fix common issues
      try {
        // Remove trailing commas
        const fixed = text.substring(start, end + 1).replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(fixed);
      } catch (e4) {
        // Last resort: try to extract just the array/object content
        const arrayMatch = text.match(/\[([\s\S]*?)\]/);
        if (arrayMatch) {
          try {
            return { queries: JSON.parse(`[${arrayMatch[1]}]`) };
          } catch (e5) {
            // Give up
          }
        }
      }
    }
  }
  
  // Try to extract array of strings (for queries)
  const quotedStrings = text.match(/"([^"]+)"/g);
  if (quotedStrings && quotedStrings.length > 0) {
    return { queries: quotedStrings.map(s => s.replace(/"/g, '')) };
  }
  
  throw new Error("No JSON found in response: " + text.substring(0, 200));
}

// --- Workflow ---
export class ResearchWorkflowV2 extends WorkflowEntrypoint<Env, { query: string; sessionId: string }> {
  async run(event: WorkflowEvent<{ query: string; sessionId: string }>, step: WorkflowStep) {
    const { query, sessionId } = event.payload;

    try {
      // Step 1: Plan Research
      const plan = await step.do("plan-research", async () => {
        try {
          console.log(`[Step 1] Planning research for: ${query}`);
          const response = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
            messages: [{ role: "user", content: plannerPrompt(query) }],
            max_tokens: 600, // Increased slightly for better quality
          });
          console.log("[Step 1] Raw response:", (response as any).response);
          return extractJson((response as any).response);
        } catch (e) {
          console.error("[Step 1] Error in planning:", e);
          throw new Error(`Planning failed: ${String(e)}`);
        }
      });

    let sections = (plan as any).sections || [];
    console.log(`[Step 1] Generated ${sections.length} sections.`);
    console.log(`[Step 1] Section titles:`, sections.map((s: any) => s.title).join(", "));
    
    // Validate sections are relevant to the query
    if (sections.length === 0) {
      throw new Error("Planner generated no sections");
    }
    
    // Check if sections are relevant to the query - STRICT VALIDATION
    const queryLower = query.toLowerCase();
    
    // Better comparison detection: "X with or without Y" is a single topic, not a comparison
    const isTrueComparison = (queryLower.match(/\s+(vs|versus)\s+/) || 
                              (queryLower.includes(' or ') && !queryLower.includes(' with or without ') && !queryLower.includes(' with or ')));
    
    // Extract main topic(s) from query
    let mainTopics: string[] = [];
    if (isTrueComparison) {
      // Split on vs/versus/or (but not "with or without")
      const parts = query.split(/\s+(vs|versus|or)\s+/i).map(p => p.trim().replace(/\?/g, '').toLowerCase());
      mainTopics = parts.filter(p => p.length > 0);
    } else {
      // Single topic - extract main words (for "cereal with or without milk", extract "cereal" and "milk")
      const stopWords = ['what', 'is', 'are', 'the', 'a', 'an', 'of', 'for', 'about', 'how', 'why', 'when', 'where', 'with', 'without', 'or'];
      const words = queryLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
      mainTopics = words.slice(0, 3); // Take first 3 meaningful words
    }
    
    // Check if sections actually relate to the main topics
    let relevantCount = 0;
    for (const section of sections) {
      const titleLower = (section.title || '').toLowerCase();
      const focusLower = (section.focus || '').toLowerCase();
      const combined = titleLower + ' ' + focusLower;
      
      // Check if section mentions at least one main topic
      const mentionsMainTopic = mainTopics.some(topic => {
        const topicWords = topic.split(/\s+/);
        return topicWords.some(word => combined.includes(word) && word.length > 2);
      });
      
      if (mentionsMainTopic) relevantCount++;
    }
    
    // If less than 75% of sections are relevant, use fallback (stricter threshold)
    if (relevantCount < sections.length * 0.75 || relevantCount === 0) {
      console.warn(`[Step 1] Only ${relevantCount}/${sections.length} sections seem relevant to "${query}". Using fallback.`);
      
      if (isTrueComparison) {
        const parts = query.split(/\s+(vs|versus|or)\s+/i).map(p => p.trim().replace(/\?/g, ''));
        sections = [
          { title: `Introduction: ${parts[0]} vs ${parts[1]}`, focus: `Overview comparing ${parts[0]} and ${parts[1]}` },
          { title: `About ${parts[0]}`, focus: `Characteristics, features, and benefits of ${parts[0]}` },
          { title: `About ${parts[1]}`, focus: `Characteristics, features, and benefits of ${parts[1]}` },
          { title: `Comparison and Conclusion`, focus: `Which is better for different situations` }
        ];
      } else if (queryLower.includes(' with or without ')) {
        // Handle "X with or without Y" - treat as single topic with two options
        const topic = query.replace(/\s+with or without\s+.*\?/i, '').trim();
        const option = query.match(/with or without\s+([^?]+)/i)?.[1]?.trim() || '';
        sections = [
          { title: `Introduction: ${topic}`, focus: `Overview of ${topic} and the question of using it with or without ${option}` },
          { title: `${topic} with ${option}`, focus: `Benefits, characteristics, and uses of ${topic} with ${option}` },
          { title: `${topic} without ${option}`, focus: `Benefits, characteristics, and uses of ${topic} without ${option}` },
          { title: `Comparison and Conclusion`, focus: `Which option is better for different situations` }
        ];
      } else {
        const topic = query.replace(/\?/g, '').trim();
        sections = [
          { title: `Introduction to ${topic}`, focus: `Overview and key information about ${topic}` },
          { title: `Key Aspects of ${topic}`, focus: `Important details and characteristics` },
          { title: `Applications and Examples`, focus: `Real-world examples and use cases` },
          { title: `Conclusion`, focus: `Summary and final thoughts` }
        ];
      }
      console.log(`[Step 1] Using fallback sections:`, sections.map((s: any) => s.title).join(", "));
    }

    // Step 2: Research & Write Each Section (INDIVIDUAL STEPS)
    // Each section gets its own step.do() to reset subrequest limits and prevent retry accumulation
    const sectionResults: SectionResult[] = [];
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const stepName = `research-section-${i + 1}`;
      
      const result = await step.do(stepName, async () => {
          try {
            console.log(`[Step 2] Processing section ${i + 1}/${sections.length}: ${section.title}`);

            // 2a. Generate Search Query (simplified: use section title + focus for better results)
            // Skip AI query generation to save time - use section title directly
            const searchQuery = `${section.title} ${section.focus}`.substring(0, 100); // Limit length
            console.log(`[Step 2] Using search query for section ${i + 1}: "${searchQuery}"`);

            // 2b. Fetch Sources (Wikipedia only - ArXiv disabled to reduce subrequests)
            const sources: SearchResult[] = [];
            const queries = [searchQuery]; // Use the combined title+focus as query
            
            for (const q of queries) {
              try {
                const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json`, {
                  headers: { "User-Agent": "CloudflareResearchAssistant/1.0" }
                });
                if (!searchRes.ok) {
                  console.error(`[Step 2] Wikipedia search failed: ${searchRes.status}`);
                  continue;
                }
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
              } catch (e) { 
                console.error(`[Step 2] Wiki Error for query "${q}":`, e); 
              }
            }

            console.log(`[Step 2] Found ${sources.length} sources for section ${i + 1}`);

            // 2c. Write Section
            const context = sources.map(s => `Title: ${s.title}\nSummary: ${s.extract || 'No summary available'}`).join("\n\n");
            
            // If no sources, still generate content based on section title and focus
            const contextToUse = context.trim().length > 0 
              ? context 
              : `Section Focus: ${section.focus || section.title}\n\nNote: No external sources were found. Please write about the section title using general knowledge.`;

            let sectionContent: string;
            try {
              const writeResponse = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
                messages: [{ role: "user", content: writerPrompt(section.title, contextToUse) }],
                max_tokens: 800, // Limit tokens for faster response (300-500 words ≈ 400-700 tokens)
              });
              sectionContent = (writeResponse as any).response || `## ${section.title}\n\nContent generation failed.`;
              console.log(`[Step 2] Generated content for section ${i + 1} (${sectionContent.length} chars)`);
              
              // Validate that content is on-topic (basic check)
              const titleWords = section.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
              const contentLower = sectionContent.toLowerCase();
              const hasTitleWords = titleWords.some((word: string) => contentLower.includes(word));
              
              if (!hasTitleWords && titleWords.length > 0) {
                console.warn(`[Step 2] Generated content may be off-topic for section "${section.title}"`);
                // Regenerate with stronger prompt
                const strongerPrompt = writerPrompt(section.title, contextToUse) + `\n\nREMINDER: You MUST write about "${section.title}". Do not write about unrelated topics.`;
                const retryResponse = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
                  messages: [{ role: "user", content: strongerPrompt }],
                  max_tokens: 800,
                });
                sectionContent = (retryResponse as any).response || sectionContent;
              }
            } catch (e) {
              console.error(`[Step 2] Error writing section ${i + 1}:`, e);
              sectionContent = `## ${section.title}\n\nError generating content: ${String(e)}`;
            }
            
            return {
              title: section.title,
              content: sectionContent,
              sources: sources.map(s => ({ title: s.title, url: s.url }))
            };
          } catch (e) {
            console.error(`[Step 2] Fatal error in section ${i + 1} (${section.title}):`, e);
            return {
              title: section.title,
              content: `## ${section.title}\n\nAn error occurred while processing this section: ${String(e)}`,
              sources: []
            };
          }
      });
      
      sectionResults.push(result);
    }

    // Step 3: Compile Report
    await step.do("compile-report", async () => {
      try {
        console.log("[Step 3] Compiling final report");
        
        let fullContent = `# ${query}\n\n`;
        const allSources: {title: string, url: string}[] = [];
        
        for (const section of sectionResults) {
          if (section && section.content) {
            fullContent += section.content + "\n\n";
            if (section.sources && Array.isArray(section.sources)) {
              allSources.push(...section.sources);
            }
          }
        }

        const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());

        const result = {
          query,
          answer: fullContent,
          sources: uniqueSources
        };

        await this.env.RESEARCH_CACHE.put(sessionId, JSON.stringify(result));
        console.log("[Step 3] Report compiled and saved to KV");
      } catch (e) {
        console.error("[Step 3] Error compiling report:", e);
        // Write error result to KV so frontend knows it failed
        await this.env.RESEARCH_CACHE.put(sessionId, JSON.stringify({
          query,
          answer: `# ${query}\n\nError compiling report: ${String(e)}`,
          sources: []
        }));
        throw e; // Re-throw to mark workflow as failed
      }
    });
    } catch (e) {
      // Catch any unhandled errors in the workflow
      console.error("[Workflow] Fatal error:", e);
      try {
        await this.env.RESEARCH_CACHE.put(sessionId, JSON.stringify({
          query,
          answer: `# ${query}\n\nWorkflow failed with error: ${String(e)}`,
          sources: []
        }));
      } catch (kvError) {
        console.error("[Workflow] Failed to write error to KV:", kvError);
      }
      throw e; // Re-throw to mark workflow as failed
    }
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

        const chunks = text.match(/[\s\S]{1,1500}/g) || [];

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

        const queryEmbedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] }) as any;

        const searchResults = await env.VECTORIZE.query(queryEmbedding.data[0], {
          topK: 10,
          returnMetadata: true
        });
        
        const relevantMatches = searchResults.matches.filter(m => m.metadata?.documentId === documentId);
        console.log(`[PDF Chat] Found ${relevantMatches.length} relevant matches (from top 10).`);

        const context = relevantMatches
          .map(m => m.metadata?.text)
          .join("\n---\n");

        if (!context) {
           console.log("[PDF Chat] No context found.");
           return Response.json({ answer: "I couldn't find any specific information in the document about that. Could you rephrase or ask something else?" }, { headers: corsHeaders });
        }

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
          max_tokens: 800 
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
      
      console.log(`[API] Creating workflow for query: "${body.query}", sessionId: ${sessionId}`);
      
      try {
        const workflow = env.RESEARCH_WORKFLOW_V2 as any;
        
        // Create workflow
        await workflow.create({
          id: sessionId,
          params: { query: body.query, sessionId }
        });
        console.log(`[API] Workflow created successfully: ${sessionId}`);
        
        // Verify workflow exists (optional check)
        try {
          const workflowInstance = await workflow.get(sessionId);
          console.log(`[API] Workflow instance verified:`, workflowInstance ? "exists" : "not found");
        } catch (e) {
          console.log(`[API] Workflow get check:`, e);
        }
      } catch (error) {
        console.error(`[API] Workflow creation failed:`, error);
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
