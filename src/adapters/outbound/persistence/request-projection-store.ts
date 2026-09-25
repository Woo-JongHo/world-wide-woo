import { createHash, randomUUID }     from "node:crypto";
import { mkdir, rename, writeFile }   from "node:fs/promises";
import { join }                       from "node:path";
import type { RequestProjectionPort } from "@/core/ports/execution/request-projection-port";
import type { RequestRuntimeRecord }  from "@/core/domain/execution/request-runtime";
import { projectRequestDestinations } from "@/core/domain/work/request-projections";

/** Rebuildable projection, not a second source of truth. No remote publication. */
export class FileRequestProjectionStore implements RequestProjectionPort {
	constructor(private readonly directory: string) {}
	async capture(record: RequestRuntimeRecord): Promise<void> {
		await mkdir(this.directory, { recursive: true });
		const identity = createHash("sha256").update(JSON.stringify([record.threadId, record.requestId])).digest("hex");
		const temporary = join(this.directory, `${identity}.${randomUUID()}.tmp`);
		await writeFile(temporary, JSON.stringify({ record, projections: projectRequestDestinations(record) }, null, 2) + "\n", { mode: 0o600 });
		await rename(temporary, join(this.directory, `${identity}.json`));
	}
}
