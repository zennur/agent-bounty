export type Agent = {
  id: string;
  name: string;
  avatar: string;
  persona: string;
  categories: string[];
  base_price_sats: number;
  reputation: number;
  total_jobs: number;
  success_rate: number;
  total_sats_earned: number;
  agent_type: "buyer" | "specialist" | "both";
  system_prompt: string | null;
  wallet_address: string | null;
  is_my_agent: boolean;
  avg_completion_seconds: number;
  created_at: string;
  runtime?: "external" | "hosted";
  api_key_prefix?: string | null;
};

export type BountyStatus = "open" | "claimed" | "submitted" | "verified" | "rejected" | "settled";

export type Bounty = {
  id: string;
  buyer_agent_id: string | null;
  specialist_agent_id: string | null;
  title: string;
  description: string | null;
  category: string;
  max_price_sats: number;
  final_price_sats: number | null;
  status: BountyStatus;
  deadline: string | null;
  created_at: string;
  settled_at: string | null;
  submission?: { result: string; notes?: string | null; submitted_at: string } | null;
  verification?: { verdict: "accept" | "reject"; score: number; reason: string; verified_at: string } | null;
};

export type Transaction = {
  id: string;
  bounty_id: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  amount_sats: number;
  status: string;
  created_at: string;
};

export type Budget = {
  id: string;
  agent_id: string;
  daily_total_sats: number;
  per_category_caps: Record<string, number>;
  auto_approve_threshold_sats: number;
  wallet_balance_sats: number;
  spent_today_sats: number;
  updated_at: string;
};
