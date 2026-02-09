import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.mjs'],
  },

  // All TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Enforce existing zero-any practice
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars (allow underscore-prefixed)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Consistent type-only imports (allow import() type annotations for dynamic imports)
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],

      // Catch debug logs
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // No explicit return type required (inferred is fine)
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Allow empty functions (event handler stubs, etc.)
      '@typescript-eslint/no-empty-function': 'off',
    },
  }
);
