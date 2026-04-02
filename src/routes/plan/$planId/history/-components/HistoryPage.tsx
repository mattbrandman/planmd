import { Link } from "@tanstack/react-router";
import { ArrowLeft, GitBranch } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { computeDiff } from "#/common/lib/diff";

interface Revision {
	id: string;
	planId: string;
	revisionNumber: number;
	content: string;
	summary: string | null;
	authorId: string;
	createdAt: Date;
}

interface HistoryPageProps {
	plan: {
		id: string;
		title: string;
	};
	revisions: Revision[];
}

export default function HistoryPage({ plan, revisions }: HistoryPageProps) {
	const [selectedIdx, setSelectedIdx] = useState(0);
	const [compareIdx, setCompareIdx] = useState(revisions.length > 1 ? 1 : null);

	const selected = revisions[selectedIdx];
	const compare = compareIdx !== null ? revisions[compareIdx] : null;

	const diffLines = useMemo(() => {
		if (!compare || !selected) return null;
		return computeDiff(compare.content, selected.content);
	}, [selected, compare]);

	return (
		<main className="page-wrap px-4 pb-12 pt-8">
			<div className="rise-in mb-6">
				<Link
					to="/plan/$planId"
					params={{ planId: plan.id }}
					className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--sea-ink-soft)] no-underline hover:text-[var(--sea-ink)]"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Back to plan
				</Link>
				<h1 className="display-title text-2xl font-bold text-[var(--sea-ink)] sm:text-3xl">
					Revision History
				</h1>
				<p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
					{plan.title} &mdash; {revisions.length} revision
					{revisions.length !== 1 && "s"}
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
				{/* Revision timeline */}
				<aside className="rise-in" style={{ animationDelay: "60ms" }}>
					<div className="island-shell rounded-2xl p-4">
						<h2 className="mb-3 text-sm font-semibold text-[var(--sea-ink)]">
							Revisions
						</h2>
						<div className="space-y-1">
							{revisions.map((rev, idx) => (
								<button
									key={rev.id}
									type="button"
									onClick={() => setSelectedIdx(idx)}
									className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition ${
										idx === selectedIdx
											? "bg-[rgba(79,184,178,0.12)] text-[var(--lagoon-deep)]"
											: "text-[var(--sea-ink-soft)] hover:bg-[var(--surface)]"
									}`}
								>
									<GitBranch className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
									<div className="min-w-0">
										<div className="text-sm font-medium">
											v{rev.revisionNumber}
										</div>
										{rev.summary && (
											<div className="truncate text-xs opacity-75">
												{rev.summary}
											</div>
										)}
										<div className="text-xs opacity-60">
											{formatDate(rev.createdAt)}
										</div>
									</div>
								</button>
							))}
						</div>
					</div>

					{revisions.length > 1 && (
						<div className="mt-4 island-shell rounded-2xl p-4">
							<h2 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
								Compare with
							</h2>
							<select
								value={compareIdx ?? ""}
								onChange={(e) =>
									setCompareIdx(
										e.target.value === "" ? null : Number(e.target.value),
									)
								}
								className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)]"
							>
								<option value="">None (view only)</option>
								{revisions.map(
									(rev, idx) =>
										idx !== selectedIdx && (
											<option key={rev.id} value={idx}>
												v{rev.revisionNumber}
												{rev.summary ? ` — ${rev.summary}` : ""}
											</option>
										),
								)}
							</select>
						</div>
					)}
				</aside>

				{/* Content / diff view */}
				<div
					className="island-shell rise-in rounded-2xl p-6 sm:p-8"
					style={{ animationDelay: "120ms" }}
				>
					{diffLines ? (
						<div>
							<div className="mb-4 flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
								<span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
									v{compare?.revisionNumber}
								</span>
								<span>&rarr;</span>
								<span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
									v{selected?.revisionNumber}
								</span>
							</div>
							<pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[#1d2e45] p-4 text-sm leading-6">
								{diffLines.map((line, i) => (
									<div
										key={i}
										className={`${
											line.type === "add"
												? "bg-emerald-900/30 text-emerald-300"
												: line.type === "remove"
													? "bg-red-900/30 text-red-300"
													: "text-slate-300"
										}`}
									>
										<span className="mr-2 inline-block w-8 select-none text-right text-xs opacity-40">
											{line.oldLineNumber ?? " "}
										</span>
										<span className="mr-2 inline-block w-8 select-none text-right text-xs opacity-40">
											{line.newLineNumber ?? " "}
										</span>
										<span className="mr-3 inline-block w-4 select-none text-right opacity-50">
											{line.type === "add"
												? "+"
												: line.type === "remove"
													? "-"
													: " "}
										</span>
										{line.text}
									</div>
								))}
							</pre>
						</div>
					) : selected ? (
						<div className="prose prose-sm max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
								{selected.content}
							</ReactMarkdown>
						</div>
					) : (
						<p className="text-sm text-[var(--sea-ink-soft)]">
							Select a revision to view
						</p>
					)}
				</div>
			</div>
		</main>
	);
}

function formatDate(date: Date): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
