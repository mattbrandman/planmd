import { useRouter } from "@tanstack/react-router";
import { Eye, Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createRevision, updatePlan } from "#/common/api/plans";
import { Alert } from "#/common/components/ui/alert";
import { Button } from "#/common/components/ui/button";
import { Textarea } from "#/common/components/ui/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "#/common/components/ui/toggle-group";

interface RevisionEditorProps {
	planId: string;
	currentTitle: string;
	currentDescription: string | null;
	currentGithubUrl: string | null;
	currentContent: string;
	unresolvedCommentCount?: number;
	onCancel: () => void;
}

export default function RevisionEditor({
	planId,
	currentTitle,
	currentDescription,
	currentGithubUrl,
	currentContent,
	unresolvedCommentCount = 0,
	onCancel,
}: RevisionEditorProps) {
	const router = useRouter();

	const [title, setTitle] = useState(currentTitle);
	const [description, setDescription] = useState(currentDescription ?? "");
	const [githubUrl, setGithubUrl] = useState(currentGithubUrl ?? "");
	const [content, setContent] = useState(currentContent);
	const [summary, setSummary] = useState("");
	const [preview, setPreview] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const hasContentChanged = content.trim() !== currentContent.trim();
	const hasMetadataChanged =
		title.trim() !== currentTitle.trim() ||
		(description.trim() || null) !== (currentDescription ?? null) ||
		(githubUrl.trim() || null) !== (currentGithubUrl ?? null);
	const hasChanges = hasContentChanged || hasMetadataChanged;

	async function handleSave() {
		if (!hasChanges) return;
		if (hasContentChanged && !content.trim()) return;
		if (!title.trim()) return;

		setSubmitting(true);
		setError(null);

		try {
			// Update plan metadata if changed
			if (hasMetadataChanged) {
				await updatePlan({
					data: {
						planId,
						title: title.trim(),
						description: description.trim() || null,
						githubUrl: githubUrl.trim() || null,
					},
				});
			}

			// Create new revision if content changed
			if (hasContentChanged) {
				await createRevision({
					data: {
						planId,
						content: content.trim(),
						summary: summary.trim() || undefined,
					},
				});
			}

			router.invalidate();
			onCancel();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save changes");
			setSubmitting(false);
		}
	}

	return (
		<div className="space-y-6">
			{/* Title */}
			<div className="island-shell rounded-2xl p-6">
				<label
					htmlFor="edit-title"
					className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
				>
					Title
				</label>
				<input
					id="edit-title"
					type="text"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
				/>
			</div>

			{/* Description */}
			<div className="island-shell rounded-2xl p-6">
				<label
					htmlFor="edit-description"
					className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
				>
					Summary{" "}
					<span className="font-normal text-[var(--sea-ink-soft)]">
						(optional, 1-2 sentences)
					</span>
				</label>
				<input
					id="edit-description"
					type="text"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="A brief summary for the dashboard card"
					maxLength={500}
					className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
				/>
			</div>

			{/* GitHub URL */}
			<div className="island-shell rounded-2xl p-6">
				<label
					htmlFor="edit-github"
					className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
				>
					GitHub URL{" "}
					<span className="font-normal text-[var(--sea-ink-soft)]">
						(optional)
					</span>
				</label>
				<input
					id="edit-github"
					type="url"
					value={githubUrl}
					onChange={(e) => setGithubUrl(e.target.value)}
					placeholder="https://github.com/org/repo/issues/123"
					className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
				/>
			</div>

			{/* Content editor with Write/Preview toggle */}
			<div className="island-shell rounded-2xl p-6">
				<div className="mb-3 flex items-center justify-between">
					<label
						htmlFor="edit-content"
						className="text-sm font-semibold text-[var(--sea-ink)]"
					>
						Plan Content
					</label>
					<ToggleGroup
						type="single"
						value={preview ? "preview" : "write"}
						onValueChange={(v) => {
							if (v) setPreview(v === "preview");
						}}
						className="rounded-full border border-[var(--line)] bg-[var(--surface)] p-0.5"
					>
						<ToggleGroupItem
							value="write"
							className="rounded-full px-3 py-1 text-xs data-[state=on]:bg-[var(--surface-strong)] data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm"
						>
							<Pencil className="mr-1.5 h-3 w-3" />
							Write
						</ToggleGroupItem>
						<ToggleGroupItem
							value="preview"
							className="rounded-full px-3 py-1 text-xs data-[state=on]:bg-[var(--surface-strong)] data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm"
						>
							<Eye className="mr-1.5 h-3 w-3" />
							Preview
						</ToggleGroupItem>
					</ToggleGroup>
				</div>

				{preview ? (
					<div className="prose prose-sm max-w-none rounded-xl border border-[var(--line)] bg-white/60 p-6 dark:bg-black/20">
						{content ? (
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{content}
							</ReactMarkdown>
						) : (
							<p className="italic text-[var(--sea-ink-soft)]">
								Nothing to preview yet...
							</p>
						)}
					</div>
				) : (
					<Textarea
						id="edit-content"
						value={content}
						onChange={(e) => setContent(e.target.value)}
						rows={20}
						className="min-h-[400px] resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] font-mono text-sm"
					/>
				)}
			</div>

			{/* Carry-forward notice */}
			{hasContentChanged && unresolvedCommentCount > 0 && (
				<Alert className="rounded-xl border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-400">
					{unresolvedCommentCount} unresolved comment
					{unresolvedCommentCount !== 1 && "s"} will carry forward to the new
					revision.
				</Alert>
			)}

			{/* Revision summary (only shown when content has changed) */}
			{hasContentChanged && (
				<div className="island-shell rounded-2xl p-6">
					<label
						htmlFor="edit-summary"
						className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
					>
						Revision Summary{" "}
						<span className="font-normal text-[var(--sea-ink-soft)]">
							(optional, describe what changed)
						</span>
					</label>
					<input
						id="edit-summary"
						type="text"
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
						placeholder="e.g., Addressed review feedback on API design section"
						maxLength={500}
						className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
					/>
				</div>
			)}

			{/* Error display */}
			{error && (
				<Alert variant="destructive" className="rounded-xl border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
					{error}
				</Alert>
			)}

			{/* Action buttons */}
			<div className="flex items-center gap-3">
				<Button
					onClick={handleSave}
					disabled={submitting || !hasChanges || !title.trim()}
					className="rounded-full bg-[var(--lagoon-deep)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--lagoon)] disabled:opacity-50"
				>
					{submitting ? (
						<span className="flex items-center gap-2">
							<span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
							Saving...
						</span>
					) : (
						<span className="flex items-center gap-2">
							<Save className="h-3.5 w-3.5" />
							{hasContentChanged ? "Save Revision" : "Save Changes"}
						</span>
					)}
				</Button>
				<Button
					variant="ghost"
					onClick={onCancel}
					disabled={submitting}
					className="rounded-full"
				>
					<X className="mr-1.5 h-3.5 w-3.5" />
					Cancel
				</Button>
				{!hasChanges && (
					<span className="text-xs text-[var(--sea-ink-soft)]">
						No changes to save
					</span>
				)}
			</div>
		</div>
	);
}
