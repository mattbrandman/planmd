/**
 * offscreen.js — Offscreen document for audio recording and transcription.
 *
 * This runs in an offscreen document (not the service worker) because
 * MediaRecorder and getUserMedia are not available in service worker contexts.
 *
 * Lifecycle:
 * 1. Receives a stream ID from the background worker
 * 2. Uses navigator.mediaDevices.getUserMedia() with the chromeMediaSource
 *    constraint to get the actual MediaStream from the tab
 * 3. Records audio using MediaRecorder in 30-second chunks
 * 4. On each chunk, sends the audio blob to the planmd transcription API
 * 5. Reports results back to the background worker
 */

// ─── State ───────────────────────────────────────────────────────────────────

let mediaStream = null;
let micStream = null;
let mediaRecorder = null;
let chunkIndex = 0;

// API configuration (set when recording starts)
let config = {
	sessionId: null,
	captureToken: null,
	apiBaseUrl: null,
};

// Recording interval: 5 seconds per chunk
const CHUNK_INTERVAL_MS = 5_000;

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Only handle messages targeted at the offscreen document
	if (message.target !== "offscreen") return;

	switch (message.type) {
		case "start-recording":
			startRecording(message);
			break;

		case "stop-recording":
			stopRecording();
			break;
	}
});

// ─── Start Recording ─────────────────────────────────────────────────────────

/**
 * Start recording audio from the captured tab.
 *
 * Uses the stream ID from chrome.tabCapture.getMediaStreamId() to obtain
 * the actual MediaStream via getUserMedia with chromeMediaSource constraints.
 */
async function startRecording({ streamId, sessionId, captureToken, apiBaseUrl }) {
	try {
		// Store API configuration
		config = { sessionId, captureToken, apiBaseUrl };
		chunkIndex = 0;

		// Get the actual media stream from the tab capture stream ID.
		// MV3 requires both audio AND video mandatory constraints with the stream ID,
		// matching the official Chrome sample (sample.tabcapture-recorder).
		mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				mandatory: {
					chromeMediaSource: "tab",
					chromeMediaSourceId: streamId,
				},
			},
			video: {
				mandatory: {
					chromeMediaSource: "tab",
					chromeMediaSourceId: streamId,
				},
			},
		});

		// Stop video tracks — we only need audio
		for (const track of mediaStream.getVideoTracks()) {
			track.stop();
		}

		// Also capture the user's microphone so we get both sides of the conversation.
		// The offscreen document with USER_MEDIA reason can call getUserMedia.
		try {
			micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			console.log("[planmd:offscreen] Mic stream acquired");
		} catch (micErr) {
			console.warn("[planmd:offscreen] Could not capture mic:", micErr.name, micErr.message);
			console.warn("[planmd:offscreen] Will only record tab audio (other participants).");
			console.warn("[planmd:offscreen] To enable mic: go to chrome://settings/content/microphone and allow this extension.");
		}

		// Mix tab audio + mic audio using AudioContext
		const audioCtx = new AudioContext();
		const destination = audioCtx.createMediaStreamDestination();

		// Tab audio → mixer
		const tabSource = audioCtx.createMediaStreamSource(mediaStream);
		tabSource.connect(destination);

		// Also play tab audio back so the user still hears the meeting
		tabSource.connect(audioCtx.destination);

		// Mic audio → mixer (if available)
		if (micStream) {
			const micSource = audioCtx.createMediaStreamSource(micStream);
			micSource.connect(destination);
		}

		const mixedStream = destination.stream;

		if (mixedStream.getAudioTracks().length === 0) {
			throw new Error("No audio tracks in the mixed stream.");
		}

		console.log(
			"[planmd:offscreen] Mixed stream with",
			mixedStream.getAudioTracks().length,
			"audio track(s)",
			micStream ? "(tab + mic)" : "(tab only)",
		);

		// Determine the best available audio format.
		const mimeType = selectMimeType();

		// Create the MediaRecorder with the mixed stream
		mediaRecorder = new MediaRecorder(mixedStream, {
			mimeType,
			audioBitsPerSecond: 64_000,
		});

		// Handle each recorded chunk
		mediaRecorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) {
				handleAudioChunk(event.data);
			}
		};

		// Handle recorder errors
		mediaRecorder.onerror = (event) => {
			console.error("[planmd:offscreen] MediaRecorder error:", event.error);
			chrome.runtime.sendMessage({
				type: "chunk-error",
				error: `MediaRecorder error: ${event.error?.message || "unknown"}`,
			});
		};

		// Handle recorder stopping (e.g., if the stream ends)
		mediaRecorder.onstop = () => {
			console.log("[planmd:offscreen] MediaRecorder stopped.");
		};

		// Start recording with the specified chunk interval
		mediaRecorder.start(CHUNK_INTERVAL_MS);
		console.log(
			`[planmd:offscreen] Recording started (${mimeType}, ${CHUNK_INTERVAL_MS / 1000}s chunks)`,
		);
	} catch (err) {
		console.error("[planmd:offscreen] Failed to start recording:", err);
		chrome.runtime.sendMessage({
			type: "chunk-error",
			error: `Failed to start recording: ${err.message}`,
		});
	}
}

// ─── Stop Recording ──────────────────────────────────────────────────────────

function stopRecording() {
	console.log("[planmd:offscreen] Stopping recording...");

	if (mediaRecorder && mediaRecorder.state !== "inactive") {
		mediaRecorder.stop();
	}

	if (mediaStream) {
		for (const track of mediaStream.getTracks()) {
			track.stop();
		}
	}

	if (micStream) {
		for (const track of micStream.getTracks()) {
			track.stop();
		}
	}

	mediaRecorder = null;
	mediaStream = null;
	micStream = null;
}

// ─── Audio Chunk Handling ────────────────────────────────────────────────────

/**
 * Handle a recorded audio chunk:
 * 1. Create a FormData payload with the audio blob
 * 2. POST it to the planmd transcription endpoint
 * 3. Report success/failure back to the background worker
 */
async function handleAudioChunk(blob) {
	const currentChunkIndex = chunkIndex++;
	console.log(
		`[planmd:offscreen] Audio chunk #${currentChunkIndex}: ${blob.size} bytes (${blob.type})`,
	);

	// Skip small chunks (initialization artifacts or near-silence)
	if (blob.size < 5000) {
		console.log(
			`[planmd:offscreen] Skipping tiny chunk #${currentChunkIndex} (${blob.size} bytes)`,
		);
		return;
	}

	try {
		const { sessionId, captureToken, apiBaseUrl } = config;

		if (!sessionId || !captureToken || !apiBaseUrl) {
			throw new Error("Missing API configuration.");
		}

		// Build the API URL
		const url = `${apiBaseUrl}/api/sessions/${sessionId}/transcribe`;

		// Create FormData with the audio blob
		const formData = new FormData();
		formData.append("audio", blob, `chunk-${currentChunkIndex}.webm`);
		formData.append("chunkIndex", String(currentChunkIndex));
		formData.append("chunkStartMs", String(Date.now()));
		formData.append("chunkDurationMs", String(CHUNK_INTERVAL_MS));

		// Send to the planmd API
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"x-planmd-session-token": captureToken,
			},
			body: formData,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");
			throw new Error(`HTTP ${response.status}: ${errorText}`);
		}

		// Parse the response — may contain transcript text
		const result = await response.json().catch(() => ({}));

		// Extract transcript text from the response chunks array
		const transcriptText =
			result.chunks?.map((c) => `${c.speakerName}: ${c.transcriptText}`).join("\n") ||
			null;

		// Report success to the background worker
		chrome.runtime.sendMessage({
			type: "chunk-sent",
			chunkIndex: currentChunkIndex,
			transcript: transcriptText,
		});

		console.log(
			`[planmd:offscreen] Chunk #${currentChunkIndex} sent successfully.`,
		);
	} catch (err) {
		console.error(
			`[planmd:offscreen] Failed to send chunk #${currentChunkIndex}:`,
			err,
		);

		// Report error to the background worker
		chrome.runtime.sendMessage({
			type: "chunk-error",
			chunkIndex: currentChunkIndex,
			error: err.message,
		});
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Select the best available audio MIME type for recording.
 * Prefers webm/opus, falls back to webm/vorbis, then to whatever is available.
 */
function selectMimeType() {
	const preferred = [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/ogg;codecs=opus",
		"audio/mp4",
	];

	for (const type of preferred) {
		if (MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}

	// Fallback: let the browser choose
	console.warn(
		"[planmd:offscreen] None of the preferred MIME types are supported. Using default.",
	);
	return "";
}

// Notify background that the offscreen document is ready
chrome.runtime.sendMessage({ type: "offscreen-ready" }).catch(() => {});
