-- Migration number: 0001 	 2026-03-11T06:16:57.057Z
-- Better Auth tables
CREATE TABLE IF NOT EXISTS `user` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL,
  `email_verified` INTEGER NOT NULL DEFAULT 0,
  `image` TEXT,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `session` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `expires_at` INTEGER NOT NULL,
  `token` TEXT NOT NULL UNIQUE,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS `account` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `account_id` TEXT NOT NULL,
  `provider_id` TEXT NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `access_token` TEXT,
  `refresh_token` TEXT,
  `id_token` TEXT,
  `access_token_expires_at` INTEGER,
  `refresh_token_expires_at` INTEGER,
  `scope` TEXT,
  `password` TEXT,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `verification` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `identifier` TEXT NOT NULL,
  `value` TEXT NOT NULL,
  `expires_at` INTEGER NOT NULL,
  `created_at` INTEGER,
  `updated_at` INTEGER
);

-- planmd tables
CREATE TABLE IF NOT EXISTS `plans` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `title` TEXT NOT NULL,
  `description` TEXT,
  `status` TEXT NOT NULL DEFAULT 'draft',
  `author_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `github_url` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `revisions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `plan_id` TEXT NOT NULL REFERENCES `plans`(`id`) ON DELETE CASCADE,
  `revision_number` INTEGER NOT NULL,
  `content` TEXT NOT NULL,
  `summary` TEXT,
  `author_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `comments` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `plan_id` TEXT NOT NULL REFERENCES `plans`(`id`) ON DELETE CASCADE,
  `revision_id` TEXT NOT NULL REFERENCES `revisions`(`id`) ON DELETE CASCADE,
  `author_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `section_id` TEXT,
  `parent_id` TEXT,
  `body` TEXT NOT NULL,
  `resolved` INTEGER NOT NULL DEFAULT 0,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch()),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS `reviews` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `plan_id` TEXT NOT NULL REFERENCES `plans`(`id`) ON DELETE CASCADE,
  `revision_id` TEXT NOT NULL REFERENCES `revisions`(`id`) ON DELETE CASCADE,
  `reviewer_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `status` TEXT NOT NULL,
  `body` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS `reviews_unique_reviewer_revision`
  ON `reviews`(`revision_id`, `reviewer_id`);

CREATE TABLE IF NOT EXISTS `participants` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `plan_id` TEXT NOT NULL REFERENCES `plans`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `user`(`id`),
  `role` TEXT NOT NULL DEFAULT 'observer',
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS `participants_unique_plan_user`
  ON `participants`(`plan_id`, `user_id`);
