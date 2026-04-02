import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	Bot,
	ExternalLink,
	FileCode2,
	FileText,
	Workflow,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { HandoffPayload } from "#/common/lib/handoff";
import { Alert } from "#/common/components/ui/alert";
import { Badge } from "#/common/components/ui/badge";

interface PublicHandoffPageProps {
	snapshot: {
		id: string;
		publicSlug: string;
		publishedAt: Date;
		publicUrl: string;
		fetchUrl: string;
		isLatestPublished: boolean;
		latestPublishedPublicUrl: string | null;
	};
	payload: HandoffPayload;
	agentRuns: Array<{
		id: string;
		agentName: string;
		externalRunId: string;
		status: string;
		prUrl: string | null;
		branch: string | null;
		testSummary: string | null;
		artifactUrl: string | null;
		suggestedPlanDelta: string | null;
		updatedAt: Date;
	}>;
}

export default function PublicHandoffPage({
	snapshot,
	payload,
	agentRuns,
}: PublicHandoffPageProps) {
	return (
		<main className="page-wrap px-4 pb-12 pt-10">
			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
				<section className="space-y-6">
					<header className="island-shell rounded-2xl p-6">
						<p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lagoon-deep)]">
							Public Handoff Snapshot
						</p>
						<h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
							{payload.plan.title}
						</h1>
						{payload.plan.description && (
							<p className="mt-2 text-base text-[var(--sea-ink-soft)]">
								{payload.plan.description}
							</p>
						)}

						<div className="mt-4 flex flex-wrap gap-2">
							<Badge variant="secondary">
								Revision {payload.revision.number}
							</Badge>
							<Badge
								className={
									snapshot.isLatestPublished
										? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
										: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
								}
							>
								{snapshot.isLatestPublished
									? "Latest published handoff"
									: "Superseded handoff"}
							</Badge>
							<Badge variant="secondary">
								{payload.evidenceSummary.sessionCount} sessions
							</Badge>
							<Badge variant="secondary">
								{payload.evidenceSummary.contextEventCount} context events
							</Badge>
							<Badge variant="secondary">
								{payload.evidenceSummary.attentionItemCount} attention items
							</Badge>
						</div>

						<div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--sea-ink-soft)]">
							<span>Published {formatDateTime(snapshot.publishedAt)}</span>
							<span className="text-[var(--line)]">•</span>
							<span className="font-mono">{snapshot.id}</span>
							{payload.plan.githubUrl && (
								<a
									href={payload.plan.githubUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1 text-[var(--lagoon-deep)] no-underline hover:underline"
								>
									<ExternalLink className="h-3.5 w-3.5" />
									Repository
								</a>
							)}
						</div>

						{!snapshot.isLatestPublished && (
							<Alert className="mt-4 rounded-xl border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
								<div className="flex items-start gap-2">
									<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
									<div>
										<p className="font-medium">
											A newer handoff snapshot has already been published.
										</p>
										{snapshot.latestPublishedPublicUrl && (
											<p className="mt-1">
												Review the newest contract before starting
												implementation.{" "}
												<a
													href={snapshot.latestPublishedPublicUrl}
													className="text-[var(--lagoon-deep)]"
												>
													Open latest handoff
												</a>
											</p>
										)}
									</div>
								</div>
							</Alert>
						)}
					</header>

					<section className="island-shell rounded-2xl p-6">
						<div className="mb-4 flex items-center gap-2">
							<FileText className="h-4 w-4 text-[var(--lagoon)]" />
							<h2 className="text-lg font-semibold text-[var(--sea-ink)]">
								Canonical plan
							</h2>
						</div>
						<div className="prose prose-sm max-w-none">
							<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
								{payload.markdown}
							</ReactMarkdown>
						</div>
					</section>
				</section>

				<aside className="space-y-4">
					<section className="island-shell rounded-2xl p-5">
						<div className="mb-3 flex items-center gap-2">
							<FileCode2 className="h-4 w-4 text-[var(--lagoon)]" />
							<h2 className="text-sm font-semibold text-[var(--sea-ink)]">
								Machine contract
							</h2>
						</div>
						<div className="space-y-3 text-sm text-[var(--sea-ink-soft)]">
							<div>
								<p className="font-medium text-[var(--sea-ink)]">JSON API</p>
								<p className="font-mono text-xs">{snapshot.fetchUrl}</p>
							</div>
							<div>
								<p className="font-medium text-[var(--sea-ink)]">Sections</p>
								<p>{payload.sections.length} structured headings</p>
							</div>
							<div>
								<p className="font-medium text-[var(--sea-ink)]">
									Transcript evidence
								</p>
								<p>{payload.evidenceSummary.transcriptCount} chunks</p>
							</div>
						</div>
					</section>

					<section className="island-shell rounded-2xl p-5">
						<div className="mb-3 flex items-center gap-2">
							<Workflow className="h-4 w-4 text-[var(--lagoon)]" />
							<h2 className="text-sm font-semibold text-[var(--sea-ink)]">
								Session evidence
							</h2>
						</div>
						<div className="space-y-3">
							{payload.sessions.length === 0 ? (
								<p className="text-sm text-[var(--sea-ink-soft)]">
									No session evidence was attached to this handoff.
								</p>
							) : (
								payload.sessions.map((session) => (
									<div
										key={session.id}
										className="rounded-xl border border-[var(--line)] bg-white/70 p-3 dark:bg-black/10"
									>
										<p className="text-sm font-medium text-[var(--sea-ink)]">
											{session.title || "Untitled session"}
										</p>
										<p className="text-xs text-[var(--sea-ink-soft)]">
											{providerLabel(session.meetingProvider)} ·{" "}
											{formatDateTime(session.startedAt)}
										</p>
										<div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--sea-ink-soft)]">
											<span>{session.transcript.length} transcript chunks</span>
											<span>{session.contextEvents.length} context events</span>
											<span>
												{session.attentionItems.length} attention items
											</span>
										</div>
									</div>
								))
							)}
						</div>
					</section>

					<section className="island-shell rounded-2xl p-5">
						<div className="mb-3 flex items-center gap-2">
							<Bot className="h-4 w-4 text-[var(--lagoon)]" />
							<h2 className="text-sm font-semibold text-[var(--sea-ink)]">
								Agent writeback
							</h2>
						</div>
						<div className="space-y-3">
							{agentRuns.length === 0 ? (
								<p className="text-sm text-[var(--sea-ink-soft)]">
									No coding-agent results linked yet.
								</p>
							) : (
								agentRuns.map((run) => (
									<div
										key={run.id}
										className="rounded-xl border border-[var(--line)] bg-white/70 p-3 dark:bg-black/10"
									>
										<div className="mb-2 flex items-center justify-between gap-2">
											<p className="text-sm font-medium text-[var(--sea-ink)]">
												{run.agentName}
											</p>
											<Badge variant="outline">{run.status}</Badge>
										</div>
										<p className="mb-1 font-mono text-xs text-[var(--sea-ink-soft)]">
											{run.externalRunId}
										</p>
										{run.prUrl && (
											<p className="text-xs text-[var(--sea-ink-soft)]">
												PR:{" "}
												<a
													href={run.prUrl}
													target="_blank"
													rel="noreferrer"
													className="text-[var(--lagoon-deep)]"
												>
													{run.prUrl}
												</a>
											</p>
										)}
										{run.branch && (
											<p className="text-xs text-[var(--sea-ink-soft)]">
												Branch: {run.branch}
											</p>
										)}
										{run.testSummary && (
											<p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
												{run.testSummary}
											</p>
										)}
										{run.suggestedPlanDelta && (
											<p className="mt-2 rounded-lg bg-[var(--surface)] px-2 py-1 text-xs text-[var(--sea-ink)]">
												{run.suggestedPlanDelta}
											</p>
										)}
									</div>
								))
							)}
						</div>
					</section>

					<div className="text-xs text-[var(--sea-ink-soft)]">
						<Link
							to="/"
							className="text-[var(--lagoon-deep)] no-underline hover:underline"
						>
							Back to dashboard
						</Link>
					</div>
				</aside>
			</div>
		</main>
	);
}

function providerLabel(value: string) {
	return value === "manual" ? "Manual capture" : "Google Meet";
}

function formatDateTime(value: Date | string) {
	const date = value instanceof Date ? value : new Date(value);
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}
