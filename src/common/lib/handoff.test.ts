import { describe, expect, it } from "vitest";
import { buildHandoffPayload, createPublicSlug } from "#/common/lib/handoff";

describe("createPublicSlug", () => {
	it("creates a stable slug with a short snapshot suffix", () => {
		expect(createPublicSlug("Future of Open Source", "snap_1234567890")).toBe(
			"future-of-open-source-snap_123",
		);
	});
});

describe("buildHandoffPayload", () => {
	it("summarizes evidence and normalizes session data for the public contract", () => {
		const payload = buildHandoffPayload({
			snapshotId: "snap_1234567890",
			publicSlug: "future-of-open-source-snap_123",
			publishedAt: new Date("2026-03-12T17:00:00.000Z"),
			plan: {
				id: "plan_1",
				title: "Future of Open Source",
				description: "Make maintainer calls agent-ready.",
				status: "approved",
				githubUrl: "https://github.com/acme/planmd",
			},
			revision: {
				id: "rev_1",
				revisionNumber: 4,
				summary: "Aligned call evidence with the handoff format",
				content: `# Future of Open Source

## Decisions
- Capture semantic browser context

## Validation
- Replay the session`,
				createdAt: new Date("2026-03-12T16:30:00.000Z"),
			},
			sessions: [
				{
					session: {
						id: "session_1",
						status: "ended",
						meetingProvider: "google_meet",
						title: "Maintainer sync",
						startedAt: new Date("2026-03-12T15:00:00.000Z"),
						endedAt: new Date("2026-03-12T15:30:00.000Z"),
					},
					transcriptChunks: [
						{
							id: "chunk_2",
							speakerName: "Maintainer",
							text: "We should freeze an explicit handoff snapshot.",
							occurredAt: new Date("2026-03-12T15:10:00.000Z"),
							source: "manual_note",
						},
						{
							id: "chunk_1",
							speakerName: "Contributor",
							text: "Let the bot link PR status back to the plan.",
							occurredAt: new Date("2026-03-12T15:05:00.000Z"),
							source: "live_caption",
						},
					],
					contextEvents: [
						{
							id: "event_1",
							kind: "selection",
							pageUrl:
								"https://github.com/acme/planmd/blob/main/src/routes/plan/$planId/index.tsx",
							repo: "acme/planmd",
							ref: "main",
							path: "src/routes/plan/$planId/index.tsx",
							visibleStartLine: 1,
							visibleEndLine: 80,
							selectedText: "Publish immutable handoff snapshot",
							selectedStartLine: 18,
							selectedEndLine: 22,
							activeSection: "decisions",
							payload: '{"highlightedSection":"Publish immutable handoff"}',
							occurredAt: new Date("2026-03-12T15:07:00.000Z"),
						},
					],
					attentionItems: [
						{
							id: "attention_1",
							kind: "missing_decision",
							severity: "high",
							anchorType: "section",
							anchorId: "validation",
							summary: "Define how bots authenticate for writeback.",
							evidenceRefs: '["chunk_2","event_1"]',
							state: "open",
							occurredAt: new Date("2026-03-12T15:12:00.000Z"),
						},
					],
				},
			],
		});

		expect(payload.version).toBe(1);
		expect(payload.revision.number).toBe(4);
		expect(payload.sections.map((section) => section.id)).toEqual([
			"future-of-open-source",
			"decisions",
			"validation",
		]);
		expect(payload.evidenceSummary).toEqual({
			sessionCount: 1,
			transcriptCount: 2,
			contextEventCount: 1,
			attentionItemCount: 1,
		});
		expect(payload.sessions[0]?.transcript.map((chunk) => chunk.id)).toEqual([
			"chunk_1",
			"chunk_2",
		]);
		expect(payload.sessions[0]?.contextEvents[0]?.visibleLineRange).toEqual({
			start: 1,
			end: 80,
		});
		expect(payload.sessions[0]?.contextEvents[0]?.payload).toEqual({
			highlightedSection: "Publish immutable handoff",
		});
		expect(payload.sessions[0]?.attentionItems[0]?.evidenceRefs).toEqual([
			"chunk_2",
			"event_1",
		]);
	});
});
