import * as vscode from 'vscode';

/**
 * Provides LaTeX-to-Unicode completions for AMPL files.
 *
 * When the user types a backslash followed by a LaTeX name (e.g. `\alpha`),
 * this provider offers to replace it with the corresponding Unicode character (e.g. `α`).
 */
export class UnicodeCompletionProvider implements vscode.CompletionItemProvider {
    private readonly completionItems: vscode.CompletionItem[];

    constructor(symbols: Record<string, string>) {
        this.completionItems = Object.keys(symbols).map((key) => {
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Text);
            item.insertText = symbols[key];
            item.detail = symbols[key];
            item.filterText = key;
            return item;
        });
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const wordRange = document.getWordRangeAtPosition(position, /\\[\^_]?[^\s\\]*/);
        if (!wordRange) {
            return [];
        }
        const range = wordRange.with(undefined, position);
        return this.completionItems.map((item) => {
            const clone = new vscode.CompletionItem(item.label, item.kind);
            clone.insertText = item.insertText;
            clone.detail = item.detail;
            clone.filterText = item.filterText;
            clone.range = range;
            return clone;
        });
    }
}
