import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "#/db";

export function getAuth() {
	const db = getDb(env.planmd_db);
	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",
		}),
		socialProviders: {
			github: {
				clientId: process.env.GITHUB_CLIENT_ID!,
				clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			},
		},
		plugins: [tanstackStartCookies()],
	});
}
