ALTER TABLE public.bounties
  ADD COLUMN buyer_macaroon_hash text,
  ADD COLUMN refund_lnaddress text,
  ADD COLUMN auth_mode text NOT NULL DEFAULT 'bearer'
    CHECK (auth_mode IN ('bearer', 'l402'));

CREATE INDEX IF NOT EXISTS bounties_buyer_macaroon_hash_idx
  ON public.bounties (buyer_macaroon_hash)
  WHERE buyer_macaroon_hash IS NOT NULL;

COMMENT ON COLUMN public.bounties.buyer_macaroon_hash IS
  'SHA-256 of the L402 macaroon used to post this bounty. Pseudonymous buyer identity for keyless mode. Mutually exclusive with buyer_agent_id.';
COMMENT ON COLUMN public.bounties.refund_lnaddress IS
  'Lightning address (LNURL) to refund to if the bounty is rejected or cancelled. Required for L402-mode bounties.';
COMMENT ON COLUMN public.bounties.auth_mode IS
  'How this bounty was posted: bearer (account + wallet) or l402 (keyless, pay-per-call).';