// Runs in a popup window opened by the background service worker.
// Immediately calls getUserMedia to trigger Chrome's native permission prompt.
// Once granted, permission persists for this extension origin.
(async () => {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		stream.getTracks().forEach((t) => t.stop());
		chrome.runtime.sendMessage({ type: "mic-permission-granted" });
	} catch (err) {
		chrome.runtime.sendMessage({
			type: "mic-permission-denied",
			error: err.message,
		});
	}
})();
