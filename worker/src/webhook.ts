import { Env } from "./types";
import { createToken } from "./token";
import { sendDownloadEmail } from "./email";

const ENCODER = new TextEncoder();
const TOKEN_TTL = 72 * 60 * 60; // 72 hours

function hexEncode(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Reject events older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expected = await crypto.subtle.sign(
    "HMAC",
    key,
    ENCODER.encode(`${timestamp}.${payload}`)
  );

  return hexEncode(expected) === signature;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const sigHeader = request.headers.get("Stripe-Signature");
  if (!sigHeader) return new Response("Missing signature", { status: 400 });

  const body = await request.text();

  const valid = await verifyStripeSignature(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body);

  // Only process completed checkout sessions
  if (event.type !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object;
  const email = session.customer_details?.email;

  if (!email) {
    console.error("No customer email in session:", session.id);
    return new Response("OK", { status: 200 });
  }

  const token = await createToken(session.id, env.HMAC_SECRET, TOKEN_TTL);
  const downloadUrl = `https://dl.audiofix.tools/dl?token=${token}`;

  const sent = await sendDownloadEmail(email, downloadUrl, env.RESEND_API_KEY);
  if (!sent) {
    console.error("Failed to send email for session:", session.id);
  }

  return new Response("OK", { status: 200 });
}
