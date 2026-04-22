import { describe, it, expect } from 'vitest';
import { parseYaml } from '../yaml.js';

describe('parseYaml', () => {
  it('parses simple key-value mappings', () => {
    expect(parseYaml('name: hello\nvalue: 42\nenabled: true')).toEqual({
      name: 'hello', value: 42, enabled: true,
    });
  });

  it('parses nested mappings', () => {
    expect(parseYaml('flags:\n  my-flag:\n    enabled: true\n    rollout: 50')).toEqual({
      flags: { 'my-flag': { enabled: true, rollout: 50 } },
    });
  });

  it('parses sequences', () => {
    expect(parseYaml('tags:\n  - beta\n  - experiment')).toEqual({
      tags: ['beta', 'experiment'],
    });
  });

  it('parses sequence of objects', () => {
    const result = parseYaml('variants:\n  - name: control\n    weight: 50\n  - name: test\n    weight: 50');
    expect(result).toEqual({
      variants: [{ name: 'control', weight: 50 }, { name: 'test', weight: 50 }],
    });
  });

  it('parses booleans', () => {
    expect(parseYaml('a: true\nb: false\nc: yes\nd: no')).toEqual({
      a: true, b: false, c: true, d: false,
    });
  });

  it('parses null values', () => {
    expect(parseYaml('a: null\nb: ~')).toEqual({ a: null, b: null });
  });

  it('parses numbers', () => {
    expect(parseYaml('int: 42\nfloat: 3.14\nneg: -7\nzero: 0')).toEqual({
      int: 42, float: 3.14, neg: -7, zero: 0,
    });
  });

  it('parses quoted strings (preserves literal value)', () => {
    expect(parseYaml("single: 'hello world'\ndouble: \"42\"")).toEqual({
      single: 'hello world', double: '42',
    });
  });

  it('handles comments', () => {
    expect(parseYaml('# comment\nname: hello # inline')).toEqual({ name: 'hello' });
  });

  it('parses flow sequences', () => {
    expect(parseYaml('tags: [beta, experiment]')).toEqual({ tags: ['beta', 'experiment'] });
  });

  it('parses flow mappings', () => {
    expect(parseYaml('cond: {plan: pro}')).toEqual({ cond: { plan: 'pro' } });
  });

  it('handles --- document separator', () => {
    expect(parseYaml('---\nname: hello')).toEqual({ name: 'hello' });
  });

  it('returns null for empty input', () => {
    expect(parseYaml('')).toBeNull();
    expect(parseYaml('   ')).toBeNull();
    expect(parseYaml('# just a comment')).toBeNull();
  });

  it('parses a realistic flag file', () => {
    const yaml = `version: 1
flags:
  new-checkout:
    enabled: true
    description: New checkout flow
    rollout: 50
    tags:
      - checkout
      - experiment
    rules:
      - conditions:
          plan: pro
        enabled: true
      - conditions:
          country: {$in: [US, CA]}
        rollout: 80
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
  dark-mode:
    enabled: false
    description: Dark mode toggle`;

    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result.version).toBe(1);
    const flags = result.flags as Record<string, Record<string, unknown>>;
    expect(flags['new-checkout'].enabled).toBe(true);
    expect(flags['new-checkout'].rollout).toBe(50);
    expect(flags['dark-mode'].enabled).toBe(false);
  });

  it('handles BOM character', () => {
    expect(parseYaml('\uFEFFname: hello')).toEqual({ name: 'hello' });
  });

  it('parses empty sequence items (- without value)', () => {
    const result = parseYaml('items:\n  -\n  - hello') as Record<string, unknown>;
    expect(result.items).toEqual([null, 'hello']);
  });

  it('parses sequence with nested block', () => {
    const result = parseYaml('items:\n  -\n    name: a\n    value: 1') as Record<string, unknown>;
    expect(result.items).toEqual([{ name: 'a', value: 1 }]);
  });

  it('parses nested flow mapping in sequence', () => {
    const result = parseYaml('rules:\n  - conditions: {plan: pro}\n    enabled: true') as Record<string, unknown>;
    expect(result.rules).toEqual([{ conditions: { plan: 'pro' }, enabled: true }]);
  });

  it('parses hex numbers', () => {
    expect(parseYaml('val: 0xFF')).toEqual({ val: 255 });
  });

  it('parses octal numbers', () => {
    expect(parseYaml('val: 0o17')).toEqual({ val: 15 });
  });

  it('handles nested empty mapping value', () => {
    const result = parseYaml('outer:\n  inner:') as Record<string, unknown>;
    expect(result).toEqual({ outer: { inner: null } });
  });

  it('handles flow sequence inside flow mapping', () => {
    const result = parseYaml('data: {items: [1, 2, 3]}') as Record<string, unknown>;
    expect(result).toEqual({ data: { items: [1, 2, 3] } });
  });

  it('handles deeply nested structures', () => {
    const yaml = 'a:\n  b:\n    c:\n      d: deep';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ a: { b: { c: { d: 'deep' } } } });
  });

  it('parses literal block scalar (|)', () => {
    const yaml = 'desc: |\n  line one\n  line two';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.desc).toContain('line one');
    expect(result.desc).toContain('line two');
  });

  it('parses folded block scalar (>)', () => {
    const yaml = 'desc: >\n  folded\n  text';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(typeof result.desc).toBe('string');
    expect((result.desc as string).trim()).toContain('folded');
  });

  it('parses chomped literal (|-)', () => {
    const yaml = 'desc: |-\n  no trailing newline';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect((result.desc as string).endsWith('\n')).toBe(false);
  });

  it('parses chomped folded (>-)', () => {
    const yaml = 'desc: >-\n  no trailing\n  newline';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect((result.desc as string).endsWith('\n')).toBe(false);
  });

  it('handles multiline at end of file', () => {
    const yaml = 'only: |';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.only).toBeDefined();
  });

  it('handles mapping key with no colon match', () => {
    const yaml = 'simple-value';
    const result = parseYaml(yaml);
    expect(result).toBe('simple-value');
  });

  it('handles empty flow mapping', () => {
    expect(parseYaml('data: {}')).toEqual({ data: {} });
  });

  it('handles empty flow sequence', () => {
    expect(parseYaml('data: []')).toEqual({ data: [] });
  });

  it('handles sequence item with bare dash and nested block', () => {
    const yaml = 'items:\n  -\n    key: val';
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.items).toEqual([{ key: 'val' }]);
  });

  it('handles inline mapping in sequence with multiple keys', () => {
    const yaml = 'items:\n  - name: a\n    weight: 1\n  - name: b\n    weight: 2';
    const result = parseYaml(yaml) as Record<string, unknown>;
    const items = result.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('a');
    expect(items[1].name).toBe('b');
  });

  it('handles quoted string with hash inside', () => {
    const yaml = "val: 'has # hash'";
    const result = parseYaml(yaml) as Record<string, unknown>;
    expect(result.val).toBe('has # hash');
  });
});
