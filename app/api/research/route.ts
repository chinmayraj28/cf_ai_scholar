export async function POST(request: Request) {
  // Proxy to Cloudflare Worker
  const workerUrl = process.env.WORKER_URL || "http://localhost:8787";
  
  try {
    const body = await request.json();
    const response = await fetch(`${workerUrl}/api/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to start research" }),
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
}

