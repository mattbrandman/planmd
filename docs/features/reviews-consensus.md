# Reviews & Consensus

## Overview

Structured review workflow that tracks who has approved, who has requested changes, and visualizes overall consensus on a plan.

## How It Works

### Participants & Roles

- **Author** — Created the plan. Can change status, add revisions, add participants.
- **Reviewer** — Can approve or request changes. Their review is tracked in the consensus bar.
- **Observer** — Can view and comment, but their opinion isn't tracked in consensus.

### Review Submission

Reviewers submit one review per revision with one of two statuses:
- **Approved** — Reviewer agrees with the plan as written
- **Changes Requested** — Reviewer wants modifications before approval

If a reviewer submits a new review on the same revision, it replaces their previous one (upsert).

### Consensus Bar

Visual indicator showing review progress:
- **Green segment** — Approved reviewers
- **Amber segment** — Reviewers requesting changes
- **Gray segment** — Pending reviewers

Below the bar, individual reviewer badges show each person's status with icons.

### Status Transitions

```
draft → review → approved → implemented
```

- Only the author can change plan status
- "Open for Review" moves from draft → review, signaling the plan is ready for feedback
- "Mark Approved" is available once the author judges consensus is reached
- There's no automatic approval — the author makes the final call

## Data Model

```
reviews:
  id          — nanoid
  planId      — FK to plans
  revisionId  — FK to revisions
  reviewerId  — FK to users
  status      — "approved" | "changes_requested"
  body        — optional review comment
  createdAt
  UNIQUE(revisionId, reviewerId)

participants:
  id          — nanoid
  planId      — FK to plans
  userId      — FK to users
  role        — "author" | "reviewer" | "observer"
  UNIQUE(planId, userId)
```

## Server Functions

- `submitReview({ planId, revisionId, status, body? })` — Submit or update review
- `addParticipant({ planId, userId, role })` — Add reviewer/observer (author only)

## UI Components

- `ConsensusBar` — Progress bar + individual reviewer badges with tooltips
- Review action buttons in `PlanDetailPage` — Approve / Request Changes (shown to reviewers when plan is in review)
- Status change buttons — Open for Review / Mark Approved (shown to author)
