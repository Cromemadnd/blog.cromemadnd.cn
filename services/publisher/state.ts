import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"

export class BuildState {
  private db: DatabaseSync

  constructor(filename: string) {
    mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS values_store (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dirty_files (path TEXT PRIMARY KEY, generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  }

  get<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM values_store WHERE key = ?").get(key)
    return row ? (JSON.parse(row.value as string) as T) : undefined
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare("INSERT OR REPLACE INTO values_store (key, value) VALUES (?, ?)")
      .run(key, JSON.stringify(value))
  }

  cached<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM cache WHERE key = ?").get(key)
    return row ? (JSON.parse(row.value as string) as T) : undefined
  }

  cache(key: string, value: unknown): void {
    this.db.prepare("INSERT OR REPLACE INTO cache VALUES (?, ?)").run(key, JSON.stringify(value))
  }

  dirty(filename: string): void {
    this.db
      .prepare(`INSERT INTO dirty_files VALUES (?, 1)
        ON CONFLICT(path) DO UPDATE SET generation = generation + 1`)
      .run(filename)
  }

  pending(): { path: string; generation: number }[] {
    return this.db.prepare("SELECT path, generation FROM dirty_files ORDER BY path").all() as {
      path: string
      generation: number
    }[]
  }

  acknowledge(batch: { path: string; generation: number }[]): void {
    this.db.exec("BEGIN IMMEDIATE")
    try {
      const remove = this.db.prepare("DELETE FROM dirty_files WHERE path = ? AND generation = ?")
      for (const item of batch) remove.run(item.path, item.generation)
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}
