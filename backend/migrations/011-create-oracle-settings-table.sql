-- Oracle Settings for RH and FINANCES bases
CREATE TABLE IF NOT EXISTS oracle_settings (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL UNIQUE, -- 'RH' or 'FINANCES'
  is_enabled BOOLEAN DEFAULT FALSE,
  host VARCHAR(255),
  port INTEGER,
  service_name VARCHAR(255),
  username VARCHAR(255),
  password VARCHAR(255),
  sync_config_json JSONB DEFAULT '{}', -- Configuration for selected tables and fields
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Oracle table mappings (which tables to sync)
CREATE TABLE IF NOT EXISTS oracle_table_mappings (
  id SERIAL PRIMARY KEY,
  oracle_settings_id INTEGER NOT NULL REFERENCES oracle_settings(id) ON DELETE CASCADE,
  table_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(oracle_settings_id, table_name)
);

-- Oracle field mappings (which fields from each table to sync)
CREATE TABLE IF NOT EXISTS oracle_field_mappings (
  id SERIAL PRIMARY KEY,
  table_mapping_id INTEGER NOT NULL REFERENCES oracle_table_mappings(id) ON DELETE CASCADE,
  source_field VARCHAR(255) NOT NULL,
  target_field VARCHAR(255),
  data_type VARCHAR(50),
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(table_mapping_id, source_field)
);

-- Oracle jointure configurations (for joining tables)
CREATE TABLE IF NOT EXISTS oracle_jointures (
  id SERIAL PRIMARY KEY,
  oracle_settings_id INTEGER NOT NULL REFERENCES oracle_settings(id) ON DELETE CASCADE,
  from_table VARCHAR(255) NOT NULL,
  to_table VARCHAR(255) NOT NULL,
  from_column VARCHAR(255) NOT NULL,
  to_column VARCHAR(255) NOT NULL,
  jointure_type VARCHAR(50) DEFAULT 'INNER', -- INNER, LEFT, RIGHT, FULL
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_oracle_settings_type ON oracle_settings(type);
CREATE INDEX IF NOT EXISTS idx_oracle_table_mappings_settings ON oracle_table_mappings(oracle_settings_id);
CREATE INDEX IF NOT EXISTS idx_oracle_field_mappings_table ON oracle_field_mappings(table_mapping_id);
CREATE INDEX IF NOT EXISTS idx_oracle_jointures_settings ON oracle_jointures(oracle_settings_id);

-- Insert default oracle settings (disabled initially)
INSERT INTO oracle_settings (type, is_enabled) VALUES ('RH', FALSE)
ON CONFLICT (type) DO NOTHING;
INSERT INTO oracle_settings (type, is_enabled) VALUES ('FINANCES', FALSE)
ON CONFLICT (type) DO NOTHING;
