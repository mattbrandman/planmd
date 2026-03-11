# planmd

Collaborative plan review app for developer teams. Teams submit detailed planning documents in markdown (`plan.md` files), discuss via inline comments, revise based on feedback, reach consensus, and hand off to AI coding agents for implementation.

**Workflow:** Write plan → Share for review → Discuss via inline comments → Revise → Reach consensus → Hand off to AI agents

**Live:** [planmd.dev](https://planmd.dev)

## Features

- **Markdown plan creation** with live preview
- **Section-anchored inline comments** with threading and resolution
- **Review/approval workflow** with consensus tracking and a visual consensus bar
- **Revision history** with diff view between versions
- **Role-based participants** — author, reviewer, observer
- **Clerk authentication** (with dev bypass mode for local development)

## Tech Stack

- **TanStack Start** — React 19, Vite, SSR
- **TanStack Router** — file-based routing
- **Cloudflare D1** (SQLite) with **Drizzle ORM**
- **Clerk** — authentication (`@clerk/tanstack-react-start`)
- **Tailwind CSS 4** + **shadcn/ui** (new-york style)
- **Biome** — formatting and linting
- **Vitest** — testing
- **Deployed on Cloudflare Workers**

## Getting Started

```bash
pnpm install
cp .env.local.example .env.local  # configure env vars
pnpm db:push                      # set up database schema
pnpm dev                          # start dev server on port 3000
```

### Environment Variables

Set these in `.env.local`:

| Variable | Description |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_` for dev) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_` for dev) |

For local development without Clerk, set `DEV_BYPASS_AUTH=true` and `VITE_DEV_BYPASS_AUTH=true` to use a seeded dev user.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm deploy       # Build + deploy to Cloudflare Workers
pnpm test         # Run tests
pnpm check        # Biome format + lint
pnpm db:generate  # Generate Drizzle migrations
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio GUI
```

## Deployment

Deployed to Cloudflare Workers with custom domains `planmd.dev` and `www.planmd.dev`.

```bash
# Deploy manually
pnpm deploy

# Apply migrations to production D1
npx wrangler d1 migrations apply planmd-db --remote

# Set production secrets
npx wrangler secret put VITE_CLERK_PUBLISHABLE_KEY
npx wrangler secret put CLERK_SECRET_KEY
```

GitHub integration (Workers Builds) auto-deploys on push to `main`.

## Project Structure

Directory-based routing with colocation. Each route's components, API functions, and hooks live in `-prefixed` directories next to the route file.

```
src/
├── start.ts                       # Clerk middleware
├── routes/                        # File-based routing
│   ├── __root.tsx                 # Root layout (ClerkProvider)
│   ├── index.tsx                  # Dashboard (/)
│   ├── plan/
│   │   ├── new/                   # /plan/new — create a plan
│   │   └── $planId/
│   │       ├── index.tsx          # /plan/:planId — review view
│   │       ├── -components/       # Inline comments, consensus bar, etc.
│   │       ├── -api/              # Plan detail server functions
│   │       └── history/           # /plan/:planId/history — diff view
│   └── sign-in/                   # Clerk sign-in page
│
├── common/                        # Shared across 2+ routes
│   ├── api/                       # Shared server functions
│   ├── components/ui/             # shadcn/ui primitives
│   ├── integrations/better-auth/  # Auth UI (HeaderUser)
│   └── lib/                       # Utils, auth sync, auth guards
│
└── db/                            # Drizzle schema + database init
```

Routes use the `-` prefix convention for colocated files (e.g., `-components/`, `-api/`), which TanStack Router ignores during route generation.

## License

Private.
