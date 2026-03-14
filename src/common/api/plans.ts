import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "#/common/lib/auth-guard";
import {
	extractContextSnapshot,
	findLinesInNewContent,
	isSectionChanged,
} from "#/common/lib/diff";
import { newId } from "#/common/lib/id";
import { parseSections } from "#/common/lib/markdown";
import { getDb } from "#/db";
import {
	comments,
	participants,
	plans,
	reviews,
	revisions,
	users,
} from "#/db/schema";

// ── List plans for current user ────────────────────────────────────────────────
export const getMyPlans = createServerFn({ method: "GET" }).handler(
	async () => {
		const user = await requireAuth();

		// Plans where user is author
		const authored = await getDb(env.planmd_db)
			.select()
			.from(plans)
			.where(eq(plans.authorId, user.id))
			.orderBy(desc(plans.updatedAt));

		// Plans where user is a participant (reviewer/observer)
		const participating = await getDb(env.planmd_db)
			.select({ plan: plans, role: participants.role })
			.from(participants)
			.innerJoin(plans, eq(participants.planId, plans.id))
			.where(eq(participants.userId, user.id))
			.orderBy(desc(plans.updatedAt));

		return {
			authored,
			reviewing: participating.filter((p) => p.role === "reviewer"),
			observing: participating.filter((p) => p.role === "observer"),
		};
	},
);

// ── Get a single plan with latest revision + metadata ──────────────────────────
export const getPlan = createServerFn({ method: "GET" })
	.inputValidator(z.object({ planId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth();

		const plan = await getDb(env.planmd_db).query.plans.findFirst({
			where: eq(plans.id, data.planId),
		});

		if (!plan) {
			throw new Error("Plan not found");
		}

		const allRevisions = await getDb(env.planmd_db)
			.select()
			.from(revisions)
			.where(eq(revisions.planId, data.planId))
			.orderBy(desc(revisions.revisionNumber));

		const latestRevision = allRevisions[0] ?? null;

		const planParticipants = await getDb(env.planmd_db)
			.select()
			.from(participants)
			.where(eq(participants.planId, data.planId));

		const planReviews = latestRevision
			? await getDb(env.planmd_db)
					.select()
					.from(reviews)
					.where(eq(reviews.revisionId, latestRevision.id))
			: [];

		const planComments = latestRevision
			? await getDb(env.planmd_db)
					.select()
					.from(comments)
					.where(eq(comments.revisionId, latestRevision.id))
					.orderBy(comments.createdAt)
			: [];

		return {
			plan,
			revisions: allRevisions,
			latestRevision,
			participants: planParticipants,
			reviews: planReviews,
			comments: planComments,
		};
	});

// ── Create a new plan ──────────────────────────────────────────────────────────
export const createPlan = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			title: z.string().min(1).max(200),
			description: z.string().max(500).optional(),
			content: z.string().min(1),
			githubUrl: z.string().url().optional().or(z.literal("")),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const planId = newId();
		const revisionId = newId();

		await getDb(env.planmd_db)
			.insert(plans)
			.values({
				id: planId,
				title: data.title,
				description: data.description || null,
				authorId: user.id,
				githubUrl: data.githubUrl || null,
				status: "draft",
			});

		await getDb(env.planmd_db).insert(revisions).values({
			id: revisionId,
			planId,
			revisionNumber: 1,
			content: data.content,
			summary: "Initial version",
			authorId: user.id,
		});

		// Author is automatically a participant
		await getDb(env.planmd_db).insert(participants).values({
			id: newId(),
			planId,
			userId: user.id,
			role: "author",
		});

		return { planId };
	});

// ── Update plan status ─────────────────────────────────────────────────────────
export const updatePlanStatus = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			status: z.enum(["draft", "review", "approved", "implemented"]),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const plan = await getDb(env.planmd_db).query.plans.findFirst({
			where: eq(plans.id, data.planId),
		});

		if (!plan) throw new Error("Plan not found");
		if (plan.authorId !== user.id)
			throw new Error("Only the author can change plan status");

		await getDb(env.planmd_db)
			.update(plans)
			.set({ status: data.status, updatedAt: new Date() })
			.where(eq(plans.id, data.planId));

		return { success: true };
	});

// ── Update plan metadata ────────────────────────────────────────────────────────
export const updatePlan = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			title: z.string().min(1).max(200).optional(),
			description: z.string().max(500).optional().nullable(),
			githubUrl: z.string().url().optional().nullable().or(z.literal("")),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const plan = await getDb(env.planmd_db).query.plans.findFirst({
			where: eq(plans.id, data.planId),
		});

		if (!plan) throw new Error("Plan not found");
		if (plan.authorId !== user.id)
			throw new Error("Only the author can update the plan");

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (data.title !== undefined) updates.title = data.title;
		if (data.description !== undefined)
			updates.description = data.description || null;
		if (data.githubUrl !== undefined)
			updates.githubUrl = data.githubUrl || null;

		await getDb(env.planmd_db)
			.update(plans)
			.set(updates)
			.where(eq(plans.id, data.planId));

		return { success: true };
	});

// ── Add a new revision ─────────────────────────────────────────────────────────
export const createRevision = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			content: z.string().min(1),
			summary: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();
		const db = getDb(env.planmd_db);

		const plan = await db.query.plans.findFirst({
			where: eq(plans.id, data.planId),
		});
		if (!plan) throw new Error("Plan not found");
		if (plan.authorId !== user.id)
			throw new Error("Only the author can add revisions");

		// Get the previous (latest) revision
		const latest = await db
			.select()
			.from(revisions)
			.where(eq(revisions.planId, data.planId))
			.orderBy(desc(revisions.revisionNumber))
			.limit(1);

		const prevRevision = latest[0] ?? null;
		const nextNumber = (prevRevision?.revisionNumber ?? 0) + 1;
		const revisionId = newId();

		await db.insert(revisions).values({
			id: revisionId,
			planId: data.planId,
			revisionNumber: nextNumber,
			content: data.content,
			summary: data.summary || null,
			authorId: user.id,
		});

		// ── Carry forward unresolved comments ──────────────────────────
		if (prevRevision) {
			await carryForwardComments(
				db,
				data.planId,
				prevRevision.id,
				revisionId,
				prevRevision.content,
				data.content,
			);
		}

		await db
			.update(plans)
			.set({ updatedAt: new Date() })
			.where(eq(plans.id, data.planId));

		return { revisionId, revisionNumber: nextNumber };
	});

// ── Add a comment ──────────────────────────────────────────────────────────────
export const addComment = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			revisionId: z.string(),
			sectionId: z.string().nullable(),
			startLine: z.number().nullable().optional(),
			endLine: z.number().nullable().optional(),
			parentId: z.string().nullable(),
			body: z.string().min(1),
			suggestionType: z.enum(["replace", "insert_after"]).nullable().optional(),
			suggestionContent: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const commentId = newId();
		await getDb(env.planmd_db)
			.insert(comments)
			.values({
				id: commentId,
				planId: data.planId,
				revisionId: data.revisionId,
				authorId: user.id,
				sectionId: data.sectionId,
				startLine: data.startLine ?? null,
				endLine: data.endLine ?? null,
				parentId: data.parentId,
				body: data.body,
				suggestionType: data.suggestionType ?? null,
				suggestionContent: data.suggestionContent ?? null,
			});

		return { commentId };
	});

// ── Resolve/unresolve a comment thread ─────────────────────────────────────────
export const toggleCommentResolved = createServerFn({ method: "POST" })
	.inputValidator(z.object({ commentId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth();

		const comment = await getDb(env.planmd_db).query.comments.findFirst({
			where: eq(comments.id, data.commentId),
		});

		if (!comment) throw new Error("Comment not found");

		await getDb(env.planmd_db)
			.update(comments)
			.set({ resolved: !comment.resolved, updatedAt: new Date() })
			.where(eq(comments.id, data.commentId));

		return { resolved: !comment.resolved };
	});

// ── Submit a review ────────────────────────────────────────────────────────────
export const submitReview = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			revisionId: z.string(),
			status: z.enum(["approved", "changes_requested"]),
			body: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const reviewId = newId();

		// Upsert: delete existing review for this revision + reviewer, then insert
		await getDb(env.planmd_db)
			.delete(reviews)
			.where(
				and(
					eq(reviews.revisionId, data.revisionId),
					eq(reviews.reviewerId, user.id),
				),
			);

		await getDb(env.planmd_db)
			.insert(reviews)
			.values({
				id: reviewId,
				planId: data.planId,
				revisionId: data.revisionId,
				reviewerId: user.id,
				status: data.status,
				body: data.body || null,
			});

		return { reviewId };
	});

// ── Add participant ────────────────────────────────────────────────────────────
export const addParticipant = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			userId: z.string(),
			role: z.enum(["reviewer", "observer"]),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireAuth();

		const plan = await getDb(env.planmd_db).query.plans.findFirst({
			where: eq(plans.id, data.planId),
		});
		if (!plan) throw new Error("Plan not found");
		if (plan.authorId !== user.id)
			throw new Error("Only the author can add participants");

		const participantId = newId();
		await getDb(env.planmd_db)
			.insert(participants)
			.values({
				id: participantId,
				planId: data.planId,
				userId: data.userId,
				role: data.role,
			})
			.onConflictDoUpdate({
				target: [participants.planId, participants.userId],
				set: { role: data.role },
			});

		return { participantId };
	});

// ── Get revision by ID ─────────────────────────────────────────────────────────
export const getRevision = createServerFn({ method: "GET" })
	.inputValidator(z.object({ revisionId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth();

		const revision = await getDb(env.planmd_db).query.revisions.findFirst({
			where: eq(revisions.id, data.revisionId),
		});
		if (!revision) throw new Error("Revision not found");
		return revision;
	});

// ── Get comments for a revision ────────────────────────────────────────────────
export const getComments = createServerFn({ method: "GET" })
	.inputValidator(z.object({ revisionId: z.string() }))
	.handler(async ({ data }) => {
		await requireAuth();

		return getDb(env.planmd_db)
			.select()
			.from(comments)
			.where(eq(comments.revisionId, data.revisionId))
			.orderBy(comments.createdAt);
	});

// ── Apply a suggestion ────────────────────────────────────────────────────────
export const applySuggestion = createServerFn({ method: "POST" })
	.inputValidator(z.object({ commentId: z.string() }))
	.handler(async ({ data }) => {
		const user = await requireAuth();
		const db = getDb(env.planmd_db);

		const comment = await db.query.comments.findFirst({
			where: eq(comments.id, data.commentId),
		});
		if (!comment) throw new Error("Comment not found");
		if (!comment.suggestionType || !comment.suggestionContent)
			throw new Error("Not a suggestion comment");
		if (comment.suggestionApplied) throw new Error("Already applied");
		if (comment.outdated) throw new Error("Suggestion is outdated");

		// Verify caller is plan author
		const plan = await db.query.plans.findFirst({
			where: eq(plans.id, comment.planId),
		});
		if (!plan) throw new Error("Plan not found");
		if (plan.authorId !== user.id)
			throw new Error("Only the author can apply suggestions");

		// Get latest revision
		const latestArr = await db
			.select()
			.from(revisions)
			.where(eq(revisions.planId, comment.planId))
			.orderBy(desc(revisions.revisionNumber))
			.limit(1);
		const latestRevision = latestArr[0];
		if (!latestRevision) throw new Error("No revision found");

		// Verify target lines still match
		if (comment.startLine == null)
			throw new Error("Suggestion must target specific lines");
		const contentLines = latestRevision.content.split("\n");
		const endLine = comment.endLine ?? comment.startLine;

		// Apply the replacement
		const newLines = [
			...contentLines.slice(0, comment.startLine - 1),
			...comment.suggestionContent.split("\n"),
			...contentLines.slice(endLine),
		];
		const newContent = newLines.join("\n");

		// Mark suggestion as applied
		await db
			.update(comments)
			.set({ suggestionApplied: true, updatedAt: new Date() })
			.where(eq(comments.id, data.commentId));

		// Look up suggestion author name for summary
		const suggestionAuthor = await db.query.users.findFirst({
			where: eq(users.id, comment.authorId),
		});

		// Create a new revision (which triggers carry-forward)
		const nextNumArr = await db
			.select({ maxNum: revisions.revisionNumber })
			.from(revisions)
			.where(eq(revisions.planId, comment.planId))
			.orderBy(desc(revisions.revisionNumber))
			.limit(1);
		const nextNumber = (nextNumArr[0]?.maxNum ?? 0) + 1;
		const revisionId = newId();

		await db.insert(revisions).values({
			id: revisionId,
			planId: comment.planId,
			revisionNumber: nextNumber,
			content: newContent,
			summary: `Applied suggestion from ${suggestionAuthor?.name ?? comment.authorId.slice(0, 8)}`,
			authorId: user.id,
		});

		// Carry forward comments (applied suggestion won't carry since we marked it applied)
		await carryForwardComments(
			db,
			comment.planId,
			latestRevision.id,
			revisionId,
			latestRevision.content,
			newContent,
		);

		await db
			.update(plans)
			.set({ updatedAt: new Date() })
			.where(eq(plans.id, comment.planId));

		return { revisionId, revisionNumber: nextNumber };
	});

// ── Carry-forward logic (internal) ───────────────────────────────────────────

type DbInstance = ReturnType<typeof getDb>;

async function carryForwardComments(
	db: DbInstance,
	planId: string,
	prevRevisionId: string,
	newRevisionId: string,
	oldContent: string,
	newContent: string,
) {
	// Fetch all unresolved, non-applied top-level comments from previous revision
	const topLevelComments = await db
		.select()
		.from(comments)
		.where(
			and(
				eq(comments.revisionId, prevRevisionId),
				eq(comments.resolved, false),
				eq(comments.suggestionApplied, false),
				isNull(comments.parentId),
			),
		)
		.orderBy(comments.createdAt);

	if (topLevelComments.length === 0) return;

	// Fetch all replies for this revision
	const allReplies = await db
		.select()
		.from(comments)
		.where(
			and(
				eq(comments.revisionId, prevRevisionId),
				eq(comments.resolved, false),
			),
		)
		.orderBy(comments.createdAt);

	const repliesByParent = new Map<string, typeof allReplies>();
	for (const reply of allReplies) {
		if (!reply.parentId) continue;
		const existing = repliesByParent.get(reply.parentId) ?? [];
		existing.push(reply);
		repliesByParent.set(reply.parentId, existing);
	}

	// Map old comment IDs to new ones
	const idMap = new Map<string, string>();

	for (const comment of topLevelComments) {
		// Determine if outdated and compute new line positions
		let outdated = false;
		let newStartLine = comment.startLine;
		let newEndLine = comment.endLine;
		let contextSnapshot: string | null = null;

		if (comment.startLine != null) {
			// Line-anchored comment
			const endLine = comment.endLine ?? comment.startLine;
			const position = findLinesInNewContent(
				oldContent,
				newContent,
				comment.startLine,
				endLine,
			);
			outdated = position.outdated;
			newStartLine = position.newStartLine;
			newEndLine = position.newEndLine;

			// Capture context snapshot from old content
			const snapshot = extractContextSnapshot(
				oldContent,
				comment.startLine,
				endLine,
			);
			contextSnapshot = JSON.stringify(snapshot);
		} else if (comment.sectionId) {
			// Section-anchored comment
			const newSections = parseSections(newContent);
			const sectionExists = newSections.some((s) => s.id === comment.sectionId);
			if (!sectionExists) {
				outdated = true;
			} else {
				outdated = isSectionChanged(oldContent, newContent, comment.sectionId);
			}

			// Capture section context from old content
			const oldSections = parseSections(oldContent);
			const oldSection = oldSections.find((s) => s.id === comment.sectionId);
			if (oldSection) {
				const snapshot = extractContextSnapshot(
					oldContent,
					oldSection.startLine,
					Math.min(oldSection.startLine + 4, oldSection.endLine - 1),
				);
				contextSnapshot = JSON.stringify(snapshot);
			}
		}

		const newCommentId = newId();
		idMap.set(comment.id, newCommentId);

		// The originalCommentId always points to the first-ever version
		const originalCommentId = comment.originalCommentId ?? comment.id;
		const originalRevisionId = comment.originalRevisionId ?? prevRevisionId;

		await db.insert(comments).values({
			id: newCommentId,
			planId,
			revisionId: newRevisionId,
			authorId: comment.authorId,
			sectionId: comment.sectionId,
			startLine: newStartLine,
			endLine: newEndLine,
			parentId: null,
			body: comment.body,
			resolved: false,
			originalCommentId,
			originalRevisionId,
			outdated,
			contextSnapshot,
			suggestionType: comment.suggestionType,
			suggestionContent: comment.suggestionContent,
			suggestionApplied: false,
		});

		// Carry replies
		const replies = repliesByParent.get(comment.id) ?? [];
		for (const reply of replies) {
			const newReplyId = newId();
			idMap.set(reply.id, newReplyId);

			await db.insert(comments).values({
				id: newReplyId,
				planId,
				revisionId: newRevisionId,
				authorId: reply.authorId,
				sectionId: reply.sectionId,
				startLine: newStartLine,
				endLine: newEndLine,
				parentId: newCommentId,
				body: reply.body,
				resolved: false,
				originalCommentId: reply.originalCommentId ?? reply.id,
				originalRevisionId: reply.originalRevisionId ?? prevRevisionId,
				outdated,
				contextSnapshot: null,
				suggestionType: null,
				suggestionContent: null,
				suggestionApplied: false,
			});
		}
	}
}
