import { Whop } from "@whop/sdk"

export const whopsdk = new Whop({
  apiKey: process.env.WHOP_API_KEY ?? "",
  webhookKey: Buffer.from(process.env.WHOP_WEBHOOK_SECRET ?? "", "utf8").toString("base64"),
})
