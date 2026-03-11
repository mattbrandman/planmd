import { nanoid } from "nanoid";

/** Generate a unique ID for database records */
export function newId(): string {
	return nanoid();
}
