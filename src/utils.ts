import * as os from 'os';
import {  spawn, execSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

let amplPath: string | undefined = undefined;
let javaPath: string | undefined = undefined;

/**
 * Initializes the AMPL path and stores it in a global variable.
 */
export async function initializeAmplPath(): Promise<void> {
    amplPath = await vscode.workspace.getConfiguration("AMPL").get<string>("pathToAMPLbinary") || await findAmplBinary();
}

/**
 * Initializes the Java path and stores it in a global variable.
 */
export async function initializeJavaPath(force: boolean = false): Promise<void> {
    if (force) {
        javaPath = await findJava(amplPath);
    } else
    javaPath = await vscode.workspace.getConfiguration("AMPL").get<string>("pathToJRE") || await findJava(amplPath);
}
export function resetJavaPath() {
    javaPath = undefined;
}
/**
 * Synchronously retrieves the AMPL path after initialization.
 */
export function getAmplPath(): string | undefined {
    return amplPath;
}

/**
 * Synchronously retrieves the Java path after initialization.
 */
export function getJavaPath(): string | undefined {
    return javaPath;
}

/**
 * Finds an executable by its name using platform-specific commands.
 * @param exename The name of the executable to find.
 * @returns The path to the executable if found, otherwise undefined.
 */
async function findExecutable(exename: string): Promise<string | undefined> {
    const command = os.platform() === 'win32' ? 'where' : 'which';
    try {
        let output = execSync(`${command} ${exename}`, { encoding: 'utf8' }).trim();
        const paths = output.split(/\r?\n/); // Split by \r\n (Windows) or \n (Unix)
        return paths[0]; // Return the first found path
    } catch (error) {
        console.error(`Error finding executable '${exename}':`, error);
        return undefined;
    }
}

/**
 * Finds the AMPL binary by checking the system paths.
 * @returns The path to the AMPL binary if found, otherwise undefined.
 */
export async function findAmplBinary(): Promise<string | undefined> {
    const amplBinary = await findExecutable('ampl');
    if (!amplBinary) {
        const errorText = "AMPL executable not found. Please set " +
            "\"Path to AMPL binary\" in VS Code extension settings " +
            "under the heading AMPL/Runtime. Do you wish to select a binary now?";

        vscode.window.showErrorMessage(errorText, "Yes", "No").then(async (value) => {
            if (value === "Yes") {
                const selectedFiles = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectMany: false,
                    canSelectFolders: false,
                    openLabel: "Select AMPL binary",
                    filters: { 'Executables': [os.platform() === 'win32' ? 'exe' : ''] } // Add more extensions if needed
                });

                if (selectedFiles && selectedFiles.length > 0) {
                    const selectedPath = selectedFiles[0].fsPath;

                    // Save the selected path to the settings
                    const config = vscode.workspace.getConfiguration("AMPL");
                    await config.update("pathToAMPLbinary", selectedPath, vscode.ConfigurationTarget.Global);

                    vscode.window.showInformationMessage(`Selected AMPL binary saved: ${selectedPath}`);
                    return selectedPath;
                } else {
                    vscode.window.showWarningMessage("No file selected. Please set the path manually in the settings.");
                }
            }
        });
    }
    return amplBinary;
}

/**
 * Finds the Java executable by checking various locations.
 * @param amplPath The path to the AMPL directory.
 * @returns The path to the Java executable if found, otherwise undefined.
 */
export async function findJava(amplPath: string | undefined): Promise<string | undefined> {
    const javaExecutable = os.platform() === 'win32' ? 'java.exe' : 'java';

    // Check in the JRE subdirectory of the AMPL directory
    if (amplPath) {
        const javaInAmplJRE = path.join(amplPath, 'JRE', javaExecutable);
        try {
            if (await vscode.workspace.fs.stat(vscode.Uri.file(javaInAmplJRE))) {
                return javaInAmplJRE;
            }
        } catch {
            // File does not exist, continue to the next check
        }
    }

    // Check JAVA_HOME environment variable
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const javaInJavaHome = path.join(javaHome, 'bin', javaExecutable);
        try {
            if (await vscode.workspace.fs.stat(vscode.Uri.file(javaInJavaHome))) {
                return javaInJavaHome;
            }
        } catch {
            // File does not exist, continue to the next check
        }
    }

    // Check in system paths using findExecutable
    const javaInSystemPath = await findExecutable('java');
    if (javaInSystemPath) {
        return javaInSystemPath;
    }

    // Allow the user to select the Java executable via a file browser
    const selectedFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        canSelectFolders: false,
        openLabel: "Select Java Runtime Environment (java executable)",
        filters: { 'Executables': [os.platform() === 'win32' ? 'exe' : ''] }
    });

    if (selectedFiles && selectedFiles.length > 0) {
        const selectedPath = selectedFiles[0].fsPath;

        // Save the selected path to the settings
        const config = vscode.workspace.getConfiguration("AMPL");
        await config.update("pathToJRE", selectedPath, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(`Selected Java executable saved: ${selectedPath}`);
        return selectedPath;
    } else {
        vscode.window.showWarningMessage("No file selected. Please set the path manually in the settings.");
    }

    return undefined;
}

export async function checkForConflictingExtensions(): Promise<void> {
    const extensionsToCheck = ['.mod'];``
    const conflicts: string[] = [];

    for (const ext of extensionsToCheck) {
        const conflict = await findExtensionsForFileExtension(ext);
        if (conflict) {
            conflicts.push(conflict);
        }
    }

    if (conflicts.length==1) {
        vscode.window.showWarningMessage(
            `AMPL files are already handled by the plugin: ${conflicts.join('\n')}\n. This may cause issues with the AMPL plugin.`
        );
    }
    else if (conflicts.length > 1) {
        vscode.window.showWarningMessage(
            `Conflicts detected for the following file types:\r\n${conflicts.join('\n')}\nThese may cause issues with the AMPL plugin.`
        );
    } 
}
async function findExtensionsForFileExtension(ext: string): Promise<string | undefined> {
    const matchingExtensions: { id: string; languages: any[] }[] = [];

    for (const extension of vscode.extensions.all) {
        const contributedLanguages = extension.packageJSON?.contributes?.languages;
        if (Array.isArray(contributedLanguages)) {
            for (const lang of contributedLanguages) {
                if (Array.isArray(lang.extensions) && lang.extensions.includes(ext)) {
                    if(extension.id === "AMPLOptimizationInc.ampl-plugin-official") continue;
                    // Skip the vscode.xml plugin for .mod files
                    if (ext === '.mod' && extension.id === 'vscode.xml') {
                        continue;
                    }

                    matchingExtensions.push({
                        id: extension.id,
                        languages: contributedLanguages,
                    });
                    break;
                }
            }
        }
    }

    if (matchingExtensions.length > 0) {
        const extensionIds = matchingExtensions.map((e) => e.id).join(', ');
        return extensionIds;
    }

    return undefined;
}

export function getOpenedFolder(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        // Return the path of the first opened folder
        return workspaceFolders[0].uri.fsPath;
    }
    return undefined; // No folder is opened
}


export async function cmdCheckLanguageServerConfiguration() {
    await initializeJavaPath(false);
    const outputChannel = vscode.window.createOutputChannel("AMPL Language Server");
    const javaBin = await vscode.window.showInputBox({
        prompt: "Check compatibility with the following Java installation:",
        placeHolder: getJavaPath(),
        value: getJavaPath() || ""
    });

    if (!javaBin) {
        vscode.window.showErrorMessage("Java Runtime Environment path is required to check the configuration.");
        return;
    }

    const classPath = path.join(__dirname, '..', 'libs', 'lib-all.jar');
    await checkLanguageServerConfiguration(javaBin, classPath, outputChannel);
}
/**
 * Checks the configuration of the AMPL Language Server by spawning the Java process
 * and analyzing its output for potential issues.
 * @param javaBin The path to the Java executable.
 * @param classPath The path to the language server JAR file.
 * @param outputChannel The output channel for logging.
 */
async function checkLanguageServerConfiguration(
    javaBin: string,
    classPath: string,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const args = ['-cp', classPath, 'amplls.StdioLauncher',  '--tentative_start'];

    outputChannel.appendLine("Checking language server configuration...");
    outputChannel.appendLine(`Using Java: ${javaBin}`);
    outputChannel.appendLine(`Class path: ${classPath}`);

    const childProcess = spawn(javaBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    childProcess.stderr.on('data', (data: Buffer) => {
        const errorOutput = data.toString();
        // Check for UnsupportedClassVersionError in the error output
        const requiredVersionMatch = errorOutput.match(/class file version (\d+\.\d+)/);
        const currentVersionMatch = errorOutput.match(/recognizes class file versions up to (\d+\.\d+)/);

        //outputChannel.appendLine(`Language Server Error: ${errorOutput}`);
        if (requiredVersionMatch && currentVersionMatch) {
            const requiredClassFileVersion = requiredVersionMatch[1];
            const currentClassFileVersion = currentVersionMatch[1];

            const requiredJavaVersion = mapClassFileVersionToJavaVersion(requiredClassFileVersion);
            const currentJavaVersion = mapClassFileVersionToJavaVersion(currentClassFileVersion);
            
            vscode.window.showErrorMessage(
                `The configured Java Runtime is version ${currentJavaVersion}, while the AMPL Language Server requires version ${requiredJavaVersion} or higher. Please update your Java installation.`
            );
        } else {
            vscode.window.showErrorMessage(`Language Server Error: ${errorOutput}`);
        }
    });

    childProcess.on('exit', (code: number | null) => {
        if (code === null) {
            outputChannel.appendLine("Language server process was terminated.");
            vscode.window.showErrorMessage("Language server process was terminated unexpectedly.");
        } else if (code !== 0) {
            outputChannel.appendLine(`Language server exited with code ${code}`);
            vscode.window.showErrorMessage(`Language server exited unexpectedly with code ${code}`);
        } else {
            outputChannel.appendLine("Language server configuration check completed successfully.");
            vscode.window.showInformationMessage("Language server configuration is valid.");
        }
    });
}

function mapClassFileVersionToJavaVersion(classFileVersion: string): string {
    const versionMap: { [key: string]: string } = {
        "45.3": "1.1",
        "46.0": "1.2",
        "47.0": "1.3",
        "48.0": "1.4",
        "49.0": "5",
        "50.0": "6",
        "51.0": "7",
        "52.0": "8",
        "53.0": "9",
        "54.0": "10",
        "55.0": "11",
        "56.0": "12",
        "57.0": "13",
        "58.0": "14",
        "59.0": "15",
        "60.0": "16",
        "61.0": "17",
        "62.0": "18",
        "63.0": "19",
        "64.0": "20",
        "65.0": "21",
        "66.0": "22",
        "67.0": "23",
        "68.0": "24",
        "69.0": "25",
    };

    return versionMap[classFileVersion] || "unknown";
}

export async function selectJavaFolder() {
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: "Select Java Folder"
            });
        
            if (selectedFolder && selectedFolder.length > 0) {
                const javaBin = path.join(selectedFolder[0].fsPath, 'bin', 'java');
                await vscode.workspace.getConfiguration("AMPL").update("pathToJRE", javaBin, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Java Runtime set to: ${javaBin}`);
                // Force refresh of the settings UI
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:AMPLOptimizationInc.ampl-plugin-official');
                await initializeJavaPath(true);
                
            } else {
                vscode.window.showWarningMessage("No folder selected. Java Runtime path was not updated.");
            }
        }

export async function autoDetectJavaPath() {
     vscode.workspace.getConfiguration("AMPL").update("pathToJRE", undefined, vscode.ConfigurationTarget.Global);
     await initializeJavaPath(true); // Implement logic to autodetect Java
            const javaBin = getJavaPath();
            if (javaBin) {1
                await vscode.workspace.getConfiguration("AMPL").update("pathToJRE", javaBin, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Java Runtime detected and set to: ${javaBin}`);
                // Force refresh of the settings UI
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:AMPLOptimizationInc.ampl-plugin-official');
            } else {
                vscode.window.showErrorMessage("Failed to autodetect Java Runtime. Please set it manually.");
            }
        }
    