import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { client } from "./extension"

const FILENAME = "AMPL.files.json";


function getFilePath(): string {

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found, please open a folder (File/Open Folder) to use this functionality.');
        return "";
    }
    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }
    return path.join(workspaceFolder.uri.fsPath, '.vscode', FILENAME);
}

export async function selectFilesToParse(): Promise<string[] | undefined> {
    // Show file picker to the user
    const files = await vscode.window.showOpenDialog({
        canSelectMany: true,  // Allow multiple file selection
        openLabel: 'Select Files to Parse'
    });

    if (files) {
        // Map the selected files to their file paths
        return files.map(file => file.fsPath);
    }
    return undefined;
}

export async function saveFilesToConfig(filesToParse: string[]): Promise<void> {
    const configFilePath = getFilePath()

    if(configFilePath == "")
        return;
    // Prepare the configuration content
    const configContent = {
        configurations: [
            {
                name: "default",
                filesToParse: filesToParse
            }]
    };

    try {
        // Write the content to the configuration file
        fs.writeFileSync(configFilePath, JSON.stringify(configContent, null, 2));
    } catch (error) {
        let errorMessage = 'An unknown error occurred';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        vscode.window.showErrorMessage(`Failed to save configuration: ${errorMessage}`);

    }
    useConfigurationFiles(filesToParse)
}


export async function selectConfiguration(): Promise<void> {
    const configFilePath = getFilePath()
    if (!fs.existsSync(configFilePath)) {
        vscode.window.showErrorMessage('No configuration file found!');
        return;
    }

    let configurations: any[] = [];

    try {
        const configFileContent = fs.readFileSync(configFilePath, 'utf-8');
        const configFile = JSON.parse(configFileContent);
        configurations = configFile.configurations || [];
    } catch (error) {

        vscode.window.showErrorMessage('Failed to read the configuration file.');
        return;
    }

    if (configurations.length === 0) {
        vscode.window.showErrorMessage('No configurations found in the file.');
        return;
    }

    // Show quick pick menu to choose a configuration
    const selectedConfig = await vscode.window.showQuickPick(
        configurations.map(config => config.name),
        { placeHolder: 'Select a launch configuration' }
    );

    if (selectedConfig) {
        // Find the selected configuration
        const chosenConfig = configurations.find(config => config.name === selectedConfig);
        if (chosenConfig) {
            // vscode.window.showInformationMessage(`Selected: ${chosenConfig.name}`);
            // Pass the selected filesToParse to your language server or other logic
            useConfigurationFiles(chosenConfig.filesToParse);
        }
    }
}


export async function openIfDefaultConfiguration({startup = false}: {startup?: boolean} = {}): Promise<void> {
    const configFilePath = getFilePath();

    // On startup, avoid noisy popups; just bail quietly if missing/invalid.
    const notifyError = (msg: string) =>
        startup ? console.warn(msg) : vscode.window.showErrorMessage(msg);

    if (!fs.existsSync(configFilePath)) {
        return;
    }

    let configurations: any[] = [];
    try {
        const configFileContent = fs.readFileSync(configFilePath, 'utf-8');
        const configFile = JSON.parse(configFileContent);

        const raw = configFile?.configurations;
        configurations = Array.isArray(raw) ? raw : [];
    } catch {
         notifyError('Failed to read the configuration file.');
         return;
    }

    if (configurations.length === 0) {
         notifyError('No configurations found in the file.');
         return;''
    }

    if (configurations.length === 1) {
        const only = configurations[0];
        if (!only?.filesToParse || !Array.isArray(only.filesToParse) || only.filesToParse.length === 0) {
            return;
        }
        useConfigurationFiles(only.filesToParse);
        return;
    }
}

// Function to pass files to the language server or other parsing logic
export function useConfigurationFiles(filesToParse: string[]): void {
    // Send the updated configuration to the language server
    client.sendNotification('workspace/didChangeConfiguration', {
        settings: { ampl: { filesToParse: filesToParse } }
    });
}
