import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { ingestTranscriptChunk } from "#/common/lib/collaboration-server";
import { newId } from "#/common/lib/id";
import {
	detectInstruction,
	matchInstructionToContext,
} from "#/common/lib/regeneration";
import { transcribeWithDiarization } from "#/common/lib/transcription";
import { getDb } from "#/db";
import {
	planSessions,
	regenerationRequests,
	revisions,
	transcriptionJobs,
} from "#/db/schema";

export const Route = createFileRoute("/api/sessions/$sessionId/transcribe")({
	server: {
		handlers: {
			OPTIONS: async () => new Response(null, { headers: corsHeaders() }),
			POST: async ({ params, request }) => {
				try {
					const captureToken = request.headers.get("x-planmd-session-token");
					if (!captureToken) {
						return Response.json(
							{ error: "Missing session capture token" },
							{ status: 401, headers: corsHeaders() },
						);
					}

					// Validate session and token
					const db = getDb(env.planmd_db);
					const session = await db.query.planSessions.findFirst({
						where: eq(planSessions.id, params.sessionId),
					});
					if (!session) {
						return Response.json(
							{ error: "Session not found" },
							{ status: 404, headers: corsHeaders() },
						);
					}
					if (session.captureToken !== captureToken) {
						return Response.json(
							{ error: "Invalid capture token" },
							{ status: 401, headers: corsHeaders() },
						);
					}
					if (session.status !== "live") {
						return Response.json(
							{ error: "Session is not live" },
							{ status: 409, headers: corsHeaders() },
						);
					}

					// Parse multipart form data
					const formData = await request.formData();
					const audioFile = formData.get("audio");
					if (!audioFile || !(audioFile instanceof File)) {
						return Response.json(
							{ error: "Missing audio file in form data" },
							{ status: 400, headers: corsHeaders() },
						);
					}

					const chunkIndex = Number(formData.get("chunkIndex") ?? 0);
					const chunkStartMs = Number(
						formData.get("chunkStartMs") ?? Date.now(),
					);
					const chunkDurationMs = Number(formData.get("chunkDurationMs") ?? 0);
					const speakerHints = (formData.get("speakerHints") as string) || null;

					// Create transcription job record
					const jobId = newId();
					await db.insert(transcriptionJobs).values({
						id: jobId,
						sessionId: params.sessionId,
						chunkIndex,
						audioDurationMs: chunkDurationMs,
						speakerHints,
						status: "processing",
						createdAt: new Date(),
					});

					// Transcribe audio via OpenAI Whisper
					const audioBuffer = await audioFile.arrayBuffer();
					let segments: Array<{
						speakerName: string;
						text: string;
					}>;
					try {
						const result = await transcribeWithDiarization({
							audioBuffer,
							contentType: audioFile.type || "audio/webm",
							speakerHints,
						});
						segments = result.segments;
					} catch (err) {
						// Update job as failed
						const errorMsg =
							err instanceof Error ? err.message : "Transcription failed";
						await db
							.update(transcriptionJobs)
							.set({
								status: "failed",
								errorMessage: errorMsg,
								completedAt: new Date(),
							})
							.where(eq(transcriptionJobs.id, jobId));

						return Response.json(
							{ error: errorMsg },
							{ status: 502, headers: corsHeaders() },
						);
					}

					if (segments.length === 0) {
						await db
							.update(transcriptionJobs)
							.set({
								status: "completed",
								transcriptText: "",
								completedAt: new Date(),
							})
							.where(eq(transcriptionJobs.id, jobId));

						return Response.json(
							{ chunks: [] },
							{ status: 200, headers: corsHeaders() },
						);
					}

					// Store each segment as a transcript chunk
					const chunks: Array<{
						chunkId: string;
						transcriptText: string;
						speakerName: string;
					}> = [];

					for (const segment of segments) {
						const result = await ingestTranscriptChunk({
							sessionId: params.sessionId,
							captureToken,
							speakerName: segment.speakerName,
							text: segment.text,
							occurredAt: chunkStartMs,
							source: "bot",
						});

						chunks.push({
							chunkId: result.chunkId,
							transcriptText: segment.text,
							speakerName: segment.speakerName,
						});

						// Intent detection: check if this transcript contains instructional language
						const occurredAt = chunkStartMs || Date.now();
						if (detectInstruction(segment.text)) {
							const match = await matchInstructionToContext(
								params.sessionId,
								occurredAt,
							);
							if (match) {
								// Find the latest revision for this plan
								const latestRevision = await db.query.revisions.findFirst({
									where: eq(revisions.planId, session.planId),
									orderBy: desc(revisions.revisionNumber),
								});

								if (latestRevision) {
									await db.insert(regenerationRequests).values({
										id: newId(),
										sessionId: params.sessionId,
										planId: session.planId,
										revisionId: latestRevision.id,
										contextEventId: match.eventId,
										transcriptChunkId: result.chunkId,
										targetSection: match.activeSection,
										targetStartLine: match.selectedStartLine,
										targetEndLine: match.selectedEndLine,
										highlightedText: match.selectedText,
										userInstruction: segment.text,
										transcriptWindowStart: occurredAt - 300_000,
										transcriptWindowEnd: occurredAt,
										status: "detected",
										originalContent: match.selectedText,
										createdAt: new Date(),
										createdBy: session.createdBy,
									});
								}
							}
						}
					}

					// Update job as completed
					await db
						.update(transcriptionJobs)
						.set({
							status: "completed",
							transcriptText: segments.map((s) => s.text).join(" "),
							transcriptChunkId: chunks[0]?.chunkId ?? null,
							completedAt: new Date(),
						})
						.where(eq(transcriptionJobs.id, jobId));

					return Response.json(
						{ chunks },
						{ status: 201, headers: corsHeaders() },
					);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to process transcription";
					const status =
						message === "Invalid capture token"
							? 401
							: message === "Session not found"
								? 404
								: message === "Session is not live"
									? 409
									: 500;

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
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, x-planmd-session-token",
	};
}
