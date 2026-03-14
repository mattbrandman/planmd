import { createFileRoute } from "@tanstack/react-router";
import { getPublicHandoffSnapshot } from "#/common/api/collaboration";
import PublicHandoffPage from "./-components/PublicHandoffPage";

export const Route = createFileRoute("/handoff/$publicSlug")({
	head: () => ({
		meta: [{ title: "Handoff Snapshot | planmd" }],
	}),
	loader: async ({ params }) => {
		return getPublicHandoffSnapshot({
			data: { publicSlug: params.publicSlug },
		});
	},
	component: PublicHandoffView,
});

function PublicHandoffView() {
	const data = Route.useLoaderData();
	return <PublicHandoffPage {...data} />;
}
