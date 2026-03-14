ALTER TABLE `plan_sessions`
	ADD COLUMN `capture_token` text NOT NULL DEFAULT '';

UPDATE `plan_sessions`
SET `capture_token` = lower(hex(randomblob(16)))
WHERE `capture_token` = '';

CREATE UNIQUE INDEX `plan_sessions_capture_token_idx`
	ON `plan_sessions` (`capture_token`);
