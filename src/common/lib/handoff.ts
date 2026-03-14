import { parseSections, slugify } from "#/common/lib/markdown";

interface PlanRecord {
	id: string;
	title: string;
	description: string | null;
	status: string;
	githubUrl: string | null;
}

interface RevisionRecord {
	id: string;
	revisionNumber: number;
	summary: string | null;
	content: string;
	createdAt: Date;
}

interface SessionRecord {
	id: string;
	status: string;
	meetingProvider: string;
	title: string | null;
	startedAt: Date;
	endedAt: Date | null;
}

interface TranscriptChunkRecord {
	id: string;
	speakerName: string | null;
	text: string;
	occurredAt: Date;
	source: string;
}

interface ContextEventRecord {
	id: string;
	kind: string;
	pageUrl: string | null;
	repo: string | null;
	ref: string | null;
	path: string | null;
	visibleStartLine: number | null;
	visibleEndLine: number | null;
	selectedText: string | null;
	selectedStartLine: number | null;
	selectedEndLine: number | null;
	activeSection: string | null;
	payload: string | null;
	occurredAt: Date;
}

interface AttentionItemRecord {
	id: string;
	kind: string;
	severity: string;
	anchorType: string;
	anchorId: string | null;
	summary: string;
	evidenceRefs: string | null;
	state: string;
	occurredAt: Date;
}

export interface SessionBundle {
	session: SessionRecord;
	transcriptChunks: TranscriptChunkRecord[];
	contextEvents: ContextEventRecord[];
	attentionItems: AttentionItemRecord[];
}

export interface HandoffPayload {
	version: 1;
	snapshotId: string;
	publicSlug: string;
	publishedAt: string;
	plan: {
		id: string;
		title: string;
		description: string | null;
		status: string;
		githubUrl: string | null;
	};
	revision: {
		id: string;
		number: number;
		summary: string | null;
		createdAt: string;
	};
	markdown: string;
	sections: ReturnType<typeof parseSections>;
	evidenceSummary: {
		sessionCount: number;
		transcriptCount: number;
		contextEventCount: number;
		attentionItemCount: number;
	};
	sessions: Array<{
		id: string;
		status: string;
		meetingProvider: string;
		title: string | null;
		startedAt: string;
		endedAt: string | null;
		transcript: Array<{
			id: string;
			speakerName: string | null;
			text: string;
			occurredAt: string;
			source: string;
		}>;
		contextEvents: Array<{
			id: string;
			kind: string;
			occurredAt: string;
			pageUrl: string | null;
			repo: string | null;
			ref: string | null;
			path: string | null;
			visibleLineRange: { start: number; end: number } | null;
			selectedText: string | null;
			selectedLineRange: { start: number; end: number } | null;
			activeSection: string | null;
			payload: unknown;
		}>;
		attentionItems: Array<{
			id: string;
			kind: string;
			severity: string;
			anchorType: string;
			anchorId: string | null;
			summary: string;
			evidenceRefs: unknown;
			state: string;
			occurredAt: string;
		}>;
	}>;
}

export function createPublicSlug(title: string, snapshotId: string): string {
	const base = slugify(title) || "handoff";
	return `${base}-${snapshotId.slice(0, 8)}`;
}

export function buildHandoffPayload(args: {
	snapshotId: string;
	publicSlug: string;
	publishedAt: Date;
	plan: PlanRecord;
	revision: RevisionRecord;
	sessions: SessionBundle[];
}): HandoffPayload {
	const { snapshotId, publicSlug, publishedAt, plan, revision, sessions } =
		args;

	return {
		version: 1,
		snapshotId,
		publicSlug,
		publishedAt: publishedAt.toISOString(),
		plan: {
			id: plan.id,
			title: plan.title,
			description: plan.description,
			status: plan.status,
			githubUrl: plan.githubUrl,
		},
		revision: {
			id: revision.id,
			number: revision.revisionNumber,
			summary: revision.summary,
			createdAt: revision.createdAt.toISOString(),
		},
		markdown: revision.content,
		sections: parseSections(revision.content),
		evidenceSummary: {
			sessionCount: sessions.length,
			transcriptCount: sessions.reduce(
				(total, session) => total + session.transcriptChunks.length,
				0,
			),
			contextEventCount: sessions.reduce(
				(total, session) => total + session.contextEvents.length,
				0,
			),
			attentionItemCount: sessions.reduce(
				(total, session) => total + session.attentionItems.length,
				0,
			),
		},
		sessions: sessions.map((bundle) => ({
			id: bundle.session.id,
			status: bundle.session.status,
			meetingProvider: bundle.session.meetingProvider,
			title: bundle.session.title,
			startedAt: bundle.session.startedAt.toISOString(),
			endedAt: bundle.session.endedAt?.toISOString() ?? null,
			transcript: bundle.transcriptChunks
				.slice()
				.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
				.map((chunk) => ({
					id: chunk.id,
					speakerName: chunk.speakerName,
					text: chunk.text,
					occurredAt: chunk.occurredAt.toISOString(),
					source: chunk.source,
				})),
			contextEvents: bundle.contextEvents
				.slice()
				.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
				.map((event) => ({
					id: event.id,
					kind: event.kind,
					occurredAt: event.occurredAt.toISOString(),
					pageUrl: event.pageUrl,
					repo: event.repo,
					ref: event.ref,
					path: event.path,
					visibleLineRange: buildLineRange(
						event.visibleStartLine,
						event.visibleEndLine,
					),
					selectedText: event.selectedText,
					selectedLineRange: buildLineRange(
						event.selectedStartLine,
						event.selectedEndLine,
					),
					activeSection: event.activeSection,
					payload: parseJsonField(event.payload),
				})),
			attentionItems: bundle.attentionItems
				.slice()
				.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
				.map((item) => ({
					id: item.id,
					kind: item.kind,
					severity: item.severity,
					anchorType: item.anchorType,
					anchorId: item.anchorId,
					summary: item.summary,
					evidenceRefs: parseJsonField(item.evidenceRefs),
					state: item.state,
					occurredAt: item.occurredAt.toISOString(),
				})),
		})),
	};
}

function buildLineRange(
	start: number | null,
	end: number | null,
): { start: number; end: number } | null {
	if (start == null) return null;
	return {
		start,
		end: end ?? start,
	};
}

function parseJsonField(value: string | null): unknown {
	if (!value) return null;

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
