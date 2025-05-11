import * as vscode from 'vscode';

const ANNOTATION_PROMPT = `You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. The user is writing You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readibility and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:
{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;
const REFORMAT_PROMPT = `You are an expert modeler in AMPL. Your job is to read the AMPL file that the user gives you and prettify it. You should absolutely avoid modifying anything in the code itself, so you job will only consist in adding/removing spaces or new lines. The output code should be easy to read, with all the multiline statements having indentation. Possibly, long expressions (for example in constraints or objectives) could have some nested indentation. IMPORTANT respond just with code. Do not use markdown,  It is not necessary to wrap your response in triple backticks`;



export function registerLMCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
            vscode.commands.registerTextEditorCommand('AMPL.lmconvert', convertToAMPL)
    )
}
async function convertToAMPL(textEditor: vscode.TextEditor){

	// Get the code with line numbers from the current editor
	const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);

	try{
	// select the 4o chat model
	const [model] = await vscode.lm.selectChatModels({
		vendor: 'copilot'
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
		  await textEditor.edit(edit => {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(
        textEditor.document.lineCount - 1,
        textEditor.document.lineAt(textEditor.document.lineCount - 1).text.length
      );
      edit.delete(new vscode.Range(start, end));
    });

    try {
      // Stream the code into the editor as it is coming in from the Language Model
	  
      let buffer = "";

for await (const fragment of chatResponse.text) {
    buffer += fragment;

    let newlineIndex;
    // Process each complete line in the buffer
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex + 1); // include the newline
        buffer = buffer.slice(newlineIndex + 1);

        if (line === "```AMPL\n" || line === "```\n") continue;

        await textEditor.edit(edit => {
            const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
            const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
            edit.insert(position, line);
        });
    }
}

// If anything remains in the buffer (not ending with \n), process it as well
if (buffer.length > 0 && buffer !== "```AMPL" && buffer !== "```") {
    await textEditor.edit(edit => {
        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
        const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
        edit.insert(position, buffer);
    });
}
    } catch (err) {
      // async response stream may fail, e.g network interruption or server side error
      await textEditor.edit(edit => {
        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
        const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
        edit.insert(position, (<Error>err).message);
      });
    }

	}
	}
	catch (err) {
		  // Making the chat request might fail because
  // - model does not exist
  // - user consent not given
  // - quota limits were exceeded
  if (err instanceof vscode.LanguageModelError) {
    console.log(err.message, err.code, err.name);
  } else {
    // add other error handling logic
    throw err;
  }
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
