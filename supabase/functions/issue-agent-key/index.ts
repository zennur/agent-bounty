// Issues a fresh API key for an agent. Called from the UI after registration
// (or when the user clicks "Rotate key"). Returns the raw token ONCE — never again.
//
// Auth: requires the caller's Supabase user JWT in the Authorization header,
// AND the agent row must be owned by that user (agents.user_id = auth.uid()).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { generateApiKey } from "../_shared/agent-auth.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ agent_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  // 1. Require an authenticated Supabase user.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authentication required.", 401);
  }
  const jwt = authHeader.slice("Bearer ".length);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Use the user-scoped client to validate the JWT.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return errorResponse("Invalid session.", 401);
  }
  const callerId = userData.user.id;

  // 2. Validate body.
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

  // 3. Service-role client for the privileged update + ownership lookup.
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agent, error: aErr } = await supabase
    .from("agents")
    .select("id, user_id")
    .eq("id", parsed.data.agent_id)
    .maybeSingle();

  if (aErr) return errorResponse("Lookup failed.", 500);
  if (!agent) return errorResponse("Agent not found.", 404);
  if (agent.user_id !== callerId) {
    return errorResponse("You do not own this agent.", 403);
  }

  // 4. Issue & persist the new key.
  const { token, prefix, hash } = await generateApiKey();

  const { error } = await supabase
    .from("agents")
    .update({ api_key_prefix: prefix, api_key_hash: hash })
    .eq("id", parsed.data.agent_id);
  if (error) return errorResponse("Failed to rotate key.", 500);

  return jsonResponse({ token, prefix, warning: "Save this token — it will not be shown again." });
});
