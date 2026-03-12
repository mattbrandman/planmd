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
			onClick={onClick}
			className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full opacity-0 transition-all group-hover:opacity-100 focus:opacity-100"
			aria-label="Add comment on this section"
		>
			<span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--sea-ink-soft)] shadow-sm transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)]">
				<MessageSquare className="h-3 w-3" />
				{count > 0 && count}
			</span>
		</button>
	);
}
