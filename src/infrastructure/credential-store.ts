import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

const DEFAULT_CREDENTIAL_PATH = join(homedir(), ".config", "www", "auth.json");

type Credentials = Record<string, Credential>;

function abortError(): Error {
	const error = new Error("Credential store operation was aborted");
	error.name = "AbortError";
	return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw abortError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCredential(value: unknown): value is Credential {
	if (!isRecord(value)) return false;
	if (value.type === "api_key") return value.key === undefined || typeof value.key === "string";
	return value.type === "oauth" && typeof value.refresh === "string" && typeof value.access === "string" && typeof value.expires === "number";
}

function parseCredentials(text: string, path: string): Credentials {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`Credential store at ${path} contains invalid JSON`);
	}
	if (!isRecord(value) || Object.values(value).some((credential) => !isCredential(credential))) {
		throw new Error(`Credential store at ${path} contains invalid credential data`);
	}
	return Object.assign(Object.create(null) as Credentials, value);
}

/** Persistent, file-backed credentials keyed by provider id. */
export class FileCredentialStore implements CredentialStore {
	private writeChain: Promise<void> = Promise.resolve();

	constructor(readonly path = DEFAULT_CREDENTIAL_PATH) {}

	async read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
		throwIfAborted(options?.signal);
		const credentials = await this.load();
		return Object.hasOwn(credentials, providerId) ? credentials[providerId] : undefined;
	}

	async list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]> {
		throwIfAborted(options?.signal);
		return Object.entries(await this.load()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
	}

	async modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
		options?: AuthOperationOptions,
	): Promise<Credential | undefined> {
		throwIfAborted(options?.signal);
		return await this.enqueue(async () => {
			throwIfAborted(options?.signal);
			const credentials = await this.load();
			const current = Object.hasOwn(credentials, providerId) ? credentials[providerId] : undefined;
			const updated = await fn(current);
			if (updated === undefined) return current;
			if (!isCredential(updated)) throw new Error("Credential store refused invalid credential data");
			credentials[providerId] = updated;
			await this.save(credentials);
			return updated;
		});
	}

	async delete(providerId: string, options?: AuthOperationOptions): Promise<void> {
		throwIfAborted(options?.signal);
		await this.enqueue(async () => {
			throwIfAborted(options?.signal);
			const credentials = await this.load();
			if (!Object.hasOwn(credentials, providerId)) return;
			delete credentials[providerId];
			await this.save(credentials);
		});
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const result = this.writeChain.then(task, task);
		this.writeChain = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private async load(): Promise<Credentials> {
		try {
			return parseCredentials(await readFile(this.path, "utf8"), this.path);
		} catch (error: unknown) {
			if (isRecord(error) && error.code === "ENOENT") return {};
			throw error;
		}
	}

	private async save(credentials: Credentials): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		await chmod(directory, 0o700);
		const temporaryPath = join(directory, `.${randomUUID()}.tmp`);
		try {
			await writeFile(temporaryPath, `${JSON.stringify(credentials, null, "\t")}\n`, { mode: 0o600 });
			await chmod(temporaryPath, 0o600);
			await rename(temporaryPath, this.path);
			await chmod(this.path, 0o600);
		} catch (error) {
			await rm(temporaryPath, { force: true });
			throw error;
		}
	}
}
