import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { provideTinyFlag, useFlag, useVariant, useTinyFlagInstance } from '../index.js';
import { TinyFlag } from 'tinyflag';

function createInstance(
  flags: Record<string, { enabled: boolean; variants?: { name: string; weight: number }[] }>,
) {
  return new TinyFlag({ source: { flags } });
}

describe('tinyflag-vue', () => {
  it('useFlag returns ref for enabled flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    let result: boolean | undefined;
    const Child = defineComponent({
      setup() {
        const val = useFlag('my-flag');
        result = val.value;
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({ source: { flags: {} }, instance: ff });
        return () => h(Child);
      },
    });

    mount(Parent);
    expect(result).toBe(true);
    ff.destroy();
  });

  it('useFlag returns false for unknown flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    let result: boolean | undefined;
    const Child = defineComponent({
      setup() {
        const val = useFlag('nonexistent');
        result = val.value;
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({ source: { flags: {} }, instance: ff });
        return () => h(Child);
      },
    });

    mount(Parent);
    expect(result).toBe(false);
    ff.destroy();
  });

  it('useVariant returns variant ref', async () => {
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
    const Child = defineComponent({
      setup() {
        const val = useVariant('ab-test');
        result = val.value;
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({
          source: { flags: {} },
          instance: ff,
          context: { userId: 'user-1' },
        });
        return () => h(Child);
      },
    });

    mount(Parent);
    expect(typeof result).toBe('string');
    expect(['control', 'treatment']).toContain(result);
    ff.destroy();
  });

  it('provideTinyFlag sets up injection', async () => {
    const ff = createInstance({ 'test-flag': { enabled: true } });
    await ff.init();

    let instance: TinyFlag | undefined;
    const Child = defineComponent({
      setup() {
        instance = useTinyFlagInstance();
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({ source: { flags: {} }, instance: ff });
        return () => h(Child);
      },
    });

    mount(Parent);
    expect(instance).toBe(ff);
    ff.destroy();
  });

  it('useFlag without provideTinyFlag throws descriptive error', () => {
    const Child = defineComponent({
      setup() {
        useFlag('any-flag');
        return () => h('div');
      },
    });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mount(Child)).toThrow('useFlag/useVariant requires provideTinyFlag');
    spy.mockRestore();
  });

  it('useVariant without provideTinyFlag throws descriptive error', () => {
    const Child = defineComponent({
      setup() {
        useVariant('any-flag');
        return () => h('div');
      },
    });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mount(Child)).toThrow('useFlag/useVariant requires provideTinyFlag');
    spy.mockRestore();
  });

  it('options forwarding (instance is passed through)', async () => {
    const ff = createInstance({ f: { enabled: true } });
    await ff.init();

    let result: TinyFlag | undefined;
    const Child = defineComponent({
      setup() {
        result = useTinyFlagInstance();
        return () => h('div');
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({
          source: { flags: {} },
          instance: ff,
          strict: true,
          debug: false,
        });
        return () => h(Child);
      },
    });

    mount(Parent);
    expect(result).toBe(ff);
    ff.destroy();
  });

  it('flag reloads propagate current values to computed consumers', async () => {
    const ff = createInstance({
      'flag-a': { enabled: true },
      'flag-b': { enabled: true },
    });
    await ff.init();

    let rendersA = 0;
    let rendersB = 0;
    const ChildA = defineComponent({
      setup() {
        const flagA = useFlag('flag-a');
        return () => {
          rendersA++;
          return h('span', String(flagA.value));
        };
      },
    });
    const ChildB = defineComponent({
      setup() {
        const flagB = useFlag('flag-b');
        return () => {
          rendersB++;
          return h('span', String(flagB.value));
        };
      },
    });

    const Parent = defineComponent({
      setup() {
        provideTinyFlag({ source: { flags: {} }, instance: ff });
        return () => h('div', [h(ChildA), h(ChildB)]);
      },
    });

    const wrapper = mount(Parent);
    await ff.reload({
      flags: {
        'flag-a': { enabled: false },
        'flag-b': { enabled: true },
      },
    });
    await nextTick();

    expect(wrapper.text()).toBe('falsetrue');
    expect(rendersA).toBe(2);
    expect(rendersB).toBe(1);
    wrapper.unmount();
    ff.destroy();
  });
});
