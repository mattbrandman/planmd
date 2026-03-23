# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with this codebase.

## Project Overview

**planmd** — A collaborative plan review app for coordinating on plan.md files. Teams submit detailed planning documents (markdown), then discuss, revise, and reach consensus before handing off to AI agents for implementation. Built with TanStack Start (full-stack React meta-framework) deployed on Cloudflare Workers.

## Tech Stack

- **Framework**: TanStack Start (React 19 + Vite + SSR)
- **Routing**: TanStack Router (file-based routing in `src/routes/`)
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Auth**: Clerk (`@clerk/tanstack-react-start`)
- **UI**: Tailwind CSS 4 + shadcn/ui components (new-york style) + Radix UI primitives
- **Icons**: lucide-react
- **Validation**: Zod
- **Data Fetching**: TanStack Query (via SSR query integration)
- **Toolchain**: Biome (format + lint)
- **Testing**: Vitest + Testing Library

## Common Commands

```bash
pnpm dev          # Start dev server (port 3000)
pnpm build        # Production build
pnpm deploy       # Build + deploy to Cloudflare Workers
pnpm test         # Run tests
pnpm check        # Biome format + lint
pnpm db:generate  # Generate migrations from schema
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio GUI
```

## Project Structure

This project uses **directory-based routing with colocation** — each route's components, API functions, and hooks live alongside the route file using TanStack Router's `-` prefix convention for ignored files.

```
src/
├── routes/                                    # Directory-based routing
│   ├── __root.tsx                             # Root layout (providers, Header)
│   ├── index.tsx                              # / (route config)
│   ├── -index/                                # Colocated code for /
│   │   ├── components/                        # HomePage, etc.
│   │   └── api/                               # Server functions for /
│   │
│   ├── plan/
│   │   ├── new/
│   │   │   ├── route.tsx                      # /plan/new
│   │   │   └── -components/                   # NewPlanPage, etc.
│   │   └── $planId/
│   │       ├── index.tsx                      # /plan/:planId (main review view)
│   │       ├── -components/                   # PlanDetailPage, InlineComments, etc.
│   │       ├── -api/                          # plan detail server functions
│   │       └── history/
│   │           ├── route.tsx                  # /plan/:planId/history
│   │           └── -components/               # RevisionHistory, DiffView
│   │
│   └── sign-in/
│       ├── $.tsx                              # /sign-in/* (Clerk SignIn component)
│       └── -SignInPage.tsx
│
├── start.ts                                   # Clerk middleware (clerkMiddleware)
├── common/                                    # Shared across all pages
│   ├── api/                                   # Shared server functions
│   ├── components/
│   │   ├── Header.tsx                         # App header/nav
│   │   ├── ThemeToggle.tsx                    # Dark/light mode
│   │   └── ui/                                # shadcn/ui primitives
│   ├── integrations/
│   │   └── better-auth/                       # Auth UI components (HeaderUser)
│   └── lib/
│       ├── utils.ts                           # cn() utility
│       └── auth.ts                            # Clerk user sync (syncUser)
│
├── db/                                        # Database layer
│   ├── schema.ts                              # Drizzle schema definitions
│   └── index.ts                               # Database initialization
│
├── styles.css                                 # Global styles
└── router.tsx                                 # Router configuration
```

### Architecture Principles

1. **Colocated by route** — Each route's components, API functions, and hooks live in `-prefixed` directories next to the route file. TanStack Router ignores `-` prefixed files/dirs.
2. **Look at URL, open folder** — For `/plan/new`, look in `src/routes/plan/new/`. For `/plan/:planId`, look in `src/routes/plan/$planId/`.
3. **Common is truly shared** — Only put things in `common/` if used by 2+ routes.
4. **Cross-route imports use absolute paths** — Components used by multiple routes stay with their primary owner and are imported via `#/routes/<route>/-components/X`.
5. **No "use client" directives** — TanStack Start handles client/server boundaries.
6. **Server-only imports go in separate files** — `cloudflare:workers` can't be in files imported by client code.

### Route File Conventions

- **Leaf routes** (no children): use `route.tsx`
- **Parent routes with index** (have child routes): use `index.tsx`
- **Catch-all routes**: use `$.tsx`
- **Dynamic segments**: use `$` prefix (e.g., `$planId`)

### Adding a New Page

1. Create route directory: `src/routes/my-page/`
2. Add `route.tsx` (or `index.tsx` if it will have child routes)
3. Add `-components/` for page components
4. Add `-api/` for server functions
5. Import from local paths: `./-components/MyComponent`, `./-api/myApi`

## Key Patterns

### Server Functions (API)

Place in the route's `-api/` folder (or `common/api/` if shared across 2+ routes):

```typescript
// src/routes/plan/$planId/-api/plan.ts
import { createServerFn } from "@tanstack/react-start"

export const getPlan = createServerFn({ method: "GET" }).handler(async () => {
	/* server-side logic */
})

export const updatePlan = createServerFn({ method: "POST" })
	.inputValidator((data) => schema.parse(data))
	.handler(async ({ data }) => {
		/* handle input */
	})
```

### Route with Loader

```typescript
// src/routes/plan/$planId/index.tsx
import { createFileRoute } from "@tanstack/react-router"
import { PlanDetailPage } from "./-components/PlanDetailPage"
import { getPlan } from "./-api/plan"

export const Route = createFileRoute("/plan/$planId/")({
	loader: async ({ params }) => await getPlan({ data: { planId: params.planId } }),
	component: PlanDetailPage,
})
```

### Database Access

```typescript
import { getDb } from "#/db"
import { plans } from "#/db/schema"

const db = getDb()
await db.select().from(plans)
await db.insert(plans).values({ title: "My Plan", authorId: userId })
```

### Import Aliases

Use `#/` prefix for absolute imports (Node.js subpath imports + tsconfig paths):

- `#/routes/plan/$planId/-components/PlanDetail` — Cross-route component imports
- `#/common/api/plans` — Shared API functions
- `#/common/components/ui/button` — UI components
- `#/common/lib/utils` — Utilities
- `#/db/schema` — Database

Within a route directory, prefer relative imports: `./-components/MyComponent`, `../-api/myApi`

## Testing Philosophy

**Test public APIs, not implementation details.** Mocking private methods is a code smell — if you need heavy mocks, the design needs refactoring.

### Unit Tests (Vitest)

- Test server functions by calling them directly with real (in-memory) database state
- Test utility/lib functions through their public exports
- Test React components through user-visible behavior (Testing Library queries by role/text, not by class/id)
- Prefer integration-style tests: set up real state → call the function → assert the result
- Avoid mocking internal modules. Mock only at system boundaries (external APIs, auth context)
- Co-locate test files next to what they test: `plans.ts` → `plans.test.ts`

### E2E Tests

- Use Playwright for full user-flow tests
- Test the critical paths: create plan → add comment → revise → approve → consensus
- Visual verification via agent-browser during development
- E2E tests live in `e2e/` at project root

### What NOT to do

- Don't mock Drizzle/DB internals — use a real test database
- Don't test component implementation (state, hooks) — test what the user sees
- Don't write tests for trivial getters/setters
- Don't add `data-testid` when accessible roles/labels work

## Code Style

- Tabs for indentation (Biome default)
- Double quotes (Biome default)
- Components use PascalCase, utilities use camelCase
- Run `pnpm check` before committing

## Deployment

- **Hosting**: Cloudflare Workers (custom domains: `planmd.dev`, `www.planmd.dev`)
- **Database**: D1 database `planmd-db` (ID: `58336148-65db-491e-a2d2-e53f77445164`)
- **GitHub repo**: `mattbrandman/planmd`
- **VCS**: Jujutsu (`jj`) — use `jj bookmark set main -r @` + `jj git push --bookmark main` to push
- **Deploy manually**: `pnpm deploy` (builds + `wrangler deploy`)
- **Apply migrations to prod**: `npx wrangler d1 migrations apply planmd-db --remote`
- **Secrets** (set via `wrangler secret put`): `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

## Environment Variables

Required in `.env.local`:

- `DATABASE_URL` — SQLite database path (dev: `dev.db`)
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (use `pk_test_` for dev, `pk_live_` for prod)
- `CLERK_SECRET_KEY` — Clerk secret key (use `sk_test_` for dev, `sk_live_` for prod)

Optional for dev:

- `DEV_BYPASS_AUTH=true` + `VITE_DEV_BYPASS_AUTH=true` — Skip Clerk and use a dummy dev user

## Authentication (Clerk)

Clerk manages users externally. A local `users` table syncs Clerk user data on first interaction (via `syncUser()` in `auth.ts`).

### Key files

- `src/start.ts` — `clerkMiddleware()` registered as request middleware
- `src/common/lib/auth.ts` — `syncUser(userId)` upserts Clerk user into local DB
- `src/common/lib/auth-guard.ts` — `getSession()`, `authGuard()`, `requireAuth()` server functions
- `src/routes/__root.tsx` — `<ClerkProvider>` wraps the app
- `src/common/integrations/better-auth/header-user.tsx` — Uses Clerk `<UserButton>`, `<SignInButton>`, `<Show>`

### Server-side auth in server functions

```typescript
import { auth } from "@clerk/tanstack-react-start/server"

// Get userId directly
const { userId } = await auth()

// Or use the existing helpers (preferred — they sync to local DB):
import { requireAuth } from "#/common/lib/auth-guard"
const user = await requireAuth() // throws if not authed, returns local user
```

### Route protection

```typescript
import { authGuard } from "#/common/lib/auth-guard"

export const Route = createFileRoute("/protected")({
  beforeLoad: async () => await authGuard(), // redirects to /sign-in if not authed
})
```

### Client-side auth

```typescript
import { useAuth, useUser } from "@clerk/tanstack-react-start"
import { Show, UserButton, SignInButton } from "@clerk/tanstack-react-start"
```

### Database schema

The `users` table stores synced Clerk data (id, name, email, image). All other tables (plans, comments, reviews, etc.) reference `users.id` which is the Clerk `userId`. The old Better Auth tables (session, account, verification) have been removed from the schema.

## Gotchas

### Drizzle Timestamp Mode + Raw SQL

`integer('col', { mode: 'timestamp' })` stores **seconds** since epoch, not milliseconds. When using raw SQL aggregates, Drizzle's conversion is bypassed — convert manually: `new Date(value * 1000)`.

### SSR + onLoad Hydration Race

When using `<img src>` with SSR, don't use `onLoad` + `useState` for fade-in. The browser may load the image before React hydrates, so `onLoad` never fires.

### CSS Animation Flicker

When using `animationDelay` on staggered list items, use `animation-fill-mode: backwards` to prevent flash at full opacity during delay.

### Filtering — useMemo over useEffect+useState

For client-side filtering of loader data, use `useMemo` instead of `useEffect` + `useState` to avoid double-render flicker.

### useServerFn Hook (TanStack Start)

Only intercepts `redirect()` from server functions. Does NOT provide pending state. Call server functions directly if no redirect is needed.

### Comment Carry-Forward + Suggestions

The comment system spans several files. Key things to know:

- **`src/common/api/plans.ts`** contains `carryForwardComments()` (internal, not a server fn) — called automatically by `createRevision` and `applySuggestion`. It duplicates unresolved comments into the new revision with provenance tracking.
- **`src/common/lib/diff.ts`** has shared diff utilities used by both the carry-forward algorithm (line tracking, section comparison, context snapshots) and UI components (Myers diff for history page and suggestion diffs). Uses `diff` npm package.
- **`addComment` accepts optional `suggestionType` / `suggestionContent`** — don't break this when modifying the validator.
- **Resolved comments collapse** in CommentThread via `expanded` state synced to `comment.resolved`. Don't remove the `useEffect` that auto-collapses on resolve.
- **The "Add Comment" sidebar button** is always rendered when no composer is active — it creates general comments (null section, null lines). Works in both Rendered and Source modes.
- See `docs/features/comment-preservation.md` for the full algorithm, schema, and testing checklist.

### D1 Migrations

Migrations live in `migrations/` (not `drizzle/`). The `drizzle/` folder is for drizzle-kit only. When adding columns, update BOTH the Drizzle schema (`src/db/schema.ts`) AND create a new migration in `migrations/`. Run `npx wrangler d1 migrations apply planmd-db --local` to apply.

## Notes

- Route tree auto-generates to `src/routeTree.gen.ts` — do not edit
- shadcn components: `npx shadcn@latest add <component>` (installs to `src/components/ui/`, move to `common/components/ui/` if needed)
- Cloudflare deployment configured in `wrangler.jsonc`
- The `#/` import alias works via both Node.js subpath imports (package.json `"imports"`) and tsconfig paths
