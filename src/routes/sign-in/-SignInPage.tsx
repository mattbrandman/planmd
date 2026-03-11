import { FileText, Github } from "lucide-react";
import { Button } from "#/common/components/ui/button";
import { authClient } from "#/common/lib/auth-client";

export default function SignInPage() {
	async function handleGitHubSignIn() {
		await authClient.signIn.social({
			provider: "github",
			callbackURL: "/",
		});
	}

	return (
		<main className="flex min-h-[80vh] items-center justify-center px-4">
			<div className="island-shell rise-in w-full max-w-sm rounded-2xl p-8 text-center">
				<div className="mb-6 flex justify-center">
					<div className="rounded-full bg-[rgba(79,184,178,0.12)] p-4">
						<FileText className="h-8 w-8 text-[var(--lagoon)]" />
					</div>
				</div>

				<h1 className="display-title mb-2 text-2xl font-bold text-[var(--sea-ink)]">
					Sign in to planmd
				</h1>
				<p className="mb-8 text-sm text-[var(--sea-ink-soft)]">
					Collaborate on plans with your team. Review, discuss, and reach
					consensus.
				</p>

				<Button
					onClick={handleGitHubSignIn}
					className="w-full rounded-full bg-[#24292f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1b1f23] dark:bg-white dark:text-[#24292f] dark:hover:bg-neutral-100"
				>
					<Github className="mr-2 h-4 w-4" />
					Continue with GitHub
				</Button>

				<p className="mt-6 text-xs text-[var(--sea-ink-soft)]">
					By signing in, you agree to our terms of service.
				</p>
			</div>
		</main>
	);
}
