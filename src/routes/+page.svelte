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

<h1>Play against Forko</h1>

<div class="controls">
	<button onclick={resetGame} disabled={isThinking}>Reset Board</button>
	{#if isThinking}
		<span class="indicator">Thinking...</span>
	{/if}
</div>

<div class="board-wrapper">
	<div bind:this={boardContainer} class="chessground-board"></div>
</div>

<style>
	.controls {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

    button {
        padding: 0.5rem 1rem;
        cursor: pointer;
    }

	.indicator {
		font-weight: bold;
		color: #e67e22;
	}

	.board-wrapper {
		display: flex;
		justify-content: center;
		margin-top: 1rem;
	}

	.chessground-board {
		width: 500px;
		height: 500px;
	}
</style>
