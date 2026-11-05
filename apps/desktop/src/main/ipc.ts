import type { LaunchService, Workspace } from '@agenthub/application';
import { IpcChannel, type IpcErrorDto, type IpcInput, type IpcOutput, type IpcResult, ipcInput } from '@agenthub/contracts';
import { type AccountProfile, DomainError, accountName } from '@agenthub/domain';
import { type IpcMainInvokeEvent, app, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron';

interface IpcDependencies {
  workspace: Workspace;
  launching: LaunchService;
  engineStatus: () => IpcOutput[typeof IpcChannel.systemStatus]['storage'];
  dataDirectory: string;
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
}

const profileDto = (profile: AccountProfile) => ({ ...profile, name: accountName(profile) });

function toErrorDto(error: unknown): IpcErrorDto {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  // Paths and driver details stay in the log, not in the UI.
  console.error(error);
  return { code: 'UNEXPECTED', message: 'Đã xảy ra lỗi không mong đợi.' };
}

export function registerIpcHandlers({ workspace, launching, engineStatus, dataDirectory, isTrustedSender }: IpcDependencies): void {
  function handle<C extends keyof typeof ipcInput & keyof IpcOutput>(
    channel: C,
    run: (input: IpcInput<C>) => IpcOutput[C] | Promise<IpcOutput[C]>,
  ): void {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<IpcOutput[C]>> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Yêu cầu không hợp lệ.' } };
      }
      const parsed = ipcInput[channel].safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu gửi lên không hợp lệ.' } };
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
    if (failure) throw new DomainError('UNEXPECTED', `Không mở được folder tài liệu: ${failure}`);
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
    const { plan, permission, projectName, profileAlias, prompt, transcript } = await launching.preview(request);
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
}
