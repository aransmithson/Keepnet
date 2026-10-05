-- Additive migration for the existing Keepnet production database.
-- Run `wrangler d1 migrations apply keepnet-db --remote` before deploying.
-- D1 records applied migration files, so this is applied only once.
-- Preserve the existing trusted owner role. Future registrations do not gain
-- administrator authority merely by choosing one of these email addresses.
UPDATE users SET is_admin = 1
WHERE LOWER(email) IN ('aransmithson@gmail.com', 'aransmithson@googlemail.com');
ALTER TABLE sessions ADD COLUMN is_confidential INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catches ADD COLUMN is_confidential INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catches ADD COLUMN images_json TEXT;
ALTER TABLE catches ADD COLUMN method TEXT;
ALTER TABLE catches ADD COLUMN updated_at TEXT;

-- Older APIs discarded confidentiality, so a legacy public row cannot prove
-- that its owner intended to publish it. Keep all journal records/reactions,
-- but reset visibility until the owner explicitly confirms sharing again.
-- New API writes require sharingConfirmed=true; stale open clients cannot
-- automatically restore the unsafe historical sharing state.
UPDATE sessions SET is_shared = 0;
UPDATE catches SET is_shared = 0;

CREATE TABLE IF NOT EXISTS catch_deletions (
  catch_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'lite',
  applied_coupon TEXT,
  expires_at TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  coupon_code TEXT NOT NULL,
  redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS trial_claims (
  user_id TEXT PRIMARY KEY,
  redeemed_at TEXT NOT NULL,
  claim_id TEXT
);
INSERT OR IGNORE INTO trial_claims (user_id, redeemed_at)
SELECT user_id, MIN(redeemed_at) FROM coupon_redemptions
WHERE user_id IS NOT NULL GROUP BY user_id;

CREATE TABLE IF NOT EXISTS catch_likes (
  id TEXT PRIMARY KEY,
  catch_id TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS catch_comments (
  id TEXT PRIMARY KEY,
  catch_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  is_premium INTEGER DEFAULT 1,
  comment TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS sessions_public ON sessions (is_shared, is_confidential, started_at);
CREATE INDEX IF NOT EXISTS catches_public ON catches (is_shared, is_confidential, caught_at);
CREATE INDEX IF NOT EXISTS catches_session ON catches (session_id);
CREATE INDEX IF NOT EXISTS comments_catch ON catch_comments (catch_id);
CREATE INDEX IF NOT EXISTS likes_catch_user ON catch_likes (catch_id, user_id);
