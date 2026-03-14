import type { SessionBundle } from "#/common/lib/handoff";

type TranscriptChunk = SessionBundle["transcriptChunks"][number];
type ContextEvent = SessionBundle["contextEvents"][number];
type AttentionItem = SessionBundle["attentionItems"][number];

export interface WovenEvidenceItem {
	id: string;
	occurredAt: Date;
	transcriptChunk: TranscriptChunk | null;
	contextEvent: ContextEvent | null;
	attentionItems: AttentionItem[];
}

interface WeaveOptions {
	contextWindowMs?: number;
}

const DEFAULT_CONTEXT_WINDOW_MS = 90_000;

export function weaveSessionEvidence(
	session: SessionBundle,
	options: WeaveOptions = {},
): WovenEvidenceItem[] {
	const contextWindowMs = options.contextWindowMs ?? DEFAULT_CONTEXT_WINDOW_MS;
	const transcriptChunks = session.transcriptChunks
		.slice()
		.sort(compareByOccurredAt);
	const contextEvents = session.contextEvents.slice().sort(compareByOccurredAt);
	const attentionItems = session.attentionItems
		.slice()
		.sort(compareByOccurredAt);

	const usedContextIds = new Set<string>();
	const wovenItems: WovenEvidenceItem[] = transcriptChunks.map((chunk) => {
		const contextEvent = findNearestContextEvent(
			chunk,
			contextEvents,
			usedContextIds,
			contextWindowMs,
		);

		if (contextEvent) {
			usedContextIds.add(contextEvent.id);
		}

		return {
			id: `woven-${chunk.id}`,
			occurredAt: chunk.occurredAt,
			transcriptChunk: chunk,
			contextEvent,
			attentionItems: [],
		};
	});

	for (const contextEvent of contextEvents) {
		if (usedContextIds.has(contextEvent.id)) continue;

		wovenItems.push({
			id: `woven-${contextEvent.id}`,
			occurredAt: contextEvent.occurredAt,
			transcriptChunk: null,
			contextEvent,
			attentionItems: [],
		});
	}

	for (const attentionItem of attentionItems) {
		const target = findNearestWovenItem(
			attentionItem,
			wovenItems,
			contextWindowMs,
		);

		if (!target) {
			wovenItems.push({
				id: `woven-${attentionItem.id}`,
				occurredAt: attentionItem.occurredAt,
				transcriptChunk: null,
				contextEvent: null,
				attentionItems: [attentionItem],
			});
			continue;
		}

		target.attentionItems.push(attentionItem);
	}

	return wovenItems
		.map((item) => ({
			...item,
			attentionItems: item.attentionItems.slice().sort(compareByOccurredAt),
		}))
		.sort(compareWovenItems);
}

function findNearestContextEvent(
	transcriptChunk: TranscriptChunk,
	contextEvents: ContextEvent[],
	usedContextIds: Set<string>,
	contextWindowMs: number,
) {
	let bestMatch: ContextEvent | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const contextEvent of contextEvents) {
		if (usedContextIds.has(contextEvent.id)) continue;

		const distance = Math.abs(
			contextEvent.occurredAt.getTime() - transcriptChunk.occurredAt.getTime(),
		);
		if (distance > contextWindowMs) continue;

		if (
			distance < bestDistance ||
			(distance === bestDistance &&
				contextEvent.occurredAt.getTime() <
					(bestMatch?.occurredAt.getTime() ?? Infinity)) ||
			(distance === bestDistance &&
				contextEvent.occurredAt.getTime() ===
					(bestMatch?.occurredAt.getTime() ?? Infinity) &&
				contextEvent.id < (bestMatch?.id ?? ""))
		) {
			bestMatch = contextEvent;
			bestDistance = distance;
		}
	}

	return bestMatch;
}

function findNearestWovenItem(
	attentionItem: AttentionItem,
	wovenItems: WovenEvidenceItem[],
	contextWindowMs: number,
) {
	let bestMatch: WovenEvidenceItem | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const wovenItem of wovenItems) {
		const anchorTime = getAnchorTime(wovenItem);
		const distance = Math.abs(
			anchorTime.getTime() - attentionItem.occurredAt.getTime(),
		);
		if (distance > contextWindowMs) continue;

		if (
			distance < bestDistance ||
			(distance === bestDistance &&
				anchorTime.getTime() <
					(bestMatch ? getAnchorTime(bestMatch).getTime() : Infinity)) ||
			(distance === bestDistance &&
				anchorTime.getTime() ===
					(bestMatch ? getAnchorTime(bestMatch).getTime() : Infinity) &&
				wovenItem.id < (bestMatch?.id ?? ""))
		) {
			bestMatch = wovenItem;
			bestDistance = distance;
		}
	}

	return bestMatch;
}

function getAnchorTime(wovenItem: WovenEvidenceItem) {
	return (
		wovenItem.transcriptChunk?.occurredAt ??
		wovenItem.contextEvent?.occurredAt ??
		wovenItem.occurredAt
	);
}

function compareByOccurredAt(
	left: { occurredAt: Date; id: string },
	right: { occurredAt: Date; id: string },
) {
	return (
		left.occurredAt.getTime() - right.occurredAt.getTime() ||
		left.id.localeCompare(right.id)
	);
}

function compareWovenItems(left: WovenEvidenceItem, right: WovenEvidenceItem) {
	return (
		left.occurredAt.getTime() - right.occurredAt.getTime() ||
		left.id.localeCompare(right.id)
	);
}
