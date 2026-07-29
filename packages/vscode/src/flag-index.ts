export interface FlagInfo {
  name: string;
  enabled: boolean;
  description?: string;
  rollout?: number;
  rulesCount: number;
  variants: string[];
  tags?: string[];
  line: number;
  filePath: string;
}

export interface FlagDiagnostic {
  start: number;
  end: number;
  message: string;
  severity: 'warning' | 'information';
}

export function indexFlags(content: string, filePath: string): Map<string, FlagInfo> {
  const parsed = parseSimpleYaml(content);
  if (!parsed?.flags || typeof parsed.flags !== 'object') return new Map();

  const flags = new Map<string, FlagInfo>();
  const lines = content.split('\n');
  for (const [name, def] of Object.entries(
    parsed.flags as Record<string, Record<string, unknown>>,
  )) {
    const line = lines.findIndex((value) => new RegExp(`^\\s{2}${name}\\s*:`).test(value));
    flags.set(name, {
      name,
      enabled: (def?.enabled as boolean) ?? false,
      description: def?.description as string | undefined,
      rollout: def?.rollout as number | undefined,
      rulesCount: Array.isArray(def?.rules) ? def.rules.length : 0,
      variants: Array.isArray(def?.variants)
        ? (def.variants as Record<string, unknown>[])
            .map((variant) => variant?.name as string)
            .filter(Boolean)
        : [],
      tags: def?.tags as string[] | undefined,
      line: line >= 0 ? line : 0,
      filePath,
    });
  }
  return flags;
}

export function findFlagDiagnostics(
  text: string,
  flags: ReadonlyMap<string, FlagInfo>,
): FlagDiagnostic[] {
  const diagnostics: FlagDiagnostic[] = [];
  const pattern = /(?:isEnabled|getVariant)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const flagName = match[1];
    const start = match.index + match[0].indexOf(flagName);
    const flag = flags.get(flagName);
    if (!flag) {
      diagnostics.push({
        start,
        end: start + flagName.length,
        message: `Flag "${flagName}" is not defined in flags file`,
        severity: 'warning',
      });
    } else if (!flag.enabled) {
      diagnostics.push({
        start,
        end: start + flagName.length,
        message: `Flag "${flagName}" is currently disabled`,
        severity: 'information',
      });
    }
  }
  return diagnostics;
}

function parseSimpleYaml(content: string): Record<string, unknown> | null {
  try {
    const lines = content.split('\n');
    const result: Record<string, unknown> = {};
    const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj: result }];

    for (const line of lines) {
      const trimmed = line.replace(/#.*$/, '').trimEnd();
      if (!trimmed.trim()) continue;

      const indent = line.length - line.trimStart().length;
      if (trimmed.trim().startsWith('-')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;
      if (value === '' || value === '|' || value === '>') {
        const child: Record<string, unknown> = {};
        parent[key] = child;
        stack.push({ indent, obj: child });
      } else {
        parent[key] = parseScalarValue(value);
      }
    }

    return result;
  } catch {
    return null;
  }
}

function parseScalarValue(value: string): string | number | boolean | null {
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
