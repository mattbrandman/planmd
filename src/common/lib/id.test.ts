import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
	it("generates a string ID", () => {
		const id = newId();
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
	});

	it("generates unique IDs", () => {
		const ids = new Set(Array.from({ length: 100 }, () => newId()));
		expect(ids.size).toBe(100);
	});
});
