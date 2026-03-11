# Inline Comments

## Overview

Section-anchored and line-anchored commenting system that lets reviewers leave feedback on specific parts of a plan, with threaded replies, resolution tracking, suggestion comments, and carry-forward across revisions.

## How It Works

### Anchoring

Comments can be anchored in three ways:

1. **Section-anchored** — Tied to a heading slug (e.g., `## API Design` → `sectionId: "api-design"`). Created by clicking the comment button that appears on heading hover in Rendered mode.
2. **Line-anchored** — Tied to specific line numbers (`startLine`, `endLine`). Created by clicking/shift-clicking line numbers in Source mode.
3. **General** — No anchor (`sectionId: null`, `startLine: null`). Created via the "Add Comment" button in the sidebar, available in both view modes.

### Threading

- Top-level comments have `parentId: null`
- Replies reference the parent comment's ID via `parentId`
- Comments are displayed as threads in the sidebar, grouped by type (line comments, then section comments, then general)

### Resolution & Collapse

- Any user can mark a comment thread as resolved/unresolved
- Resolved threads **collapse** to a single-line summary (author + truncated body + reply count)
- Click the collapsed row to expand and see full thread + Reopen button
- Resolving auto-collapses; reopening auto-expands

### View Modes

- **Rendered mode**: Section comment buttons on headings, "Add Comment" button in sidebar
- **Source mode**: Line selection via gutter clicks (shift-click for ranges), Comment/Suggest toggle in composer
- Switching view modes does NOT dismiss an active comment composer

## Suggestion Comments

Reviewers can propose specific text changes. See [Comment Preservation](./comment-preservation.md) for full details.

- In Source view, select lines → choose "Suggest" tab → edit proposed text → submit
- Suggestions show an inline diff (old vs proposed) in the comment thread
- Author can "Apply" (creates new revision) or "Dismiss" (resolves the comment)

## Comment Carry-Forward

When a new revision is created, unresolved comments automatically carry forward. See [Comment Preservation](./comment-preservation.md) for full algorithm, outdated detection, and context snapshots.

## Data Model

```
comments:
  id                   — nanoid
  planId               — FK to plans
  revisionId           — FK to revisions (anchored to specific revision)
  authorId             — FK to users
  sectionId            — slugified heading text (nullable)
  startLine            — 1-based line number (nullable, for line-anchored comments)
  endLine              — end of line range (nullable, single line if null)
  parentId             — FK to comments (nullable, for threading)
  body                 — markdown text
  resolved             — boolean
  originalCommentId    — provenance: first-ever version of this comment
  originalRevisionId   — provenance: revision where first written
  outdated             — boolean, true when anchored text changed
  contextSnapshot      — JSON snapshot of original context
  suggestionType       — 'replace' | 'insert_after' | null
  suggestionContent    — proposed replacement text
  suggestionApplied    — boolean, true when accepted
  timestamps
```

## Server Functions

- `addComment({ planId, revisionId, sectionId, startLine?, endLine?, parentId, body, suggestionType?, suggestionContent? })` — Create comment, reply, or suggestion
- `toggleCommentResolved({ commentId })` — Toggle resolved state
- `getComments({ revisionId })` — List all comments for a revision
- `applySuggestion({ commentId })` — Author-only, applies suggestion and creates new revision

## UI Components

- `SectionCommentButton` — Hover-activated button on headings showing comment count
- `CommentThread` — Renders comment with replies, badges (outdated/resolved/applied/provenance), context snapshot, suggestion diff, apply/dismiss buttons, collapse for resolved
- `SuggestionDiff` — Inline diff display for suggestion comments
- `PlanDetailPage` sidebar — Comment count + outdated filter, "Add Comment" button, Comment/Suggest composer toggle, line/section/general composers
- `RevisionEditor` — "X unresolved comments will carry forward" notice
