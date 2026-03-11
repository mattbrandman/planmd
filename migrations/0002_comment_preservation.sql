-- Comment preservation across revisions
ALTER TABLE `comments` ADD COLUMN `original_comment_id` text;
ALTER TABLE `comments` ADD COLUMN `original_revision_id` text;
ALTER TABLE `comments` ADD COLUMN `outdated` integer DEFAULT 0 NOT NULL;
ALTER TABLE `comments` ADD COLUMN `context_snapshot` text;
-- Suggestion comments (collaborative editing)
ALTER TABLE `comments` ADD COLUMN `suggestion_type` text;
ALTER TABLE `comments` ADD COLUMN `suggestion_content` text;
ALTER TABLE `comments` ADD COLUMN `suggestion_applied` integer DEFAULT 0 NOT NULL;
