/**
 * Diff utilities for comment carry-forward and revision comparison.
 */

import { diffLines } from "diff";
import { parseSections } from "./markdown";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiffLine {
	type: "add" | "remove" | "same";
	text: string;
	oldLineNumber: number | null;
	newLineNumber: number | null;
}

export interface LinePosition {
	newStartLine: number | null;
	newEndLine: number | null;
	outdated: boolean;
}

export interface ContextSnapshot {
	lines: string[];
	startLine: number;
	endLine: number;
	sectionTitle?: string;
}

// ── Myers diff for revision comparison ───────────────────────────────────────

export function computeDiff(oldText: string, newText: string): DiffLine[] {
	const changes = diffLines(oldText, newText);
	const result: DiffLine[] = [];
	let oldLine = 1;
	let newLine = 1;

	for (const change of changes) {
		const lines = change.value.replace(/\n$/, "").split("\n");

		if (change.added) {
			for (const text of lines) {
				result.push({
					type: "add",
					text,
					oldLineNumber: null,
					newLineNumber: newLine,
				});
				newLine++;
			}
		} else if (change.removed) {
			for (const text of lines) {
				result.push({
					type: "remove",
					text,
					oldLineNumber: oldLine,
					newLineNumber: null,
				});
				oldLine++;
			}
		} else {
			for (const text of lines) {
				result.push({
					type: "same",
					text,
					oldLineNumber: oldLine,
					newLineNumber: newLine,
				});
				oldLine++;
				newLine++;
			}
		}
	}

	return result;
}

// ── Find where old lines appear in new content ──────────────────────────────

export function findLinesInNewContent(
	oldContent: string,
	newContent: string,
	startLine: number,
	endLine: number,
): LinePosition {
	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	// Extract the target lines (1-indexed)
	const targetLines = oldLines.slice(startLine - 1, endLine);
	if (targetLines.length === 0) {
		return { newStartLine: null, newEndLine: null, outdated: true };
	}

	const targetText = targetLines.join("\n");
	const rangeLength = targetLines.length;

	// Try exact position first
	if (startLine - 1 + rangeLength <= newLines.length) {
		const samePos = newLines
			.slice(startLine - 1, startLine - 1 + rangeLength)
			.join("\n");
		if (samePos === targetText) {
			return { newStartLine: startLine, newEndLine: endLine, outdated: false };
		}
	}

	// Full scan for exact match
	for (let i = 0; i <= newLines.length - rangeLength; i++) {
		const candidate = newLines.slice(i, i + rangeLength).join("\n");
		if (candidate === targetText) {
			return {
				newStartLine: i + 1,
				newEndLine: i + rangeLength,
				outdated: false,
			};
		}
	}

	// Not found — outdated
	return { newStartLine: null, newEndLine: null, outdated: true };
}

// ── Check if a section's content changed ─────────────────────────────────────

export function isSectionChanged(
	oldContent: string,
	newContent: string,
	sectionId: string,
): boolean {
	const oldSections = parseSections(oldContent);
	const newSections = parseSections(newContent);

	const oldSection = oldSections.find((s) => s.id === sectionId);
	const newSection = newSections.find((s) => s.id === sectionId);

	if (!oldSection || !newSection) return true;

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	const oldText = oldLines
		.slice(oldSection.startLine - 1, oldSection.endLine - 1)
		.join("\n");
	const newText = newLines
		.slice(newSection.startLine - 1, newSection.endLine - 1)
		.join("\n");

	return oldText !== newText;
}

// ── Capture context snapshot ─────────────────────────────────────────────────

export function extractContextSnapshot(
	content: string,
	startLine: number,
	endLine: number,
	contextLines = 2,
): ContextSnapshot {
	const lines = content.split("\n");
	const totalLines = lines.length;

	const ctxStart = Math.max(0, startLine - 1 - contextLines);
	const ctxEnd = Math.min(totalLines, endLine + contextLines);

	const snapshotLines = lines.slice(ctxStart, ctxEnd);

	// Find section title by looking upward for nearest heading
	let sectionTitle: string | undefined;
	for (let i = startLine - 2; i >= 0; i--) {
		const match = lines[i].match(/^#{1,6}\s+(.+)$/);
		if (match) {
			sectionTitle = match[1].trim();
			break;
		}
	}

	return {
		lines: snapshotLines,
		startLine: ctxStart + 1,
		endLine: ctxEnd,
		sectionTitle,
	};
}
