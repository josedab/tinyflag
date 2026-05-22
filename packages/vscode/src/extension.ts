import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FlagInfo {
  name: string;
  enabled: boolean;
  description?: string;
  rollout?: number;
  rulesCount: number;
  variants: string[];
  tags?: string[];
  line: number;
}

let flagsMap = new Map<string, FlagInfo>();
let flagsFilePath: string | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let fileWatcher: vscode.FileSystemWatcher | undefined;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('tinyflag');
  context.subscriptions.push(diagnosticCollection);

  loadFlags();

  // Register completion provider for JS/TS files
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    {
      provideCompletionItems(document, position) {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);

        // Match isEnabled('...' or getVariant('...' patterns
        if (!/(?:isEnabled|getVariant)\s*\(\s*['"]?[^'"]*$/.test(beforeCursor)) {
          return undefined;
        }

        const items: vscode.CompletionItem[] = [];
        for (const [name, flag] of flagsMap) {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Constant);
          item.detail = flag.enabled ? '✅ enabled' : '❌ disabled';
          const parts = [flag.description ?? ''];
          if (flag.rollout !== undefined) parts.push(`Rollout: ${flag.rollout}%`);
          if (flag.rulesCount > 0) parts.push(`Rules: ${flag.rulesCount}`);
          if (flag.variants.length > 0) parts.push(`Variants: ${flag.variants.join(', ')}`);
          item.documentation = new vscode.MarkdownString(parts.filter(Boolean).join('\n\n'));
          items.push(item);
        }
        return items;
      },
    },
    "'",
    '"',
  );
  context.subscriptions.push(completionProvider);

  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /['"][a-z0-9-]+['"]/);
        if (!range) return undefined;

        const word = document.getText(range).replace(/['"]/g, '');
        const flag = flagsMap.get(word);
        if (!flag) return undefined;

        // Check if inside isEnabled/getVariant call
        const lineText = document.lineAt(position).text;
        if (!/(?:isEnabled|getVariant)\s*\(/.test(lineText)) return undefined;

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### 🚩 ${flag.name}\n\n`);
        md.appendMarkdown(`**Status:** ${flag.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n`);
        if (flag.description) md.appendMarkdown(`${flag.description}\n\n`);
        if (flag.rollout !== undefined) md.appendMarkdown(`**Rollout:** ${flag.rollout}%\n\n`);
        if (flag.rulesCount > 0) md.appendMarkdown(`**Rules:** ${flag.rulesCount}\n\n`);
        if (flag.variants.length > 0) {
          md.appendMarkdown(`**Variants:** ${flag.variants.join(', ')}\n\n`);
        }
        if (flag.tags && flag.tags.length > 0) {
          md.appendMarkdown(`**Tags:** ${flag.tags.join(', ')}\n\n`);
        }
        return new vscode.Hover(md, range);
      },
    },
  );
  context.subscriptions.push(hoverProvider);

  // Register definition provider (go-to-definition from code to YAML)
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    {
      provideDefinition(document, position) {
        const range = document.getWordRangeAtPosition(position, /['"][a-z0-9-]+['"]/);
        if (!range || !flagsFilePath) return undefined;

        const word = document.getText(range).replace(/['"]/g, '');
        const flag = flagsMap.get(word);
        if (!flag) return undefined;

        const lineText = document.lineAt(position).text;
        if (!/(?:isEnabled|getVariant)\s*\(/.test(lineText)) return undefined;

        return new vscode.Location(
          vscode.Uri.file(flagsFilePath),
          new vscode.Position(flag.line, 0),
        );
      },
    },
  );
  context.subscriptions.push(definitionProvider);

  // Register CodeLens provider for disabled/undefined flags
  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'javascriptreact' },
    ],
    {
      provideCodeLenses(document) {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const pattern = /(?:isEnabled|getVariant)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          const flagName = match[1];
          const pos = document.positionAt(match.index);
          const range = new vscode.Range(pos, pos);
          const flag = flagsMap.get(flagName);

          if (!flag) {
            lenses.push(
              new vscode.CodeLens(range, {
                title: `⚠️ Flag "${flagName}" not defined`,
                command: '',
              }),
            );
          } else if (!flag.enabled) {
            lenses.push(
              new vscode.CodeLens(range, {
                title: `❌ Flag "${flagName}" is disabled`,
                command: '',
              }),
            );
          } else {
            const label = flag.rollout !== undefined
              ? `✅ ${flagName} (${flag.rollout}% rollout)`
              : `✅ ${flagName}`;
            lenses.push(new vscode.CodeLens(range, { title: label, command: '' }));
          }
        }
        return lenses;
      },
    },
  );
  context.subscriptions.push(codeLensProvider);

  // Watch for flag file changes
  const config = vscode.workspace.getConfiguration('tinyflag');
  const flagsFileName = config.get<string>('flagsFile', 'flags.yml');
  fileWatcher = vscode.workspace.createFileSystemWatcher(`**/${flagsFileName}`);
  fileWatcher.onDidChange(() => loadFlags());
  fileWatcher.onDidCreate(() => loadFlags());
  fileWatcher.onDidDelete(() => {
    flagsMap.clear();
    diagnosticCollection.clear();
  });
  context.subscriptions.push(fileWatcher);

  // Run diagnostics on open/save of TS/JS files
  vscode.workspace.onDidSaveTextDocument((doc) => updateDiagnostics(doc));
  vscode.workspace.onDidOpenTextDocument((doc) => updateDiagnostics(doc));
  vscode.window.visibleTextEditors.forEach((e) => updateDiagnostics(e.document));
}

export function deactivate(): void {
  flagsMap.clear();
  diagnosticCollection?.clear();
}

function loadFlags(): void {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return;

  const config = vscode.workspace.getConfiguration('tinyflag');
  const flagsFileName = config.get<string>('flagsFile', 'flags.yml');

  for (const folder of workspaceFolders) {
    const filePath = path.join(folder.uri.fsPath, flagsFileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseSimpleYaml(content);
      if (!parsed?.flags) continue;

      flagsMap.clear();
      flagsFilePath = filePath;
      const lines = content.split('\n');

      for (const [name, def] of Object.entries(parsed.flags as Record<string, any>)) {
        const lineIdx = lines.findIndex((l) => new RegExp(`^\\s{2}${name}\\s*:`).test(l));
        flagsMap.set(name, {
          name,
          enabled: def?.enabled ?? false,
          description: def?.description,
          rollout: def?.rollout,
          rulesCount: Array.isArray(def?.rules) ? def.rules.length : 0,
          variants: Array.isArray(def?.variants)
            ? def.variants.map((v: any) => v?.name).filter(Boolean)
            : [],
          tags: def?.tags,
          line: lineIdx >= 0 ? lineIdx : 0,
        });
      }
      break;
    } catch {
      // Ignore parse errors
    }
  }
}

function updateDiagnostics(document: vscode.TextDocument): void {
  if (
    !['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(
      document.languageId,
    )
  ) {
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const pattern = /(?:isEnabled|getVariant)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const flagName = match[1];
    const flag = flagsMap.get(flagName);
    const start = document.positionAt(match.index + match[0].indexOf(flagName));
    const end = document.positionAt(match.index + match[0].indexOf(flagName) + flagName.length);
    const range = new vscode.Range(start, end);

    if (!flag) {
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Flag "${flagName}" is not defined in flags file`,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    } else if (!flag.enabled) {
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `Flag "${flagName}" is currently disabled`,
          vscode.DiagnosticSeverity.Information,
        ),
      );
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

// Minimal YAML parser for flag files (key: value extraction)
function parseSimpleYaml(content: string): Record<string, any> | null {
  try {
    const lines = content.split('\n');
    const result: any = {};
    const stack: { indent: number; obj: any; key: string }[] = [{ indent: -1, obj: result, key: '' }];

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
        const child: any = {};
        parent[key] = child;
        stack.push({ indent, obj: child, key });
      } else {
        parent[key] = parseScalarValue(value);
      }
    }

    return result;
  } catch {
    return null;
  }
}

function parseScalarValue(value: string): any {
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}
