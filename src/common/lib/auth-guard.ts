import { env } from "cloudflare:workers";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { getAuth } from "#/common/lib/auth";
import { getDb } from "#/db";
import { users } from "#/db/schema";

const DEV_MODE = process.env.NODE_ENV !== "production";
const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "true";

const DEV_USER = {
	id: "dev-user-001",
	name: "Dev User",
	email: "dev@planmd.local",
	emailVerified: true,
	image: null as string | null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

/**
 * Ensure the dev user exists in the database.
 * Only runs once when DEV_BYPASS_AUTH is enabled.
 */
let devUserSeeded = false;
async function ensureDevUser() {
	if (devUserSeeded) return;
	const db = getDb(env.planmd_db);
	const existing = await db
		.select()
		.from(users)
		.where(eq(users.id, DEV_USER.id))
		.limit(1);
	if (existing.length === 0) {
		await db.insert(users).values(DEV_USER);
	}
	devUserSeeded = true;
}

/**
 * Server function to get the current session. Used in route loaders
 * and beforeLoad guards.
 */
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		if (DEV_MODE && DEV_BYPASS_AUTH) {
			await ensureDevUser();
			return {
				user: DEV_USER,
				session: {
					id: "dev-session",
					token: "dev-token",
					expiresAt: new Date(Date.now() + 86400000),
					createdAt: new Date(),
					updatedAt: new Date(),
					ipAddress: null,
					userAgent: null,
					userId: DEV_USER.id,
				},
			};
		}

		const request = getRequest()!;
		const auth = getAuth();
		const session = await auth.api.getSession({ headers: request.headers });
		return session;
	},
);

/**
 * Use in route's beforeLoad to require authentication.
 * Redirects to sign-in if not authenticated.
 */
export async function authGuard() {
	const session = await getSession();
	if (!session?.user) {
		throw redirect({ to: "/sign-in/$", params: { _splat: "" } });
	}
	return session;
}

/**
 * Server function to require auth inside server functions.
 * Throws if not authenticated.
 */
export const requireAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		if (DEV_MODE && DEV_BYPASS_AUTH) {
			await ensureDevUser();
			return DEV_USER;
		}

		const request = getRequest()!;
		const auth = getAuth();
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user) {
			throw new Error("Unauthorized");
		}

		return session.user;
	},
);
