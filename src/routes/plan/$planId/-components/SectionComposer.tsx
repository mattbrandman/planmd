import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "#/common/components/ui/button";
import { Textarea } from "#/common/components/ui/textarea";

interface SectionComposerProps {
	sectionId: string;
	submitting: boolean;
	onSubmit: (body: string) => void;
	onCancel: () => void;
}

/**
 * Self-contained section comment composer — owns its own draft state
 * so keystrokes don't re-render the parent PlanDetailPage.
 */
export default function SectionComposer({
	sectionId,
	submitting,
	onSubmit,
	onCancel,
}: SectionComposerProps) {
	const [draft, setDraft] = useState("");

	return (
		<>
			<h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
				Comment on{" "}
				<span className="font-mono text-[var(--lagoon-deep)]">
					#{sectionId || "top"}
				</span>
			</h3>
			<Textarea
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				placeholder="Share your thoughts on this section..."
				rows={3}
				className="mb-2 resize-none rounded-xl text-sm"
				autoFocus
			/>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="brand"
					onClick={() => {
						if (draft.trim()) onSubmit(draft.trim());
					}}
					disabled={!draft.trim() || submitting}
					className="rounded-full"
				>
					<Send className="mr-1.5 h-3 w-3" />
					{submitting ? "Posting..." : "Comment"}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={onCancel}
					className="rounded-full"
				>
					Cancel
				</Button>
			</div>
		</>
	);
}
