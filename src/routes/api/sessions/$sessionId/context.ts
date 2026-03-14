import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ingestContextEvent } from "#/common/lib/collaboration-server";

const bodySchema = z.object({
	captureToken: z.string().min(1).optional().nullable(),
	kind: z.enum([
		"page_view",
		"selection",
		"highlight",
		"section_focus",
		"note",
	]),
	pageUrl: z.string().url().optional().nullable(),
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
});

export const Route = createFileRoute("/api/sessions/$sessionId/context")({
	server: {
		handlers: {
			OPTIONS: async () => new Response(null, { headers: corsHeaders() }),
			POST: async ({ params, request }) => {
				try {
					const payload = bodySchema.parse(await parseRequestBody(request));
					const captureToken =
						request.headers.get("x-planmd-session-token") ??
						payload.captureToken?.trim() ??
						null;
					if (!captureToken) {
						return Response.json(
							{ error: "Missing session capture token" },
							{ status: 401, headers: corsHeaders() },
						);
					}

					const { captureToken: _ignored, ...eventPayload } = payload;
					const result = await ingestContextEvent({
						sessionId: params.sessionId,
						captureToken,
						...eventPayload,
					});

					return Response.json(result, {
						status: 201,
						headers: corsHeaders(),
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to ingest context event";
					const status =
						message === "Invalid capture token" ||
						message === "Missing session capture token"
							? 401
							: message === "Session not found"
								? 404
								: message === "Session is not live"
									? 409
								: error instanceof z.ZodError
									? 400
									: 500;

					return Response.json(
						{ error: message },
						{
							status,
							headers: corsHeaders(),
						},
					);
				}
			},
		},
	},
});

async function parseRequestBody(request: Request) {
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return request.json();
	}

	const text = await request.text();
	return JSON.parse(text);
}

function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, x-planmd-session-token",
	};
}
