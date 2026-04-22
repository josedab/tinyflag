import { describe, it, expect } from 'vitest';
import { EventEmitter } from '../events.js';

describe('EventEmitter', () => {
  it('emits events to registered listeners', () => {
    const emitter = new EventEmitter();
    const received: unknown[] = [];
    emitter.on('error', (e) => received.push(e));
    emitter.emit('error', { code: 'TEST', message: 'test' });
    expect(received).toHaveLength(1);
  });

  it('supports multiple listeners', () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.on('error', () => count++);
    emitter.on('error', () => count++);
    emitter.emit('error', { code: 'T', message: 't' });
    expect(count).toBe(2);
  });

  it('removes listeners with off()', () => {
    const emitter = new EventEmitter();
    let count = 0;
    const handler = () => count++;
    emitter.on('error', handler);
    emitter.emit('error', { code: 'T', message: 't' });
    expect(count).toBe(1);
    emitter.off('error', handler);
    emitter.emit('error', { code: 'T', message: 't' });
    expect(count).toBe(1);
  });

  it('removeAllListeners clears everything', () => {
    const emitter = new EventEmitter();
    let count = 0;
    emitter.on('error', () => count++);
    emitter.on('change', () => count++);
    emitter.removeAllListeners();
    emitter.emit('error', { code: 'T', message: 't' });
    expect(count).toBe(0);
  });

  it('hasListeners returns correct status', () => {
    const emitter = new EventEmitter();
    expect(emitter.hasListeners('error')).toBe(false);
    emitter.on('error', () => {});
    expect(emitter.hasListeners('error')).toBe(true);
  });

  it('catches listener errors and emits error event', () => {
    const emitter = new EventEmitter();
    const errors: unknown[] = [];
    emitter.on('exposure', () => { throw new Error('boom'); });
    emitter.on('error', (e) => errors.push(e));
    emitter.emit('exposure', { flag: 'f', variant: null, enabled: true, userId: 'u', timestamp: 0 });
    expect(errors).toHaveLength(1);
    expect((errors[0] as { code: string }).code).toBe('LISTENER_ERROR');
  });

  it('does not recurse on error listener errors', () => {
    const emitter = new EventEmitter();
    emitter.on('error', () => { throw new Error('error handler fails'); });
    // Should not throw or infinite loop
    expect(() => emitter.emit('error', { code: 'T', message: 't' })).not.toThrow();
  });

  it('ignores emit when no listeners', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.emit('error', { code: 'T', message: 't' })).not.toThrow();
  });

  it('off is safe when handler was never registered', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.off('error', () => {})).not.toThrow();
  });
});
