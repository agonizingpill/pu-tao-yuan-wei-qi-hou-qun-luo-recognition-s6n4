-- 新租地块先以试种身份建档：试种读数不参与群落拟合，仅用已生效模型做试判。
ALTER TABLE vine_block ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'trial'
    CHECK (lifecycle IN ('trial', 'official'));
-- 演示种子里的六块历史地块保持正式身份。
UPDATE vine_block SET lifecycle='official' WHERE lifecycle='trial';

CREATE TABLE IF NOT EXISTS trial_judgment (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id integer NOT NULL UNIQUE REFERENCES vine_block(id),
    baseline_run_id integer NOT NULL REFERENCES climate_run(id),
    window_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('current', 'expired', 'archived')),
    profile text NOT NULL CHECK (profile IN ('cool', 'balanced', 'warm')),
    confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    attempts integer NOT NULL DEFAULT 1,
    result jsonb NOT NULL,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    actor text NOT NULL REFERENCES account(username),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
