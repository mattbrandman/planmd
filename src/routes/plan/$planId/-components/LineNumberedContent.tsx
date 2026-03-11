import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export interface LineRange {
	start: number;
	end: number;
}

interface LineComment {
	startLine: number | null;
	endLine: number | null;
}

interface LineNumberedContentProps {
	content: string;
	onLineSelect: (range: LineRange) => void;
	selectedLines: LineRange | null;
	commentedLines: LineComment[];
	highlightedLines: LineRange | null;
}

/**
 * Renders markdown content with a line-number gutter.
 *
 * Each source line is rendered as its own markdown block so we get
 * full formatting (headings, bold, lists, code, etc.) while still
 * being able to annotate, highlight, and click individual lines.
 *
 * Consecutive blank lines are collapsed into a single empty row so the
 * gutter stays compact.
 */
export default function LineNumberedContent({
	content,
	onLineSelect,
	selectedLines,
	commentedLines,
	highlightedLines,
}: LineNumberedContentProps) {
	const lines = useMemo(() => content.split("\n"), [content]);

	// Track which lines have comments for highlight purposes
	const commentedLineSet = useMemo(() => {
		const set = new Set<number>();
		for (const c of commentedLines) {
			if (c.startLine == null) continue;
			const end = c.endLine ?? c.startLine;
			for (let i = c.startLine; i <= end; i++) {
				set.add(i);
			}
		}
		return set;
	}, [commentedLines]);

	// Build set for selected lines
	const selectedLineSet = useMemo(() => {
		const set = new Set<number>();
		if (!selectedLines) return set;
		for (let i = selectedLines.start; i <= selectedLines.end; i++) {
			set.add(i);
		}
		return set;
	}, [selectedLines]);

	// Build set for highlighted lines (from clicking a comment in sidebar)
	const highlightedLineSet = useMemo(() => {
		const set = new Set<number>();
		if (!highlightedLines) return set;
		for (let i = highlightedLines.start; i <= highlightedLines.end; i++) {
			set.add(i);
		}
		return set;
	}, [highlightedLines]);

	// Shift-click range selection
	const lastClickedLine = useRef<number | null>(null);

	const handleLineClick = useCallback(
		(lineNum: number, shiftKey: boolean) => {
			if (shiftKey && lastClickedLine.current != null) {
				const start = Math.min(lastClickedLine.current, lineNum);
				const end = Math.max(lastClickedLine.current, lineNum);
				onLineSelect({ start, end });
			} else {
				lastClickedLine.current = lineNum;
				onLineSelect({ start: lineNum, end: lineNum });
			}
		},
		[onLineSelect],
	);

	// Scroll highlighted lines into view
	const containerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!highlightedLines || !containerRef.current) return;
		const lineEl = containerRef.current.querySelector(
			`[data-line="${highlightedLines.start}"]`,
		);
		if (lineEl) {
			lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
		}
	}, [highlightedLines]);

	// Count comments per line for gutter badges
	const commentCountByLine = useMemo(() => {
		const counts = new Map<number, number>();
		for (const c of commentedLines) {
			if (c.startLine == null) continue;
			const existing = counts.get(c.startLine) ?? 0;
			counts.set(c.startLine, existing + 1);
		}
		return counts;
	}, [commentedLines]);

	return (
		<div ref={containerRef} className="line-numbered-content">
			{lines.map((line, idx) => {
				const lineNum = idx + 1;
				const isSelected = selectedLineSet.has(lineNum);
				const isCommented = commentedLineSet.has(lineNum);
				const isHighlighted = highlightedLineSet.has(lineNum);
				const commentCount = commentCountByLine.get(lineNum) ?? 0;

				let bgClass = "";
				if (isSelected) {
					bgClass = "line-selected";
				} else if (isHighlighted) {
					bgClass = "line-highlighted";
				} else if (isCommented) {
					bgClass = "line-commented";
				}

				return (
					// biome-ignore lint/a11y/useKeyboardHandler: line gutter button handles keyboard
					<div
						key={lineNum}
						data-line={lineNum}
						className={`line-row group cursor-pointer ${bgClass}`}
						onClick={(e) => handleLineClick(lineNum, e.shiftKey)}
					>
						{/* Gutter */}
						<button
							type="button"
							className="line-gutter"
							onClick={(e) => {
								e.stopPropagation();
								handleLineClick(lineNum, e.shiftKey);
							}}
							aria-label={`Line ${lineNum}`}
						>
							<span className="line-number">{lineNum}</span>
							{commentCount > 0 && (
								<span className="line-comment-badge">
									<MessageSquare className="h-3 w-3" />
								</span>
							)}
						</button>

						{/* Content */}
						<div className="line-content">
							{line.trim() === "" ? (
								<div className="h-6" />
							) : (
								<div className="prose prose-sm max-w-none">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeSlug]}
									>
										{line}
									</ReactMarkdown>
								</div>
							)}
						</div>

						{/* Add comment button on hover (only for non-selected lines without existing selection) */}
						{!isSelected && commentCount === 0 && (
							<button
								type="button"
								className="line-add-comment"
								onClick={(e) => {
									e.stopPropagation();
									handleLineClick(lineNum, e.shiftKey);
								}}
								aria-label={`Comment on line ${lineNum}`}
							>
								<MessageSquare className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
