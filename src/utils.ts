import * as os from 'os';
import { execSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

export function getOpenedFolder(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        // Return the path of the first opened folder
        return workspaceFolders[0].uri.fsPath;
    }
    return undefined; // No folder is opened
}



export const amplPath: string | undefined =
  vscode.workspace.getConfiguration("vsampl").get<string>("pathToAMPLbinary") || findExecutable("ampl");

export function findExecutable(exename: string): string | undefined {
  var command : string
  var extension : string
  if (os.platform() == 'win32' ){
     command = 'where'
     extension = 'exe'
  }
  else {
     command = 'which'
     extension = ''
  }
  command=`${command} ${exename}` 

  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    const errorText = "AMPL executable not found. Please set " +
                      "\"Path to AMPL binary\" in VS Code extension settings " +
                      "under the heading AMPL/Runtime. Do you wish to select a binary now?";

    vscode.window.showErrorMessage(errorText, "Yes", "No").then(async (value) => {
      if (value === "Yes") {
        const selectedFiles = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          openLabel: "Select AMPL binary or installation Dir",
          filters: { 'Executables': [extension] } // Add more extensions if needed
        });

        if (selectedFiles && selectedFiles.length > 0) {
          const selectedPath = selectedFiles[0].fsPath;

          // Save the selected path to the settings
          const config = vscode.workspace.getConfiguration("vsampl");
          await config.update("pathToAMPLbinary", selectedPath, vscode.ConfigurationTarget.Global);

          vscode.window.showInformationMessage(`Selected AMPL binary saved: ${selectedPath}`);
        } else {
          vscode.window.showWarningMessage("No file selected. Please set the path manually in the settings.");
        }
      }
    });

    console.error("Error finding AMPL executable:", error);
    return undefined;
  }
}

export function findJavaExe(): string | undefined {
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    return path.join(javaHome, "bin", "java");
  }
  return findExecutable("java");
}
