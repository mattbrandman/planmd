import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth } from "#/common/lib/auth-guard";
import { getDb } from "#/db";
import { regenerationRequests } from "#/db/schema";

export const Route = createFileRoute("/api/sessions/$sessionId/regeneration/")({
	server: {
		handlers: {
			OPTIONS: async () => new Response(null, { headers: corsHeaders() }),
			GET: async ({ params }) => {
				try {
					await requireAuth();
					const db = getDb(env.planmd_db);

					const requests = await db
						.select()
						.from(regenerationRequests)
						.where(
							and(
								eq(regenerationRequests.sessionId, params.sessionId),
								inArray(regenerationRequests.status, [
									"detected",
									"generating",
									"ready",
								]),
							),
						)
						.orderBy(desc(regenerationRequests.createdAt));

					return Response.json({ requests }, { headers: corsHeaders() });
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to fetch regeneration requests";
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
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}
