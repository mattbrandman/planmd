# planmd

Collaborative plan review app for developer teams. Teams submit detailed planning documents in markdown (`plan.md` files), discuss via inline comments, revise based on feedback, reach consensus, and hand off to AI coding agents for implementation.

**Workflow:** Write plan → Share for review → Discuss via inline comments → Revise → Reach consensus → Hand off to AI agents

## Features

- **Markdown plan creation** with live preview
- **Section-anchored inline comments** with threading and resolution
- **Review/approval workflow** with consensus tracking and a visual consensus bar
- **Revision history** with diff view between versions
- **Role-based participants** — author, reviewer, observer
- **GitHub OAuth** authentication (with dev bypass mode for local development)

## Tech Stack

- **TanStack Start** — React 19, Vite, SSR
- **TanStack Router** — file-based routing
- **Cloudflare D1** (SQLite) with **Drizzle ORM**
- **Better Auth** — GitHub OAuth
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
| `BETTER_AUTH_SECRET` | Auth secret key (generate with `pnpm dlx @better-auth/cli secret`) |
| `BETTER_AUTH_URL` | Auth base URL (`http://localhost:3000` for dev) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |

For local development without GitHub OAuth, set `DEV_BYPASS_AUTH=true` and `VITE_DEV_BYPASS_AUTH=true` to use a seeded dev user.

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

## Project Structure

Directory-based routing with colocation. Each route's components, API functions, and hooks live in `-prefixed` directories next to the route file.

```
src/
├── routes/                        # File-based routing
│   ├── __root.tsx                 # Root layout
│   ├── index.tsx                  # Dashboard (/)
│   ├── plan/
│   │   ├── new/                   # /plan/new — create a plan
│   │   └── $planId/
│   │       ├── index.tsx          # /plan/:planId — review view
│   │       ├── -components/       # Inline comments, consensus bar, etc.
│   │       ├── -api/              # Plan detail server functions
│   │       └── history/           # /plan/:planId/history — diff view
│   ├── sign-in/                   # GitHub OAuth sign-in
│   └── api/auth/                  # Better Auth server route
│
├── common/                        # Shared across 2+ routes
│   ├── components/ui/             # shadcn/ui primitives
│   ├── integrations/better-auth/  # Auth provider
│   └── lib/                       # Utils, auth config
│
└── db/                            # Drizzle schema + database init
```

Routes use the `-` prefix convention for colocated files (e.g., `-components/`, `-api/`), which TanStack Router ignores during route generation.

## License

Private.
