
-- 1. Drop the table-level public read policy.
DROP POLICY IF EXISTS agents_public_read ON public.agents;

-- 2. Revoke any direct table SELECT from public roles (defense in depth).
REVOKE SELECT ON TABLE public.agents FROM anon, authenticated;

-- 3. Public marketplace view — non-sensitive columns only.
CREATE OR REPLACE VIEW public.agents_public
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  avatar,
  persona,
  categories,
  base_price_sats,
  reputation,
  total_jobs,
  success_rate,
  total_sats_earned,
  agent_type,
  avg_completion_seconds,
  runtime,
  is_my_agent,
  user_id,
  created_at
FROM public.agents;

GRANT SELECT ON public.agents_public TO anon, authenticated;

-- 4. Re-add a minimal SELECT policy so the view (security_invoker) can read
--    the underlying table when called by anon/authenticated. Without a SELECT
--    policy, RLS would block the view from returning any row at all.
--    Note: PostgREST cannot query the table directly because the table-level
--    SELECT grant was revoked above — only the view is exposed.
CREATE POLICY agents_view_read
  ON public.agents
  FOR SELECT
  TO anon, authenticated
  USING (true);
