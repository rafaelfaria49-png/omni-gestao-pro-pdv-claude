export interface ScaleChannel {
  reader: ReadableStreamDefaultReader<Uint8Array>
  close(): Promise<void>
}

/** acquire é síncrono: apenas assume um stream já aberto e autorizado pelo chamador. */
export interface ScaleTransport {
  readonly resource: object
  /** Identidades adicionais do mesmo recurso físico/stream, reservadas em conjunto. */
  readonly resources?: readonly object[]
  acquire(): ScaleChannel
}

export interface AlreadyOpenScalePort {
  readonly readable: ReadableStream<Uint8Array> | null
  close(): Promise<void>
}

/** Não pede permissão, não procura portas, não chama port.open nem navigator.serial. */
export function transportForOpenPort(port: AlreadyOpenScalePort): ScaleTransport {
  return {
    resource: port,
    get resources() { return port.readable ? [port, port.readable] : [port] },
    acquire() {
      if (!port.readable) throw new Error("port_has_no_readable_stream")
      return { reader: port.readable.getReader(), close: () => port.close() }
    },
  }
}

export function transportForStream(stream: ReadableStream<Uint8Array>, close = async (): Promise<void> => {}): ScaleTransport {
  return { resource: stream, acquire: () => ({ reader: stream.getReader(), close }) }
}
