// Per-agent API key auth.
// Token format shown to user: gt_<prefix>_<secret>     (e.g. gt_a1b2c3_4f8e…)
// Stored: api_key_prefix = "a1b2c3", api_key_hash = sha256("gt_a1b2c3_4f8e…")

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generates a fresh API key. Returns { token, prefix, hash }. */
export async function generateApiKey(): Promise<{ token: string; prefix: string; hash: string }> {
  const prefix = randomHex(3); // 6 hex chars
  const secret = randomHex(24); // 48 hex chars
  const token = `gt_${prefix}_${secret}`;
  const hash = await sha256Hex(token);
  return { token, prefix, hash };
}

export interface AuthedAgent {
  id: string;
  name: string;
  agent_type: string;
  runtime: string;
  categories: string[];
  base_price_sats: number;
}

/** Resolves Bearer token → agent row. Returns null if invalid. */
export async function authAgent(req: Request, supabase: SupabaseClient): Promise<AuthedAgent | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer gt_")) return null;
  const token = header.slice("Bearer ".length).trim();
  const hash = await sha256Hex(token);
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, agent_type, runtime, categories, base_price_sats")
    .eq("api_key_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  return data as AuthedAgent;
}
