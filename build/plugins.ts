import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './csp.js';
import { TOOLS } from '../src/config/site.js';

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
