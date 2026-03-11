import { Link } from "@tanstack/react-router";
import {
	CheckCircle2,
	Clock,
	FileText,
	MessageSquare,
	Plus,
} from "lucide-react";
import { Badge } from "#/common/components/ui/badge";

type Plan = {
	id: string;
	title: string;
	description: string | null;
	status: "draft" | "review" | "approved" | "implemented";
	authorId: string;
	githubUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type ParticipatingPlan = {
	plan: Plan;
	role: string;
};

interface HomePageProps {
	authored: Plan[];
	reviewing: ParticipatingPlan[];
	observing: ParticipatingPlan[];
}

const STATUS_CONFIG = {
	draft: {
		label: "Draft",
		icon: Clock,
		className:
			"bg-[var(--surface)] text-[var(--sea-ink-soft)] border-[var(--line)]",
	},
	review: {
		label: "In Review",
		icon: MessageSquare,
		className:
			"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
	},
	approved: {
		label: "Approved",
		icon: CheckCircle2,
		className:
			"bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
	},
	implemented: {
		label: "Implemented",
		icon: CheckCircle2,
		className:
			"bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
	},
} as const;

function StatusBadge({ status }: { status: Plan["status"] }) {
	const config = STATUS_CONFIG[status];
	const Icon = config.icon;
	return (
		<span
			className={`inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${config.className}`}
		>
			<Icon className="h-3 w-3" />
			{config.label}
		</span>
	);
}

function PlanCard({ plan }: { plan: Plan }) {
	const timeAgo = formatTimeAgo(plan.updatedAt);

	return (
		<Link
			to="/plan/$planId"
			params={{ planId: plan.id }}
			className="group block no-underline"
		>
			<article className="island-shell feature-card rounded-2xl p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--lagoon)]/30 hover:shadow-lg">
				<div className="mb-2 flex items-center gap-2">
					<StatusBadge status={plan.status} />
					<span className="text-xs text-[var(--sea-ink-soft)]">{timeAgo}</span>
				</div>

				<h3 className="m-0 mb-1.5 text-base font-semibold leading-snug text-[var(--sea-ink)] group-hover:text-[var(--lagoon-deep)]">
					{plan.title}
				</h3>

				{plan.description && (
					<p className="m-0 line-clamp-2 text-sm leading-relaxed text-[var(--sea-ink-soft)]">
						{plan.description}
					</p>
				)}
			</article>
		</Link>
	);
}

function EmptyState() {
	return (
		<div className="island-shell rise-in flex flex-col items-center rounded-2xl px-8 py-16 text-center">
			<div className="mb-4 rounded-full bg-[rgba(79,184,178,0.12)] p-4">
				<FileText className="h-8 w-8 text-[var(--lagoon)]" />
			</div>
			<h2 className="display-title mb-2 text-2xl font-bold text-[var(--sea-ink)]">
				No plans yet
			</h2>
			<p className="mb-6 max-w-md text-sm text-[var(--sea-ink-soft)]">
				Create your first plan to start collaborating. Write your ideas in
				markdown, invite reviewers, and reach consensus.
			</p>
			<Link
				to="/plan/new"
				className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
			>
				<Plus className="h-4 w-4" />
				Create a Plan
			</Link>
		</div>
	);
}

function PlanSection({
	title,
	plans,
	emptyText,
}: {
	title: string;
	plans: Plan[];
	emptyText: string;
}) {
	return (
		<section className="mb-8">
			<div className="mb-4 flex items-center gap-2">
				<h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">
					{title}
				</h2>
				<Badge variant="secondary" className="text-xs">
					{plans.length}
				</Badge>
			</div>
			{plans.length === 0 ? (
				<p className="text-sm text-[var(--sea-ink-soft)]">{emptyText}</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{plans.map((plan) => (
						<PlanCard key={plan.id} plan={plan} />
					))}
				</div>
			)}
		</section>
	);
}

export default function HomePage({
	authored,
	reviewing,
	observing,
}: HomePageProps) {
	const hasAnyPlans =
		authored.length > 0 || reviewing.length > 0 || observing.length > 0;

	if (!hasAnyPlans) {
		return (
			<main className="page-wrap px-4 pb-8 pt-14">
				<EmptyState />
			</main>
		);
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-10">
			<PlanSection
				title="Your Plans"
				plans={authored}
				emptyText="You haven't created any plans yet."
			/>
			<PlanSection
				title="Reviewing"
				plans={reviewing.map((p) => p.plan)}
				emptyText="No plans to review."
			/>
			{observing.length > 0 && (
				<PlanSection
					title="Observing"
					plans={observing.map((p) => p.plan)}
					emptyText=""
				/>
			)}
		</main>
	);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 30) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}
