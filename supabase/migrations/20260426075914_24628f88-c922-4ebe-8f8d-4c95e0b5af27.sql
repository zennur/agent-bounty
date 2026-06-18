ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS external_slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS external_invoke_url TEXT,
  ADD COLUMN IF NOT EXISTS input_field_name TEXT DEFAULT 'query',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DROP VIEW IF EXISTS public.agents_public;

CREATE VIEW public.agents_public
WITH (security_invoker = true)
AS
SELECT
  id, name, avatar, persona, categories, base_price_sats, reputation,
  total_jobs, success_rate, total_sats_earned, agent_type,
  avg_completion_seconds, runtime, is_my_agent, created_at, user_id,
  external_slug, external_invoke_url, input_field_name
FROM public.agents
WHERE is_active = true;