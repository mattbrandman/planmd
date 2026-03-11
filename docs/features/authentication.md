# Authentication

## Overview

GitHub OAuth authentication via Better Auth, with a dev bypass mode for local development.

## Tech Stack

- **Better Auth** — Open-source TypeScript auth library
- **GitHub OAuth** — Primary sign-in method (target audience is developers)
- **tanstackStartCookies** plugin — Handles cookie setting in TanStack Start's SSR environment

## Configuration

### Environment Variables

```env
# Better Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<generate with: pnpm dlx @better-auth/cli secret>

# GitHub OAuth (create at https://github.com/settings/developers)
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>

# Dev bypass (local development only)
DEV_BYPASS_AUTH=true
VITE_DEV_BYPASS_AUTH=true
```

### GitHub OAuth App Setup

1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set Homepage URL to `http://localhost:3000`
4. Set Authorization callback URL to `http://localhost:3000/api/auth/callback/github`
5. Copy Client ID and Client Secret to `.env.local`

## Dev Bypass Mode

When `DEV_BYPASS_AUTH=true`:
- All auth guards return a dummy "Dev User" (id: `dev-user-001`)
- No OAuth redirect happens — you're automatically signed in
- A yellow "Dev" badge shows in the header to indicate bypass mode
- The dev user is auto-seeded in the database on first request

This lets you develop without configuring GitHub OAuth.

## Auth Guard Patterns

### Route Protection (beforeLoad)

```typescript
import { authGuard } from "#/common/lib/auth-guard"

export const Route = createFileRoute("/plan/new")({
  beforeLoad: async () => await authGuard(),
  // ...
})
```

### Server Function Auth

```typescript
import { requireAuth } from "#/common/lib/auth-guard"

export const createPlan = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const user = await requireAuth()
    // user is guaranteed to exist here
  })
```

## Files

- `src/common/lib/auth.ts` — Better Auth server config
- `src/common/lib/auth-client.ts` — Better Auth React client
- `src/common/lib/auth-guard.ts` — Auth middleware, guards, session helpers
- `src/routes/api/auth/$.ts` — Auth API catch-all route
- `src/routes/sign-in/$.tsx` — Sign-in page with GitHub button

## Database Tables (managed by Better Auth)

- `user` — id, name, email, emailVerified, image, timestamps
- `session` — id, token, expiresAt, userId, timestamps
- `account` — id, providerId, accountId, userId, tokens
- `verification` — id, identifier, value, expiresAt
