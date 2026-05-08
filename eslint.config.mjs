import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = import.meta.dirname;

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '.vscode/',
      'test/fixtures/',
      'web/',
      '.claude/',
      '.claude/**/*',
      '.son-of-anton/',
      '.son-of-anton/**/*',
      '.codex-clone-*/',
      '.codex-clone-*/**/*',
      '.codex-worktrees/',
      '.codex-worktrees/**/*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.es2024,
        Bun: 'readonly',
      },
      parserOptions: {
        tsconfigRootDir,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
