
-- 1. Enable pg_net so triggers can call edge functions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Schema additions on agents
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS api_key_prefix text,
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS runtime text NOT NULL DEFAULT 'external';

CREATE UNIQUE INDEX IF NOT EXISTS agents_api_key_hash_idx
  ON public.agents (api_key_hash) WHERE api_key_hash IS NOT NULL;

-- Validate runtime value via trigger (CHECK constraints are fine here too, but trigger is consistent with our pattern)
ALTER TABLE public.agents
  ADD CONSTRAINT agents_runtime_check CHECK (runtime IN ('external', 'hosted'));

-- 3. Schema additions on bounties
ALTER TABLE public.bounties
  ADD COLUMN IF NOT EXISTS submission jsonb,
  ADD COLUMN IF NOT EXISTS verification jsonb;

ALTER TABLE public.bounties
  ADD CONSTRAINT bounties_status_check CHECK (
    status IN ('open', 'claimed', 'submitted', 'verified', 'rejected', 'settled')
  );

CREATE INDEX IF NOT EXISTS bounties_status_category_idx
  ON public.bounties (status, category);

-- 4. Tighten RLS — public read, service-role-only writes (edge functions act as service role)
DROP POLICY IF EXISTS agents_all       ON public.agents;
DROP POLICY IF EXISTS bounties_all     ON public.bounties;
DROP POLICY IF EXISTS budgets_all      ON public.budgets;
DROP POLICY IF EXISTS transactions_all ON public.transactions;

-- Agents: everyone can browse the marketplace; only edge functions write
CREATE POLICY agents_public_read ON public.agents      FOR SELECT TO anon, authenticated USING (true);

-- Bounties: everyone can see the tape; only edge functions write
CREATE POLICY bounties_public_read ON public.bounties  FOR SELECT TO anon, authenticated USING (true);

-- Transactions: feed is public; only edge functions write
CREATE POLICY transactions_public_read ON public.transactions FOR SELECT TO anon, authenticated USING (true);

-- Budgets: only edge functions read or write (no public exposure of wallet balances)
-- (No policy added → service role still bypasses RLS, anon/authenticated get nothing.)

-- 5. Dispatch hosted runner on new bounty
CREATE OR REPLACE FUNCTION public.dispatch_hosted_runner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
BEGIN
  IF NEW.status <> 'open' THEN
    RETURN NEW;
  END IF;

  -- Resolve the project's edge function URL from the active Supabase project ref.
  fn_url := 'https://nhchcwropqwszrbpxkhr.supabase.co/functions/v1/run-agent';

  PERFORM extensions.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('bounty_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block bounty inserts on dispatcher problems
  RAISE NOTICE 'dispatch_hosted_runner failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_bounty_insert_dispatch_hosted ON public.bounties;
CREATE TRIGGER on_bounty_insert_dispatch_hosted
AFTER INSERT ON public.bounties
FOR EACH ROW EXECUTE FUNCTION public.dispatch_hosted_runner();
