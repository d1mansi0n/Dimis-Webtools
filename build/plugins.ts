import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { OutputChunk } from 'rollup';
import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './csp.js';
import { PAGES, TOOLS } from '../src/config/site.js';

/**
 * Injects the security meta tags into every page.
 *
 * Doing this in the build rather than by hand in six HTML files means the policy
 * cannot drift between pages, and a change to `csp.ts` is guaranteed to reach
 * all of them.
 */
export function securityMeta(): Plugin {
  return {
    name: 'dwt:security-meta',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const mode = ctx.server ? 'development' : 'production';
        const policy = contentSecurityPolicy(mode);

        /* The policy is quoted with double quotes and contains only single
           quotes, so it needs no escaping. */
        const meta =
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n` +
          // Nothing here should ever leak a URL to a third party, and there is
          // no third party to leak it to. Send no referrer at all.
          `    <meta name="referrer" content="no-referrer" />`;

        /* Inserted immediately after `<meta charset>` rather than before it: the
           character encoding has to be declared within the first 1024 bytes of
           the document, and the policy is long enough to make that a real
           constraint. It still lands ahead of every script and stylesheet, which
           is what the policy needs in order to govern them. */
        const charset = /<meta[^>]+charset=[^>]*>/i.exec(html);
        if (charset !== null) {
          const at = charset.index + charset[0].length;
          return `${html.slice(0, at)}\n    ${meta}${html.slice(at)}`;
        }

        return html.replace(/<head>/i, `<head>\n    ${meta}`);
      },
    },
  };
}

/**
 * Emits a redirect stub at each URL the old site used.
 *
 * The 1.0/2.0 files (`SDK-v2.html`, `rcc-index.html`, …) were live URLs that
 * people may have bookmarked. Rather than breaking them, every old path gets a
 * tiny page that forwards to the tool's new home. The stubs contain no inline
 * script — a `<meta http-equiv="refresh">` plus a real link works with the
 * strict CSP and without JavaScript.
 */
export function legacyRedirects(base: string): Plugin {
  return {
    name: 'dwt:legacy-redirects',
    apply: 'build',
    generateBundle() {
      for (const tool of TOOLS) {
        const target = `${base}${tool.id}/`;
        for (const legacyPath of tool.legacyPaths) {
          this.emitFile({
            type: 'asset',
            fileName: legacyPath,
            source: redirectPage(target),
          });
        }
      }
    },
  };
}

function redirectPage(target: string): string {
  const escaped = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${escaped}" />
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="${escaped}" />
    <title>Moved</title>
  </head>
  <body>
    <p>This tool has moved to <a href="${escaped}">${escaped}</a>.</p>
  </body>
</html>
`;
}

/**
 * Fails the build if any inline script or style survives into the output.
 *
 * The Content Security Policy forbids both, so an inline block would not merely
 * be untidy — it would be silently dead on the deployed site. Catching it here
 * turns a class of runtime breakage into a build error.
 */
export function assertNoInlineCode(): Plugin {
  const inlineScript = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i;
  const inlineStyle = /<style[^>]*>[\s\S]*?<\/style>/i;
  const styleAttribute = /<[^>]+\sstyle\s*=\s*["']/i;

  return {
    name: 'dwt:assert-no-inline-code',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.endsWith('.html') || output.type !== 'asset') continue;
        const html = String(output.source);
        for (const [pattern, what] of [
          [inlineScript, 'an inline <script> block'],
          [inlineStyle, 'an inline <style> block'],
          [styleAttribute, 'an inline style attribute'],
        ] as const) {
          if (pattern.test(html)) {
            this.error(
              `${fileName} contains ${what}, which the Content Security Policy blocks. ` +
                `Move it into a module or a stylesheet.`,
            );
          }
        }
      }
    },
  };
}

/**
 * Fills in the service worker's precache list once the real filenames exist.
 *
 * The manifest cannot be written by hand or injected with Vite's `define`: every
 * asset carries a content hash that is only decided when Rollup emits it, which
 * is after any transform has run. So the worker ships two placeholder literals
 * and this replaces them in the emitted chunk.
 *
 * Source maps are excluded on purpose — they exist for debugging and would
 * roughly triple what every visitor downloads on first load — as are the legacy
 * redirect stubs, which only matter to someone following an old bookmark and are
 * useless without a network anyway.
 */
export function serviceWorkerManifest(base: string): Plugin {
  return {
    name: 'dwt:service-worker-manifest',
    apply: 'build',
    /* After the budget check, so the worker is weighed as written rather than
       with a few kilobytes of filenames pasted into it. */
    enforce: 'post',
    generateBundle(_options, bundle) {
      const worker = bundle['sw.js'];
      if (worker?.type !== 'chunk') {
        this.error(
          'The service worker chunk (sw.js) is missing, so its precache manifest ' +
            'cannot be filled in. Check the `sw` entry in vite.config.ts.',
        );
      }

      /* Pages are listed as the directory URLs a navigation actually requests
         (`/base/recipes/`), not as `recipes/index.html`. */
      const pages = PAGES.map((path) => `${base}${path}`);

      const assets = Object.keys(bundle)
        .filter(
          (fileName) =>
            fileName !== 'sw.js' &&
            !fileName.endsWith('.map') &&
            !fileName.endsWith('.html') &&
            !TOOLS.some((tool) => tool.legacyPaths.includes(fileName)),
        )
        .map((fileName) => `${base}${fileName}`);

      const manifest = [...pages, ...assets].sort();
      const version = createHash('sha256').update(manifest.join('\n')).digest('hex').slice(0, 12);

      const before = worker.code;
      worker.code = worker.code
        .replace('"__PRECACHE_MANIFEST__"', JSON.stringify(manifest))
        .replace("'__PRECACHE_MANIFEST__'", JSON.stringify(manifest))
        .replace('"__CACHE_VERSION__"', JSON.stringify(`dwt-${version}`))
        .replace("'__CACHE_VERSION__'", JSON.stringify(`dwt-${version}`));

      /* A silent no-op here would ship a worker that caches nothing and reports
         no error, which is the worst of both worlds. */
      if (worker.code === before) {
        this.error(
          'The service worker placeholders were not found in the emitted chunk. ' +
            'Minification may have altered them; check src/sw.ts.',
        );
      }

      this.info(`service worker precaches ${String(manifest.length)} URLs (dwt-${version})`);
    },
  };
}

/**
 * Gzipped bytes each page is allowed to ship, counting its entry chunk, every
 * chunk it imports, and its stylesheets.
 *
 * These are ratchets, not targets. Each was set with roughly a quarter of
 * headroom over the real figure at the time, so ordinary work does not trip
 * them; a build that exceeds one means something arrived that nobody weighed —
 * a heavy import, a library, or dead code the bundler could not drop. Raising a
 * number is a fine outcome, but it should be a decision someone made, which is
 * the entire point of failing the build rather than printing a warning.
 *
 * Every entry needs a line here. A new tool with no budget fails the build,
 * which is deliberate: choosing the weight of a page is part of adding one.
 *
 * The Sudoku worker is not covered. Vite builds workers in a separate pass with
 * its own plugin list, so it never reaches this bundle; it is also fetched on
 * demand rather than with the page, so it does not belong in a page's total.
 */
const PAGE_BUDGETS: Readonly<Record<string, number>> = {
  hub: 19_000,
  rice: 19_500,
  sugar: 22_000,
  counter: 23_500,
  time: 27_500,
  sudoku: 28_000,
  recipes: 32_500,
  /* Not a page, but every visitor downloads and runs it, so it is weighed on the
     same terms. It is measured before its precache manifest is pasted in — see
     `serviceWorkerManifest`, which runs after this — so the number reflects the
     code rather than the length of the filenames it happens to list. */
  sw: 2_500,
};

/**
 * Fails the build when a page grows past its budget.
 *
 * The site's whole performance story is that it ships very little; without a
 * number attached, that stays true only for as long as everyone remembers it is
 * supposed to. This is the check that noticed 139 regular expressions being
 * compiled and thrown away on every visit to the Recipes page.
 */
export function assertBundleBudget(): Plugin {
  return {
    name: 'dwt:assert-bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = new Map<string, OutputChunk>();
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') chunks.set(output.fileName, output);
      }

      const gzipped = (source: string | Uint8Array): number => gzipSync(source).length;

      /** An entry plus everything it pulls in, following imports transitively. */
      const weigh = (entry: OutputChunk): { total: number; css: readonly string[] } => {
        const seen = new Set<string>();
        const css = new Set<string>();
        let total = 0;

        const visit = (fileName: string): void => {
          if (seen.has(fileName)) return;
          seen.add(fileName);
          const chunk = chunks.get(fileName);
          if (chunk === undefined) return;

          total += gzipped(chunk.code);
          /* Vite records the stylesheets a chunk pulls in here; they are fetched
             with the page, so they count against the same budget. */
          for (const sheet of chunk.viteMetadata?.importedCss ?? []) css.add(sheet);
          for (const imported of chunk.imports) visit(imported);
        };

        visit(entry.fileName);

        for (const sheet of css) {
          const asset = bundle[sheet];
          if (asset?.type === 'asset') total += gzipped(asset.source);
        }
        return { total, css: [...css] };
      };

      const report: string[] = [];
      for (const chunk of chunks.values()) {
        if (!chunk.isEntry) continue;

        const name = chunk.name;
        const budget = PAGE_BUDGETS[name];
        if (budget === undefined) {
          this.error(
            `The entry "${name}" has no size budget. Add one to PAGE_BUDGETS in ` +
              `build/plugins.ts — deciding what a new page may weigh is part of adding it.`,
          );
        }

        const { total } = weigh(chunk);
        report.push(`${name}: ${String(total)} / ${String(budget)} B gzip`);

        if (total > budget) {
          this.error(
            `The "${name}" page ships ${String(total)} bytes gzipped, over its ` +
              `${String(budget)} byte budget. Find what grew, or raise the budget in ` +
              `build/plugins.ts if the growth is justified.`,
          );
        }
      }

      this.info(`page weight — ${report.sort().join(', ')}`);
    },
  };
}
