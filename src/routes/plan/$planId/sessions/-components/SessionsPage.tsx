import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	CircleAlert,
	FileCode2,
	Link2,
	MessageSquareText,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/common/components/ui/accordion";
import { Alert } from "#/common/components/ui/alert";
import { Badge } from "#/common/components/ui/badge";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "#/common/components/ui/toggle-group";
import {
	type WovenEvidenceItem,
	weaveSessionEvidence,
} from "#/common/lib/session-weave";

type SessionBundle = {
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
};

type Snapshot = {
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
};

type StatusFilter = "all" | "live" | "ended";

interface SessionsPageProps {
	plan: {
		id: string;
		title: string;
		description: string | null;
		status: string;
	};
	sessions: SessionBundle[];
	snapshots: Snapshot[];
}

const CONTEXT_KIND_OPTIONS: Record<string, string> = {
	page_view: "Page view",
	selection: "Selection",
	highlight: "Highlight",
	section_focus: "Section focus",
	note: "General note",
};

const ATTENTION_KIND_OPTIONS: Record<string, string> = {
	missing_decision: "Missing decision",
	risk: "Risk",
	contradiction: "Contradiction",
	follow_up: "Follow-up",
};

export default function SessionsPage({
	plan,
	sessions,
	snapshots,
}: SessionsPageProps) {
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedSessionId, setExpandedSessionId] = useState<string>("");

	const filteredSessions = useMemo(() => {
		let filtered = sessions;

		if (statusFilter !== "all") {
			filtered = filtered.filter(
				(bundle) => bundle.session.status === statusFilter,
			);
		}

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			filtered = filtered.filter((bundle) => {
				const title = (
					bundle.session.title || "untitled session"
				).toLowerCase();
				return title.includes(query);
			});
		}

		return filtered;
	}, [sessions, statusFilter, searchQuery]);

	const liveSessions = sessions.filter(
		(bundle) => bundle.session.status === "live",
	);
	const endedSessions = sessions.filter(
		(bundle) => bundle.session.status === "ended",
	);

	return (
		<main className="page-wrap px-4 pb-12 pt-8">
			{/* Breadcrumb + title */}
			<div className="rise-in mb-8">
				<nav className="mb-3 flex items-center gap-1.5 text-sm text-[var(--sea-ink-soft)]">
					<Link to="/" className="no-underline hover:text-[var(--sea-ink)]">
						Plans
					</Link>
					<span>/</span>
					<Link
						to="/plan/$planId"
						params={{ planId: plan.id }}
						className="no-underline hover:text-[var(--sea-ink)]"
					>
						{plan.title}
					</Link>
					<span>/</span>
					<span className="text-[var(--sea-ink)]">Sessions</span>
				</nav>

				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 className="display-title text-2xl font-bold text-[var(--sea-ink)] sm:text-3xl">
							Sessions
						</h1>
						<p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
							{sessions.length} session{sessions.length !== 1 && "s"}
							{liveSessions.length > 0 && (
								<> &mdash; {liveSessions.length} live</>
							)}
							{endedSessions.length > 0 && <>, {endedSessions.length} ended</>}
						</p>
					</div>

					<Link
						to="/plan/$planId"
						params={{ planId: plan.id }}
						className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--sea-ink-soft)] no-underline transition hover:border-[var(--lagoon)] hover:text-[var(--sea-ink)]"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Back to plan
					</Link>
				</div>
			</div>

			{/* Filter controls */}
			<div
				className="rise-in mb-6 flex flex-wrap items-center gap-3"
				style={{ animationDelay: "60ms" }}
			>
				<ToggleGroup
					type="single"
					value={statusFilter}
					onValueChange={(v) => {
						if (v) setStatusFilter(v as StatusFilter);
					}}
					className="rounded-full border border-[var(--line)] bg-[var(--surface)] p-1"
				>
					<ToggleGroupItem
						value="all"
						className="rounded-full px-3 py-1 text-sm data-[state=on]:bg-white data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm dark:data-[state=on]:bg-[var(--surface-strong)]"
					>
						All
					</ToggleGroupItem>
					<ToggleGroupItem
						value="live"
						className="rounded-full px-3 py-1 text-sm data-[state=on]:bg-white data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm dark:data-[state=on]:bg-[var(--surface-strong)]"
					>
						Live
					</ToggleGroupItem>
					<ToggleGroupItem
						value="ended"
						className="rounded-full px-3 py-1 text-sm data-[state=on]:bg-white data-[state=on]:text-[var(--sea-ink)] data-[state=on]:shadow-sm dark:data-[state=on]:bg-[var(--surface-strong)]"
					>
						Ended
					</ToggleGroupItem>
				</ToggleGroup>

				<div className="relative">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sea-ink-soft)]" />
					<input
						type="text"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder="Search by title..."
						className="w-56 rounded-full border border-[var(--line)] bg-[var(--surface)] py-1.5 pl-9 pr-3 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
					/>
				</div>

				<p className="text-sm text-[var(--sea-ink-soft)]">
					{filteredSessions.length === sessions.length
						? `${sessions.length} total`
						: `${filteredSessions.length} of ${sessions.length}`}
				</p>
			</div>

			{/* Session list */}
			<div className="rise-in space-y-4" style={{ animationDelay: "120ms" }}>
				{filteredSessions.length === 0 ? (
					<div className="island-shell rounded-2xl px-6 py-16 text-center">
						<p className="text-sm text-[var(--sea-ink-soft)]">
							{sessions.length === 0
								? "No sessions yet. Start a session from the plan workspace."
								: "No sessions match your filters."}
						</p>
					</div>
				) : (
					<Accordion
						type="single"
						collapsible
						value={expandedSessionId}
						onValueChange={(value) => setExpandedSessionId(value)}
					>
						{filteredSessions.map((bundle) => (
							<SessionCard key={bundle.session.id} bundle={bundle} />
						))}
					</Accordion>
				)}
			</div>

			{/* Handoff snapshots */}
			{snapshots.length > 0 && (
				<section className="rise-in mt-8" style={{ animationDelay: "180ms" }}>
					<Accordion type="single" collapsible>
						<AccordionItem value="handoffs" className="border-b-0">
							<AccordionTrigger className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 text-left transition hover:no-underline hover:border-[var(--lagoon)]">
								<div className="flex items-center gap-3">
									<FileCode2 className="h-4 w-4 text-[var(--lagoon)]" />
									<div>
										<p className="text-sm font-semibold text-[var(--sea-ink)]">
											Handoff Snapshots
										</p>
										<p className="text-xs text-[var(--sea-ink-soft)]">
											{snapshots.length} published snapshot
											{snapshots.length !== 1 && "s"}
										</p>
									</div>
								</div>
							</AccordionTrigger>
							<AccordionContent className="space-y-3">
								{snapshots.map((snapshot) => (
									<SnapshotCard key={snapshot.id} snapshot={snapshot} />
								))}
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</section>
			)}
		</main>
	);
}

// ── Session card ──────────────────────────────────────────────────────────────

function SessionCard({ bundle }: { bundle: SessionBundle }) {
	const { session, transcriptChunks, contextEvents, attentionItems } = bundle;
	const isLive = session.status === "live";

	const timeline = useMemo<WovenEvidenceItem[]>(() => {
		return weaveSessionEvidence(bundle).slice().reverse();
	}, [bundle]);

	return (
		<AccordionItem
			value={session.id}
			className="island-shell mb-4 rounded-2xl border-b-0"
		>
			<AccordionTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition hover:no-underline hover:bg-[var(--surface)]">
				<div className="min-w-0 flex-1">
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
							{session.title || "Untitled session"}
						</h3>
						{isLive ? (
							<Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
								<span className="live-pulse-dot mr-1 inline-block h-2 w-2" />
								Live
							</Badge>
						) : (
							<Badge variant="outline">Ended</Badge>
						)}
						<Badge variant="secondary">
							{providerLabel(session.meetingProvider)}
						</Badge>
					</div>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--sea-ink-soft)]">
						<span>Started {formatDateTime(session.startedAt)}</span>
						{session.endedAt && (
							<span>Ended {formatDateTime(session.endedAt)}</span>
						)}
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-3">
					<div className="hidden flex-wrap gap-2 text-xs text-[var(--sea-ink-soft)] sm:flex">
						<span className="inline-flex items-center gap-1">
							<MessageSquareText className="h-3 w-3" />
							{transcriptChunks.length}
						</span>
						<span className="inline-flex items-center gap-1">
							<Link2 className="h-3 w-3" />
							{contextEvents.length}
						</span>
						<span className="inline-flex items-center gap-1">
							<CircleAlert className="h-3 w-3" />
							{attentionItems.length}
						</span>
					</div>
				</div>
			</AccordionTrigger>

			<AccordionContent className="border-t border-[var(--line)] px-5 pb-5 pt-4">
				{/* Evidence counts for mobile */}
				<div className="mb-4 flex flex-wrap gap-3 sm:hidden">
					<span className="inline-flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
						<MessageSquareText className="h-3.5 w-3.5" />
						{transcriptChunks.length} transcript chunks
					</span>
					<span className="inline-flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
						<Link2 className="h-3.5 w-3.5" />
						{contextEvents.length} context events
					</span>
					<span className="inline-flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
						<CircleAlert className="h-3.5 w-3.5" />
						{attentionItems.length} attention items
					</span>
				</div>

				{/* Evidence summary bar */}
				<div className="mb-4 hidden flex-wrap gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:flex">
					<EvidenceStat
						icon={
							<MessageSquareText className="h-3.5 w-3.5 text-[var(--lagoon)]" />
						}
						label="Transcript chunks"
						count={transcriptChunks.length}
					/>
					<EvidenceStat
						icon={<Link2 className="h-3.5 w-3.5 text-[var(--lagoon)]" />}
						label="Context events"
						count={contextEvents.length}
					/>
					<EvidenceStat
						icon={<CircleAlert className="h-3.5 w-3.5 text-amber-500" />}
						label="Attention items"
						count={attentionItems.length}
					/>
				</div>

				{/* Woven timeline */}
				{timeline.length === 0 ? (
					<div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--sea-ink-soft)]">
						No evidence captured for this session yet.
					</div>
				) : (
					<div className="space-y-3">
						<p className="text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
							Woven timeline ({timeline.length} item
							{timeline.length !== 1 && "s"})
						</p>
						<div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
							{timeline.map((item) => (
								<TimelineRow key={item.id} item={item} />
							))}
						</div>
					</div>
				)}
			</AccordionContent>
		</AccordionItem>
	);
}

// ── Timeline row ──────────────────────────────────────────────────────────────

function TimelineRow({ item }: { item: WovenEvidenceItem }) {
	const label = [
		item.transcriptChunk?.speakerName ||
			(item.transcriptChunk ? "Transcript" : null),
		item.contextEvent ? contextKindLabel(item.contextEvent.kind) : null,
	]
		.filter(Boolean)
		.join(" + ");

	return (
		<div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 dark:bg-black/10">
			<div className="mb-2 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 text-sm font-medium text-[var(--sea-ink)]">
					{item.attentionItems.length > 0 ? (
						<CircleAlert className="h-4 w-4 text-amber-500" />
					) : item.contextEvent ? (
						<Link2 className="h-4 w-4 text-[var(--lagoon)]" />
					) : (
						<MessageSquareText className="h-4 w-4 text-[var(--lagoon)]" />
					)}
					<span>{label || "Session evidence"}</span>
				</div>
				<span className="text-xs text-[var(--sea-ink-soft)]">
					{formatDateTime(item.occurredAt)}
				</span>
			</div>

			<div className="space-y-2">
				{item.transcriptChunk && (
					<p className="text-sm leading-relaxed text-[var(--sea-ink-soft)]">
						{item.transcriptChunk.text}
					</p>
				)}

				{item.contextEvent && (
					<div className="space-y-1 text-sm text-[var(--sea-ink-soft)]">
						{item.contextEvent.pageUrl && (
							<p className="break-all">
								URL:{" "}
								<span className="font-mono">{item.contextEvent.pageUrl}</span>
							</p>
						)}
						{(item.contextEvent.repo || item.contextEvent.path) && (
							<p>
								Repo context:{" "}
								<span className="font-mono">
									{[
										item.contextEvent.repo,
										item.contextEvent.ref,
										item.contextEvent.path,
									]
										.filter(Boolean)
										.join(" @ ")}
								</span>
							</p>
						)}
						{formatLineRange(
							item.contextEvent.visibleStartLine,
							item.contextEvent.visibleEndLine,
							"Visible lines",
						)}
						{formatLineRange(
							item.contextEvent.selectedStartLine,
							item.contextEvent.selectedEndLine,
							"Selected lines",
						)}
						{item.contextEvent.selectedText && (
							<p className="rounded-lg bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--sea-ink)]">
								{item.contextEvent.selectedText}
							</p>
						)}
						{item.contextEvent.activeSection && (
							<p>Active section: {item.contextEvent.activeSection}</p>
						)}
					</div>
				)}

				{item.attentionItems.length > 0 && (
					<div className="space-y-2">
						{item.attentionItems.map((attentionItem) => (
							<Alert
								key={attentionItem.id}
								className="rounded-lg border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
							>
								<div className="mb-1 flex flex-wrap gap-2">
									<Badge variant="outline">
										{attentionKindLabel(attentionItem.kind)}
									</Badge>
									<Badge variant="outline">{attentionItem.severity}</Badge>
									<Badge variant="outline">{attentionItem.state}</Badge>
								</div>
								<p>{attentionItem.summary}</p>
							</Alert>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// ── Evidence stat ─────────────────────────────────────────────────────────────

function EvidenceStat({
	icon,
	label,
	count,
}: {
	icon: React.ReactNode;
	label: string;
	count: number;
}) {
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
			{icon}
			<span className="font-medium text-[var(--sea-ink)]">{count}</span>
			{label}
		</span>
	);
}

// ── Snapshot card ─────────────────────────────────────────────────────────────

function SnapshotCard({ snapshot }: { snapshot: Snapshot }) {
	return (
		<div className="island-shell rounded-2xl p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="mb-1 flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							Revision {snapshot.revisionNumber ?? "?"}
						</Badge>
						<Badge variant="outline">
							{snapshot.agentRuns.length} agent run
							{snapshot.agentRuns.length !== 1 && "s"}
						</Badge>
						{snapshot.isStale ? (
							<Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
								Stale
							</Badge>
						) : (
							<Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
								Current
							</Badge>
						)}
					</div>
					<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
						{snapshot.publicSlug}
					</h3>
					<p className="text-xs text-[var(--sea-ink-soft)]">
						Published {formatDateTime(snapshot.publishedAt)}
					</p>
					{snapshot.sessionIds.length > 0 && (
						<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
							{snapshot.sessionIds.length} session
							{snapshot.sessionIds.length !== 1 && "s"} included
						</p>
					)}
				</div>

				<a
					href={snapshot.publicUrl}
					className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] no-underline transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)] dark:bg-black/10"
				>
					<FileCode2 className="h-3.5 w-3.5" />
					Open public view
				</a>
			</div>

			{snapshot.agentRuns.length > 0 && (
				<div className="mt-3 space-y-2">
					{snapshot.agentRuns.map((run) => (
						<div
							key={run.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs"
						>
							<span className="font-medium text-[var(--sea-ink)]">
								{run.agentName}
							</span>
							<Badge variant="outline">{run.status}</Badge>
							{run.prUrl && (
								<a
									href={run.prUrl}
									target="_blank"
									rel="noreferrer"
									className="text-[var(--lagoon-deep)]"
								>
									PR
								</a>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function providerLabel(value: string) {
	return value === "manual" ? "Manual capture" : "Google Meet";
}

function contextKindLabel(value: string) {
	return CONTEXT_KIND_OPTIONS[value] ?? value;
}

function attentionKindLabel(value: string) {
	return ATTENTION_KIND_OPTIONS[value] ?? value;
}

function formatDateTime(date: Date | string) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(typeof date === "string" ? new Date(date) : date);
}

function formatLineRange(
	start: number | null,
	end: number | null,
	label: string,
) {
	if (start == null) return null;
	const resolvedEnd = end ?? start;
	return (
		<p>
			{label}: L{start}
			{resolvedEnd !== start ? `-${resolvedEnd}` : ""}
		</p>
	);
}
