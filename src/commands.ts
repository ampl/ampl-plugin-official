import * as vscode from 'vscode';
import * as path from 'path';
import * as pt from './pseudoterminal';
import { getAmplConsole, getAmplPty } from './extension'; // assuming these are exported from extension.ts
import * as options from './options';
import {getOpenedFolder} from './utils';

export function registerRunCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('AMPL.runFile', runFile),
        vscode.commands.registerCommand('AMPL.solve', () => {
            sendCommandToTerminal("solve;");
        }),
        vscode.commands.registerCommand('AMPL.reset', () => {
            sendCommandToTerminal("reset;");
        }),
        vscode.commands.registerCommand('AMPL.displayEntity', () => {
            displayEntity();
        })
        
    );

}

function displayEntity(): void {
    const editor = vscode.window.activeTextEditor;

    if (editor) {
        const selection = editor.selection;
        let text: string;

        if (!selection.isEmpty) {
            // If there is a selection, get the selected text
            text = editor.document.getText(selection);

            // Adjust the selection for unmatched brackets/parentheses and incomplete words
            text = adjustSelectionForBracketsAndWords(text, editor, selection);
        } else {
            // If no selection, get the word at the cursor position
            const position = selection.active;
            const wordRange = editor.document.getWordRangeAtPosition(position);
            text = wordRange ? editor.document.getText(wordRange) : "";
        }

        if (text.trim()) {
            sendCommandToTerminal(`display ${text};`);
        } else {
            vscode.window.showWarningMessage("No valid expression selected or found.");
        }
    }
}

/**
 * Adjusts the selected text to ensure matching brackets/parentheses and completes half-selected words.
 * @param text The selected text.
 * @param editor The active text editor.
 * @param selection The current selection.
 * @returns The adjusted text.
 */
function adjustSelectionForBracketsAndWords(text: string, editor: vscode.TextEditor, selection: vscode.Selection): string {
    const document = editor.document;
    const openBrackets = ["(", "[", "{"];
    const closeBrackets = [")", "]", "}"];
    const stack: string[] = [];

    // Expand the selection to include incomplete words
    const start = selection.start;
    const end = selection.end;

    const startWordRange = document.getWordRangeAtPosition(start);
    const endWordRange = document.getWordRangeAtPosition(end);

    if (startWordRange) {
        const startWord = document.getText(startWordRange);
        const prefix = startWord.slice(0, start.character - startWordRange.start.character);
        if (!text.startsWith(prefix)) {
            text = prefix + text; // Prepend only the missing part
        }
    }

    if (endWordRange) {
        const endWord = document.getText(endWordRange);
        const suffix = endWord.slice(end.character - endWordRange.start.character);
        if (!text.endsWith(suffix)) {
            text = text + suffix; // Append only the missing part
        }
    }

    // Check for unmatched opening brackets
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (openBrackets.includes(char)) {
            stack.push(char);
        } else if (closeBrackets.includes(char)) {
            const lastOpen = stack.pop();
            if (!lastOpen || openBrackets.indexOf(lastOpen) !== closeBrackets.indexOf(char)) {
                // Unmatched closing bracket, add the corresponding opening bracket
                text = openBrackets[closeBrackets.indexOf(char)] + text;
            }
        }
    }

    // Add any unmatched closing brackets
    while (stack.length > 0) {
        const lastOpen = stack.pop()!;
        text += closeBrackets[openBrackets.indexOf(lastOpen)];
    }

    return text;
}

function sendCommandToTerminal(command : string): void {
    if (options.getUsePseudoTerminal()) {
        const terminal = getAmplPty();
        if (!terminal) return;
        pt.sendToPipe(command);
    }
    else{
        const terminal = getAmplConsole();
        terminal.sendText(command);
    }

}
function runFile(): void {
    runFileWithTerminal();
}

export function runFileWithTerminal(filePath?: string): void {
    let targetFile: string | undefined = filePath;
    if (!targetFile) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        targetFile = editor.document.fileName;
        editor.document.save();
    }

    const changeDir = options.getChangeDirOnRun();
    let filePathToSend: string;
    if (changeDir) {
        const folder = path.dirname(targetFile);
        sendCommandToTerminal(`cd "${folder}";`);
        filePathToSend = path.basename(targetFile);
    } else {
        const openedFolder = getOpenedFolder();
        if (openedFolder) sendCommandToTerminal(`cd "${openedFolder}";`);
        filePathToSend = targetFile;
    }

    switch (path.extname(targetFile)) {
        case ".dat":
            sendCommandToTerminal(`data "${filePathToSend}";`);
            break;
        case ".mod":
            sendCommandToTerminal(`model "${filePathToSend}";`);
            break;
        case ".run":
            sendCommandToTerminal(`include "${filePathToSend}";`);
            break;
    }
}
