import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {Node, parseTree, applyEdits, modify, printParseErrorCode } from 'jsonc-parser';


export function activate(context: vscode.ExtensionContext) {

    const provider = vscode.debug.registerDebugConfigurationProvider('amplProject', {
        resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration) {

            // Set default values if not provided
            if (!config.type) {
                config.type = 'amplProject';
            }
            if (!config.request) {
                config.request = 'launch';
            }
            if (!config.program) {
                config.program = '${workspaceFolder}/path/to/amplBinary';  // Path to your binary
            }

            // Resolve the workspace folder
            const workspaceFolder = folder?.uri.fsPath;

            // Ensure fileList is specified; if not, show an error
            if (!config.fileList || config.fileList.length === 0) {
                vscode.window.showErrorMessage("No files specified for parsing.");
                return null; // Cancel the launch
            }

            // Resolve each file path in fileList
            const resolvedFiles = config.fileList.map((file: string) => {
                // If the file path is already absolute, use it as-is
                if (path.isAbsolute(file)) {
                    return file;
                }

                if (workspaceFolder != null)
                    return path.join(workspaceFolder, file);
            });

            // Ensure all files exist before launching
            const missingFiles = resolvedFiles.filter((file: string) => !fs.existsSync(file));

            if (missingFiles.length > 0) {
                vscode.window.showErrorMessage(`These files do not exist: ${missingFiles.join(', ')}`);
                return null; // Cancel the launch
            }

            // Pass the resolved files as arguments to the binary
            config.args = resolvedFiles;

            // Set the working directory
            if (!config.cwd) {
                config.cwd = workspaceFolder;
            }

            return config;
        }
    });

    context.subscriptions.push(provider);
}


export function activateCmd(context: vscode.ExtensionContext) {
    // Register the command
    const disposable = vscode.commands.registerCommand('vsampl.addFileToConfiguration', async (uri: vscode.Uri) => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder is open.");
            return;
        }

        // Path to the launch.json file
        const launchConfigPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
        
        // Read the existing launch.json file
        let launchConfigContent = '{}';
        if (fs.existsSync(launchConfigPath)) {
            launchConfigContent = fs.readFileSync(launchConfigPath, 'utf8');
        }

        // Parse the launch.json content with jsonc-parser (supports comments)
        let errors: any[] = [];
        const launchConfig = parseTree(launchConfigContent, errors);

        if (errors.length > 0) {
            vscode.window.showErrorMessage("Error parsing launch.json: " + errors.map(e => printParseErrorCode(e.error)).join(', '));
            return;
        }

        // Ensure configurations exist in launch.json
              // Ensure configurations exist in launch.json
        if (!launchConfig || !launchConfig.children) {
            vscode.window.showErrorMessage("Invalid launch.json structure.");
            return;
        }

        // Find the configurations node
        const configurationsNode = launchConfig.children.find((node: any) => node.label === 'configurations');
        if (!configurationsNode || !configurationsNode.children) {
            vscode.window.showErrorMessage("No nodes.");
            return;
        }
    
        var amplConfigIndex : number = 0;
        const amplConfig = configurationsNode.children.find((config: Node, index: number) => {
            if (config.type === 'object' && config.children?.some((property: any) => property.label === 'type' && property.value === 'amplBinary')) {
                amplConfigIndex = index;  // Store the index of amplConfig
                return true;
            }
            return false;
        });

        if (!amplConfig) {
            // Create a new AMPL configuration if it doesn't exist
            const newAmplConfig = {
                name: "Launch AMPL Binary",
                type: "amplBinary",
                request: "launch",
                program: "${workspaceFolder}/path/to/amplBinary",
                fileList: [],
                console: "integratedTerminal",
                cwd: "${workspaceFolder}"
            };
            const edits = modify(launchConfigContent, ['configurations', -1], newAmplConfig, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
            launchConfigContent = applyEdits(launchConfigContent, edits);
        }

        // Resolve the file path and add it to the fileList
        const relativeFilePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        var fileListNode : Node | undefined;
        if(amplConfig?.children) {
         fileListNode = amplConfig?.children.find((property: any) => property.label === 'fileList');
        } 
        if(!amplConfig)
            return;

        if (fileListNode && !fileListNode.value.includes("${workspaceFolder}/" + relativeFilePath)) {
            const edits = modify(launchConfigContent, ['configurations', amplConfigIndex, 'fileList', -1], 
                "${workspaceFolder}/" + relativeFilePath, 
                { formattingOptions: { insertSpaces: true, tabSize: 2 } });
            launchConfigContent = applyEdits(launchConfigContent, edits);
        } else {
            vscode.window.showInformationMessage("File already exists in the configuration.");
        }

        // Write the updated configuration back to launch.json (retaining comments)
        if (!fs.existsSync(path.join(workspaceFolder.uri.fsPath, '.vscode'))) {
            fs.mkdirSync(path.join(workspaceFolder.uri.fsPath, '.vscode'));
        }
        fs.writeFileSync(launchConfigPath, launchConfigContent, 'utf8');

        vscode.window.showInformationMessage(`File ${uri.fsPath} added to AMPL configuration.`);
    });
    context.subscriptions.push(disposable);
}
