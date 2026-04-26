-- Add payout tracking to bounties
ALTER TABLE public.bounties
  ADD COLUMN IF NOT EXISTS payout_invoice text,
  ADD COLUMN IF NOT EXISTS payout_preimage text,
  ADD COLUMN IF NOT EXISTS payout_error text;

-- Track pending wallet top-ups (Alby invoices)
CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  amount_sats integer NOT NULL CHECK (amount_sats > 0),
  invoice text NOT NULL,
  payment_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending', -- pending | settled | expired
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_topups_owner_read
  ON public.wallet_topups FOR SELECT TO authenticated
  USING (public.user_owns_agent(agent_id));

-- Inserts and updates are performed by edge functions using the service role,
-- which bypasses RLS — no INSERT/UPDATE policies needed for end users.

CREATE INDEX IF NOT EXISTS wallet_topups_agent_idx ON public.wallet_topups(agent_id, status);