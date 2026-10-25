PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  renderer_id TEXT NOT NULL,
  manifest_key TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS site_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_release TEXT REFERENCES releases(id)
);
INSERT OR IGNORE INTO site_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS pages (
  release_id TEXT NOT NULL REFERENCES releases(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  layout TEXT NOT NULL,
  unlisted INTEGER NOT NULL,
  artifact_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (release_id, slug)
);

CREATE TABLE IF NOT EXISTS tags (
  release_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (release_id, slug, tag),
  FOREIGN KEY (release_id, slug) REFERENCES pages(release_id, slug)
);
CREATE INDEX IF NOT EXISTS tags_lookup ON tags(release_id, tag);

CREATE TABLE IF NOT EXISTS links (
  release_id TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY (release_id, source, target, kind)
);
CREATE INDEX IF NOT EXISTS backlinks_lookup ON links(release_id, target);
