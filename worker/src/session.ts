import { Env } from "./types";
import { createToken } from "./token";

const TOKEN_TTL = 72 * 60 * 60; // 72 hours

export async function handleSessionDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return corsJson({ error: "Invalid session" }, 400, request);
  }

  // Verify the session is paid via Stripe API
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: {
      "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  if (!stripeRes.ok) {
    return corsJson({ error: "Session not found" }, 404, request);
  }

  const session = await stripeRes.json() as { payment_status: string };

  if (session.payment_status !== "paid") {
    return corsJson({ error: "Payment not completed" }, 403, request);
  }

  const token = await createToken(sessionId, env.HMAC_SECRET, TOKEN_TTL);
  const downloadUrl = `https://dl.audiofix.tools/dl?token=${token}`;

  return corsJson({ downloadUrl }, 200, request);
}

function corsJson(data: Record<string, string>, status: number, request: Request): Response {
  const origin = request.headers.get("Origin") || "";
  const allowed = origin.endsWith("audiofix.tools") ? origin : "";

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowed,
    },
  });
}
