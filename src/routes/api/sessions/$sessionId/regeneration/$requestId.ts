import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requireAuth } from "#/common/lib/auth-guard";
import { generateSectionReplacement } from "#/common/lib/regeneration";
import { getDb } from "#/db";
import {
	regenerationRequests,
	revisions,
	transcriptChunks,
} from "#/db/schema";

export const Route = createFileRoute(
	"/api/sessions/$sessionId/regeneration/$requestId",
)({
	server: {
		handlers: {
			OPTIONS: async () => new Response(null, { headers: corsHeaders() }),
			POST: async ({ params }) => {
				try {
					await requireAuth();
					const db = getDb(env.planmd_db);

					// Fetch the regeneration request
					const request = await db.query.regenerationRequests.findFirst({
						where: and(
							eq(regenerationRequests.id, params.requestId),
							eq(regenerationRequests.sessionId, params.sessionId),
						),
					});

					if (!request) {
						return Response.json(
							{ error: "Regeneration request not found" },
							{ status: 404, headers: corsHeaders() },
						);
					}

					if (
						request.status !== "detected" &&
						request.status !== "generating"
					) {
						return Response.json(
							{
								error: `Request is in "${request.status}" status, cannot regenerate`,
							},
							{ status: 409, headers: corsHeaders() },
						);
					}

					// Mark as generating
					await db
						.update(regenerationRequests)
						.set({ status: "generating" })
						.where(eq(regenerationRequests.id, request.id));

					// Load plan content from revision
					const revision = await db.query.revisions.findFirst({
						where: eq(revisions.id, request.revisionId),
					});
					if (!revision) {
						return Response.json(
							{ error: "Revision not found" },
							{ status: 404, headers: corsHeaders() },
						);
					}

					// Load recent transcript for context (5-minute window)
					const windowStart = request.transcriptWindowStart
						? new Date(
								typeof request.transcriptWindowStart === "number"
									? request.transcriptWindowStart
									: Number(request.transcriptWindowStart),
							)
						: new Date(Date.now() - 300_000);
					const windowEnd = request.transcriptWindowEnd
						? new Date(
								typeof request.transcriptWindowEnd === "number"
									? request.transcriptWindowEnd
									: Number(request.transcriptWindowEnd),
							)
						: new Date();

					const recentChunks = await db
						.select()
						.from(transcriptChunks)
						.where(
							and(
								eq(transcriptChunks.sessionId, params.sessionId),
								gte(transcriptChunks.occurredAt, windowStart),
								lte(transcriptChunks.occurredAt, windowEnd),
							),
						)
						.orderBy(asc(transcriptChunks.occurredAt));

					const recentTranscript = recentChunks
						.map((c) => `${c.speakerName ?? "Unknown"}: ${c.text}`)
						.join("\n");

					// Generate replacement via Claude
					const generatedContent = await generateSectionReplacement({
						planContent: revision.content,
						targetSection: request.targetSection,
						highlightedText: request.highlightedText ?? "",
						instruction: request.userInstruction,
						recentTranscript,
					});

					// Update request with generated content
					await db
						.update(regenerationRequests)
						.set({
							status: "ready",
							generatedContent,
							completedAt: new Date(),
						})
						.where(eq(regenerationRequests.id, request.id));

					return Response.json(
						{
							requestId: request.id,
							status: "ready",
							generatedContent,
							originalContent: request.originalContent,
							targetStartLine: request.targetStartLine,
							targetEndLine: request.targetEndLine,
						},
						{ status: 200, headers: corsHeaders() },
					);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to generate replacement";
					const status = message === "Unauthorized" ? 401 : 500;
					return Response.json(
						{ error: message },
						{ status, headers: corsHeaders() },
					);
				}
			},
			// PATCH to accept/dismiss
			PATCH: async ({ params, request: req }) => {
				try {
					await requireAuth();
					const db = getDb(env.planmd_db);

					const body = await req.json();
					const action = (body as { action?: string }).action;

					if (action !== "accepted" && action !== "dismissed") {
						return Response.json(
							{
								error: 'Invalid action. Use "accepted" or "dismissed".',
							},
							{ status: 400, headers: corsHeaders() },
						);
					}

					const request = await db.query.regenerationRequests.findFirst({
						where: and(
							eq(regenerationRequests.id, params.requestId),
							eq(regenerationRequests.sessionId, params.sessionId),
						),
					});

					if (!request) {
						return Response.json(
							{ error: "Regeneration request not found" },
							{ status: 404, headers: corsHeaders() },
						);
					}

					await db
						.update(regenerationRequests)
						.set({
							status: action,
							applied: action === "accepted",
							completedAt: new Date(),
						})
						.where(eq(regenerationRequests.id, request.id));

					return Response.json(
						{ requestId: request.id, status: action },
						{ headers: corsHeaders() },
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Failed to update request";
					const status = message === "Unauthorized" ? 401 : 500;
					return Response.json(
						{ error: message },
						{ status, headers: corsHeaders() },
					);
				}
			},
		},
	},
});

function corsHeaders() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}
