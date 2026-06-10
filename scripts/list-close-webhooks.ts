/* eslint-disable no-console */
import * as path from "path"
import { fileURLToPath } from "url"
import * as dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const API_BASE = "https://api.close.com/api/v1"

async function main() {
  const apiKey = process.env.CLOSE_API_KEY
  if (!apiKey) throw new Error("Missing CLOSE_API_KEY")

  const res = await fetch(`${API_BASE}/webhook/`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json))

  for (const hook of json.data ?? []) {
    console.log(
      [
        hook.status,
        hook.id,
        hook.url,
        (hook.events ?? []).map((e: { object_type: string; action: string }) => `${e.object_type}.${e.action}`).join(", "),
        hook.health_status ?? "",
      ].join(" | "),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
