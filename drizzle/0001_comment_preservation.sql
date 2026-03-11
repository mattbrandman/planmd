-- Comment preservation across revisions
ALTER TABLE `comments` ADD COLUMN `original_comment_id` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `original_revision_id` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `outdated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `context_snapshot` text;
--> statement-breakpoint
-- Suggestion comments (collaborative editing)
ALTER TABLE `comments` ADD COLUMN `suggestion_type` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `suggestion_content` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `suggestion_applied` integer DEFAULT 0 NOT NULL;
