import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { client } from "./extension"

const FILENAME = "AMPL.files.json";


function getFilePath(): string {

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return "";
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
        useConfigurationFiles(filesToParse)
    }
}

export function loadFilesFromConfig(): string[] | null {
    const configFilePath = getFilePath()
    if (fs.existsSync(configFilePath)) {
        try {
            const configContent = fs.readFileSync(configFilePath, 'utf-8');
            const config = JSON.parse(configContent);
            return config.filesToParse || [];
        } catch (error) {
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                errorMessage = error.message;
            }
            vscode.window.showErrorMessage(`Failed to load configuration: ${errorMessage}`);
        }
    } else {
        vscode.window.showInformationMessage('No configuration file found, please select files to parse.');
    }
    return null;
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

// Function to pass files to the language server or other parsing logic
export function useConfigurationFiles(filesToParse: string[]): void {
    // Send the updated configuration to the language server
    client.sendNotification('workspace/didChangeConfiguration', {
        settings: { ampl: { filesToParse: filesToParse } }
    });
}
