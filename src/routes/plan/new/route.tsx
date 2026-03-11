import { createFileRoute } from "@tanstack/react-router";
import { authGuard } from "#/common/lib/auth-guard";
import NewPlanPage from "./-components/NewPlanPage";

export const Route = createFileRoute("/plan/new")({
	beforeLoad: async () => await authGuard(),
	head: () => ({
		meta: [{ title: "New Plan | planmd" }],
	}),
	component: NewPlanPage,
});
