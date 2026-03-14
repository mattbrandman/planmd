import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { registerAgentRun } from "#/common/lib/collaboration-server";

const bodySchema = z.object({
	agentName: z.string().min(1).max(200),
	externalRunId: z.string().min(1).max(200),
	status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
	prUrl: z.string().url().optional().nullable(),
	branch: z.string().max(200).optional().nullable(),
	testSummary: z.string().max(5000).optional().nullable(),
	artifactUrl: z.string().url().optional().nullable(),
	suggestedPlanDelta: z.string().max(5000).optional().nullable(),
});

export const Route = createFileRoute("/api/handoffs/$snapshotId/agent-runs")({
	server: {
		handlers: {
			POST: async ({ params, request }) => {
				try {
					const callbackToken = extractCallbackToken(request);
					if (!callbackToken) {
						return Response.json(
							{ error: "Missing callback token" },
							{ status: 401 },
						);
					}

					const payload = bodySchema.parse(await request.json());
					const result = await registerAgentRun({
						snapshotId: params.snapshotId,
						callbackToken,
						...payload,
					});

					return Response.json(result, {
						status: result.updated ? 200 : 201,
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to register agent run";
					const status =
						message === "Invalid callback token"
							? 401
							: message === "Handoff snapshot not found"
								? 404
								: 400;

					return Response.json({ error: message }, { status });
				}
			},
		},
	},
});

function extractCallbackToken(request: Request) {
	const explicit = request.headers.get("x-planmd-callback-token");
	if (explicit) return explicit;

	const authorization = request.headers.get("authorization");
	if (!authorization) return null;

	const match = authorization.match(/^Bearer\s+(.+)$/i);
	return match?.[1] ?? null;
}
