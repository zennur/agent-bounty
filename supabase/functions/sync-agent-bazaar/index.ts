import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { makeContext } from "../_shared/lightning.ts";

const BAZAAR_URL = "https://agentbazaar-production-1234.up.railway.app";

function inferCategories(slug: string): string[] {
  if (slug.includes("oncology") || slug.includes("drug")) return ["medical", "research"];
  if (slug.includes("bacteria") || slug.includes("superbug")) return ["medical", "biology"];
  if (slug.includes("currency") || slug.includes("predecimal")) return ["finance", "history"];
  return ["general"];
}

function bazaarToAgent(slug: string, a: Record<string, unknown>) {
  const inputField = Object.keys((a.input_schema as Record<string, unknown>) ?? {})[0] ?? "query";
  const toolList = ((a.tools as string[]) ?? []).join(", ");
  return {
    external_slug: slug,
    name: (a.title as string) ?? slug,
    avatar: "🤖",
    persona: `${a.title ?? slug}. Tools: ${toolList}.`,
    categories: inferCategories(slug),
    base_price_sats: 100,
    reputation: 50,
    agent_type: "specialist",
    runtime: "external",
    external_invoke_url: `${BAZAAR_URL}/agents/${slug}/invoke`,
    input_field_name: inputField,
    avg_completion_seconds: 15,
    is_active: true,
    is_my_agent: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { supabase } = makeContext();

    const resp = await fetch(`${BAZAAR_URL}/agents`);
    if (!resp.ok) return errorResponse(`AgentBazaar unreachable (${resp.status}).`, 502);

    const remote = (await resp.json()) as Record<string, Record<string, unknown>>;
    const remoteSlugs = Object.keys(remote);

    if (remoteSlugs.length === 0) {
      return jsonResponse({ synced: 0, slugs: [] });
    }

    const upserts = remoteSlugs.map((slug) => bazaarToAgent(slug, remote[slug]));

    const { error: upsertErr } = await supabase
      .from("agents")
      .upsert(upserts, { onConflict: "external_slug", ignoreDuplicates: false });

    if (upsertErr) return errorResponse(`Upsert failed: ${upsertErr.message}`, 500);

    // Deactivate external agents no longer in remote registry
    const { error: deactivateErr } = await supabase
      .from("agents")
      .update({ is_active: false })
      .eq("runtime", "external")
      .not("external_slug", "is", null)
      .not("external_slug", "in", `(${remoteSlugs.map((s) => `"${s}"`).join(",")})`);

    if (deactivateErr) {
      console.error("Deactivate failed:", deactivateErr.message);
    }

    return jsonResponse({ synced: remoteSlugs.length, slugs: remoteSlugs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-agent-bazaar error:", msg);
    return errorResponse(`Sync failed: ${msg}`, 500);
  }
});
