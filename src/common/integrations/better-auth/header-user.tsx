import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { authClient } from "#/common/lib/auth-client";

export default function BetterAuthHeader() {
	const { data: session, isPending } = authClient.useSession();
	const isDevBypass =
		import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

	if (isPending && !isDevBypass) {
		return (
			<div className="h-8 w-8 animate-pulse rounded-full bg-[var(--line)]" />
		);
	}

	if (session?.user || isDevBypass) {
		const userName = session?.user?.name ?? "Dev";
		const userImage = session?.user?.image;

		return (
			<div className="flex items-center gap-2">
				{isDevBypass && (
					<span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
						dev
					</span>
				)}
				{userImage ? (
					<img
						src={userImage}
						alt={userName}
						className="h-8 w-8 rounded-full ring-2 ring-[var(--line)]"
					/>
				) : (
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--lagoon)] text-xs font-bold text-white">
						{userName.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
		);
	}

	return (
		<Link
			to="/sign-in/$"
			params={{ _splat: "" }}
			className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] no-underline transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
		>
			<LogIn className="h-3.5 w-3.5" />
			Sign in
		</Link>
	);
}
