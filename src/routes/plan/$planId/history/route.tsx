import { createFileRoute } from "@tanstack/react-router";
import { getPlan } from "#/common/api/plans";
import HistoryPage from "./-components/HistoryPage";

export const Route = createFileRoute("/plan/$planId/history")({
	head: () => ({
		meta: [{ title: "Revision History | planmd" }],
	}),
	loader: async ({ params }) => {
		const data = await getPlan({ data: { planId: params.planId } });
		return { plan: data.plan, revisions: data.revisions };
	},
	component: HistoryView,
});

function HistoryView() {
	const data = Route.useLoaderData();
	return <HistoryPage {...data} />;
}
