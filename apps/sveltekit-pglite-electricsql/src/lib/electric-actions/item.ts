import { z } from 'zod';
import { type Row } from '@electric-sql/client';
import { matchStream } from '$lib/match-stream';
import { BASE_API_URL, BASE_URL } from '$lib/constants';
import { getShapeStream } from '$lib/electric-actions/electric-store.svelte';

export const itemSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(['active', 'inactive'])
});

export type Item = z.infer<typeof itemSchema> & Row;

export const itemShape = () => ({
	url: new URL(`/v1/shape/items`, BASE_URL).href
});

export async function createItem(item: Item) {
	const itemStream = getShapeStream<Item>(itemShape());

	const findUpdatePromise = matchStream({
		stream: itemStream,
		operations: ['insert'],
		matchFn: ({ message }) => message.value.id === item.id
	});

	const fetchPromise = fetch(`${BASE_API_URL}/items`, {
		method: `POST`,
		body: JSON.stringify(item)
	});
	return await Promise.all([findUpdatePromise, fetchPromise]);
}

export async function deleteAll() {
	const itemStream = getShapeStream<Item>(itemShape());

	const findUpdatePromise = matchStream({
		stream: itemStream,
		operations: ['delete'],
		matchFn: ({ message }) => message.value
	});

	const fetchPromise = fetch(`${BASE_API_URL}/items`, {
		method: `DELETE`
	});

	return await Promise.all([findUpdatePromise, fetchPromise]);
}
