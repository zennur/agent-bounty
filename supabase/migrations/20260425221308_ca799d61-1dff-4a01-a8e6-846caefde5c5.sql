
-- Agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🤖',
  persona TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT '{}',
  base_price_sats INTEGER NOT NULL DEFAULT 100,
  reputation INTEGER NOT NULL DEFAULT 50,
  total_jobs INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC NOT NULL DEFAULT 1.0,
  total_sats_earned BIGINT NOT NULL DEFAULT 0,
  agent_type TEXT NOT NULL DEFAULT 'specialist',
  system_prompt TEXT,
  wallet_address TEXT,
  is_my_agent BOOLEAN NOT NULL DEFAULT false,
  avg_completion_seconds INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bounties table
CREATE TABLE public.bounties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  specialist_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  max_price_sats INTEGER NOT NULL,
  final_price_sats INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bounty_id UUID REFERENCES public.bounties(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  amount_sats INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'settled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budgets table
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE UNIQUE,
  daily_total_sats INTEGER NOT NULL DEFAULT 10000,
  per_category_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_approve_threshold_sats INTEGER NOT NULL DEFAULT 200,
  wallet_balance_sats BIGINT NOT NULL DEFAULT 50000,
  spent_today_sats INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- Public demo policies (read + write for everyone, no auth)
CREATE POLICY "agents_all" ON public.agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "bounties_all" ON public.bounties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "transactions_all" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "budgets_all" ON public.budgets FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for live activity feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.bounties;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- Indexes
CREATE INDEX idx_bounties_status ON public.bounties(status);
CREATE INDEX idx_bounties_created_at ON public.bounties(created_at DESC);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX idx_agents_reputation ON public.agents(reputation DESC);
