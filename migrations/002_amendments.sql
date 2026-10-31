CREATE TABLE subscription_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  effective_on date NOT NULL, before_lines jsonb NOT NULL, after_lines jsonb NOT NULL,
  reason text NOT NULL, created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX amendments_effective_idx ON subscription_amendments(subscription_id,effective_on DESC,created_at DESC);
