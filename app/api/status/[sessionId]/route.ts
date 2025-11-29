export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  // Proxy to Cloudflare Worker
  const workerUrl = process.env.WORKER_URL || "http://localhost:8787";
  const resolvedParams = await Promise.resolve(params);
  const { sessionId } = resolvedParams;

  try {
    const response = await fetch(`${workerUrl}/api/status/${sessionId}`, {
      method: "GET",
    });

    if (response.status === 202) {
      return new Response("Not ready", { status: 202 });
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to get status" }),
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

