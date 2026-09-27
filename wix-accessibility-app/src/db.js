import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS } from './plans.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sites (
  instance_id   TEXT PRIMARY KEY,
  site_url      TEXT,
  site_name     TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',
  plan_product  TEXT,
  plan_cycle    TEXT,
  plan_expires  TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  installed_at  TEXT NOT NULL,
  removed_at    TEXT,
  script_embedded INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alt_texts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  url_hash    TEXT NOT NULL,
  url         TEXT NOT NULL,
  alt         TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed | edited
  error       TEXT,
  page_url    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(instance_id, url_hash)
);
CREATE INDEX IF NOT EXISTS idx_alt_pending ON alt_texts(status, created_at);
CREATE TABLE IF NOT EXISTS usage (
  instance_id TEXT NOT NULL,
  month       TEXT NOT NULL,
  metric      TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (instance_id, month, metric)
);
CREATE TABLE IF NOT EXISTS events (
  instance_id TEXT NOT NULL,
  day         TEXT NOT NULL,
  name        TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (instance_id, day, name)
);
CREATE TABLE IF NOT EXISTS audits (
  instance_id TEXT NOT NULL,
  path        TEXT NOT NULL,
  page_url    TEXT NOT NULL,
  score       INTEGER NOT NULL,
  issues      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (instance_id, path)
);
`;

const now = () => new Date().toISOString();
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const hashUrl = (url) => crypto.createHash('sha256').update(url).digest('hex').slice(0, 40);

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return createRepo(db);
}

function rowToSite(row) {
  if (!row) return null;
  let settings = {};
  try { settings = JSON.parse(row.settings); } catch { /* keep defaults */ }
  return {
    instanceId: row.instance_id,
    siteUrl: row.site_url,
    siteName: row.site_name,
    plan: row.plan,
    planProduct: row.plan_product,
    planCycle: row.plan_cycle,
    planExpires: row.plan_expires,
    settings: { ...DEFAULT_SETTINGS, ...settings, autoFix: { ...DEFAULT_SETTINGS.autoFix, ...(settings.autoFix || {}) } },
    installedAt: row.installed_at,
    removedAt: row.removed_at,
    scriptEmbedded: !!row.script_embedded,
    updatedAt: row.updated_at,
  };
}

function createRepo(db) {
  const q = {
    getSite: db.prepare('SELECT * FROM sites WHERE instance_id = ?'),
    insertSite: db.prepare(`INSERT INTO sites (instance_id, settings, installed_at, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(instance_id) DO UPDATE SET removed_at = NULL, updated_at = excluded.updated_at`),
    updateSiteInfo: db.prepare('UPDATE sites SET site_url = COALESCE(?, site_url), site_name = COALESCE(?, site_name), updated_at = ? WHERE instance_id = ?'),
    updatePlan: db.prepare('UPDATE sites SET plan = ?, plan_product = ?, plan_cycle = ?, plan_expires = ?, updated_at = ? WHERE instance_id = ?'),
    updateSettings: db.prepare('UPDATE sites SET settings = ?, updated_at = ? WHERE instance_id = ?'),
    markRemoved: db.prepare('UPDATE sites SET removed_at = ?, script_embedded = 0, updated_at = ? WHERE instance_id = ?'),
    markEmbedded: db.prepare('UPDATE sites SET script_embedded = ?, updated_at = ? WHERE instance_id = ?'),
    paidSites: db.prepare("SELECT instance_id FROM sites WHERE removed_at IS NULL AND plan != 'free'"),

    incUsage: db.prepare(`INSERT INTO usage (instance_id, month, metric, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(instance_id, month, metric) DO UPDATE SET count = count + excluded.count`),
    getUsage: db.prepare('SELECT count FROM usage WHERE instance_id = ? AND month = ? AND metric = ?'),

    incEvent: db.prepare(`INSERT INTO events (instance_id, day, name, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(instance_id, day, name) DO UPDATE SET count = count + excluded.count`),
    eventsSince: db.prepare('SELECT day, name, count FROM events WHERE instance_id = ? AND day >= ? ORDER BY day'),

    getAlts: db.prepare('SELECT url_hash, alt, status FROM alt_texts WHERE instance_id = ? AND url_hash IN (SELECT value FROM json_each(?))'),
    insertAlt: db.prepare(`INSERT OR IGNORE INTO alt_texts (instance_id, url_hash, url, page_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`),
    pendingAlts: db.prepare("SELECT id, instance_id, url FROM alt_texts WHERE status = 'pending' ORDER BY created_at LIMIT ?"),
    setAlt: db.prepare('UPDATE alt_texts SET alt = ?, status = ?, error = ?, updated_at = ? WHERE id = ?'),
    listAlts: db.prepare('SELECT id, url, alt, status, page_url, updated_at FROM alt_texts WHERE instance_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'),
    editAlt: db.prepare("UPDATE alt_texts SET alt = ?, status = 'edited', updated_at = ? WHERE id = ? AND instance_id = ?"),
    countAlts: db.prepare('SELECT status, COUNT(*) AS n FROM alt_texts WHERE instance_id = ? GROUP BY status'),

    upsertAudit: db.prepare(`INSERT INTO audits (instance_id, path, page_url, score, issues, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_id, path) DO UPDATE SET page_url = excluded.page_url, score = excluded.score, issues = excluded.issues, created_at = excluded.created_at`),
    lastAuditAt: db.prepare('SELECT created_at FROM audits WHERE instance_id = ? AND path = ?'),
    listAudits: db.prepare('SELECT path, page_url, score, issues, created_at FROM audits WHERE instance_id = ? ORDER BY score ASC LIMIT 200'),
  };

  return {
    db,
    getSite: (id) => rowToSite(q.getSite.get(id)),
    ensureSite(id) {
      const t = now();
      q.insertSite.run(id, JSON.stringify(DEFAULT_SETTINGS), t, t);
      return rowToSite(q.getSite.get(id));
    },
    updateSiteInfo: (id, { siteUrl = null, siteName = null }) => q.updateSiteInfo.run(siteUrl, siteName, now(), id),
    updatePlan: (id, { plan, product = null, cycle = null, expires = null }) =>
      q.updatePlan.run(plan, product, cycle, expires, now(), id),
    updateSettings: (id, settings) => q.updateSettings.run(JSON.stringify(settings), now(), id),
    markRemoved: (id) => { const t = now(); q.markRemoved.run(t, t, id); },
    markEmbedded: (id, v) => q.markEmbedded.run(v ? 1 : 0, now(), id),
    paidSiteIds: () => q.paidSites.all().map((r) => r.instance_id),

    incUsage: (id, metric, n = 1) => q.incUsage.run(id, monthKey(), metric, n),
    getUsage: (id, metric) => q.getUsage.get(id, monthKey(), metric)?.count || 0,

    recordEvents(id, counts) {
      const day = dayKey();
      db.exec('BEGIN');
      try {
        for (const [name, n] of Object.entries(counts)) q.incEvent.run(id, day, name, n);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    eventsSince: (id, day) => q.eventsSince.all(id, day),

    /** Returns {hash: {alt,status}} for the requested hashes. */
    getAlts(id, hashes) {
      const out = {};
      for (const r of q.getAlts.all(id, JSON.stringify(hashes))) out[r.url_hash] = { alt: r.alt, status: r.status };
      return out;
    },
    queueAlt: (id, hash, url, pageUrl) => q.insertAlt.run(id, hash, url, pageUrl, now(), now()).changes > 0,
    pendingAlts: (limit) => q.pendingAlts.all(limit),
    setAlt: (rowId, alt, status, error = null) => q.setAlt.run(alt, status, error, now(), rowId),
    listAlts: (id, limit = 50, offset = 0) => q.listAlts.all(id, limit, offset),
    editAlt: (id, rowId, alt) => q.editAlt.run(alt, now(), rowId, id).changes > 0,
    altCounts(id) {
      const out = { pending: 0, done: 0, failed: 0, edited: 0 };
      for (const r of q.countAlts.all(id)) out[r.status] = r.n;
      return out;
    },

    saveAudit: (id, p, pageUrl, score, issues) => q.upsertAudit.run(id, p, pageUrl, score, JSON.stringify(issues), now()),
    lastAuditAt: (id, p) => q.lastAuditAt.get(id, p)?.created_at || null,
    listAudits: (id) => q.listAudits.all(id).map((r) => ({ ...r, issues: JSON.parse(r.issues) })),
  };
}
