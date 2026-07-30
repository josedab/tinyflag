import * as vscode from 'vscode';
import type { FlagInfo } from './flag-index.js';

const documentSelector: vscode.DocumentSelector = [
  { scheme: 'file', language: 'typescript' },
  { scheme: 'file', language: 'typescriptreact' },
  { scheme: 'file', language: 'javascript' },
  { scheme: 'file', language: 'javascriptreact' },
];

export function registerLanguageProviders(
  context: vscode.ExtensionContext,
  getFlags: () => ReadonlyMap<string, FlagInfo>,
  getFlagsFilePath: () => string | undefined,
): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      documentSelector,
      {
        provideCompletionItems(document, position) {
          const lineText = document.lineAt(position).text;
          const beforeCursor = lineText.substring(0, position.character);
          if (!/(?:isEnabled|getVariant)\s*\(\s*['"]?[^'"]*$/.test(beforeCursor)) {
            return undefined;
          }

          const items: vscode.CompletionItem[] = [];
          for (const [name, flag] of getFlags()) {
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
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(documentSelector, {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /['"][a-z0-9-]+['"]/);
        if (!range) return undefined;

        const word = document.getText(range).replace(/['"]/g, '');
        const flag = getFlags().get(word);
        if (!flag) return undefined;

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
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(documentSelector, {
      provideDefinition(document, position) {
        const range = document.getWordRangeAtPosition(position, /['"][a-z0-9-]+['"]/);
        const flagsFilePath = getFlagsFilePath();
        if (!range || !flagsFilePath) return undefined;

        const word = document.getText(range).replace(/['"]/g, '');
        const flag = getFlags().get(word);
        if (!flag) return undefined;

        const lineText = document.lineAt(position).text;
        if (!/(?:isEnabled|getVariant)\s*\(/.test(lineText)) return undefined;

        return new vscode.Location(
          vscode.Uri.file(flagsFilePath),
          new vscode.Position(flag.line, 0),
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(documentSelector, {
      provideCodeLenses(document) {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const pattern = /(?:isEnabled|getVariant)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(text)) !== null) {
          const flagName = match[1];
          const pos = document.positionAt(match.index);
          const range = new vscode.Range(pos, pos);
          const flag = getFlags().get(flagName);

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
            const label =
              flag.rollout !== undefined
                ? `✅ ${flagName} (${flag.rollout}% rollout)`
                : `✅ ${flagName}`;
            lenses.push(new vscode.CodeLens(range, { title: label, command: '' }));
          }
        }
        return lenses;
      },
    }),
  );
}
