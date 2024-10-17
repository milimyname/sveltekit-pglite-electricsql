export async function load({ parent, fetch }) {
	const { queryClient } = await parent();

	// You need to use the SvelteKit fetch function here
	await queryClient.prefetchQuery({
		queryKey: ['items'],
		queryFn: async () => (await fetch('/api/items')).json()
	});
}
