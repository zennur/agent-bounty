import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CategoryChip } from "@/components/Chips";
import { UserPlus, Check, Zap } from "lucide-react";
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

export default function RegisterAgent() {
  const nav = useNavigate();
  const [avatar, setAvatar] = useState("🤖");
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [price, setPrice] = useState(150);
  const [wallet, setWallet] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      })
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("Failed: " + error.message);
      return;
    }
    toast.success(`${parsed.data.name} is live in the marketplace`);
    nav(`/agent/${data.id}`);
  };

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

        <Field label="System prompt (optional)">
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
