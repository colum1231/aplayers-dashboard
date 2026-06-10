import crypto from "crypto"

const MAX_AGE_SEC = 300

export function verifyCloseWebhookSignature(
  rawBody: string,
  sigHash: string | null,
  sigTimestamp: string | null,
  signingKeyHex: string,
): boolean {
  if (!sigHash || !sigTimestamp || !signingKeyHex) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(sigTimestamp, 10))
  if (Number.isNaN(age) || age > MAX_AGE_SEC) return false

  try {
    const key = Buffer.from(signingKeyHex, "hex")
    const expected = crypto
      .createHmac("sha256", key)
      .update(`${sigTimestamp}${rawBody}`)
      .digest("hex")

    if (sigHash.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(sigHash), Buffer.from(expected))
  } catch {
    return false
  }
}
