import { AwsClient } from "aws4fetch"
import type { ObjectRef } from "../../shared/artifact"
import type { PublishTarget, QueryResult, SqlStatement } from "./target"

export interface CloudflareOptions {
  accountId: string
  databaseId: string
  apiToken: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export class CloudflareTarget implements PublishTarget {
  private aws: AwsClient

  constructor(private options: CloudflareOptions) {
    for (const [key, value] of Object.entries(options))
      if (!value) throw new Error(`Missing Cloudflare setting: ${key}`)
    this.aws = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: "s3",
      region: "auto",
    })
  }

  async query<T = Record<string, unknown>>(statement: SqlStatement): Promise<QueryResult<T>> {
    return (await this.request(statement))[0] as QueryResult<T>
  }

  batch(statements: SqlStatement[]): Promise<QueryResult[]> {
    return this.request({ batch: statements })
  }

  private async request(body: SqlStatement | { batch: SqlStatement[] }): Promise<QueryResult[]> {
    const { accountId, databaseId, apiToken } = this.options
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      },
    )
    const result = (await response.json()) as {
      success: boolean
      errors?: { message: string }[]
      result?: (QueryResult & { success?: boolean; error?: string })[]
    }
    if (
      !response.ok ||
      !result.success ||
      !result.result ||
      result.result.some((item) => item.success === false)
    ) {
      throw new Error(
        `D1 request failed (${response.status}): ${result.errors?.map((item) => item.message).join(", ") ?? result.result?.find((item) => item.error)?.error ?? "unknown error"}`,
      )
    }
    return result.result
  }

  async putObject(ref: ObjectRef, bytes: Uint8Array): Promise<boolean> {
    const { accountId, bucket } = this.options
    const url = `https://${accountId}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${ref.key.split("/").map(encodeURIComponent).join("/")}`
    const existing = await this.aws.fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(60_000),
    })
    if (existing.ok) {
      if (
        Number(existing.headers.get("content-length")) !== ref.size ||
        existing.headers.get("x-amz-meta-sha256") !== ref.hash
      ) {
        throw new Error(`R2 object integrity check failed: ${ref.key}`)
      }
      return false
    }
    if (existing.status !== 404) throw new Error(`R2 HEAD failed (${existing.status})`)
    const response = await this.aws.fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": ref.contentType,
        "If-None-Match": "*",
        "x-amz-meta-sha256": ref.hash,
      },
      body: new Uint8Array(bytes).buffer,
      signal: AbortSignal.timeout(120_000),
    })
    if (response.status === 412) return this.putObject(ref, bytes)
    if (!response.ok) throw new Error(`R2 upload failed (${response.status}): ${ref.key}`)
    return true
  }
}
