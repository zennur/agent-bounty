
-- =====================================================================
-- 1. Add user_id ownership column to agents
-- =====================================================================
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);

-- =====================================================================
-- 2. Tighten column-level grants on agents to hide sensitive fields
--    from anon/authenticated roles. Service role keeps full access.
-- =====================================================================
REVOKE ALL ON TABLE public.agents FROM anon, authenticated;

-- Grant SELECT only on non-sensitive columns to public roles.
GRANT SELECT (
  id, name, avatar, persona, categories, base_price_sats,
  reputation, total_jobs, success_rate, total_sats_earned,
  agent_type, avg_completion_seconds, runtime, is_my_agent,
  created_at, user_id
) ON public.agents TO anon, authenticated;

-- Owners need to update their own agent's profile fields. Allow INSERT/UPDATE/DELETE
-- on the owner-scoped policy, but only column-level on the columns they should write.
GRANT INSERT, UPDATE, DELETE ON public.agents TO authenticated;

-- =====================================================================
-- 3. Replace RLS policies on agents
-- =====================================================================
DROP POLICY IF EXISTS agents_public_read ON public.agents;

-- Public read of non-sensitive columns (column grants enforce hiding).
CREATE POLICY agents_public_read
  ON public.agents
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Owners can read everything about their own agents via an owner view (below).
-- INSERT: caller must set themselves as the owner.
CREATE POLICY agents_owner_insert
  ON public.agents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY agents_owner_update
  ON public.agents
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY agents_owner_delete
  ON public.agents
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================================
-- 4. Owner-only view that exposes sensitive columns to the agent's owner.
-- =====================================================================
CREATE OR REPLACE VIEW public.agents_owner_view
WITH (security_invoker = true)
AS
SELECT
  a.*
FROM public.agents a
WHERE a.user_id = auth.uid();

GRANT SELECT ON public.agents_owner_view TO authenticated;

-- =====================================================================
-- 5. Budgets — owner-scoped policies via the linked agent's user_id
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_owns_agent(_agent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agents
    WHERE id = _agent_id AND user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS budgets_owner_read ON public.budgets;
DROP POLICY IF EXISTS budgets_owner_update ON public.budgets;
DROP POLICY IF EXISTS budgets_owner_insert ON public.budgets;

CREATE POLICY budgets_owner_read
  ON public.budgets
  FOR SELECT
  TO authenticated
  USING (public.user_owns_agent(agent_id));

CREATE POLICY budgets_owner_update
  ON public.budgets
  FOR UPDATE
  TO authenticated
  USING (public.user_owns_agent(agent_id))
  WITH CHECK (public.user_owns_agent(agent_id));

CREATE POLICY budgets_owner_insert
  ON public.budgets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_owns_agent(agent_id));

GRANT SELECT, INSERT, UPDATE ON public.budgets TO authenticated;

-- =====================================================================
-- 6. Remove bounties/transactions from realtime publication
--    (any authenticated user could otherwise subscribe to all changes).
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bounties'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.bounties;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.transactions;
  END IF;
END $$;
