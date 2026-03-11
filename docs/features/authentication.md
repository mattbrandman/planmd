# Authentication

## Overview

Authentication via [Clerk](https://clerk.com) using `@clerk/tanstack-react-start`. Clerk manages user accounts, sessions, and OAuth providers externally. A local `users` table syncs Clerk user data on first interaction for foreign key references.

## Architecture

```
Browser → ClerkProvider (React context)
              ↓
         clerkMiddleware() (src/start.ts — runs on every request)
              ↓
         auth() → { userId, sessionId } (server-side session validation)
              ↓
         syncUser() → upserts Clerk user into local D1 `users` table
```

Clerk handles all OAuth flows, session management, and token validation. The app only needs to:
1. Validate the session server-side via `auth()`
2. Sync user data to the local DB for foreign key references

## Configuration

### Environment Variables

```env
# Clerk (get from https://dashboard.clerk.com)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx   # pk_live_xxx for production
CLERK_SECRET_KEY=sk_test_xxx             # sk_live_xxx for production

# Dev bypass (local development only)
DEV_BYPASS_AUTH=true
VITE_DEV_BYPASS_AUTH=true
```

### Production Secrets

Set via Cloudflare Workers secrets:

```bash
npx wrangler secret put VITE_CLERK_PUBLISHABLE_KEY   # pk_live_xxx
npx wrangler secret put CLERK_SECRET_KEY              # sk_live_xxx
```

### Clerk Dashboard Setup

1. Create an app at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Enable GitHub as a social provider (or other providers as needed)
3. Set custom domain to `clerk.planmd.dev` (production)
4. DNS records required for custom domain:
   - `clerk.planmd.dev` → `frontend-api.clerk.services`
   - `accounts.planmd.dev` → `accounts.clerk.services`
   - `clkmail.planmd.dev` → `mail.<instance>.clerk.services`
   - `clk._domainkey.planmd.dev` → `dkim1.<instance>.clerk.services`
   - `clk2._domainkey.planmd.dev` → `dkim2.<instance>.clerk.services`
   - All DNS records must be **DNS only** (not proxied) on Cloudflare

## Dev Bypass Mode

When `DEV_BYPASS_AUTH=true`:
- All auth guards return a dummy "Dev User" (id: `dev-user-001`)
- No OAuth redirect happens — you're automatically signed in
- A yellow "Dev" badge shows in the header to indicate bypass mode
- The dev user is auto-seeded in the database on first request

This lets you develop without configuring Clerk.

## Auth Patterns

### Middleware (runs on every request)

```typescript
// src/start.ts
import { clerkMiddleware } from "@clerk/tanstack-react-start/server"
import { createStart } from "@tanstack/react-start"

export const startInstance = createStart(() => ({
  requestMiddleware: [clerkMiddleware()],
}))
```

### Route Protection (beforeLoad)

```typescript
import { authGuard } from "#/common/lib/auth-guard"

export const Route = createFileRoute("/plan/new")({
  beforeLoad: async () => await authGuard(),
  // redirects to /sign-in if not authenticated
})
```

### Server Function Auth

```typescript
import { requireAuth } from "#/common/lib/auth-guard"

export const createPlan = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const user = await requireAuth()
    // user.id, user.name, user.email, user.image available
    // throws "Unauthorized" if not authenticated
  })
```

### Session in Loaders (optional auth)

```typescript
import { getSession } from "#/common/lib/auth-guard"

export const Route = createFileRoute("/plan/$planId/")({
  loader: async ({ params }) => {
    const [planData, session] = await Promise.all([
      getPlan({ data: { planId: params.planId } }),
      getSession(),
    ])
    return { ...planData, currentUser: session?.user ?? null }
  },
})
```

### Client-Side Components

```typescript
import { Show, UserButton, SignInButton } from "@clerk/tanstack-react-start"
import { useAuth, useUser } from "@clerk/tanstack-react-start"

// Conditional rendering
<Show when="signed-in"><UserButton /></Show>
<Show when="signed-out"><SignInButton /></Show>

// Hooks
const { userId, isSignedIn } = useAuth()
const { user } = useUser()
```

## User Sync

Clerk manages users externally. The local `users` table exists for foreign key references from `plans`, `comments`, `reviews`, etc.

`syncUser(userId)` in `src/common/lib/auth.ts`:
1. Fetches user from Clerk API via `clerkClient().users.getUser(userId)`
2. Upserts into local `users` table (insert if new, update name/email/image if existing)
3. Called automatically by `getSession()` and `requireAuth()` when a user isn't found locally

### Database Table

```sql
-- users table (synced from Clerk)
CREATE TABLE user (
  id TEXT PRIMARY KEY,           -- Clerk userId (e.g., user_2abc123)
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Files

| File | Purpose |
|---|---|
| `src/start.ts` | Clerk middleware (`clerkMiddleware()`) |
| `src/common/lib/auth.ts` | `syncUser()` — upserts Clerk user to local DB |
| `src/common/lib/auth-guard.ts` | `getSession()`, `authGuard()`, `requireAuth()` |
| `src/routes/__root.tsx` | `<ClerkProvider>` wrapping the app |
| `src/common/integrations/better-auth/header-user.tsx` | Header auth UI (`<UserButton>`, `<SignInButton>`) |
| `src/routes/sign-in/-SignInPage.tsx` | Sign-in page (`<SignIn />` component) |
