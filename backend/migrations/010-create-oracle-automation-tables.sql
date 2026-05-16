-- Oracle Automation Configuration
CREATE TABLE IF NOT EXISTS oracle_automation_config (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL UNIQUE, -- 'RH' or 'FINANCES'
  enabled BOOLEAN DEFAULT FALSE,
  frequency VARCHAR(50) DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'monthly'
  last_sync_at TIMESTAMP,
  next_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Oracle Synchronization Logs
CREATE TABLE IF NOT EXISTS oracle_sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50) NOT NULL, -- 'RH' or 'FINANCES'
  status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'running'
  records_synced INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_oracle_sync_logs_type ON oracle_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_oracle_sync_logs_started_at ON oracle_sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_sync_logs_status ON oracle_sync_logs(status);

-- Insert default configs
INSERT INTO oracle_automation_config (sync_type, enabled, frequency) VALUES ('RH', FALSE, 'daily');
INSERT INTO oracle_automation_config (sync_type, enabled, frequency) VALUES ('FINANCES', FALSE, 'daily');
