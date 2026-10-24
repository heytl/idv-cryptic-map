ALTER TABLE visits ADD COLUMN client TEXT NOT NULL DEFAULT 'web' CHECK (client IN ('web', 'wechat'));
