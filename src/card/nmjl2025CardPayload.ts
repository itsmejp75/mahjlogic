import payload from './data/2025-nmjl-card.payload.json'
import { decodeNmjlCardPayload, type NmjlCardPayloadV1 } from './nmjlCardPayloadCrypto'

/** Decoded 2025 NMJL CSV text (never ship the `.csv` into the client bundle). */
export function loadNmjl2025CsvText(): string {
  return decodeNmjlCardPayload(payload as NmjlCardPayloadV1)
}
