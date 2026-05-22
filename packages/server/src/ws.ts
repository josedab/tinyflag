import { createHash } from 'crypto';
import { Server, IncomingMessage } from 'http';
import { Socket } from 'net';
import { EventEmitter } from 'events';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5DC11AD09';

/**
 * Minimal WebSocket implementation built on Node.js http module.
 * No external dependencies — just enough for real-time flag push.
 */
export class WebSocket extends EventEmitter {
  readyState: number = 1; // OPEN
  private socket: Socket;

  constructor(socket: Socket) {
    super();
    this.socket = socket;

    socket.on('data', (data) => {
      try {
        const frame = decodeFrame(data);
        if (frame.opcode === 0x08) {
          this.readyState = 3; // CLOSED
          this.emit('close');
          socket.end();
          return;
        }
        if (frame.opcode === 0x09) {
          // Ping — reply with Pong
          this.sendFrame(0x0a, frame.payload);
          return;
        }
        if (frame.payload.length > 0) {
          this.emit('message', frame.payload.toString('utf-8'));
        }
      } catch {
        // Ignore malformed frames
      }
    });

    socket.on('close', () => {
      this.readyState = 3;
      this.emit('close');
    });

    socket.on('error', () => {
      this.readyState = 3;
      this.emit('close');
    });
  }

  send(data: string): void {
    if (this.readyState !== 1) return;
    this.sendFrame(0x01, Buffer.from(data, 'utf-8'));
  }

  close(): void {
    this.readyState = 2; // CLOSING
    this.sendFrame(0x08, Buffer.alloc(0));
    this.socket.end();
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    const length = payload.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode;
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.readyState = 3;
    }
  }
}

export class WebSocketServer extends EventEmitter {
  constructor(server: Server) {
    super();
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      const accept = createHash('sha1')
        .update(key + WS_MAGIC)
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          '\r\n',
      );

      const ws = new WebSocket(socket);
      this.emit('connection', ws, req);
    });
  }
}

function decodeFrame(data: Buffer): { opcode: number; payload: Buffer } {
  const opcode = data[0] & 0x0f;
  const masked = (data[1] & 0x80) !== 0;
  let payloadLength = data[1] & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    payloadLength = data.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    payloadLength = Number(data.readBigUInt64BE(2));
    offset = 10;
  }

  let payload: Buffer;
  if (masked) {
    const mask = data.subarray(offset, offset + 4);
    offset += 4;
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = data[offset + i] ^ mask[i % 4];
    }
  } else {
    payload = data.subarray(offset, offset + payloadLength);
  }

  return { opcode, payload };
}
