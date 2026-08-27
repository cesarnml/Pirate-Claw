import '@testing-library/jest-dom';

// Vitest's `@vitest-environment node` pool doesn't inherit Bun's global
// `crypto` under this bun version, unlike real Node.js (crypto is global
// since Node 19) — polyfill it so session.test.ts / hooks.server.test.ts
// (WebCrypto via src/lib/server/session.ts) don't crash with
// "crypto is not defined". No-op wherever crypto already exists (jsdom).
if (typeof globalThis.crypto === 'undefined') {
	const { webcrypto } = await import('node:crypto');
	// @ts-expect-error - webcrypto satisfies the Crypto interface at runtime
	globalThis.crypto = webcrypto;
}
