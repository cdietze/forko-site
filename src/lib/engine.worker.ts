// Generic, strongly-typed RPC worker around the forko WASM engine
// Adds lightweight debug logging.

import * as wasm from 'forko';
// Vite: get the wasm url so we can initialize explicitly inside the worker
import wasmUrl from 'forko/forko_bg.wasm?url';

// Method map describing what the worker exposes. Keep this list small and explicit.
export type EngineMethods = {
	init: () => Promise<{ version: string }>;
	set_depth: (depth: number) => void;
	set_fen: (fen: string) => void;
	best_move: () => string;
	version: () => string;
};

let ready = false;

const api: { [K in keyof EngineMethods]: EngineMethods[K] } = {
	async init() {
		if (!ready) {
			console.debug('[DEBUG_LOG][worker] init -> loading wasm', wasmUrl);
			await wasm.default(wasmUrl);
			ready = true;
			console.debug('[DEBUG_LOG][worker] init -> loaded');
		}
		const ver = wasm.version();
		console.debug('[DEBUG_LOG][worker] init -> version', ver);
		return { version: ver };
	},

	set_depth(depth: number) {
		if (!ready) throw new Error('Engine not ready');
		console.debug('[DEBUG_LOG][worker] set_depth', depth);
		wasm.set_depth(depth);
	},

	set_fen(fen: string) {
		if (!ready) throw new Error('Engine not ready');
		console.debug('[DEBUG_LOG][worker] set_fen', fen);
		wasm.set_fen(fen);
	},

	best_move() {
		if (!ready) throw new Error('Engine not ready');
		console.debug('[DEBUG_LOG][worker] best_move -> begin');
		const mv = wasm.best_move();
		console.debug('[DEBUG_LOG][worker] best_move -> end', mv);
		return mv;
	},

	version() {
		if (!ready) throw new Error('Engine not ready');
		const ver = wasm.version();
		console.debug('[DEBUG_LOG][worker] version', ver);
		return ver;
	}
};

// RPC protocol
type RpcRequest<M extends keyof EngineMethods = keyof EngineMethods> = {
	id: number;
	method: M;
	params?: Parameters<EngineMethods[M]>;
};

type RpcResponse<M extends keyof EngineMethods = keyof EngineMethods> =
	| { id: number; result: Awaited<ReturnType<EngineMethods[M]>> }
	| { id: number; error: { message: string; stack?: string } };

self.onmessage = async (e: MessageEvent<RpcRequest>) => {
	const { id, method } = e.data;
	const params = (e.data.params ?? []) as unknown[];

	const logPrefix = `[DEBUG_LOG][worker][id:${id}]`;
	try {
		console.debug(logPrefix, 'call', method, params);
		const fn = api[method as keyof EngineMethods] as (...a: unknown[]) => unknown;
		if (!fn) throw new Error(`Unknown method: ${String(method)}`);
		const result = await (fn as any)(...params);
		console.debug(logPrefix, 'ok');
		(self as any).postMessage({ id, result } satisfies RpcResponse);
	} catch (err: any) {
		const message = String(err?.message ?? err);
		console.error(logPrefix, 'error', message);
		(self as any).postMessage({ id, error: { message, stack: err?.stack } } satisfies RpcResponse);
	}
};
