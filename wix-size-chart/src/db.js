import fs from 'node:fs';
import path from 'node:path';
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
CREATE TABLE IF NOT EXISTS events (
  instance_id TEXT NOT NULL,
  day         TEXT NOT NULL,
  name        TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (instance_id, day, name)
);
CREATE TABLE IF NOT EXISTS products (
  instance_id TEXT NOT NULL,
  slug        TEXT NOT NULL,
  info        TEXT,
  fetched_at  INTEGER NOT NULL,
  PRIMARY KEY (instance_id, slug)
);
CREATE TABLE IF NOT EXISTS uploads (
  id          TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  type        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS uploads_site ON uploads (instance_id);
`;

const now = () => new Date().toISOString();
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

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
    settings: { ...DEFAULT_SETTINGS, ...settings },
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
    incEvent: db.prepare(`INSERT INTO events (instance_id, day, name, count) VALUES (?, ?, ?, ?)
      ON CONFLICT(instance_id, day, name) DO UPDATE SET count = count + excluded.count`),
    eventsSince: db.prepare('SELECT day, name, count FROM events WHERE instance_id = ? AND day >= ? ORDER BY day'),
    getProduct: db.prepare('SELECT info, fetched_at FROM products WHERE instance_id = ? AND slug = ?'),
    putProduct: db.prepare(`INSERT INTO products (instance_id, slug, info, fetched_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(instance_id, slug) DO UPDATE SET info = excluded.info, fetched_at = excluded.fetched_at`),
    clearProducts: db.prepare('DELETE FROM products WHERE instance_id = ?'),
    addUpload: db.prepare('INSERT INTO uploads (id, instance_id, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)'),
    getUpload: db.prepare('SELECT * FROM uploads WHERE id = ?'),
    uploadUsage: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM uploads WHERE instance_id = ?'),
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

    recordEvents(id, counts) {
      const day = dayKey();
      db.exec('BEGIN');
      try {
        for (const [name, n] of Object.entries(counts)) q.incEvent.run(id, day, name, n);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    eventsSince: (id, day) => q.eventsSince.all(id, day),

    /** Cached product lookup: {info, fetchedAt} where info is null for "not found". */
    getProduct(id, slug) {
      const row = q.getProduct.get(id, slug);
      if (!row) return null;
      let info = null;
      try { info = row.info ? JSON.parse(row.info) : null; } catch { /* treat as missing */ }
      return { info, fetchedAt: row.fetched_at };
    },
    putProduct: (id, slug, info) => q.putProduct.run(id, slug, info ? JSON.stringify(info) : null, Date.now()),
    clearProducts: (id) => q.clearProducts.run(id),

    addUpload: (uploadId, id, type, bytes) => q.addUpload.run(uploadId, id, type, bytes, now()),
    getUpload: (uploadId) => q.getUpload.get(uploadId) || null,
    uploadUsage: (id) => q.uploadUsage.get(id),
  };
}
