import { useRouter } from "@tanstack/react-router";
import {
	Bot,
	ChevronDown,
	CircleAlert,
	Copy,
	ExternalLink,
	FileCode2,
	FileText,
	Flag,
	Link2,
	MessageSquareText,
	Radio,
	Send,
	Sparkles,
	SquareCheckBig,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	addAttentionItem,
	addContextEvent,
	addTranscriptChunk,
	buildSessionDraft,
	createSession,
	endSession,
	publishHandoffSnapshot,
} from "#/common/api/collaboration";
import { createRevision } from "#/common/api/plans";
import { Badge } from "#/common/components/ui/badge";
import { Button } from "#/common/components/ui/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/common/components/ui/tabs";
import { Textarea } from "#/common/components/ui/textarea";
import { createContextCaptureBookmarklet } from "#/common/lib/session-bookmarklet";
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

interface SessionWorkspaceProps {
	planId: string;
	latestRevision: {
		id: string;
		revisionNumber: number;
		content: string;
	} | null;
	sessions: SessionBundle[];
	snapshots: Snapshot[];
	isAuthor: boolean;
	canInteract: boolean;
}

const CONTEXT_KIND_OPTIONS = [
	{ value: "page_view", label: "Page view" },
	{ value: "selection", label: "Selection" },
	{ value: "highlight", label: "Highlight" },
	{ value: "section_focus", label: "Section focus" },
	{ value: "note", label: "General note" },
] as const;

const ATTENTION_KIND_OPTIONS = [
	{ value: "missing_decision", label: "Missing decision" },
	{ value: "risk", label: "Risk" },
	{ value: "contradiction", label: "Contradiction" },
	{ value: "follow_up", label: "Follow-up" },
] as const;

const ATTENTION_SEVERITY_OPTIONS = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
] as const;

export default function SessionWorkspace({
	planId,
	latestRevision,
	sessions,
	snapshots,
	isAuthor,
	canInteract,
}: SessionWorkspaceProps) {
	const router = useRouter();
	const activeSession =
		sessions.find((bundle) => bundle.session.status === "live") ?? null;
	const [focusedSessionId, setFocusedSessionId] = useState<string | null>(
		activeSession?.session.id ?? sessions[0]?.session.id ?? null,
	);
	const endedSessions = useMemo(
		() => sessions.filter((bundle) => bundle.session.status === "ended"),
		[sessions],
	);
	const endedSessionIds = useMemo(
		() => endedSessions.map((bundle) => bundle.session.id),
		[endedSessions],
	);
	const [sessionTitle, setSessionTitle] = useState("");
	const [meetingProvider, setMeetingProvider] = useState<
		"google_meet" | "manual"
	>("google_meet");
	const [speakerName, setSpeakerName] = useState("");
	const [transcriptText, setTranscriptText] = useState("");
	const [contextKind, setContextKind] =
		useState<(typeof CONTEXT_KIND_OPTIONS)[number]["value"]>("page_view");
	const [contextUrl, setContextUrl] = useState("");
	const [contextRepo, setContextRepo] = useState("");
	const [contextRef, setContextRef] = useState("");
	const [contextPath, setContextPath] = useState("");
	const [visibleStartLine, setVisibleStartLine] = useState("");
	const [visibleEndLine, setVisibleEndLine] = useState("");
	const [selectedText, setSelectedText] = useState("");
	const [selectedStartLine, setSelectedStartLine] = useState("");
	const [selectedEndLine, setSelectedEndLine] = useState("");
	const [activeSection, setActiveSection] = useState("");
	const [contextPayload, setContextPayload] = useState("");
	const [attentionKind, setAttentionKind] =
		useState<(typeof ATTENTION_KIND_OPTIONS)[number]["value"]>(
			"missing_decision",
		);
	const [attentionSeverity, setAttentionSeverity] =
		useState<(typeof ATTENTION_SEVERITY_OPTIONS)[number]["value"]>("medium");
	const [attentionSummary, setAttentionSummary] = useState("");
	const [showAdminCaptureTools, setShowAdminCaptureTools] = useState(false);
	const [collapsedSections, setCollapsedSections] = useState({
		timeline: false,
		inventory: true,
		publishNotes: true,
		startSession: true,
		captureAdapters: true,
		adminTools: true,
		attentionComposer: true,
		handoffComposer: true,
		handoffList: true,
	});
	const [selectedSnapshotSessions, setSelectedSnapshotSessions] = useState<
		string[]
	>(endedSessionIds);
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionNotice, setActionNotice] = useState<string | null>(null);
	const [copyState, setCopyState] = useState<string | null>(null);
	const [appOrigin, setAppOrigin] = useState("");
	const lastAppliedEndedKeyRef = useRef(endedSessionIds.join("|"));

	useEffect(() => {
		if (focusedSessionId && sessions.some((bundle) => bundle.session.id === focusedSessionId)) {
			return;
		}
		setFocusedSessionId(activeSession?.session.id ?? sessions[0]?.session.id ?? null);
	}, [activeSession, focusedSessionId, sessions]);

	useEffect(() => {
		const endedKey = endedSessionIds.join("|");
		if (lastAppliedEndedKeyRef.current === endedKey) return;
		lastAppliedEndedKeyRef.current = endedKey;
		setSelectedSnapshotSessions((current) => {
			const allowed = new Set(endedSessionIds);
			const retained = current.filter((id) => allowed.has(id));
			const additions = endedSessionIds.filter((id) => !retained.includes(id));
			return [...retained, ...additions];
		});
	}, [endedSessionIds]);

	useEffect(() => {
		if (!copyState) return;
		const timeoutId = window.setTimeout(() => setCopyState(null), 2200);
		return () => window.clearTimeout(timeoutId);
	}, [copyState]);

	useEffect(() => {
		if (!actionNotice) return;
		const timeoutId = window.setTimeout(() => setActionNotice(null), 4200);
		return () => window.clearTimeout(timeoutId);
	}, [actionNotice]);

	useEffect(() => {
		setAppOrigin(window.location.origin);
	}, []);

	const focusedSession =
		sessions.find((bundle) => bundle.session.id === focusedSessionId) ??
		activeSession ??
		sessions[0] ??
		null;
	const captureSession = activeSession;
	const timeline = useMemo<WovenEvidenceItem[]>(() => {
		if (!focusedSession) return [];
		return weaveSessionEvidence(focusedSession).slice().reverse();
	}, [focusedSession]);
	const contextEndpoint = captureSession
		? toAbsoluteUrl(appOrigin, `/api/sessions/${captureSession.session.id}/context`)
		: "";
	const transcriptEndpoint = captureSession
		? toAbsoluteUrl(
				appOrigin,
				`/api/sessions/${captureSession.session.id}/transcript`,
			)
		: "";
	const bookmarkletHref =
		captureSession && appOrigin
			? createContextCaptureBookmarklet({
					appOrigin,
					sessionId: captureSession.session.id,
					captureToken: captureSession.session.captureToken,
				})
			: "";

	async function handleStartSession() {
		if (!canInteract || activeSession) return;
		setBusyAction("start-session");
		setActionError(null);
		setActionNotice(null);

		try {
			await createSession({
				data: {
					planId,
					title: sessionTitle.trim() || undefined,
					meetingProvider,
				},
			});
			setSessionTitle("");
			await router.invalidate();
			setActionNotice("Session started. Capture is now ready.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to start session"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleEndSession() {
		if (!activeSession) return;
		setBusyAction("end-session");
		setActionError(null);
		setActionNotice(null);

		try {
			await endSession({ data: { sessionId: activeSession.session.id } });
			await router.invalidate();
			setActionNotice("Session ended. It can now be included in drafts and handoffs.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to end session"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleAddTranscript() {
		if (!activeSession || !transcriptText.trim()) return;
		setBusyAction("add-transcript");
		setActionError(null);

		try {
			await addTranscriptChunk({
				data: {
					sessionId: activeSession.session.id,
					speakerName: speakerName.trim() || null,
					text: transcriptText.trim(),
				},
			});
			setSpeakerName("");
			setTranscriptText("");
			await router.invalidate();
			setActionNotice("Transcript chunk recorded.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to add transcript"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleAddContextEvent() {
		if (!activeSession) return;
		setBusyAction("add-context");
		setActionError(null);

		try {
			await addContextEvent({
				data: {
					sessionId: activeSession.session.id,
					kind: contextKind,
					pageUrl: contextUrl.trim() || null,
					repo: contextRepo.trim() || null,
					ref: contextRef.trim() || null,
					path: contextPath.trim() || null,
					visibleStartLine: parseOptionalNumber(visibleStartLine),
					visibleEndLine: parseOptionalNumber(visibleEndLine),
					selectedText: selectedText.trim() || null,
					selectedStartLine: parseOptionalNumber(selectedStartLine),
					selectedEndLine: parseOptionalNumber(selectedEndLine),
					activeSection: activeSection.trim() || null,
					payload: contextPayload.trim() || null,
				},
			});
			setContextUrl("");
			setContextRepo("");
			setContextRef("");
			setContextPath("");
			setVisibleStartLine("");
			setVisibleEndLine("");
			setSelectedText("");
			setSelectedStartLine("");
			setSelectedEndLine("");
			setActiveSection("");
			setContextPayload("");
			await router.invalidate();
			setActionNotice("Context event recorded.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to record context"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleAddAttentionItem() {
		if (!activeSession || !attentionSummary.trim()) return;
		setBusyAction("add-attention");
		setActionError(null);

		try {
			await addAttentionItem({
				data: {
					sessionId: activeSession.session.id,
					kind: attentionKind,
					severity: attentionSeverity,
					summary: attentionSummary.trim(),
				},
			});
			setAttentionSummary("");
			await router.invalidate();
			setActionNotice("Attention item added.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to add attention item"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handlePublishSnapshot() {
		if (!latestRevision || !isAuthor) return;
		setBusyAction("publish-snapshot");
		setActionError(null);

		try {
			await publishHandoffSnapshot({
				data: {
					planId,
					revisionId: latestRevision.id,
					sessionIds: selectedSnapshotSessions,
				},
			});
			await router.invalidate();
			setActionNotice("Immutable handoff snapshot published.");
		} catch (error) {
			setActionError(getActionError(error, "Failed to publish handoff"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleGenerateDraftRevision() {
		if (!latestRevision || !isAuthor) return;
		setBusyAction("generate-draft");
		setActionError(null);

		try {
			const draft = await buildSessionDraft({
				data: {
					planId,
					sessionIds: selectedSnapshotSessions,
				},
			});
			if (draft.content.trim() === latestRevision.content.trim()) {
				throw new Error("The selected sessions did not produce any new plan changes.");
			}
			const revision = await createRevision({
				data: {
					planId,
					content: draft.content,
					summary: draft.summary,
				},
			});
			await router.invalidate();
			setActionNotice(
				`Created revision ${revision.revisionNumber} from ${draft.sessionIds.length} captured session${draft.sessionIds.length === 1 ? "" : "s"}.`,
			);
		} catch (error) {
			setActionError(getActionError(error, "Failed to generate draft revision"));
		} finally {
			setBusyAction(null);
		}
	}

	async function handleCopy(label: string, value: string) {
		if (!value) return;

		try {
			await navigator.clipboard.writeText(value);
			setCopyState(label);
		} catch (error) {
			setActionError(getActionError(error, `Failed to copy ${label.toLowerCase()}`));
		}
	}

	function toggleSection(section: keyof typeof collapsedSections) {
		setCollapsedSections((current) => ({
			...current,
			[section]: !current[section],
		}));
	}

	const [collapsed, setCollapsed] = useState(!activeSession);

	return (
		<section
			className="island-shell rise-in mb-6 rounded-2xl"
			style={{ animationDelay: "90ms" }}
		>
			{/* Collapsible header — always visible */}
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition hover:bg-[var(--surface)]"
			>
				<div className="flex items-center gap-3">
					<ChevronDown
						className={`h-4 w-4 flex-shrink-0 text-[var(--sea-ink-soft)] transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
					/>
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--lagoon-deep)]">
							Live Workspace
						</p>
						{collapsed && (
							<p className="mt-0.5 text-sm text-[var(--sea-ink-soft)]">
								Session capture and agent handoff
							</p>
						)}
					</div>
				</div>

				<div className="flex flex-wrap gap-2">
					<Badge variant="secondary">{sessions.length} sessions</Badge>
					<Badge variant="secondary">{snapshots.length} handoffs</Badge>
					{activeSession ? (
						<Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
							<Radio className="h-3 w-3" />
							Live now
						</Badge>
					) : (
						<Badge variant="outline">No live session</Badge>
					)}
				</div>
			</button>

			{/* Collapsible body */}
			{!collapsed && (
			<div className="px-5 pb-5">

			{actionError && (
				<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
					{actionError}
				</div>
			)}

			{actionNotice && (
				<div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
					{actionNotice}
				</div>
			)}

			{copyState && (
				<div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
					Copied {copyState}.
				</div>
			)}

			<Tabs defaultValue="timeline" className="gap-4">
				<TabsList
					variant="line"
					className="w-full justify-start rounded-none p-0"
				>
					<TabsTrigger value="timeline" className="grow-0">
						<MessageSquareText className="h-4 w-4" />
						Timeline
					</TabsTrigger>
					<TabsTrigger value="capture" className="grow-0">
						<Radio className="h-4 w-4" />
						Capture
					</TabsTrigger>
					<TabsTrigger value="handoff" className="grow-0">
						<FileCode2 className="h-4 w-4" />
						Handoff
					</TabsTrigger>
				</TabsList>

				<TabsContent value="timeline" className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
						<WorkspacePanel
							title={
								focusedSession
									? focusedSession.session.title || "Untitled session"
									: "No session selected"
							}
							description={
								focusedSession
									? `${providerLabel(focusedSession.session.meetingProvider)} · ${formatDateTime(focusedSession.session.startedAt)}`
									: "Start or select a session to view captured evidence."
							}
							collapsed={collapsedSections.timeline}
							onToggle={() => toggleSection("timeline")}
							contentClassName="space-y-3"
							actions={
								<>
									{focusedSession?.session.status === "live" && (
										<Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
											<Radio className="h-3 w-3" />
											Live
										</Badge>
									)}
									{activeSession &&
										activeSession.session.id === focusedSession?.session.id && (
										<Button
											size="sm"
											variant="outline"
											onClick={handleEndSession}
											disabled={busyAction === "end-session"}
											className="rounded-full"
										>
											<SquareCheckBig className="h-3.5 w-3.5" />
											{busyAction === "end-session" ? "Ending..." : "End session"}
										</Button>
									)}
								</>
							}
						>
							<div className="mb-0 flex items-center justify-between gap-2">
								<div>
									<p className="text-xs text-[var(--sea-ink-soft)]">
										{timeline.length} woven evidence item
										{timeline.length === 1 ? "" : "s"}
									</p>
								</div>
							</div>

							{timeline.length === 0 ? (
								<div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--sea-ink-soft)]">
									No woven evidence yet for this session.
								</div>
							) : (
								<div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
									{timeline.map((item) => (
										<TimelineRow key={item.id} item={item} />
									))}
								</div>
							)}
						</WorkspacePanel>

						<div className="space-y-3">
							<WorkspacePanel
								title="Session inventory"
								collapsed={collapsedSections.inventory}
								onToggle={() => toggleSection("inventory")}
								contentClassName="max-h-[18rem] space-y-3 overflow-y-auto pr-1"
							>
								<div className="space-y-3">
									{sessions.length === 0 ? (
										<p className="text-sm text-[var(--sea-ink-soft)]">
											No sessions yet.
										</p>
									) : (
										sessions.map((bundle) => {
											const isFocused = focusedSession?.session.id === bundle.session.id;
											return (
												<button
													key={bundle.session.id}
													type="button"
													onClick={() => setFocusedSessionId(bundle.session.id)}
													className={`block w-full cursor-pointer rounded-xl border p-3 text-left transition ${
														isFocused
															? "border-[var(--lagoon)] bg-white/90 dark:bg-black/20"
															: "border-[var(--line)] bg-white/70 hover:border-[var(--lagoon)] dark:bg-black/10"
													}`}
												>
													<div className="mb-2 flex items-center justify-between gap-2">
														<div>
															<p className="text-sm font-medium text-[var(--sea-ink)]">
																{bundle.session.title || "Untitled session"}
															</p>
															<p className="text-xs text-[var(--sea-ink-soft)]">
																{providerLabel(bundle.session.meetingProvider)} ·{" "}
																{formatDateTime(bundle.session.startedAt)}
															</p>
														</div>
														<div className="flex flex-wrap gap-2">
															{isFocused && <Badge variant="secondary">Viewing</Badge>}
															<Badge
																variant={
																	bundle.session.status === "live"
																		? "default"
																		: "outline"
																}
																className={
																	bundle.session.status === "live"
																		? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
																		: ""
																}
															>
																{bundle.session.status}
															</Badge>
														</div>
													</div>
													<div className="flex flex-wrap gap-2 text-xs text-[var(--sea-ink-soft)]">
														<span>
															{bundle.transcriptChunks.length} transcript chunks
														</span>
														<span>{bundle.contextEvents.length} context events</span>
														<span>{bundle.attentionItems.length} nudges</span>
													</div>
												</button>
											);
										})
									)}
								</div>
							</WorkspacePanel>

							<WorkspacePanel
								title="What gets published"
								collapsed={collapsedSections.publishNotes}
								onToggle={() => toggleSection("publishNotes")}
							>
								<p className="text-sm text-[var(--sea-ink-soft)]">
									Handoffs freeze one revision plus selected ended-session
									evidence. The public URL is shareable; the callback token
									stays private inside this workspace.
								</p>
							</WorkspacePanel>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="capture" className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.22fr)]">
						<WorkspacePanel
							title="Start a private session"
							description="Start the capture window when the maintainer and contributor are ready."
							collapsed={collapsedSections.startSession}
							onToggle={() => toggleSection("startSession")}
							contentClassName="space-y-3"
						>
							<label className="block text-sm text-[var(--sea-ink-soft)]">
								<span className="mb-1 block text-xs font-medium uppercase tracking-wider">
									Title
								</span>
								<input
									type="text"
									value={sessionTitle}
									onChange={(event) => setSessionTitle(event.target.value)}
									placeholder="Maintainer sync on issue #142"
									className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
								/>
							</label>

							<label className="block text-sm text-[var(--sea-ink-soft)]">
								<span className="mb-1 block text-xs font-medium uppercase tracking-wider">
									Provider
								</span>
								<select
									value={meetingProvider}
									onChange={(event) =>
										setMeetingProvider(
											event.target.value as "google_meet" | "manual",
										)
									}
									className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
								>
									<option value="google_meet">Google Meet</option>
									<option value="manual">Manual capture</option>
								</select>
							</label>

							<Button
								variant="brand"
								onClick={handleStartSession}
								disabled={
									!canInteract ||
									Boolean(activeSession) ||
									busyAction === "start-session"
								}
								className="w-full rounded-full"
							>
								<Radio className="h-3.5 w-3.5" />
								{busyAction === "start-session"
									? "Starting..."
									: activeSession
										? "Session already live"
										: "Start session"}
							</Button>
						</WorkspacePanel>

						<div className="space-y-4">
							<WorkspacePanel
								title="Capture adapters"
								description="Use the bookmarklet during a contributor call or stream directly into the ingest endpoints with the session token."
								collapsed={collapsedSections.captureAdapters}
								onToggle={() => toggleSection("captureAdapters")}
								contentClassName="space-y-3"
								actions={
									captureSession ? (
										<Badge variant="secondary">
											{captureSession.session.title || "Active capture session"}
										</Badge>
									) : (
										<Badge variant="outline">No session ready</Badge>
									)
								}
							>
								{captureSession ? (
									<>
										<div className="grid gap-3 md:grid-cols-2">
											<CaptureDetail
												label="Transcript ingest"
												value={transcriptEndpoint}
												onCopy={() =>
													handleCopy("transcript ingest URL", transcriptEndpoint)
												}
											/>
											<CaptureDetail
												label="Context ingest"
												value={contextEndpoint}
												onCopy={() =>
													handleCopy("context ingest URL", contextEndpoint)
												}
											/>
											<CaptureDetail
												label="Session token"
												value={captureSession.session.captureToken}
												onCopy={() =>
													handleCopy(
														"session capture token",
														captureSession.session.captureToken,
													)
												}
											/>
											<CaptureDetail
												label="Session id"
												value={captureSession.session.id}
												onCopy={() =>
													handleCopy("session id", captureSession.session.id)
												}
											/>
										</div>

										<div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 dark:bg-black/10">
											<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
												<div>
													<p className="text-sm font-medium text-[var(--sea-ink)]">
														Bookmarklet
													</p>
													<p className="text-xs text-[var(--sea-ink-soft)]">
														Drag the link to your bookmarks bar, then click it on
														GitHub or any page exposing line anchors.
													</p>
												</div>
												<Button
													size="sm"
													variant="outline"
													onClick={() => handleCopy("bookmarklet", bookmarkletHref)}
													className="rounded-full"
												>
													<Copy className="h-3.5 w-3.5" />
													Copy code
												</Button>
											</div>
											<div className="flex flex-wrap items-center gap-3">
												<BookmarkletLink href={bookmarkletHref} />
												<p className="text-xs text-[var(--sea-ink-soft)]">
													The current bookmarklet captures visible lines,
													selection ranges, active section, and page URL.
												</p>
											</div>
										</div>
									</>
								) : (
									<div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--sea-ink-soft)]">
										Start a session first to unlock capture endpoints and the
										bookmarklet.
									</div>
								)}
							</WorkspacePanel>

							<WorkspacePanel
								title="Assistant attention item"
								description="Add a nudge when the call surfaces a missing decision, contradiction, or risk."
								collapsed={collapsedSections.attentionComposer}
								onToggle={() => toggleSection("attentionComposer")}
								contentClassName="space-y-3"
								actions={<Sparkles className="h-4 w-4 text-[var(--lagoon)]" />}
							>
								<div className="grid gap-3 xl:grid-cols-[160px_160px_minmax(0,1fr)_auto]">
									<select
										value={attentionKind}
										onChange={(event) =>
											setAttentionKind(
												event.target
													.value as (typeof ATTENTION_KIND_OPTIONS)[number]["value"],
											)
										}
										className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
									>
										{ATTENTION_KIND_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									<select
										value={attentionSeverity}
										onChange={(event) =>
											setAttentionSeverity(
												event.target
													.value as (typeof ATTENTION_SEVERITY_OPTIONS)[number]["value"],
											)
										}
										className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
									>
										{ATTENTION_SEVERITY_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									<input
										type="text"
										value={attentionSummary}
										onChange={(event) => setAttentionSummary(event.target.value)}
										placeholder="What should collaborators look at or decide next?"
										className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
									/>
									<Button
										variant="outline"
										onClick={handleAddAttentionItem}
										disabled={
											!activeSession ||
											!attentionSummary.trim() ||
											busyAction === "add-attention"
										}
										className="rounded-full"
									>
										<Flag className="h-3.5 w-3.5" />
										Add nudge
									</Button>
								</div>
							</WorkspacePanel>

							{isAuthor && (
								<WorkspacePanel
									title="Admin capture tools"
									description="Manual transcript and context entry are hidden by default. Passive plan capture and ingest endpoints should be the normal path."
									collapsed={collapsedSections.adminTools}
									onToggle={() => toggleSection("adminTools")}
									actions={
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												setShowAdminCaptureTools((current) => !current)
											}
											className="rounded-full"
										>
											{showAdminCaptureTools ? "Hide inputs" : "Show inputs"}
										</Button>
									}
								>
									{showAdminCaptureTools ? (
										<div className="grid max-h-[20rem] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
											<div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 dark:bg-black/10">
												<div className="mb-3 flex items-center gap-2">
													<MessageSquareText className="h-4 w-4 text-[var(--lagoon)]" />
													<h4 className="text-sm font-semibold text-[var(--sea-ink)]">
														Transcript chunk
													</h4>
												</div>
												<div className="space-y-3">
													<input
														type="text"
														value={speakerName}
														onChange={(event) => setSpeakerName(event.target.value)}
														placeholder="Speaker name"
														className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
													/>
													<Textarea
														value={transcriptText}
														onChange={(event) => setTranscriptText(event.target.value)}
														placeholder="Paste the caption chunk or note what was said..."
														rows={6}
														className="resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] text-sm"
													/>
													<Button
														variant="outline"
														onClick={handleAddTranscript}
														disabled={
															!activeSession ||
															!transcriptText.trim() ||
															busyAction === "add-transcript"
														}
														className="w-full rounded-full"
													>
														<Send className="h-3.5 w-3.5" />
														Add transcript
													</Button>
												</div>
											</div>

											<div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 dark:bg-black/10">
												<div className="mb-3 flex items-center gap-2">
													<Link2 className="h-4 w-4 text-[var(--lagoon)]" />
													<h4 className="text-sm font-semibold text-[var(--sea-ink)]">
														Context event
													</h4>
												</div>
												<div className="space-y-3">
													<select
														value={contextKind}
														onChange={(event) =>
															setContextKind(
																event.target
																	.value as (typeof CONTEXT_KIND_OPTIONS)[number]["value"],
															)
														}
														className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
													>
														{CONTEXT_KIND_OPTIONS.map((option) => (
															<option key={option.value} value={option.value}>
																{option.label}
															</option>
														))}
													</select>
													<input
														type="url"
														value={contextUrl}
														onChange={(event) => setContextUrl(event.target.value)}
														placeholder="https://github.com/org/repo/blob/main/src/file.ts"
														className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
													/>
													<div className="grid grid-cols-2 gap-2">
														<input
															type="text"
															value={contextRepo}
															onChange={(event) => setContextRepo(event.target.value)}
															placeholder="org/repo"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
														<input
															type="text"
															value={contextRef}
															onChange={(event) => setContextRef(event.target.value)}
															placeholder="main"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
													</div>
													<input
														type="text"
														value={contextPath}
														onChange={(event) => setContextPath(event.target.value)}
														placeholder="src/routes/plan/$planId/index.tsx"
														className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
													/>
													<div className="grid grid-cols-2 gap-2">
														<input
															type="number"
															value={visibleStartLine}
															onChange={(event) =>
																setVisibleStartLine(event.target.value)
															}
															placeholder="Visible start line"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
														<input
															type="number"
															value={visibleEndLine}
															onChange={(event) =>
																setVisibleEndLine(event.target.value)
															}
															placeholder="Visible end line"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
													</div>
													<Textarea
														value={selectedText}
														onChange={(event) => setSelectedText(event.target.value)}
														placeholder="Selected or highlighted text"
														rows={3}
														className="resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] text-sm"
													/>
													<div className="grid grid-cols-2 gap-2">
														<input
															type="number"
															value={selectedStartLine}
															onChange={(event) =>
																setSelectedStartLine(event.target.value)
															}
															placeholder="Selection start"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
														<input
															type="number"
															value={selectedEndLine}
															onChange={(event) =>
																setSelectedEndLine(event.target.value)
															}
															placeholder="Selection end"
															className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
														/>
													</div>
													<input
														type="text"
														value={activeSection}
														onChange={(event) => setActiveSection(event.target.value)}
														placeholder="Active section in the plan or file"
														className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none transition focus:border-[var(--lagoon)]"
													/>
													<Textarea
														value={contextPayload}
														onChange={(event) => setContextPayload(event.target.value)}
														placeholder='Optional JSON or note, e.g. {"highlightedSection":"PlanDetailPage"}'
														rows={3}
														className="resize-y rounded-xl border-[var(--line)] bg-[var(--surface)] font-mono text-xs"
													/>
													<Button
														variant="outline"
														onClick={handleAddContextEvent}
														disabled={!activeSession || busyAction === "add-context"}
														className="w-full rounded-full"
													>
														<FileText className="h-3.5 w-3.5" />
														Record context
													</Button>
												</div>
											</div>
										</div>
									) : (
										<div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-4 text-sm text-[var(--sea-ink-soft)]">
											Manual transcript and context entry are hidden until you
											open the admin tools.
										</div>
									)}
								</WorkspacePanel>
							)}
						</div>
					</div>
				</TabsContent>

				<TabsContent value="handoff" className="space-y-4">
					<div className="grid gap-4 lg:grid-cols-[minmax(280px,0.92fr)_minmax(0,1.08fr)]">
						<WorkspacePanel
							title="Plan synthesis and immutable handoff"
							description="Generate the next plan revision from ended-session evidence, then publish a frozen handoff that outside coding agents can fetch."
							collapsed={collapsedSections.handoffComposer}
							onToggle={() => toggleSection("handoffComposer")}
							contentClassName="space-y-4"
						>
							<div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm dark:bg-black/10">
								<p className="font-medium text-[var(--sea-ink)]">
									Latest revision
								</p>
								<p className="text-[var(--sea-ink-soft)]">
									Revision {latestRevision?.revisionNumber ?? 0}
								</p>
							</div>

							<div className="space-y-2">
								<p className="text-xs font-medium uppercase tracking-wider text-[var(--sea-ink-soft)]">
									Included ended sessions
								</p>
								{endedSessions.length === 0 ? (
									<p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--sea-ink-soft)]">
										No ended sessions yet. You can still draft or publish a
										revision-only handoff, but it will have no captured evidence.
									</p>
								) : (
									<div className="max-h-[14rem] space-y-2 overflow-y-auto pr-1">
										{endedSessions.map((bundle) => {
											const checked = selectedSnapshotSessions.includes(
												bundle.session.id,
											);
											return (
												<label
													key={bundle.session.id}
													className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm dark:bg-black/10"
												>
													<input
														type="checkbox"
														checked={checked}
														onChange={(event) => {
															setSelectedSnapshotSessions((current) =>
																event.target.checked
																	? [...current, bundle.session.id]
																	: current.filter(
																			(id) => id !== bundle.session.id,
																		),
															);
														}}
														className="mt-1"
													/>
													<span>
														<span className="block font-medium text-[var(--sea-ink)]">
															{bundle.session.title || "Untitled session"}
														</span>
														<span className="text-xs text-[var(--sea-ink-soft)]">
															{bundle.transcriptChunks.length} transcript
															chunks, {bundle.contextEvents.length} context
															events, {bundle.attentionItems.length} nudges
														</span>
													</span>
												</label>
											);
										})}
									</div>
								)}
							</div>

							<div className="grid gap-2">
								<Button
									variant="outline"
									onClick={handleGenerateDraftRevision}
									disabled={
										!isAuthor ||
										!latestRevision ||
										busyAction === "generate-draft"
									}
									className="w-full rounded-full"
								>
									<Sparkles className="h-3.5 w-3.5" />
									{busyAction === "generate-draft"
										? "Generating draft..."
										: "Generate draft revision"}
								</Button>

								<Button
									variant="brand"
									onClick={handlePublishSnapshot}
									disabled={
										!isAuthor ||
										!latestRevision ||
										busyAction === "publish-snapshot"
									}
									className="w-full rounded-full"
								>
									<FileCode2 className="h-3.5 w-3.5" />
									{busyAction === "publish-snapshot"
										? "Publishing..."
										: "Publish handoff snapshot"}
								</Button>
							</div>

							{!isAuthor && (
								<p className="text-xs text-[var(--sea-ink-soft)]">
									Only the plan author can create revisions or publish handoffs.
								</p>
							)}
						</WorkspacePanel>

						<WorkspacePanel
							title="Published handoffs"
							description="Review frozen handoffs, copy bot contract fields, and watch for stale snapshots."
							collapsed={collapsedSections.handoffList}
							onToggle={() => toggleSection("handoffList")}
							contentClassName="max-h-[30rem] space-y-3 overflow-y-auto pr-1"
							actions={<Badge variant="secondary">{snapshots.length}</Badge>}
						>
							{snapshots.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--sea-ink-soft)]">
									No published handoffs yet.
								</div>
							) : (
								snapshots.map((snapshot) => (
									<div
										key={snapshot.id}
										className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 dark:bg-black/10"
									>
										<div className="mb-3 flex flex-wrap items-start justify-between gap-3">
											<div>
												<div className="mb-1 flex items-center gap-2">
													<Badge variant="secondary">
														Revision {snapshot.revisionNumber ?? "?"}
													</Badge>
													<Badge variant="outline">
														{snapshot.agentRuns.length} agent runs
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
											</div>

											<a
												href={snapshot.publicUrl}
												className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] no-underline transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)] dark:bg-black/10"
											>
												<ExternalLink className="h-3.5 w-3.5" />
												Open public view
											</a>
										</div>

										<div className="mb-3 space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs">
											<CopyableRow
												label="Fetch URL"
												value={toAbsoluteUrl(appOrigin, snapshot.fetchUrl)}
												onCopy={() =>
													handleCopy(
														"handoff fetch URL",
														toAbsoluteUrl(appOrigin, snapshot.fetchUrl),
													)
												}
											/>
											<CopyableRow
												label="Writeback URL"
												value={toAbsoluteUrl(appOrigin, snapshot.writebackUrl)}
												onCopy={() =>
													handleCopy(
														"handoff writeback URL",
														toAbsoluteUrl(appOrigin, snapshot.writebackUrl),
													)
												}
											/>
											<CopyableRow
												label="Callback token"
												value={snapshot.callbackToken}
												onCopy={() =>
													handleCopy("handoff callback token", snapshot.callbackToken)
												}
											/>
										</div>

										{snapshot.agentRuns.length > 0 ? (
											<div className="max-h-[12rem] space-y-2 overflow-y-auto pr-1">
												{snapshot.agentRuns.map((run) => (
													<div
														key={run.id}
														className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
													>
														<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
															<div className="flex items-center gap-2">
																<Bot className="h-4 w-4 text-[var(--lagoon)]" />
																<span className="text-sm font-medium text-[var(--sea-ink)]">
																	{run.agentName}
																</span>
															</div>
															<Badge variant="outline">{run.status}</Badge>
														</div>
														<div className="space-y-1 text-xs text-[var(--sea-ink-soft)]">
															<p className="font-mono">{run.externalRunId}</p>
															{run.prUrl && (
																<p>
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
															{run.branch && <p>Branch: {run.branch}</p>}
															{run.testSummary && <p>{run.testSummary}</p>}
															{run.suggestedPlanDelta && (
																<p className="rounded-lg bg-white/80 px-2 py-1 text-[var(--sea-ink)] dark:bg-black/20">
																	{run.suggestedPlanDelta}
																</p>
															)}
														</div>
													</div>
												))}
											</div>
										) : (
											<p className="text-sm text-[var(--sea-ink-soft)]">
												No agent callbacks yet.
											</p>
										)}
									</div>
								))
							)}
						</WorkspacePanel>
					</div>
				</TabsContent>
			</Tabs>
			</div>
			)}
		</section>
	);
}

function WorkspacePanel(props: {
	title: string;
	description?: string;
	collapsed: boolean;
	onToggle: () => void;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
	actions?: ReactNode;
}) {
	return (
		<div
			className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)]/60 p-4 ${props.className ?? ""}`}
		>
			<div className="mb-3 flex items-start justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold text-[var(--sea-ink)]">
						{props.title}
					</h3>
					{props.description && (
						<p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
							{props.description}
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{props.actions}
					<Button
						size="sm"
						variant="ghost"
						onClick={props.onToggle}
						className="h-8 rounded-full px-2"
					>
						<ChevronDown
							className={`h-4 w-4 transition-transform ${
								props.collapsed ? "-rotate-90" : "rotate-0"
							}`}
						/>
						<span className="sr-only">
							{props.collapsed ? "Expand section" : "Collapse section"}
						</span>
					</Button>
				</div>
			</div>
			{!props.collapsed && (
				<div className={props.contentClassName}>{props.children}</div>
			)}
		</div>
	);
}

function CaptureDetail(props: {
	label: string;
	value: string;
	onCopy: () => void;
}) {
	return (
		<div className="rounded-xl border border-[var(--line)] bg-white/70 p-3 text-xs dark:bg-black/10">
			<div className="mb-1 flex items-center justify-between gap-2">
				<p className="font-medium text-[var(--sea-ink)]">{props.label}</p>
				<Button
					size="sm"
					variant="ghost"
					onClick={props.onCopy}
					className="h-7 rounded-full px-2"
				>
					<Copy className="h-3.5 w-3.5" />
				</Button>
			</div>
			<p className="break-all font-mono text-[var(--sea-ink-soft)]">
				{props.value}
			</p>
		</div>
	);
}

function BookmarkletLink({ href }: { href: string }) {
	if (!href) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--sea-ink-soft)] dark:bg-black/10">
				planmd capture
			</span>
		);
	}

	return (
		<span
			dangerouslySetInnerHTML={{
				__html: `<a href="${escapeHtmlAttribute(
					href,
				)}" class="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--sea-ink)] no-underline transition hover:border-[var(--lagoon)] hover:text-[var(--lagoon-deep)] dark:bg-black/10">planmd capture</a>`,
			}}
		/>
	);
}

function CopyableRow(props: {
	label: string;
	value: string;
	onCopy: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<p className="font-medium text-[var(--sea-ink)]">{props.label}</p>
				<p className="break-all font-mono text-[var(--sea-ink-soft)]">
					{props.value}
				</p>
			</div>
			<Button
				size="sm"
				variant="ghost"
				onClick={props.onCopy}
				className="h-7 shrink-0 rounded-full px-2"
			>
				<Copy className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

function TimelineRow({ item }: { item: WovenEvidenceItem }) {
	const label = [
		item.transcriptChunk?.speakerName || (item.transcriptChunk ? "Transcript" : null),
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
								URL: <span className="font-mono">{item.contextEvent.pageUrl}</span>
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
							<div
								key={attentionItem.id}
								className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
							>
								<div className="mb-1 flex flex-wrap gap-2">
									<Badge variant="outline">{attentionKindLabel(attentionItem.kind)}</Badge>
									<Badge variant="outline">{attentionItem.severity}</Badge>
									<Badge variant="outline">{attentionItem.state}</Badge>
								</div>
								<p>{attentionItem.summary}</p>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function providerLabel(value: "google_meet" | "manual") {
	return value === "manual" ? "Manual capture" : "Google Meet";
}

function contextKindLabel(value: string) {
	return (
		CONTEXT_KIND_OPTIONS.find((option) => option.value === value)?.label ??
		value
	);
}

function attentionKindLabel(value: string) {
	return (
		ATTENTION_KIND_OPTIONS.find((option) => option.value === value)?.label ??
		value
	);
}

function formatDateTime(date: Date | string) {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(typeof date === "string" ? new Date(date) : date);
}

function parseOptionalNumber(value: string) {
	if (!value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
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

function getActionError(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function toAbsoluteUrl(appOrigin: string, path: string) {
	return appOrigin ? `${appOrigin}${path}` : path;
}

function escapeHtmlAttribute(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
