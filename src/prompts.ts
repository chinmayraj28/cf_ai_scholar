export const plannerPrompt = (query: string): string => {
  // Extract key terms from query for emphasis
  const queryLower = query.toLowerCase();
  
  // "X with or without Y" is NOT a comparison - it's a single topic with two options
  const isWithOrWithout = queryLower.includes(' with or without ');
  const isTrueComparison = !isWithOrWithout && (queryLower.includes(' vs ') || queryLower.includes(' versus ') || 
                              (queryLower.includes(' or ') && !queryLower.includes(' with or ')));
  
  if (isWithOrWithout) {
    // Handle "X with or without Y" questions
    const topic = query.replace(/\s+with or without\s+.*\?/i, '').trim();
    const option = query.match(/with or without\s+([^?]+)/i)?.[1]?.trim() || '';
    return `Generate a research report outline for: ${query}

User Question: ${query}

This question is about ${topic} and whether to use it with or without ${option}. Create sections that compare both options.

Required sections (3-4):
1. Introduction to ${topic} and the question
2. ${topic} with ${option} - benefits, uses, characteristics
3. ${topic} without ${option} - benefits, uses, characteristics  
4. Comparison and conclusion - which is better for different situations

Output JSON format:
{
  "sections": [
    { "title": "Introduction: ${topic} with or without ${option}", "focus": "Overview of ${topic} and the question" },
    { "title": "${topic} with ${option}", "focus": "Benefits, characteristics, and uses of ${topic} with ${option}" },
    { "title": "${topic} without ${option}", "focus": "Benefits, characteristics, and uses of ${topic} without ${option}" },
    { "title": "Comparison and Conclusion", "focus": "Which option is better for different situations" }
  ]
}

CRITICAL: Every section MUST be about ${topic} and ${option}. Return ONLY JSON, no markdown.`;
  } else if (isTrueComparison) {
    // Handle comparison questions
    const parts = query.split(/ or | vs | versus /i).map(p => p.trim().replace(/\?/g, ''));
    return `Generate a research report outline for comparing: ${parts.join(' vs ')}.

User Question: ${query}

You MUST create sections that compare these two things. Every section title MUST mention at least one of these terms: ${parts.join(', ')}.

Required sections (3-4):
1. Introduction comparing ${parts[0]} and ${parts[1]}
2. Characteristics and features of ${parts[0]}
3. Characteristics and features of ${parts[1]}
4. Comparison and conclusion: which is better for different situations

Output JSON format:
{
  "sections": [
    { "title": "Introduction: ${parts[0]} vs ${parts[1]}", "focus": "Overview comparing both" },
    { "title": "About ${parts[0]}", "focus": "Features, characteristics, and benefits of ${parts[0]}" },
    { "title": "About ${parts[1]}", "focus": "Features, characteristics, and benefits of ${parts[1]}" },
    { "title": "Comparison and Recommendations", "focus": "Which is better for different situations and why" }
  ]
}

CRITICAL: Every section title MUST include words from the question. Return ONLY JSON, no markdown.`;
  } else {
    // Handle single topic questions
    return `Generate a research report outline that answers this question: ${query}

User Question: ${query}

CRITICAL: Every section you create MUST be about the topic in the question. Extract the main topic from "${query}" and make sure every section relates to that topic.

Create 3-4 sections that explore different aspects of the question.

Output JSON format:
{
  "sections": [
    { "title": "Introduction to [Topic from Question]", "focus": "Overview answering the question" },
    { "title": "Key Aspects of [Topic]", "focus": "Important details about the topic" },
    { "title": "Applications and Examples", "focus": "Real-world examples related to the question" },
    { "title": "Conclusion", "focus": "Summary answering the question" }
  ]
}

CRITICAL: Replace [Topic from Question] with the actual topic from "${query}". Every section title MUST relate to the question. Return ONLY JSON, no markdown.`;
  }
};

export const searchQueriesPrompt = (sectionTitle: string, sectionFocus: string): string => {
  return `You are a search query generator. Generate exactly 2-3 specific search queries for the following report section.

Section Title: ${sectionTitle}
Section Focus: ${sectionFocus}

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no code blocks, no extra text):
{"queries": ["first search query here", "second search query here", "third search query here"]}

Example:
{"queries": ["quantum computing applications", "quantum computing challenges", "quantum computing future"]}

CRITICAL: Return ONLY the JSON object, nothing else.`;
};

export const writerPrompt = (sectionTitle: string, context: string): string => {
  return `You are a technical writer. Write a section for a research report.

CRITICAL: You MUST write about the section title below. Do NOT write about unrelated topics.

Section Title: ${sectionTitle}

Context / Sources:
${context}

Instructions:
1. Write ONLY about the section title: "${sectionTitle}"
2. Extract the main topic from the section title and focus your entire response on that topic
3. Use the provided context/sources to inform your writing
4. If the context doesn't match the section title, still write about the section title using general knowledge
5. Do NOT write about topics that are not mentioned in the section title
6. Start with "## ${sectionTitle}"
7. Use subheadings (###) for structure
8. Length: 300-500 words
9. Output strictly Markdown text (no JSON, no code blocks)

Example:
- If section title is "Future of AI", write about AI's future, not about opioids or other topics
- If section title is "Comparison: Cats vs Dogs", write about comparing cats and dogs, not about other animals

CRITICAL: Stay focused on "${sectionTitle}". Return ONLY Markdown text.`;
};
