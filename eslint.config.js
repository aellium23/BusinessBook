import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Why this exists.
//
// Three failures in one week reached production and none of them could be seen
// by the build or the test suite: two names used before they existed, and a
// helper called without being imported. All three are runtime errors in a file
// that compiles perfectly, and nothing in this project renders a component, so
// nothing noticed.
//
// The rules below are chosen to catch exactly that, and to stay quiet about
// everything else. This is not a style pass: nobody needs a linter to have an
// opinion about semicolons in a codebase this consistent, and a lint run that
// prints two hundred warnings is a lint run nobody reads.

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/sw.js', 'coverage/**'] },

  {
    // The codebase carries `eslint-disable` comments from before there was a
    // linter to disable. They are harmless, and reporting them would rewrite
    // twenty files that have nothing to do with the problem this config exists
    // for.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,

      // The three that would have caught this week.
      'no-undef': 'error',
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',

      // Hooks: the dependency array is where the temporal dead zone lived.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',

      // An unused import is usually a leftover from a refactor, and this
      // codebase has had a few. A warning, not an error: it never broke a page.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^[A-Z_]',
        ignoreRestSiblings: true,
      }],

      // Style is not this file's business.
      'no-empty': 'off',
      'no-control-regex': 'off',
    },
  },

  {
    files: ['**/__tests__/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
]
