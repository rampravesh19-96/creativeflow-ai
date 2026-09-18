-- Additive CreativeFlow schema. Legacy tables are intentionally untouched.
CREATE TYPE creativeflow_asset_status AS ENUM ('DRAFT','GENERATING','READY','APPROVED','REJECTED','FAILED');
CREATE TYPE creativeflow_asset_kind AS ENUM ('COPY','HEADLINE','SOCIAL_POST','VISUAL_CONCEPT','IMAGE');
CREATE TABLE campaigns (id uuid PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, brand text NOT NULL, objective text NOT NULL, audience text NOT NULL, tone text NOT NULL, channels jsonb NOT NULL, key_message text NOT NULL, constraints text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX campaigns_user_created_idx ON campaigns (user_id, created_at DESC);
CREATE TABLE strategies (id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id));
CREATE TABLE assets (id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, kind creativeflow_asset_kind NOT NULL, title text NOT NULL, status creativeflow_asset_status NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX assets_campaign_created_idx ON assets (campaign_id, created_at DESC);
CREATE TABLE asset_versions (id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE, sequence integer NOT NULL CHECK(sequence > 0), content text NOT NULL, review_status creativeflow_asset_status NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(asset_id, sequence));
CREATE TABLE generation_runs (id uuid PRIMARY KEY, user_id text NOT NULL, campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE, operation text NOT NULL, provider text NOT NULL, model text, status text NOT NULL CHECK(status IN ('SUCCEEDED','FAILED')), latency_ms integer, input_tokens integer, output_tokens integer, cost_usd numeric, error_category text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX generation_runs_user_created_idx ON generation_runs (user_id, created_at DESC);
