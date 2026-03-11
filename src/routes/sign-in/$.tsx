import { createFileRoute } from "@tanstack/react-router";
import SignInPage from "./-SignInPage";

export const Route = createFileRoute("/sign-in/$")({
	head: () => ({
		meta: [{ title: "Sign In | planmd" }],
	}),
	component: SignInPage,
});
