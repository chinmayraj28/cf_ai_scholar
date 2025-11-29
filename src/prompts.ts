export const plannerPrompt = (query: string): string => {
  return `You are a research planning AI. Your goal is to plan a comprehensive report on the user's question.

User Question: ${query}

Create a detailed outline with 3-5 distinct sections (chapters).
Each section should focus on a specific aspect of the topic.

Output Format (JSON ONLY):
{
  "sections": [
    { "title": "Introduction to [Topic]", "focus": "Overview and key definitions" },
    { "title": "History and Evolution", "focus": "Timeline and major milestones" },
    { "title": "Key Technologies / Concepts", "focus": "Deep dive into technical details" },
    { "title": "Applications and Impact", "focus": "Real-world use cases" },
    { "title": "Future Trends", "focus": "What lies ahead" }
  ]
}

CRITICAL: Return ONLY the raw JSON object. Do NOT use markdown code blocks.`;
};

export const searchQueriesPrompt = (sectionTitle: string, sectionFocus: string): string => {
  return `Generate 3 specific search queries to gather information for the following report section:
Section: ${sectionTitle}
Focus: ${sectionFocus}

Output Format (JSON ONLY):
{
  "queries": ["query 1", "query 2", "query 3"]
}

CRITICAL: Return ONLY the raw JSON object.`;
};

export const writerPrompt = (sectionTitle: string, context: string): string => {
  return `You are a technical writer. Write a comprehensive section for a research report.

Section Title: ${sectionTitle}

Context / Sources:
${context}

Guidelines:
- Output strictly Markdown text.
- Start with "## ${sectionTitle}".
- Use subheadings (###) for structure.
- Incorporate facts from the context.
- Length: 300-500 words.
- Do NOT wrap in JSON. Return the raw Markdown only.`;
};
