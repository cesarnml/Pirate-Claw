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
		plugins: { svelte },
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsParser }
		},
		rules: {
			...svelte.configs.recommended.rules
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/']
	}
];
