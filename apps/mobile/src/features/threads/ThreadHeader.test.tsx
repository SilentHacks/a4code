import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { AppBarProps } from "../../components/ui/AppBar.types";
import type { ThreadGitControlsProps } from "./ThreadGitControls";

const harness = vi.hoisted(() => ({ appBar: null as AppBarProps | null }));

vi.mock("../../components/ui/AppBar", () => ({
  AppBar: (props: AppBarProps) => {
    harness.appBar = props;
    return null;
  },
}));
vi.mock("../layout/AdaptiveWorkspaceLayout", () => ({
  useAdaptiveWorkspaceLayout: () => ({ toggleAuxiliaryPane: () => {}, startNewTask: () => {} }),
  useWorkspacePaneState: () => ({ panes: { auxiliaryPaneVisible: false } }),
}));
vi.mock("../layout/workspace/useAndroidWorkspaceNavigation", () => ({
  useWorkspaceBackNavigation: () => () => {},
}));
vi.mock("./ThreadGitControls", () => ({
  useThreadGitMenuDefinition: () => ({ title: "Git", icon: "arrow.triangle.branch", items: [] }),
  threadTerminalMenu: () => ({ title: "Terminal", icon: "terminal", items: [] }),
}));

import { ThreadHeader } from "./ThreadHeader";

const gitControls: ThreadGitControlsProps = {
  environmentId: "environment-1",
  threadId: "thread-1",
  currentBranch: "main",
  gitStatus: null,
  gitOperationLabel: null,
  onPull: async () => {},
  onRunAction: async () => null,
  canOpenTerminal: true,
  canOperateTerminal: true,
  canOpenFiles: true,
  projectScripts: [],
  terminalSessions: [],
  onOpenTerminal: () => {},
  onOpenNewTerminal: () => {},
  onRunProjectScript: async () => {},
};

let root: Root | null = null;
function render(element: ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root ??= createRoot(document.createElement("div"));
  act(() => root!.render(element));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  harness.appBar = null;
});

it("updates settle-and-new availability and callback without replacing Git or Terminal menus", () => {
  const header = (onSettleAndNewThread?: () => void) => (
    <ThreadHeader
      title="Thread"
      subtitle=""
      gitControls={gitControls}
      hasThreadCwd
      inspectorMode={null}
      onOpenFilesInspector={() => {}}
      onSettleAndNewThread={onSettleAndNewThread}
    />
  );
  const threadActions = () =>
    harness.appBar?.menus?.find((menu) => menu.title === "Thread actions");
  render(header());
  expect(threadActions()).toBeUndefined();

  const first = vi.fn();
  render(header(first));
  expect(harness.appBar?.menus?.map((menu) => menu.title)).toEqual([
    "Git",
    "Terminal",
    "Thread actions",
  ]);
  const action = threadActions()?.items[0];
  expect(action).toMatchObject({ id: "settle-and-new", title: "Settle and start new thread" });
  if (action && "onPress" in action) action.onPress();
  expect(first).toHaveBeenCalledOnce();

  const latest = vi.fn();
  render(header(latest));
  const updatedAction = threadActions()?.items[0];
  if (updatedAction && "onPress" in updatedAction) updatedAction.onPress();
  expect(latest).toHaveBeenCalledOnce();
  expect(first).toHaveBeenCalledOnce();

  render(header());
  expect(threadActions()).toBeUndefined();
});
