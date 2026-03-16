import { createFileRoute } from "@tanstack/react-router";
import { getPlanWorkspace } from "#/common/api/collaboration";
import { getPlan } from "#/common/api/plans";
import { authGuard } from "#/common/lib/auth-guard";
import SessionsPage from "./-components/SessionsPage";

export const Route = createFileRoute("/plan/$planId/sessions")({
	head: () => ({
		meta: [{ title: "Sessions | planmd" }],
	}),
	beforeLoad: async () => await authGuard(),
	loader: async ({ params }) => {
		const [planData, workspace] = await Promise.all([
			getPlan({ data: { planId: params.planId } }),
			getPlanWorkspace({ data: { planId: params.planId } }),
		]);
		return {
			plan: planData.plan,
			sessions: workspace.sessions,
			snapshots: workspace.snapshots,
		};
	},
	component: SessionsView,
});

function SessionsView() {
	const data = Route.useLoaderData();
	return <SessionsPage {...data} />;
}
