import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ── Users ──────────────────────────────────────────────────────────────────────
// Managed by Better Auth, but we reference them in our tables
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
