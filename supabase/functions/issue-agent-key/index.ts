// Issues a fresh API key for an agent. Called from the UI after registration
// (or when the user clicks "Rotate key"). Returns the raw token ONCE — never again.

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";
import { generateApiKey } from "../_shared/agent-auth.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ agent_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only.", 405);

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorResponse("Invalid body.", 400, { issues: parsed.error.flatten() });

  const { supabase } = makeContext();
  const { token, prefix, hash } = await generateApiKey();

  const { error } = await supabase
    .from("agents")
    .update({ api_key_prefix: prefix, api_key_hash: hash })
    .eq("id", parsed.data.agent_id);
  if (error) return errorResponse(error.message, 500);

  return jsonResponse({ token, prefix, warning: "Save this token — it will not be shown again." });
});
