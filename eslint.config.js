import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * The lint-time half of the Content Security Policy: these stop unsafe DOM sinks
 * from being written at all, so the policy never has to catch them at run time.
 */
const cspSelectors = [
  {
    selector: "CallExpression[callee.name='eval']",
    message: 'eval is blocked by the Content Security Policy.',
  },
  {
    selector: "NewExpression[callee.name='Function']",
    message: 'The Function constructor is blocked by the Content Security Policy.',
  },
  {
    selector:
      "CallExpression[callee.object.name='document'][callee.property.name='write'], CallExpression[callee.object.name='document'][callee.property.name='writeln']",
    message: 'document.write is blocked by Trusted Types.',
  },
];

/**
 * `Intl` formatters are expensive to construct and cheap to reuse — tens of
 * microseconds against well under one. Building one per call is invisible until
 * it happens inside a render loop, where it cost the Recipes list several
 * milliseconds on every tap.
 *
 * `core/format.ts` and `i18n/index.ts` construct them once per locale and cache
 * them; everything else goes through those. The exemption for those two modules
 * is granted below rather than here.
 */
const intlSelector = {
  selector: "NewExpression[callee.object.name='Intl']",
  message:
    'Construct Intl formatters once per locale, not per call. Use the helpers in ' +
    'core/format.ts, or plural() from i18n, and add a cached formatter there if you need a new one.',
};

/** Modules allowed to construct `Intl` objects, because they are what caches them. */
const INTL_OWNERS = ['src/core/format.ts', 'src/i18n/index.ts'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'playwright-report/', 'test-results/'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: {
        /* Both projects are listed explicitly rather than using `projectService`,
           which only discovers the nearest `tsconfig.json` and so cannot see the
           build config, the Playwright specs or anything else outside `src`. */
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* Unused variables are errors, but an underscore prefix is an accepted
         way to say "required by the signature, deliberately ignored". */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      /* Type safety escape hatches have to be argued for in review, not slipped in. */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      /* Correctness rules that have actually bitten this codebase before. */
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-implicit-coercion': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-alert': 'error',
    },
  },

  /* Browser sources. The restricted-syntax rules below are the lint-time half of
     the Content Security Policy: they stop unsafe DOM sinks from being written
     in the first place, so the CSP never has to catch them at runtime. */
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Node globals are not available in the browser bundle.' },
        { name: '__dirname', message: 'Node globals are not available in the browser bundle.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message:
            'innerHTML parses strings as markup and is blocked by Trusted Types. Build nodes with core/dom.ts instead.',
        },
        {
          property: 'outerHTML',
          message: 'outerHTML is blocked by Trusted Types. Build nodes with core/dom.ts instead.',
        },
        {
          property: 'insertAdjacentHTML',
          message:
            'insertAdjacentHTML is blocked by Trusted Types. Build nodes with core/dom.ts instead.',
        },
      ],
      'no-restricted-syntax': ['error', ...cspSelectors, intlSelector],
    },
  },

  /* The two modules that own the formatter caches. They are exempt from the
     `Intl` restriction and from nothing else, so the selectors above are
     re-stated rather than switched off wholesale. */
  {
    files: INTL_OWNERS,
    rules: {
      'no-restricted-syntax': ['error', ...cspSelectors],
    },
  },

  /* Node-side files: build config, plugins, e2e specs. */
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'build/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  /* Tests may reach for the sharper tools when arranging fixtures. */
  {
    files: ['src/**/*.test.ts', 'src/test/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  /* The ESLint config itself is plain JS and has no type information. */
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
