-- Replaces the n8n Google Sheet ("PhoneBuzz"). Every tab is stored here row by row with the
-- same column names, so the n8n workflow reads and writes the dashboard exactly like it did the sheet.
-- /api/n8n/sheet/<Tab> serves it; the typed tables (contacts, products, orders, ...) are kept in
-- step by lib/biz/sheet-sync.ts.
CREATE TABLE IF NOT EXISTS sheet_rows (
    id BIGSERIAL PRIMARY KEY,
    sheet TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sheet_rows_sheet ON sheet_rows(sheet, id);
CREATE INDEX IF NOT EXISTS idx_sheet_rows_data ON sheet_rows USING gin (data jsonb_path_ops);
ALTER TABLE sheet_rows ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
