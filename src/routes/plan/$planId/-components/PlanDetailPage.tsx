import { Link, useRouter } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	Clock,
	Code2,
	ExternalLink,
	Eye,
	EyeOff,
	FileText,
	History,
	Lightbulb,
	MessageSquare,
	Pencil,
	Send,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { addComment, submitReview, updatePlanStatus } from "#/common/api/plans";
import { Button } from "#/common/components/ui/button";
import { Separator } from "#/common/components/ui/separator";
import { Textarea } from "#/common/components/ui/textarea";
import CommentThread from "./CommentThread";
import ConsensusBar from "./ConsensusBar";
import type { LineRange } from "./LineNumberedContent";
import LineNumberedContent from "./LineNumberedContent";
import RevisionEditor from "./RevisionEditor";
import SectionCommentButton from "./SectionCommentButton";

const STATUS_CONFIG = {
	draft: {
		label: "Draft",
		icon: Clock,
		bg: "bg-[var(--surface)]",
		text: "text-[var(--sea-ink-soft)]",
		border: "border-[var(--line)]",
	},
	review: {
		label: "In Review",
		icon: MessageSquare,
		bg: "bg-amber-50 dark:bg-amber-950/30",
		text: "text-amber-700 dark:text-amber-400",
		border: "border-amber-200 dark:border-amber-800",
	},
	approved: {
		label: "Approved",
		icon: CheckCircle2,
		bg: "bg-emerald-50 dark:bg-emerald-950/30",
		text: "text-emerald-700 dark:text-emerald-400",
		border: "border-emerald-200 dark:border-emerald-800",
	},
	implemented: {
		label: "Implemented",
		icon: CheckCircle2,
		bg: "bg-sky-50 dark:bg-sky-950/30",
		text: "text-sky-700 dark:text-sky-400",
		border: "border-sky-200 dark:border-sky-800",
	},
} as const;

type PlanStatus = keyof typeof STATUS_CONFIG;

type ViewMode = "rendered" | "source";
type ComposerMode = "comment" | "suggest";

interface CommentData {
	id: string;
	planId: string;
	revisionId: string;
	authorId: string;
	sectionId: string | null;
	startLine: number | null;
	endLine: number | null;
	parentId: string | null;
	body: string;
	resolved: boolean;
	originalCommentId: string | null;
	originalRevisionId: string | null;
	outdated: boolean;
	contextSnapshot: string | null;
	suggestionType: string | null;
	suggestionContent: string | null;
	suggestionApplied: boolean;
	createdAt: Date;
	updatedAt: Date;
}

interface PlanDetailProps {
	plan: {
		id: string;
		title: string;
		description: string | null;
		status: PlanStatus;
		authorId: string;
		githubUrl: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	revisions: Array<{
		id: string;
		planId: string;
		revisionNumber: number;
		content: string;
		summary: string | null;
		authorId: string;
		createdAt: Date;
	}>;
	latestRevision: {
		id: string;
		planId: string;
		revisionNumber: number;
		content: string;
		summary: string | null;
		authorId: string;
		createdAt: Date;
	} | null;
	participants: Array<{
		id: string;
		planId: string;
		userId: string;
		role: string;
		createdAt: Date;
	}>;
	reviews: Array<{
		id: string;
		planId: string;
		revisionId: string;
		reviewerId: string;
		status: string;
		body: string | null;
		createdAt: Date;
	}>;
	comments: CommentData[];
	currentUser: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
}

export default function PlanDetailPage({
	plan,
	revisions,
	latestRevision,
	participants,
	reviews,
	comments,
	currentUser,
}: PlanDetailProps) {
	const router = useRouter();
	const isAuthor = currentUser?.id === plan.authorId;

	const [editing, setEditing] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>("rendered");
	const [activeSection, setActiveSection] = useState<string | null>(null);
	const [selectedLines, setSelectedLines] = useState<LineRange | null>(null);
	const [highlightedLines, setHighlightedLines] = useState<LineRange | null>(
		null,
	);
	const [commentDraft, setCommentDraft] = useState("");
	const [submittingComment, setSubmittingComment] = useState(false);
	const [showOutdated, setShowOutdated] = useState(true);
	const [composerMode, setComposerMode] = useState<ComposerMode>("comment");
	const [suggestionContent, setSuggestionContent] = useState("");
	const [generalComposing, setGeneralComposing] = useState(false);

	const content = latestRevision?.content ?? "";
	const contentLines = useMemo(() => content.split("\n"), [content]);

	// Build revision number lookup from originalRevisionId
	const revisionNumberById = useMemo(() => {
		const map = new Map<string, number>();
		for (const rev of revisions) {
			map.set(rev.id, rev.revisionNumber);
		}
		return map;
	}, [revisions]);

	// Filter comments by outdated visibility
	const visibleComments = useMemo(
		() => (showOutdated ? comments : comments.filter((c) => !c.outdated)),
		[comments, showOutdated],
	);

	// Count outdated vs total
	const outdatedCount = useMemo(
		() => comments.filter((c) => c.outdated && !c.parentId).length,
		[comments],
	);

	// Separate section-level and line-level top-level comments
	const sectionComments = useMemo(
		() => visibleComments.filter((c) => c.startLine == null && !c.parentId),
		[visibleComments],
	);

	const lineComments = useMemo(
		() => visibleComments.filter((c) => c.startLine != null && !c.parentId),
		[visibleComments],
	);

	// Group section comments by sectionId
	const commentsBySection = useMemo(() => {
		const grouped = new Map<string | null, typeof comments>();
		for (const comment of sectionComments) {
			const key = comment.sectionId;
			const existing = grouped.get(key) ?? [];
			existing.push(comment);
			grouped.set(key, existing);
		}
		return grouped;
	}, [sectionComments]);

	// Sort line comments by start line
	const lineCommentGroups = useMemo(() => {
		return [...lineComments].sort(
			(a, b) => (a.startLine ?? 0) - (b.startLine ?? 0),
		);
	}, [lineComments]);

	// Get replies for a comment
	const getReplies = useCallback(
		(parentId: string) => {
			return visibleComments.filter((c) => c.parentId === parentId);
		},
		[visibleComments],
	);

	// Get the target lines text for a comment (used for suggestion diffs)
	const getTargetLines = useCallback(
		(comment: CommentData) => {
			if (comment.startLine == null) return undefined;
			const endLine = comment.endLine ?? comment.startLine;
			return contentLines.slice(comment.startLine - 1, endLine).join("\n");
		},
		[contentLines],
	);

	// Get original revision number for provenance display
	const getOriginalRevisionNumber = useCallback(
		(comment: CommentData) => {
			if (!comment.originalRevisionId) return null;
			return revisionNumberById.get(comment.originalRevisionId) ?? null;
		},
		[revisionNumberById],
	);

	const reviewers = participants.filter((p) => p.role === "reviewer");

	const isComposing =
		activeSection !== null || selectedLines !== null || generalComposing;
	const hasAnyComments =
		commentsBySection.size > 0 || lineCommentGroups.length > 0;
	const totalTopLevel = comments.filter((c) => !c.parentId).length;

	async function handleAddSectionComment(sectionId: string | null) {
		if (!commentDraft.trim() || !latestRevision) return;
		setSubmittingComment(true);
		try {
			await addComment({
				data: {
					planId: plan.id,
					revisionId: latestRevision.id,
					sectionId,
					startLine: null,
					endLine: null,
					parentId: null,
					body: commentDraft.trim(),
				},
			});
			setCommentDraft("");
			setActiveSection(null);
			router.invalidate();
		} finally {
			setSubmittingComment(false);
		}
	}

	async function handleAddGeneralComment() {
		if (!commentDraft.trim() || !latestRevision) return;
		setSubmittingComment(true);
		try {
			await addComment({
				data: {
					planId: plan.id,
					revisionId: latestRevision.id,
					sectionId: null,
					startLine: null,
					endLine: null,
					parentId: null,
					body: commentDraft.trim(),
				},
			});
			setCommentDraft("");
			setGeneralComposing(false);
			router.invalidate();
		} finally {
			setSubmittingComment(false);
		}
	}

	async function handleAddLineComment() {
		if (!commentDraft.trim() || !latestRevision || !selectedLines) return;
		setSubmittingComment(true);

		const isSuggestion = composerMode === "suggest" && suggestionContent.trim();

		try {
			await addComment({
				data: {
					planId: plan.id,
					revisionId: latestRevision.id,
					sectionId: null,
					startLine: selectedLines.start,
					endLine:
						selectedLines.end !== selectedLines.start
							? selectedLines.end
							: null,
					parentId: null,
					body: commentDraft.trim(),
					suggestionType: isSuggestion ? "replace" : null,
					suggestionContent: isSuggestion ? suggestionContent : null,
				},
			});
			setCommentDraft("");
			setSuggestionContent("");
			setSelectedLines(null);
			setComposerMode("comment");
			router.invalidate();
		} finally {
			setSubmittingComment(false);
		}
	}

	function handleLineSelect(range: LineRange) {
		setSelectedLines(range);
		setActiveSection(null);
		setGeneralComposing(false);
		setHighlightedLines(null);
		// Pre-fill suggestion content with selected lines
		const selected = contentLines.slice(range.start - 1, range.end).join("\n");
		setSuggestionContent(selected);
	}

	function handleCommentLineClick(comment: {
		startLine: number | null;
		endLine: number | null;
	}) {
		if (comment.startLine == null) return;
		setHighlightedLines({
			start: comment.startLine,
			end: comment.endLine ?? comment.startLine,
		});
		if (viewMode !== "source") {
			setViewMode("source");
		}
	}

	async function handleSubmitReview(status: "approved" | "changes_requested") {
		if (!latestRevision) return;
		await submitReview({
			data: {
				planId: plan.id,
				revisionId: latestRevision.id,
				status,
			},
		});
		router.invalidate();
	}

	async function handleStatusChange(newStatus: PlanStatus) {
		await updatePlanStatus({
			data: { planId: plan.id, status: newStatus },
		});
		router.invalidate();
	}

	const statusConfig = STATUS_CONFIG[plan.status];
	const StatusIcon = statusConfig.icon;

	return (
		<main className="page-wrap px-4 pb-12 pt-8">
			{/* Plan header */}
			<header className="rise-in mb-6">
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<span
						className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
					>
						<StatusIcon className="h-3 w-3" />
						{statusConfig.label}
					</span>

					<span className="text-xs text-[var(--sea-ink-soft)]">
						Revision {latestRevision?.revisionNumber ?? 0} of {revisions.length}
					</span>

					{plan.githubUrl && (
						<a
							href={plan.githubUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-xs text-[var(--lagoon-deep)] no-underline hover:underline"
						>
							<ExternalLink className="h-3 w-3" />
							GitHub
						</a>
					)}
				</div>

				<h1 className="display-title mb-2 text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
					{plan.title}
				</h1>

				{plan.description && (
					<p className="text-base text-[var(--sea-ink-soft)]">
						{plan.description}
					</p>
				)}
			</header>

			{/* Consensus bar + actions */}
			<div
				className="island-shell rise-in mb-6 rounded-2xl p-5"
				style={{ animationDelay: "60ms" }}
			>
				<ConsensusBar reviewers={reviewers} reviews={reviews} />

				<Separator className="my-4" />

				<div className="flex flex-wrap items-center gap-2">
					{/* Author actions */}
					{isAuthor && plan.status === "draft" && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleStatusChange("review")}
							className="rounded-full"
						>
							<MessageSquare className="mr-1.5 h-3.5 w-3.5" />
							Open for Review
						</Button>
					)}
					{isAuthor && plan.status === "review" && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleStatusChange("approved")}
							className="rounded-full"
						>
							<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
							Mark Approved
						</Button>
					)}

					{/* Reviewer actions */}
					{!isAuthor &&
						plan.status === "review" &&
						reviewers.some((r) => r.userId === currentUser?.id) && (
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleSubmitReview("approved")}
									className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
								>
									<Check className="mr-1.5 h-3.5 w-3.5" />
									Approve
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleSubmitReview("changes_requested")}
									className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
								>
									<AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
									Request Changes
								</Button>
							</div>
						)}

					<div className="ml-auto flex gap-2">
						{/* View mode toggle */}
						<div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)]">
							<button
								type="button"
								onClick={() => setViewMode("rendered")}
								className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
									viewMode === "rendered"
										? "bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
										: "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
								}`}
							>
								<FileText className="h-3 w-3" />
								Rendered
							</button>
							<button
								type="button"
								onClick={() => setViewMode("source")}
								className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
									viewMode === "source"
										? "bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
										: "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
								}`}
							>
								<Code2 className="h-3 w-3" />
								Source
							</button>
						</div>

						{isAuthor && !editing && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setEditing(true)}
								className="rounded-full"
							>
								<Pencil className="mr-1.5 h-3.5 w-3.5" />
								Edit
							</Button>
						)}
						<Link
							to="/plan/$planId/history"
							params={{ planId: plan.id }}
							className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] no-underline transition hover:text-[var(--sea-ink)]"
						>
							<History className="h-3 w-3" />
							History
						</Link>
					</div>
				</div>
			</div>

			{/* Edit mode */}
			{editing ? (
				<div className="rise-in" style={{ animationDelay: "120ms" }}>
					<RevisionEditor
						planId={plan.id}
						currentTitle={plan.title}
						currentDescription={plan.description}
						currentGithubUrl={plan.githubUrl}
						currentContent={content}
						unresolvedCommentCount={
							comments.filter(
								(c) => !c.resolved && !c.parentId && !c.suggestionApplied,
							).length
						}
						onCancel={() => setEditing(false)}
					/>
				</div>
			) : (
				<>
					{/* Main content + comment sidebar */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
						{/* Content area */}
						<article
							className="island-shell rise-in rounded-2xl p-6 sm:p-8"
							style={{ animationDelay: "120ms" }}
						>
							{viewMode === "rendered" ? (
								<div className="prose prose-sm max-w-none">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										rehypePlugins={[rehypeSlug]}
										components={{
											h1: ({ children, id }) => (
												<SectionHeading
													id={id}
													level={1}
													commentCount={
														commentsBySection.get(id ?? null)?.length ?? 0
													}
													onComment={() => setActiveSection(id ?? null)}
												>
													{children}
												</SectionHeading>
											),
											h2: ({ children, id }) => (
												<SectionHeading
													id={id}
													level={2}
													commentCount={
														commentsBySection.get(id ?? null)?.length ?? 0
													}
													onComment={() => setActiveSection(id ?? null)}
												>
													{children}
												</SectionHeading>
											),
											h3: ({ children, id }) => (
												<SectionHeading
													id={id}
													level={3}
													commentCount={
														commentsBySection.get(id ?? null)?.length ?? 0
													}
													onComment={() => setActiveSection(id ?? null)}
												>
													{children}
												</SectionHeading>
											),
											p: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="p"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											ul: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="ul"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											ol: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="ol"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											blockquote: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="blockquote"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											pre: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="pre"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											table: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="table"
													onLineSelect={handleLineSelect}
													{...rest}
												>
													{children}
												</BlockCommentWrapper>
											),
											hr: ({ node, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="hr"
													onLineSelect={handleLineSelect}
													{...rest}
												/>
											),
										}}
									>
										{content}
									</ReactMarkdown>
								</div>
							) : (
								<LineNumberedContent
									content={content}
									onLineSelect={handleLineSelect}
									selectedLines={selectedLines}
									commentedLines={lineComments}
									highlightedLines={highlightedLines}
								/>
							)}
						</article>

						{/* Comment sidebar */}
						<aside
							className="rise-in space-y-4"
							style={{ animationDelay: "180ms" }}
						>
							{/* Comment count + outdated filter */}
							{totalTopLevel > 0 && (
								<div className="flex items-center justify-between px-1">
									<span className="text-xs text-[var(--sea-ink-soft)]">
										{totalTopLevel} comment{totalTopLevel !== 1 && "s"}
										{outdatedCount > 0 && (
											<span className="text-amber-600 dark:text-amber-400">
												{" "}
												({outdatedCount} outdated)
											</span>
										)}
									</span>
									{outdatedCount > 0 && (
										<button
											type="button"
											onClick={() => setShowOutdated(!showOutdated)}
											className="inline-flex items-center gap-1 text-[10px] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
										>
											{showOutdated ? (
												<>
													<EyeOff className="h-3 w-3" />
													Hide outdated
												</>
											) : (
												<>
													<Eye className="h-3 w-3" />
													Show outdated
												</>
											)}
										</button>
									)}
								</div>
							)}

							{/* Add comment button (always visible when not composing) */}
							{!isComposing && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => {
										setGeneralComposing(true);
										setSelectedLines(null);
										setActiveSection(null);
									}}
									className="w-full rounded-full"
								>
									<MessageSquare className="mr-1.5 h-3.5 w-3.5" />
									Add Comment
								</Button>
							)}

							{/* General comment composer */}
							{generalComposing && (
								<div className="island-shell rounded-2xl p-4">
									<h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
										New Comment
									</h3>
									<Textarea
										value={commentDraft}
										onChange={(e) => setCommentDraft(e.target.value)}
										placeholder="Share your thoughts on this plan..."
										rows={3}
										className="mb-2 resize-none rounded-xl text-sm"
										autoFocus
									/>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="brand"
											onClick={handleAddGeneralComment}
											disabled={!commentDraft.trim() || submittingComment}
											className="rounded-full"
										>
											<Send className="mr-1.5 h-3 w-3" />
											{submittingComment ? "Posting..." : "Comment"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setGeneralComposing(false);
												setCommentDraft("");
											}}
											className="rounded-full"
										>
											Cancel
										</Button>
									</div>
								</div>
							)}

							{/* Line-level comment composer */}
							{selectedLines !== null && (
								<div className="island-shell rounded-2xl p-4">
									<h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
										{composerMode === "suggest"
											? "Suggest change on"
											: "Comment on"}{" "}
										<span className="line-badge">
											{selectedLines.start === selectedLines.end
												? `L${selectedLines.start}`
												: `L${selectedLines.start}-${selectedLines.end}`}
										</span>
									</h3>

									{/* Comment / Suggest toggle */}
									<div className="mb-2 flex gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-0.5">
										<button
											type="button"
											onClick={() => setComposerMode("comment")}
											className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
												composerMode === "comment"
													? "bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
													: "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
											}`}
										>
											<MessageSquare className="h-3 w-3" />
											Comment
										</button>
										<button
											type="button"
											onClick={() => setComposerMode("suggest")}
											className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
												composerMode === "suggest"
													? "bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
													: "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
											}`}
										>
											<Lightbulb className="h-3 w-3" />
											Suggest
										</button>
									</div>

									{/* Suggestion editor */}
									{composerMode === "suggest" && (
										<div className="mb-2">
											<label
												htmlFor="suggestion-content"
												className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]"
											>
												Proposed change
											</label>
											<Textarea
												id="suggestion-content"
												value={suggestionContent}
												onChange={(e) => setSuggestionContent(e.target.value)}
												rows={4}
												className="resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] font-mono text-xs"
											/>
										</div>
									)}

									<Textarea
										value={commentDraft}
										onChange={(e) => setCommentDraft(e.target.value)}
										placeholder={
											composerMode === "suggest"
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
											onClick={handleAddLineComment}
											disabled={!commentDraft.trim() || submittingComment}
											className="rounded-full"
										>
											<Send className="mr-1.5 h-3 w-3" />
											{submittingComment
												? "Posting..."
												: composerMode === "suggest"
													? "Suggest"
													: "Comment"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setSelectedLines(null);
												setCommentDraft("");
												setSuggestionContent("");
												setComposerMode("comment");
											}}
											className="rounded-full"
										>
											Cancel
										</Button>
									</div>
								</div>
							)}

							{/* Section-level comment composer */}
							{activeSection !== null && (
								<div className="island-shell rounded-2xl p-4">
									<h3 className="mb-2 text-sm font-semibold text-[var(--sea-ink)]">
										Comment on{" "}
										<span className="font-mono text-[var(--lagoon-deep)]">
											#{activeSection || "top"}
										</span>
									</h3>
									<Textarea
										value={commentDraft}
										onChange={(e) => setCommentDraft(e.target.value)}
										placeholder="Share your thoughts on this section..."
										rows={3}
										className="mb-2 resize-none rounded-xl text-sm"
										autoFocus
									/>
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="brand"
											onClick={() => handleAddSectionComment(activeSection)}
											disabled={!commentDraft.trim() || submittingComment}
											className="rounded-full"
										>
											<Send className="mr-1.5 h-3 w-3" />
											{submittingComment ? "Posting..." : "Comment"}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setActiveSection(null);
												setCommentDraft("");
											}}
											className="rounded-full"
										>
											Cancel
										</Button>
									</div>
								</div>
							)}

							{/* Line-level comments */}
							{lineCommentGroups.length > 0 && (
								<div className="space-y-2">
									<h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
										Line Comments
									</h4>
									{lineCommentGroups.map((comment) => (
										<div key={comment.id}>
											<button
												type="button"
												className="line-badge mb-1 cursor-pointer transition hover:bg-[rgba(79,184,178,0.2)]"
												onClick={() => handleCommentLineClick(comment)}
											>
												{comment.startLine != null &&
												comment.endLine != null &&
												comment.endLine !== comment.startLine
													? `L${comment.startLine}-${comment.endLine}`
													: `L${comment.startLine}`}
											</button>
											<CommentThread
												comment={comment}
												replies={getReplies(comment.id)}
												planId={plan.id}
												revisionId={latestRevision?.id ?? ""}
												isAuthor={isAuthor}
												targetLines={getTargetLines(comment)}
												originalRevisionNumber={getOriginalRevisionNumber(
													comment,
												)}
											/>
										</div>
									))}
								</div>
							)}

							{/* Section-level comments */}
							{Array.from(commentsBySection.entries()).map(
								([sectionId, sectionCmts]) => (
									<div key={sectionId ?? "top"} className="space-y-2">
										<h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
											{sectionId ? `# ${sectionId}` : "General"}
										</h4>
										{sectionCmts.map((comment) => (
											<CommentThread
												key={comment.id}
												comment={comment}
												replies={getReplies(comment.id)}
												planId={plan.id}
												revisionId={latestRevision?.id ?? ""}
												isAuthor={isAuthor}
												originalRevisionNumber={getOriginalRevisionNumber(
													comment,
												)}
											/>
										))}
									</div>
								),
							)}

							{!hasAnyComments && !isComposing && (
								<div className="island-shell rounded-2xl p-6 text-center">
									<MessageSquare className="mx-auto mb-2 h-6 w-6 text-[var(--sea-ink-soft)]" />
									<p className="text-sm text-[var(--sea-ink-soft)]">
										No comments yet. Use the button above to start a discussion,
										or switch to Source view to comment on specific lines.
									</p>
								</div>
							)}
						</aside>
					</div>
				</>
			)}
		</main>
	);
}

// ── Section heading with comment button ────────────────────────────────────────

function SectionHeading({
	id,
	level,
	commentCount,
	onComment,
	children,
}: {
	id: string | undefined;
	level: number;
	commentCount: number;
	onComment: () => void;
	children: ReactNode;
}) {
	const props = {
		id,
		className: "group relative",
		children: (
			<>
				{children}
				<SectionCommentButton count={commentCount} onClick={onComment} />
			</>
		),
	};

	if (level === 1) return <h1 {...props} />;
	if (level === 2) return <h2 {...props} />;
	return <h3 {...props} />;
}

// ── Block-level comment wrapper for rendered mode ──────────────────────────────

function BlockCommentWrapper({
	node,
	tag: Tag,
	onLineSelect,
	children,
	...props
}: {
	node?: { position?: { start: { line: number }; end: { line: number } } };
	tag: "p" | "ul" | "ol" | "blockquote" | "pre" | "table" | "hr";
	onLineSelect: (range: { start: number; end: number }) => void;
	children?: ReactNode;
	[key: string]: unknown;
}) {
	const startLine = node?.position?.start.line;
	const endLine = node?.position?.end.line;

	if (startLine == null) {
		return <Tag {...props}>{children}</Tag>;
	}

	return (
		<div className="-mx-2 rounded-lg px-2 transition-colors group/block relative hover:bg-[var(--lagoon)]/[0.04] dark:hover:bg-[var(--lagoon)]/[0.08]">
			<Tag {...props}>{children}</Tag>
			<button
				type="button"
				onClick={() =>
					onLineSelect({ start: startLine, end: endLine ?? startLine })
				}
				className="absolute -right-2 top-1 translate-x-full opacity-0 transition-all group-hover/block:opacity-100 focus:opacity-100"
				aria-label={`Comment on line${endLine && endLine !== startLine ? `s ${startLine}-${endLine}` : ` ${startLine}`}`}
			>
				<span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--sea-ink-soft)] shadow-sm transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)]">
					<MessageSquare className="h-3 w-3" />
				</span>
			</button>
		</div>
	);
}
