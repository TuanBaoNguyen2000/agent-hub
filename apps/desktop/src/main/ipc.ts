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
  handle(IpcChannel.tasksList, ({ projectId }) => workspace.listTasks(projectId));
  handle(IpcChannel.tasksCreate, (input) => workspace.createTask(input));
  handle(IpcChannel.tasksUpdate, (input) => workspace.updateTask(input));
  handle(IpcChannel.contextGet, ({ reference }) => workspace.readContext(reference));
  handle(IpcChannel.contextSave, ({ reference, content, expectedRevision }) =>
    workspace.saveContext(reference, content, expectedRevision),
  );
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
    const { plan, permission, projectName, profileAlias } = await launching.preview(request);
    return {
      steps: plan.steps,
      requiredConfirmations: plan.requiredConfirmations,
      blocker: plan.blocker,
      permission,
      projectName,
      profileAlias,
    };
  });
  handle(IpcChannel.launchExecute, ({ request, confirmations }) => launching.execute(request, confirmations));
  handle(IpcChannel.launchHistory, ({ taskId }) => launching.listLaunches(taskId));
  handle(IpcChannel.launchConfirmAccount, ({ attemptId }) => {
    launching.confirmAccount(attemptId);
    return null;
  });
}
