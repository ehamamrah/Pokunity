-- v1.1 logout: "log out everywhere" bumps the member's token version; every access token carries the
-- version it was issued with (`ver` claim) and is rejected once the member's version is higher.
-- Single-session logout uses a Redis jti denylist instead (no table needed).
ALTER TABLE users ADD COLUMN token_version int NOT NULL DEFAULT 0 CHECK (token_version >= 0);
