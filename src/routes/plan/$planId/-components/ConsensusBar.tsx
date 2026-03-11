import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "#/common/components/ui/tooltip";

interface ConsensusBarProps {
	reviewers: Array<{
		userId: string;
		role: string;
	}>;
	reviews: Array<{
		reviewerId: string;
		status: string;
	}>;
}

export default function ConsensusBar({
	reviewers,
	reviews,
}: ConsensusBarProps) {
	if (reviewers.length === 0) {
		return (
			<div className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
				<Clock className="h-4 w-4" />
				<span>No reviewers assigned yet</span>
			</div>
		);
	}

	const reviewMap = new Map(reviews.map((r) => [r.reviewerId, r.status]));

	const approved = reviewers.filter(
		(r) => reviewMap.get(r.userId) === "approved",
	);
	const changesRequested = reviewers.filter(
		(r) => reviewMap.get(r.userId) === "changes_requested",
	);
	const pending = reviewers.filter((r) => !reviewMap.has(r.userId));

	const total = reviewers.length;
	const approvedPct = total > 0 ? (approved.length / total) * 100 : 0;
	const changesRequestedPct =
		total > 0 ? (changesRequested.length / total) * 100 : 0;
	const pendingPct = total > 0 ? (pending.length / total) * 100 : 0;

	return (
		<div>
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
					Consensus
				</h3>
				<span className="text-xs text-[var(--sea-ink-soft)]">
					{approved.length}/{total} approved
				</span>
			</div>

			{/* Progress bar */}
			<div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface)]">
				{approvedPct > 0 && (
					<div
						className="bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
						style={{ width: `${approvedPct}%` }}
					/>
				)}
				{changesRequestedPct > 0 && (
					<div
						className="bg-amber-500 transition-all duration-500 dark:bg-amber-400"
						style={{ width: `${changesRequestedPct}%` }}
					/>
				)}
				{pendingPct > 0 && (
					<div
						className="bg-[var(--line)] transition-all duration-500"
						style={{ width: `${pendingPct}%` }}
					/>
				)}
			</div>

			{/* Reviewer badges */}
			<TooltipProvider>
				<div className="flex flex-wrap gap-1.5">
					{reviewers.map((reviewer) => {
						const status = reviewMap.get(reviewer.userId);
						return (
							<Tooltip key={reviewer.userId}>
								<TooltipTrigger asChild>
									<div
										className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition ${
											status === "approved"
												? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
												: status === "changes_requested"
													? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
													: "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)]"
										}`}
									>
										{status === "approved" ? (
											<CheckCircle2 className="h-3 w-3" />
										) : status === "changes_requested" ? (
											<AlertTriangle className="h-3 w-3" />
										) : (
											<Clock className="h-3 w-3" />
										)}
										{reviewer.userId.slice(0, 8)}
									</div>
								</TooltipTrigger>
								<TooltipContent>
									{status === "approved"
										? "Approved"
										: status === "changes_requested"
											? "Requested changes"
											: "Pending review"}
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			</TooltipProvider>
		</div>
	);
}
