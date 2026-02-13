-- Add header_color column to notification_templates for customizable email header color
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS header_color TEXT DEFAULT '#0f172a';
