import * as vscode from 'vscode';


export function diagnosticsEnabled() : boolean {
    return  vscode.workspace.getConfiguration('vsampl').get<boolean>('diagnostics.enabled', false);
}


export function usePseudoTerminal() : boolean{
	return vscode.workspace.getConfiguration('vsampl').get<boolean>('enablePsuedoTerminal', false);
}

export function useLanguageServer() : boolean { 
    return vscode.workspace.getConfiguration("AMPL").get<boolean>("LanguageServer.enableLanguageServer", false);
}

export function changeDirOnRun() : boolean {
    const config = vscode.workspace.getConfiguration('vsampl');
    return config.get<boolean>('changeDirectoryOnRun', true);
}