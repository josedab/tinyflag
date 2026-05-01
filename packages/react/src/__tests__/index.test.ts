import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { TinyFlagProvider, useFlag, useVariant, useTinyFlagInstance } from '../index.js';
import { TinyFlag } from 'tinyflag';

afterEach(() => cleanup());

function createInstance(
  flags: Record<string, { enabled: boolean; rollout?: number; variants?: { name: string; weight: number }[] }>,
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
});
