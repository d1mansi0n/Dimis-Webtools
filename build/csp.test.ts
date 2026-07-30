import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, contentSecurityPolicyHeader } from './csp.js';

const directivesOf = (policy: string): Map<string, string> =>
  new Map(
    policy.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name ?? '', values.join(' ')];
    }),
  );

describe('the meta policy', () => {
  const policy = contentSecurityPolicy('production');
  const directives = directivesOf(policy);

  it('denies everything by default', () => {
    expect(directives.get('default-src')).toBe("'none'");
  });

  it('allows scripts and styles only from this origin', () => {
    expect(directives.get('script-src')).toBe("'self'");
    expect(directives.get('style-src')).toBe("'self'");
  });

  it('never permits inline code or eval', () => {
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  });

  it('keeps workers on this origin, closing the blob: loophole', () => {
    /* The 2.0 Sudoku built its worker from a `blob:` URL made out of inline
       source, which would have required `worker-src blob:` — the same relaxation
       that lets injected script smuggle itself into a worker. */
    expect(directives.get('worker-src')).toBe("'self'");
  });

  it('requires Trusted Types and permits exactly one policy', () => {
    expect(directives.get('require-trusted-types-for')).toBe("'script'");
    /* Must match POLICY_NAME in src/core/trusted-types.ts. */
    expect(directives.get('trusted-types')).toBe('dwt-worker');
  });

  it('forbids base tags, forms, objects and framing', () => {
    expect(directives.get('base-uri')).toBe("'none'");
    expect(directives.get('form-action')).toBe("'none'");
    expect(directives.get('object-src')).toBe("'none'");
    expect(directives.get('frame-src')).toBe("'none'");
  });

  it('omits header-only directives, which a meta tag can only log an error about', () => {
    for (const directive of ['frame-ancestors', 'report-uri', 'report-to', 'sandbox']) {
      expect(policy, directive).not.toContain(directive);
    }
  });

  it('is a single line, so it can sit safely in an HTML attribute', () => {
    expect(policy).not.toMatch(/[\n\r"]/);
  });
});

describe('the header policy', () => {
  it('adds the directives only a header can carry', () => {
    expect(contentSecurityPolicyHeader()).toContain("frame-ancestors 'none'");
  });

  it('otherwise says the same thing as the meta policy', () => {
    const header = directivesOf(contentSecurityPolicyHeader());
    for (const [name, value] of directivesOf(contentSecurityPolicy('production'))) {
      expect(header.get(name), name).toBe(value);
    }
  });
});

describe('the development policy', () => {
  const policy = contentSecurityPolicy('development');

  it("relaxes only what Vite's dev server genuinely needs", () => {
    const directives = directivesOf(policy);
    expect(directives.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(directives.get('connect-src')).toContain('ws:');
  });

  it('still refuses inline and remote scripts, so violations surface while developing', () => {
    expect(directivesOf(policy).get('script-src')).toBe("'self'");
  });

  it('drops Trusted Types, which the dev client cannot satisfy', () => {
    expect(policy).not.toContain('trusted-types');
  });
});
