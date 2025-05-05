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
// This method is called when your extension is activated 

export function activate(context: vscode.ExtensionContext) {
	registerCommands(context);
	if (options.useLanguageServer()) activateLanguageServer(context);

	const config = vscode.workspace.getConfiguration("vsampl");
	const advanced = config.get<boolean>("enableAdvancedCommands", false);
	vscode.commands.executeCommand("setContext", "vsampl.enableBetaCommands", advanced);

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration("vsampl.enableAdvancedCommands")) {
		  const advanced = vscode.workspace.getConfiguration("vsampl").get("enableAdvancedCommands", false);
		  vscode.commands.executeCommand("setContext", "vsampl.enableBetaCommands", advanced);
		}
	  });
	  
}


// Register commands for the extension
function registerCommands(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand('vsampl.selectFilesToParse', async () => {
		const selectedFiles = await pr.selectFilesToParse();
		if (selectedFiles && selectedFiles.length > 0) {
			await pr.saveFilesToConfig(selectedFiles);
		}
	})
	context.subscriptions.push(
		vscode.commands.registerCommand('vsampl.selectConfiguration', async () => {
			await pr.selectConfiguration();
		})
	);
	vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('vscode.filesToParse')) {
			const updatedFilesToParse = vscode.workspace
				.getConfiguration('vsampl')
				.get<string[]>('filesToParse');

			// Send the updated list to the language server
			client.sendNotification('workspace/didChangeConfiguration', {
				filesToParse: updatedFilesToParse
			});
		}
	});

	context.subscriptions.push(vscode.commands.registerCommand(
		"vsampl.openConsole", getAmplConsole));

	registerRunCommands(context);
	registerTerminalProfile(context);
	registerLMCommands(context);

}

function activateLanguageServer(context: vscode.ExtensionContext) {
	// Name of the launcher class which contains the main.
	const main: string = 'amplls.StdioLauncher';

	// Get the java home from the process environment.
	const JAVA_HOME = utils.findJavaExe();
	if (JAVA_HOME == undefined) {
		console.log("Could not find Java. Advanced editor functionalities disabled.");
		return;
	}
	console.log(`Using java from JAVA_HOME: ${JAVA_HOME}`);
	// If java home is available continue.
	if (JAVA_HOME) {
		// Java execution path.
		let excecutable: string = JAVA_HOME;

		// path to the launcher.jar
		let classPath = path.join(__dirname, '..', 'libs', 'lib-all.jar');

		console.log(`executing ${classPath}`)
		const args: string[] = ['-cp', classPath];

		let serverOptions: ServerOptions = {
			command: excecutable,
			args: [...args, main],
			options: {}
		};
		const diagnosticsEnabled = options.diagnosticsEnabled()

		// Options to control the language client
		let clientOptions: LanguageClientOptions = {
			// Register the server for AMPL files
			documentSelector: [{ scheme: 'file', language: 'vsampl' }],
			initializationOptions: {
				diagnosticsEnabled: diagnosticsEnabled
			},
			synchronize: {
				configurationSection: 'vsampl'
			}
		};

		// Create the language client and start the client.
		client = new LanguageClient('AMPLlanguageserver', 'AMPL Language Server', serverOptions, clientOptions)

		// When a file is opened or saved, send a notification to the server
		vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
			sendBaseDocumentNotification(document);
		});

		vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
			sendBaseDocumentNotification(document);
		});

		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('vsampl.filesToParse')) {
				const updatedFilesToParse = vscode.workspace
					.getConfiguration('vsampl')
					.get<string[]>('filesToParse');
				// Send the updated configuration to the language server
				client.sendNotification('workspace/didChangeConfiguration', {
					settings: { filesToParse: updatedFilesToParse }
				});
			}
		});

		client.start();


		// Function to send the base document content via notification
		function sendBaseDocumentNotification(document: vscode.TextDocument) {
			const baseDocumentUri = document.uri;
			client.sendNotification('custom/baseDocument', {
				path: baseDocumentUri.path
			});
		}
	}
}


function registerTerminalProfile(context: vscode.ExtensionContext) {
	const usePseudo = vscode.workspace.getConfiguration('vsampl').get<boolean>('enablePsuedoTerminal', false);

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
		vscode.window.registerTerminalProfileProvider('vsampl.shell', provider)
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
		if(getNAMPLTerminalsOpen() == 1)
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
		if(getNAMPLTerminalsOpen() == 1) {
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



