import * as vscode from 'vscode';
import { findFlagDiagnostics, type FlagInfo } from './flag-index.js';

export function updateDiagnostics(
  document: vscode.TextDocument,
  collection: vscode.DiagnosticCollection,
  flags: ReadonlyMap<string, FlagInfo>,
): void {
  if (
    !['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(
      document.languageId,
    )
  ) {
    return;
  }

  const diagnostics = findFlagDiagnostics(document.getText(), flags).map((diagnostic) => {
    const range = new vscode.Range(
      document.positionAt(diagnostic.start),
      document.positionAt(diagnostic.end),
    );
    const severity =
      diagnostic.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
    return new vscode.Diagnostic(range, diagnostic.message, severity);
  });

  collection.set(document.uri, diagnostics);
}
