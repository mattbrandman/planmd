import { env } from "cloudflare:workers";

export async function transcribeWithDiarization(args: {
	audioBuffer: ArrayBuffer;
	contentType: string;
	speakerHints?: string | null;
}): Promise<{ segments: Array<{ speakerName: string; text: string }> }> {
	const apiKey = env.OPENAI_API_KEY;
	if (!apiKey) {
		throw new Error(
			"OPENAI_API_KEY is not configured. Set it via `wrangler secret put OPENAI_API_KEY`.",
		);
	}

	// Log what we're receiving for debugging
	const ext = extensionFromContentType(args.contentType);
	const mimeType = args.contentType?.split(";")[0]?.trim() || "audio/webm";
	console.log(
		`[transcription] Received ${args.audioBuffer.byteLength} bytes, contentType="${args.contentType}", ext="${ext}", mimeType="${mimeType}"`,
	);

	const form = new FormData();
	const blob = new Blob([args.audioBuffer], { type: mimeType });
	form.set("file", blob, `audio.${ext}`);
	form.set("model", "whisper-1");
	form.set("response_format", "verbose_json");

	const response = await fetch(
		"https://api.openai.com/v1/audio/transcriptions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
			body: form,
		},
	);

	if (!response.ok) {
		const responseBody = await response.text();
		throw new Error(
			`OpenAI transcription API error (${response.status}): ${responseBody}`,
		);
	}

	const result = (await response.json()) as WhisperVerboseResponse;
	const text = result.text?.trim() ?? "";

	if (text.length === 0) {
		return { segments: [] };
	}

	return {
		segments: [{ speakerName: "Speaker", text }],
	};
}

/** Map common audio MIME types to file extensions Whisper recognizes. */
function extensionFromContentType(contentType: string): string {
	const map: Record<string, string> = {
		"audio/webm": "webm",
		"audio/ogg": "ogg",
		"audio/mpeg": "mp3",
		"audio/mp3": "mp3",
		"audio/mp4": "mp4",
		"audio/m4a": "m4a",
		"audio/wav": "wav",
		"audio/x-wav": "wav",
		"audio/flac": "flac",
		"audio/x-flac": "flac",
	};

	const base = contentType.split(";")[0].trim().toLowerCase();
	return map[base] ?? "webm";
}

interface WhisperVerboseResponse {
	text: string;
	language?: string;
	duration?: number;
	segments?: Array<{
		start: number;
		end: number;
		text: string;
	}>;
}
