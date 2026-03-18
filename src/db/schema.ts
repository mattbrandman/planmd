import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ── Users ──────────────────────────────────────────────────────────────────────
// Synced from Clerk on auth; referenced by plans, comments, reviews, etc.
export const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
});

export const accounts = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: integer("access_token_expires_at", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refresh_token_expires_at", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }),
	updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ── Plans ──────────────────────────────────────────────────────────────────────
export const plans = sqliteTable("plans", {
	id: text("id").primaryKey(), // nanoid
	title: text("title").notNull(),
	description: text("description"), // short summary
	status: text("status", {
		enum: ["draft", "review", "approved", "implemented"],
	})
		.notNull()
		.default("draft"),
	authorId: text("author_id")
		.notNull()
		.references(() => users.id),
	githubUrl: text("github_url"), // optional link to source repo
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// ── Revisions ──────────────────────────────────────────────────────────────────
// Each revision stores the full markdown content at that point in time
export const revisions = sqliteTable("revisions", {
	id: text("id").primaryKey(), // nanoid
	planId: text("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	revisionNumber: integer("revision_number").notNull(), // 1, 2, 3...
	content: text("content").notNull(), // full markdown
	summary: text("summary"), // optional changelog for this revision
	authorId: text("author_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// ── Comments ───────────────────────────────────────────────────────────────────
// Inline comments anchored to a markdown section heading or line range
export const comments = sqliteTable("comments", {
	id: text("id").primaryKey(), // nanoid
	planId: text("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	revisionId: text("revision_id")
		.notNull()
		.references(() => revisions.id, { onDelete: "cascade" }),
	authorId: text("author_id")
		.notNull()
		.references(() => users.id),
	// Section anchoring: heading slug (e.g., "api-design") or null for top-level
	sectionId: text("section_id"),
	// Line-level anchoring: null means section-level comment
	startLine: integer("start_line"), // 1-based line number
	endLine: integer("end_line"), // null means single line (use startLine)
	// Threading: null for top-level comments, parent ID for replies
	parentId: text("parent_id"),
	body: text("body").notNull(), // markdown content
	resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
	// Carry-forward provenance
	originalCommentId: text("original_comment_id"), // first-ever version of this comment (NULL if fresh)
	originalRevisionId: text("original_revision_id"), // revision where comment was first written (NULL if fresh)
	outdated: integer("outdated", { mode: "boolean" }).notNull().default(false),
	contextSnapshot: text("context_snapshot"), // JSON: original lines + surrounding context
	// Suggestion comments (collaborative editing)
	suggestionType: text("suggestion_type", {
		enum: ["replace", "insert_after"],
	}),
	suggestionContent: text("suggestion_content"), // proposed replacement text
	suggestionApplied: integer("suggestion_applied", { mode: "boolean" })
		.notNull()
		.default(false),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
});

// ── Reviews ────────────────────────────────────────────────────────────────────
// Each reviewer submits one review per revision (approve / request changes)
export const reviews = sqliteTable(
	"reviews",
	{
		id: text("id").primaryKey(), // nanoid
		planId: text("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		revisionId: text("revision_id")
			.notNull()
			.references(() => revisions.id, { onDelete: "cascade" }),
		reviewerId: text("reviewer_id")
			.notNull()
			.references(() => users.id),
		status: text("status", {
			enum: ["approved", "changes_requested"],
		}).notNull(),
		body: text("body"), // optional review comment
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		uniqueIndex("reviews_unique_reviewer_revision").on(
			table.revisionId,
			table.reviewerId,
		),
	],
);

// ── Participants ───────────────────────────────────────────────────────────────
// Who's involved in a plan and what's their role
export const participants = sqliteTable(
	"participants",
	{
		id: text("id").primaryKey(), // nanoid
		planId: text("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		role: text("role", {
			enum: ["author", "reviewer", "observer"],
		})
			.notNull()
			.default("observer"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(table) => [
		uniqueIndex("participants_unique_plan_user").on(table.planId, table.userId),
	],
);

// ── Live Sessions ──────────────────────────────────────────────────────────────
// Private collaboration sessions that collect transcript and semantic repo context
export const planSessions = sqliteTable(
	"plan_sessions",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["live", "ended"],
		})
			.notNull()
			.default("live"),
		meetingProvider: text("meeting_provider", {
			enum: ["google_meet", "manual"],
		})
			.notNull()
			.default("google_meet"),
		title: text("title"),
		captureToken: text("capture_token").notNull(),
		meetingUrl: text("meeting_url"),
		audioCaptureStatus: text("audio_capture_status", {
			enum: ["inactive", "capturing", "paused", "error"],
		}).default("inactive"),
		createdBy: text("created_by")
			.notNull()
			.references(() => users.id),
		startedAt: integer("started_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		endedAt: integer("ended_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
	},
	(table) => [
		uniqueIndex("plan_sessions_capture_token_idx").on(table.captureToken),
	],
);

export const transcriptChunks = sqliteTable("transcript_chunks", {
	id: text("id").primaryKey(),
	sessionId: text("session_id")
		.notNull()
		.references(() => planSessions.id, { onDelete: "cascade" }),
	speakerName: text("speaker_name"),
	text: text("text").notNull(),
	occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
	source: text("source", {
		enum: ["manual_note", "live_caption", "bot"],
	})
		.notNull()
		.default("manual_note"),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const transcriptionJobs = sqliteTable("transcription_jobs", {
	id: text("id").primaryKey(),
	sessionId: text("session_id")
		.notNull()
		.references(() => planSessions.id, { onDelete: "cascade" }),
	chunkIndex: integer("chunk_index").notNull(),
	audioDurationMs: integer("audio_duration_ms").notNull(),
	speakerHints: text("speaker_hints"), // JSON array of speaker names
	status: text("status", {
		enum: ["pending", "processing", "completed", "failed"],
	})
		.notNull()
		.default("pending"),
	transcriptText: text("transcript_text"),
	transcriptChunkId: text("transcript_chunk_id").references(
		() => transcriptChunks.id,
	),
	errorMessage: text("error_message"),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const contextEvents = sqliteTable("context_events", {
	id: text("id").primaryKey(),
	sessionId: text("session_id")
		.notNull()
		.references(() => planSessions.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: ["page_view", "selection", "highlight", "section_focus", "note"],
	}).notNull(),
	pageUrl: text("page_url"),
	repo: text("repo"),
	ref: text("ref"),
	path: text("path"),
	visibleStartLine: integer("visible_start_line"),
	visibleEndLine: integer("visible_end_line"),
	selectedText: text("selected_text"),
	selectedStartLine: integer("selected_start_line"),
	selectedEndLine: integer("selected_end_line"),
	activeSection: text("active_section"),
	payload: text("payload"),
	occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

export const attentionItems = sqliteTable("attention_items", {
	id: text("id").primaryKey(),
	sessionId: text("session_id")
		.notNull()
		.references(() => planSessions.id, { onDelete: "cascade" }),
	kind: text("kind", {
		enum: ["missing_decision", "risk", "contradiction", "follow_up"],
	}).notNull(),
	severity: text("severity", {
		enum: ["low", "medium", "high"],
	})
		.notNull()
		.default("medium"),
	anchorType: text("anchor_type", {
		enum: ["section", "line_range", "event", "none"],
	})
		.notNull()
		.default("none"),
	anchorId: text("anchor_id"),
	summary: text("summary").notNull(),
	evidenceRefs: text("evidence_refs"),
	state: text("state", {
		enum: ["open", "accepted", "dismissed"],
	})
		.notNull()
		.default("open"),
	occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
});

// ── Handoff Snapshots ──────────────────────────────────────────────────────────
// Immutable public contracts derived from a revision plus selected session evidence
export const handoffSnapshots = sqliteTable(
	"handoff_snapshots",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		revisionId: text("revision_id")
			.notNull()
			.references(() => revisions.id, { onDelete: "cascade" }),
		status: text("status", {
			enum: ["published"],
		})
			.notNull()
			.default("published"),
		publicSlug: text("public_slug").notNull(),
		callbackToken: text("callback_token").notNull(),
		sessionIds: text("session_ids").notNull(), // JSON array of session IDs
		markdownContent: text("markdown_content").notNull(),
		jsonContent: text("json_content").notNull(),
		publishedAt: integer("published_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		createdBy: text("created_by")
			.notNull()
			.references(() => users.id),
	},
	(table) => [
		uniqueIndex("handoff_snapshots_public_slug_idx").on(table.publicSlug),
		uniqueIndex("handoff_snapshots_callback_token_idx").on(table.callbackToken),
	],
);

export const agentRuns = sqliteTable(
	"agent_runs",
	{
		id: text("id").primaryKey(),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => handoffSnapshots.id, { onDelete: "cascade" }),
		agentName: text("agent_name").notNull(),
		externalRunId: text("external_run_id").notNull(),
		status: text("status", {
			enum: ["queued", "running", "completed", "failed", "cancelled"],
		}).notNull(),
		prUrl: text("pr_url"),
		branch: text("branch"),
		testSummary: text("test_summary"),
		artifactUrl: text("artifact_url"),
		suggestedPlanDelta: text("suggested_plan_delta"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.default(sql`(unixepoch() * 1000)`),
	},
	(table) => [
		uniqueIndex("agent_runs_snapshot_external_idx").on(
			table.snapshotId,
			table.externalRunId,
		),
	],
);

// ── Regeneration Requests ───────────────────────────────────────────────────
// AI-assisted plan section regeneration triggered during live sessions
export const regenerationRequests = sqliteTable("regeneration_requests", {
	id: text("id").primaryKey(),
	sessionId: text("session_id")
		.notNull()
		.references(() => planSessions.id, { onDelete: "cascade" }),
	planId: text("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	revisionId: text("revision_id")
		.notNull()
		.references(() => revisions.id, { onDelete: "cascade" }),
	contextEventId: text("context_event_id").references(() => contextEvents.id),
	transcriptChunkId: text("transcript_chunk_id").references(
		() => transcriptChunks.id,
	),
	targetSection: text("target_section"),
	targetStartLine: integer("target_start_line"),
	targetEndLine: integer("target_end_line"),
	highlightedText: text("highlighted_text"),
	userInstruction: text("user_instruction").notNull(),
	transcriptWindowStart: integer("transcript_window_start"),
	transcriptWindowEnd: integer("transcript_window_end"),
	status: text("status", {
		enum: ["detected", "generating", "ready", "accepted", "dismissed"],
	})
		.notNull()
		.default("detected"),
	generatedContent: text("generated_content"),
	originalContent: text("original_content"),
	applied: integer("applied", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	completedAt: integer("completed_at", { mode: "timestamp_ms" }),
	createdBy: text("created_by")
		.notNull()
		.references(() => users.id),
});
