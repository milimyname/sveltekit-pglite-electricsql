<script lang="ts">
	import '../app.css';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { SvelteQueryDevtools } from '@tanstack/svelte-query-devtools';

	let { children, data } = $props();
</script>

<QueryClientProvider client={data.queryClient}>
	{@render children()}
	<SvelteQueryDevtools />
</QueryClientProvider>
