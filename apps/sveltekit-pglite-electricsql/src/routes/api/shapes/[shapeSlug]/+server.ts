import { db } from '$lib/server/db';
import { itemsTable } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const shapeMap = {
	items: itemsTable
};

export const GET = async ({ params, url }) => {
	const { shapeSlug } = params;
	const shape = shapeMap[shapeSlug];

	if (!shape) return json({ error: `Invalid shape: ${shapeSlug}` }, { status: 400 });

	const id = url.searchParams.get('id');

	try {
		let query = db.select().from(shape);

		if (id) query = query.where(eq(shape.id, id));

		const result = await query;
		return json(result, { status: 200 });
	} catch (error) {
		console.error(`Error fetching ${shapeSlug}:`, error);
		return json({ error: `Failed to fetch ${shapeSlug}` }, { status: 500 });
	}
};

export const POST = async ({ params, request }) => {
	const { shapeSlug } = params;
	const shape = shapeMap[shapeSlug];

	if (!shape) return json({ error: `Invalid shape: ${shapeSlug}` }, { status: 400 });

	const body = await request.json();

	try {
		let result;

		await db.transaction(async (tx) => {
			await tx.insert(shape).values(body).returning();
		});

		return json({ message: `${shapeSlug} added`, data: result }, { status: 200 });
	} catch (error) {
		console.error(`Error adding ${shapeSlug}:`, error);
		return json({ error: `Failed to add ${shapeSlug}: ${error.message}` }, { status: 500 });
	}
};

export const DELETE = async ({ params }) => {
	const { shapeSlug } = params;
	const shape = shapeMap[shapeSlug];

	if (!shape) return json({ error: `Invalid shape: ${shapeSlug}` }, { status: 400 });

	try {
		await db.delete(shape);
		return json({ message: `${shapeSlug} deleted` }, { status: 200 });
	} catch (error) {
		console.error(`Error deleting ${shapeSlug}:`, error);
		return json({ error: `Failed to delete ${shapeSlug}` }, { status: 500 });
	}
};
