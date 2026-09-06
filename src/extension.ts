
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ap from "./amplterminal";
import * as utils from './utils';
import * as pt from "./pseudoterminal";
import * as pr from "./project";
import { registerRunCommands, runFileWithTerminal } from './commands';
import * as options from './options';
import { registerLMCommands } from './lmconvert';
import { integer, LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';
import { UnicodeCompletionProvider } from './unicodeCompletionProvider';
import { latexSymbols } from './unicodeCompletions';

// Minimal Debug Adapter to map Run/Run Without Debugging to AMPL.runFile (root file)
class AmplDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        // Try to get the root file from AMPL.files.json
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let rootFile: string | undefined;
        if (workspaceFolder) {
            const configPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'AMPL.files.json');
            if (fs.existsSync(configPath)) {
                try {
                    const configContent = fs.readFileSync(configPath, 'utf-8');
                    const config = JSON.parse(configContent);
                    // Use the first file as root, or adjust as needed
                    if (Array.isArray(config.filesToParse) && config.filesToParse.length > 0) {
                        rootFile = config.filesToParse[0];
                    } else if (Array.isArray(config.configurations) && config.configurations.length > 0 && Array.isArray(config.configurations[0].filesToParse) && config.configurations[0].filesToParse.length > 0) {
                        rootFile = config.configurations[0].filesToParse[0];
                    }
                } catch (e) {
                    vscode.window.showErrorMessage('Could not read AMPL root file from config.');
                }
            }
        }
        if (rootFile) {
            runFileWithTerminal(vscode.Uri.file(rootFile).toString()); 
        } else {
            runFileWithTerminal();
        }
        // Return a dummy inline debug adapter to satisfy VS Code
        // Return a DebugAdapterInlineImplementation with a no-op handleMessage method
        const emitter = new vscode.EventEmitter<any>();
        const noopAdapter = {
            handleMessage: (_message: any) => {
                // No operation; session ends immediately
            },
            onDidSendMessage: emitter.event,
            dispose: () => { emitter.dispose(); }
        };
        return new vscode.DebugAdapterInlineImplementation(noopAdapter);
    }
}

// Command to create a default launch.json for AMPL
async function createAmplLaunchJson() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }
    const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
    const launchPath = path.join(vscodeDir, 'launch.json');
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir);
    }
    if (fs.existsSync(launchPath)) {
        const overwrite = await vscode.window.showWarningMessage('A launch.json already exists. Overwrite?', 'Yes', 'No');
        if (overwrite !== 'Yes') return;
    }
    const launchConfig = {
        version: '0.2.0',
        configurations: [
            {
                name: 'Run AMPL Root File or current file',
                type: 'ampl',
                request: 'launch',
                noDebug: true
            }
        ]
    };
    fs.writeFileSync(launchPath, JSON.stringify(launchConfig, null, 4), 'utf-8');
    vscode.window.showInformationMessage('AMPL launch.json created at .vscode/launch.json');
}

export let client: LanguageClient;

// Entry point
export function activate(context: vscode.ExtensionContext) {
    checkForUpdates(context);
    initializeExtension(context).catch((error) => {
        console.error("Failed to initialize the extension:", error);
        vscode.window.showErrorMessage("Failed to initialize the AMPL extension. Check the console for details.");
    });

    // Register Debug Adapter Descriptor Factory for 'ampl' debug type
    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('ampl', new AmplDebugAdapterDescriptorFactory())
    );
}

async function checkForUpdates(context: vscode.ExtensionContext) {
  const currentVersion = vscode.extensions.getExtension("AMPLOptimizationInc.ampl-plugin-official")?.packageJSON.version;
  const previousVersion = context.globalState.get<string>("ampl-plugin-official-version");

  if (currentVersion !== previousVersion) {
    // Extension has just been updated (or first install)
    await onExtensionUpdated(previousVersion, currentVersion);
    await context.globalState.update("ampl-plugin-official-version", currentVersion);
  }
}

async function onExtensionUpdated(
  oldVersion: string | undefined,
  newVersion: string | undefined
) {
  if (oldVersion) {
    console.log(`Extension updated: ${oldVersion} → ${newVersion}`);
  } else {
    console.log(`Extension installed: ${newVersion}`);
  }
}


async function initializeExtension(context: vscode.ExtensionContext) {
    // Initialize the AMPL path.
        await utils.initializeAmplPath();

        // Optionally log the paths for debugging
        const amplPath = utils.getAmplPath();
        console.log(`AMPL Path: ${amplPath}`);

        // Check if paths are initialized properly
        if (!amplPath) {
            vscode.window.showErrorMessage("AMPL binary path could not be resolved. Some features may not work.");
        }

        // Register commands and other features
        registerCommands(context);

        // Register LaTeX-to-Unicode completion provider
        const unicodeProvider = new UnicodeCompletionProvider(latexSymbols);
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                [{ language: 'ampl' }, { language: 'ampl-dat' }],
                unicodeProvider,
                '\\'
            )
        );

        registerRunCommands(context);
        // Handle advanced commands configuration
        const advanced = options.getEnableAdvancedCommands();
        vscode.commands.executeCommand("setContext", "AMPL.enableBetaCommands", advanced);

        utils.checkForConflictingExtensions(); 
        try {
            if (options.getUseLanguageServer()) {
                await activateLanguageServer(context);
            } 
        }
         catch (error) {
            console.error("Error activating language server:", error);
        }


}



// Register commands for the extension
function registerCommands(context: vscode.ExtensionContext) {
    // Command to create launch.json
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.createLaunchJson', createAmplLaunchJson));

    // Advanced commands (disabled by default)
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.selectFilesToParse', async () => {
        const selectedFiles = await pr.selectFilesToParse();
        if (selectedFiles && selectedFiles.length > 0) {
            await pr.saveFilesToConfig(selectedFiles);
        }
    }));
    context.subscriptions.push(
        vscode.commands.registerCommand('AMPL.selectConfiguration', async () => {
            await pr.selectConfiguration();
        })
    );

    // React to configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('AMPL.filesToParse')) {
            const updatedFilesToParse = vscode.workspace.getConfiguration('AMPL').get<string[]>('filesToParse');
            // Send the updated list to the language server
            client.sendNotification('workspace/didChangeConfiguration', {
                settings: { ampl: { filesToParse: updatedFilesToParse } }
            });
        }
        if (e.affectsConfiguration("AMPL.Advanced.enableAdvancedCommands")) {
            const advanced = options.getEnableAdvancedCommands();
            vscode.commands.executeCommand("setContext", "AMPL.enableBetaCommands", advanced);
        }
        if (e.affectsConfiguration("AMPL.LanguageServer.diagnosticsEnabled")) {
            const diagnosticsEnabledValue = options.getDiagnosticsEnabled();
            client.sendNotification('workspace/didChangeConfiguration', {
                settings: { ampl: { diagnosticsEnabled: diagnosticsEnabledValue } }
            });
        }
        if (e.affectsConfiguration("AMPL.LanguageServer.measureUnitsEnabled")) {
            const measureUnitsEnabledValue = options.getMeasureUnitsEnabled();
            client.sendNotification('workspace/didChangeConfiguration', {
                settings: { ampl: { measureUnitsEnabled: measureUnitsEnabledValue } }
            });
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand("AMPL.openConsole", getAmplConsole));
    registerTerminalProfile(context);
    registerLMCommands(context);
}

async function activateLanguageServer(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("AMPL Language Server");
    outputChannel.appendLine("Starting language server...");
    const executableName = process.platform === 'win32' ? 'ampl-lsp.exe' : 'ampl-lsp';
    const bundledPath = path.join(context.extensionPath, 'libs', executableName);

    let serverOptions: ServerOptions;
    if (fs.existsSync(bundledPath)) {
        outputChannel.appendLine(`Using language server executable: ${bundledPath}`);
        serverOptions = {
            run: { command: bundledPath, options: {} },
            debug: { command: bundledPath, options: {} }
        };
    } else {
        // No native binary for this platform: fall back to the static,
        // no-longer-maintained Java implementation bundled as libs/ampl-ls.jar.
        const jarPath = path.join(context.extensionPath, 'libs', 'ampl-ls.jar');
        if (!fs.existsSync(jarPath)) {
            vscode.window.showErrorMessage(
                `No AMPL language server is bundled for this platform (looked for ${bundledPath} and ${jarPath}).`
            );
            outputChannel.appendLine("No native binary or fallback jar found.");
            return;
        }

        const javaBin = await utils.findJavaForFallback();
        if (!javaBin) {
            vscode.window.showErrorMessage(
                "This platform has no native AMPL language server; running the bundled fallback requires a Java runtime (11+) on JAVA_HOME or PATH."
            );
            outputChannel.appendLine("No Java runtime found for the fallback jar.");
            return;
        }

        outputChannel.appendLine(`Using fallback language server: ${javaBin} -cp ${jarPath} amplls.StdioLauncher`);
        const runOptions = { command: javaBin, args: ['-cp', jarPath, 'amplls.StdioLauncher'], options: {} };
        serverOptions = { run: runOptions, debug: runOptions };
    }
    const languageServerCommand = serverOptions.run.command;

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ampl' }],
        middleware: {
            provideDocumentFormattingEdits: (document, options, token, next) => {
                return undefined;  //next(document, options, token);
            },
            provideDocumentRangeFormattingEdits: (document, range, options, token, next) => {
                return undefined;
            }
        },
        initializationOptions: {
            diagnosticsEnabled: options.getDiagnosticsEnabled(),
            measureUnitsEnabled: options.getMeasureUnitsEnabled()
        },
        synchronize: {
            configurationSection: 'ampl'
        },
        outputChannel // Redirect language server output to the output channel
    };

    client = new LanguageClient('AMPLlanguageserver', 'AMPL Language Server', serverOptions, clientOptions);

    try {
        await client.start();
        outputChannel.appendLine("Language server is ready.");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
            `Failed to start the language server executable (${languageServerCommand}). Error: ${errorMessage}`
        );
        outputChannel.appendLine(`Failed to start the language server. Error: ${errorMessage}`);
        return;
    }
    pr.openIfDefaultConfiguration({ startup: true }).catch(err => console.error(err));
    

}


function registerTerminalProfile(context: vscode.ExtensionContext) {
    const usePseudo = options.getUsePseudoTerminal();
    const provider: vscode.TerminalProfileProvider = {
        provideTerminalProfile(): vscode.ProviderResult<vscode.TerminalProfile> {
            const terminalOptions = new ap.AMPLTerminal("AMPL").terminalOptions;

            if (usePseudo) {
                const pty = pt.createAMPLPty(true);
                if (!pty) {
                    vscode.window.showErrorMessage("AMPL executable not found. Cannot create pseudo terminal.");
                    return undefined;
                }

                return new vscode.TerminalProfile({
                    ...terminalOptions,  // reuse name, iconPath, color
                    pty                  // override shellPath/shellArgs with pty
                });
            } else {
                return new vscode.TerminalProfile(terminalOptions);
            }
        }
    };
    context.subscriptions.push(
        vscode.window.registerTerminalProfileProvider('AMPL.shell', provider)
    );
}



function getNAMPLTerminalsOpen(): integer {
    return vscode.window.terminals.filter(element => element.name === pt.defaultName()).length;
}
function getAMPLTerminalSingleton(): vscode.Terminal | undefined {
    return vscode.window.terminals.find(element => element.name === pt.defaultName());
}

/** Get or create the pseudterminal (in beta).
 * If only one is present, although not active, returns it.
 * If many are present, create a new one.
 */
export function getAmplPty(): vscode.Terminal | undefined {

    var terminal = vscode.window.activeTerminal;
    if (!terminal || terminal.name !== pt.defaultName()) {
        if (getNAMPLTerminalsOpen() == 1)
            return getAMPLTerminalSingleton()
        return pt.createAMPLPseudoTerminal(); // <- now returns Terminal again
    }
    return terminal;
}

/**
 * Get or create the (normal) AMPL terminal
 * @returns {vscode.Terminal} - the ampl console
 */
export function getAmplConsole(): vscode.Terminal {
    const terminal = vscode.window.activeTerminal;

    if (!terminal || terminal.name !== "AMPL") {
        if (getNAMPLTerminalsOpen() == 1) {
            const singleton = getAMPLTerminalSingleton();
            if (singleton) return singleton;
        }
        const amplTerminal = new ap.AMPLTerminal();
        const g_terminal = vscode.window.createTerminal(amplTerminal.terminalOptions);
        g_terminal.show(false);
        return g_terminal;
    }
    return terminal;
}



