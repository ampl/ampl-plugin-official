import * as path from "path";
import * as vscode from "vscode";
import * as utils from "./utils"
//import PipeCommunication from './amplapi';

export class AMPLTerminal {
  /**
   * Name of the terminal
   */
  public name: string;

  /**
   * Terminal options for the AMPL terminal, constructed from the amplPath and executableArgs
   */
  public terminalOptions: vscode.TerminalOptions;


  /**
   * Constructor for the AMPLTerminal
   * @param {string} name - The name of the terminal
   */
  constructor(name?: string) {
    this.name = name || "AMPL";
    this.terminalOptions = {
      name: this.name,
      shellPath: utils.getAmplPath(), // Placeholder, will be set asynchronously
      iconPath: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'logo.png')),
      color: new vscode.ThemeColor("terminal.ansiBlue"),
    };
  }
}
