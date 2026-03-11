# Plan CRUD

## Overview

Core plan management: create, list, view, and update plans.

## Routes

- **`/`** — Dashboard showing plans grouped by role (authored, reviewing, observing)
- **`/plan/new`** — Create a new plan with markdown editor + preview
- **`/plan/:planId`** — View plan with rendered markdown and inline comment system

## Data Model

- **plans** — id, title, description, status (draft/review/approved/implemented), authorId, githubUrl, timestamps
- **revisions** — id, planId, revisionNumber, content (full markdown), summary, authorId, timestamps
- **participants** — id, planId, userId, role (author/reviewer/observer)

## Server Functions

All in `src/common/api/plans.ts`:

- `getMyPlans()` — Lists plans where current user is author or participant
- `getPlan({ planId })` — Returns plan with latest revision, all participants, reviews, and comments
- `createPlan({ title, description, content, githubUrl })` — Creates plan + first revision + author participant
- `updatePlanStatus({ planId, status })` — Author-only status transitions

## Authentication

- All routes require authentication (via `beforeLoad` auth guard)
- Dev mode supports `DEV_BYPASS_AUTH=true` in `.env.local` to skip OAuth

## UI Components

- `HomePage` — Dashboard with plan cards grouped by section
- `NewPlanPage` — Form with markdown editor, preview toggle, metadata fields
- `PlanDetailPage` — Full plan view with rendered markdown, inline comments, consensus bar

## Status Flow

```
draft → review → approved → implemented
```

Only the plan author can change status. Moving to "review" signals the plan is ready for feedback.
