<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import logo from '$lib/assets/forko-logo.svg';
	// Worker will be created only in the browser (onMount) to avoid SSR errors
	let engineWorker: Worker | undefined;
	import { Chessground } from 'chessground';
	import { Chess } from 'chess.js';
	import 'chessground/assets/chessground.base.css';
	import 'chessground/assets/chessground.brown.css';
	import 'chessground/assets/chessground.cburnett.css';

	// Strongly-typed RPC method map (must match the worker's EngineMethods)
	type EngineMethods = {
		init: () => Promise<{ version: string }>;
		set_depth: (depth: number) => void;
		set_fen: (fen: string) => void;
		best_move: () => string;
		version: () => string;
	};

	type RpcResponse<M extends keyof EngineMethods = keyof EngineMethods> =
		| { id: number; result: Awaited<ReturnType<EngineMethods[M]>> }
		| { id: number; error: { message: string; stack?: string } };

	let nextId = 1;
	const pending = new Map<
		number,
		{ resolve: (v: any) => void; reject: (e: any) => void; method: string }
	>();

	function call<M extends keyof EngineMethods>(
		method: M,
		...params: Parameters<EngineMethods[M]>
	): Promise<Awaited<ReturnType<EngineMethods[M]>>> {
		const id = nextId++;
		console.debug('[DEBUG_LOG][main]', `post rpc#${id}`, String(method), params);
		if (!engineWorker) {
			return Promise.reject(
				new Error('Engine worker is not initialized (SSR or before mount).')
			) as any;
		}
		engineWorker.postMessage({ id, method, params });
		return new Promise((resolve, reject) =>
			pending.set(id, { resolve, reject, method: String(method) })
		);
	}

	let boardContainer: HTMLElement;
	let cg: any;
	let chess = new Chess();
	let isThinking = false;
	let isWasmReady = false;
	let thinkingDepth = 6;
	const depthOptions = Array.from({ length: 10 }, (_, i) => i + 1);

	function clampDepth(value: number) {
		return Math.max(1, Math.min(10, Math.trunc(value)));
	}

	function applyDepth(value: number) {
		thinkingDepth = clampDepth(value);
		if (!isWasmReady) return;
		call('set_depth', thinkingDepth).catch((e) => console.error('Failed to set depth:', e));
	}

	function onDepthChange(e: Event) {
		applyDepth(Number((e.currentTarget as HTMLSelectElement).value));
	}

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
		// ensure last UI updates are painted before heavy work starts in worker
		await new Promise(requestAnimationFrame);
		isThinking = true;
		console.debug('[DEBUG_LOG][main] engine: set_fen & best_move');
		try {
			await call('set_fen', chess.fen());
			const moveStr = await call('best_move');
			if (moveStr) {
				const from = moveStr.slice(0, 2);
				const to = moveStr.slice(2, 4);
				const promotion = moveStr.length > 4 ? (moveStr.slice(4, 5) as any) : undefined;
				chess.move({ from, to, promotion });
				cg.set({
					fen: chess.fen(),
					check: chess.isCheck(),
					turnColor: toColor(chess),
					movable: { color: toColor(chess), dests: toDests(chess) },
					lastMove: [from, to]
				});
			}
		} catch (e) {
			console.error('[DEBUG_LOG][main] Engine error:', e);
		} finally {
			isThinking = false;
		}
	}

	function onUserMove(orig: string, dest: string) {
		const piece = chess.get(orig as any);
		let promotion = undefined;
		// Auto-promote to queen
		if (
			piece &&
			piece.type === 'p' &&
			((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'))
		) {
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
			console.error('Invalid move', e);
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
		console.debug('[DEBUG_LOG][main] creating worker...');
		engineWorker = new Worker(new URL('$lib/engine.worker.ts', import.meta.url), {
			type: 'module'
		});

		engineWorker.onmessage = (e: MessageEvent<RpcResponse>) => {
			const msg = e.data as RpcResponse;
			const p = pending.get((msg as any).id);
			if (!p) return;
			pending.delete((msg as any).id);
			if ((msg as any).error) {
				console.error(
					'[DEBUG_LOG][main]',
					`rpc#${(msg as any).id}`,
					p.method,
					'error',
					(msg as any).error.message
				);
				p.reject(new Error((msg as any).error.message));
			} else {
				console.debug('[DEBUG_LOG][main]', `rpc#${(msg as any).id}`, p.method, 'ok');
				p.resolve((msg as any).result);
			}
		};

		console.debug('[DEBUG_LOG][main] init worker...');
		const { version } = await call('init');
		console.debug('[DEBUG_LOG][main] worker ready, version', version);
		isWasmReady = true;
		applyDepth(thinkingDepth);

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

	onDestroy(() => {
		if (engineWorker) {
			console.debug('[DEBUG_LOG][main] terminating worker');
			engineWorker.terminate();
			engineWorker = undefined;
		}
	});
</script>

<div class="flex flex-col items-center py-12">
	<img
		src={logo}
		alt="Forko"
		class="w-24 h-24 mb-6 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)] bg-slate-700 rounded-lg"
	/>
	<h1
		class="text-2xl sm:text-4xl font-extrabold mb-10 pb-2 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent tracking-tight leading-normal"
	>
		Play against Forko
	</h1>

	<div
		class="w-full max-w-[500px] p-1 bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg shadow-2xl shadow-black/50"
	>
		<div class="bg-slate-800 rounded-[4px] overflow-hidden">
			<div bind:this={boardContainer} class="w-full aspect-square"></div>
		</div>
	</div>

	<div class="flex items-center gap-6 mt-8 h-12">
		<button
			class="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white rounded-lg font-medium transition-all shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

	<div class="w-full max-w-[500px] mt-4">
		<label for="thinking-depth" class="flex items-center justify-between gap-4 text-slate-300">
			<span class="font-medium">Thinking depth</span>
		</label>
		<select
			class="w-full mt-2 px-3 py-2 bg-slate-800 text-slate-200 rounded-md border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
			id="thinking-depth"
			value={thinkingDepth}
			onchange={onDepthChange}
			disabled={isThinking || !isWasmReady}
		>
			{#each depthOptions as d}
				<option value={d}>{d}</option>
			{/each}
		</select>
	</div>
</div>
