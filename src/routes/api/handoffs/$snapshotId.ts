import { createFileRoute } from "@tanstack/react-router";
import { getPublishedSnapshotPayload } from "#/common/lib/collaboration-server";

export const Route = createFileRoute("/api/handoffs/$snapshotId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const data = await getPublishedSnapshotPayload(params.snapshotId);
					return Response.json(data);
				} catch (error) {
					return Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: "Failed to fetch handoff snapshot",
						},
						{ status: 404 },
					);
				}
			},
		},
	},
});
