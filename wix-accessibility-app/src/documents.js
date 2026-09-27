import zlib from 'node:zlib';

// PDF accessibility check: is the document tagged (structure tree + MarkInfo),
// does it declare a language and a title? These are the first things
// PDF/UA and WCAG ask for; untagged PDFs are unreadable for many screen readers.

const MAX_BYTES = 15 * 1024 * 1024;
const DOC_HOSTS = [/(^|\.)wixstatic\.com$/, /(^|\.)filesusr\.com$/, /(^|\.)usrfiles\.com$/];
const bare = (h) => h.toLowerCase().replace(/^www\./, '');

export function isAllowedDocUrl(url, siteUrl) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password || u.port) return false;
  if (DOC_HOSTS.some((re) => re.test(u.hostname))) return true;
  if (siteUrl) {
    try { if (bare(u.hostname) === bare(new URL(siteUrl).hostname)) return true; } catch { /* ignore */ }
  }
  return false;
}

/** Fetch with manual redirects (each hop re-checked against the allowlist) and a size cap. */
async function safeFetchPdf(url, siteUrl, fetchImpl) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedDocUrl(current, siteUrl)) throw new Error('host_not_allowed');
    const res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('too_large');
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new Error('too_large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }
  throw new Error('too_many_redirects');
}

/** Inspect raw PDF bytes. Object streams are inflated so compressed catalogs are seen too. */
export function analyzePdf(buf) {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { status: 'error', detail: { reason: 'not_pdf' } };
  const raw = buf.toString('latin1');
  let hay = raw;
  const re = /stream\r?\n/g;
  let m;
  let inflated = 0;
  while ((m = re.exec(raw)) && inflated < 200) {
    const dictStart = Math.max(0, m.index - 400);
    const dict = raw.slice(dictStart, m.index);
    if (!/\/ObjStm|\/Type\s*\/Catalog|\/Metadata|\/XML/.test(dict) || !/\/FlateDecode/.test(dict)) continue;
    const end = raw.indexOf('endstream', m.index);
    if (end === -1) break;
    try {
      hay += '\n' + zlib.inflateSync(buf.subarray(m.index + m[0].length, end)).toString('latin1');
      inflated++;
    } catch { /* partial or unsupported stream */ }
  }
  const detail = {
    tagged: /\/StructTreeRoot/.test(hay) && /\/MarkInfo\s*<<[^>]*\/Marked\s*true/.test(hay),
    hasStructure: /\/StructTreeRoot/.test(hay),
    lang: /\/Lang\s*\(/.test(hay),
    title: /\/DisplayDocTitle\s*true/.test(hay) || /<dc:title>/.test(hay),
    encrypted: /\/Encrypt\s/.test(raw),
    pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || null,
  };
  return { status: detail.tagged ? 'tagged' : 'untagged', detail };
}

export function createDocumentService({ repo, log = console, fetchImpl = globalThis.fetch }) {
  let running = false;
  async function processQueue() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const batch = repo.pendingDocuments(3);
        if (!batch.length) break;
        for (const doc of batch) {
          try {
            const buf = await safeFetchPdf(doc.url, doc.site_url, fetchImpl);
            const result = analyzePdf(buf);
            repo.setDocument(doc.instance_id, doc.url_hash, result.status, result.detail);
          } catch (e) {
            repo.setDocument(doc.instance_id, doc.url_hash, 'error', { reason: String(e.message || e).slice(0, 80) });
          }
        }
      }
    } catch (e) {
      log.error('[documents]', e);
    } finally {
      running = false;
    }
  }
  return { processQueue };
}
