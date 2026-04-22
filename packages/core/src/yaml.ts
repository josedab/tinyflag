/**
 * Minimal YAML parser supporting the features needed for flag definition files.
 * Handles: mappings, sequences, scalars, quoted strings, comments,
 * flow sequences/mappings, multiline strings (| and >), booleans, numbers, null.
 *
 * This is NOT a full YAML 1.2 implementation — it covers the practical subset
 * used in configuration files.
 */

const BOOL_TRUE = new Set(['true', 'yes', 'on']);
const BOOL_FALSE = new Set(['false', 'no', 'off']);

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '~' || trimmed === 'null') return null;
  if (BOOL_TRUE.has(trimmed.toLowerCase())) return true;
  if (BOOL_FALSE.has(trimmed.toLowerCase())) return false;

  // Quoted strings — preserve as-is
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Numbers
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return parseInt(trimmed, 16);
  }
  if (/^0o[0-7]+$/.test(trimmed)) {
    return parseInt(trimmed.slice(2), 8);
  }

  return trimmed;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

interface Line {
  indent: number;
  content: string;
  raw: string;
  lineNumber: number;
}

function tokenize(input: string): Line[] {
  const lines: Line[] = [];
  const rawLines = input.split('\n');

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    // Skip fully blank lines and comment-only lines
    const trimmed = raw.trimStart();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = raw.length - raw.trimStart().length;
    const content = stripComment(trimmed);
    if (content === '') continue;

    lines.push({ indent, content, raw, lineNumber: i + 1 });
  }
  return lines;
}

function parseFlowValue(value: string): unknown {
  const trimmed = value.trim();

  // Flow sequence: [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlowItems(inner).map((item) => parseFlowValue(item.trim()));
  }

  // Flow mapping: {a: 1, b: 2}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') return {};
    const result: Record<string, unknown> = {};
    for (const item of splitFlowItems(inner)) {
      const colonIdx = item.indexOf(':');
      if (colonIdx === -1) continue;
      const key = item.slice(0, colonIdx).trim();
      const val = item.slice(colonIdx + 1).trim();
      result[key] = parseFlowValue(val);
    }
    return result;
  }

  return parseScalar(trimmed);
}

function splitFlowItems(input: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (const ch of input) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;

    if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        items.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) items.push(current);
  return items;
}

function parseBlock(lines: Line[], start: number, parentIndent: number): [unknown, number] {
  if (start >= lines.length) return [null, start];

  const line = lines[start];

  // Sequence item
  if (line.content.startsWith('- ')) {
    return parseSequence(lines, start, line.indent);
  }
  if (line.content === '-') {
    return parseSequence(lines, start, line.indent);
  }

  // Mapping
  if (line.content.includes(':')) {
    return parseMapping(lines, start, line.indent);
  }

  // Scalar
  return [parseScalar(line.content), start + 1];
}

function parseSequence(lines: Line[], start: number, baseIndent: number): [unknown[], number] {
  const result: unknown[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) break;

    if (line.content.startsWith('- ')) {
      const value = line.content.slice(2).trim();

      if (value === '') {
        // Block value follows
        if (i + 1 < lines.length && lines[i + 1].indent > line.indent) {
          const [child, next] = parseBlock(lines, i + 1, line.indent);
          result.push(child);
          i = next;
        } else {
          result.push(null);
          i++;
        }
      } else if (value.startsWith('[') || value.startsWith('{')) {
        result.push(parseFlowValue(value));
        i++;
      } else if (value.includes(': ') || value.endsWith(':')) {
        // Inline mapping in a sequence item: - key: value
        const tempLines: Line[] = [{ indent: line.indent + 2, content: value, raw: line.raw, lineNumber: line.lineNumber }];
        // Collect subsequent indented lines
        let j = i + 1;
        while (j < lines.length && lines[j].indent > line.indent) {
          tempLines.push(lines[j]);
          j++;
        }
        const [child] = parseMapping(tempLines, 0, line.indent + 2);
        result.push(child);
        i = j;
      } else {
        result.push(parseScalar(value));
        i++;
      }
    } else if (line.content === '-') {
      if (i + 1 < lines.length && lines[i + 1].indent > line.indent) {
        const [child, next] = parseBlock(lines, i + 1, line.indent);
        result.push(child);
        i = next;
      } else {
        result.push(null);
        i++;
      }
    } else {
      break;
    }
  }

  return [result, i];
}

function parseMapping(
  lines: Line[],
  start: number,
  baseIndent: number,
): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {};
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      // This shouldn't happen at the top level, skip
      i++;
      continue;
    }

    const colonIdx = line.content.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.content.slice(0, colonIdx).trim();
    const afterColon = line.content.slice(colonIdx + 1).trim();

    if (afterColon === '' || afterColon === '|' || afterColon === '>' || afterColon === '|-' || afterColon === '>-') {
      // Block value or multiline string
      if (afterColon === '|' || afterColon === '|-' || afterColon === '>' || afterColon === '>-') {
        // Multiline string
        const chomp = afterColon.endsWith('-');
        const fold = afterColon.startsWith('>');
        const [text, next] = parseMultilineString(lines, i + 1, fold, chomp);
        result[key] = text;
        i = next;
      } else if (i + 1 < lines.length && lines[i + 1].indent > baseIndent) {
        const [child, next] = parseBlock(lines, i + 1, baseIndent);
        result[key] = child;
        i = next;
      } else {
        result[key] = null;
        i++;
      }
    } else if (afterColon.startsWith('[') || afterColon.startsWith('{')) {
      result[key] = parseFlowValue(afterColon);
      i++;
    } else {
      result[key] = parseScalar(afterColon);
      i++;
    }
  }

  return [result, i];
}

function parseMultilineString(
  lines: Line[],
  start: number,
  fold: boolean,
  chomp: boolean,
): [string, number] {
  if (start >= lines.length) return ['', start];

  const baseIndent = lines[start].indent;
  const parts: string[] = [];
  let i = start;

  while (i < lines.length && lines[i].indent >= baseIndent) {
    parts.push(lines[i].raw.slice(baseIndent));
    i++;
  }

  let text: string;
  if (fold) {
    text = parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    text = parts.join('\n');
  }

  if (!chomp) {
    text += '\n';
  }

  return [text, i];
}

/**
 * Parse a YAML string into a JavaScript object.
 * Throws an Error with a descriptive message if parsing fails.
 */
export function parseYaml(input: string): unknown {
  if (!input || input.trim() === '') {
    return null;
  }

  // Remove BOM
  const cleaned = input.replace(/^\uFEFF/, '');

  // Handle document separators
  const docContent = cleaned.replace(/^---\s*\n/, '').replace(/\n\.\.\.\s*$/, '');

  const lines = tokenize(docContent);
  if (lines.length === 0) return null;

  const [result] = parseBlock(lines, 0, lines[0].indent);
  return result;
}
