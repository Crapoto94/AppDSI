-- Oracle Synced Data Storage Tables

-- Table pour stocker les données synchro RH
CREATE TABLE IF NOT EXISTS oracle_sync_data_rh (
  id SERIAL PRIMARY KEY,
  sync_id INTEGER NOT NULL,
  data_json JSONB NOT NULL,
  row_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oracle_sync_rh FOREIGN KEY (sync_id)
    REFERENCES oracle_sync_logs(id) ON DELETE CASCADE
);

-- Table pour stocker les données synchro FINANCES
CREATE TABLE IF NOT EXISTS oracle_sync_data_finances (
  id SERIAL PRIMARY KEY,
  sync_id INTEGER NOT NULL,
  data_json JSONB NOT NULL,
  row_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oracle_sync_finances FOREIGN KEY (sync_id)
    REFERENCES oracle_sync_logs(id) ON DELETE CASCADE
);

-- Indexes pour les recherches
CREATE INDEX IF NOT EXISTS idx_oracle_sync_data_rh_sync_id ON oracle_sync_data_rh(sync_id);
CREATE INDEX IF NOT EXISTS idx_oracle_sync_data_finances_sync_id ON oracle_sync_data_finances(sync_id);
CREATE INDEX IF NOT EXISTS idx_oracle_sync_data_rh_created ON oracle_sync_data_rh(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_sync_data_finances_created ON oracle_sync_data_finances(created_at DESC);
