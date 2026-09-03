import type { NativeThreadSummary } from "../domain/native-session.js";
import { CodexAppServer } from "./executors/codex-app-server.js";

/** Native thread 목록의 정본은 App Server다. 로컬 activity journal은 사용하지 않는다. */
export async function listNativeThreads(cwd = process.cwd(), limit = 20): Promise<readonly NativeThreadSummary[]> {
	const server = await CodexAppServer.connect();
	try {
		return await server.listThreads({ cwd, limit });
	} finally {
		await server.close();
	}
}
