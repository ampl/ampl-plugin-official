import * as path from "path";
import * as vscode from "vscode";
import * as utils from "./utils"
//import PipeCommunication from './amplapi';

export class AMPLTerminal {
  /**
   * name of the terminal
   */
  public name: string;


  /**
   * terminal options for the AMPL terminal, constructed from the amplPath and executableArgs
   */
  public terminalOptions: vscode.TerminalOptions;

  /**
   * constructor for the AMPLTerminal
   * @param {string} name - the name of the terminal
   */
  constructor(name?: string) {
    
    this.name = name || "AMPL";
    this.terminalOptions = {
      name: this.name,
      shellPath: utils.amplPath,
      iconPath: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'logo.png')),
      color: new vscode.ThemeColor("terminal.ansiBlue")
       };
  }
}
