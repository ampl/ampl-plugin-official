// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as ap from "./amplterminal"
import * as utils from './utils'
import * as pt from "./pseudoterminal"
import * as pr from "./project"
import { registerRunCommands } from './commands';
import * as options from './options';
import { registerLMCommands } from './lmconvert';
import { integer, LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

export let client: LanguageClient;

// Entry point
export function activate(context: vscode.ExtensionContext) {
    initializeExtension(context).catch((error) => {
        console.error("Failed to initialize the extension:", error);
        vscode.window.showErrorMessage("Failed to initialize the AMPL extension. Check the console for details.");
    });
}

async function initializeExtension(context: vscode.ExtensionContext) {
    
        // Initialize AMPL and Java paths
        await utils.initializeAmplPath();
        if (options.getUseLanguageServer()) await utils.initializeJavaPath();

        // Optionally log the paths for debugging
        const amplPath = utils.getAmplPath();
        const javaPath = utils.getJavaPath();
        console.log(`AMPL Path: ${amplPath}`);
        console.log(`Java Path: ${javaPath}`);

        // Check if paths are initialized properly
        if (!amplPath) {
            vscode.window.showErrorMessage("AMPL binary path could not be resolved. Some features may not work.");
        }
        if (!javaPath) {
            vscode.window.showErrorMessage("Java Runtime Environment (JRE) path could not be resolved. Advanced features may not work.");
        }

        // Register commands and other features
        registerCommands(context);
        if (options.getUseLanguageServer()) {
            activateLanguageServer(context);
        }

        // Handle advanced commands configuration
        const advanced = options.getEnableAdvancedCommands();
        vscode.commands.executeCommand("setContext", "AMPL.enableBetaCommands", advanced);

        utils.checkForConflictingExtensions(); 

}



// Register commands for the extension
function registerCommands(context: vscode.ExtensionContext) {

    // Java and language server commands
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.autotedectJava',
        utils.autoDetectJavaPath));
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.selectJavaFolder',
        utils.selectJavaFolder));
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.checkLanguageServerConfiguration',
        utils.cmdCheckLanguageServerConfiguration));

    // Advanced commands (disabled by default)
    context.subscriptions.push(vscode.commands.registerCommand('AMPL.selectFilesToParse', async () => {
        const selectedFiles = await pr.selectFilesToParse();
        if (selectedFiles && selectedFiles.length > 0) {
            await pr.saveFilesToConfig(selectedFiles);
        }
    }));
    context.subscriptions.push(
        vscode.commands.registerCommand('ampl.selectConfiguration', async () => {
            await pr.selectConfiguration();
        })
    );

    // React to configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('vscode.filesToParse')) {
            const updatedFilesToParse = vscode.workspace
                .getConfiguration('AMPL')
                .get<string[]>('filesToParse');
            // Send the updated list to the language server
            client.sendNotification('workspace/didChangeConfiguration', {
                filesToParse: updatedFilesToParse
            });
        }
        if (e.affectsConfiguration("AMPL.Runtime.pathToJRE")) {
            utils.resetJavaPath();
        }
        if (e.affectsConfiguration("AMPL.Advanced.enableAdvancedCommands")) {
            const advanced = options.getEnableAdvancedCommands();
            vscode.commands.executeCommand("setContext", "AMPL.enableBetaCommands", advanced);
        } 
        if( e.affectsConfiguration("AMPL.LanguageServer.diagnosticsEnabled")) {
            const diagnosticsEnabled = options.getDiagnosticsEnabled();
            client.sendNotification('workspace/didChangeConfiguration', {
                diagnosticsEnabled: diagnosticsEnabled
            });
        }
    });

    context.subscriptions.push(vscode.commands.registerCommand(
        "ampl.openConsole", getAmplConsole));

    registerRunCommands(context);
    registerTerminalProfile(context);
    registerLMCommands(context);

}

async function activateLanguageServer(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("AMPL Language Server");
    outputChannel.appendLine("Starting language server...");

    const javaBin = utils.getJavaPath();
    if (!javaBin) {
        vscode.window.showErrorMessage("Could not find Java. Advanced editor functionalities disabled.");
        outputChannel.appendLine("Could not find Java. Advanced editor functionalities disabled.");
        return;
    }

    const classPath = path.join(__dirname, '..', 'libs', 'lib-all.jar');
    const args: string[] = ['-cp', classPath, 'amplls.StdioLauncher'];

    const serverOptions: ServerOptions = {
        run: {
            command: javaBin,
            args: args,
            options: {}
        },
        debug: {
            command: javaBin,
            args: args,
            options: {}
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ampl' }],
        initializationOptions: {
            diagnosticsEnabled: options.getDiagnosticsEnabled()
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
            `Failed to start the language server. Java interpreter: ${javaBin}. Error: ${errorMessage}`
        );
        outputChannel.appendLine(`Failed to start the language server. Error: ${errorMessage}`);
    }
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



