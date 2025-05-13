import * as vscode from 'vscode';

const SECTION = "AMPL";

// --- pathToJRE ---
export function getPathToJRE(): string | undefined {
    return vscode.workspace.getConfiguration(SECTION).get<string>("Runtime.pathToJRE");
}
export function setPathToJRE(value?: string | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("Runtime.pathToJRE", value, vscode.ConfigurationTarget.Global);
}

// --- pathToAMPLbinary ---
export function getPathToAMPLbinary(): string | undefined {
    return vscode.workspace.getConfiguration(SECTION).get<string>("Runtime.pathToAMPLbinary");
}
export function setPathToAMPLbinary(value?: string | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("Runtime.pathToAMPLbinary", value, vscode.ConfigurationTarget.Global);
}

// --- diagnosticsEnabled ---
export function getDiagnosticsEnabled(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>("LanguageServer.diagnosticsEnabled", false);
}
export function setDiagnosticsEnabled(value?: boolean | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("LanguageServer.diagnosticsEnabled", value, vscode.ConfigurationTarget.Global);
}



// --- usePseudoTerminal ---
export function getEnableAdvancedCommands(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>("Advanced.enableAdvancedCommands", false);
}
export function setEnableAdvancedCommands(value?: boolean | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("Advanced.enableAdvancedCommands", value, vscode.ConfigurationTarget.Global);
}

// --- usePseudoTerminal ---
export function getUsePseudoTerminal(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>("Advanced.enablePsuedoTerminal", false);
}
export function setUsePseudoTerminal(value?: boolean | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("Advanced.enablePsuedoTerminal", value, vscode.ConfigurationTarget.Global);
}

// --- useLanguageServer ---
export function getUseLanguageServer(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>("LanguageServer.enableLanguageServer", true);
}
export function setUseLanguageServer(value?: boolean | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update("LanguageServer.enableLanguageServer", value, vscode.ConfigurationTarget.Global);
}

// --- changeDirOnRun ---
export function getChangeDirOnRun(): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>('changeDirectoryOnRun', true);
}
export function setChangeDirOnRun(value?: boolean | null): Thenable<void> {
    return vscode.workspace.getConfiguration(SECTION).update('changeDirectoryOnRun', value, vscode.ConfigurationTarget.Global);
}