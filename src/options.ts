import * as vscode from 'vscode';


export function diagnosticsEnabled() : boolean {
    return  vscode.workspace.getConfiguration('AMPL').get<boolean>('LanguageServer.diagnosticsEnabled', false);
}

export function usePseudoTerminal() : boolean{
	return vscode.workspace.getConfiguration('AMPL').get<boolean>('Advanced.enablePsuedoTerminal', false);
}

export function useLanguageServer() : boolean { 
    return vscode.workspace.getConfiguration("AMPL").get<boolean>("LanguageServer.enableLanguageServer", false);
}

export function changeDirOnRun() : boolean {
    const config = vscode.workspace.getConfiguration('AMPL');
    return config.get<boolean>('changeDirectoryOnRun', true);
}