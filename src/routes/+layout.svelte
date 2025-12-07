<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-neutral-950 text-neutral-100 font-sans antialiased selection:bg-blue-500 selection:text-white">
	<main class="container mx-auto px-4">
		{@render children()}
	</main>
</div>
