import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import {
  assertBundleBudget,
  assertNoInlineCode,
  securityMeta,
  serviceWorkerManifest,
} from './build/plugins.js';
import { TOOLS } from './src/config/site.js';

const here = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Deployment base path.
 *
 * On GitHub Pages this project is served from `/<repo>/`, so the default matches
 * the repository name. CI (or a custom domain) can override it with `BASE_PATH`.
 */
const DEPLOY_BASE = process.env['BASE_PATH'] ?? '/Dimis-Webtools/';

export default defineConfig(({ command, isPreview }) => {
  /*
   * `vite preview` reports `command: 'serve'` even though it serves the built
   * output, so testing `command` alone made preview host the bundle at `/` while
   * the HTML inside it pointed at `/Dimis-Webtools/` — every asset 404'd. The
   * end-to-end tests run against preview, so this distinction is load-bearing.
   */
  const servingBuiltOutput = command === 'build' || isPreview === true;
  const base = servingBuiltOutput ? DEPLOY_BASE : '/';

  return {
    base,

    plugins: [
      securityMeta(),
      assertNoInlineCode(),
      assertBundleBudget(),
      serviceWorkerManifest(base),
    ],

    build: {
      target: 'es2022',
      sourcemap: true,

      /* Inlining assets would produce `data:` URLs, which the CSP refuses on
         purpose. Keeping every asset as a real file lets `img-src`/`font-src`
         stay at 'self'. */
      assetsInlineLimit: 0,

      /* Vite's module-preload polyfill is an inline script, which the CSP blocks.
         Every browser this project targets supports modulepreload natively. */
      modulePreload: { polyfill: false },

      rollupOptions: {
        input: {
          hub: here('index.html'),
          ...Object.fromEntries(TOOLS.map((tool) => [tool.id, here(`${tool.id}/index.html`)])),
          /* The service worker is an entry of its own so Rollup bundles it like
             any other module. */
          sw: here('src/sw.ts'),
        },
        output: {
          /*
           * The worker needs a stable, unhashed name at the deployment root: its
           * URL is what a browser records as the registration, and its scope is
           * the directory it is served from, so a hashed name under `assets/`
           * could control nothing above itself.
           */
          entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        },
      },
    },

    worker: {
      format: 'es',
    },

    test: {
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/test/**',
          'src/config/**',

          /* The modules below are exercised by the Playwright suite instead, and
             counting them here would only make the number less informative:

             - `main.ts` files are DOM wiring, asserted end to end;
             - `src/shell/**` composes the app bar, theme and dialogs, likewise;
             - `*.worker.ts` runs in a Worker, which jsdom does not provide;
             - `sw.ts` is a service worker, so it needs a
               `ServiceWorkerGlobalScope`, the Cache API and real `fetch`
               interception; `e2e/offline.spec.ts` covers it by cutting the
               network for real, which is the only test that means anything here;
             - `render.ts` draws on a 2D canvas, also absent from jsdom;
             - `trusted-types.ts` needs the browser Trusted Types API, and the
               e2e CSP test is what proves the policy actually works. */
          'src/**/main.ts',
          'src/shell/**',
          'src/**/*.worker.ts',
          'src/sw.ts',
          'src/tools/counter/render.ts',
          'src/core/trusted-types.ts',
        ],
        thresholds: {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },
  };
});
