/** 작업 결과의 간결한 의미 타입이다. */
export type CompactResult = { value: string };

/** 호출자가 생략 가능한 입력이다. */
export interface HoverOptions {
	/** 생략하면 새 리소스를 생성한다. */
	resourceId ?: string;
}

/** 저장된 정규화 결과다. */
export interface StoredOptions {
	/** null이면 연결된 리소스가 없다는 뜻이다. */
	resourceId : string | null;
}

export type MissingDocumentation = string;
