import * as os from 'os';
import {  spawn, execSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as options from './options';

let amplPath: string | undefined = undefined;

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
 * Synchronously retrieves the AMPL path after initialization.
 */
export function getAmplPath(): string | undefined {
    return amplPath;
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
 * Finds a Java runtime to run the static fallback ampl-ls.jar on platforms
 * without a native ampl-lsp binary. Checks JAVA_HOME then the system PATH;
 * unlike the native binary path, this has no user-facing configuration.
 */
export async function findJavaForFallback(): Promise<string | undefined> {
    const javaExecutable = os.platform() === 'win32' ? 'java.exe' : 'java';

    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
        const javaInJavaHome = path.join(javaHome, 'bin', javaExecutable);
        try {
            if (await vscode.workspace.fs.stat(vscode.Uri.file(javaInJavaHome))) {
                return javaInJavaHome;
            }
        } catch {
            // File does not exist, fall through to PATH lookup
        }
    }

    return findExecutable('java');
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


