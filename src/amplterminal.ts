import * as path from "path";
import * as vscode from "vscode";
import * as utils from "./utils"

export class AMPLTerminal {

  /**
   * Name of the terminal
   */
  public name: string;
  public terminalOptions: vscode.TerminalOptions;


  /**
   * Constructor for the AMPLTerminal
   * @param {string} name - The name of the terminal
   */
  constructor(name?: string) {
      this.name = name || "AMPL";
      this.terminalOptions = {
      name: this.name,
      shellPath: process.platform === "win32" ? "cmd.exe" : utils.getAmplPath(),
      shellArgs: process.platform === "win32"
        ? ["/d", "/c", "chcp 65001>nul & " + utils.getAmplPath()]
        : [],
      iconPath: vscode.Uri.file(path.join(__filename, "..", "..", "resources", "logo.png")),
      color: new vscode.ThemeColor("terminal.ansiBlue"),
    };
  }
}
