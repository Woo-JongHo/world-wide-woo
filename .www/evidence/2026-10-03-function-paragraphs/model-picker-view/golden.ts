import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/model-selection/view/model-picker-view";
import { across, runGolden } from "../golden-lib";
import { colors } from "../../../../src/adapters/inbound/tui/foundation/theme/theme";

const settings = (model: string) => ({ provider: "openai-codex", model, effort: "high" });
const base: any = { nativeCodex: true, current: settings("gpt-5"), staged: settings("gpt-6"), breadcrumb: "모델 › 추론", catalogNotice: "카탈로그 확인됨", rows: ["› gpt-6", "  gpt-5", "  아주 긴 모델 이름이 들어가서 폭을 넘는 경우를 확인하는 행"], error: null, applying: false, confirmation: false };
const states = [
	base, { ...base, appearance: "www" }, { ...base, appearance: "www", error: "실패", applying: true },
	{ ...base, nativeCodex: false, error: "오류", confirmation: true }, { ...base, applying: true, rows: [] },
];
const ui = colors as any;
runGolden("model-picker-view", across(states, [1, 10, 40, 80]).map(({ input, width, label }) => ({
	label,
	before: () => before.renderModelPickerView(input, width, ui),
	after : () => after.renderModelPickerView(input, width, ui),
})));
