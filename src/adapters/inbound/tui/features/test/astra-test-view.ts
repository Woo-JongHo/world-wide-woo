import type { Component }                               from "@earendil-works/pi-tui";
import { projectRequestTestWorkspace }                  from "@/core/domain/observability/request-test-workspace";
import type { RequestTestStatus, RequestTestWorkspace } from "@/core/domain/observability/request-test-workspace";
import type { RequestTestKind }                         from "@/core/domain/execution/request-runtime";
import type { WorkbenchSnapshot }                       from "@/core/domain/work/workbench";
import { a, fit, mark, oneLine, prose, safe, section }  from "@/adapters/inbound/tui/foundation/theme/astra-theme";

const statusLabel = {
	running : "실행 중",
	passed  : "통과",
	failed  : "실패",
	blocked : "차단",
	skipped : "생략",
	planned : "계획",
	unknown : "미확인",
} satisfies Readonly<Record<RequestTestStatus, string>>;

const kindLabel = {
	"black-box"       : "블랙박스 테스트",
	integration       : "통합 테스트",
	regression        : "회귀 테스트",
	unit              : "단위 테스트",
	"static-analysis" : "정적 검증",
	"read-back"       : "결과 재조회",
	manual            : "수동 확인",
	unclassified      : "분류 미기록",
} satisfies Readonly<Record<RequestTestKind, string>>;

const TEST_KINDS: readonly RequestTestKind[] = [
	"black-box",
	"integration",
	"regression",
	"unit",
	"static-analysis",
	"read-back",
	"manual",
	"unclassified",
];

/** Question-first verification workspace. Test volume is secondary to intent and evidence. */
export function projectAstraTestView(snapshot: WorkbenchSnapshot): RequestTestWorkspace {
	return projectRequestTestWorkspace({
		activities: snapshot.activities,
		...(snapshot.requestRuntime ? { requests: snapshot.requestRuntime } : {}),
	});
}

export function renderAstraTestView(workspace: RequestTestWorkspace, width: number): string[] {
	const rows = [
		...section("질문별 Test", width, `${workspace.groups.length}개 요청`),
		a.muted("무엇을 왜 확인했는지부터 읽습니다. 실행 횟수는 결과 뒤에 둡니다."),
		"",
	];
	if (!workspace.groups.length) rows.push(a.muted("이 세션에는 아직 질문이나 검증 기록이 없습니다."));
	for (const [index, group] of workspace.groups.entries()) {
		rows.push(
			`${mark(group.status)} ${a.strong(oneLine(group.question, Math.max(16, width - 8)))}`,
			a.muted(`  ${statusLabel[group.status]}  /  request ${safe(group.requestId)}`),
			a.note(`  ${group.rationale}`),
			"",
		);
		if (!group.checks.length) rows.push(a.muted("  실행하거나 계획한 검사가 없습니다."));
		for (const kind of TEST_KINDS) {
			const checks = group.checks.filter(check => check.kind === kind);
			if (!checks.length) continue;
			rows.push(`  ${a.text(kindLabel[kind])}`);
			for (const check of checks) {
				const source = check.evidenceActivityId
					? `  ${a.muted(`/source ${safe(check.evidenceActivityId)}`)}`
					: "";
				rows.push(
					`  └─ ${mark(check.status)} ${safe(check.title)}${source}`,
					a.muted(`     └─ 목표 · ${safe(check.purpose)}`),
				);
			}
		}
		if (index < workspace.groups.length - 1) rows.push("", a.rule("─".repeat(Math.max(1, width))), "");
	}
	rows.push("", a.muted("최신 질문부터 표시 · /source <id>로 원본 확인 · Evidence 없는 통과는 표시하지 않음"));
	return rows.flatMap(row => prose(row, width)).map(row => fit(row, width));
}

export class AstraTestView implements Component {
	constructor(private readonly getProjection: () => RequestTestWorkspace) {}
	invalidate(): void {}
	render(width: number): string[] {
		return renderAstraTestView(this.getProjection(), width);
	}
}
