<script lang="ts">
	import { type Item, createItem, deleteAll } from '$lib/electric-actions/item';
	import { createMutation } from '@tanstack/svelte-query';
	import { v4 as uuidv4 } from 'uuid';
	import { faker } from '@faker-js/faker';
	import { onMount } from 'svelte';

	const { data } = $props();

	let items = $state<Item[]>([]);

	onMount(async () => {
		if (!data.pglite) return;

		const shape = await data.pglite.electric.syncShapeToTable({
			shape: { url: 'http://localhost:3000/v1/shape/items' },
			table: 'items',
			primaryKey: ['id'],
			shapeKey: 'items'
		});

		await data.pglite.live.query(`SELECT * FROM items ORDER BY name`, null, (res) => {
			items = res.rows;
		});

		return () => {
			shape.unsubscribe();
		};
	});

	const addItemMutation = createMutation({
		mutationKey: ['addItem'],
		mutationFn: (item: Item) => createItem(item)
	});

	const deleteAllMutation = createMutation({
		mutationKey: ['deleteAll'],
		mutationFn: () => deleteAll()
	});
</script>

<button
	onclick={() => {
		$addItemMutation.mutate({
			id: uuidv4(),
			name: faker.person.firstName(),
			status: 'inactive'
		});
	}}
>
	Add
</button>
<button
	onclick={() => {
		if (items.length === 0) return;

		$deleteAllMutation.mutate();
	}}
>
	Delete All
</button>

<h1>Page</h1>

<div class="container">
	{#each items as item, i}
		<p>{i + 1} :{item.name}</p>
	{/each}
</div>

<style>
	.container {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr;
		gap: 3rem;
	}
</style>
