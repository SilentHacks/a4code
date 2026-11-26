import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:SilentHacks/a4code.git", "SilentHacks/a4code"],
  ["github.com:SilentHacks/a4code.git", "SilentHacks/a4code"],
  ["gitlab.com:T3Tools/platform/a4code", "T3Tools/platform/a4code"],
  ["https://github.com/SilentHacks/a4code.git", "SilentHacks/a4code"],
  ["https://github.com/SilentHacks/a4code.git?view=compact", "SilentHacks/a4code"],
  ["https://github.com/SilentHacks/a4code.git#section", "SilentHacks/a4code"],
  ["C:/repos/a4code", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
