import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tests/out/**', 'test-results/**', 'playwright-report/**', 'tests/critiques/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    // la simulation reste pure : ni DOM, ni rendu, ni audio
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance', 'requestAnimationFrame', 'navigator'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Utiliser le Rng à graine de la simulation.' }],
      'no-restricted-imports': ['error', { patterns: ['../render/*', '../audio/*', '../ui/*', '../input/*', '../save/*', 'three/addons/*'] }],
    },
  },
);
