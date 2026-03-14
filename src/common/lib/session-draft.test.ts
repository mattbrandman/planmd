import { describe, expect, it } from "vitest";
import type { SessionBundle } from "#/common/lib/handoff";
import { buildSessionDraft } from "./session-draft";

describe("buildSessionDraft", () => {
	it("replaces existing session-derived sections and preserves unrelated markdown", () => {
		const draft = buildSessionDraft({
			currentContent: [
				"# planmd live capture",
				"",
				"Intro paragraph that should stay intact.",
				"",
				"## Problem",
				"",
				"Turn maintainer calls into durable implementation plans.",
				"",
				"## Current Context",
				"",
				"Old context",
				"",
				"## Evidence From Session",
				"",
				"Old evidence",
				"",
				"## Open Questions",
				"",
				"Old questions",
				"",
				"## Validation",
				"",
				"Keep this validation section untouched.",
			].join("\n"),
			sessions: [
				makeSessionBundle({
					session: {
						id: "session-1",
						title: "Maintainer sync",
						startedAt: new Date("2026-03-12T14:00:00.000Z"),
						endedAt: new Date("2026-03-12T14:45:00.000Z"),
					},
					transcriptChunks: [
						makeTranscriptChunk(
							"chunk-1",
							"2026-03-12T14:05:00.000Z",
							"Alex",
							"We will capture repo context with a bookmarklet first. Should the bot write back into the plan automatically?",
						),
					],
					contextEvents: [
						makeContextEvent("event-1", "2026-03-12T14:05:10.000Z", {
							repo: "example/planmd",
							ref: "main",
							path: "src/routes/plan/$planId/-components/SessionWorkspace.tsx",
							visibleStartLine: 210,
							visibleEndLine: 320,
							selectedStartLine: 245,
							selectedEndLine: 245,
							activeSection: "Live capture",
							selectedText: "createContextCaptureBookmarklet",
						}),
					],
					attentionItems: [
						makeAttentionItem(
							"attention-1",
							"2026-03-12T14:08:00.000Z",
							"risk",
							"high",
							"Prevent stale handoffs from being treated as current.",
						),
						makeAttentionItem(
							"attention-2",
							"2026-03-12T14:09:00.000Z",
							"missing_decision",
							"medium",
							"Decide whether transcript ingest uses headers or body tokens.",
						),
					],
				}),
			],
		});

		expect(draft.summary).toBe(
			"Updated Current Context, Evidence from Session, and Open Questions / Attention Items from 1 session, 1 transcript chunk, 1 context event, and 2 attention items.",
		);
		expect(draft.content).toContain("## Current Context");
		expect(draft.content).toContain("## Evidence from Session");
		expect(draft.content).toContain("## Open Questions / Attention Items");
		expect(draft.content).toContain(
			'Selection at example/planmd @ main @ src/routes/plan/$planId/-components/SessionWorkspace.tsx (visible L210-L320; selected L245; section Live capture; text "createContextCaptureBookmarklet")',
		);
		expect(draft.content).toContain("### Maintainer sync");
		expect(draft.content).toContain(
			"Transcript: Alex: We will capture repo context with a bookmarklet first. Should the bot write back into the plan automatically?",
		);
		expect(draft.content).toContain(
			"Attention: [medium] Missing Decision: Decide whether transcript ingest uses headers or body tokens.",
		);
		expect(draft.content).toContain(
			"- Alex: Should the bot write back into the plan automatically?",
		);
		expect(draft.content).not.toContain("Old context");
		expect(draft.content).not.toContain("Old evidence");
		expect(draft.content).not.toContain("Old questions");
		expect(draft.content).toContain("## Validation");
		expect(draft.content).toContain("Keep this validation section untouched.");
	});

	it("inserts missing sections after Problem and before later plan sections", () => {
		const draft = buildSessionDraft({
			currentContent: [
				"# planmd live capture",
				"",
				"## Problem",
				"",
				"Planning conversations disappear too quickly.",
				"",
				"## Proposed Solution",
				"",
				"Existing solution content that should remain after the new sections.",
			].join("\n"),
			sessions: [makeSessionBundle()],
		});

		const problemIndex = draft.content.indexOf("## Problem");
		const currentContextIndex = draft.content.indexOf("## Current Context");
		const evidenceIndex = draft.content.indexOf("## Evidence from Session");
		const attentionIndex = draft.content.indexOf(
			"## Open Questions / Attention Items",
		);
		const proposedSolutionIndex = draft.content.indexOf("## Proposed Solution");

		expect(problemIndex).toBeGreaterThanOrEqual(0);
		expect(currentContextIndex).toBeGreaterThan(problemIndex);
		expect(evidenceIndex).toBeGreaterThan(currentContextIndex);
		expect(attentionIndex).toBeGreaterThan(evidenceIndex);
		expect(proposedSolutionIndex).toBeGreaterThan(attentionIndex);
		expect(draft.content).toContain(
			"Existing solution content that should remain after the new sections.",
		);
	});

	it("collapses legacy open-question aliases into one combined section and uses deterministic fallbacks with no evidence", () => {
		const draft = buildSessionDraft({
			currentContent: [
				"# planmd live capture",
				"",
				"## Problem",
				"",
				"Keep the plan readable even before a call happens.",
				"",
				"## Open Questions",
				"",
				"Old questions",
				"",
				"## Attention Items",
				"",
				"Old attention",
			].join("\n"),
			sessions: [],
		});

		expect(draft.summary).toBe(
			"Updated Current Context, Evidence from Session, and Open Questions / Attention Items from 0 sessions, 0 transcript chunks, 0 context events, and 0 attention items.",
		);
		expect(
			draft.content.match(/## Open Questions \/ Attention Items/g)?.length,
		).toBe(1);
		expect(draft.content).not.toContain("## Open Questions\n\nOld questions");
		expect(draft.content).not.toContain("## Attention Items\n\nOld attention");
		expect(draft.content).toContain(
			"No semantic repo or page context was captured during the selected sessions.",
		);
		expect(draft.content).toContain(
			"No session evidence was captured during the selected sessions.",
		);
		expect(draft.content).toContain(
			"No open questions or attention items were captured during the selected sessions.",
		);
	});
});

function makeSessionBundle(
	overrides: {
		session?: Partial<SessionBundle["session"]>;
		transcriptChunks?: SessionBundle["transcriptChunks"];
		contextEvents?: SessionBundle["contextEvents"];
		attentionItems?: SessionBundle["attentionItems"];
	} = {},
): SessionBundle {
	return {
		session: {
			id: "session-1",
			status: "ended",
			meetingProvider: "google_meet",
			title: "Maintainer sync",
			startedAt: new Date("2026-03-12T15:00:00.000Z"),
			endedAt: new Date("2026-03-12T15:30:00.000Z"),
			...overrides.session,
		},
		transcriptChunks: overrides.transcriptChunks ?? [
			makeTranscriptChunk(
				"chunk-1",
				"2026-03-12T15:05:00.000Z",
				"Maintainer",
				"We should publish a stable handoff snapshot.",
			),
		],
		contextEvents: overrides.contextEvents ?? [
			makeContextEvent("event-1", "2026-03-12T15:06:00.000Z"),
		],
		attentionItems: overrides.attentionItems ?? [
			makeAttentionItem(
				"attention-1",
				"2026-03-12T15:08:00.000Z",
				"missing_decision",
				"medium",
				"Decide how coding agents write results back to the plan.",
			),
		],
	};
}

function makeTranscriptChunk(
	id: string,
	occurredAt: string,
	speakerName: string,
	text: string,
) {
	return {
		id,
		speakerName,
		text,
		occurredAt: new Date(occurredAt),
		source: "live_caption",
	};
}

function makeContextEvent(
	id: string,
	occurredAt: string,
	overrides: Partial<SessionBundle["contextEvents"][number]> = {},
) {
	return {
		id,
		kind: "selection",
		pageUrl: "https://github.com/example/planmd/blob/main/src/index.tsx",
		repo: "example/planmd",
		ref: "main",
		path: "src/index.tsx",
		visibleStartLine: 1,
		visibleEndLine: 50,
		selectedText: "Highlighted code",
		selectedStartLine: 10,
		selectedEndLine: 12,
		activeSection: "current-context",
		payload: null,
		occurredAt: new Date(occurredAt),
		...overrides,
	};
}

function makeAttentionItem(
	id: string,
	occurredAt: string,
	kind: string,
	severity: string,
	summary: string,
) {
	return {
		id,
		kind,
		severity,
		anchorType: "none",
		anchorId: null,
		summary,
		evidenceRefs: null,
		state: "open",
		occurredAt: new Date(occurredAt),
	};
}
