CREATE TABLE `plan_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'live' NOT NULL,
	`meeting_provider` text DEFAULT 'google_meet' NOT NULL,
	`title` text,
	`created_by` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `transcript_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`speaker_name` text,
	`text` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text DEFAULT 'manual_note' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `context_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`page_url` text,
	`repo` text,
	`ref` text,
	`path` text,
	`visible_start_line` integer,
	`visible_end_line` integer,
	`selected_text` text,
	`selected_start_line` integer,
	`selected_end_line` integer,
	`active_section` text,
	`payload` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `attention_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`anchor_type` text DEFAULT 'none' NOT NULL,
	`anchor_id` text,
	`summary` text NOT NULL,
	`evidence_refs` text,
	`state` text DEFAULT 'open' NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `handoff_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`public_slug` text NOT NULL,
	`callback_token` text NOT NULL,
	`session_ids` text NOT NULL,
	`markdown_content` text NOT NULL,
	`json_content` text NOT NULL,
	`published_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `handoff_snapshots_public_slug_idx`
	ON `handoff_snapshots` (`public_slug`);

CREATE UNIQUE INDEX `handoff_snapshots_callback_token_idx`
	ON `handoff_snapshots` (`callback_token`);

CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`external_run_id` text NOT NULL,
	`status` text NOT NULL,
	`pr_url` text,
	`branch` text,
	`test_summary` text,
	`artifact_url` text,
	`suggested_plan_delta` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `handoff_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `agent_runs_snapshot_external_idx`
	ON `agent_runs` (`snapshot_id`, `external_run_id`);
