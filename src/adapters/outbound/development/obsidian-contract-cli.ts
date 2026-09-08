import { readFileSync, writeFileSync } from "node:fs";
import { applyObsidianSyncPreview, createObsidianSyncPreview, inspectObsidianVault, type ObsidianSyncPreview } from "./obsidian-contract.js";

function parseOptions(args: string[], allowed: readonly string[]): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (let index = 1; index < args.length; index += 2) {
		const name = args[index], value = args[index + 1];
		if (!name?.startsWith("--") || !allowed.includes(name)) throw new Error(`지원하지 않는 옵션입니다: ${name ?? "<missing>"}`);
		if (!value || value.startsWith("--")) throw new Error(`${name} 값이 필요합니다.`);
		if (name in result) throw new Error(`옵션을 중복 지정했습니다: ${name}`);
		result[name] = value;
	}
	return result;
}

export function runObsidianContractCli(args: string[]): unknown {
	if (args[0] === "--") args = args.slice(1);
	const command = args[0];
	const allowed = command === "check" ? ["--vault", "--spec-root", "--linear-ids"] : command === "preview" ? ["--vault", "--spec-root", "--linear-ids", "--out"] : command === "apply" ? ["--vault", "--spec-root", "--linear-ids", "--preview", "--digest"] : [];
	const parsed = parseOptions(args, allowed), vault = parsed["--vault"];
	if (parsed["--spec-root"] && !parsed["--linear-ids"]) throw new Error("--spec-root를 사용하면 --linear-ids로 필수 Linear 이슈를 선언해야 합니다.");
	const options = { specRoot: parsed["--spec-root"], requiredLinearIds: parsed["--linear-ids"]?.split(",").map(value => value.trim()).filter(Boolean) };
	if (!vault) throw new Error("사용법: obsidian:check|preview|apply --vault <path>");
	if (command === "check") {
		const result = inspectObsidianVault(vault, options);
		if (result.issues.length) throw new Error(JSON.stringify(result.issues, null, 2));
		return result.snapshot;
	}
	if (command === "preview") {
		const preview = createObsidianSyncPreview(vault, options), out = parsed["--out"];
		if (out) writeFileSync(out, `${JSON.stringify(preview, null, 2)}\n`);
		return preview;
	}
	if (command === "apply") {
		const path = parsed["--preview"], digest = parsed["--digest"];
		if (!path || !digest) throw new Error("apply에는 --preview와 --digest가 필요합니다.");
		return applyObsidianSyncPreview(vault, JSON.parse(readFileSync(path, "utf8")) as ObsidianSyncPreview, digest, options);
	}
	throw new Error("지원 명령: check, preview, apply");
}

if (import.meta.main) {
	try { console.log(JSON.stringify(runObsidianContractCli(process.argv.slice(2)), null, 2)); }
	catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
