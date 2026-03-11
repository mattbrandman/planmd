# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this codebase.

## Project Overview

**planmd** — A collaborative plan review app for coordinating on plan.md files. Teams submit detailed planning documents (markdown), then discuss, revise, and reach consensus before handing off to AI agents for implementation. Built with TanStack Start (full-stack React meta-framework) deployed on Cloudflare Workers.

## Tech Stack

- **Framework**: TanStack Start (React 19 + Vite + SSR)
- **Routing**: TanStack Router (file-based routing in `src/routes/`)
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Auth**: Better Auth (GitHub OAuth)
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
│   ├── sign-in/
│   │   ├── $.tsx                              # /sign-in/*
│   │   └── -SignInPage.tsx
│   │
│   └── api/auth/$.ts                          # Better Auth server route
│
├── common/                                    # Shared across all pages
│   ├── api/                                   # Shared server functions
│   ├── components/
│   │   ├── Header.tsx                         # App header/nav
│   │   ├── ThemeToggle.tsx                    # Dark/light mode
│   │   └── ui/                                # shadcn/ui primitives
│   ├── integrations/
│   │   └── better-auth/                       # Auth provider + components
│   └── lib/
│       ├── utils.ts                           # cn() utility
│       ├── auth.ts                            # Better Auth server config
│       └── auth-client.ts                     # Better Auth client
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

## Environment Variables

Required in `.env.local`:

- `DATABASE_URL` — SQLite database path (dev: `dev.db`)
- `BETTER_AUTH_URL` — Auth base URL (dev: `http://localhost:3000`)
- `BETTER_AUTH_SECRET` — Auth secret key (generate: `pnpm dlx @better-auth/cli secret`)

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

## Notes

- Route tree auto-generates to `src/routeTree.gen.ts` — do not edit
- shadcn components: `npx shadcn@latest add <component>` (installs to `src/components/ui/`, move to `common/components/ui/` if needed)
- Cloudflare deployment configured in `wrangler.jsonc`
- The `#/` import alias works via both Node.js subpath imports (package.json `"imports"`) and tsconfig paths
