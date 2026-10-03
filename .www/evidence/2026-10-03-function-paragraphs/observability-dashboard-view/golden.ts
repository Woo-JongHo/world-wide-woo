import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/session/view/observability-dashboard-view";
import { runGolden } from "../golden-lib";
import { dashboards } from "../dashboard-fixtures";

runGolden("observability-dashboard-view", dashboards.flatMap((dashboard, i) => [0, 2, 13].flatMap(selected => [1, 40, 109, 110, 156, 200].map(width => ({
	label : `#${i} selected=${selected} width=${width}`,
	before: () => new before.ObservabilityDashboardView(() => dashboard, () => selected).render(width),
	after : () => new after.ObservabilityDashboardView(() => dashboard, () => selected).render(width),
})))));
