import type { LoginStateDto, MachineAccountDto, ProfileDto, ProfileStatusDto, ProviderDto, UsageDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, useAccountLauncher, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { Monitor, More, Plus, Terminal } from './icons';
import { Disclosure, Menu, MenuItem, MenuSeparator } from './ui';
import { UsagePanel } from './usage';
const LOGIN_POLL_MS = 1500;
const TERMINAL_POLL_MS = 3000;
const LOGIN_POLL_LIMIT = 100;

function loginText({ t }: ReturnType<typeof useI18n>, status: ProfileStatusDto | undefined): string {
  if (!status) return t('accounts.checking');
  if (!status.cliPath) return t('accounts.noCli');
  if (status.login === 'logged_in') return status.loginDetail ? t('accounts.signedInAs', { detail: status.loginDetail }) : t('accounts.signedIn');
  return t(status.login === 'logged_out' ? 'accounts.signedOut' : 'accounts.loginUnknown');
}

function LoginProgress({
  state,
  onReopen,
  onCopy,
  onCancel,
}: {
  state: LoginStateDto;
  onReopen: (browser: 'private' | 'normal') => void;
  onCopy: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (state.phase === 'terminal') {
    return (
      <p className="hint" role="status">
        {t('login.terminal')}
      </p>
    );
  }
  if (state.phase === 'failed') {
    return (
      <p className="banner warning" role="status">
        {t('login.failed')}
      </p>
    );
  }
  return (
    <div className="stack" role="group" aria-label={t('login.inProgress')}>
      <p className="hint" role="status">
        {state.privateBrowser ? t('login.privateOpened', { browser: state.privateBrowser }) : t('login.privateFailed')}
      </p>
      <div className="row">
        <button type="button" onClick={() => onReopen('private')}>
          {t('login.reopen')}
        </button>
        <button type="button" onClick={() => onReopen('normal')}>
          {t('login.normalBrowser')}
        </button>
        <button type="button" onClick={onCopy}>
          {t('login.copyLink')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  status,
  usage,
  usageLoading,
  login,
  starting,
  onLogin,
  onRefreshUsage,
  onOpen,
  onReopen,
  onCopy,
  onCancel,
  onRemove,
}: {
  account: ProfileDto;
  status: ProfileStatusDto | undefined;
  usage: UsageDto | undefined;
  usageLoading: boolean;
  login: LoginStateDto | undefined;
  starting: boolean;
  onLogin: () => void;
  onRefreshUsage: () => void;
  onOpen: (mode: 'desktop' | 'cli') => void;
  onReopen: (browser: 'private' | 'normal') => void;
  onCopy: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const i18n = useI18n();
  const { t, tr } = i18n;
  const signedIn = status?.login === 'logged_in';
  const inProgress = starting || login?.phase === 'waiting' || login?.phase === 'terminal';
  return (
    <li className="account-row">
      <div className="account-row-main">
        <AccountAvatar account={account} />
        <div className="grow account-row-text">
          <strong className="truncate" data-testid="account-identity">
            {account.accountEmail ?? t('accounts.unknown')}
          </strong>
          <span className="account-row-meta">
            {PROVIDER_LABELS[account.provider]} · {windowLabel(t, account)} ·{' '}
            <span className={signedIn ? 'login-state ok' : 'login-state'} data-testid="login-state">
              {loginText(i18n, status)}
            </span>
          </span>
        </div>
        {!inProgress && (
          <button type="button" onClick={onLogin}>
            {t(signedIn ? 'accounts.signInAgain' : 'accounts.signIn')}
          </button>
        )}
        <Menu label={t('accounts.actions', { account: tr(account.name) })} triggerClassName="icon-button" align="end" trigger={<More />}>
          <MenuItem icon={<Monitor />} onSelect={() => onOpen('desktop')}>
            {t('launch.openDesktop')}
          </MenuItem>
          <MenuItem icon={<Terminal />} onSelect={() => onOpen('cli')}>
            {t('launch.openTerminal')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={onRemove}>
            {t('project.remove')}
          </MenuItem>
        </Menu>
      </div>
      {signedIn && (
        <div className="account-row-detail">
          <UsagePanel usage={usage} loading={usageLoading} onRefresh={onRefreshUsage} />
        </div>
      )}
      {starting && (
        <p className="hint account-row-detail" role="status">
          {t('login.preparing')}
        </p>
      )}
      {login && (
        <div className="account-row-detail">
          <LoginProgress state={login} onReopen={onReopen} onCopy={onCopy} onCancel={onCancel} />
        </div>
      )}
      {status && status.sameAccountAs.length > 0 && (
        <p className="banner warning account-row-detail">
          {t('accounts.sameLogin', { accounts: status.sameAccountAs.map(tr).join(', ') })}
        </p>
      )}
      <Disclosure summary={t('accounts.details')} className="account-row-detail">
        <dl className="facts">
          <dt>Email</dt>
          <dd>
            {t('accounts.emailFromCli')}
            {account.provider === 'claude' && account.desktopDataDir ? ` ${t('accounts.desktopOwnLogin')}` : ''}
          </dd>
          <dt>{t('accounts.cliConfig')}</dt>
          <dd>{account.cliConfigRoot ?? t('accounts.machineDefault')}</dd>
          <dt>{t('accounts.desktopData')}</dt>
          <dd>{account.desktopDataDir ?? t('account.mainApp')}</dd>
          <dt>CLI</dt>
          <dd>{status?.cliPath ? `${status.cliVersion ?? t('launch.unknownVersion')} — ${status.cliPath}` : t('accounts.notFound')}</dd>
          <dt>Desktop</dt>
          <dd>{status?.desktopInstalled ? (status.desktopVersion ?? t('launch.unknownVersion')) : t('accounts.notInstalled')}</dd>
        </dl>
      </Disclosure>
    </li>
  );
}

export function AccountsSection({ onError, onChanged }: { onError: (message: string | undefined) => void; onChanged: () => void }) {
  const { t, tr } = useI18n();
  const [accounts, setLoadedAccounts] = useState<ProfileDto[]>();
  const [statuses, setStatuses] = useState<Record<string, ProfileStatusDto>>({});
  const [usages, setUsages] = useState<Record<string, UsageDto>>({});
  const [usageLoading, setUsageLoading] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [offer, setOffer] = useState<{ provider: ProviderDto; machine: MachineAccountDto }>();
  const [login, setLogin] = useState<{ id: string; state: LoginStateDto }>();
  const [starting, setStarting] = useState<string>();
  // Cancelling the sign-in of an account being added also cancels adding it.
  const justAdded = useRef<string>(undefined);
  const polls = useRef(0);
  const launcher = useAccountLauncher(onError);

  // The sidebar lists accounts too, so every change goes to it as well.
  const setAccounts = useCallback(
    (loaded: ProfileDto[]) => {
      setLoadedAccounts(loaded);
      onChanged();
    },
    [onChanged],
  );

  const loadUsage = useCallback(async (id: string, refresh: boolean): Promise<void> => {
    setUsageLoading((current) => ({ ...current, [id]: true }));
    try {
      const usage = await unwrap(api.getProfileUsage({ id, refresh }));
      setUsages((current) => ({ ...current, [id]: usage }));
    } catch {
      // Usage is extra information; the row stays usable without it.
    } finally {
      setUsageLoading((current) => ({ ...current, [id]: false }));
    }
  }, []);

  const refreshStatus = useCallback(async (id: string): Promise<ProfileStatusDto | undefined> => {
    try {
      const status = await unwrap(api.getProfileStatus({ id }));
      setStatuses((current) => ({ ...current, [id]: status }));
      // A changed login means the old figures belong to another account.
      if (status.login === 'logged_in') void loadUsage(id, false);
      // The status is what teaches Main the email, and with it the account's name.
      if (status.accountEmail) setAccounts(await unwrap(api.listProfiles()));
      return status;
    } catch {
      return undefined;
    }
  }, [setAccounts, loadUsage]);

  useEffect(() => {
    unwrap(api.listProfiles()).then(
      (loaded) => {
        setAccounts(loaded);
        for (const account of loaded) {
          void refreshStatus(account.id);
          // A sign-in keeps running in Main while the user is on another screen.
          void unwrap(api.getLoginState({ id: account.id })).then((state) => {
            if (state.phase === 'waiting' || state.phase === 'terminal') setLogin({ id: account.id, state });
          });
        }
      },
      (reason: unknown) => onError((reason as Error).message),
    );
  }, [onError, refreshStatus, setAccounts]);

  const loginId = login?.id;
  const loginPhase = login?.state.phase;

  useEffect(() => {
    if (!loginId || (loginPhase !== 'waiting' && loginPhase !== 'terminal')) return;
    polls.current = 0;
    const timer = setInterval(() => {
      polls.current += 1;
      if (loginPhase === 'terminal') {
        // Terminal's flow reports nothing back, so this only watches the login status.
        if (polls.current > LOGIN_POLL_LIMIT) {
          setLogin(undefined);
          return;
        }
        void refreshStatus(loginId).then((status) => {
          if (status?.login === 'logged_in') setLogin(undefined);
        });
        return;
      }
      void unwrap(api.getLoginState({ id: loginId })).then(async (state) => {
        if (state.phase === 'waiting') return;
        setLogin(state.phase === 'failed' ? { id: loginId, state } : undefined);
        if (state.phase !== 'succeeded') return;
        justAdded.current = undefined;
        // The other rows may now have to warn about a duplicate too.
        for (const account of await unwrap(api.listProfiles())) void refreshStatus(account.id);
      });
    }, loginPhase === 'terminal' ? TERMINAL_POLL_MS : LOGIN_POLL_MS);
    return () => clearInterval(timer);
  }, [loginId, loginPhase, refreshStatus]);

  async function startLogin(id: string): Promise<void> {
    onError(undefined);
    setLogin(undefined);
    setStarting(id);
    try {
      setLogin({ id, state: await unwrap(api.openProfileLogin({ id })) });
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setStarting(undefined);
    }
  }

  async function requestLogin(account: ProfileDto): Promise<void> {
    // Signing in again here replaces what `claude` or `codex` uses everywhere on this machine.
    if (account.cliConfigRoot === null && statuses[account.id]?.login === 'logged_in') {
      const accepted = window.confirm(t('accounts.reloginMachine', { provider: PROVIDER_LABELS[account.provider] }));
      if (!accepted) return;
    }
    justAdded.current = undefined;
    await startLogin(account.id);
  }

  async function reopenLogin(id: string, browser: 'private' | 'normal'): Promise<void> {
    onError(undefined);
    try {
      setLogin({ id, state: await unwrap(api.reopenLogin({ id, browser })) });
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function copyLink(id: string): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.copyLoginLink({ id }));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function cancelLogin(id: string): Promise<void> {
    onError(undefined);
    setLogin(undefined);
    try {
      await unwrap(api.cancelLogin({ id }));
      if (justAdded.current === id) {
        justAdded.current = undefined;
        await unwrap(api.removeProfile({ id }));
        setAccounts(await unwrap(api.listProfiles()));
      }
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function add(provider: ProviderDto, source: 'machine' | 'separate'): Promise<void> {
    onError(undefined);
    setOffer(undefined);
    try {
      const account = await unwrap(api.addAccount({ provider, source }));
      setAccounts(await unwrap(api.listProfiles()));
      const status = await refreshStatus(account.id);
      if (status?.login === 'logged_out' && status.cliPath) {
        justAdded.current = account.id;
        await startLogin(account.id);
      }
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function choose(provider: ProviderDto): Promise<void> {
    onError(undefined);
    setChecking(true);
    try {
      const machine = await unwrap(api.getMachineAccount({ provider }));
      // Never adopt a login the user did not pick: asking is the only way to reach another account.
      if (machine.available && machine.login === 'logged_in') setOffer({ provider, machine });
      else await add(provider, machine.available ? 'machine' : 'separate');
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function remove(account: ProfileDto): Promise<void> {
    const accepted = window.confirm(t('accounts.removeConfirm', { account: tr(account.name), provider: PROVIDER_LABELS[account.provider] }));
    if (!accepted) return;
    try {
      await unwrap(api.removeProfile({ id: account.id }));
      setAccounts(await unwrap(api.listProfiles()));
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  return (
    <section className="settings-group" aria-label="Accounts">
      <div className="settings-group-header">
        <div className="grow">
          <h2>Accounts</h2>
          <p className="hint">{t('accounts.hint')}</p>
        </div>
        {!offer && !checking && (
          <Menu
            label={t('accounts.add')}
            align="end"
            trigger={
              <>
                <Plus />
                {t('accounts.add')}
              </>
            }
          >
            <MenuItem icon={<span className="avatar claude sm" aria-hidden="true">C</span>} description={t('accounts.claudeApps')} onSelect={() => void choose('claude')}>
              Claude
            </MenuItem>
            <MenuItem icon={<span className="avatar codex sm" aria-hidden="true">C</span>} description={t('accounts.codexApps')} onSelect={() => void choose('codex')}>
              Codex
            </MenuItem>
          </Menu>
        )}
      </div>
      {accounts?.length === 0 && !offer && !checking && <p className="hint settings-empty">{t('accounts.empty')}</p>}
      <ul className="settings-list">
        {accounts?.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            status={statuses[account.id]}
            usage={usages[account.id]}
            usageLoading={usageLoading[account.id] === true}
            onRefreshUsage={() => void loadUsage(account.id, true)}
            login={login?.id === account.id ? login.state : undefined}
            starting={starting === account.id}
            onOpen={(mode) => launcher.launch(account, mode)}
            onLogin={() => void requestLogin(account)}
            onReopen={(browser) => void reopenLogin(account.id, browser)}
            onCopy={() => void copyLink(account.id)}
            onCancel={() => void cancelLogin(account.id)}
            onRemove={() => void remove(account)}
          />
        ))}
      </ul>
      {checking && (
        <p className="hint settings-empty" role="status">
          {t('accounts.checkingMachine')}
        </p>
      )}
      {offer && (
        <div className="card offer" role="group" aria-label={t('accounts.offer')}>
          <p>
            {t('accounts.machineSignedIn', {
              provider: PROVIDER_LABELS[offer.provider],
              email: offer.machine.accountEmail ?? t('accounts.unknownEmail'),
            })}
            {offer.machine.loginDetail ? ` (${tr(offer.machine.loginDetail)})` : ''}.
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void add(offer.provider, 'machine')}>
              {t('accounts.useThis')}
            </button>
            <button type="button" onClick={() => void add(offer.provider, 'separate')}>
              {t('accounts.signInOther')}
            </button>
            <button type="button" onClick={() => setOffer(undefined)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {launcher.view}
    </section>
  );
}
