# Revisions

## Overview

Version tracking for plan content. Each edit creates a new revision, preserving the full history of changes.

## How It Works

### Creating Revisions

- The first revision (v1) is created automatically when a plan is created
- Authors can add new revisions with updated content and an optional summary/changelog
- Each revision stores the complete markdown content (not a diff)

### Viewing History

- `/plan/:planId/history` shows a timeline of all revisions
- Select any revision to view its full content
- Compare two revisions side-by-side with a simple line diff

### Diff Algorithm

v1 uses a simple line-based diff (not Myers or patience):
- Lines unique to the old version are shown as removals (red)
- Lines unique to the new version are shown as additions (green)
- Matching lines are shown as context (neutral)

Good enough for reviewing plan changes; can be upgraded to a proper diff library later.

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

- `createRevision({ planId, content, summary? })` — Author-only, creates next revision
- `getRevision({ revisionId })` — Fetch a specific revision by ID

## UI Components

- `HistoryPage` — Two-panel layout: revision timeline + content/diff view
- Revision selector dropdown in main plan view header

## Routes

- `/plan/:planId/history` — Full history with diff comparison
