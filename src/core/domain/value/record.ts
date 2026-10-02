/** 외부 입력에서 읽은 `unknown` 값이 `null`·배열을 제외한 객체인지 판별한다. Date·Map·클래스 인스턴스도 통과한다. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `isRecord`를 통과하면 같은 참조를, 아니면 `undefined`를 돌려준다(복사하지 않는다). 필드 접근은 `asRecord(value)?.field`로 쓴다. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}
