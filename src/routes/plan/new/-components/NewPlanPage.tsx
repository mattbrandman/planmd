import { useNavigate } from "@tanstack/react-router";
import { Eye, Pencil, Upload } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { createPlan } from "#/common/api/plans";
import { Alert } from "#/common/components/ui/alert";
import { Button } from "#/common/components/ui/button";
import { Textarea } from "#/common/components/ui/textarea";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "#/common/components/ui/toggle-group";

export default function NewPlanPage() {
	const navigate = useNavigate();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [content, setContent] = useState("");
	const [githubUrl, setGithubUrl] = useState("");
	const [preview, setPreview] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!title.trim() || !content.trim()) return;

		setSubmitting(true);
		setError(null);

		try {
			const result = await createPlan({
				data: {
					title: title.trim(),
					description: description.trim() || undefined,
					content: content.trim(),
					githubUrl: githubUrl.trim() || undefined,
				},
			});
			navigate({
				to: "/plan/$planId",
				params: { planId: result.planId },
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create plan");
			setSubmitting(false);
		}
	}

	return (
		<main className="page-wrap px-4 pb-12 pt-10">
			<div className="rise-in mb-6">
				<p className="island-kicker mb-2">New Plan</p>
				<h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
					Write your plan
				</h1>
				<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
					Describe the change, feature, or architecture decision in markdown.
					You can always revise later.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Title */}
				<div
					className="island-shell rise-in rounded-2xl p-6"
					style={{ animationDelay: "60ms" }}
				>
					<label
						htmlFor="plan-title"
						className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
					>
						Title
					</label>
					<input
						id="plan-title"
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="e.g., Add real-time collaboration via CRDT"
						required
						className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
					/>
				</div>

				{/* Description */}
				<div
					className="island-shell rise-in rounded-2xl p-6"
					style={{ animationDelay: "120ms" }}
				>
					<label
						htmlFor="plan-description"
						className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
					>
						Summary{" "}
						<span className="font-normal text-[var(--sea-ink-soft)]">
							(optional, 1-2 sentences)
						</span>
					</label>
					<input
						id="plan-description"
						type="text"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="A brief summary for the dashboard card"
						maxLength={500}
						className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
					/>
				</div>

				{/* GitHub URL */}
				<div
					className="island-shell rise-in rounded-2xl p-6"
					style={{ animationDelay: "180ms" }}
				>
					<label
						htmlFor="plan-github"
						className="mb-2 block text-sm font-semibold text-[var(--sea-ink)]"
					>
						GitHub URL{" "}
						<span className="font-normal text-[var(--sea-ink-soft)]">
							(optional, link to related repo or issue)
						</span>
					</label>
					<input
						id="plan-github"
						type="url"
						value={githubUrl}
						onChange={(e) => setGithubUrl(e.target.value)}
						placeholder="https://github.com/org/repo/issues/123"
						className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--sea-ink)] placeholder-[var(--sea-ink-soft)] outline-none transition focus:border-[var(--lagoon)] focus:ring-2 focus:ring-[rgba(79,184,178,0.2)]"
					/>
				</div>

				{/* Content editor */}
				<div
					className="island-shell rise-in rounded-2xl p-6"
					style={{ animationDelay: "240ms" }}
				>
					<div className="mb-3 flex items-center justify-between">
						<label
							htmlFor="plan-content"
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
								<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
									{content}
								</ReactMarkdown>
							) : (
								<p className="text-[var(--sea-ink-soft)] italic">
									Nothing to preview yet...
								</p>
							)}
						</div>
					) : (
						<Textarea
							id="plan-content"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder={`# Feature: Real-time Collaboration\n\n## Problem\nDescribe the problem this plan addresses...\n\n## Proposed Solution\nDetail your approach...\n\n## API Design\nShow interfaces, endpoints, schemas...\n\n## Alternatives Considered\nWhat else did you evaluate?\n\n## Open Questions\n- Question 1?\n- Question 2?`}
							required
							rows={20}
							className="min-h-[400px] resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] font-mono text-sm"
						/>
					)}
				</div>

				{/* Error display */}
				{error && (
					<Alert
						variant="destructive"
						className="rounded-xl border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
					>
						{error}
					</Alert>
				)}

				{/* Submit */}
				<div
					className="rise-in flex items-center gap-3"
					style={{ animationDelay: "300ms" }}
				>
					<Button
						type="submit"
						variant="brand"
						disabled={submitting || !title.trim() || !content.trim()}
						className="rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
					>
						{submitting ? (
							<span className="flex items-center gap-2">
								<span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
								Creating...
							</span>
						) : (
							<span className="flex items-center gap-2">
								<Upload className="h-3.5 w-3.5" />
								Create Plan
							</span>
						)}
					</Button>
					<span className="text-xs text-[var(--sea-ink-soft)]">
						You can always edit and revise after creating.
					</span>
				</div>
			</form>
		</main>
	);
}
