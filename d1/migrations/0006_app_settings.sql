-- Key/value overrides editable at runtime (e.g. from the admin MCP server),
-- without a wrangler deploy. A route reads its default from code/env first and
-- only consults this table for an override, so a missing row changes nothing.

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
