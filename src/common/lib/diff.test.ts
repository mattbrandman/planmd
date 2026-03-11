import { describe, expect, it } from "vitest";
import {
	computeDiff,
	extractContextSnapshot,
	findLinesInNewContent,
	isSectionChanged,
} from "./diff";

describe("computeDiff", () => {
	it("returns same lines for identical content", () => {
		const result = computeDiff("hello\nworld", "hello\nworld");
		expect(result).toEqual([
			{ type: "same", text: "hello", oldLineNumber: 1, newLineNumber: 1 },
			{ type: "same", text: "world", oldLineNumber: 2, newLineNumber: 2 },
		]);
	});

	it("detects added lines", () => {
		const result = computeDiff("a\nc", "a\nb\nc");
		const added = result.filter((l) => l.type === "add");
		expect(added).toHaveLength(1);
		expect(added[0].text).toBe("b");
	});

	it("detects removed lines", () => {
		const result = computeDiff("a\nb\nc", "a\nc");
		const removed = result.filter((l) => l.type === "remove");
		expect(removed).toHaveLength(1);
		expect(removed[0].text).toBe("b");
	});

	it("tracks line numbers correctly", () => {
		const result = computeDiff("a\nb", "a\nc\nb");
		// a is same (1,1), c is added (null,2), b is same (2,3)
		const same = result.filter((l) => l.type === "same");
		expect(same[0]).toMatchObject({ text: "a", oldLineNumber: 1, newLineNumber: 1 });
		expect(same[1]).toMatchObject({ text: "b", oldLineNumber: 2, newLineNumber: 3 });
	});
});

describe("findLinesInNewContent", () => {
	it("finds lines at same position", () => {
		const old = "a\nb\nc\nd";
		const result = findLinesInNewContent(old, old, 2, 3);
		expect(result).toEqual({ newStartLine: 2, newEndLine: 3, outdated: false });
	});

	it("finds lines at shifted position", () => {
		const oldContent = "a\nb\nc\nd";
		const newContent = "x\ny\na\nb\nc\nd";
		const result = findLinesInNewContent(oldContent, newContent, 2, 3);
		expect(result).toEqual({ newStartLine: 4, newEndLine: 5, outdated: false });
	});

	it("marks as outdated when lines are gone", () => {
		const oldContent = "a\nb\nc\nd";
		const newContent = "a\nX\nY\nd";
		const result = findLinesInNewContent(oldContent, newContent, 2, 3);
		expect(result.outdated).toBe(true);
	});

	it("handles single-line ranges", () => {
		const oldContent = "a\nb\nc";
		const newContent = "x\na\nb\nc";
		const result = findLinesInNewContent(oldContent, newContent, 2, 2);
		expect(result).toEqual({ newStartLine: 3, newEndLine: 3, outdated: false });
	});
});

describe("isSectionChanged", () => {
	it("returns false for identical sections", () => {
		const content = "# Intro\nHello\n## Details\nWorld";
		expect(isSectionChanged(content, content, "intro")).toBe(false);
	});

	it("returns true when section content differs", () => {
		const old = "# Intro\nHello\n## Details\nWorld";
		const updated = "# Intro\nChanged\n## Details\nWorld";
		expect(isSectionChanged(old, updated, "intro")).toBe(true);
	});

	it("returns true when section is removed", () => {
		const old = "# Intro\nHello\n## Details\nWorld";
		const updated = "# Intro\nHello";
		expect(isSectionChanged(old, updated, "details")).toBe(true);
	});
});

describe("extractContextSnapshot", () => {
	it("extracts lines with surrounding context", () => {
		const content = "a\nb\nc\nd\ne\nf\ng";
		const result = extractContextSnapshot(content, 3, 4);
		// Lines 3-4 with 2 lines of context: lines 1-6
		expect(result.lines).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(result.startLine).toBe(1);
		expect(result.endLine).toBe(6);
	});

	it("clamps to file boundaries", () => {
		const content = "a\nb\nc";
		const result = extractContextSnapshot(content, 1, 1, 2);
		expect(result.lines).toEqual(["a", "b", "c"]);
		expect(result.startLine).toBe(1);
	});

	it("finds section title from nearest heading", () => {
		const content = "# My Section\nSome text\nMore text";
		const result = extractContextSnapshot(content, 2, 2);
		expect(result.sectionTitle).toBe("My Section");
	});

	it("returns no section title if none above", () => {
		const content = "Some text\nMore text";
		const result = extractContextSnapshot(content, 1, 1);
		expect(result.sectionTitle).toBeUndefined();
	});
});
