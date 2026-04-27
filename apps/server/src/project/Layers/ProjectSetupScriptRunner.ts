import {
  projectScriptRuntimeEnv,
  setupProjectScript,
  worktreeDeleteProjectScript,
} from "@t3tools/shared/projectScripts";
import { Data, Effect, Layer } from "effect";
import { listLoginShellCandidates } from "@t3tools/shared/shell";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { TerminalManager } from "../../terminal/Services/Manager.ts";
import { runProcess } from "../../processRunner.ts";
import {
  type ProjectSetupScriptRunnerShape,
  ProjectSetupScriptRunner,
} from "../Services/ProjectSetupScriptRunner.ts";

class ProjectLifecycleScriptExecutionError extends Data.TaggedError(
  "ProjectLifecycleScriptExecutionError",
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const makeProjectSetupScriptRunner = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const terminalManager = yield* TerminalManager;

  const resolveProject = Effect.fn("ProjectSetupScriptRunner.resolveProject")(function* (input: {
    readonly projectId?: string;
    readonly projectCwd?: string;
  }) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const project =
      (input.projectId ? readModel.projects.find((entry) => entry.id === input.projectId) : null) ??
      (input.projectCwd
        ? readModel.projects.find((entry) => entry.workspaceRoot === input.projectCwd)
        : null) ??
      null;

    if (!project) {
      return yield* Effect.fail(new Error("Project was not found for lifecycle script execution."));
    }

    return project;
  });

  const runCommandInShell = Effect.fn("ProjectSetupScriptRunner.runCommandInShell")(
    function* (input: {
      readonly command: string;
      readonly cwd: string;
      readonly env: Record<string, string>;
    }) {
      const baseEnv = { ...process.env, ...input.env };

      if (process.platform === "win32") {
        yield* Effect.tryPromise({
          try: () =>
            runProcess(
              "powershell.exe",
              ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", input.command],
              {
                cwd: input.cwd,
                env: baseEnv,
              },
            ),
          catch: (error) =>
            new ProjectLifecycleScriptExecutionError({
              message: error instanceof Error ? error.message : String(error),
              cause: error,
            }),
        });
        return;
      }

      const shell = listLoginShellCandidates(process.platform, process.env.SHELL)[0] ?? "/bin/sh";
      yield* Effect.tryPromise({
        try: () => runProcess(shell, ["-lc", input.command], { cwd: input.cwd, env: baseEnv }),
        catch: (error) =>
          new ProjectLifecycleScriptExecutionError({
            message: error instanceof Error ? error.message : String(error),
            cause: error,
          }),
      });
    },
  );

  const runForThread: ProjectSetupScriptRunnerShape["runForThread"] = (input) =>
    Effect.gen(function* () {
      const project = yield* resolveProject(input);

      const script = setupProjectScript(project.scripts);
      if (!script) {
        return {
          status: "no-script",
        } as const;
      }

      const terminalId = input.preferredTerminalId ?? `setup-${script.id}`;
      const cwd = input.worktreePath;
      const env = projectScriptRuntimeEnv({
        project: { cwd: project.workspaceRoot },
        worktreePath: input.worktreePath,
      });

      yield* terminalManager.open({
        threadId: input.threadId,
        terminalId,
        cwd,
        worktreePath: input.worktreePath,
        env,
      });
      yield* terminalManager.write({
        threadId: input.threadId,
        terminalId,
        data: `${script.command}\r`,
      });

      return {
        status: "started",
        scriptId: script.id,
        scriptName: script.name,
        terminalId,
        cwd,
      } as const;
    });

  const runWorktreeDeleteHook: ProjectSetupScriptRunnerShape["runWorktreeDeleteHook"] = (input) =>
    Effect.gen(function* () {
      const project = yield* resolveProject(input);
      const script = worktreeDeleteProjectScript(project.scripts);
      if (!script) {
        return {
          status: "no-script",
        } as const;
      }

      const cwd = input.worktreePath;
      const env = projectScriptRuntimeEnv({
        project: { cwd: project.workspaceRoot },
        worktreePath: input.worktreePath,
      });

      yield* runCommandInShell({
        command: script.command,
        cwd,
        env,
      }).pipe(
        Effect.mapError(
          (error) => new Error(`Worktree delete hook "${script.name}" failed: ${error.message}`),
        ),
      );

      return {
        status: "completed",
        scriptId: script.id,
        scriptName: script.name,
        cwd,
      } as const;
    });

  return {
    runForThread,
    runWorktreeDeleteHook,
  } satisfies ProjectSetupScriptRunnerShape;
});

export const ProjectSetupScriptRunnerLive = Layer.effect(
  ProjectSetupScriptRunner,
  makeProjectSetupScriptRunner,
);
