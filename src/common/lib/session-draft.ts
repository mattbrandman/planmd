import type { SessionBundle } from "#/common/lib/handoff";
import { slugify } from "#/common/lib/markdown";

export interface SessionDraft {
	content: string;
	summary: string;
}

interface DraftSection {
	slug: string;
	title: string;
	body: string;
	aliases: Set<string>;
}

interface MarkdownSectionBlock {
	title: string;
	slug: string;
	body: string;
}

const CURRENT_CONTEXT_SLUG = slugify("Current Context");
const EVIDENCE_FROM_SESSION_SLUG = slugify("Evidence from Session");
const OPEN_QUESTIONS_AND_ATTENTION_SLUG = slugify(
	"Open Questions / Attention Items",
);
const PROBLEM_SLUG = slugify("Problem");

export function buildSessionDraft(args: {
	currentContent: string;
	sessions: SessionBundle[];
}): SessionDraft {
	const sessions = sortSessions(args.sessions);
	const draftSections = buildDraftSections(sessions);
	const content = applyDraftSections(args.currentContent, draftSections);

	return {
		content,
		summary: buildSummary(sessions),
	};
}

function buildDraftSections(sessions: SessionBundle[]): DraftSection[] {
	return [
		{
			slug: CURRENT_CONTEXT_SLUG,
			title: "Current Context",
			body: buildCurrentContextBody(sessions),
			aliases: new Set([CURRENT_CONTEXT_SLUG]),
		},
		{
			slug: EVIDENCE_FROM_SESSION_SLUG,
			title: "Evidence from Session",
			body: buildEvidenceFromSessionBody(sessions),
			aliases: new Set([EVIDENCE_FROM_SESSION_SLUG]),
		},
		{
			slug: OPEN_QUESTIONS_AND_ATTENTION_SLUG,
			title: "Open Questions / Attention Items",
			body: buildOpenQuestionsAndAttentionBody(sessions),
			aliases: new Set([
				slugify("Open Questions"),
				slugify("Attention Items"),
				OPEN_QUESTIONS_AND_ATTENTION_SLUG,
			]),
		},
	];
}

function applyDraftSections(content: string, draftSections: DraftSection[]) {
	const document = parseMarkdownDocument(content);

	for (const draftSection of draftSections) {
		const matchingIndexes = document.sections
			.map((section, index) =>
				draftSection.aliases.has(section.slug) ? index : -1,
			)
			.filter((index) => index >= 0);

		if (matchingIndexes.length === 0) continue;

		const [firstMatch, ...duplicateMatches] = matchingIndexes;
		document.sections[firstMatch] = {
			title: draftSection.title,
			slug: draftSection.slug,
			body: draftSection.body,
		};

		for (const duplicateIndex of duplicateMatches.reverse()) {
			document.sections.splice(duplicateIndex, 1);
		}
	}

	for (const [index, draftSection] of draftSections.entries()) {
		const exists = document.sections.some(
			(section) => section.slug === draftSection.slug,
		);
		if (exists) continue;

		const insertAt = findInsertionIndex(document.sections, draftSections, index);
		document.sections.splice(insertAt, 0, {
			title: draftSection.title,
			slug: draftSection.slug,
			body: draftSection.body,
		});
	}

	return serializeMarkdownDocument(document.preamble, document.sections);
}

function parseMarkdownDocument(content: string) {
	const normalized = content.replaceAll("\r\n", "\n").trimEnd();
	if (!normalized) {
		return {
			preamble: "",
			sections: [] as MarkdownSectionBlock[],
		};
	}

	const lines = normalized.split("\n");
	const sectionStartIndexes: number[] = [];

	for (const [index, line] of lines.entries()) {
		if (/^##\s+/.test(line)) {
			sectionStartIndexes.push(index);
		}
	}

	if (sectionStartIndexes.length === 0) {
		return {
			preamble: normalized,
			sections: [] as MarkdownSectionBlock[],
		};
	}

	const preamble = trimBlankLines(
		lines.slice(0, sectionStartIndexes[0]).join("\n"),
	);
	const sections = sectionStartIndexes.map((startIndex, index) => {
		const endIndex = sectionStartIndexes[index + 1] ?? lines.length;
		const headingMatch = lines[startIndex]?.match(/^##\s+(.+?)\s*$/);
		const title = headingMatch?.[1]?.trim() ?? "Untitled Section";

		return {
			title,
			slug: slugify(title),
			body: trimBlankLines(lines.slice(startIndex + 1, endIndex).join("\n")),
		};
	});

	return { preamble, sections };
}

function serializeMarkdownDocument(
	preamble: string,
	sections: MarkdownSectionBlock[],
) {
	const parts: string[] = [];
	const trimmedPreamble = preamble.trimEnd();

	if (trimmedPreamble) {
		parts.push(trimmedPreamble);
	}

	for (const section of sections) {
		if (parts.length > 0) {
			parts.push("");
		}

		parts.push(`## ${section.title}`);

		if (section.body.trim()) {
			parts.push("");
			parts.push(section.body.trim());
		}
	}

	return parts.join("\n").trimEnd();
}

function findInsertionIndex(
	sections: MarkdownSectionBlock[],
	draftSections: DraftSection[],
	targetIndex: number,
) {
	const preferredAnchors = [
		...draftSections.slice(0, targetIndex).map((section) => section.slug),
		PROBLEM_SLUG,
	];

	for (let index = sections.length - 1; index >= 0; index -= 1) {
		if (preferredAnchors.includes(sections[index].slug)) {
			return index + 1;
		}
	}

	return 0;
}

function buildCurrentContextBody(sessions: SessionBundle[]) {
	const entries = uniqueStrings(
		sessions.flatMap((session) =>
			session.contextEvents.map((contextEvent) => formatContextEvent(contextEvent)),
		),
	);

	return buildBulletBody(
		entries,
		"No semantic repo or page context was captured during the selected sessions.",
	);
}

function buildEvidenceFromSessionBody(sessions: SessionBundle[]) {
	if (sessions.length === 0) {
		return buildBulletBody(
			[],
			"No session evidence was captured during the selected sessions.",
		);
	}

	return sessions
		.map((session, index) => {
			const transcriptEntries = session.transcriptChunks
				.map((chunk) => `Transcript: ${formatTranscriptChunk(chunk)}`)
				.slice(0, 3);
			const contextEntries = session.contextEvents
				.map((contextEvent) => `Context: ${formatContextEvent(contextEvent)}`)
				.slice(0, 3);
			const attentionEntries = session.attentionItems
				.map((attentionItem) => `Attention: ${formatAttentionItem(attentionItem)}`)
				.slice(0, 3);
			const evidenceEntries = [
				`Window: ${formatSessionWindow(session.session.startedAt, session.session.endedAt)}`,
				`Provider: ${formatMeetingProvider(session.session.meetingProvider)}`,
				...transcriptEntries,
				...contextEntries,
				...attentionEntries,
			];

			return [
				`### ${session.session.title?.trim() || `Session ${index + 1}`}`,
				"",
				...toBullets(
					evidenceEntries,
					"No transcript, context, or attention evidence was captured.",
				),
			].join("\n");
		})
		.join("\n\n");
}

function buildOpenQuestionsAndAttentionBody(sessions: SessionBundle[]) {
	const attentionItems = sessions.flatMap((session) =>
		session.attentionItems
			.filter((item) => isOpenAttentionItem(item.state))
			.map((item) => formatAttentionItem(item)),
	);
	const transcriptQuestions = sessions.flatMap((session) =>
		session.transcriptChunks.flatMap((chunk) =>
			extractQuestionSentences(chunk.text).map((question) =>
				formatSpeakerPrefix(chunk.speakerName, question),
			),
		),
	);

	return buildBulletBody(
		uniqueStrings([...attentionItems, ...transcriptQuestions]),
		"No open questions or attention items were captured during the selected sessions.",
	);
}

function buildBulletBody(items: string[], fallback: string) {
	return toBullets(items, fallback).join("\n");
}

function buildSummary(sessions: SessionBundle[]) {
	const sessionCount = sessions.length;
	const transcriptCount = sessions.reduce(
		(total, session) => total + session.transcriptChunks.length,
		0,
	);
	const contextEventCount = sessions.reduce(
		(total, session) => total + session.contextEvents.length,
		0,
	);
	const attentionItemCount = sessions.reduce(
		(total, session) => total + session.attentionItems.length,
		0,
	);

	return `Updated Current Context, Evidence from Session, and Open Questions / Attention Items from ${sessionCount} session${sessionCount === 1 ? "" : "s"}, ${transcriptCount} transcript chunk${transcriptCount === 1 ? "" : "s"}, ${contextEventCount} context event${contextEventCount === 1 ? "" : "s"}, and ${attentionItemCount} attention item${attentionItemCount === 1 ? "" : "s"}.`;
}

function sortSessions(sessions: SessionBundle[]) {
	return sessions
		.slice()
		.map((session) => ({
			...session,
			transcriptChunks: session.transcriptChunks
				.slice()
				.sort(compareByOccurredAtAndId),
			contextEvents: session.contextEvents.slice().sort(compareByOccurredAtAndId),
			attentionItems: session.attentionItems
				.slice()
				.sort(compareByOccurredAtAndId),
		}))
		.sort(
			(left, right) =>
				left.session.startedAt.getTime() - right.session.startedAt.getTime() ||
				left.session.id.localeCompare(right.session.id),
		);
}

function compareByOccurredAtAndId(
	left: { occurredAt: Date; id: string },
	right: { occurredAt: Date; id: string },
) {
	return (
		left.occurredAt.getTime() - right.occurredAt.getTime() ||
		left.id.localeCompare(right.id)
	);
}

function formatTranscriptChunk(
	chunk: SessionBundle["transcriptChunks"][number],
) {
	return formatSpeakerPrefix(chunk.speakerName, truncate(chunk.text, 220));
}

function formatContextEvent(
	contextEvent: SessionBundle["contextEvents"][number],
) {
	const location =
		[contextEvent.repo, contextEvent.ref, contextEvent.path]
			.filter(Boolean)
			.join(" @ ") || contextEvent.pageUrl;
	const details = [
		formatLineRange("visible", contextEvent.visibleStartLine, contextEvent.visibleEndLine),
		formatLineRange(
			"selected",
			contextEvent.selectedStartLine,
			contextEvent.selectedEndLine,
		),
		contextEvent.activeSection
			? `section ${normalizeWhitespace(contextEvent.activeSection)}`
			: null,
		contextEvent.selectedText
			? `text "${truncate(contextEvent.selectedText, 80)}"`
			: null,
	].filter(Boolean);
	const prefix = location
		? `${humanize(contextEvent.kind)} at ${location}`
		: humanize(contextEvent.kind);

	return details.length > 0
		? `${prefix} (${details.join("; ")})`
		: prefix;
}

function formatAttentionItem(
	item: SessionBundle["attentionItems"][number],
) {
	return `[${item.severity}] ${humanize(item.kind)}: ${normalizeWhitespace(item.summary)}`;
}

function formatSpeakerPrefix(speakerName: string | null, value: string) {
	return speakerName?.trim() ? `${speakerName.trim()}: ${value}` : value;
}

function formatSessionWindow(startedAt: Date, endedAt: Date | null) {
	return endedAt
		? `${startedAt.toISOString()} to ${endedAt.toISOString()}`
		: `${startedAt.toISOString()} onward`;
}

function formatMeetingProvider(meetingProvider: string) {
	if (meetingProvider === "google_meet") {
		return "Google Meet";
	}

	return humanize(meetingProvider);
}

function formatLineRange(
	label: string,
	startLine: number | null,
	endLine: number | null,
) {
	if (startLine == null) return null;
	if (endLine != null && endLine !== startLine) {
		return `${label} L${startLine}-L${endLine}`;
	}
	return `${label} L${startLine}`;
}

function extractQuestionSentences(text: string) {
	return splitIntoSentences(text).filter((sentence) => sentence.endsWith("?"));
}

function splitIntoSentences(text: string) {
	return normalizeWhitespace(text)
		.split(/(?<=[.?!])\s+/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

function isOpenAttentionItem(state: string) {
	return !["closed", "resolved"].includes(state.toLowerCase());
}

function humanize(value: string) {
	return value
		.replaceAll("_", " ")
		.split(" ")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function truncate(value: string, maxLength: number) {
	const normalized = normalizeWhitespace(value);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
		if (seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}

	return result;
}

function toBullets(items: string[], fallback: string) {
	return (items.length > 0 ? items : [fallback]).map((item) => `- ${item}`);
}

function trimBlankLines(value: string) {
	return value.replace(/^\n+|\n+$/g, "");
}
