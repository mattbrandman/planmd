# Inline Comments

## Overview

Section-anchored commenting system that lets reviewers leave feedback on specific parts of a plan, with threaded replies and resolution tracking.

## How It Works

### Section Anchoring

Comments are anchored to markdown headings via section IDs (slugified heading text):

1. Plan markdown is parsed into sections using `parseSections()` from `src/common/lib/markdown.ts`
2. Each heading (h1-h6) gets a slug ID (e.g., `## API Design` → `api-design`)
3. Comments store a `sectionId` that links them to a specific heading
4. When rendered, each heading shows a hover-activated comment button with count

### Threading

- Top-level comments have `parentId: null`
- Replies reference the parent comment's ID via `parentId`
- Comments are displayed as threads in the sidebar, grouped by section

### Resolution

- Any user can mark a comment thread as resolved/unresolved
- Resolved threads are visually dimmed but still visible
- Resolution is tracked per top-level comment (not per reply)

## Data Model

```
comments:
  id          — nanoid
  planId      — FK to plans
  revisionId  — FK to revisions (anchored to specific revision)
  authorId    — FK to users
  sectionId   — slugified heading text (nullable for top-level plan comments)
  parentId    — FK to comments (nullable, for threading)
  body        — markdown text
  resolved    — boolean
  timestamps
```

## Server Functions

- `addComment({ planId, revisionId, sectionId, parentId, body })` — Create comment or reply
- `toggleCommentResolved({ commentId })` — Toggle resolved state
- `getComments({ revisionId })` — List all comments for a revision

## UI Components

- `SectionCommentButton` — Hover-activated button on headings showing comment count
- `CommentThread` — Renders a comment with its replies, reply composer, and resolve toggle
- Comment sidebar in `PlanDetailPage` — Groups comments by section, shows inline composer

## Cross-Revision Behavior

Comments are tied to a specific revision. When a new revision is created:
- Old comments remain visible (attached to their original revision)
- The plan detail page shows comments for the latest revision
- History page lets users view comments on any revision

## Known Limitations (v1)

- Comments anchor to heading slugs, not line numbers. If a heading is renamed, old comments become orphaned.
- No real-time updates (requires page refresh to see new comments from others)
- Comment authors are shown as truncated user IDs (will show names when user lookup is added)
