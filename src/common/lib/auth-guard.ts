import { env } from "cloudflare:workers";
import { auth } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "#/db";
import { users } from "#/db/schema";
import { syncUser } from "#/common/lib/auth";

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
 * Server function to get the current session.
 * Returns { user } or null.
 */
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		if (DEV_MODE && DEV_BYPASS_AUTH) {
			await ensureDevUser();
			return { user: DEV_USER };
		}

		const { userId } = await auth();
		if (!userId) return null;

		// Check local DB first, sync if not found
		const db = getDb(env.planmd_db);
		let localUser = await db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)
			.then((rows) => rows[0] ?? null);

		if (!localUser) {
			const synced = await syncUser(userId);
			localUser = {
				id: synced.id,
				name: synced.name,
				email: synced.email,
				emailVerified: true,
				image: synced.image,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
		}

		return {
			user: {
				id: localUser.id,
				name: localUser.name,
				email: localUser.email,
				emailVerified: localUser.emailVerified,
				image: localUser.image,
				createdAt: localUser.createdAt,
				updatedAt: localUser.updatedAt,
			},
		};
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
 * Throws if not authenticated. Returns the user.
 */
export const requireAuth = createServerFn({ method: "GET" }).handler(
	async () => {
		if (DEV_MODE && DEV_BYPASS_AUTH) {
			await ensureDevUser();
			return DEV_USER;
		}

		const { userId } = await auth();
		if (!userId) throw new Error("Unauthorized");

		// Check local DB first, sync if not found
		const db = getDb(env.planmd_db);
		let localUser = await db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1)
			.then((rows) => rows[0] ?? null);

		if (!localUser) {
			const synced = await syncUser(userId);
			return {
				id: synced.id,
				name: synced.name,
				email: synced.email,
				emailVerified: true,
				image: synced.image,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
		}

		return {
			id: localUser.id,
			name: localUser.name,
			email: localUser.email,
			emailVerified: localUser.emailVerified,
			image: localUser.image,
			createdAt: localUser.createdAt,
			updatedAt: localUser.updatedAt,
		};
	},
);
