<script lang="ts">
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	$inspect(data);

	onMount(async () => {
		if (!data.pglite) return;

		await data.pglite.exec(`
		    CREATE TABLE IF NOT EXISTS todo (
		        id SERIAL PRIMARY KEY,
		        task TEXT,
		        done BOOLEAN DEFAULT false
		    );
		    INSERT INTO todo (task, done) VALUES ('Install PGlite from NPM', true);
		    INSERT INTO todo (task, done) VALUES ('Load PGlite', true);
		    INSERT INTO todo (task, done) VALUES ('Create a table', true);
		    INSERT INTO todo (task, done) VALUES ('Insert some data', true);
		    INSERT INTO todo (task) VALUES ('Update a task');
		`);

		console.log('Querying data');
		const ret = await data.pglite.query(`
            SELECT * from todo;
        `);
		console.log(ret.rows);
	});
</script>

<QueryClientProvider client={data.queryClient}>
	{@render children()}
</QueryClientProvider>
