import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';

export class AMPLAPI extends EventEmitter {
    private command: string;
    private args: string[];
    private process: ChildProcessWithoutNullStreams | null;
    private buffer: string;

    constructor(command: string, args: string[] = []) {
        super();
        this.command = command;
        this.args = args;
        this.process = null;
        this.buffer = '';  // Accumulate incomplete messages
    }

    start(): void {
        this.process = spawn(this.command, this.args);

        if (this.process) {
            this.process.on('error', (err) => {
                console.log("Cannot start AMPL!!");
              });


            // Handle data from stdout
            this.process.stdout.on('data', (data: Buffer) => {
                this.buffer += data.toString();
                this.parseMessages();
            });

            this.process.stderr.on('data', (data: Buffer) => {
                this.emit('error', `Error from command: ${data.toString()}`);
            });

            this.process.on('close', (code: number) => {
                this.emit('close', `Command exited with code ${code}`);
            });
        }
    }

    /**
     * Send a message to the process
     */
    send(message: string): void {
        if (!this.process) {
            throw new Error("Process hasn't been started.");
        }
        const formattedMessage = this.formatMessage(message);
        this.process.stdin.write(formattedMessage);
    }

    stop(): void {
        if (this.process) {
            this.process.stdin.end();
        }
    }

    private formatMessage(message: string): string {
        let lengthOfMessage = Buffer.byteLength(message, 'utf8');
        return `${lengthOfMessage} ${message}`;
    }
    
    /**
     * Parse the incoming data buffer for complete messages.
     * The reply structure is:
     * messagelength messagetype\n
     * message
     * Multiple messages may be received in a single buffer.
     * The parsing continues until the last message with type "prompt1" is received.
     */
    private parseMessages(): void {
        while (this.buffer.length > 0) {
            // Find the first space separating the length and message type
            const spaceIndex = this.buffer.indexOf(' ');
            if (spaceIndex === -1) return;  // Wait for more data if no space found

            // Parse the message length
            const messageLength = parseInt(this.buffer.slice(0, spaceIndex), 10);
            if (isNaN(messageLength)) {
                this.emit('error', 'Invalid message format received');
                this.buffer = '';  // Reset buffer on error
                return;
            }

            // Find the newline after message type
            const newlineIndex = this.buffer.indexOf('\n', spaceIndex + 1);
            if (newlineIndex === -1) return;  // Wait for more data if no newline found

            // Extract the message type
            const messageType = this.buffer.slice(spaceIndex + 1, newlineIndex);

            // Check if we have the full message
            const totalLength =  messageLength+spaceIndex+1;
            if (this.buffer.length < totalLength) return;  // Wait for the full message

            // Extract the message body
            const message = this.buffer.slice(newlineIndex + 1, totalLength);

            // Emit an event with the message type and content
            this.emit('message', { type: messageType, content: message });

            // Check if the message type is "prompt1" to stop further processing
            if (messageType === 'prompt1') {
                this.emit('prompt1', message);  // Custom event for prompt1 message
                this.buffer = this.buffer.slice(totalLength);  // Remove processed message from buffer
                break;  // Stop processing further, we expect no more data for now
            }

            // Remove the processed message from the buffer
            this.buffer = this.buffer.slice(totalLength);
        }
    }
}

export default AMPLAPI;
