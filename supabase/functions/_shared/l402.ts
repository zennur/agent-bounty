// L402 — Lightning HTTP 402 paywall primitives.
// Spec: https://docs.lightning.engineering/the-lightning-network/l402
//
// Flow:
//   1. Client calls a protected endpoint with no auth.
//   2. Server replies 402 with a fresh BOLT11 invoice + an opaque "macaroon"
//      that binds (payment_hash, resource, amount, expiry).
//   3. Client pays the invoice over Lightning, receives the preimage.
//   4. Client retries with `Authorization: L402 <macaroon>:<preimage>`.
//   5. Server verifies SHA-256(preimage) === payment_hash recorded in macaroon.
//
// This module is provider-agnostic: `createInvoice` returns a mock invoice today,
// but is structured so swapping in Alby NWC / LNbits is a one-line change.

const TOKEN_SECRET = Deno.env.get("L402_SECRET") ?? "groundtruth-l402-dev-secret";

// ---------- helpers ----------

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

async function sha256Hex(input: Uint8Array | string): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  // deno-lint-ignore no-explicit-any
  const digest = await crypto.subtle.digest("SHA-256", data as any);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return bytesToHex(new Uint8Array(sig));
}

function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function b64decode(s: string): string {
  try { return decodeURIComponent(escape(atob(s))); } catch { return ""; }
}

// ---------- macaroon ----------
// Minimal "macaroon": a base64-encoded JSON payload + HMAC signature.
// Real macaroons (libmacaroons) support caveats & attenuation; this is enough
// for the L402 happy path: bind a payment_hash to a resource and amount.

export interface MacaroonCaveats {
  /** Hex SHA-256 of canonical request body, prevents param-swap on retry. */
  body_hash?: string;
  /** Lightning address for refunds (L402 buyer flow). */
  refund_lnaddress?: string;
  /** Free-form role tag, e.g. "buyer" | "specialist". */
  role?: string;
}

export interface MacaroonClaims {
  payment_hash: string; // hex sha256 of the preimage
  resource: string;     // e.g. agent slug or endpoint path
  amount_sats: number;
  issued_at: number;    // unix seconds
  expires_at: number;   // unix seconds
  caveats?: MacaroonCaveats;
}

export async function generateMacaroon(
  paymentHash: string,
  agentSlug: string,
  amountSats: number,
  ttlSeconds = 3600,
  caveats?: MacaroonCaveats,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: MacaroonClaims = {
    payment_hash: paymentHash,
    resource: agentSlug,
    amount_sats: amountSats,
    issued_at: now,
    expires_at: now + ttlSeconds,
    ...(caveats ? { caveats } : {}),
  };
  const payload = JSON.stringify(claims);
  const sig = await hmacHex(TOKEN_SECRET, payload);
  return b64encode(`${payload}.${sig}`);
}

/** Canonicalize a JSON body for body_hash binding — stable key ordering. */
export async function canonicalBodyHash(body: unknown): Promise<string> {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]); return acc;
      }, {});
    }
    return v;
  };
  return await sha256Hex(JSON.stringify(sortKeys(body)));
}

/** Public hex SHA-256 helper (used to fingerprint a macaroon as buyer identity). */
export async function macaroonFingerprint(macaroon: string): Promise<string> {
  return await sha256Hex(macaroon);
}

export async function decodeMacaroon(macaroon: string): Promise<MacaroonClaims | null> {
  const raw = b64decode(macaroon);
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = await hmacHex(TOKEN_SECRET, payload);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(payload) as MacaroonClaims;
    if (Math.floor(Date.now() / 1000) > claims.expires_at) return null;
    return claims;
  } catch { return null; }
}

// ---------- header validation ----------

export interface L402Validation {
  ok: boolean;
  reason?: string;
  claims?: MacaroonClaims;
}

/**
 * Validate `Authorization: L402 <macaroon>:<preimage>` against an expected payment hash.
 * If `expectedPaymentHash` is omitted, the hash is read from the macaroon itself
 * (after verifying its HMAC) — this is the standard L402 mode.
 */
export async function validateL402Header(
  authHeader: string | null,
  expectedPaymentHash?: string,
): Promise<L402Validation> {
  if (!authHeader) return { ok: false, reason: "missing Authorization header" };
  const m = authHeader.match(/^L402\s+([^:\s]+):([0-9a-fA-F]{64})$/);
  if (!m) return { ok: false, reason: "malformed L402 header (expect 'L402 <macaroon>:<preimage>')" };
  const [, macaroon, preimageHex] = m;

  const claims = await decodeMacaroon(macaroon);
  if (!claims) return { ok: false, reason: "invalid or expired macaroon" };

  const computed = await sha256Hex(hexToBytes(preimageHex));
  const target = expectedPaymentHash ?? claims.payment_hash;
  if (computed !== target.toLowerCase()) {
    return { ok: false, reason: "preimage does not match payment_hash" };
  }
  return { ok: true, claims };
}

// ---------- invoice provider ----------

export interface InvoiceResult {
  invoice: string;
  paymentHash: string;
  preimage?: string; // only exposed by the mock provider, never in prod
}

/**
 * Generate a Lightning invoice for the given amount/memo.
 *
 * TODO: Replace with Alby NWC or LNbits call. The shape is identical to
 * `AlbyNWC.makeInvoice()` in `_shared/alby-nwc.ts`, so the swap is:
 *
 *   const alby = getAlby();
 *   const inv = await alby.makeInvoice(amountSats, memo);
 *   return { invoice: inv.invoice, paymentHash: inv.payment_hash };
 *
 * For now we mint a deterministic-looking fake BOLT11 + a random 32-byte preimage,
 * so the full L402 round-trip can be demoed without a wallet.
 */
export async function createInvoice(
  amountSats: number,
  memo: string,
): Promise<InvoiceResult> {
  // 32-byte random preimage → SHA-256 → payment_hash
  const preimage = crypto.getRandomValues(new Uint8Array(32));
  const preimageHex = bytesToHex(preimage);
  const paymentHash = await sha256Hex(preimage);

  // Mock BOLT11 — looks plausible (lnbc<amount>n1...) but is NOT routable.
  const amountTag = `${amountSats}n`; // n = nano-BTC bucket; purely cosmetic here
  const memoSlug = memo.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mock";
  const invoice = `lnbc${amountTag}1mock${paymentHash.slice(0, 24)}${memoSlug}`;

  return { invoice, paymentHash, preimage: preimageHex };
}

// ---------- challenge response ----------

export interface L402Challenge {
  status: 402;
  headers: Record<string, string>;
  body: {
    error: "Payment Required";
    invoice: string;
    macaroon: string;
    payment_hash: string;
    amount_sats: number;
    instructions: string;
    // Demo-only: the preimage so the docs / curl examples can complete the loop
    // without a real Lightning wallet. Remove when swapping in a real provider.
    demo_preimage?: string;
  };
}

export async function buildL402Challenge(
  amountSats: number,
  resource: string,
  memo: string,
): Promise<L402Challenge> {
  const inv = await createInvoice(amountSats, memo);
  const macaroon = await generateMacaroon(inv.paymentHash, resource, amountSats);
  // Standard L402 also sets a `WWW-Authenticate: L402 macaroon=..., invoice=...` header.
  const wwwAuth = `L402 macaroon="${macaroon}", invoice="${inv.invoice}"`;
  return {
    status: 402,
    headers: { "WWW-Authenticate": wwwAuth },
    body: {
      error: "Payment Required",
      invoice: inv.invoice,
      macaroon,
      payment_hash: inv.paymentHash,
      amount_sats: amountSats,
      instructions: `Pay the invoice, then retry with: Authorization: L402 ${macaroon}:<preimage>`,
      demo_preimage: inv.preimage,
    },
  };
}
