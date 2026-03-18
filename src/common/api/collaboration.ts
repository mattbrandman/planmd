import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	createAttentionItem,
	createContextEvent,
	createHandoffSnapshot,
	createPlanSession,
	createTranscriptChunk,
	generatePlanSessionDraft,
	getPlanWorkspaceData,
	getPublicHandoffSnapshotBySlug,
	getRegenerationRequestsForSession,
	stopPlanSession,
	triggerRegenerationForRequest,
	updateRegenerationRequestStatus,
} from "#/common/lib/collaboration-server";

const contextEventKindSchema = z.enum([
	"page_view",
	"selection",
	"highlight",
	"section_focus",
	"note",
]);
const attentionKindSchema = z.enum([
	"missing_decision",
	"risk",
	"contradiction",
	"follow_up",
]);
const attentionSeveritySchema = z.enum(["low", "medium", "high"]);

export const getPlanWorkspace = createServerFn({ method: "GET" })
	.inputValidator(z.object({ planId: z.string() }))
	.handler(async ({ data }) => getPlanWorkspaceData(data.planId));

export const createSession = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			title: z.string().max(200).optional(),
			meetingProvider: z.enum(["google_meet", "manual"]).optional(),
		}),
	)
	.handler(async ({ data }) => {
		return createPlanSession(data);
	});

export const endSession = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string() }))
	.handler(async ({ data }) => stopPlanSession(data.sessionId));

export const addTranscriptChunk = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			sessionId: z.string(),
			speakerName: z.string().max(120).optional().nullable(),
			text: z.string().min(1),
			occurredAt: z.number().optional(),
			source: z.enum(["manual_note", "live_caption", "bot"]).optional(),
		}),
	)
	.handler(async ({ data }) => createTranscriptChunk(data));

export const addContextEvent = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			sessionId: z.string(),
			kind: contextEventKindSchema,
			pageUrl: z.string().url().optional().nullable().or(z.literal("")),
			repo: z.string().max(200).optional().nullable(),
			ref: z.string().max(200).optional().nullable(),
			path: z.string().max(500).optional().nullable(),
			visibleStartLine: z.number().int().positive().optional().nullable(),
			visibleEndLine: z.number().int().positive().optional().nullable(),
			selectedText: z.string().max(5000).optional().nullable(),
			selectedStartLine: z.number().int().positive().optional().nullable(),
			selectedEndLine: z.number().int().positive().optional().nullable(),
			activeSection: z.string().max(200).optional().nullable(),
			payload: z.string().max(5000).optional().nullable(),
			occurredAt: z.number().optional(),
		}),
	)
	.handler(async ({ data }) => createContextEvent(data));

export const addAttentionItem = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			sessionId: z.string(),
			kind: attentionKindSchema,
			severity: attentionSeveritySchema.optional(),
			anchorType: z.enum(["section", "line_range", "event", "none"]).optional(),
			anchorId: z.string().max(200).optional().nullable(),
			summary: z.string().min(1).max(1000),
			evidenceRefs: z.string().max(5000).optional().nullable(),
			occurredAt: z.number().optional(),
		}),
	)
	.handler(async ({ data }) => createAttentionItem(data));

export const publishHandoffSnapshot = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			revisionId: z.string(),
			sessionIds: z.array(z.string()).default([]),
		}),
	)
	.handler(async ({ data }) => createHandoffSnapshot(data));

export const buildSessionDraft = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			planId: z.string(),
			sessionIds: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ data }) => generatePlanSessionDraft(data));

export const getPublicHandoffSnapshot = createServerFn({ method: "GET" })
	.inputValidator(z.object({ publicSlug: z.string() }))
	.handler(async ({ data }) => getPublicHandoffSnapshotBySlug(data.publicSlug));

export const getRegenerationRequests = createServerFn({ method: "GET" })
	.inputValidator(z.object({ sessionId: z.string() }))
	.handler(async ({ data }) =>
		getRegenerationRequestsForSession(data.sessionId),
	);

export const triggerRegeneration = createServerFn({ method: "POST" })
	.inputValidator(z.object({ sessionId: z.string(), requestId: z.string() }))
	.handler(async ({ data }) =>
		triggerRegenerationForRequest(data.sessionId, data.requestId),
	);

export const updateRegeneration = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			requestId: z.string(),
			action: z.enum(["accepted", "dismissed"]),
		}),
	)
	.handler(async ({ data }) =>
		updateRegenerationRequestStatus(data.requestId, data.action),
	);
