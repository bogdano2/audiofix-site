import { TokenPayload } from "./types";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createToken(sessionId: string, hmacSecret: string, ttlSeconds: number): Promise<string> {
  const payload: TokenPayload = {
    sid: sessionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadStr = base64UrlEncode(ENCODER.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const key = await getKey(hmacSecret);
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(payloadStr));
  return payloadStr + "." + base64UrlEncode(sig);
}

export async function verifyToken(token: string, hmacSecret: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, sigStr] = parts;
  const key = await getKey(hmacSecret);
  const sigBytes = base64UrlDecode(sigStr);

  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, ENCODER.encode(payloadStr));
  if (!valid) return null;

  try {
    const payload: TokenPayload = JSON.parse(DECODER.decode(base64UrlDecode(payloadStr)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
