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
		return null;
	}

	const reviewMap = new Map(reviews.map((r) => [r.reviewerId, r.status]));

	const approved = reviewers.filter(
		(r) => reviewMap.get(r.userId) === "approved",
	);
	const total = reviewers.length;

	return (
		<TooltipProvider>
			<div className="flex items-center gap-2">
				{/* Compact progress indicator */}
				<span className="text-xs font-medium text-[var(--sea-ink-soft)]">
					{approved.length}/{total}
				</span>
				<div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-[var(--line)]">
					{approved.length > 0 && (
						<div
							className="bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
							style={{
								width: `${(approved.length / total) * 100}%`,
							}}
						/>
					)}
				</div>

				{/* Reviewer badges */}
				<div className="flex gap-1">
					{reviewers.map((reviewer) => {
						const status = reviewMap.get(reviewer.userId);
						return (
							<Tooltip key={reviewer.userId}>
								<TooltipTrigger asChild>
									<div
										className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
											status === "approved"
												? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
												: status === "changes_requested"
													? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
													: "border-[var(--line)] bg-[var(--surface)] text-[var(--sea-ink-soft)] hover:bg-[var(--surface-strong)]"
										}`}
									>
										{status === "approved" ? (
											<CheckCircle2 className="h-2.5 w-2.5" />
										) : status === "changes_requested" ? (
											<AlertTriangle className="h-2.5 w-2.5" />
										) : (
											<Clock className="h-2.5 w-2.5" />
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
			</div>
		</TooltipProvider>
	);
}
