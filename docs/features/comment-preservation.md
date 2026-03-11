# Comment Preservation & Collaborative Editing

## Overview

When a new revision is created, unresolved comments automatically carry forward to the new revision. Comments that reference changed content are marked "outdated" with a snapshot of their original context. Reviewers can also propose specific text changes via suggestion comments, which the author can accept with one click.

## Comment Carry-Forward

### How It Works

When `createRevision` runs, the `carryForwardComments()` function in `src/common/api/plans.ts`:

1. **Fetches** unresolved, non-applied top-level comments from the previous revision
2. **Determines outdated status** for each comment:
   - **Line-anchored** (`startLine` set): Uses `findLinesInNewContent()` to locate the referenced lines in new content. Same position checked first, then full scan. If not found → outdated. If found at different position → line numbers updated.
   - **Section-anchored** (`sectionId` set): Uses `isSectionChanged()` to compare section content between old and new revisions. If section removed or content changed → outdated.
3. **Captures context snapshot**: The original referenced lines + 2 lines of surrounding context from the old revision
4. **Inserts new comment rows**: New IDs, new `revisionId`, same body/author/section, with provenance metadata
5. **Carries reply threads**: Replies are duplicated with `parentId` pointing to the new top-level comment

### What Carries Forward

| Comment Type | Carries Forward? |
|---|---|
| Unresolved top-level | Yes |
| Replies to unresolved | Yes |
| Resolved comments | No |
| Applied suggestions | No |

### Provenance Tracking

Each carried-forward comment stores:
- `originalCommentId` — Points to the **first-ever** version (flattened, not a linked list). v1→v2→v3 all point to v1.
- `originalRevisionId` — The revision where the comment was first written
- `outdated` — Boolean, true when the anchored text changed
- `contextSnapshot` — JSON with original lines, line numbers, and section title

### Context Snapshot Format

```json
{
  "lines": ["## API Design", "", "The API should use REST..."],
  "startLine": 5,
  "endLine": 7,
  "sectionTitle": "API Design"
}
```

## Suggestion Comments

### Workflow

1. **Creating**: In Source view, reviewer selects lines → sidebar shows Comment/Suggest toggle → in Suggest mode, a "Proposed change" textarea appears pre-filled with the selected lines, plus a body field for explanation
2. **Displaying**: Comments with `suggestionType` set render an inline diff (old vs proposed) below the comment body using the `SuggestionDiff` component
3. **Accepting**: Author clicks "Apply" → `applySuggestion` server function replaces lines, creates new revision (triggering carry-forward), marks suggestion applied
4. **Dismissing**: Resolves the comment (same as `toggleCommentResolved`)

### Apply Suggestion Flow

The `applySuggestion` server function (`src/common/api/plans.ts`):

1. Verifies auth (author only), not outdated, not already applied
2. Gets latest revision content
3. Replaces lines `startLine`-`endLine` with `suggestionContent`
4. Marks `suggestionApplied = true` on the comment
5. Creates a new revision with summary "Applied suggestion from {author}"
6. Carry-forward runs automatically — other unresolved comments move to the new revision

### Interaction with Carry-Forward

- Suggestion comments carry forward like regular comments
- If target lines change in a new revision → suggestion marked outdated → "Apply" button disabled
- Applied suggestions (`suggestionApplied = true`) do NOT carry forward
- `contextSnapshot` stores original lines so reviewers can see what was proposed even after context shifts

## Schema (columns on `comments` table)

```
original_comment_id  TEXT     — first-ever version of this comment (NULL if fresh)
original_revision_id TEXT     — revision where comment was first written (NULL if fresh)
outdated             INTEGER  — 1 when anchored text changed, 0 otherwise
context_snapshot     TEXT     — JSON context from old revision
suggestion_type      TEXT     — NULL for regular, 'replace' or 'insert_after'
suggestion_content   TEXT     — proposed replacement text
suggestion_applied   INTEGER  — 1 when accepted, 0 otherwise
```

Migration: `migrations/0002_comment_preservation.sql`

## Server Functions

- `addComment(...)` — Now accepts optional `suggestionType` and `suggestionContent`
- `applySuggestion({ commentId })` — Author-only, applies suggestion and creates new revision
- `createRevision(...)` — Now calls `carryForwardComments()` after inserting the new revision

### Internal Functions (not exported as server functions)

- `carryForwardComments(db, planId, prevRevisionId, newRevisionId, oldContent, newContent)` — Duplicates unresolved comments into the new revision

## Diff Utilities (`src/common/lib/diff.ts`)

Shared utilities used by carry-forward logic and UI components:

- `computeDiff(oldText, newText)` — Myers diff via `diff` npm package. Returns `DiffLine[]` with `type`, `text`, `oldLineNumber`, `newLineNumber`.
- `findLinesInNewContent(oldContent, newContent, startLine, endLine)` — Locates old lines in new content. Checks same position first, then full scan. Returns `{ newStartLine, newEndLine, outdated }`.
- `isSectionChanged(oldContent, newContent, sectionId)` — Compares section text between revisions using `parseSections()`.
- `extractContextSnapshot(content, startLine, endLine, contextLines?)` — Captures lines + surrounding context for storage.

Tests: `src/common/lib/diff.test.ts` (15 tests)

## UI Components

### CommentThread (`src/routes/plan/$planId/-components/CommentThread.tsx`)

Enhanced with:
- **Collapsed state** for resolved comments — single-line summary with green checkmark, click to expand. Auto-collapses when resolved.
- **"Outdated" amber badge** when `comment.outdated === true`
- **"Resolved" green badge** when expanded and resolved
- **"Applied" green badge** for applied suggestions
- **"from vN" provenance label** showing original revision number
- **Expandable "Original context"** block showing `contextSnapshot` lines (only when outdated)
- **Inline suggestion diff** via `SuggestionDiff` component (when `suggestionType` is set)
- **"Apply" button** (author only, not outdated, not applied) — calls `applySuggestion`
- **"Dismiss" button** — resolves the suggestion comment

### PlanDetailPage (`src/routes/plan/$planId/-components/PlanDetailPage.tsx`)

Enhanced with:
- **Comment count with outdated breakdown**: "3 comments (1 outdated)"
- **"Show/Hide outdated" toggle** in sidebar
- **"Add Comment" button** — always visible in sidebar, opens a general comment composer that works in both Rendered and Source modes
- **Comment/Suggest toggle** in line-level composer — switch between regular comment and suggestion mode
- **Suggestion textarea** — pre-filled with selected line content, editable
- View mode switches no longer dismiss active composers

### RevisionEditor (`src/routes/plan/$planId/-components/RevisionEditor.tsx`)

Enhanced with:
- **Carry-forward notice**: "X unresolved comments will carry forward to the new revision" shown when content has changed

### SuggestionDiff (`src/routes/plan/$planId/-components/SuggestionDiff.tsx`)

New component. Small inline diff display rendered inside `CommentThread` for suggestion comments. Uses `computeDiff()` for line-level highlighting with red (removed) / green (added) coloring.

### HistoryPage (`src/routes/plan/$planId/history/-components/HistoryPage.tsx`)

Upgraded from naive set-based diff to proper Myers diff via `computeDiff()`. Now shows both old and new line numbers in the gutter.

## Testing Checklist

- Create a plan with comments on various sections and lines
- Edit the plan (changing some commented sections, leaving others intact)
- Verify: unchanged comments carry forward as non-outdated with correct line numbers
- Verify: comments on changed text carry forward as outdated with context snapshot
- Verify: resolved comments do NOT carry forward
- Verify: reply threads carry forward intact
- Create a suggestion comment, accept it, verify new revision + carry-forward
- Check history diff view shows proper Myers diff with line numbers
- Test edge cases: heading renames, inserted lines above comments, deleted sections
