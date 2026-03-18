import { env } from "cloudflare:workers";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "#/db";
import { contextEvents } from "#/db/schema";

// ── detectInstruction ────────────────────────────────────────────────────────
// Keyword/pattern heuristic — returns true if the transcript text contains
// instructional language suggesting a revision request.

const INSTRUCTION_PATTERNS = [
	/should\s+be\s+rewritten/i,
	/needs?\s+to\s+include/i,
	/let'?s\s+change\s+this/i,
	/this\s+section\s+should/i,
	/rewrite\s+this\s+to/i,
	/update\s+this\s+with/i,
	/add\s+.+?\s+to\s+this/i,
	/change\s+this\s+to/i,
	/let'?s\s+rewrite/i,
	/can\s+we\s+update/i,
	/please\s+modify/i,
	/rephrase\s+this/i,
	/incorporate/i,
	/needs?\s+to\s+mention/i,
	/should\s+mention/i,
	/should\s+cover/i,
];

export function detectInstruction(transcriptText: string): boolean {
	return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(transcriptText));
}

// ── matchInstructionToContext ─────────────────────────────────────────────────
// Finds the most recent selection/highlight context event within 2 minutes
// before the given timestamp for the specified session.

export async function matchInstructionToContext(
	sessionId: string,
	timestamp: number,
): Promise<{
	eventId: string;
	selectedText: string;
	selectedStartLine: number;
	selectedEndLine: number;
	activeSection: string | null;
} | null> {
	const db = getDb(env.planmd_db);

	const windowStart = timestamp - 120_000; // 2 minutes before

	const results = await db
		.select({
			id: contextEvents.id,
			selectedText: contextEvents.selectedText,
			selectedStartLine: contextEvents.selectedStartLine,
			selectedEndLine: contextEvents.selectedEndLine,
			activeSection: contextEvents.activeSection,
		})
		.from(contextEvents)
		.where(
			and(
				eq(contextEvents.sessionId, sessionId),
				inArray(contextEvents.kind, ["selection", "highlight"]),
				isNotNull(contextEvents.selectedText),
				gte(contextEvents.occurredAt, new Date(windowStart)),
				lte(contextEvents.occurredAt, new Date(timestamp)),
			),
		)
		.orderBy(desc(contextEvents.occurredAt))
		.limit(1);

	if (results.length === 0) {
		return null;
	}

	const row = results[0];
	return {
		eventId: row.id,
		selectedText: row.selectedText as string,
		selectedStartLine: row.selectedStartLine as number,
		selectedEndLine: row.selectedEndLine as number,
		activeSection: row.activeSection,
	};
}

// ── buildRegenerationPrompt ──────────────────────────────────────────────────
// Constructs the prompt for Claude to rewrite highlighted text based on
// discussion instructions.

export function buildRegenerationPrompt(args: {
	planContent: string;
	targetSection: string | null;
	highlightedText: string;
	instruction: string;
	recentTranscript: string;
}): string {
	return `You are helping revise a plan document based on a team discussion.

## Full Plan
${args.planContent}

## Target Section
${args.targetSection || "Not specified"}

## Currently Highlighted Text
${args.highlightedText}

## Instruction from Discussion
${args.instruction}

## Recent Discussion Context
${args.recentTranscript}

## Task
Rewrite ONLY the highlighted text according to the instruction. Maintain the same markdown formatting style as the original. Output ONLY the replacement text, nothing else.`;
}

// ── generateSectionReplacement ───────────────────────────────────────────────
// Calls the Anthropic Messages API to generate replacement text for a
// highlighted section based on discussion instructions.

export async function generateSectionReplacement(args: {
	planContent: string;
	targetSection: string | null;
	highlightedText: string;
	instruction: string;
	recentTranscript: string;
}): Promise<string> {
	const apiKey = env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ANTHROPIC_API_KEY is not configured. Set it via `wrangler secret put ANTHROPIC_API_KEY`.",
		);
	}

	const prompt = buildRegenerationPrompt(args);

	const response = await fetch("https://api.anthropic.com/v1/messages", {
		method: "POST",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			model: "claude-opus-4-6-20250626",
			max_tokens: 4096,
			messages: [{ role: "user", content: prompt }],
		}),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(
			`Anthropic API request failed (${response.status}): ${errorBody}`,
		);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text?: string }>;
	};

	const textBlock = data.content.find((block) => block.type === "text");
	if (!textBlock?.text) {
		throw new Error("Anthropic API returned no text content in the response.");
	}

	return textBlock.text;
}
