import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader so the app runs without extra dependencies.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env'));

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function loadConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const cfg = {
    port: Number(env.PORT || 8080),
    baseUrl: (env.BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),
    dbPath: env.DB_PATH || './data/app.db',
    appName: env.APP_NAME || 'LumAccess',
    companyName: env.COMPANY_NAME || 'Coders Creation',
    // Public marketing page for the app ("Powered by" links here) and the page for consulting orders.
    landingUrl: (env.LANDING_URL || 'https://coderscreation.com/').trim(),
    servicesUrl: (env.SERVICES_URL || env.LANDING_URL || 'https://coderscreation.com/').trim(),
    wixAppId: env.WIX_APP_ID || '',
    wixAppSecret: env.WIX_APP_SECRET || '',
    wixPublicKey: (env.WIX_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
    wixPlanMap: parseJson(env.WIX_PLAN_MAP, {}),
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    altTextModel: env.ALT_TEXT_MODEL || 'claude-opus-5',
    altTextConcurrency: Math.max(1, Number(env.ALT_TEXT_CONCURRENCY || 2)),
    devMode: env.DEV_MODE === '1' || env.DEV_MODE === 'true',
  };
  if (!cfg.devMode && !cfg.wixAppSecret) {
    console.warn('[config] WIX_APP_SECRET is not set - dashboard authentication will reject all requests.');
  }
  return cfg;
}
