/**
 * Markdown section parsing utilities.
 *
 * Extracts a tree of sections from markdown content based on headings.
 * Each section gets a stable slug ID for anchoring comments.
 */

export interface MarkdownSection {
	/** Slug derived from heading text (e.g., "api-design") */
	id: string;
	/** The raw heading text */
	title: string;
	/** Heading level (1-6) */
	level: number;
	/** Line number where the heading appears (1-indexed) */
	startLine: number;
	/** Line number where the section ends (exclusive, 1-indexed) */
	endLine: number;
}

/**
 * Convert a heading string to a URL-friendly slug.
 * Matches GitHub's heading anchor behavior.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

/**
 * Parse markdown content into a flat list of sections.
 * Each section spans from its heading to the next heading of equal or higher level.
 */
export function parseSections(content: string): MarkdownSection[] {
	const lines = content.split("\n");
	const sections: MarkdownSection[] = [];
	const slugCounts = new Map<string, number>();

	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
		if (!match) continue;

		const level = match[1].length;
		const title = match[2].trim();
		let slug = slugify(title);

		// Handle duplicate headings (append -1, -2, etc.)
		const count = slugCounts.get(slug) ?? 0;
		if (count > 0) {
			slug = `${slug}-${count}`;
		}
		slugCounts.set(slug, count + 1);

		sections.push({
			id: slug,
			title,
			level,
			startLine: i + 1,
			endLine: lines.length + 1, // will be updated below
		});
	}

	// Set endLine for each section
	for (let i = 0; i < sections.length - 1; i++) {
		sections[i].endLine = sections[i + 1].startLine;
	}

	return sections;
}

/**
 * Find the section that a given line belongs to.
 * Returns null if the line is before the first heading.
 */
export function findSectionForLine(
	sections: MarkdownSection[],
	line: number,
): MarkdownSection | null {
	for (let i = sections.length - 1; i >= 0; i--) {
		if (line >= sections[i].startLine) {
			return sections[i];
		}
	}
	return null;
}
