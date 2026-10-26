-- Extend the existing user table with Better Auth's required core fields.
ALTER TABLE "users"
ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "image" TEXT;

-- Store credentials separately from user/profile data, as required by Better Auth.
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");
CREATE UNIQUE INDEX "auth_accounts_provider_id_account_id_key"
ON "auth_accounts"("provider_id", "account_id");

ALTER TABLE "auth_accounts"
ADD CONSTRAINT "auth_accounts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every existing seed password hash while moving it to the credential account.
INSERT INTO "auth_accounts" (
    "id",
    "account_id",
    "provider_id",
    "user_id",
    "password",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "id"::text,
    'credential',
    "id",
    "password_hash",
    "created_at",
    "updated_at"
FROM "users";

ALTER TABLE "users" DROP COLUMN "password_hash";

-- Adapt the pre-created session table to Better Auth's server-side session model.
DROP INDEX "auth_sessions_expires_at_revoked_at_idx";
DROP INDEX "auth_sessions_token_hash_key";

ALTER TABLE "auth_sessions" RENAME COLUMN "token_hash" TO "token";

ALTER TABLE "auth_sessions"
DROP COLUMN "last_seen_at",
DROP COLUMN "revoked_at",
ADD COLUMN "ip_address" TEXT,
ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "user_agent" TEXT;

ALTER TABLE "auth_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

CREATE TABLE "auth_verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_verifications_identifier_idx"
ON "auth_verifications"("identifier");

CREATE TABLE "auth_rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_rate_limits_key_key" ON "auth_rate_limits"("key");
