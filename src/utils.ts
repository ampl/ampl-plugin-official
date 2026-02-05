import * as os from 'os';
import {  spawn, execSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as options from './options';

let amplPath: string | undefined = undefined;
let javaPath: string | undefined = undefined;

/**
 * Initializes the AMPL path and stores it in a global variable.
 */
export async function initializeAmplPath(): Promise<void> {
    amplPath = options.getpathToAMPLBinary() || await findAmplBinary();
    if (amplPath) {
        const probeResult = await probeAmplBinary(amplPath);
        if (!probeResult.success){
            let errorText = `Failed to execute AMPL binary at ${amplPath}: ${probeResult.errorMessage}. Do you want to select a new binary?`
  

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
                    await options.setpathToAMPLBinary(selectedPath);
                    await initializeAmplPath();
                    vscode.window.showInformationMessage(`Selected AMPL binary saved: ${selectedPath}`);
                    return selectedPath;
                } else {
                    vscode.window.showWarningMessage("No file selected. Please set the path manually in the settings.");
                }
            }
        });
        }

        console.log('[ampl-plugin] AMPL probe result:', probeResult);
    }
}


export interface AmplProbeResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    errorMessage?: string;
}

export async function probeAmplBinary(
    binaryPath?: string,
    timeoutMs: number = 5000
): Promise<AmplProbeResult> {
    const resolvedPath = binaryPath;

    if (!resolvedPath) {
        throw new Error('AMPL binary path is not set. Call initializeAmplPath() first or pass a path explicitly.');
    }

    return await new Promise<AmplProbeResult>((resolve) => {
        const child = spawn(resolvedPath, ['-vvq']);
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer: NodeJS.Timeout;

        const finish = (result: AmplProbeResult) => {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };

        timer = setTimeout(() => {
            child.kill();
            finish({ success: false, stdout, stderr, exitCode: null, errorMessage: `AMPL probe timed out after ${timeoutMs} ms.` });
        }, timeoutMs);

        if (child.stdout) {
            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });
        }

        if (child.stderr) {
            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });
        }

        child.on('error', (error: Error) => {
            finish({ success: false, stdout, stderr, exitCode: null, errorMessage: error.message });
        });

        child.on('close', (code: number | null) => {
            finish({ success: code === 0, stdout, stderr, exitCode: code, errorMessage: code === 0 ? undefined : 'AMPL process exited with a non-zero code.' });
        });
    });
}



/**
 * Initializes the Java path and stores it in a global variable.
 */
export async function initializeJavaPath(force: boolean = false): Promise<void> {
    if (force) {
        javaPath = await findJava(amplPath);
    } else
    javaPath = options.getPathToJRE() || await findJava(amplPath);
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
    // First, honor BASE_AMPL_PATH environment variable if provided.
    // If it points to an existing file, use it. If it points to a directory,
    // look for the ampl executable inside that directory.
    const envBase = process.env.BASE_AMPL_PATH;
    const amplExeName = os.platform() === 'win32' ? 'ampl.exe' : 'ampl';

    if (envBase) {
        console.log(`[ampl-plugin] BASE_AMPL_PATH is set: ${envBase}`);
        // If envBase is a path to an existing file, return it.
        try {
            try {
                if (await vscode.workspace.fs.stat(vscode.Uri.file(envBase))) {
                    console.log(`[ampl-plugin] Using AMPL from BASE_AMPL_PATH (file): ${envBase}`);
                    return envBase;
                }
            } catch {
                // Not a file — continue to check as a directory
            }

            // Treat envBase as a directory and check for the executable inside it
            const candidate = path.join(envBase, amplExeName);
            try {
                if (await vscode.workspace.fs.stat(vscode.Uri.file(candidate))) {
                    console.log(`[ampl-plugin] Using AMPL from BASE_AMPL_PATH (dir): ${candidate}`);
                    return candidate;
                }
            } catch {
                // Not found in envBase — continue to fallback behavior
                console.log(`[ampl-plugin] AMPL not found in BASE_AMPL_PATH: checked ${envBase} and ${candidate}`);
            }
        } catch (err) {
            // Ignore and fall back to system lookup
            console.error('Error while checking BASE_AMPL_PATH:', err);
        }
    }

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
                    await options.setpathToAMPLBinary(selectedPath);
                    initializeAmplPath();

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


    // Check in the runtime subdirectory for embedded JRE
    const embeddedJre = path.join(__dirname, '..', 'libs', 'jre', 'bin', javaExecutable);
    try {
        if (await vscode.workspace.fs.stat(vscode.Uri.file(embeddedJre))) { return embeddedJre; }
        }
         catch {
            // Does not exist
         }
    

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
        await options.setPathToJRE(selectedPath);

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


export async function cmdCheckLanguageServerConfiguration(silent: boolean = false) {
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
export async function checkLanguageServerConfiguration(
    javaBin: string,
    classPath: string,
    outputChannel: vscode.OutputChannel,
    silent: boolean = false
): Promise<boolean> {
    const args = ['-cp', classPath, 'amplls.StdioLauncher', '--tentative_start'];

    outputChannel.appendLine("Checking language server configuration...");
    outputChannel.appendLine(`Using Java: ${javaBin}`);
    outputChannel.appendLine(`Class path: ${classPath}`);

    return await new Promise<boolean>((resolve) => {
        let errorHandled = false;
        const childProcess = spawn(javaBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

        childProcess.stderr.on('data', (data: Buffer) => {
            const errorOutput = data.toString();
            const requiredVersionMatch = errorOutput.match(/class file version (\d+\.\d+)/);
            const currentVersionMatch = errorOutput.match(/recognizes class file versions up to (\d+\.\d+)/);

            if (requiredVersionMatch && currentVersionMatch) {
                const requiredClassFileVersion = requiredVersionMatch[1];
                const currentClassFileVersion = currentVersionMatch[1];

                const requiredJavaVersion = mapClassFileVersionToJavaVersion(requiredClassFileVersion);
                const currentJavaVersion = mapClassFileVersionToJavaVersion(currentClassFileVersion);
                if (!silent)
                    vscode.window.showErrorMessage(
                        `The configured Java Runtime is version ${currentJavaVersion}, while the AMPL Language Server requires version ${requiredJavaVersion} or higher. Please update your Java installation.`
                    );
                errorHandled = true;
                resolve(false);
            } else {
                vscode.window.showErrorMessage(`Language Server Error: ${errorOutput}`);
                errorHandled = true;
                resolve(false);
            }
        });

        childProcess.on('exit', (code: number | null) => {
            if (errorHandled) return; // Already handled in stderr
            if (code === null) {
                outputChannel.appendLine("Language server process was terminated.");
                if (!silent)
                    vscode.window.showErrorMessage("Language server process was terminated unexpectedly.");
                resolve(false);
            } else if (code !== 0) {
                outputChannel.appendLine(`Language server exited with code ${code}`);
                if (!silent)
                    vscode.window.showErrorMessage(`Language server exited unexpectedly with code ${code}`);
                resolve(false);
            } else {
                outputChannel.appendLine("Language server configuration check completed successfully.");
                if (!silent)
                    vscode.window.showInformationMessage("Language server configuration is valid.");
                resolve(true);
            }
        });

        childProcess.on('error', (err) => {
            outputChannel.appendLine(`Failed to start Java process: ${err.message}`);
            vscode.window.showErrorMessage(`Failed to start Java process: ${err.message}`);
            resolve(false);
        });
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
                await options.setPathToJRE(javaBin);
                vscode.window.showInformationMessage(`Java Runtime set to: ${javaBin}`);
                // Force refresh of the settings UI
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:AMPLOptimizationInc.ampl-plugin-official');
                await initializeJavaPath(true);
                
            } else {
                vscode.window.showWarningMessage("No folder selected. Java Runtime path was not updated.");
            }
        }

export async function autoDetectJavaPath() {
     await options.setPathToJRE();
     await initializeJavaPath(true); // Implement logic to autodetect Java
            const javaBin = getJavaPath();
            if (javaBin) {
                await options.setPathToJRE(javaBin);
                vscode.window.showInformationMessage(`Java Runtime detected and set to: ${javaBin}`);
                // Force refresh of the settings UI
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:AMPLOptimizationInc.ampl-plugin-official');
            } else {
                vscode.window.showErrorMessage("Failed to autodetect Java Runtime. Please set it manually.");
            }
        }
