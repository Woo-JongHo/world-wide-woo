import { existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { API } from "typescript/unstable/async";
import type { SourceFile } from "typescript/unstable/ast";

export interface LoadedSource {
	readonly source   : SourceFile;
	readonly relative : string;
}

export function repositoryFile(root: string, value: string): { absolute: string; relative: string } {
	const absolute = resolve(root, value);
	const path     = relative(root, absolute).replaceAll("\\", "/");
	if (!path || path === ".." || path.startsWith("../")) throw new Error(`대상은 저장소 안의 파일이어야 합니다: ${value}`);
	if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`대상이 실제 파일이 아닙니다: ${value}`);
	const physical = relative(realpathSync(root), realpathSync(absolute)).replaceAll("\\", "/");
	if (physical === ".." || physical.startsWith("../")) throw new Error(`대상의 실제 위치가 저장소 밖에 있습니다: ${value}`);
	if (!/\.[cm]?[jt]sx?$/u.test(path)) throw new Error(`대상은 JavaScript 또는 TypeScript 파일이어야 합니다: ${value}`);
	return { absolute, relative: path };
}

export async function loadSourceFile(root: string, value: string): Promise<LoadedSource> {
	const target  = repositoryFile(root, value);
	const api     = new API({ cwd: root });
	const state   = await api.updateSnapshot({ openFiles: [target.absolute] });
	const project = await state.getDefaultProjectForFile(target.absolute);
	if (!project) throw new Error(`TypeScript project를 찾을 수 없습니다: ${target.relative}`);
	const source = await project.program.getSourceFile(target.absolute);
	if (!source) throw new Error(`TypeScript source AST를 읽을 수 없습니다: ${target.relative}`);
	return { source, relative: target.relative };
}
