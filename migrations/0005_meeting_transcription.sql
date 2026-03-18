ALTER TABLE `plan_sessions`
	ADD COLUMN `meeting_url` text;

ALTER TABLE `plan_sessions`
	ADD COLUMN `audio_capture_status` text DEFAULT 'inactive';

CREATE TABLE `transcription_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`audio_duration_ms` integer NOT NULL,
	`speaker_hints` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`transcript_text` text,
	`transcript_chunk_id` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transcript_chunk_id`) REFERENCES `transcript_chunks`(`id`) ON UPDATE no action ON DELETE no action
);
