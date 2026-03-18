/**
 * popup.js — Popup UI logic for the planmd Meet Transcription extension.
 *
 * Manages the popup state: connecting to a planmd session, starting/stopping
 * audio capture, and displaying recent transcript chunks. Communicates with
 * the background service worker via chrome.runtime messaging.
 */

// ─── DOM Elements ────────────────────────────────────────────────────────────

const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");
const errorMsg = document.getElementById("errorMsg");
const sessionUrlInput = document.getElementById("sessionUrl");
const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const connectBtn = document.getElementById("connectBtn");
const captureBtn = document.getElementById("captureBtn");
const transcriptPreview = document.getElementById("transcriptPreview");

// ─── State ───────────────────────────────────────────────────────────────────

let currentState = {
	status: "disconnected", // disconnected | connected | capturing | error
	sessionId: null,
	captureToken: null,
	apiBaseUrl: "https://planmd.dev",
	recentChunks: [],
};

// ─── Initialization ──────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
	// Restore persisted state from storage
	const stored = await chrome.storage.local.get([
		"sessionId",
		"captureToken",
		"apiBaseUrl",
		"status",
		"recentChunks",
	]);

	if (stored.apiBaseUrl) {
		apiBaseUrlInput.value = stored.apiBaseUrl;
		currentState.apiBaseUrl = stored.apiBaseUrl;
	}

	if (stored.sessionId && stored.captureToken) {
		currentState.sessionId = stored.sessionId;
		currentState.captureToken = stored.captureToken;
		// Show the token in the input so user knows they're connected
		sessionUrlInput.value = `Session: ${stored.sessionId}`;
	}

	if (stored.status && stored.status !== "disconnected") {
		currentState.status = stored.status;
	}

	if (stored.recentChunks) {
		currentState.recentChunks = stored.recentChunks;
	}

	updateUI();
});

// ─── Event Handlers ──────────────────────────────────────────────────────────

connectBtn.addEventListener("click", async () => {
	if (
		currentState.status === "connected" ||
		currentState.status === "capturing"
	) {
		// Disconnect: stop capture if running, then clear session
		if (currentState.status === "capturing") {
			await sendToBackground({ type: "stop-capture" });
		}
		currentState.sessionId = null;
		currentState.captureToken = null;
		currentState.status = "disconnected";
		currentState.recentChunks = [];
		sessionUrlInput.value = "";

		await chrome.storage.local.remove([
			"sessionId",
			"captureToken",
			"status",
			"recentChunks",
		]);
		clearError();
		updateUI();
		return;
	}

	// Connect: parse the session URL or token
	const input = sessionUrlInput.value.trim();
	if (!input) {
		showError("Please enter a session URL or capture token.");
		return;
	}

	const parsed = parseSessionInput(input);
	if (!parsed) {
		showError(
			"Could not parse session info. Enter a full URL (https://planmd.dev/session/{id}?token={token}) or a capture token.",
		);
		return;
	}

	const apiBase = apiBaseUrlInput.value.trim().replace(/\/+$/, "");
	if (!apiBase) {
		showError("Please enter an API base URL.");
		return;
	}

	currentState.sessionId = parsed.sessionId;
	currentState.captureToken = parsed.captureToken;
	currentState.apiBaseUrl = apiBase;
	currentState.status = "connected";

	await chrome.storage.local.set({
		sessionId: parsed.sessionId,
		captureToken: parsed.captureToken,
		apiBaseUrl: apiBase,
		status: "connected",
	});

	clearError();
	updateUI();
});

captureBtn.addEventListener("click", async () => {
	if (currentState.status === "capturing") {
		// Stop capture
		const response = await sendToBackground({ type: "stop-capture" });
		if (response?.success) {
			currentState.status = "connected";
			await chrome.storage.local.set({ status: "connected" });
		} else {
			showError(response?.error || "Failed to stop capture.");
			currentState.status = "error";
		}
	} else if (currentState.status === "connected") {
		// Start capture
		clearError();
		const response = await sendToBackground({
			type: "start-capture",
			sessionId: currentState.sessionId,
			captureToken: currentState.captureToken,
			apiBaseUrl: currentState.apiBaseUrl,
		});
		if (response?.success) {
			currentState.status = "capturing";
			await chrome.storage.local.set({ status: "capturing" });
		} else {
			showError(response?.error || "Failed to start capture.");
			currentState.status = "error";
		}
	}

	updateUI();
});

// ─── Background Worker Messages ──────────────────────────────────────────────

/**
 * Listen for status updates and transcript chunks from the background worker.
 */
chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "status-update") {
		currentState.status = message.status;
		if (message.error) {
			showError(message.error);
		} else {
			clearError();
		}
		chrome.storage.local.set({ status: message.status });
		updateUI();
	}

	if (message.type === "transcript-chunk") {
		const chunk = {
			text: message.text || "(audio chunk sent)",
			timestamp: new Date().toLocaleTimeString(),
		};
		currentState.recentChunks.push(chunk);
		// Keep only last 10 chunks in the preview
		if (currentState.recentChunks.length > 10) {
			currentState.recentChunks = currentState.recentChunks.slice(-10);
		}
		chrome.storage.local.set({ recentChunks: currentState.recentChunks });
		renderTranscript();
	}
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a session URL or bare capture token into { sessionId, captureToken }.
 *
 * Accepted formats:
 *   - Full URL: https://planmd.dev/session/{sessionId}?token={captureToken}
 *   - Full URL: https://planmd.dev/api/sessions/{sessionId}/transcribe (token separate)
 *   - Just a token string (used as both sessionId placeholder and token)
 *   - sessionId:captureToken format
 */
function parseSessionInput(input) {
	// Try URL parsing first
	try {
		const url = new URL(input);
		const pathParts = url.pathname.split("/").filter(Boolean);

		// Look for /session/{id} or /sessions/{id} in path
		const sessionIdx = pathParts.findIndex(
			(p) => p === "session" || p === "sessions",
		);
		if (sessionIdx !== -1 && pathParts[sessionIdx + 1]) {
			const sessionId = pathParts[sessionIdx + 1];
			const token = url.searchParams.get("token");
			if (token) {
				return { sessionId, captureToken: token };
			}
		}
	} catch {
		// Not a URL, continue to other formats
	}

	// Try sessionId:captureToken format
	if (input.includes(":") && !input.includes("//")) {
		const [sessionId, captureToken] = input.split(":", 2);
		if (sessionId && captureToken) {
			return { sessionId, captureToken };
		}
	}

	// Treat as a bare token — user will need to also provide session ID somehow.
	// For MVP, use the token as both (the API endpoint needs the real session ID).
	// A better UX would have separate fields, but this keeps it simple.
	if (input.length > 8) {
		return { sessionId: input, captureToken: input };
	}

	return null;
}

/**
 * Send a message to the background service worker and wait for a response.
 */
function sendToBackground(message) {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(message, (response) => {
			resolve(response);
		});
	});
}

function showError(msg) {
	errorMsg.textContent = msg;
	errorMsg.classList.add("visible");
}

function clearError() {
	errorMsg.textContent = "";
	errorMsg.classList.remove("visible");
}

// ─── UI Rendering ────────────────────────────────────────────────────────────

function updateUI() {
	const { status } = currentState;

	// Update status bar
	statusBar.className = `status-bar status-${status}`;
	const statusLabels = {
		disconnected: "Disconnected",
		connected: "Connected",
		capturing: "Capturing Audio...",
		error: "Error",
	};
	statusText.textContent = statusLabels[status] || status;

	// Update inputs — disable when connected/capturing
	const inputsLocked = status === "connected" || status === "capturing";
	sessionUrlInput.disabled = inputsLocked;
	apiBaseUrlInput.disabled = inputsLocked;

	// Update connect button
	if (status === "disconnected" || status === "error") {
		connectBtn.textContent = "Connect";
		connectBtn.className = "btn-primary";
		connectBtn.disabled = false;
	} else {
		connectBtn.textContent = "Disconnect";
		connectBtn.className = "btn-danger";
		connectBtn.disabled = false;
	}

	// Update capture button
	if (status === "capturing") {
		captureBtn.textContent = "Stop Capture";
		captureBtn.className = "btn-danger";
		captureBtn.disabled = false;
	} else if (status === "connected") {
		captureBtn.textContent = "Start Capture";
		captureBtn.className = "btn-primary";
		captureBtn.disabled = false;
	} else {
		captureBtn.textContent = "Start Capture";
		captureBtn.className = "btn-secondary";
		captureBtn.disabled = true;
	}

	renderTranscript();
}

function renderTranscript() {
	transcriptPreview.innerHTML = "";
	for (const chunk of currentState.recentChunks) {
		const div = document.createElement("div");
		div.className = "transcript-chunk";

		const time = document.createElement("div");
		time.className = "chunk-time";
		time.textContent = chunk.timestamp;
		div.appendChild(time);

		const text = document.createElement("div");
		text.textContent = chunk.text;
		div.appendChild(text);

		transcriptPreview.appendChild(div);
	}

	// Auto-scroll to bottom
	transcriptPreview.scrollTop = transcriptPreview.scrollHeight;
}
