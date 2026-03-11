import { createFileRoute, redirect } from "@tanstack/react-router";
import { getMyPlans } from "#/common/api/plans";
import { getSession } from "#/common/lib/auth-guard";
import HomePage from "./-index/components/HomePage";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session?.user) {
			throw redirect({ to: "/sign-in/$", params: { _splat: "" } });
		}
	},
	loader: async () => {
		return await getMyPlans();
	},
	component: DashboardPage,
});

function DashboardPage() {
	const data = Route.useLoaderData();
	return <HomePage {...data} />;
}
