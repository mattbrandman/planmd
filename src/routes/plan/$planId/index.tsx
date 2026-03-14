import { createFileRoute } from "@tanstack/react-router";
import { getPlanWorkspace } from "#/common/api/collaboration";
import { getPlan } from "#/common/api/plans";
import { authGuard, getSession } from "#/common/lib/auth-guard";
import PlanDetailPage from "./-components/PlanDetailPage";

export const Route = createFileRoute("/plan/$planId/")({
	head: () => ({
		meta: [{ title: "Plan | planmd" }],
	}),
	beforeLoad: async () => await authGuard(),
	loader: async ({ params }) => {
		const [planData, workspace, session] = await Promise.all([
			getPlan({ data: { planId: params.planId } }),
			getPlanWorkspace({ data: { planId: params.planId } }),
			getSession(),
		]);
		return { ...planData, ...workspace, currentUser: session?.user ?? null };
	},
	component: PlanDetailView,
});

function PlanDetailView() {
	const data = Route.useLoaderData();
	return <PlanDetailPage {...data} />;
}
