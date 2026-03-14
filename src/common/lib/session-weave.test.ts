import { describe, expect, it } from "vitest";
import type { SessionBundle } from "#/common/lib/handoff";
import { weaveSessionEvidence } from "#/common/lib/session-weave";

describe("weaveSessionEvidence", () => {
	it("sorts chronologically and pairs transcript chunks with the nearest unused context event", () => {
		const session = makeSessionBundle({
			transcriptChunks: [
				makeTranscriptChunk("chunk-2", "2026-03-12T15:10:00.000Z", "Second"),
				makeTranscriptChunk("chunk-1", "2026-03-12T15:05:00.000Z", "First"),
			],
			contextEvents: [
				makeContextEvent("event-2", "2026-03-12T15:10:20.000Z"),
				makeContextEvent("event-1", "2026-03-12T15:05:15.000Z"),
				makeContextEvent("event-3", "2026-03-12T15:25:00.000Z"),
			],
			attentionItems: [
				makeAttentionItem("attention-1", "2026-03-12T15:05:20.000Z"),
				makeAttentionItem("attention-2", "2026-03-12T15:25:10.000Z"),
			],
		});

		const woven = weaveSessionEvidence(session);

		expect(woven.map((item) => item.id)).toEqual([
			"woven-chunk-1",
			"woven-chunk-2",
			"woven-event-3",
		]);
		expect(woven[0]?.contextEvent?.id).toBe("event-1");
		expect(woven[1]?.contextEvent?.id).toBe("event-2");
		expect(woven[0]?.attentionItems.map((item) => item.id)).toEqual([
			"attention-1",
		]);
		expect(woven[2]?.attentionItems.map((item) => item.id)).toEqual([
			"attention-2",
		]);
	});

	it("does not reuse the same context event across transcript chunks and leaves unmatched evidence standalone", () => {
		const session = makeSessionBundle({
			transcriptChunks: [
				makeTranscriptChunk("chunk-1", "2026-03-12T15:05:00.000Z", "First"),
				makeTranscriptChunk("chunk-2", "2026-03-12T15:05:10.000Z", "Second"),
			],
			contextEvents: [
				makeContextEvent("event-1", "2026-03-12T15:05:05.000Z"),
				makeContextEvent("event-2", "2026-03-12T15:40:00.000Z"),
			],
			attentionItems: [
				makeAttentionItem("attention-1", "2026-03-12T16:00:00.000Z"),
			],
		});

		const woven = weaveSessionEvidence(session, { contextWindowMs: 30_000 });

		expect(
			woven.map((item) => ({
				id: item.id,
				contextId: item.contextEvent?.id ?? null,
				transcriptId: item.transcriptChunk?.id ?? null,
				attentionIds: item.attentionItems.map((attention) => attention.id),
			})),
		).toEqual([
			{
				id: "woven-chunk-1",
				contextId: "event-1",
				transcriptId: "chunk-1",
				attentionIds: [],
			},
			{
				id: "woven-chunk-2",
				contextId: null,
				transcriptId: "chunk-2",
				attentionIds: [],
			},
			{
				id: "woven-event-2",
				contextId: "event-2",
				transcriptId: null,
				attentionIds: [],
			},
			{
				id: "woven-attention-1",
				contextId: null,
				transcriptId: null,
				attentionIds: ["attention-1"],
			},
		]);
	});
});

function makeSessionBundle(overrides: Partial<SessionBundle>): SessionBundle {
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
		transcriptChunks: overrides.transcriptChunks ?? [],
		contextEvents: overrides.contextEvents ?? [],
		attentionItems: overrides.attentionItems ?? [],
	};
}

function makeTranscriptChunk(id: string, occurredAt: string, text: string) {
	return {
		id,
		speakerName: "Speaker",
		text,
		occurredAt: new Date(occurredAt),
		source: "manual_note",
	};
}

function makeContextEvent(id: string, occurredAt: string) {
	return {
		id,
		kind: "selection",
		pageUrl: "https://github.com/acme/planmd/blob/main/src/index.tsx",
		repo: "acme/planmd",
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
	};
}

function makeAttentionItem(id: string, occurredAt: string) {
	return {
		id,
		kind: "missing_decision",
		severity: "medium" as const,
		anchorType: "none",
		anchorId: null,
		summary: "Need a clearer decision",
		evidenceRefs: null,
		state: "open",
		occurredAt: new Date(occurredAt),
	};
}
