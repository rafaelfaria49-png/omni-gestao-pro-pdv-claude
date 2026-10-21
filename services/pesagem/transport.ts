export interface ScaleChannel {
  reader: ReadableStreamDefaultReader<Uint8Array>
  close(): Promise<void>
}

/** acquire é síncrono: apenas assume um stream já aberto e autorizado pelo chamador. */
export interface ScaleTransport {
  readonly resource: object
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
    acquire() {
      if (!port.readable) throw new Error("port_has_no_readable_stream")
      return { reader: port.readable.getReader(), close: () => port.close() }
    },
  }
}

export function transportForStream(stream: ReadableStream<Uint8Array>, close = async (): Promise<void> => {}): ScaleTransport {
  return { resource: stream, acquire: () => ({ reader: stream.getReader(), close }) }
}
