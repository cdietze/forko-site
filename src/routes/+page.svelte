<script lang="ts">
	import { onMount } from 'svelte';
	import * as wasm from 'forko';
	import wasmUrl from 'forko/forko_bg.wasm?url';
	import { Chessground } from 'chessground';
	import { Chess } from 'chess.js';
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.brown.css';
	import 'chessground/assets/chessground.cburnett.css';

	let boardContainer: HTMLElement;
	let cg: any;
	let chess = new Chess();
	let isThinking = false;

	function toDests(chess: Chess) {
		const dests = new Map();
		chess.moves({ verbose: true }).forEach((m: any) => {
			if (!dests.has(m.from)) dests.set(m.from, []);
			dests.get(m.from).push(m.to);
		});
		return dests;
	}

	function toColor(chess: Chess) {
		return chess.turn() === 'w' ? 'white' : 'black';
	}

	async function playEngineMove() {
		if (chess.isGameOver()) return;

		isThinking = true;

		setTimeout(() => {
			try {
				wasm.set_fen(chess.fen());
				const moveStr = wasm.best_move();
				if (moveStr) {
					const from = moveStr.slice(0, 2);
					const to = moveStr.slice(2, 4);
					const promotion = moveStr.length > 4 ? moveStr.slice(4, 5) : undefined;

					chess.move({ from, to, promotion });
					cg.set({
						fen: chess.fen(),
						check: chess.isCheck(),
						turnColor: toColor(chess),
						movable: {
							color: toColor(chess),
							dests: toDests(chess)
						},
						lastMove: [from, to]
					});
				}
			} catch (e) {
				console.error("Engine error:", e);
			} finally {
				isThinking = false;
			}
		}, 50);
	}

	function onUserMove(orig: string, dest: string) {
        const piece = chess.get(orig as any);
        let promotion = undefined;
        // Auto-promote to queen
         if (piece && piece.type === 'p' && ((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'))) {
            promotion = 'q';
        }

		try {
			chess.move({ from: orig, to: dest, promotion });
			cg.set({
                fen: chess.fen(),
                check: chess.isCheck()
            });

			playEngineMove();
		} catch (e) {
			console.error("Invalid move", e);
			cg.set({ fen: chess.fen() });
		}
	}

	function resetGame() {
		chess.reset();
		if (cg) {
			cg.set({
				fen: chess.fen(),
				turnColor: 'white',
				lastMove: undefined,
				check: false,
				movable: {
					color: 'white',
					dests: toDests(chess)
				}
			});
		}
		isThinking = false;
	}

	onMount(async () => {
		await wasm.default(wasmUrl);
		console.log(`Loaded forko wasm`);
		console.log(`Version: ${wasm.version()}`);

		if (boardContainer) {
			cg = Chessground(boardContainer, {
				fen: chess.fen(),
				movable: {
					color: 'white',
					free: false,
					dests: toDests(chess),
					events: {
						after: onUserMove
					}
				}
			});
		}
	});
</script>

<div class="flex flex-col items-center py-12">
	<h1 class="text-5xl font-extrabold mb-10 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent tracking-tight">
		Play against Forko
	</h1>

	<div class="flex items-center gap-6 mb-8 h-12">
		<button
			class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-blue-500/25"
			onclick={resetGame}
			disabled={isThinking}
		>
			Reset Board
		</button>
		{#if isThinking}
			<div class="flex items-center gap-2 text-amber-400 font-medium animate-pulse">
				<div class="w-2 h-2 bg-amber-400 rounded-full animate-bounce"></div>
				Thinking...
			</div>
		{/if}
	</div>

	<div class="w-full max-w-[500px] p-1 bg-gradient-to-br from-neutral-700 to-neutral-800 rounded-lg shadow-2xl shadow-black/50">
		<div class="bg-neutral-800 rounded-[4px] overflow-hidden">
			<div bind:this={boardContainer} class="w-full aspect-square"></div>
		</div>
	</div>
</div>

