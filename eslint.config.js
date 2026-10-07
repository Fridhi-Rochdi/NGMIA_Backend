/**
 * Backend lint configuration.
 *
 * `npm run lint` existed in package.json but there was no config file, so the
 * command had never actually run — it exited telling you to ask on Discord.
 *
 * The rule set is deliberately small: the things that are bugs (floating
 * promises in a request handler, unused variables hiding a rename that was
 * half-finished) are errors; stylistic preferences are left to the formatter.
 */
const tseslint = require('typescript-eslint');

// The installed ESLint is v8, whose rule registry predates some of the rules
// in @eslint/js v9's recommended set, so that preset is not spread in here.
module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/**', 'coverage/**', '*.js', 'scripts/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'writable',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
      },
    },
    rules: {
      // `any` is pervasive in this codebase's AI-response handling, where the
      // shape genuinely is unknown until parsed. Flagging every one of them
      // would bury the findings that matter.
      '@typescript-eslint/no-explicit-any': 'off',
      // Nest decorators and Prisma payloads both produce unsafe-looking but
      // correct code; the compiler already checks what matters here.
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // An unused binding is usually a rename that was not finished.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Augmenting Express's Request type is what `declare global { namespace
      // Express }` is for; there is no ES-module equivalent.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
);
