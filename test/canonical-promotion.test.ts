import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { CanonicalPromotionService, createCanonicalDocumentDraft, digestCanonicalDocument, fingerprintCanonicalDocument } from "../src/application/canonical-promotion";
import { canonicalTemporaryPath, FileCanonicalDocumentStore } from "../src/infrastructure/canonical-document-store";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "www-canonical-"));
	roots.push(root);
	return root;
}

function draft(body = "# 오늘의 작업\n\n- [ ] 정리"): ReturnType<typeof createCanonicalDocumentDraft> {
	return createCanonicalDocumentDraft({
		kind: "todo",
		body,
		source: { id: "todo-source-1", body: "raw todo source" },
		provenance: { sessionId: "session-1", turnId: "turn-1", capturedAt: "2026-09-01T00:00:00.000Z" },
	});
}

describe("human-gated canonical promotion", () => {
	test("uses the ignored per-document temporary-file convention", () => {
		const target = join("workspace", ".www", "vault", "Todo.md");
		const temporary = canonicalTemporaryPath(target, "nonce");
		expect(temporary).toBe(join(dirname(target), `.${basename(target)}.${process.pid}.nonce.tmp`));
		expect(basename(temporary)).toMatch(/^\.Todo\.md\.\d+\.nonce\.tmp$/);
	});

	test("accepts then atomically promotes an approved Todo draft without git operations", async () => {
		const root = await project();
		const service = new CanonicalPromotionService(new FileCanonicalDocumentStore(root));
		const accepted = await service.accept(draft(), "jongho");
		expect(accepted.status).toBe("accepted");
		expect(accepted.token).toContain(fingerprintCanonicalDocument(draft(), digestCanonicalDocument("")).digest);
		expect(accepted.diff).toContain("+ # 오늘의 작업".replace("+ ", "+"));
		const promoted = await service.promote(draft(), accepted.token);
		expect(promoted).toMatchObject({ status: "promoted", gitState: "uncommitted" });
		expect(await readFile(join(root, ".www", "vault", "Todo.md"), "utf8")).toBe(draft().body);
	});

	test("requires new approval when body, source, or target state becomes stale", async () => {
		const root = await project();
		const store = new FileCanonicalDocumentStore(root);
		const service = new CanonicalPromotionService(store);
		const original = draft();
		const accepted = await service.accept(original, "jongho");
		const changedSource = { ...original, source: { ...original.source, digest: digestCanonicalDocument("changed source") } };
		const sourceStale = await service.promote(changedSource, accepted.token);
		expect(sourceStale).toMatchObject({ status: "stale", reason: "draft-changed" });

		const targetAccepted = await service.accept(original, "jongho");
		await store.writeAtomic(original.target, digestCanonicalDocument(""), "# 외부 변경");
		const targetStale = await service.promote(original, targetAccepted.token);
		expect(targetStale).toMatchObject({ status: "stale", reason: "target-changed" });
		expect(await store.writeAtomic(original.target, digestCanonicalDocument(""), "# 덮어쓰기")).toMatchObject({ status: "conflict" });
	});

	test("uses a safe per-note allowlist target for T-note drafts", async () => {
		const root = await project();
		const service = new CanonicalPromotionService(new FileCanonicalDocumentStore(root));
		const note = createCanonicalDocumentDraft({
			kind: "tnote",
			body: "# 결정\n\nApp Server를 사용한다.",
			source: { id: "decision-20260901", body: "assistant session excerpt" },
			provenance: { sessionId: "session-1", capturedAt: "2026-09-01T00:00:00.000Z" },
		});
		expect(note.target).toBe(".www/vault/t-notes/decision-20260901.md");
		const accepted = await service.accept(note, "jongho");
		expect((await service.promote(note, accepted.token)).status).toBe("promoted");
		expect(await readFile(join(root, ".www", "vault", "t-notes", "decision-20260901.md"), "utf8")).toBe(note.body);
	});

	test("rejects path escape and symlink targets before reading or writing", async () => {
		const root = await project();
		const store = new FileCanonicalDocumentStore(root);
		await mkdir(join(root, ".www", "vault"), { recursive: true });
		const outside = join(root, "outside.md");
		await writeFile(outside, "outside");
		await symlink(outside, join(root, ".www", "vault", "Todo.md"));
		await expect(store.read(".www/vault/Todo.md")).rejects.toThrow("symlink");
		await expect(store.read(".www/vault/../escape.md" as never)).rejects.toThrow("allowlist");
	});
});
