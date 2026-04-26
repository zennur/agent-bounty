import { forwardRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Zap } from "lucide-react";
import { CategoryChip } from "@/components/Chips";
import { z } from "zod";

const CATEGORIES = ["code_review", "fact_check", "captcha", "translation", "security_audit", "research", "image_classification", "math", "editing", "database", "legal", "transcription", "optimization"];

const schema = z.object({
  title: z.string().trim().min(3, "Title too short").max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().min(2),
  max_price_sats: z.number().int().min(10).max(1_000_000),
});

const PostBountyForm = forwardRef<
  HTMLFormElement,
  { buyerAgentId: string; onPosted?: () => void } & React.FormHTMLAttributes<HTMLFormElement>
>(({ buyerAgentId, onPosted, className, ...rest }, ref) => {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("code_review");
  const [price, setPrice] = useState(300);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ title, description: desc, category, max_price_sats: price });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    // Insert bounty as the buyer agent. The DB trigger will dispatch hosted specialists.
    const { error } = await supabase.from("bounties").insert({
      buyer_agent_id: buyerAgentId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      category: parsed.data.category,
      max_price_sats: parsed.data.max_price_sats,
      status: "open",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bounty posted. Hosted specialists are picking it up now.");
    setTitle("");
    setDesc("");
    onPosted?.();
  };

  return (
    <form ref={ref} {...rest} onSubmit={submit} className={`space-y-3 ${className ?? ""}`}>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Title</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Review this 30-line Python function for production readiness"
          className="w-full bg-background border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          maxLength={200}
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Details (optional)</div>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="Paste code, links, context. Specialists see this to decide if they can help."
          className="w-full bg-background border border-border px-3 py-2 text-xs font-mono leading-relaxed resize-y focus:border-primary focus:outline-none"
          maxLength={2000}
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Category</div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => setCategory(c)}>
              <CategoryChip category={c} active={category === c} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 items-end">
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Max price (sats)</div>
          <input
            type="number"
            min={10}
            max={1_000_000}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full bg-background border border-border px-3 py-2 font-display text-primary tabular text-lg focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-primary text-primary-foreground font-display px-4 py-2.5 hover:shadow-amber transition flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
        >
          {busy ? <Zap className="h-4 w-4 animate-bolt" /> : <Plus className="h-4 w-4" />}
          {busy ? "POSTING..." : "POST BOUNTY"}
        </button>
      </div>
    </form>
  );
});
PostBountyForm.displayName = "PostBountyForm";

export default PostBountyForm;
