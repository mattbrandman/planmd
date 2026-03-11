import { Show, SignInButton, UserButton } from "@clerk/tanstack-react-start";

export default function HeaderUser() {
	const isDevBypass =
		import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

	if (isDevBypass) {
		return (
			<div className="flex items-center gap-2">
				<span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
					dev
				</span>
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--lagoon)] text-xs font-bold text-white">
					D
				</div>
			</div>
		);
	}

	return (
		<>
			<Show when="signed-in">
				<UserButton />
			</Show>
			<Show when="signed-out">
				<SignInButton mode="redirect">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
					>
						Sign in
					</button>
				</SignInButton>
			</Show>
		</>
	);
}
