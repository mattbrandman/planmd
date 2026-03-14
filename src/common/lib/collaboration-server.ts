import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
	buildHandoffPayload,
	createPublicSlug,
} from "#/common/lib/handoff";
import { requireAuth } from "#/common/lib/auth-guard";
import { newId } from "#/common/lib/id";
import { buildSessionDraft } from "#/common/lib/session-draft";
import { getDb } from "#/db";
import {
	agentRuns,
	attentionItems,
	contextEvents,
	handoffSnapshots,
	plans,
	planSessions,
	revisions,
	transcriptChunks,
} from "#/db/schema";

export interface SessionBundle {
	session: typeof planSessions.$inferSelect;
	transcriptChunks: Array<typeof transcriptChunks.$inferSelect>;
	contextEvents: Array<typeof contextEvents.$inferSelect>;
	attentionItems: Array<typeof attentionItems.$inferSelect>;
}

export async function getPlanWorkspaceData(planId: string) {
	const db = getDb(env.planmd_db);
	const latestRevision = await db.query.revisions.findFirst({
		where: eq(revisions.planId, planId),
		orderBy: desc(revisions.revisionNumber),
	});
	const sessions = await db
		.select()
		.from(planSessions)
		.where(eq(planSessions.planId, planId))
		.orderBy(desc(planSessions.startedAt));
	const sessionBundles = await getSessionBundlesByRows(sessions);

	const snapshotRows = await db
		.select()
		.from(handoffSnapshots)
		.where(eq(handoffSnapshots.planId, planId))
		.orderBy(desc(handoffSnapshots.publishedAt));
	const snapshotIds = snapshotRows.map((snapshot) => snapshot.id);
	const revisionIds = snapshotRows.map((snapshot) => snapshot.revisionId);
	const runs = snapshotIds.length
		? await db
				.select()
				.from(agentRuns)
				.where(inArray(agentRuns.snapshotId, snapshotIds))
				.orderBy(desc(agentRuns.updatedAt))
		: [];
	const snapshotRevisions = revisionIds.length
		? await db
				.select({
					id: revisions.id,
					revisionNumber: revisions.revisionNumber,
				})
				.from(revisions)
				.where(inArray(revisions.id, revisionIds))
		: [];
	const revisionNumberById = new Map(
		snapshotRevisions.map((revision) => [revision.id, revision.revisionNumber]),
	);

	return {
		sessions: sessionBundles,
		snapshots: snapshotRows.map((snapshot) => ({
			...snapshot,
			revisionNumber: revisionNumberById.get(snapshot.revisionId) ?? null,
			isStale:
				latestRevision != null &&
				(revisionNumberById.get(snapshot.revisionId) ?? 0) <
					latestRevision.revisionNumber,
			sessionIds: parseJsonArray(snapshot.sessionIds),
			agentRuns: runs.filter((run) => run.snapshotId === snapshot.id),
			fetchUrl: `/api/handoffs/${snapshot.id}`,
			writebackUrl: `/api/handoffs/${snapshot.id}/agent-runs`,
			publicUrl: `/handoff/${snapshot.publicSlug}`,
		})),
	};
}

export async function createPlanSession(args: {
	planId: string;
	title?: string;
	meetingProvider?: "google_meet" | "manual";
}) {
	const { user } = await ensurePlanViewer(args.planId);
	const db = getDb(env.planmd_db);
	const now = new Date();
	const sessionId = newId();

	await db.insert(planSessions).values({
		id: sessionId,
		planId: args.planId,
		title: args.title?.trim() || null,
		meetingProvider: args.meetingProvider ?? "google_meet",
		captureToken: newId(),
		status: "live",
		createdBy: user.id,
		startedAt: now,
		createdAt: now,
		updatedAt: now,
	});

	return { sessionId };
}

export async function stopPlanSession(sessionId: string) {
	const session = await ensureSessionViewer(sessionId);
	const now = new Date();

	await getDb(env.planmd_db)
		.update(planSessions)
		.set({
			status: "ended",
			endedAt: now,
			updatedAt: now,
		})
		.where(eq(planSessions.id, sessionId));

	return { sessionId: session.id, status: "ended" as const };
}

export async function createTranscriptChunk(args: {
	sessionId: string;
	speakerName?: string | null;
	text: string;
	occurredAt?: number;
	source?: "manual_note" | "live_caption" | "bot";
}) {
	await ensureSessionViewer(args.sessionId);
	const chunkId = newId();

	await getDb(env.planmd_db)
		.insert(transcriptChunks)
		.values({
			id: chunkId,
			sessionId: args.sessionId,
			speakerName: args.speakerName?.trim() || null,
			text: args.text.trim(),
			occurredAt: new Date(args.occurredAt ?? Date.now()),
			source: args.source ?? "manual_note",
			createdAt: new Date(),
		});

	return { chunkId };
}

export async function createContextEvent(args: {
	sessionId: string;
	kind: "page_view" | "selection" | "highlight" | "section_focus" | "note";
	pageUrl?: string | null;
	repo?: string | null;
	ref?: string | null;
	path?: string | null;
	visibleStartLine?: number | null;
	visibleEndLine?: number | null;
	selectedText?: string | null;
	selectedStartLine?: number | null;
	selectedEndLine?: number | null;
	activeSection?: string | null;
	payload?: string | null;
	occurredAt?: number;
}) {
	await ensureSessionViewer(args.sessionId);
	const eventId = newId();

	await getDb(env.planmd_db)
		.insert(contextEvents)
		.values({
			id: eventId,
			sessionId: args.sessionId,
			kind: args.kind,
			pageUrl: args.pageUrl || null,
			repo: args.repo?.trim() || null,
			ref: args.ref?.trim() || null,
			path: args.path?.trim() || null,
			visibleStartLine: args.visibleStartLine ?? null,
			visibleEndLine: args.visibleEndLine ?? null,
			selectedText: args.selectedText?.trim() || null,
			selectedStartLine: args.selectedStartLine ?? null,
			selectedEndLine: args.selectedEndLine ?? null,
			activeSection: args.activeSection?.trim() || null,
			payload: args.payload?.trim() || null,
			occurredAt: new Date(args.occurredAt ?? Date.now()),
			createdAt: new Date(),
		});

	return { eventId };
}

export async function createAttentionItem(args: {
	sessionId: string;
	kind: "missing_decision" | "risk" | "contradiction" | "follow_up";
	severity?: "low" | "medium" | "high";
	anchorType?: "section" | "line_range" | "event" | "none";
	anchorId?: string | null;
	summary: string;
	evidenceRefs?: string | null;
	occurredAt?: number;
}) {
	await ensureSessionViewer(args.sessionId);
	const itemId = newId();

	await getDb(env.planmd_db)
		.insert(attentionItems)
		.values({
			id: itemId,
			sessionId: args.sessionId,
			kind: args.kind,
			severity: args.severity ?? "medium",
			anchorType: args.anchorType ?? "none",
			anchorId: args.anchorId?.trim() || null,
			summary: args.summary.trim(),
			evidenceRefs: args.evidenceRefs?.trim() || null,
			state: "open",
			occurredAt: new Date(args.occurredAt ?? Date.now()),
			createdAt: new Date(),
		});

	return { itemId };
}

export async function createHandoffSnapshot(args: {
	planId: string;
	revisionId: string;
	sessionIds: string[];
}) {
	const { user, plan } = await ensurePlanAuthor(args.planId);
	const db = getDb(env.planmd_db);
	const revision = await db.query.revisions.findFirst({
		where: and(
			eq(revisions.id, args.revisionId),
			eq(revisions.planId, args.planId),
		),
	});
	if (!revision) throw new Error("Revision not found");

	const bundles = await getSessionBundles(args.planId, args.sessionIds);
	const snapshotId = newId();
	const publicSlug = createPublicSlug(plan.title, snapshotId);
	const callbackToken = newId();
	const publishedAt = new Date();
	const payload = buildHandoffPayload({
		snapshotId,
		publicSlug,
		publishedAt,
		plan,
		revision,
		sessions: bundles,
	});

	await db.insert(handoffSnapshots).values({
		id: snapshotId,
		planId: args.planId,
		revisionId: args.revisionId,
		status: "published",
		publicSlug,
		callbackToken,
		sessionIds: JSON.stringify(args.sessionIds),
		markdownContent: revision.content,
		jsonContent: JSON.stringify(payload),
		publishedAt,
		createdBy: user.id,
	});

	return {
		snapshotId,
		publicSlug,
		callbackToken,
		fetchUrl: `/api/handoffs/${snapshotId}`,
		writebackUrl: `/api/handoffs/${snapshotId}/agent-runs`,
	};
}

export async function generatePlanSessionDraft(args: {
	planId: string;
	sessionIds?: string[];
}) {
	await ensurePlanViewer(args.planId);
	const db = getDb(env.planmd_db);
	const latestRevision = await db.query.revisions.findFirst({
		where: eq(revisions.planId, args.planId),
		orderBy: desc(revisions.revisionNumber),
	});
	if (!latestRevision) {
		throw new Error("No revision found for this plan");
	}

	const sessionIds =
		args.sessionIds && args.sessionIds.length > 0
			? args.sessionIds
			: (
					await db
						.select({ id: planSessions.id })
						.from(planSessions)
						.where(
							and(
								eq(planSessions.planId, args.planId),
								eq(planSessions.status, "ended"),
							),
						)
						.orderBy(asc(planSessions.startedAt))
				).map((session) => session.id);
	const sessions = await getSessionBundles(args.planId, sessionIds);
	const draft = buildSessionDraft({
		currentContent: latestRevision.content,
		sessions,
	});

	return {
		...draft,
		revisionId: latestRevision.id,
		revisionNumber: latestRevision.revisionNumber,
		sessionIds: sessions.map((session) => session.session.id),
	};
}

export async function getPublicHandoffSnapshotBySlug(publicSlug: string) {
	const db = getDb(env.planmd_db);
	const snapshot = await db.query.handoffSnapshots.findFirst({
		where: eq(handoffSnapshots.publicSlug, publicSlug),
	});
	if (!snapshot || snapshot.status !== "published") {
		throw new Error("Handoff snapshot not found");
	}

	return getPublishedSnapshotPayload(snapshot.id);
}

export async function getPublishedSnapshotPayload(snapshotId: string) {
	const db = getDb(env.planmd_db);
	const snapshot = await db.query.handoffSnapshots.findFirst({
		where: eq(handoffSnapshots.id, snapshotId),
	});
	if (!snapshot || snapshot.status !== "published") {
		throw new Error("Handoff snapshot not found");
	}

	const runs = await db
		.select()
		.from(agentRuns)
		.where(eq(agentRuns.snapshotId, snapshot.id))
		.orderBy(desc(agentRuns.updatedAt));
	const newerPublishedSnapshot = await db.query.handoffSnapshots.findFirst({
		where: eq(handoffSnapshots.planId, snapshot.planId),
		orderBy: desc(handoffSnapshots.publishedAt),
	});

	return {
		snapshot: {
			id: snapshot.id,
			planId: snapshot.planId,
			revisionId: snapshot.revisionId,
			status: snapshot.status,
			publicSlug: snapshot.publicSlug,
			sessionIds: parseJsonArray(snapshot.sessionIds),
			publishedAt: snapshot.publishedAt,
			publicUrl: `/handoff/${snapshot.publicSlug}`,
			fetchUrl: `/api/handoffs/${snapshot.id}`,
			isLatestPublished: newerPublishedSnapshot?.id === snapshot.id,
			latestPublishedPublicUrl:
				newerPublishedSnapshot && newerPublishedSnapshot.id !== snapshot.id
					? `/handoff/${newerPublishedSnapshot.publicSlug}`
					: null,
		},
		payload: JSON.parse(snapshot.jsonContent),
		agentRuns: runs,
	};
}

export async function ingestContextEvent(args: {
	sessionId: string;
	captureToken: string;
	kind: "page_view" | "selection" | "highlight" | "section_focus" | "note";
	pageUrl?: string | null;
	repo?: string | null;
	ref?: string | null;
	path?: string | null;
	visibleStartLine?: number | null;
	visibleEndLine?: number | null;
	selectedText?: string | null;
	selectedStartLine?: number | null;
	selectedEndLine?: number | null;
	activeSection?: string | null;
	payload?: string | null;
	occurredAt?: number;
}) {
	await ensureSessionCaptureToken(args.sessionId, args.captureToken);
	return createContextEvent(args);
}

export async function ingestTranscriptChunk(args: {
	sessionId: string;
	captureToken: string;
	speakerName?: string | null;
	text: string;
	occurredAt?: number;
	source?: "manual_note" | "live_caption" | "bot";
}) {
	await ensureSessionCaptureToken(args.sessionId, args.captureToken);
	return createTranscriptChunk(args);
}

export async function registerAgentRun(args: {
	snapshotId: string;
	callbackToken: string;
	agentName: string;
	externalRunId: string;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	prUrl?: string | null;
	branch?: string | null;
	testSummary?: string | null;
	artifactUrl?: string | null;
	suggestedPlanDelta?: string | null;
}) {
	const db = getDb(env.planmd_db);
	const snapshot = await db.query.handoffSnapshots.findFirst({
		where: eq(handoffSnapshots.id, args.snapshotId),
	});
	if (!snapshot || snapshot.status !== "published") {
		throw new Error("Handoff snapshot not found");
	}
	if (snapshot.callbackToken !== args.callbackToken) {
		throw new Error("Invalid callback token");
	}

	const now = new Date();
	const existing = await db.query.agentRuns.findFirst({
		where: and(
			eq(agentRuns.snapshotId, args.snapshotId),
			eq(agentRuns.externalRunId, args.externalRunId),
		),
	});

	if (existing) {
		await db
			.update(agentRuns)
			.set({
				agentName: args.agentName,
				status: args.status,
				prUrl: args.prUrl ?? null,
				branch: args.branch ?? null,
				testSummary: args.testSummary ?? null,
				artifactUrl: args.artifactUrl ?? null,
				suggestedPlanDelta: args.suggestedPlanDelta ?? null,
				updatedAt: now,
			})
			.where(eq(agentRuns.id, existing.id));

		return { agentRunId: existing.id, updated: true };
	}

	const agentRunId = newId();
	await db.insert(agentRuns).values({
		id: agentRunId,
		snapshotId: args.snapshotId,
		agentName: args.agentName,
		externalRunId: args.externalRunId,
		status: args.status,
		prUrl: args.prUrl ?? null,
		branch: args.branch ?? null,
		testSummary: args.testSummary ?? null,
		artifactUrl: args.artifactUrl ?? null,
		suggestedPlanDelta: args.suggestedPlanDelta ?? null,
		createdAt: now,
		updatedAt: now,
	});

	return { agentRunId, updated: false };
}

async function ensurePlanViewer(planId: string) {
	const user = await requireAuth();
	const plan = await getDb(env.planmd_db).query.plans.findFirst({
		where: eq(plans.id, planId),
	});
	if (!plan) throw new Error("Plan not found");
	return { user, plan };
}

async function ensurePlanAuthor(planId: string) {
	const { user, plan } = await ensurePlanViewer(planId);
	if (plan.authorId !== user.id) {
		throw new Error("Only the author can publish handoff snapshots");
	}
	return { user, plan };
}

async function ensureSessionViewer(sessionId: string) {
	const session = await getDb(env.planmd_db).query.planSessions.findFirst({
		where: eq(planSessions.id, sessionId),
	});
	if (!session) throw new Error("Session not found");
	await ensurePlanViewer(session.planId);
	return session;
}

async function ensureSessionCaptureToken(sessionId: string, captureToken: string) {
	const session = await getDb(env.planmd_db).query.planSessions.findFirst({
		where: eq(planSessions.id, sessionId),
	});
	if (!session) throw new Error("Session not found");
	if (session.captureToken !== captureToken) {
		throw new Error("Invalid capture token");
	}
	if (session.status !== "live") {
		throw new Error("Session is not live");
	}
	return session;
}

async function getSessionBundles(planId: string, sessionIds: string[]) {
	const db = getDb(env.planmd_db);
	if (sessionIds.length === 0) return [] satisfies SessionBundle[];

	const sessions = await db
		.select()
		.from(planSessions)
		.where(
			and(
				eq(planSessions.planId, planId),
				inArray(planSessions.id, sessionIds),
			),
		)
		.orderBy(asc(planSessions.startedAt));

	return getSessionBundlesByRows(sessions);
}

async function getSessionBundlesByRows(
	sessions: (typeof planSessions.$inferSelect)[],
): Promise<SessionBundle[]> {
	const db = getDb(env.planmd_db);
	const sessionIds = sessions.map((session) => session.id);
	if (sessionIds.length === 0) return [];

	const [chunks, events, items] = await Promise.all([
		db
			.select()
			.from(transcriptChunks)
			.where(inArray(transcriptChunks.sessionId, sessionIds))
			.orderBy(
				asc(transcriptChunks.occurredAt),
				asc(transcriptChunks.createdAt),
			),
		db
			.select()
			.from(contextEvents)
			.where(inArray(contextEvents.sessionId, sessionIds))
			.orderBy(asc(contextEvents.occurredAt), asc(contextEvents.createdAt)),
		db
			.select()
			.from(attentionItems)
			.where(inArray(attentionItems.sessionId, sessionIds))
			.orderBy(asc(attentionItems.occurredAt), asc(attentionItems.createdAt)),
	]);

	return sessions.map((session) => ({
		session,
		transcriptChunks: chunks.filter((chunk) => chunk.sessionId === session.id),
		contextEvents: events.filter((event) => event.sessionId === session.id),
		attentionItems: items.filter((item) => item.sessionId === session.id),
	}));
}

function parseJsonArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item) => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}
