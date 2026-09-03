import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { DevelopmentMapEpic, DevelopmentMapSnapshot } from "../../domain/development-map.js";
import { sanitizeTerminalTextUnbounded } from "../../domain/terminal.js";
import { colors } from "./theme.js";

const SOURCE_TEXT_MAX_WIDTH = 72;

export class DevelopmentMapView implements Component {
	public constructor(private readonly source: () => DevelopmentMapSnapshot) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const snapshot = this.source();
		const epics = [...snapshot.initiatives.flatMap(item => item.epics), ...snapshot.unlinkedEpics];
		const stories = epics.flatMap(item => item.stories);
		const accepted = stories.filter(item => item.status === "accepted").length;
		const sourceAvailable = snapshot.sourceHealth.state === "available" || snapshot.sourceHealth.state === "stale";
		const lines = [
			colors.accent(" WORLD WIDE WOO / DEVELOPMENT MAP"),
			colors.muted(` Planning revision ${snapshot.revision} · ${snapshot.sourceHealth.state} · read-only projection${snapshot.sourceHealth.error ? ` · ${sourceText(snapshot.sourceHealth.error)}` : ""}`),
			`${colors.highlight(" Esc 돌아가기")}  ${colors.muted("· /dashboard 대화 · /monitor 실행 관측 · ↑↓ 스크롤")}`,
			colors.border("─".repeat(Math.max(1, width))),
			sourceAvailable
				? `${colors.highlight("전체 구조")}  Initiative ${snapshot.initiatives.length}  Epic ${epics.length}  Story ${stories.length}  ${colors.success(`수락 ${accepted}`)}  ${colors.warning(`미수락 ${stories.length - accepted}`)}`
				: `${colors.highlight("전체 구조")}  Initiative unknown  Epic unknown  Story unknown  수락 unknown  미수락 unknown`,
			"",
		];
		if (!sourceAvailable) {
			lines.push(colors.warning("Planning source를 확인할 수 없어 개발 상태를 표시하지 않습니다."));
			return lines.flatMap(line => wrapTextWithAnsi(line, Math.max(1, width))).map(line => truncateToWidth(line, width));
		}
		for (const initiative of snapshot.initiatives) {
			lines.push(`${colors.accent("◆")} ${colors.highlight(sourceText(initiative.id))}  ${sourceText(initiative.title)}  ${colors.muted(`[${sourceText(initiative.status)}]`)}`);
			for (const [epicIndex, epic] of initiative.epics.entries()) lines.push(...epicRows(epic, epicIndex === initiative.epics.length - 1 ? "└" : "├"));
		}
		if (snapshot.unlinkedEpics.length > 0) {
			lines.push("", `${colors.warning("◆ 미연결 Epic")}  ${colors.muted("Initiative 관계가 명시되지 않음")}`);
			for (const [index, epic] of snapshot.unlinkedEpics.entries()) lines.push(...epicRows(epic, index === snapshot.unlinkedEpics.length - 1 ? "└" : "├"));
		}
		lines.push("", colors.muted("범례  ✓ accepted  ◐ legacy-completed  ○ pending/drafted/unknown  ◆ blocked  Evidence ≠ acceptance"));
		return lines.flatMap(line => wrapTextWithAnsi(line, Math.max(1, width))).map(line => truncateToWidth(line, width));
	}
}

function epicRows(epic: DevelopmentMapEpic, branch: "├" | "└"): string[] {
	const rows = [`  ${colors.muted(branch + "─")} ${colors.highlight(sourceText(epic.id))}  ${sourceText(epic.title)}  ${colors.muted(`[${sourceText(epic.status)}]`)}`];
	for (const [index, story] of epic.stories.entries()) {
		const child = index === epic.stories.length - 1 ? "└" : "├";
		const marker = story.status === "accepted" ? colors.success("✓") : story.status === "blocked" ? colors.error("◆") : story.status === "legacy-completed" ? colors.warning("◐") : colors.muted("○");
		const evidence = story.relations.evidence.references.length > 0
			? colors.warning(`Evidence ${story.relations.evidence.state} · ${story.relations.evidence.references.map(sourceText).join(", ")}`)
			: colors.muted(`Evidence ${story.relations.evidence.state} · ${sourceText(story.relations.evidence.nextTransition)}`);
		const runTodo = colors.muted(`Run ${story.relations.run.state} · Todo ${story.relations.todo.state}`);
		rows.push(`  ${branch === "└" ? " " : colors.muted("│")}  ${colors.muted(child + "─")} ${marker} ${sourceText(story.id)}  ${sourceText(story.title)}  ${evidence}  ${runTodo}`);
	}
	return rows;
}

function sourceText(value: string): string {
	const sanitized = sanitizeTerminalTextUnbounded(value);
	const codepoints = Array.from(sanitized).slice(0, SOURCE_TEXT_MAX_WIDTH).join("");
	return visibleWidth(codepoints) <= SOURCE_TEXT_MAX_WIDTH ? codepoints : truncateToWidth(codepoints, SOURCE_TEXT_MAX_WIDTH);
}
