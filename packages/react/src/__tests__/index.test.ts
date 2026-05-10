import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { TinyFlagProvider, useFlag, useVariant, useTinyFlagInstance } from '../index.js';
import { TinyFlag } from 'tinyflag';

afterEach(() => cleanup());

function createInstance(
  flags: Record<
    string,
    { enabled: boolean; rollout?: number; variants?: { name: string; weight: number }[] }
  >,
) {
  return new TinyFlag({
    source: { flags },
  });
}

describe('tinyflag-react', () => {
  it('TinyFlagProvider renders children', async () => {
    const ff = createInstance({ 'test-flag': { enabled: true } });
    await ff.init();

    function Child() {
      return React.createElement('div', { 'data-testid': 'child' }, 'hello');
    }

    render(
      React.createElement(
        TinyFlagProvider,
        { source: { flags: {} }, instance: ff },
        React.createElement(Child),
      ),
    );

    expect(screen.getByTestId('child').textContent).toBe('hello');
    ff.destroy();
  });

  it('useFlag returns boolean for enabled flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    let result: boolean | undefined;
    function Consumer() {
      result = useFlag('my-flag');
      return null;
    }

    render(
      React.createElement(
        TinyFlagProvider,
        { source: { flags: {} }, instance: ff },
        React.createElement(Consumer),
      ),
    );

    expect(result).toBe(true);
    ff.destroy();
  });

  it('useFlag returns false for unknown flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    let result: boolean | undefined;
    function Consumer() {
      result = useFlag('nonexistent');
      return null;
    }

    render(
      React.createElement(
        TinyFlagProvider,
        { source: { flags: {} }, instance: ff },
        React.createElement(Consumer),
      ),
    );

    expect(result).toBe(false);
    ff.destroy();
  });

  it('useVariant returns variant string', async () => {
    const ff = createInstance({
      'ab-test': {
        enabled: true,
        variants: [
          { name: 'control', weight: 50 },
          { name: 'treatment', weight: 50 },
        ],
      },
    });
    await ff.init();

    let result: string | null | undefined;
    function Consumer() {
      result = useVariant('ab-test');
      return null;
    }

    render(
      React.createElement(
        TinyFlagProvider,
        {
          source: { flags: {} },
          instance: ff,
          context: { userId: 'user-1' },
        },
        React.createElement(Consumer),
      ),
    );

    expect(typeof result).toBe('string');
    expect(['control', 'treatment']).toContain(result);
    ff.destroy();
  });

  it('context updates propagate to hooks', async () => {
    const ff = createInstance({
      'rollout-flag': { enabled: true, rollout: 100 },
    });
    await ff.init();

    let flagResult: boolean | undefined;
    function Consumer() {
      flagResult = useFlag('rollout-flag');
      return null;
    }

    const { rerender } = render(
      React.createElement(
        TinyFlagProvider,
        {
          source: { flags: {} },
          instance: ff,
          context: { userId: 'user-1' },
        },
        React.createElement(Consumer),
      ),
    );

    expect(flagResult).toBe(true);

    rerender(
      React.createElement(
        TinyFlagProvider,
        {
          source: { flags: {} },
          instance: ff,
          context: { userId: 'user-2' },
        },
        React.createElement(Consumer),
      ),
    );

    expect(flagResult).toBe(true);
    ff.destroy();
  });

  it('flag reloads propagate current values to hook consumers', async () => {
    const ff = createInstance({
      'flag-a': { enabled: true },
      'flag-b': { enabled: true },
    });
    await ff.init();

    function Consumer() {
      const flagA = useFlag('flag-a');
      const flagB = useFlag('flag-b');
      return React.createElement(
        'div',
        null,
        React.createElement('span', { 'data-testid': 'flag-a' }, String(flagA)),
        React.createElement('span', { 'data-testid': 'flag-b' }, String(flagB)),
      );
    }

    render(
      React.createElement(
        TinyFlagProvider,
        { source: { flags: {} }, instance: ff },
        React.createElement(Consumer),
      ),
    );

    await act(() =>
      ff.reload({
        flags: {
          'flag-a': { enabled: false },
          'flag-b': { enabled: true },
        },
      }),
    );

    expect(screen.getByTestId('flag-a').textContent).toBe('false');
    expect(screen.getByTestId('flag-b').textContent).toBe('true');
    ff.destroy();
  });

  it('useFlag without TinyFlagProvider throws descriptive error', () => {
    function BadConsumer() {
      useFlag('any-flag');
      return null;
    }

    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(React.createElement(BadConsumer))).toThrow(
      'useFlag/useVariant must be used inside <TinyFlagProvider>',
    );
    spy.mockRestore();
  });

  it('useVariant without TinyFlagProvider throws descriptive error', () => {
    function BadConsumer() {
      useVariant('any-flag');
      return null;
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(React.createElement(BadConsumer))).toThrow(
      'useFlag/useVariant must be used inside <TinyFlagProvider>',
    );
    spy.mockRestore();
  });

  it('useTinyFlagInstance returns the instance', async () => {
    const ff = createInstance({ test: { enabled: true } });
    await ff.init();

    let result: TinyFlag | undefined;
    function Consumer() {
      result = useTinyFlagInstance();
      return null;
    }

    render(
      React.createElement(
        TinyFlagProvider,
        { source: { flags: {} }, instance: ff },
        React.createElement(Consumer),
      ),
    );

    expect(result).toBe(ff);
    ff.destroy();
  });
});
