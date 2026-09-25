import { sanitizeTerminalText } from "@/core/domain/execution/terminal.js";

const STDERR_TAIL_CODE_POINTS = 4_096;

export interface JsonLineTransport {
	send   (line: string                     ): Promise<void>;
	onLine (listener: (line: string) => void ): () => void;
	onClose(listener: (error?: Error) => void): () => void;
	close  ()                                 : Promise<void>;
}

export class StdioJsonLineTransport implements JsonLineTransport {
	private readonly lineListeners  = new Set<(line: string) => void>()  ;
	private readonly closeListeners = new Set<(error?: Error) => void>() ;
	private readonly child          : Bun.PipedSubprocess                ;
	private closed                  = false                              ;
	private stderrTail              = ""                                 ;

	public constructor(command: readonly string[] = ["codex", "app-server", "--stdio"]) {
		if (command.length === 0) throw new Error("App Server command cannot be empty");
		this.child = Bun.spawn([...command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		void this.consume(this.child.stdout, line => this.emitLine(line));
		void this.captureStderr(this.child.stderr);
		void this.child.exited.then(exitCode => {
			const diagnostics = this.stderrTail.trim();
			const error = exitCode === 0
				? undefined
				: new Error(`Codex App Server exited with code ${exitCode}${diagnostics ? `: ${diagnostics}` : ""}`);
			this.emitClose(error);
		});
	}

	public async send(line: string): Promise<void> {
		if (this.closed) throw new Error("Codex App Server transport is closed");
		this.child.stdin.write(`${line}\n`);
		await this.child.stdin.flush();
	}

	public onLine(listener: (line: string) => void): () => void {
		this.lineListeners.add(listener);
		return () => this.lineListeners.delete(listener);
	}

	public onClose(listener: (error?: Error) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	public async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.child.stdin.end();
		if (this.child.exitCode === null) this.child.kill();
		await this.child.exited;
	}

	private async consume(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
		const reader  = stream.getReader() ;
		const decoder = new TextDecoder()  ;
		let buffer    = ""                 ;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let newline = buffer.indexOf("\n");
				while (newline >= 0) {
					const line = buffer.slice(0, newline).trimEnd();
					buffer = buffer.slice(newline + 1);
					if (line) onLine(line);
					newline = buffer.indexOf("\n");
				}
			}
		} catch (error) {
			this.emitClose(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private async captureStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
		const decoder = new TextDecoder();
		try {
			for await (const chunk of stream) {
				this.stderrTail = sanitizeTerminalText(
					`${this.stderrTail}${decoder.decode(chunk, { stream: true })}`,
					STDERR_TAIL_CODE_POINTS,
				);
			}
			this.stderrTail = sanitizeTerminalText(`${this.stderrTail}${decoder.decode()}`, STDERR_TAIL_CODE_POINTS);
		} catch (error) {
			this.emitClose(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private emitLine(line: string): void {
		for (const listener of this.lineListeners) listener(line);
	}

	private emitClose(error?: Error): void {
		if (this.closed) return;
		this.closed = true;
		for (const listener of this.closeListeners) listener(error);
	}
}
