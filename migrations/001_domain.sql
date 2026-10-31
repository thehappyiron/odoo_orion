CREATE SEQUENCE subscription_number_seq;
CREATE SEQUENCE invoice_number_seq;
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text UNIQUE REFERENCES "user"(id),
  company text NOT NULL, contact text NOT NULL, email text NOT NULL UNIQUE CHECK (email=lower(trim(email))),
  address text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name text NOT NULL,
  type text NOT NULL, sales_amount bigint NOT NULL CHECK (sales_amount>=0),
  cost_amount bigint NOT NULL CHECK (cost_amount>=0), notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
  attribute text NOT NULL DEFAULT 'Brand', name text NOT NULL, delta bigint NOT NULL CHECK (delta>=0),
  active boolean NOT NULL DEFAULT true, UNIQUE(product_id, attribute, name)
);
CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id), amount bigint NOT NULL CHECK (amount>=0),
  frequency text NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  min_quantity integer NOT NULL DEFAULT 1 CHECK (min_quantity>0),
  available_from date NOT NULL, available_until date,
  allow_pause boolean NOT NULL DEFAULT true, allow_close boolean NOT NULL DEFAULT true,
  allow_renew boolean NOT NULL DEFAULT true, auto_close boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true, description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), CHECK (available_until IS NULL OR available_until>=available_from)
);
CREATE TABLE taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  product_ids uuid[] NOT NULL DEFAULT '{}', valid_from date NOT NULL, valid_until date,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until>=valid_from)
);
CREATE TABLE discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('FIXED','PERCENT')), value bigint NOT NULL CHECK (value>=0),
  product_ids uuid[] NOT NULL DEFAULT '{}', min_amount bigint NOT NULL DEFAULT 0 CHECK(min_amount>=0),
  min_quantity integer NOT NULL DEFAULT 1 CHECK(min_quantity>0), valid_from date NOT NULL, valid_until date,
  max_uses integer CHECK(max_uses>=0), uses_consumed integer NOT NULL DEFAULT 0 CHECK(uses_consumed>=0),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind<>'PERCENT' OR value<=10000), CHECK(max_uses IS NULL OR uses_consumed<=max_uses),
  CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, plan_id uuid NOT NULL REFERENCES plans(id),
  validity_days integer NOT NULL CHECK(validity_days>0), payment_days integer NOT NULL CHECK(payment_days>=0),
  lines jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text,6,'0')),
  customer_id uuid NOT NULL REFERENCES customers(id), plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','QUOTATION','CONFIRMED','ACTIVE','PAUSED','CLOSED')),
  start_on date NOT NULL, expiry_on date, next_billing_on date NOT NULL,
  anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31), anchor_month integer NOT NULL CHECK(anchor_month BETWEEN 1 AND 12),
  payment_days integer NOT NULL CHECK(payment_days>=0), lines jsonb NOT NULL, accepted jsonb,
  quote_valid_until date, validity_days integer NOT NULL DEFAULT 14 CHECK(validity_days>0),
  version integer NOT NULL DEFAULT 1, created_by text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(expiry_on IS NULL OR expiry_on>=start_on)
);
CREATE INDEX subscriptions_due_idx ON subscriptions(next_billing_on,id) WHERE status='ACTIVE';
CREATE INDEX subscriptions_customer_idx ON subscriptions(customer_id,created_at DESC);
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text,6,'0')),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id), customer_id uuid NOT NULL REFERENCES customers(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','CONFIRMED','PAID','CANCELLED')),
  currency text NOT NULL DEFAULT 'INR' CHECK(currency='INR'), period_start date NOT NULL, period_end date NOT NULL,
  billing_date date NOT NULL, due_on date NOT NULL, issued_at timestamptz,
  subtotal bigint NOT NULL CHECK(subtotal>=0), discount bigint NOT NULL CHECK(discount>=0),
  tax bigint NOT NULL CHECK(tax>=0), total bigint NOT NULL CHECK(total>=0), paid bigint NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=total),
  lines jsonb NOT NULL, discount_id uuid REFERENCES discounts(id), discount_code text,
  customer_snapshot jsonb NOT NULL, fixture boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(subscription_id,period_start),
  CHECK(period_end>period_start), CHECK(due_on>=billing_date)
);
CREATE INDEX invoices_customer_idx ON invoices(customer_id,created_at DESC);
CREATE INDEX invoices_status_due_idx ON invoices(status,due_on);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id),
  amount bigint NOT NULL CHECK(amount>0), method text NOT NULL CHECK(method IN ('BANK','UPI','CARD','CASH','OTHER')),
  paid_on date NOT NULL, note text NOT NULL DEFAULT '', reference text UNIQUE,
  reversed_at timestamptz, reversal_reason text, created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_date_idx ON payments(paid_on);
CREATE TABLE audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text REFERENCES "user"(id),
  action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit(entity_id,created_at DESC);
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient text NOT NULL, subject text NOT NULL,
  body text NOT NULL, kind text NOT NULL CHECK(kind IN ('INVOICE','RESET')), user_id text REFERENCES "user"(id),
  invoice_id uuid REFERENCES invoices(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id,kind)
);
CREATE TABLE billing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text REFERENCES "user"(id),
  as_of date NOT NULL, created integer NOT NULL DEFAULT 0, skipped integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'RUNNING',
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fingerprint text NOT NULL UNIQUE, code text NOT NULL,
  severity text NOT NULL, entity_id text NOT NULL, title text NOT NULL, evidence jsonb NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events cannot be edited or removed'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION immutable_audit();
CREATE FUNCTION protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('CONFIRMED','PAID','CANCELLED') AND
    (NEW.subtotal,NEW.discount,NEW.tax,NEW.total,NEW.lines,NEW.period_start,NEW.period_end,NEW.customer_snapshot,NEW.customer_id,NEW.subscription_id,NEW.discount_id,NEW.discount_code,NEW.billing_date,NEW.due_on)
    IS DISTINCT FROM
    (OLD.subtotal,OLD.discount,OLD.tax,OLD.total,OLD.lines,OLD.period_start,OLD.period_end,OLD.customer_snapshot,OLD.customer_id,OLD.subscription_id,OLD.discount_id,OLD.discount_code,OLD.billing_date,OLD.due_on)
  THEN RAISE EXCEPTION 'Issued invoice snapshots are immutable'; END IF;
  IF NEW.status IN ('CONFIRMED','PAID') AND NEW.total<>NEW.subtotal-NEW.discount+NEW.tax
  THEN RAISE EXCEPTION 'Invoice totals do not reconcile'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice();
CREATE FUNCTION protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.invoice_id,NEW.amount,NEW.method,NEW.paid_on,NEW.reference,NEW.note) IS DISTINCT FROM
     (OLD.invoice_id,OLD.amount,OLD.method,OLD.paid_on,OLD.reference,OLD.note)
  THEN RAISE EXCEPTION 'Payment records are immutable; use reversal'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_payment();
