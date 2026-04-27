import { Context } from "effect";
import type { Effect } from "effect";

export interface ProjectSetupScriptRunnerResultNoScript {
  readonly status: "no-script";
}

export interface ProjectSetupScriptRunnerResultStarted {
  readonly status: "started";
  readonly scriptId: string;
  readonly scriptName: string;
  readonly terminalId: string;
  readonly cwd: string;
}

export interface ProjectSetupScriptRunnerResultCompleted {
  readonly status: "completed";
  readonly scriptId: string;
  readonly scriptName: string;
  readonly cwd: string;
}

export type ProjectSetupScriptRunnerResult =
  | ProjectSetupScriptRunnerResultNoScript
  | ProjectSetupScriptRunnerResultStarted
  | ProjectSetupScriptRunnerResultCompleted;

export type ProjectWorktreeDeleteHookResult =
  | ProjectSetupScriptRunnerResultNoScript
  | ProjectSetupScriptRunnerResultCompleted;

export interface ProjectSetupScriptRunnerInput {
  readonly threadId: string;
  readonly projectId?: string;
  readonly projectCwd?: string;
  readonly worktreePath: string;
  readonly preferredTerminalId?: string;
}

export interface ProjectSetupScriptRunnerShape {
  readonly runForThread: (
    input: ProjectSetupScriptRunnerInput,
  ) => Effect.Effect<ProjectSetupScriptRunnerResult, Error>;
  readonly runWorktreeDeleteHook: (input: {
    readonly projectId?: string;
    readonly projectCwd?: string;
    readonly worktreePath: string;
  }) => Effect.Effect<ProjectWorktreeDeleteHookResult, Error>;
}

export class ProjectSetupScriptRunner extends Context.Service<
  ProjectSetupScriptRunner,
  ProjectSetupScriptRunnerShape
>()("t3/project/ProjectSetupScriptRunner") {}
