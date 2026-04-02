import { Lightbulb, MessageSquare, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/common/components/ui/button";
import { Textarea } from "#/common/components/ui/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "#/common/components/ui/toggle-group";
import type { LineRange } from "./LineNumberedContent";

type ComposerMode = "comment" | "suggest";

interface FloatingComposerProps {
	selectedLines: LineRange;
	initialSuggestion: string;
	submitting: boolean;
	onSubmit: (
		body: string,
		mode: ComposerMode,
		suggestionContent: string | null,
	) => void;
	onCancel: () => void;
}

/**
 * Self-contained comment composer that owns its own draft state
 * so keystrokes don't re-render the parent PlanDetailPage.
 */
export default function FloatingComposer({
	selectedLines,
	initialSuggestion,
	submitting,
	onSubmit,
	onCancel,
}: FloatingComposerProps) {
	const [mode, setMode] = useState<ComposerMode>("comment");
	const [draft, setDraft] = useState("");
	const [suggestion, setSuggestion] = useState(initialSuggestion);

	// Reset when selection changes
	useEffect(() => {
		setDraft("");
		setMode("comment");
		setSuggestion(initialSuggestion);
	}, [selectedLines.start, selectedLines.end, initialSuggestion]);

	const handleSubmit = () => {
		if (!draft.trim()) return;
		const isSuggestion = mode === "suggest" && suggestion.trim();
		onSubmit(
			draft.trim(),
			mode,
			isSuggestion ? suggestion : null,
		);
	};

	const lineLabel =
		selectedLines.start === selectedLines.end
			? `L${selectedLines.start}`
			: `L${selectedLines.start}-${selectedLines.end}`;

	return (
		<>
			<h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
				{mode === "suggest" ? "Suggest change on" : "Comment on"}{" "}
				<span className="line-badge">{lineLabel}</span>
			</h3>

			<ToggleGroup
				type="single"
				value={mode}
				onValueChange={(v) => {
					if (v) setMode(v as ComposerMode);
				}}
				className="mb-2 rounded-full border border-[var(--line)] bg-[var(--surface)] p-0.5"
			>
				<ToggleGroupItem
					value="comment"
					className="rounded-full px-2.5 py-1 text-xs data-[state=on]:bg-[var(--surface-strong)] data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm"
				>
					<MessageSquare className="mr-1 h-3 w-3" />
					Comment
				</ToggleGroupItem>
				<ToggleGroupItem
					value="suggest"
					className="rounded-full px-2.5 py-1 text-xs data-[state=on]:bg-[var(--surface-strong)] data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm"
				>
					<Lightbulb className="mr-1 h-3 w-3" />
					Suggest
				</ToggleGroupItem>
			</ToggleGroup>

			{mode === "suggest" && (
				<div className="mb-2">
					<label
						htmlFor="suggestion-content"
						className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]"
					>
						Proposed change
					</label>
					<Textarea
						id="suggestion-content"
						value={suggestion}
						onChange={(e) => setSuggestion(e.target.value)}
						rows={4}
						className="resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] font-mono text-xs"
					/>
				</div>
			)}

			<Textarea
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				placeholder={
					mode === "suggest"
						? "Explain your suggestion..."
						: "Share your thoughts on these lines..."
				}
				rows={3}
				className="mb-2 resize-none rounded-xl text-sm"
				autoFocus
			/>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="brand"
					onClick={handleSubmit}
					disabled={!draft.trim() || submitting}
					className="rounded-full"
				>
					<Send className="mr-1.5 h-3 w-3" />
					{submitting
						? "Posting..."
						: mode === "suggest"
							? "Suggest"
							: "Comment"}
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
