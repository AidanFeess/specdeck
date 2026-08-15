// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // `.claude/` holds tool-generated files and, when an agent is working, a git
    // worktree containing a whole second copy of this repository. Linting that
    // copy reports errors against files that are not this checkout's source.
    // `src/client/generated/` is the built client document, which is minified.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.claude/**', 'src/client/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused variables are an error, but an underscore prefix opts out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Subprocess and filesystem work is async throughout. A dropped promise
      // here means a silently missed filesystem event, which is the failure
      // mode this project can least afford.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // Parsed markdown and JSON arrive untyped. Force explicit narrowing
      // rather than letting `any` spread through the read model.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',

      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The CLI is the one place that legitimately writes to stdout.
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The client is plain JavaScript, bundled rather than compiled, so it is not
    // part of the type-checked project.
    //
    // `no-undef` is the rule that earns its keep here. The client was split out
    // of one 1,500-line scope where every function could see every other; with
    // real modules, a reference that was not imported becomes an undefined
    // global that no type check and no bundler would catch, and that only fails
    // in a browser. This is the net under that.
    files: ['src/client/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { projectService: false, project: null },
      globals: { ...globals.browser, ...globals.vitest },
    },
    rules: {
      'no-undef': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],

      // `x == null` is the deliberate "null or undefined" idiom throughout the
      // client. Rewriting it to `===` would silently change what these checks
      // match, so the null case is exempt rather than the rule being dropped.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Storage access is wrapped in try/catch because a browser with storage
      // disabled throws on read. There is nothing to do about it and nothing
      // useful to log, so the empty catch is the honest handler.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Build and maintenance scripts run against the compiled output rather than
    // the source tree, so they sit outside the type-checked project.
    files: ['**/*.mjs', 'scripts/**', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: null },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
