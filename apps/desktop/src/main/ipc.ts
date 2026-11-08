import type { LaunchService, Workspace } from '@agenthub/application';
import { IpcChannel, type IpcErrorDto, type IpcInput, type IpcOutput, type IpcResult, ipcInput } from '@agenthub/contracts';
import { type AccountProfile, DomainError, accountName, msg, raw } from '@agenthub/domain';
import { type IpcMainInvokeEvent, app, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron';
import { PROTOCOL_VERSIONS, SERVER_NAME, TOOLS } from '../mcp/server';
import { probeMcpServer, readLogTail } from './mcp-probe';

interface IpcDependencies {
  workspace: Workspace;
  launching: LaunchService;
  engineStatus: () => IpcOutput[typeof IpcChannel.systemStatus]['storage'];
  dataDirectory: string;
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
  // AgentHub's MCP server: how an account's client starts it, null without the shim.
  mcp: { server: (profileId: string) => { command: string; args: string[] } | null; logFile: string };
}

const profileDto = (profile: AccountProfile) => ({ ...profile, name: accountName(profile) });

function toErrorDto(error: unknown): IpcErrorDto {
  if (error instanceof DomainError) return { code: error.code, message: error.message, detail: error.detail };
  // Paths and driver details stay in the log, not in the UI.
  console.error(error);
  return { code: 'UNEXPECTED', message: 'Unexpected error.', detail: msg('error.unexpected') };
}

export function registerIpcHandlers({ workspace, launching, engineStatus, dataDirectory, isTrustedSender, mcp }: IpcDependencies): void {
  function handle<C extends keyof typeof ipcInput & keyof IpcOutput>(
    channel: C,
    run: (input: IpcInput<C>) => IpcOutput[C] | Promise<IpcOutput[C]>,
  ): void {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<IpcOutput[C]>> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid request.', detail: msg('error.badRequest') } };
      }
      const parsed = ipcInput[channel].safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid payload.', detail: msg('error.badPayload') } };
      }
      try {
        return { ok: true, data: await run(parsed.data as IpcInput<C>) };
      } catch (error) {
        return { ok: false, error: toErrorDto(error) };
      }
    });
  }

  const settingsDto = (settings: ReturnType<Workspace['getSettings']>): IpcOutput[typeof IpcChannel.settingsGet] => ({
    ...settings,
    dataDirectory,
  });

  handle(IpcChannel.systemStatus, () => ({ appVersion: app.getVersion(), storage: engineStatus() }));
  // The permission handler refuses the renderer's own clipboard, so text goes through Main.
  handle(IpcChannel.systemCopyText, ({ text }) => {
    clipboard.writeText(text);
    return null;
  });
  handle(IpcChannel.projectsList, () => workspace.listProjects());
  handle(IpcChannel.projectsPickFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle(IpcChannel.projectsAdd, (input) => workspace.addProject(input));
  handle(IpcChannel.projectsUpdate, (input) => workspace.updateProject(input));
  handle(IpcChannel.projectsRemove, ({ id }) => {
    workspace.removeProject(id);
    return null;
  });
  handle(IpcChannel.projectsUpdateContext, (input) => workspace.updateProjectContext(input));
  handle(IpcChannel.projectsContext, async ({ id }) => {
    // Explicit fields: the Git root stays in Main.
    const { overview, git, warnings, handoffs, checkpointPrompt } = await workspace.projectContext(id);
    return {
      overview,
      git: { state: git.state, branch: git.branch, head: git.head, headAt: git.headAt, dirty: git.dirty },
      warnings,
      handoffs,
      checkpointPrompt,
    };
  });
  handle(IpcChannel.projectsDetectContext, (input) => workspace.detectContext(input));
  handle(IpcChannel.projectsScanFolder, ({ path, projectId }) => workspace.scanFolder(path, projectId));
  handle(IpcChannel.projectsCreateContext, (input) => workspace.createContext(input));
  handle(IpcChannel.projectsUseContext, (input) => workspace.useContext(input));
  handle(IpcChannel.projectsScaffoldContext, ({ id }) => workspace.scaffoldContext(id));
  handle(IpcChannel.projectsMoveContext, (input) => workspace.changeContextFolder(input));
  handle(IpcChannel.projectsAddHandoff, ({ id, taskRef, entry }) => workspace.addHandoff({ id, taskRef, entry }));
  handle(IpcChannel.projectsReadHandoff, (input) => workspace.readProjectHandoff(input));
  handle(IpcChannel.projectsSaveHandoff, (input) => workspace.saveProjectHandoff(input));
  handle(IpcChannel.looseChatsList, () => workspace.listLooseChats());
  handle(IpcChannel.looseChatsRead, ({ id }) => workspace.readLooseChat(id));
  handle(IpcChannel.looseChatsSave, (input) => workspace.saveLooseChat(input));
  handle(IpcChannel.looseChatsMove, (input) => {
    workspace.moveLooseChat(input);
    return null;
  });
  handle(IpcChannel.projectsOpenContextFolder, async ({ id }) => {
    const failure = await shell.openPath(workspace.contextFolder(id));
    if (failure) throw new DomainError('UNEXPECTED', 'main.openDocsFailed', { reason: raw(failure) });
    return null;
  });
  handle(IpcChannel.settingsGet, () => settingsDto(workspace.getSettings()));
  handle(IpcChannel.settingsUpdate, (input) => {
    const settings = workspace.updateSettings(input);
    nativeTheme.themeSource = settings.theme;
    return settingsDto(settings);
  });
  handle(IpcChannel.settingsOpenDataFolder, async () => {
    await shell.openPath(dataDirectory);
    return null;
  });

  handle(IpcChannel.profilesList, () => launching.listProfiles().map(profileDto));
  handle(IpcChannel.profilesAdd, (input) => profileDto(launching.addAccount(input)));
  handle(IpcChannel.profilesUpdate, (input) => profileDto(launching.updateProfile(input)));
  handle(IpcChannel.profilesRemove, ({ id }) => {
    launching.removeProfile(id);
    return null;
  });
  handle(IpcChannel.profilesStatus, async ({ id }) => {
    // Explicit fields: an account fingerprint must never reach the renderer.
    const status = await launching.profileStatus(id);
    return {
      cliPath: status.cliPath,
      cliVersion: status.cliVersion,
      login: status.login,
      loginDetail: status.loginDetail,
      accountEmail: status.accountEmail,
      sameAccountAs: status.sameAccountAs,
      desktopInstalled: status.desktopInstalled,
      desktopVersion: status.desktopVersion,
      desktopVersionHasEvidence: status.desktopVersionHasEvidence,
    };
  });
  handle(IpcChannel.profilesUsage, async ({ id, refresh }) => {
    const usage = await launching.profileUsage(id, { refresh: refresh === true });
    return {
      state: usage.state,
      windows: usage.windows.map((window) => ({ ...window })),
      plan: usage.plan,
      limitReached: usage.limitReached,
      detail: usage.detail,
      checkedAt: usage.checkedAt,
    };
  });
  handle(IpcChannel.profilesMachineAccount, ({ provider }) => launching.machineAccount(provider));
  handle(IpcChannel.profilesOpenLogin, ({ id }) => launching.beginLogin(id));
  handle(IpcChannel.profilesLoginState, ({ id }) => launching.loginState(id));
  handle(IpcChannel.profilesLoginReopen, ({ id, browser }) => launching.reopenLogin(id, browser));
  handle(IpcChannel.profilesLoginCopyLink, ({ id }) => {
    // Written here so the address itself never has to reach the renderer.
    clipboard.writeText(launching.loginUrl(id));
    return null;
  });
  handle(IpcChannel.profilesLoginCancel, ({ id }) => {
    launching.cancelLogin(id);
    return null;
  });
  handle(IpcChannel.permissionsSet, (input) => {
    launching.setPermission(input);
    return null;
  });
  handle(IpcChannel.launchPlan, async (request) => {
    // Explicit fields: the plan's internal action holds commands and stays in Main.
    const { plan, permission, projectName, profileAlias, prompt, transcript, missingTools } = await launching.preview(request);
    return {
      steps: plan.steps,
      requiredConfirmations: plan.requiredConfirmations,
      blocker: plan.blocker,
      permission,
      projectName,
      profileAlias,
      prompt,
      // Explicit fields: the source profile id stays in Main.
      transcript: transcript && {
        path: transcript.path,
        updatedAt: transcript.updatedAt,
        sourceAccount: transcript.sourceAccount,
        provider: transcript.provider,
        otherAccount: transcript.otherAccount,
        otherProvider: transcript.otherProvider,
        checkpointAt: transcript.checkpointAt,
      },
      missingTools,
    };
  });
  handle(IpcChannel.launchExecute, async ({ request, confirmations }) => {
    const result = await launching.execute(request, confirmations);
    // A Desktop app takes no first prompt (TDD §8.2), so the line waits on the clipboard.
    const copied = request.mode === 'desktop' && result.prompt !== null && result.status !== 'failed';
    if (copied) clipboard.writeText(result.prompt as string);
    return { ...result, copied };
  });
  handle(IpcChannel.launchHistory, ({ projectId }) => launching.listLaunches(projectId));
  handle(IpcChannel.launchConfirmAccount, ({ attemptId }) => {
    launching.confirmAccount(attemptId);
    return null;
  });
  handle(IpcChannel.launchAccountPlan, async (request) => {
    const { steps, requiredConfirmations, blocker } = await launching.previewAccount(request);
    return { steps, requiredConfirmations, blocker };
  });
  handle(IpcChannel.launchAccountExecute, ({ request, confirmations }) => launching.openAccount(request, confirmations));

  handle(IpcChannel.documentsList, ({ id }) => workspace.listDocuments(id));
  handle(IpcChannel.documentsRead, ({ id, path }) => workspace.readDocument(id, path));
  handle(IpcChannel.documentsChecksum, ({ id, path }) => workspace.documentChecksum(id, path));
  handle(IpcChannel.documentsWrite, (input) => workspace.writeDocument(input));
  handle(IpcChannel.documentsOpen, async ({ id, path }) => {
    // Resolved inside the documents folder first, so only a document there can be opened.
    const failure = await shell.openPath(workspace.documentPath(id, path));
    if (failure) throw new DomainError('UNEXPECTED', 'main.openDocsFailed', { reason: raw(failure) });
    return null;
  });
  handle(IpcChannel.tasksRead, ({ id, ref }) => workspace.readTask(id, ref));
  handle(IpcChannel.tasksSave, (input) => workspace.saveTask(input));
  handle(IpcChannel.tasksSetState, (input) => workspace.setTaskState(input));
  handle(IpcChannel.tasksCreate, (input) => workspace.createTask(input));
  handle(IpcChannel.tasksCreateWorkstream, (input) => workspace.createWorkstream(input));

  const { tools } = launching;
  handle(IpcChannel.toolsOverview, () => tools.view());
  handle(IpcChannel.toolsInstall, ({ profileId, tool }) => tools.install(profileId, tool));
  handle(IpcChannel.toolsUninstall, ({ profileId, tool }) => tools.uninstall(profileId, tool));
  handle(IpcChannel.toolsSetAutoInstall, ({ profileId, on }) => tools.setAutoInstall(profileId, on));
  handle(IpcChannel.toolsAddSkill, ({ path }) => {
    tools.addSkill(path);
    return tools.view();
  });
  handle(IpcChannel.mcpInfo, () => {
    const template = mcp.server('<account>');
    return {
      name: SERVER_NAME,
      version: app.getVersion(),
      command: template?.command ?? null,
      args: template?.args ?? [],
      protocolVersions: [...PROTOCOL_VERSIONS],
      tools: TOOLS.map((tool) => ({ name: tool.name, readOnly: tool.annotations.readOnlyHint })),
      logFile: mcp.logFile,
    };
  });
  handle(IpcChannel.mcpProbe, async ({ profileId }) => {
    if (!launching.listProfiles().some((profile) => profile.id === profileId)) throw new DomainError('NOT_FOUND', 'error.accountNotFound');
    const server = mcp.server(profileId);
    if (!server) throw new DomainError('BIN_NOT_FOUND', 'tools.mcpUnavailable');
    return probeMcpServer(server.command, server.args);
  });
  handle(IpcChannel.mcpLog, () => readLogTail(mcp.logFile));
  handle(IpcChannel.mcpRevealLog, () => {
    shell.showItemInFolder(mcp.logFile);
    return null;
  });
  handle(IpcChannel.toolsRemoveSkill, ({ name }) => {
    tools.removeSkill(name);
    return tools.view();
  });
}
