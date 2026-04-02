import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

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
	onLineSelect: (range: LineRange, selectedText?: string) => void;
	selectedLines: LineRange | null;
	commentedLines: LineComment[];
	highlightedLines: LineRange | null;
	onVisibleRangeChange?: (range: LineRange) => void;
}

/**
 * Renders literal markdown source with a line-number gutter.
 */
export default function LineNumberedContent({
	content,
	onLineSelect,
	selectedLines,
	commentedLines,
	highlightedLines,
	onVisibleRangeChange,
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

	// Capture drag-selected text across lines
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleMouseUp = () => {
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed) return;

			const selectedText = selection.toString().trim();
			if (!selectedText) return;

			// Walk up from anchor/focus nodes to find [data-line] attributes
			const findLineNum = (node: Node | null): number | null => {
				let el = node instanceof HTMLElement ? node : node?.parentElement;
				while (el && el !== container) {
					if (el.dataset.line) return Number(el.dataset.line);
					el = el.parentElement;
				}
				return null;
			};

			const anchorLine = findLineNum(selection.anchorNode);
			const focusLine = findLineNum(selection.focusNode);
			if (anchorLine == null || focusLine == null) return;

			const start = Math.min(anchorLine, focusLine);
			const end = Math.max(anchorLine, focusLine);
			onLineSelect({ start, end }, selectedText);
			selection.removeAllRanges();
		};

		container.addEventListener("mouseup", handleMouseUp);
		return () => container.removeEventListener("mouseup", handleMouseUp);
	}, [onLineSelect]);

	useEffect(() => {
		if (!onVisibleRangeChange || !containerRef.current) return;

		let frameId = 0;
		const reportVisibleRange = () => {
			frameId = 0;
			const lineElements = Array.from(
				containerRef.current?.querySelectorAll<HTMLElement>("[data-line]") ??
					[],
			);
			if (lineElements.length === 0) return;

			const visibleLines = lineElements
				.map((element) => ({
					line: Number(element.dataset.line),
					rect: element.getBoundingClientRect(),
				}))
				.filter(
					({ line, rect }) =>
						Number.isFinite(line) &&
						rect.bottom >= 0 &&
						rect.top <= window.innerHeight,
				)
				.map(({ line }) => line)
				.sort((left, right) => left - right);

			if (visibleLines.length === 0) return;
			onVisibleRangeChange({
				start: visibleLines[0],
				end: visibleLines[visibleLines.length - 1],
			});
		};

		const scheduleReport = () => {
			if (frameId !== 0) return;
			frameId = window.requestAnimationFrame(reportVisibleRange);
		};

		scheduleReport();
		window.addEventListener("scroll", scheduleReport, { passive: true });
		window.addEventListener("resize", scheduleReport);

		return () => {
			if (frameId !== 0) {
				window.cancelAnimationFrame(frameId);
			}
			window.removeEventListener("scroll", scheduleReport);
			window.removeEventListener("resize", scheduleReport);
		};
	}, [content, onVisibleRangeChange]);

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
							<pre className="line-source">{line || " "}</pre>
						</div>

						{/* Add comment button on hover — always rendered for stable layout */}
						<button
							type="button"
							className={`line-add-comment ${isSelected || commentCount > 0 ? "invisible pointer-events-none" : ""}`}
							onClick={(e) => {
								e.stopPropagation();
								handleLineClick(lineNum, e.shiftKey);
							}}
							aria-label={`Comment on line ${lineNum}`}
						>
							<MessageSquare className="h-3.5 w-3.5" />
						</button>
					</div>
				);
			})}
		</div>
	);
}
