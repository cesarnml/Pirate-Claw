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
      // Two deliberate conventions this codebase already uses, made real
      // rather than aspirational:
      //  - `const { dropMe: _unused, ...rest } = obj` to omit a key while
      //    copying the rest (see api.ts's Strict-toggle handling and
      //    credential-manager.ts's legacy-key drop). ignoreRestSiblings is
      //    exactly this case: the binding exists to be discarded.
      //  - a leading underscore as "intentionally unused".
      // Without these, all three call sites were hard lint errors that
      // `bun run verify` silently swallowed (see the lint script).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
