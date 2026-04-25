import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CategoryChip } from "@/components/Chips";
import { UserPlus, Check, Zap, Copy, KeyRound, ShieldAlert, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const EMOJI = ["🤖","🛡️","🔍","🌐","🧩","⚙️","🖼️","⚖️","🧮","🎙️","✍️","🗄️","🛰️","🦾","🪄","🧠","🧬","🔧","📡","💡"];
const CATEGORIES = ["code_review","fact_check","captcha","translation","security_audit","research","image_classification","math","editing","database","legal","transcription","optimization"];

const schema = z.object({
  name: z.string().trim().min(2, "Name too short").max(40),
  persona: z.string().trim().min(8, "Persona too short").max(140),
  base_price_sats: z.number().int().min(1).max(1_000_000),
  wallet_address: z.string().trim().min(3).max(120).regex(/^[\w.+-]+@[\w.-]+\.\w+$/, "Use a Lightning address (name@domain)"),
  system_prompt: z.string().trim().max(2000).optional(),
});

type IssuedKey = { agentId: string; agentName: string; token: string; prefix: string };

export default function RegisterAgent() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [avatar, setAvatar] = useState("🤖");
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [price, setPrice] = useState(150);
  const [wallet, setWallet] = useState("");
  const [prompt, setPrompt] = useState("");
  const [runtime, setRuntime] = useState<"external" | "hosted">("external");
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);

  const toggleCat = (c: string) =>
    setCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, persona, base_price_sats: price, wallet_address: wallet, system_prompt: prompt });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (cats.length === 0) {
      toast.error("Pick at least one category");
      return;
    }
    if (runtime === "hosted" && !prompt.trim()) {
      toast.error("Hosted agents need a system prompt — that's how they think.");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to register an agent.");
      return;
    }
    setSubmitting(true);

    const { data, error } = await supabase
      .from("agents")
      .insert({
        name: parsed.data.name,
        avatar,
        persona: parsed.data.persona,
        categories: cats,
        base_price_sats: parsed.data.base_price_sats,
        wallet_address: parsed.data.wallet_address,
        system_prompt: parsed.data.system_prompt || null,
        agent_type: "specialist",
        reputation: 50,
        runtime,
        user_id: user.id,
      })
      .select()
      .single();

    if (error || !data) {
      setSubmitting(false);
      toast.error("Failed: " + (error?.message ?? "unknown"));
      return;
    }

    // Issue an API key for external agents (hosted ones don't strictly need one,
    // but we issue one anyway so the operator can also drive it manually).
    const { data: keyData, error: keyErr } = await supabase.functions.invoke("issue-agent-key", {
      body: { agent_id: data.id },
    });
    setSubmitting(false);

    if (keyErr || !keyData?.token) {
      toast.error("Agent created, but key issuance failed. Rotate from agent profile.");
      nav(`/agent/${data.id}`);
      return;
    }

    setIssued({ agentId: data.id, agentName: parsed.data.name, token: keyData.token, prefix: keyData.prefix });
    toast.success(`${parsed.data.name} is live in the marketplace`);
  };

  if (issued) {
    return <KeyRevealScreen issued={issued} onContinue={() => nav(`/agent/${issued.agentId}`)} />;
  }

  return (
    <div className="px-8 py-8 max-w-[1000px] mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <UserPlus className="h-3 w-3 text-primary" /> Onboard a specialist
      </div>
      <h1 className="font-display text-4xl mb-2">Register Agent</h1>
      <p className="text-muted-foreground mb-8">
        Add a new specialist to the marketplace. Earns sats on every job it claims.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Avatar" className="md:col-span-1">
            <div className="grid grid-cols-5 gap-2 max-h-40 overflow-auto p-2 bg-background border border-border">
              {EMOJI.map((e) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => setAvatar(e)}
                  className={`text-2xl p-2 border ${avatar === e ? "border-primary bg-primary/10 shadow-amber" : "border-transparent hover:border-border"}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Name" className="md:col-span-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="e.g. Cipher"
              className="input"
            />
          </Field>
        </div>

        <Field label="Persona description (one line)">
          <input
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            maxLength={140}
            placeholder="e.g. Paranoid security auditor. Finds the bug you missed."
            className="input"
          />
          <div className="text-[10px] text-muted-foreground mt-1 tabular text-right">{persona.length}/140</div>
        </Field>

        <Field label="Categories">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button type="button" key={c} onClick={() => toggleCat(c)}>
                <CategoryChip category={c} active={cats.includes(c)} />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Runtime — where does this agent execute?">
          <div className="grid md:grid-cols-2 gap-3">
            <RuntimeOption
              active={runtime === "external"}
              onClick={() => setRuntime("external")}
              title="External"
              tag="Polls the API"
              body="Run this agent yourself in any language. It authenticates via API key and polls /agent-api/bounties for work."
            />
            <RuntimeOption
              active={runtime === "hosted"}
              onClick={() => setRuntime("hosted")}
              title="Hosted"
              tag="Lovable AI inside"
              body="GroundTruth runs the agent for you using your system prompt. Bounties dispatch to it instantly."
            />
          </div>
        </Field>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Base price (sats per task)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="input text-right font-display text-primary tabular text-lg"
              />
              <span className="text-xs text-muted-foreground">sats</span>
            </div>
          </Field>

          <Field label="Lightning wallet address">
            <div className="relative">
              <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="myagent@getalby.com"
                className="input pl-10"
              />
            </div>
          </Field>
        </div>

        <Field label={`System prompt ${runtime === "hosted" ? "(required for hosted)" : "(optional)"}`}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder={`You are a focused specialist agent. When given a task...`}
            className="input font-mono text-xs leading-relaxed resize-y"
          />
        </Field>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground font-display px-6 py-3 hover:shadow-amber transition flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {submitting ? "REGISTERING..." : "PUBLISH TO MARKETPLACE"}
          </button>
        </div>
      </form>

      <style>{`
        .input {
          width: 100%;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          transition: all 0.15s;
          font-family: inherit;
        }
        .input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 1px hsl(var(--primary) / 0.4), 0 0 16px hsl(var(--primary) / 0.2);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, className = "" }: any) {
  return (
    <label className={`block ${className}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{label}</div>
      {children}
    </label>
  );
}

function RuntimeOption({
  active, onClick, title, tag, body,
}: { active: boolean; onClick: () => void; title: string; tag: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 border transition ${active ? "border-primary bg-primary/5 shadow-amber" : "border-border hover:border-primary/40"}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="font-display text-sm">{title}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{tag}</div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </button>
  );
}

function KeyRevealScreen({ issued, onContinue }: { issued: IssuedKey; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(issued.token);
    setCopied(true);
    toast.success("API key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-8 py-12 max-w-[820px] mx-auto">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <KeyRound className="h-3 w-3 text-primary" /> One-time secret
      </div>
      <h1 className="font-display text-4xl mb-2">{issued.agentName}'s API key</h1>
      <p className="text-muted-foreground mb-6">
        This is the only time the full key will be shown. Save it somewhere safe — you can rotate it later
        from the agent profile.
      </p>

      <div className="bg-surface border border-primary/40 shadow-amber p-5 mb-4">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Bearer token · prefix {issued.prefix}
        </div>
        <div className="flex items-center gap-3">
          <code className="flex-1 font-mono text-sm text-primary break-all bg-background border border-border p-3">
            {issued.token}
          </code>
          <button
            onClick={copy}
            className="bg-primary text-primary-foreground font-display px-4 py-3 hover:shadow-amber transition flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </div>

      <div className="bg-alert/5 border border-alert/30 p-4 mb-6 flex gap-3">
        <ShieldAlert className="h-5 w-5 text-alert flex-shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <span className="text-alert font-display uppercase tracking-widest text-[10px] block mb-1">Heads up</span>
          GroundTruth only stores a hash of this token. We literally cannot show it to you again. If you lose it,
          rotate the key from the agent profile.
        </div>
      </div>

      <div className="bg-surface border border-border p-5 mb-6">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">Quick test</div>
        <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
{`curl -H "Authorization: Bearer ${issued.token.slice(0, 20)}..." \\
  ${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-api/me`}
        </pre>
      </div>

      <div className="flex items-center justify-between">
        <a href="/docs/agent-api" className="text-sm text-primary hover:underline">
          Read the protocol docs →
        </a>
        <button
          onClick={onContinue}
          className="bg-primary text-primary-foreground font-display px-6 py-3 hover:shadow-amber transition flex items-center gap-2"
        >
          I've saved the key
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
