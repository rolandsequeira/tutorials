import crypto from 'node:crypto';

const WIX_API = 'https://www.wixapis.com';

const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Verify the signed `instance` query parameter Wix appends to dashboard
 * iframe URLs: "<base64url HMAC-SHA256(payload, appSecret)>.<base64url JSON payload>".
 * Returns the decoded payload or null.
 */
export function verifySignedInstance(signed, appSecret) {
  if (!signed || !appSecret || typeof signed !== 'string') return null;
  const dot = signed.indexOf('.');
  if (dot <= 0) return null;
  const sig = b64urlDecode(signed.slice(0, dot));
  const payloadB64 = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', appSecret).update(payloadB64).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
    if (!payload.instanceId) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Helper for tests / dev: produce a signed instance string. */
export function signInstance(payload, appSecret) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', appSecret).update(p).digest('base64url');
  return `${s}.${p}`;
}

/**
 * Verify a Wix webhook body (an RS256 JWT signed with the app's key) and
 * unwrap the nested JSON. Returns {eventType, instanceId, data} or throws.
 */
export function verifyWebhook(jwt, publicKeyPem) {
  if (!publicKeyPem) throw new Error('WIX_PUBLIC_KEY not configured');
  const parts = String(jwt).trim().split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');
  const [h, p, s] = parts;
  const header = JSON.parse(b64urlDecode(h).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error(`Unexpected alg ${header.alg}`);
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKeyPem, b64urlDecode(s));
  if (!ok) throw new Error('Bad webhook signature');
  const claims = JSON.parse(b64urlDecode(p).toString('utf8'));
  if (claims.exp && claims.exp * 1000 < Date.now() - 60_000) throw new Error('Webhook expired');
  const outer = typeof claims.data === 'string' ? JSON.parse(claims.data) : claims.data;
  let data = outer?.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* leave string */ } }
  return { eventType: outer?.eventType, instanceId: outer?.instanceId, data: data || {} };
}

/** Thin REST client for the handful of Wix APIs the app needs. */
export function createWixClient(cfg, fetchImpl = globalThis.fetch) {
  const tokenCache = new Map(); // instanceId -> {token, exp}

  async function accessToken(instanceId) {
    const cached = tokenCache.get(instanceId);
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    const res = await fetchImpl(`${WIX_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: cfg.wixAppId,
        client_secret: cfg.wixAppSecret,
        instance_id: instanceId,
      }),
    });
    if (!res.ok) throw new Error(`Wix token error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const token = json.access_token;
    tokenCache.set(instanceId, { token, exp: Date.now() + (Number(json.expires_in) || 14400) * 1000 });
    return token;
  }

  async function call(instanceId, method, urlPath, body) {
    const token = await accessToken(instanceId);
    const res = await fetchImpl(`${WIX_API}${urlPath}`, {
      method,
      headers: { authorization: token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Wix ${method} ${urlPath} -> ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  return {
    accessToken,
    /** GET App Instance: site info + billing (source of truth for the plan). */
    getAppInstance: (instanceId) => call(instanceId, 'GET', '/apps/v1/instance'),
    /** Activate the embedded script extension with the instanceId parameter. */
    embedScript: (instanceId) =>
      call(instanceId, 'POST', '/apps/v1/scripts', { properties: { parameters: { instanceId } } }),
    upgradeUrl: (instanceId) =>
      `https://www.wix.com/apps/upgrade/${encodeURIComponent(cfg.wixAppId)}?appInstanceId=${encodeURIComponent(instanceId)}`,
  };
}
