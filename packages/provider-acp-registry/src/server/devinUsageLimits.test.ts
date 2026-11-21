import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { devinUsageWindows, parseDevinCredentials } from "./devinUsageLimits.ts";

// Trimmed from a Devin Max GetUserStatus answer.
const maxPlan = {
  userStatus: {
    userId: "user-1",
    planStatus: {
      planInfo: { planName: "Max", hideDailyQuota: true },
      dailyQuotaRemainingPercent: 100,
      weeklyQuotaRemainingPercent: 65,
      dailyQuotaResetAtUnix: "1795248000",
      weeklyQuotaResetAtUnix: "1795334400",
    },
  },
};

it.effect("reads the quotas a plan shows as used percentages", () =>
  Effect.gen(function* () {
    const { windows, userId } = yield* devinUsageWindows(maxPlan);
    assert.strictEqual(userId, "user-1");
    assert.deepStrictEqual(windows, [
      {
        id: "weekly",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 35,
        windowDurationMins: 7 * 24 * 60,
        resetsAt: "2026-11-22T08:00:00.000Z",
      },
    ]);
  }),
);

it.effect("treats a quota with only a reset time as exhausted", () =>
  Effect.gen(function* () {
    const { windows } = yield* devinUsageWindows({
      userStatus: {
        planStatus: { dailyQuotaResetAtUnix: "1795248000", weeklyQuotaRemainingPercent: 12.5 },
      },
    });
    assert.deepStrictEqual(
      windows.map(({ id, usedPercent }) => ({ id, usedPercent })),
      [
        { id: "daily", usedPercent: 100 },
        { id: "weekly", usedPercent: 87.5 },
      ],
    );
  }),
);

it("reads the CLI's key and server from credentials.toml", () => {
  assert.deepStrictEqual(
    parseDevinCredentials(
      'windsurf_api_key = "devin-abc"\napi_server_url = "https://server.codeium.com"\ndevin_webapp_host = "app.devin.ai"\n',
    ),
    { apiKey: "devin-abc", apiServerUrl: "https://server.codeium.com" },
  );
  assert.isUndefined(parseDevinCredentials('api_server_url = "https://server.codeium.com"\n'));
});
