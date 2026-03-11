import { env } from "cloudflare:workers";
import { clerkClient } from "@clerk/tanstack-react-start/server";
import { eq } from "drizzle-orm";
import { getDb } from "#/db";
import { users } from "#/db/schema";

/**
 * Upsert a Clerk user into our local users table.
 * Called after authentication to keep local user data in sync.
 */
export async function syncUser(userId: string) {
	const client = clerkClient();
	const clerkUser = await client.users.getUser(userId);

	const name =
		[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
		clerkUser.username ||
		"Anonymous";
	const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";
	const image = clerkUser.imageUrl ?? null;

	const db = getDb(env.planmd_db);
	const existing = await db
		.select()
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (existing.length === 0) {
		await db.insert(users).values({
			id: userId,
			name,
			email,
			emailVerified: true,
			image,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	} else {
		await db
			.update(users)
			.set({ name, email, image, updatedAt: new Date() })
			.where(eq(users.id, userId));
	}

	return { id: userId, name, email, image };
}
