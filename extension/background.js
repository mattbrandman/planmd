/**
 * background.js — Background service worker for planmd Meet Transcription.
 *
 * Manages the audio capture lifecycle:
 * 1. Receives start/stop commands from the popup
 * 2. Uses chrome.tabCapture.getMediaStreamId() to capture audio from the active tab
 * 3. Creates an offscreen document to handle MediaRecorder (not available in service workers)
 * 4. The offscreen document records audio in chunks and sends them to the planmd API
 * 5. Relays status updates and transcript results back to the popup
 */

// ─── State ───────────────────────────────────────────────────────────────────

let offscreenReadyResolve = null;

function waitForOffscreenReady() {
	// If offscreen is already created and might be ready, give it a moment
	return new Promise((resolve) => {
		offscreenReadyResolve = resolve;
		// Timeout fallback in case the ready message was already sent before we started listening
		setTimeout(resolve, 1000);
	});
}

let captureState = {
	active: false,
	tabId: null,
	streamId: null,
	sessionId: null,
	captureToken: null,
	apiBaseUrl: null,
};

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Route messages based on type
	switch (message.type) {
		case "start-capture":
			handleStartCapture(message).then(sendResponse);
			return true; // Keep the message channel open for async response

		case "stop-capture":
			handleStopCapture().then(sendResponse);
			return true;

		case "chunk-sent":
			// Offscreen document reports a successfully sent chunk
			handleChunkResult(message);
			return false;

		case "chunk-error":
			// Offscreen document reports an error sending a chunk
			handleChunkError(message);
			return false;

		case "offscreen-ready":
			// Offscreen document is ready — resolve any pending waiter
			if (offscreenReadyResolve) {
				offscreenReadyResolve();
				offscreenReadyResolve = null;
			}
			return false;

		default:
			return false;
	}
});

// ─── Mic Permission ─────────────────────────────────────────────────────────

/**
 * Ensure mic permission is granted (first time only).
 *
 * Injects a 0x0 iframe into the active tab (same pattern as Loom/Fireflies).
 * The iframe loads mic-permission.html (a web_accessible_resource) which
 * immediately calls getUserMedia() — Chrome shows its native permission
 * prompt anchored to the current page. Once granted, permission persists
 * and this function becomes a no-op.
 */
async function ensureMicPermission(tabId) {
	// Check if already granted
	try {
		const status = await navigator.permissions.query({ name: "microphone" });
		if (status.state === "granted") return true;
	} catch {
		// permissions.query may not be available in service worker
	}

	// Inject a 0x0 iframe into the current tab (like Loom's permissionsCheck)
	console.log("[planmd] Requesting mic permission...");
	await chrome.scripting.executeScript({
		target: { tabId },
		func: (extensionId) => {
			if (document.getElementById("planmd-mic-check")) return;
			const iframe = document.createElement("iframe");
			iframe.id = "planmd-mic-check";
			iframe.allow = "microphone";
			iframe.src = `chrome-extension://${extensionId}/mic-permission.html`;
			iframe.title = "Permissions Check";
			Object.assign(iframe.style, {
				width: "0",
				height: "0",
				border: "none",
				position: "fixed",
				top: "0",
				right: "0",
				overflow: "hidden",
			});
			document.body.appendChild(iframe);
		},
		args: [chrome.runtime.id],
	});

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			chrome.runtime.onMessage.removeListener(listener);
			removePermissionIframe(tabId);
			console.warn("[planmd] Mic permission request timed out.");
			resolve(false);
		}, 30000);

		const listener = (msg) => {
			if (msg.type === "mic-permission-granted" || msg.type === "mic-permission-denied") {
				chrome.runtime.onMessage.removeListener(listener);
				clearTimeout(timeout);
				console.log(`[planmd] Mic permission ${msg.type === "mic-permission-granted" ? "granted" : "denied"}.`);
				removePermissionIframe(tabId);
				resolve(msg.type === "mic-permission-granted");
			}
		};
		chrome.runtime.onMessage.addListener(listener);
	});
}

function removePermissionIframe(tabId) {
	chrome.scripting.executeScript({
		target: { tabId },
		func: () => document.getElementById("planmd-mic-check")?.remove(),
	}).catch(() => {});
}

// ─── Start Capture ───────────────────────────────────────────────────────────

/**
 * Start capturing audio from the currently active tab.
 *
 * Flow:
 * 1. Get the active tab ID
 * 2. Ensure mic permission (0x0 iframe, first time only)
 * 3. Call chrome.tabCapture.getMediaStreamId() to get a stream ID
 * 4. Create/ensure offscreen document exists
 * 5. Send the stream ID + API config to the offscreen document
 */
async function handleStartCapture({ sessionId, captureToken, apiBaseUrl }) {
	try {
		if (captureState.active) {
			return { success: false, error: "Capture is already active." };
		}

		// Validate inputs
		if (!sessionId || !captureToken || !apiBaseUrl) {
			return { success: false, error: "Missing session configuration." };
		}

		// 1. Get the active tab
		const [activeTab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});

		if (!activeTab?.id) {
			return { success: false, error: "No active tab found." };
		}

		// 2. Ensure mic permission (0x0 iframe on first use, then no-op)
		const micGranted = await ensureMicPermission(activeTab.id);
		if (!micGranted) {
			console.warn("[planmd] Proceeding without mic — tab audio only.");
		}

		// 3. Create offscreen document first and wait for it to be ready
		//    (must exist before we get the stream ID, so it can consume it)
		await ensureOffscreenDocument();
		await waitForOffscreenReady();

		// 4. Get a media stream ID for the tab's audio
		//    The offscreen document will consume this via getUserMedia
		const streamId = await new Promise((resolve, reject) => {
			chrome.tabCapture.getMediaStreamId(
				{ targetTabId: activeTab.id },
				(id) => {
					if (chrome.runtime.lastError) {
						reject(new Error(chrome.runtime.lastError.message));
					} else {
						resolve(id);
					}
				},
			);
		});

		if (!streamId) {
			return {
				success: false,
				error: "Failed to get media stream ID from tab.",
			};
		}

		// 5. Send configuration to the offscreen document immediately
		//    (stream ID expires quickly, so don't delay)
		await chrome.runtime.sendMessage({
			type: "start-recording",
			target: "offscreen",
			streamId,
			sessionId,
			captureToken,
			apiBaseUrl,
		});

		// 6. Update state
		captureState = {
			active: true,
			tabId: activeTab.id,
			streamId,
			sessionId,
			captureToken,
			apiBaseUrl,
		};

		console.log(
			`[planmd] Capture started for tab ${activeTab.id} (${activeTab.title})`,
		);
		return { success: true };
	} catch (err) {
		console.error("[planmd] Start capture failed:", err);
		return { success: false, error: err.message };
	}
}

// ─── Stop Capture ────────────────────────────────────────────────────────────

async function handleStopCapture() {
	try {
		if (!captureState.active) {
			return { success: true }; // Already stopped
		}

		// Tell the offscreen document to stop recording
		try {
			await chrome.runtime.sendMessage({
				type: "stop-recording",
				target: "offscreen",
			});
		} catch {
			// Offscreen document may already be closed
		}

		// Close the offscreen document
		await closeOffscreenDocument();

		// Reset state
		captureState = {
			active: false,
			tabId: null,
			streamId: null,
			sessionId: null,
			captureToken: null,
			apiBaseUrl: null,
		};

		console.log("[planmd] Capture stopped.");
		return { success: true };
	} catch (err) {
		console.error("[planmd] Stop capture failed:", err);
		return { success: false, error: err.message };
	}
}

// ─── Chunk Results ───────────────────────────────────────────────────────────

/**
 * Handle successful chunk upload from the offscreen document.
 * Forward transcript text to the popup for display.
 */
function handleChunkResult(message) {
	console.log("[planmd] Chunk sent successfully:", message.chunkIndex);

	// Forward transcript text to popup (if popup is open)
	chrome.runtime
		.sendMessage({
			type: "transcript-chunk",
			text: message.transcript || `Chunk #${message.chunkIndex} sent`,
			chunkIndex: message.chunkIndex,
		})
		.catch(() => {
			// Popup not open — that's fine
		});
}

/**
 * Handle chunk upload error from the offscreen document.
 */
function handleChunkError(message) {
	console.error("[planmd] Chunk send failed:", message.error);

	// Notify popup of the error
	chrome.runtime
		.sendMessage({
			type: "status-update",
			status: "error",
			error: `Failed to send audio chunk: ${message.error}`,
		})
		.catch(() => {
			// Popup not open
		});
}

// ─── Offscreen Document Management ──────────────────────────────────────────

const OFFSCREEN_URL = "offscreen.html";

/**
 * Create the offscreen document if it doesn't already exist.
 * The offscreen document is needed because MediaRecorder is not available
 * in the service worker context.
 */
async function ensureOffscreenDocument() {
	// Check if we already have an offscreen document
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
	});

	if (existingContexts.length > 0) {
		return; // Already exists
	}

	// Create the offscreen document
	await chrome.offscreen.createDocument({
		url: OFFSCREEN_URL,
		reasons: ["USER_MEDIA"],
		justification:
			"Recording audio from tab capture for planmd transcription",
	});

	console.log("[planmd] Offscreen document created.");
}

/**
 * Close the offscreen document if it exists.
 */
async function closeOffscreenDocument() {
	try {
		const existingContexts = await chrome.runtime.getContexts({
			contextTypes: ["OFFSCREEN_DOCUMENT"],
			documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
		});

		if (existingContexts.length > 0) {
			await chrome.offscreen.closeDocument();
			console.log("[planmd] Offscreen document closed.");
		}
	} catch (err) {
		console.warn("[planmd] Error closing offscreen document:", err);
	}
}

// ─── Tab Removal Listener ────────────────────────────────────────────────────

/**
 * If the captured tab is closed, automatically stop the capture.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
	if (captureState.active && captureState.tabId === tabId) {
		console.log("[planmd] Captured tab closed, stopping capture.");
		await handleStopCapture();

		// Notify popup
		chrome.runtime
			.sendMessage({
				type: "status-update",
				status: "connected",
				error: "Captured tab was closed. Capture stopped.",
			})
			.catch(() => {});
	}
});
