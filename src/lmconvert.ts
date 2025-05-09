import * as vscode from 'vscode';

const ANNOTATION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. The user is writing You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readibility and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:
{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;
const REFORMAT_PROMPT = `You are an expert modeler in AMPL. Your job is to read the AMPL file that the user gives you and prettify it. You should absolutely avoid modifying anything in the code itself, so you job will only consist in adding/removing spaces or new lines. The output code should be easy to read, with all the multiline statements having indentation. Possibly, long expressions (for example in constraints or objectives) could have some nested indentation. Format each suggestion (aka the formatting for each expression that needed change) as a single JSON object. It is not necessary to wrap your response in triple backticks. Instead of using curly brackets as JSON delimiters, to avoid confusion with AMPL curly brackets use '{j{' and '}j}'.  Here is an example of what your response should look like: 
{j{ "line": 1, "suggestion": "subject to c: x +z=\n              log(a)+banana;" }j}
`;


export function registerLMCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
            vscode.commands.registerTextEditorCommand('vsampl.lmconvert', convertToAMPL)
    )
}
async function convertToAMPL(textEditor: vscode.TextEditor){

	// Get the code with line numbers from the current editor
	const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

	// select the 4o chat model
	const [model] = await vscode.lm.selectChatModels({
		vendor: 'copilot',
		family: 'gpt-4o',
	});

	// init the chat message
	const messages = [
		vscode.LanguageModelChatMessage.User(REFORMAT_PROMPT),
		vscode.LanguageModelChatMessage.User(codeWithLineNumbers),
	];

	// make sure the model is available
	if (model) {

		// send the messages array to the model and get the response
		const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

		// handle chat response
		await parseChatResponse(chatResponse, textEditor);
	}
}

async function parseChatResponse(chatResponse: vscode.LanguageModelChatResponse, textEditor: vscode.TextEditor) {
	let accumulatedResponse = "";

	for await (const fragment of chatResponse.text) {
		accumulatedResponse += fragment;

		// if the fragment is a }, we can try to parse the whole line
		if (fragment.includes("}j}")) {
			try {
				accumulatedResponse=accumulatedResponse.replace("}j}", "}").replace("{j{", "{");
				const annotation = JSON.parse(accumulatedResponse);
				applyDecoration(textEditor, annotation.line, annotation.suggestion);
				// reset the accumulator for the next line
				accumulatedResponse = "";
			}
			catch {
				// do nothing
			}
		}
	}
	//applyDecoration(textEditor, 1, accumulatedResponse);
}

function getVisibleCodeWithLineNumbers(textEditor: vscode.TextEditor) {
	// get the position of the first and last visible lines
	let currentLine = textEditor.visibleRanges[0].start.line;
	const endLine = textEditor.visibleRanges[0].end.line;

	let code = '';

	// get the text from the line at the current position.
	// The line number is 0-based, so we add 1 to it to make it 1-based.
	while (currentLine < endLine) {
		code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text} \n`;
		// move to the next line position
		currentLine++;
	}
	return code;
}

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {

	const decorationType = vscode.window.createTextEditorDecorationType({
		after: {
			contentText: ` ${suggestion.substring(0, 25) + "..."}`,
			color: "grey",
		},
	});

	// get the end of the line with the specified line number
	const lineLength = editor.document.lineAt(line - 1).text.length;
	const range = new vscode.Range(
		new vscode.Position(line - 1, lineLength),
		new vscode.Position(line - 1, lineLength),
	);

	const decoration = { range: range, hoverMessage: suggestion };

	vscode.window.activeTextEditor?.setDecorations(decorationType, [
		decoration,
	]);
}

// This method is called when your extension is deactivated
export function deactivate() { }
