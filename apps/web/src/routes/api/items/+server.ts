import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { itemsTable } from '$lib/server/db/schema';

export const GET: RequestHandler = async () => {
	const items = await db.select().from(itemsTable);

	return json(items);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	const [id] = await db.insert(itemsTable).values(body);

	return json({ id });
};
