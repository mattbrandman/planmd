import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import ThemeToggle from "#/common/components/ThemeToggle";
import { brandButtonSurfaceClassName } from "#/common/components/ui/button";
import HeaderUser from "#/common/integrations/better-auth/header-user";
import { cn } from "#/common/lib/utils";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-lg">
			<nav className="page-wrap flex items-center justify-between gap-4 px-4 py-3">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-6">
					<Link
						to="/"
						className="group flex items-baseline gap-0.5 text-lg no-underline"
					>
						<span className="font-bold tracking-tight text-[var(--sea-ink)] transition-colors group-hover:text-[var(--lagoon-deep)]">
							plan
						</span>
						<span className="font-light text-[var(--lagoon)]">.md</span>
					</Link>

					<div className="hidden items-center gap-1 sm:flex">
						<Link
							to="/"
							className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] no-underline transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
							activeProps={{
								className:
									"rounded-lg px-3 py-1.5 text-sm font-medium no-underline bg-[var(--surface)] text-[var(--sea-ink)]",
							}}
							activeOptions={{ exact: true }}
						>
							Dashboard
						</Link>
					</div>
				</div>

				{/* Right: Actions */}
				<div className="flex items-center gap-3">
					<Link
						to="/plan/new"
						className={cn(
							brandButtonSurfaceClassName,
							"inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm/none no-underline",
						)}
					>
						<Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
						New Plan
					</Link>

					<div className="flex items-center gap-2">
						<ThemeToggle />
						<HeaderUser />
					</div>
				</div>
			</nav>
		</header>
	);
}
