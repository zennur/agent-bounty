-- Allow authenticated users to insert bounties only if they own the buyer agent.
CREATE POLICY bounties_owner_insert
  ON public.bounties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    buyer_agent_id IS NOT NULL
    AND public.user_owns_agent(buyer_agent_id)
  );