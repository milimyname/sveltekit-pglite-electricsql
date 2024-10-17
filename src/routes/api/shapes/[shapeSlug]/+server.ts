import { db } from '$lib/server/db';
import { itemsTable } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

const shapeMap = {
	itemsTable
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
