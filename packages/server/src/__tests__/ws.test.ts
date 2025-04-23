import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket, WebSocketServer } from '../ws.js';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Server } from 'http';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5DC11AD09';

function createMockSocket() {
  const socket = new EventEmitter() as any;
  socket.write = vi.fn();
  socket.end = vi.fn();
  socket.destroy = vi.fn();
  return socket;
}

function encodeTextFrame(data: string, masked = false): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const length = payload.length;
  let header: Buffer;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = (masked ? 0x80 : 0) | length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = (masked ? 0x80 : 0) | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = (masked ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  if (masked) {
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const maskedPayload = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      maskedPayload[i] = payload[i] ^ mask[i % 4];
    }
    return Buffer.concat([header, mask, maskedPayload]);
  }

  return Buffer.concat([header, payload]);
}

function encodeCloseFrame(): Buffer {
  const header = Buffer.alloc(2);
  header[0] = 0x88; // FIN + close opcode
  header[1] = 0;
  return header;
}

function encodePingFrame(payload: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(2);
  header[0] = 0x89; // FIN + ping opcode
  header[1] = payload.length;
  return Buffer.concat([header, payload]);
}

describe('WebSocket', () => {
  it('starts with readyState OPEN (1)', () => {
    const socket = createMockSocket();
    const ws = new WebSocket(socket);
    expect(ws.readyState).toBe(1);
  });

  describe('send', () => {
    it('encodes and writes a text frame', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);

      ws.send('hello');

      expect(socket.write).toHaveBeenCalledTimes(1);
      const buf = socket.write.mock.calls[0][0] as Buffer;
      // FIN + text opcode
      expect(buf[0]).toBe(0x81);
      // Payload length = 5
      expect(buf[1]).toBe(5);
      expect(buf.subarray(2).toString('utf-8')).toBe('hello');
    });

    it('no-ops when not OPEN', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      ws.readyState = 3; // CLOSED

      ws.send('ignored');
      expect(socket.write).not.toHaveBeenCalled();
    });

    it('handles medium payload (126-byte extended length)', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const data = 'x'.repeat(200);

      ws.send(data);

      const buf = socket.write.mock.calls[0][0] as Buffer;
      expect(buf[1]).toBe(126);
      expect(buf.readUInt16BE(2)).toBe(200);
    });

    it('handles large payload (127-byte extended length)', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const data = 'x'.repeat(70000);

      ws.send(data);

      const buf = socket.write.mock.calls[0][0] as Buffer;
      expect(buf[1]).toBe(127);
      expect(Number(buf.readBigUInt64BE(2))).toBe(70000);
    });
  });

  describe('close', () => {
    it('sends close frame and ends socket', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);

      ws.close();

      expect(ws.readyState).toBe(2); // CLOSING
      expect(socket.write).toHaveBeenCalledTimes(1);
      const buf = socket.write.mock.calls[0][0] as Buffer;
      expect(buf[0]).toBe(0x88); // close opcode
      expect(socket.end).toHaveBeenCalled();
    });
  });

  describe('incoming frames', () => {
    it('emits message for text frames', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('message', handler);

      socket.emit('data', encodeTextFrame('hello world'));

      expect(handler).toHaveBeenCalledWith('hello world');
    });

    it('emits close on close frame', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('close', handler);

      socket.emit('data', encodeCloseFrame());

      expect(ws.readyState).toBe(3);
      expect(handler).toHaveBeenCalled();
      expect(socket.end).toHaveBeenCalled();
    });

    it('responds to ping with pong', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const pingPayload = Buffer.from('ping-data');

      socket.emit('data', encodePingFrame(pingPayload));

      expect(socket.write).toHaveBeenCalledTimes(1);
      const buf = socket.write.mock.calls[0][0] as Buffer;
      // Pong opcode
      expect(buf[0]).toBe(0x8a);
    });

    it('handles masked frames', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('message', handler);

      socket.emit('data', encodeTextFrame('masked-msg', true));

      expect(handler).toHaveBeenCalledWith('masked-msg');
    });

    it('handles 126-byte extended payload in incoming frames', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('message', handler);

      const longMsg = 'a'.repeat(200);
      socket.emit('data', encodeTextFrame(longMsg));

      expect(handler).toHaveBeenCalledWith(longMsg);
    });

    it('handles 127-byte extended payload in incoming frames', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('message', handler);

      const veryLongMsg = 'b'.repeat(70000);
      socket.emit('data', encodeTextFrame(veryLongMsg));

      expect(handler).toHaveBeenCalledWith(veryLongMsg);
    });

    it('ignores malformed frames', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('message', handler);

      // Send truncated data that will cause decodeFrame to throw
      socket.emit('data', Buffer.from([0x81]));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('socket events', () => {
    it('emits close on socket close', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('close', handler);

      socket.emit('close');

      expect(ws.readyState).toBe(3);
      expect(handler).toHaveBeenCalled();
    });

    it('emits close on socket error', () => {
      const socket = createMockSocket();
      const ws = new WebSocket(socket);
      const handler = vi.fn();
      ws.on('close', handler);

      socket.emit('error', new Error('conn reset'));

      expect(ws.readyState).toBe(3);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('sendFrame error handling', () => {
    it('sets readyState to CLOSED on write error', () => {
      const socket = createMockSocket();
      socket.write = vi.fn(() => {
        throw new Error('write error');
      });
      const ws = new WebSocket(socket);

      ws.send('data');

      expect(ws.readyState).toBe(3);
    });
  });
});

describe('WebSocketServer', () => {
  it('performs upgrade handshake with correct Sec-WebSocket-Accept', () => {
    const server = new EventEmitter() as Server;
    const wss = new WebSocketServer(server);
    const connectionHandler = vi.fn();
    wss.on('connection', connectionHandler);

    const key = 'dGhlIHNhbXBsZSBub25jZQ==';
    const expectedAccept = createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64');

    const socket = createMockSocket();
    const req = { headers: { 'sec-websocket-key': key } };

    (server as any).emit('upgrade', req, socket, Buffer.alloc(0));

    expect(socket.write).toHaveBeenCalledTimes(1);
    const response = socket.write.mock.calls[0][0] as string;
    expect(response).toContain('101 Switching Protocols');
    expect(response).toContain(`Sec-WebSocket-Accept: ${expectedAccept}`);
    expect(connectionHandler).toHaveBeenCalledWith(expect.any(WebSocket), req);
  });

  it('destroys socket on missing Sec-WebSocket-Key header', () => {
    const server = new EventEmitter() as Server;
    const wss = new WebSocketServer(server);
    const connectionHandler = vi.fn();
    wss.on('connection', connectionHandler);

    const socket = createMockSocket();
    const req = { headers: {} };

    (server as any).emit('upgrade', req, socket, Buffer.alloc(0));

    expect(socket.destroy).toHaveBeenCalled();
    expect(connectionHandler).not.toHaveBeenCalled();
  });
});
