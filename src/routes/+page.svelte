<script lang="ts">
	import { onMount } from 'svelte';
	import * as wasm from 'forko';
	import wasmUrl from 'forko/forko_bg.wasm?url';
	import { Chessground } from 'chessground';
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.brown.css';
	import 'chessground/assets/chessground.cburnett.css';

	let boardContainer: HTMLElement;

	onMount(async () => {
		await wasm.default(wasmUrl);
		console.log(`Loaded forko wasm`);
		console.log(`Version: ${wasm.version()}`);
		if (boardContainer) {
			let c = Chessground(boardContainer, {
				fen: 'r2q2k1/1p6/p2p4/2pN1rp1/N1Pb2Q1/8/PP1B4/R6K b - - 2 25'
			});
		}
	});
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>

<div class="board-wrapper">
	<div bind:this={boardContainer} class="chessground-board"></div>
</div>

<style>
    .board-wrapper {
        display: flex;
        justify-content: center;
        margin-top: 2rem;
    }

    .chessground-board {
        width: 500px;
        height: 500px;
    }
</style>
