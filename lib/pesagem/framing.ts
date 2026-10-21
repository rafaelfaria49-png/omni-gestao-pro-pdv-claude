export type Frame = { kind: "line"; line: string } | { kind: "invalid"; detail: string }

/** ASCII delimitado por LF/CRLF, limitado e sem reinterpretar sufixo de linha corrompida. */
export class AsciiLineFramer {
  private buffer = ""
  private discarding = false

  constructor(private readonly maxLineBytes = 256) {
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1 || maxLineBytes > 65536) {
      throw new Error("invalid_max_line_bytes")
    }
  }

  get pending(): boolean { return this.buffer.length > 0 }

  /** Fragmento vencido também é descartado até LF; seu sufixo nunca vira outra linha. */
  discardPending(): void {
    if (this.pending) {
      this.buffer = ""
      this.discarding = true
    }
  }

  push(bytes: Uint8Array): Frame[] {
    const frames: Frame[] = []
    for (const byte of bytes) {
      if (byte === 10) {
        if (!this.discarding) frames.push({ kind: "line", line: this.buffer.replace(/\r$/, "") })
        this.reset()
      } else if (!this.discarding) {
        if (this.buffer.endsWith("\r")) {
          frames.push({ kind: "invalid", detail: "unexpected_carriage_return" })
          this.buffer = ""
          this.discarding = true
        } else if (byte > 127 || (byte < 32 && byte !== 13 && byte !== 9)) {
          frames.push({ kind: "invalid", detail: "non_ascii_or_control_byte" })
          this.buffer = ""
          this.discarding = true
        } else if (this.buffer.length === this.maxLineBytes) {
          frames.push({ kind: "invalid", detail: "line_too_long" })
          this.buffer = ""
          this.discarding = true
        } else this.buffer += String.fromCharCode(byte)
      }
    }
    return frames
  }

  reset(): void {
    this.buffer = ""
    this.discarding = false
  }
}
