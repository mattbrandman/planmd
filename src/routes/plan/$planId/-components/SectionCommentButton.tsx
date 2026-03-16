import { MessageSquare } from "lucide-react";

interface SectionCommentButtonProps {
	count: number;
	onClick: () => void;
	disabled?: boolean;
}

export default function SectionCommentButton({
	count,
	onClick,
	disabled = false,
}: SectionCommentButtonProps) {
	if (disabled) return null;

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-0.5 align-middle text-xs font-medium text-[var(--sea-ink-soft)] opacity-0 shadow-sm transition-all hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)] group-hover:opacity-100 focus:opacity-100"
			aria-label="Add comment on this section"
		>
			<MessageSquare className="h-3 w-3" />
			{count > 0 && count}
		</button>
	);
}
