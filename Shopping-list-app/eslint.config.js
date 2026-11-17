import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

const NODE_FILES = ['api/**/*.{js,jsx}', 'vite.config.js', 'vitest.config.js', 'eslint.config.js']
const TEST_FILES = ['tests/**/*.{js,jsx}']

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  // Serverless functions and build config run in Node, not in the browser.
  {
    files: NODE_FILES,
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  // Tests import both browser-side and server-side modules.
  {
    files: TEST_FILES,
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  // Browser code (React).
  {
    files: ['**/*.{js,jsx}'],
    ignores: [...NODE_FILES, ...TEST_FILES],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
