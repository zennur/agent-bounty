-- Restore table-level SELECT grant so security_invoker view + RLS can work.
-- Sensitive columns are still protected because the agents_public view excludes them,
-- and direct queries to the agents table from the client should target the view.
-- For owner access to sensitive columns, agents_owner_view is used.
GRANT SELECT ON TABLE public.agents TO anon, authenticated;