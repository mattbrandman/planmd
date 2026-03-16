import { Link, useRouter } from "@tanstack/react-router";
import { SignInButton } from "@clerk/tanstack-react-start";
import {
	AlertTriangle,
	ArrowLeft,
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
	Radio,
	Send,
	Square,
	X,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import {
	addContextEvent,
	createSession,
	endSession,
} from "#/common/api/collaboration";
import { addComment, submitReview, updatePlanStatus } from "#/common/api/plans";
import { Button } from "#/common/components/ui/button";
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
	sessions: Array<{
		session: {
			id: string;
			planId: string;
			status: "live" | "ended";
			meetingProvider: "google_meet" | "manual";
			title: string | null;
			captureToken: string;
			createdBy: string;
			startedAt: Date;
			endedAt: Date | null;
			createdAt: Date;
			updatedAt: Date;
		};
		transcriptChunks: Array<{
			id: string;
			sessionId: string;
			speakerName: string | null;
			text: string;
			occurredAt: Date;
			source: string;
			createdAt: Date;
		}>;
		contextEvents: Array<{
			id: string;
			sessionId: string;
			kind: string;
			pageUrl: string | null;
			repo: string | null;
			ref: string | null;
			path: string | null;
			visibleStartLine: number | null;
			visibleEndLine: number | null;
			selectedText: string | null;
			selectedStartLine: number | null;
			selectedEndLine: number | null;
			activeSection: string | null;
			payload: string | null;
			occurredAt: Date;
			createdAt: Date;
		}>;
		attentionItems: Array<{
			id: string;
			sessionId: string;
			kind: string;
			severity: "low" | "medium" | "high";
			anchorType: string;
			anchorId: string | null;
			summary: string;
			evidenceRefs: string | null;
			state: string;
			occurredAt: Date;
			createdAt: Date;
		}>;
	}>;
	snapshots: Array<{
		id: string;
		planId: string;
		revisionId: string;
		revisionNumber: number | null;
		status: string;
		isStale: boolean;
		publicSlug: string;
		callbackToken: string;
		sessionIds: string[];
		markdownContent: string;
		jsonContent: string;
		publishedAt: Date;
		createdBy: string;
		fetchUrl: string;
		writebackUrl: string;
		publicUrl: string;
		agentRuns: Array<{
			id: string;
			snapshotId: string;
			agentName: string;
			externalRunId: string;
			status: string;
			prUrl: string | null;
			branch: string | null;
			testSummary: string | null;
			artifactUrl: string | null;
			suggestedPlanDelta: string | null;
			createdAt: Date;
			updatedAt: Date;
		}>;
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
	sessions,
	comments,
	currentUser,
}: PlanDetailProps) {
	const router = useRouter();
	const isAuthor = currentUser?.id === plan.authorId;
	const canComment = currentUser != null;
	const activeSession =
		sessions.find((bundle) => bundle.session.status === "live") ?? null;

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
	const [commentError, setCommentError] = useState<string | null>(null);

	// Session controls (elevated from SessionWorkspace)
	const [showStartForm, setShowStartForm] = useState(false);
	const [sessionTitle, setSessionTitle] = useState("");
	const [sessionBusy, setSessionBusy] = useState<string | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);

	async function handleStartSession() {
		if (!canComment || activeSession) return;
		setSessionBusy("starting");
		setSessionError(null);
		try {
			await createSession({
				data: {
					planId: plan.id,
					title: sessionTitle.trim() || undefined,
					meetingProvider: "manual",
				},
			});
			setSessionTitle("");
			setShowStartForm(false);
			await router.invalidate();
		} catch (err) {
			setSessionError(
				err instanceof Error ? err.message : "Failed to start session",
			);
		} finally {
			setSessionBusy(null);
		}
	}

	async function handleEndSession() {
		if (!activeSession) return;
		setSessionBusy("ending");
		setSessionError(null);
		try {
			await endSession({ data: { sessionId: activeSession.session.id } });
			await router.invalidate();
		} catch (err) {
			setSessionError(
				err instanceof Error ? err.message : "Failed to end session",
			);
		} finally {
			setSessionBusy(null);
		}
	}
	const passiveEventRef = useRef<Map<string, { key: string; at: number }>>(
		new Map(),
	);
	const visibleRangeTimeoutRef = useRef<number | null>(null);

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

	const recordPlanInteraction = useCallback(
		(args: {
			kind: "page_view" | "selection" | "highlight" | "section_focus" | "note";
			interaction:
				| "plan_open"
				| "view_mode"
				| "visible_range"
				| "line_select"
				| "comment_highlight"
				| "section_focus";
			selectedLines?: LineRange | null;
			visibleLines?: LineRange | null;
			activeSection?: string | null;
			payload?: Record<string, unknown>;
			dedupeKey?: string;
			throttleMs?: number;
		}) => {
			if (!activeSession || typeof window === "undefined") return;

			const occurredAt = Date.now();
			const dedupeKey =
				args.dedupeKey ??
				JSON.stringify({
					kind: args.kind,
					interaction: args.interaction,
					activeSection: args.activeSection ?? null,
					selectedLines: args.selectedLines ?? null,
					visibleLines: args.visibleLines ?? null,
					viewMode,
				});
			const throttleMs = args.throttleMs ?? 1200;
			const previous = passiveEventRef.current.get(args.kind);
			if (
				previous &&
				previous.key === dedupeKey &&
				occurredAt - previous.at < throttleMs
			) {
				return;
			}

			passiveEventRef.current.set(args.kind, { key: dedupeKey, at: occurredAt });

			void addContextEvent({
				data: {
					sessionId: activeSession.session.id,
					kind: args.kind,
					pageUrl: window.location.href,
					path: `plans/${plan.id}`,
					visibleStartLine: args.visibleLines?.start ?? null,
					visibleEndLine: args.visibleLines?.end ?? null,
					selectedStartLine: args.selectedLines?.start ?? null,
					selectedEndLine: args.selectedLines?.end ?? null,
					activeSection: args.activeSection ?? null,
					payload: JSON.stringify({
						surface: "plan_detail",
						interaction: args.interaction,
						viewMode,
						revisionId: latestRevision?.id ?? null,
						revisionNumber: latestRevision?.revisionNumber ?? null,
						...args.payload,
					}),
					occurredAt,
				},
			}).catch(() => undefined);
		},
		[activeSession, latestRevision?.id, latestRevision?.revisionNumber, plan.id, viewMode],
	);

	const handleVisibleRangeChange = useCallback(
		(range: LineRange) => {
			if (!activeSession || viewMode !== "source") return;

			if (visibleRangeTimeoutRef.current != null) {
				window.clearTimeout(visibleRangeTimeoutRef.current);
			}

			visibleRangeTimeoutRef.current = window.setTimeout(() => {
				recordPlanInteraction({
					kind: "page_view",
					interaction: "visible_range",
					visibleLines: range,
					dedupeKey: `visible:${viewMode}:${range.start}-${range.end}`,
					throttleMs: 800,
				});
			}, 280);
		},
		[activeSession, recordPlanInteraction, viewMode],
	);

	useEffect(() => {
		return () => {
			if (visibleRangeTimeoutRef.current != null) {
				window.clearTimeout(visibleRangeTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!activeSession) return;
		recordPlanInteraction({
			kind: "page_view",
			interaction: "plan_open",
			activeSection,
			selectedLines,
			payload: { liveSessionId: activeSession.session.id },
			dedupeKey: `open:${activeSession.session.id}`,
			throttleMs: 60_000,
		});
	}, [activeSection, activeSession, recordPlanInteraction, selectedLines]);

	useEffect(() => {
		if (!activeSession) return;
		recordPlanInteraction({
			kind: "page_view",
			interaction: "view_mode",
			activeSection,
			selectedLines,
			payload: { viewMode },
			dedupeKey: `view-mode:${activeSession.session.id}:${viewMode}`,
			throttleMs: 60_000,
		});
	}, [activeSection, activeSession, recordPlanInteraction, selectedLines, viewMode]);

	async function handleAddSectionComment(sectionId: string | null) {
		if (!canComment) {
			setCommentError("Sign in to comment on this plan.");
			return;
		}
		if (!commentDraft.trim() || !latestRevision) return;
		setSubmittingComment(true);
		setCommentError(null);
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
		} catch (err) {
			setCommentError(getActionError(err, "Failed to post comment"));
		} finally {
			setSubmittingComment(false);
		}
	}

	async function handleAddGeneralComment() {
		if (!canComment) {
			setCommentError("Sign in to comment on this plan.");
			return;
		}
		if (!commentDraft.trim() || !latestRevision) return;
		setSubmittingComment(true);
		setCommentError(null);
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
		} catch (err) {
			setCommentError(getActionError(err, "Failed to post comment"));
		} finally {
			setSubmittingComment(false);
		}
	}

	async function handleAddLineComment() {
		if (!canComment) {
			setCommentError("Sign in to comment on this plan.");
			return;
		}
		if (!commentDraft.trim() || !latestRevision || !selectedLines) return;
		setSubmittingComment(true);
		setCommentError(null);

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
		} catch (err) {
			setCommentError(getActionError(err, "Failed to post comment"));
		} finally {
			setSubmittingComment(false);
		}
	}

	function handleLineSelect(range: LineRange) {
		if (!canComment) return;
		setCommentError(null);
		setSelectedLines(range);
		setActiveSection(null);
		setGeneralComposing(false);
		setHighlightedLines(null);
		recordPlanInteraction({
			kind: "selection",
			interaction: "line_select",
			selectedLines: range,
			dedupeKey: `line-select:${range.start}-${range.end}:${viewMode}`,
		});
		// Pre-fill suggestion content with selected lines
		const selected = contentLines.slice(range.start - 1, range.end).join("\n");
		setSuggestionContent(selected);
	}

	function handleCommentLineClick(comment: {
		startLine: number | null;
		endLine: number | null;
	}) {
		if (comment.startLine == null) return;
		const range = {
			start: comment.startLine,
			end: comment.endLine ?? comment.startLine,
		};
		setHighlightedLines({
			start: range.start,
			end: range.end,
		});
		recordPlanInteraction({
			kind: "highlight",
			interaction: "comment_highlight",
			selectedLines: range,
			dedupeKey: `comment-highlight:${range.start}-${range.end}`,
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

	function handleSectionFocus(sectionId: string | null) {
		setCommentError(null);
		setActiveSection(sectionId);
		recordPlanInteraction({
			kind: "section_focus",
			interaction: "section_focus",
			activeSection: sectionId,
			selectedLines,
			dedupeKey: `section:${sectionId ?? "top"}:${viewMode}`,
		});
	}

	const statusConfig = STATUS_CONFIG[plan.status];
	const StatusIcon = statusConfig.icon;

	return (
		<main className="plan-detail-wrap px-4 pb-12 pt-6">
			{/* Breadcrumb */}
			<nav className="rise-in mb-4">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sea-ink-soft)] no-underline transition hover:text-[var(--sea-ink)]"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Plans
				</Link>
			</nav>

			{/* Plan header */}
			<header className="rise-in mb-8" style={{ animationDelay: "30ms" }}>
				<div className="mb-4 flex flex-wrap items-center gap-3">
					<span
						className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
					>
						<StatusIcon className="h-3.5 w-3.5" />
						{statusConfig.label}
					</span>

					<span className="text-xs text-[var(--sea-ink-soft)]">
						v{latestRevision?.revisionNumber ?? 0} of {revisions.length}
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

				<h1 className="display-title mb-3 text-4xl font-bold leading-tight text-[var(--sea-ink)] sm:text-5xl">
					{plan.title}
				</h1>

				{plan.description && (
					<p className="max-w-2xl text-lg leading-relaxed text-[var(--sea-ink-soft)]">
						{plan.description}
					</p>
				)}
			</header>

			{/* Compact toolbar — single row */}
			<div
				className="island-shell rise-in mb-6 rounded-2xl"
				style={{ animationDelay: "60ms" }}
			>
				<div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
					{/* Left: consensus + status actions */}
					<ConsensusBar reviewers={reviewers} reviews={reviews} />

					{isAuthor && plan.status === "draft" && (
						<button
							type="button"
							onClick={() => handleStatusChange("review")}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
						>
							<MessageSquare className="h-3 w-3" />
							Open for Review
						</button>
					)}
					{isAuthor && plan.status === "review" && (
						<button
							type="button"
							onClick={() => handleStatusChange("approved")}
							className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
						>
							<CheckCircle2 className="h-3 w-3" />
							Mark Approved
						</button>
					)}

					{!isAuthor &&
						plan.status === "review" &&
						reviewers.some((r) => r.userId === currentUser?.id) && (
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => handleSubmitReview("approved")}
									className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
								>
									<Check className="h-3 w-3" />
									Approve
								</button>
								<button
									type="button"
									onClick={() => handleSubmitReview("changes_requested")}
									className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/40"
								>
									<AlertTriangle className="h-3 w-3" />
									Request Changes
								</button>
							</div>
						)}

					{/* Right: view + tools */}
					<div className="ml-auto flex items-center gap-2">
						<div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)]">
							<button
								type="button"
								onClick={() => setViewMode("rendered")}
								className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
									viewMode === "rendered"
										? "bg-[var(--surface-strong)] text-[var(--sea-ink)] shadow-sm"
										: "text-[var(--sea-ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
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
										: "text-[var(--sea-ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
								}`}
							>
								<Code2 className="h-3 w-3" />
								Source
							</button>
						</div>

						{isAuthor && !editing && (
							<button
								type="button"
								onClick={() => setEditing(true)}
								className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
							>
								<Pencil className="h-3 w-3" />
								Edit
							</button>
						)}
						<Link
							to="/plan/$planId/history"
							params={{ planId: plan.id }}
							className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] no-underline transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
						>
							<History className="h-3 w-3" />
							History
						</Link>
						<Link
							to="/plan/$planId/sessions"
							params={{ planId: plan.id }}
							className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] no-underline transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
						>
							<Radio className="h-3 w-3" />
							Sessions{sessions.length > 0 && <span className="ml-1 rounded-full bg-[var(--surface-strong)] px-1.5 text-[10px]">{sessions.length}</span>}
						</Link>

						{canComment && !activeSession && (
							<button
								type="button"
								onClick={() => setShowStartForm(!showStartForm)}
								className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
							>
								<Radio className="h-3 w-3" />
								Start Session
							</button>
						)}
					</div>
				</div>

				{/* Inline start session form */}
				{showStartForm && !activeSession && (
					<div className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2.5">
						<input
							type="text"
							value={sessionTitle}
							onChange={(e) => setSessionTitle(e.target.value)}
							placeholder="Session title (optional)"
							className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--sea-ink)] outline-none transition placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)]"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleStartSession();
								if (e.key === "Escape") setShowStartForm(false);
							}}
							autoFocus
						/>
						<Button
							size="sm"
							variant="brand"
							onClick={handleStartSession}
							disabled={sessionBusy === "starting"}
							className="rounded-full"
						>
							{sessionBusy === "starting" ? "Starting..." : "Go Live"}
						</Button>
						<button
							type="button"
							onClick={() => setShowStartForm(false)}
							className="cursor-pointer rounded-full p-1 text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				)}

				{sessionError && (
					<div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
						{sessionError}
					</div>
				)}
			</div>

			{/* Live session banner */}
			{activeSession && (
				<div
					className="rise-in mb-6 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/20"
					style={{ animationDelay: "80ms" }}
				>
					<span className="live-pulse-dot" />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
							Session live
							{activeSession.session.title && (
								<span className="ml-2 font-normal text-emerald-700 dark:text-emerald-400">
									— {activeSession.session.title}
								</span>
							)}
						</p>
					</div>
					<button
						type="button"
						onClick={handleEndSession}
						disabled={sessionBusy === "ending"}
						className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
					>
						<Square className="h-3 w-3 fill-current" />
						{sessionBusy === "ending" ? "Ending..." : "End Session"}
					</button>
				</div>
			)}

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
					<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
						{/* Content area */}
						<article
							className="island-shell plan-content-card rise-in min-w-0 rounded-2xl p-8 sm:p-10"
							style={{ animationDelay: "120ms" }}
						>
							{viewMode === "rendered" ? (
								<div className="prose prose-neutral max-w-none dark:prose-invert plan-prose">
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
													canComment={canComment}
													onComment={() => handleSectionFocus(id ?? null)}
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
													canComment={canComment}
													onComment={() => handleSectionFocus(id ?? null)}
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
													canComment={canComment}
													onComment={() => handleSectionFocus(id ?? null)}
												>
													{children}
												</SectionHeading>
											),
											p: ({ node, children, ...rest }) => (
												<BlockCommentWrapper
													node={node}
													tag="p"
													canComment={canComment}
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
													canComment={canComment}
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
													canComment={canComment}
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
													canComment={canComment}
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
													canComment={canComment}
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
													canComment={canComment}
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
													canComment={canComment}
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
									onVisibleRangeChange={handleVisibleRangeChange}
								/>
							)}
						</article>

						{/* Comment sidebar */}
						<aside
							className="rise-in"
							style={{ animationDelay: "180ms" }}
						>
						<div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto pr-1">
							{/* Sidebar header */}
							<div className="flex items-center justify-between">
								<h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--sea-ink-soft)]">
									{totalTopLevel > 0 ? (
										<>
											{totalTopLevel} Comment{totalTopLevel !== 1 && "s"}
											{outdatedCount > 0 && (
												<span className="ml-1 font-normal text-amber-600 dark:text-amber-400">
													({outdatedCount} outdated)
												</span>
											)}
										</>
									) : (
										"Discussion"
									)}
								</h3>
								{outdatedCount > 0 && (
									<button
										type="button"
										onClick={() => setShowOutdated(!showOutdated)}
										className="cursor-pointer inline-flex items-center gap-1 text-[10px] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
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

							{/* Add comment button (always visible when not composing) */}
							{!isComposing && (
								canComment ? (
									<Button
										size="sm"
										variant="brand"
										onClick={() => {
											setCommentError(null);
											setGeneralComposing(true);
											setSelectedLines(null);
											setActiveSection(null);
										}}
										className="w-full rounded-full"
									>
										<MessageSquare className="mr-1.5 h-3.5 w-3.5" />
										Add Comment
									</Button>
								) : (
									<SignInButton mode="redirect">
										<button
											type="button"
											className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--sea-ink)]"
										>
											<MessageSquare className="h-3.5 w-3.5" />
											Sign In to Comment
										</button>
									</SignInButton>
								)
							)}

							{commentError && (
								<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
									{commentError}
								</div>
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
													: "text-[var(--sea-ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
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
													: "text-[var(--sea-ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
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
												canInteract={canComment}
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
												canInteract={canComment}
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
									<MessageSquare className="mx-auto mb-3 h-8 w-8 text-[var(--line)]" />
									<p className="mb-1 text-sm font-medium text-[var(--sea-ink)]">
										No comments yet
									</p>
									<p className="text-xs leading-relaxed text-[var(--sea-ink-soft)]">
										Start a discussion or switch to Source view to comment on specific lines.
									</p>
								</div>
							)}
						</div>
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
	canComment,
	onComment,
	children,
}: {
	id: string | undefined;
	level: number;
	commentCount: number;
	canComment: boolean;
	onComment: () => void;
	children: ReactNode;
}) {
	const props = {
		id,
		className: "group",
		children: (
			<>
				{children}
				<SectionCommentButton
					count={commentCount}
					onClick={onComment}
					disabled={!canComment}
				/>
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
	canComment,
	onLineSelect,
	children,
	...props
}: {
	node?: { position?: { start: { line: number }; end: { line: number } } };
	tag: "p" | "ul" | "ol" | "blockquote" | "pre" | "table" | "hr";
	canComment: boolean;
	onLineSelect: (range: { start: number; end: number }) => void;
	children?: ReactNode;
	[key: string]: unknown;
}) {
	const startLine = node?.position?.start.line;
	const endLine = node?.position?.end.line;

	if (startLine == null || !canComment) {
		return <Tag {...props}>{children}</Tag>;
	}

	const select = () =>
		onLineSelect({ start: startLine, end: endLine ?? startLine });

	const handleClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement | null;
		if (!target) {
			select();
			return;
		}

		if (
			target.closest(
				'a, button, input, textarea, select, label, summary, [role="button"], [role="link"]',
			)
		) {
			return;
		}

		const selection = window.getSelection();
		if (selection && selection.toString().trim().length > 0) {
			return;
		}

		select();
	};

	return (
		// biome-ignore lint/a11y/useKeyboardHandler: click-to-comment affordance, not a semantic control
		<div
			onClick={handleClick}
			className="-mx-2 cursor-pointer rounded-lg px-2 pr-10 transition-colors group/block relative hover:bg-[var(--lagoon)]/[0.04] dark:hover:bg-[var(--lagoon)]/[0.08]"
		>
			<Tag {...props}>{children}</Tag>
			<span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/block:opacity-100">
				<span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-2 py-1 text-xs font-medium text-[var(--sea-ink-soft)] shadow-sm">
					<MessageSquare className="h-3 w-3" />
				</span>
			</span>
		</div>
	);
}

function getActionError(err: unknown, fallback: string): string {
	if (!(err instanceof Error) || !err.message) return fallback;
	if (err.message === "Unauthorized") return "Sign in to continue.";
	return err.message;
}
