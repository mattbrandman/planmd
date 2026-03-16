import { useRouter } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	MessageSquare,
	Reply,
	Send,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	addComment,
	applySuggestion,
	toggleCommentResolved,
} from "#/common/api/plans";
import { Button } from "#/common/components/ui/button";
import { Textarea } from "#/common/components/ui/textarea";
import type { ContextSnapshot } from "#/common/lib/diff";
import SuggestionDiff from "./SuggestionDiff";

interface Comment {
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

interface CommentThreadProps {
	comment: Comment;
	replies: Comment[];
	planId: string;
	revisionId: string;
	isAuthor?: boolean;
	canInteract?: boolean;
	/** Content lines for the target range (used for suggestion diff) */
	targetLines?: string;
	/** Revision number where comment originated (for provenance) */
	originalRevisionNumber?: number | null;
}

export default function CommentThread({
	comment,
	replies,
	planId,
	revisionId,
	isAuthor,
	canInteract = true,
	targetLines,
	originalRevisionNumber,
}: CommentThreadProps) {
	const router = useRouter();
	const [expanded, setExpanded] = useState(!comment.resolved);
	// Auto-collapse when resolved changes (e.g. user clicks Resolve)
	useEffect(() => {
		setExpanded(!comment.resolved);
	}, [comment.resolved]);
	const [replying, setReplying] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [showContext, setShowContext] = useState(false);
	const [applying, setApplying] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleReply() {
		if (!canInteract) {
			setError("Sign in to reply to comments.");
			return;
		}
		if (!replyText.trim()) return;
		setSubmitting(true);
		setError(null);
		try {
			await addComment({
				data: {
					planId,
					revisionId,
					sectionId: comment.sectionId,
					startLine: comment.startLine ?? null,
					endLine: comment.endLine ?? null,
					parentId: comment.id,
					body: replyText.trim(),
				},
			});
			setReplyText("");
			setReplying(false);
			router.invalidate();
		} catch (err) {
			setError(getActionError(err, "Failed to post reply"));
		} finally {
			setSubmitting(false);
		}
	}

	async function handleToggleResolved() {
		if (!canInteract) {
			setError("Sign in to update comments.");
			return;
		}
		setError(null);
		try {
			await toggleCommentResolved({ data: { commentId: comment.id } });
			router.invalidate();
		} catch (err) {
			setError(getActionError(err, "Failed to update comment"));
		}
	}

	async function handleApplySuggestion() {
		if (!canInteract) {
			setError("Sign in to apply suggestions.");
			return;
		}
		setApplying(true);
		setError(null);
		try {
			await applySuggestion({ data: { commentId: comment.id } });
			router.invalidate();
		} catch (err) {
			setError(getActionError(err, "Failed to apply suggestion"));
		} finally {
			setApplying(false);
		}
	}

	const contextSnapshot: ContextSnapshot | null = comment.contextSnapshot
		? JSON.parse(comment.contextSnapshot)
		: null;

	const isSuggestion =
		comment.suggestionType && comment.suggestionContent != null;

	// Collapsed view for resolved comments
	if (!expanded) {
		return (
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className="island-shell flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left opacity-60 transition hover:opacity-80"
			>
				<ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--sea-ink-soft)]" />
				<CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
				<span className="truncate text-xs text-[var(--sea-ink-soft)]">
					{comment.authorId.slice(0, 8)}:{" "}
					<span className="text-[var(--sea-ink)]">
						{comment.body.length > 60
							? `${comment.body.slice(0, 60)}...`
							: comment.body}
					</span>
				</span>
				{replies.length > 0 && (
					<span className="ml-auto flex-shrink-0 text-[10px] text-[var(--sea-ink-soft)]">
						{replies.length} {replies.length === 1 ? "reply" : "replies"}
					</span>
				)}
			</button>
		);
	}

	return (
		<div
			className={`island-shell rounded-xl p-3 ${
				comment.resolved
					? "opacity-60"
					: comment.outdated
						? "border-l-2 border-l-amber-400 opacity-75"
						: ""
			}`}
		>
			{/* Main comment */}
			<div className="mb-2 flex items-start gap-2">
				{comment.resolved ? (
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 transition hover:bg-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60"
						aria-label="Collapse resolved comment"
					>
						<ChevronDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
					</button>
				) : (
					<div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(79,184,178,0.15)]">
						<MessageSquare className="h-3 w-3 text-[var(--lagoon-deep)]" />
					</div>
				)}
				<div className="min-w-0 flex-1">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<span className="text-xs font-semibold text-[var(--sea-ink)]">
							{comment.authorId.slice(0, 8)}
						</span>
						<span className="text-xs text-[var(--sea-ink-soft)]">
							{formatDate(comment.createdAt)}
						</span>
						{comment.resolved && (
							<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
								<CheckCircle2 className="h-2.5 w-2.5" />
								Resolved
							</span>
						)}
						{comment.outdated && (
							<span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
								<AlertTriangle className="h-2.5 w-2.5" />
								Outdated
							</span>
						)}
						{comment.suggestionApplied && (
							<span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
								<Check className="h-2.5 w-2.5" />
								Applied
							</span>
						)}
						{originalRevisionNumber != null && (
							<span className="text-[10px] text-[var(--sea-ink-soft)]">
								from v{originalRevisionNumber}
							</span>
						)}
					</div>
					<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-[var(--sea-ink)]">
						{comment.body}
					</p>

					{/* Suggestion diff */}
					{isSuggestion && targetLines != null && (
						<SuggestionDiff
							oldText={targetLines}
							newText={comment.suggestionContent!}
						/>
					)}

					{/* Context snapshot (shown when outdated) */}
					{comment.outdated && contextSnapshot && (
						<div className="mt-2">
							<button
								type="button"
								onClick={() => setShowContext(!showContext)}
								className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--sea-ink-soft)] transition hover:text-[var(--sea-ink)]"
							>
								{showContext ? (
									<ChevronDown className="h-3 w-3" />
								) : (
									<ChevronRight className="h-3 w-3" />
								)}
								Original context
							</button>
							{showContext && (
								<pre className="mt-1 overflow-x-auto rounded-lg bg-[var(--surface)] p-2 text-[11px] leading-4 text-[var(--sea-ink-soft)]">
									{contextSnapshot.lines.map((line, i) => (
										<div key={i}>
											<span className="mr-2 inline-block w-4 select-none text-right opacity-40">
												{contextSnapshot.startLine + i}
											</span>
											{line}
										</div>
									))}
								</pre>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Replies */}
			{replies.length > 0 && (
				<div className="ml-8 space-y-2 border-l-2 border-[var(--line)] pl-3">
					{replies.map((reply) => (
						<div key={reply.id}>
							<div className="mb-0.5 flex items-center gap-2">
								<span className="text-xs font-semibold text-[var(--sea-ink)]">
									{reply.authorId.slice(0, 8)}
								</span>
								<span className="text-xs text-[var(--sea-ink-soft)]">
									{formatDate(reply.createdAt)}
								</span>
							</div>
							<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-[var(--sea-ink)]">
								{reply.body}
							</p>
						</div>
					))}
				</div>
			)}

			{/* Actions */}
			{canInteract && (
				<div className="mt-2 ml-8 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => {
							setError(null);
							setReplying(!replying);
						}}
						className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
					>
						<Reply className="h-3 w-3" />
						Reply
					</button>
					<button
						type="button"
						onClick={handleToggleResolved}
						className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
					>
						{comment.resolved ? (
							<>
								<Circle className="h-3 w-3" />
								Reopen
							</>
						) : (
							<>
								<CheckCircle2 className="h-3 w-3" />
								Resolve
							</>
						)}
					</button>
					{/* Apply suggestion button (author only, not outdated, not applied) */}
					{isSuggestion &&
						!comment.suggestionApplied &&
						!comment.outdated &&
						isAuthor && (
							<button
								type="button"
								onClick={handleApplySuggestion}
								disabled={applying}
								className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
							>
								<Check className="h-3 w-3" />
								{applying ? "Applying..." : "Apply"}
							</button>
						)}
					{/* Dismiss suggestion (same as resolve) */}
					{isSuggestion && !comment.suggestionApplied && !comment.resolved && (
						<button
							type="button"
							onClick={handleToggleResolved}
							className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
						>
							<X className="h-3 w-3" />
							Dismiss
						</button>
					)}
				</div>
			)}

			{error && (
				<div className="mt-2 ml-8 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Reply composer */}
			{canInteract && replying && (
				<div className="mt-2 ml-8">
					<Textarea
						value={replyText}
						onChange={(e) => setReplyText(e.target.value)}
						placeholder="Write a reply..."
						rows={2}
						className="mb-2 resize-none rounded-lg text-sm"
						autoFocus
					/>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="brand"
							onClick={handleReply}
							disabled={!replyText.trim() || submitting}
							className="h-7 rounded-full px-3 text-xs"
						>
							<Send className="mr-1 h-2.5 w-2.5" />
							{submitting ? "..." : "Reply"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								setReplying(false);
								setReplyText("");
							}}
							className="h-7 rounded-full px-3 text-xs"
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function getActionError(err: unknown, fallback: string): string {
	if (!(err instanceof Error) || !err.message) return fallback;
	if (err.message === "Unauthorized") return "Sign in to continue.";
	return err.message;
}

function formatDate(date: Date): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
