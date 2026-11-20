import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Architecture guardrails (see docs/frontend/architecture.md):
 * - Features talk to each other only through `@/features/<name>` (public index.ts).
 * - `shared/` is a leaf layer and must never import from features.
 * - No function, component, hook or arrow block may exceed 15 lines.
 */
const FEATURE_PUBLIC_API_ONLY = {
  group: ['@/features/*/*', '**/features/*/*/**'],
  message:
    'Deep feature imports are forbidden. Import through the public API: "@/features/<feature>" (its index.ts).',
};

const SHARED_MUST_NOT_IMPORT_FEATURES = {
  group: ['@/features', '@/features/*', '@/features/**'],
  message: 'shared/ is a leaf layer and must not depend on features/.',
};

const MAX_FUNCTION_LINES = {
  max: 15,
  skipBlankLines: true,
  skipComments: true,
  IIFEs: true,
};

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'public/**', 'next-env.d.ts', '*.config.*', 'vitest.config.mts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-lines-per-function': ['error', MAX_FUNCTION_LINES],
      'no-restricted-imports': ['error', { patterns: [FEATURE_PUBLIC_API_ONLY] }],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [FEATURE_PUBLIC_API_ONLY, SHARED_MUST_NOT_IMPORT_FEATURES] },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } },
  },
);
