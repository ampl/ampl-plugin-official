"use strict";
import * as ap from "./amplterminal"
import * as vscode from "vscode";
import { exec as cpExec } from "child_process";
import { promisify } from "util";
import { AMPLAPI } from "./amplapi";
import * as utils from "./utils";

import { integer } from "vscode-languageclient";

// promisified Node executable (Node 10+)
const exec = promisify(cpExec);

// Settings
const defaultLine = ""; // "→ ";
var currentPrompt = "";
const keys = {
  enter: "\r",
  backspace: "\x7f",
  arrowUp: "\x1b[A",
  arrowDown: "\x1b[B",
};
const actions = {
  cursorBack: "\x1b[D",
  deleteChar: "\x1b[P",
  clear: "\x1b[2J\x1b[3J\x1b[;H",
};

// Cleanup inconsistent line breaks
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join("\r")}\r`;

export function defaultName() : string {
  return "AMPL";

}
var writeEmitter: vscode.EventEmitter<string>;

var pipe : AMPLAPI;

export function sendToPipe(what: string){
    pipe.send(what);
}


// Returns just the raw Pseudoterminal (for use with profile provider)
export function createAMPLPty(start: boolean = false): vscode.Pseudoterminal | undefined {
  writeEmitter = new vscode.EventEmitter<string>();

  let amplPath = utils.amplPath
if (amplPath == undefined) return undefined;

  // Create the pipe but don't start it immediately
pipe = new AMPLAPI(amplPath, ["-b"]);

let terminalReady = false;
let messageBuffer: { type: string; content: string }[] = [];
let commandHistory: string[] = []; // Store command history
let historyIndex = -1; // Track current position in history
let currentCommand = ""; // Track the current command being edited

  // Method to clear the whole current line
const clearCurrentLine = () => {
  writeEmitter.fire("\x1b[0G");  // Move cursor to the beginning of the line
  writeEmitter.fire("\x1b[2K");  // Clear the entire line
};



// Buffer the messages until the terminal is ready
pipe.on("message", ({ type, content }) => {
  if (terminalReady) {
    if (!type.startsWith("prompt")) {
      if ( type.startsWith("error"))
        writeEmitter.fire(colorText(formatText(content),1));
      else
        writeEmitter.fire(formatText(content));
    } else {
      currentPrompt=content;
      writeEmitter.fire(colorText(content,7));
    }
  } else {
    messageBuffer.push({ type, content }); // Buffer messages
  }
});
 // Content initialization
 let content = defaultLine;

 // Handle workspaces
 const workspaceRoots: readonly vscode.WorkspaceFolder[] | undefined =
   vscode.workspace.workspaceFolders;
 if (!workspaceRoots || !workspaceRoots.length) {
   // No workspace root
   return undefined;
 }
 const workspaceRoot: string = workspaceRoots[0].uri.fsPath || "";

 const pty = {
   onDidWrite: writeEmitter.event,
   open: () => {
     writeEmitter.fire(content);
     terminalReady = true;

     // Flush buffered messages once the terminal is ready
     while (messageBuffer.length > 0) {
       const { type, content } = messageBuffer.shift()!;
       if (type != "prompt1") {
         writeEmitter.fire(formatText(content));
       }
       else {
        writeEmitter.fire(colorText(content,7));
       }
     }
   },
   close: () => {},
   handleInput: async (char: string) => {
     switch (char) {
       case keys.enter:
         // Preserve the run command line for history
         const command = currentCommand.trim();
         if (command) {
           pipe.send(command);
           commandHistory.push(command); // Add command to history
           historyIndex = commandHistory.length; // Reset history index
         }
         currentCommand = defaultLine;
         writeEmitter.fire("\r\n");
         break;

       case keys.backspace:
         if (currentCommand.length <= defaultLine.length) {
           return;
         }
         // Remove last character
         currentCommand = currentCommand.slice(0, -1);
         writeEmitter.fire(actions.cursorBack);
         writeEmitter.fire(actions.deleteChar);
         break;

       case keys.arrowUp:
         if (historyIndex > 0) {
           historyIndex--;
           currentCommand = commandHistory[historyIndex];
           clearCurrentLine();
           writeEmitter.fire(currentPrompt + currentCommand);
         }
         break;

       case keys.arrowDown:
         if (historyIndex < commandHistory.length - 1) {
           historyIndex++;
           currentCommand = commandHistory[historyIndex];
           //writeEmitter.fire(actions.clear);
           clearCurrentLine();
           writeEmitter.fire(currentPrompt + currentCommand);
         } else {
           historyIndex = commandHistory.length;
           currentCommand = defaultLine;
           clearCurrentLine();
           writeEmitter.fire(currentPrompt);
         }
         break;

       default:
         // Typing a new character
         currentCommand += char;
         writeEmitter.fire(char);
     }
   },
 };
 if(start) pipe.start(); 
 return pty;
}

// Returns a Terminal (calls createTerminal)
export function createAMPLPseudoTerminal()  : vscode.Terminal  | undefined{
  const pty = createAMPLPty();
  if (!pty) return undefined;
  const terminalOptions = new ap.AMPLTerminal("AMPL").terminalOptions;
  const terminal = vscode.window.createTerminal({
    name: defaultName(),
    pty,
    ...terminalOptions  // reuse name, iconPath, color
  });

  terminal.show();
  pipe.start(); // only start once shown
  return terminal;
}


function colorText(text: string, color: integer): string {
  // 1 is red, 3 is green
return `\x1b[3${color++}m${text}\x1b[0m`;
  /*
	let output = '';
	let colorIndex = 1;
	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		if (char === ' ' || char === '\r' || char === '\n') {
			output += char;
		} else {
			output += `\x1b[3${colorIndex++}m${text.charAt(i)}\x1b[0m`;
			if (colorIndex > 6) {
				colorIndex = 1;
			}
		}
	}*/
}
