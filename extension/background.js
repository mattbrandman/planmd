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

// ─── Start Capture ───────────────────────────────────────────────────────────

/**
 * Start capturing audio from the currently active tab.
 *
 * Flow:
 * 1. Get the active tab ID
 * 2. Call chrome.tabCapture.getMediaStreamId() to get a stream ID
 * 3. Create/ensure offscreen document exists
 * 4. Send the stream ID + API config to the offscreen document
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

		// 2. Create offscreen document first and wait for it to be ready
		//    (must exist before we get the stream ID, so it can consume it)
		await ensureOffscreenDocument();
		await waitForOffscreenReady();

		// 3. Get a media stream ID for the tab's audio
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

		// 4. Send configuration to the offscreen document immediately
		//    (stream ID expires quickly, so don't delay)
		await chrome.runtime.sendMessage({
			type: "start-recording",
			target: "offscreen",
			streamId,
			sessionId,
			captureToken,
			apiBaseUrl,
		});

		// 5. Update state
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
