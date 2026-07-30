import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { indexFlags, type FlagInfo } from './flag-index.js';
import { registerLanguageProviders } from './providers.js';
import { updateDiagnostics } from './diagnostics.js';

let flagsMap = new Map<string, FlagInfo>();
let flagsFilePath: string | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('tinyflag');
  context.subscriptions.push(diagnosticCollection);

  loadFlags();
  registerLanguageProviders(
    context,
    () => flagsMap,
    () => flagsFilePath,
  );

  const config = vscode.workspace.getConfiguration('tinyflag');
  const flagsFileName = config.get<string>('flagsFile', 'flags.yml');
  const fileWatcher = vscode.workspace.createFileSystemWatcher(`**/${flagsFileName}`);
  fileWatcher.onDidChange(() => loadFlags());
  fileWatcher.onDidCreate(() => loadFlags());
  fileWatcher.onDidDelete(() => {
    flagsMap.clear();
    diagnosticCollection.clear();
  });
  context.subscriptions.push(fileWatcher);

  vscode.workspace.onDidSaveTextDocument((document) =>
    updateDiagnostics(document, diagnosticCollection, flagsMap),
  );
  vscode.workspace.onDidOpenTextDocument((document) =>
    updateDiagnostics(document, diagnosticCollection, flagsMap),
  );
  vscode.window.visibleTextEditors.forEach((editor) =>
    updateDiagnostics(editor.document, diagnosticCollection, flagsMap),
  );
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
      if (!/^flags:\s*$/m.test(content)) continue;
      flagsMap = indexFlags(content, filePath);
      flagsFilePath = filePath;
      break;
    } catch {
      // Ignore unreadable or malformed flag files.
    }
  }
}
