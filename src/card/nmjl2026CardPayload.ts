import payload from './data/2026-nmjl-card.payload.json'
import { decodeNmjlCardPayload, type NmjlCardPayloadV1 } from './nmjlCardPayloadCrypto'

/** Decoded 2026 NMJL CSV text (never ship the `.csv` into the client bundle). */
export function loadNmjl2026CsvText(): string {
  return decodeNmjlCardPayload(payload as NmjlCardPayloadV1)
}
