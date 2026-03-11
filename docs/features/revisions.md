# Revisions

## Overview

Version tracking for plan content. Each edit creates a new revision, preserving the full history of changes. Unresolved comments automatically carry forward to each new revision.

## How It Works

### Creating Revisions

- The first revision (v1) is created automatically when a plan is created
- Authors can add new revisions with updated content and an optional summary/changelog
- Each revision stores the complete markdown content (not a diff)
- Applying a suggestion comment also creates a new revision (summary: "Applied suggestion from {author}")

### Comment Carry-Forward

When a new revision is created, `carryForwardComments()` runs automatically:
- Unresolved comments are duplicated into the new revision
- Line positions are recalculated (same position first, then full scan)
- Comments on changed content are marked "outdated" with a context snapshot
- Reply threads carry forward intact
- Resolved and applied-suggestion comments do NOT carry forward

See [Comment Preservation](./comment-preservation.md) for full details.

### Viewing History

- `/plan/:planId/history` shows a timeline of all revisions
- Select any revision to view its full content
- Compare two revisions with a proper Myers diff (line-level, with both old and new line numbers)

### Diff Algorithm

Uses the `diff` npm package (Myers algorithm) via `computeDiff()` in `src/common/lib/diff.ts`:
- Correct ordering of additions, removals, and context lines
- Both old and new line numbers shown in the gutter
- Proper handling of moved/duplicated lines

The same diff utilities power the suggestion comment inline diffs and the carry-forward line tracking.

## Data Model

```
revisions:
  id              — nanoid
  planId          — FK to plans
  revisionNumber  — auto-incrementing per plan (1, 2, 3...)
  content         — full markdown text
  summary         — optional changelog description
  authorId        — FK to users (who created this revision)
  createdAt
```

## Server Functions

- `createRevision({ planId, content, summary? })` — Author-only, creates next revision, triggers comment carry-forward
- `getRevision({ revisionId })` — Fetch a specific revision by ID
- `applySuggestion({ commentId })` — Creates a revision from a suggestion comment (see [Comment Preservation](./comment-preservation.md))

## UI Components

- `HistoryPage` — Two-panel layout: revision timeline + content/diff view with Myers diff and line numbers
- `RevisionEditor` — Edit form with carry-forward notice ("X unresolved comments will carry forward")
- Revision counter in plan header ("Revision N of M")

## Routes

- `/plan/:planId/history` — Full history with diff comparison
