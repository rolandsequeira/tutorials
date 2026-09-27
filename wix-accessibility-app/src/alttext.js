import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You write alt text for images on websites so screen-reader users understand them.
Rules:
- Reply with the alt text only: one sentence, at most 125 characters, no quotes.
- Describe what matters for understanding the page (people, objects, action, visible text, product details).
- Do not start with "Image of", "Picture of" or "Photo of".
- If the image contains readable text (a logo, banner or sign), include that text.
- If the image is purely decorative (a pattern, divider, spacer, blank background), reply exactly: DECORATIVE`;

/** Only images served from Wix's CDN or the site's own domain are captioned. */
export function isAllowedImageUrl(url, siteUrl) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.hostname === 'static.wixstatic.com' || u.hostname.endsWith('.wixstatic.com')) return true;
  if (siteUrl) {
    try {
      const s = new URL(siteUrl);
      const bare = (h) => h.replace(/^www\./, '');
      if (bare(u.hostname) === bare(s.hostname)) return true;
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Wix serves resized variants like
 *   https://static.wixstatic.com/media/abc~mv2.jpg/v1/fill/w_980,h_600,.../file.jpg
 * Normalise to the original media URL so all variants share one cache row,
 * then request a moderate size for the model.
 */
export function normalizeImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'static.wixstatic.com') {
      const m = u.pathname.match(/^\/media\/[^/]+/);
      if (m) return `https://static.wixstatic.com${m[0]}`;
    }
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function modelImageUrl(url) {
  const u = new URL(url);
  if (u.hostname === 'static.wixstatic.com' && /^\/media\/[^/]+$/.test(u.pathname) && !/\.(svg|gif)$/i.test(u.pathname)) {
    return `${url}/v1/fit/w_1024,h_1024,q_85/image.jpg`;
  }
  return url;
}

export function createAltTextService({ repo, cfg, log = console, client }) {
  const anthropic = client || (cfg.anthropicApiKey ? new Anthropic({ apiKey: cfg.anthropicApiKey }) : null);
  let running = false;

  async function describe(url) {
    const response = await anthropic.beta.messages.create({
      model: cfg.altTextModel,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: modelImageUrl(url) } },
          { type: 'text', text: 'Write the alt text for this image.' },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') return { alt: null, error: 'refused' };
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    if (!text) return { alt: null, error: 'empty' };
    if (/^DECORATIVE\.?$/i.test(text)) return { alt: '' };
    return { alt: text.replace(/^["']|["']$/g, '').slice(0, 250) };
  }

  /** Drain the pending queue; runs in the background, one batch at a time. */
  async function processQueue() {
    if (!anthropic || running) return;
    running = true;
    try {
      for (;;) {
        const batch = repo.pendingAlts(cfg.altTextConcurrency);
        if (batch.length === 0) break;
        await Promise.all(batch.map(async (row) => {
          try {
            const { alt, error } = await describe(row.url);
            if (error) repo.setAlt(row.id, null, 'failed', error);
            else repo.setAlt(row.id, alt, 'done');
          } catch (e) {
            const retryable = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError
              || e instanceof Anthropic.APIConnectionError;
            if (retryable) throw e; // leave as pending, stop this run
            log.error('[alt-text]', row.url, e.message);
            repo.setAlt(row.id, null, 'failed', String(e.message).slice(0, 300));
          }
        }));
      }
    } catch (e) {
      log.warn('[alt-text] pausing queue:', e.message);
    } finally {
      running = false;
    }
  }

  return { processQueue, describe, enabled: !!anthropic };
}
