import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,ts}'],
		plugins: { '@typescript-eslint': ts },
		languageOptions: {
			parser: tsParser,
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			...ts.configs.recommended.rules
		}
	},
	{
		files: ['**/*.svelte'],
		plugins: { '@typescript-eslint': ts, svelte },
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsParser },
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			...svelte.configs.recommended.rules,
			// ESLint compiles Svelte independently; shadcn `$props()` + rest triggers benign custom-element warnings
			'svelte/valid-compile': ['error', { ignoreWarnings: true }],
			// base rule misidentifies TS interface param names as unused variables; TS-aware rule handles this correctly
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/']
	}
];
