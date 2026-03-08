export interface Env {
  DOWNLOADS_BUCKET: R2Bucket;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_SECRET_KEY: string;
  RESEND_API_KEY: string;
  HMAC_SECRET: string;
}

export interface TokenPayload {
  sid: string; // Stripe checkout session ID
  exp: number; // Unix timestamp (seconds)
}
