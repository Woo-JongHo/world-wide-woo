import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/session/view/www-history-view";
import { runGolden } from "../golden-lib";
import { dashboards } from "../dashboard-fixtures";

const cases = dashboards.flatMap((dashboard, i) => [0, 1, 5, 13].flatMap(selected => [3, 12, 30].flatMap(height => [1, 40, 120].map(width => ({
	label : `#${i} selected=${selected} height=${height} width=${width}`,
	before: () => new before.WwwHistoryView(() => dashboard, () => selected, () => height).render(width),
	after : () => new after.WwwHistoryView(() => dashboard, () => selected, () => height).render(width),
})))));
runGolden("www-history-view", cases);
