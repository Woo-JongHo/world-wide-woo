import type { TodoDocument } from "@/core/domain/work/todos";

/** Todo revision CAS 결과다. `conflict`이면 write가 수행되지 않았고 기존 정본을 보존한다. */
export type TodoWriteOutcome = "written" | "conflict";

/**
 * Todo의 유일한 내구 저장 경계다.
 *
 * `read`는 마지막으로 성공한 전체 문서만 반환한다. `compareAndSwap`은 `expectedRevision`
 * 이 현재 정본과 일치할 때만 `next`를 원자적으로 기록한다. `conflict` 뒤에는 호출자가
 * 새 정본을 다시 읽어 의미를 재계산해야 하며, 같은 `next`를 맹목적으로 재시도하면 안 된다.
 */
export interface TodoStore {
	read(): Promise<TodoDocument | null>;
	compareAndSwap(expectedRevision: number | null, next: TodoDocument): Promise< TodoWriteOutcome >;
}
