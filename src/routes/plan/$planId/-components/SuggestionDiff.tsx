import { computeDiff } from "#/common/lib/diff";

interface SuggestionDiffProps {
	oldText: string;
	newText: string;
}

export default function SuggestionDiff({
	oldText,
	newText,
}: SuggestionDiffProps) {
	const diffLines = computeDiff(oldText, newText);

	return (
		<pre className="my-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[#1d2e45] p-3 text-xs leading-5">
			{diffLines.map((line, i) => (
				<div
					key={i}
					className={
						line.type === "add"
							? "bg-emerald-900/30 text-emerald-300"
							: line.type === "remove"
								? "bg-red-900/30 text-red-300"
								: "text-slate-300"
					}
				>
					<span className="mr-2 inline-block w-3 select-none text-right opacity-50">
						{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
					</span>
					{line.text}
				</div>
			))}
		</pre>
	);
}
