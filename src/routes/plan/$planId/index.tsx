import { createFileRoute } from "@tanstack/react-router";
import { getPlan } from "#/common/api/plans";
import { getSession } from "#/common/lib/auth-guard";
import PlanDetailPage from "./-components/PlanDetailPage";

export const Route = createFileRoute("/plan/$planId/")({
	head: () => ({
		meta: [{ title: "Plan | planmd" }],
	}),
	loader: async ({ params }) => {
		const [planData, session] = await Promise.all([
			getPlan({ data: { planId: params.planId } }),
			getSession(),
		]);
		return { ...planData, currentUser: session?.user ?? null };
	},
	component: PlanDetailView,
});

function PlanDetailView() {
	const data = Route.useLoaderData();
	return <PlanDetailPage {...data} />;
}
