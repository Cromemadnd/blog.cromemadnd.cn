import { DatabaseSync } from "node:sqlite"

/** OS-backed SQLite locks disappear on process exit, including SIGKILL and host restart. */
export class PublisherLock {
  private db: DatabaseSync

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    try {
      this.db.exec(
        "PRAGMA busy_timeout = 0; CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE",
      )
    } catch {
      this.db.close()
      throw new Error("Another publisher holds the state directory lock")
    }
  }

  close(): void {
    this.db.exec("ROLLBACK")
    this.db.close()
  }
}
