import type { LoginStateDto, MachineAccountDto, ProfileDto, ProfileStatusDto, ProviderDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountAvatar, PROVIDER_LABELS, useAccountLauncher, windowLabel } from './accounts';
import { api, unwrap } from './api';
import { Monitor, More, Plus, Terminal } from './icons';
import { Disclosure, Menu, MenuItem, MenuSeparator } from './ui';
const LOGIN_POLL_MS = 1500;
const TERMINAL_POLL_MS = 3000;
const LOGIN_POLL_LIMIT = 100;

function loginText(status: ProfileStatusDto | undefined): string {
  if (!status) return 'Đang kiểm tra…';
  if (!status.cliPath) return 'Không tìm thấy CLI';
  if (status.login === 'logged_in') return status.loginDetail ? `Đã đăng nhập (${status.loginDetail})` : 'Đã đăng nhập';
  return status.login === 'logged_out' ? 'Chưa đăng nhập' : 'Không rõ trạng thái đăng nhập';
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
  if (state.phase === 'terminal') {
    return (
      <p className="hint" role="status">
        Hãy đăng nhập trong cửa sổ Terminal vừa mở. Nếu trình duyệt tự dùng account khác, hãy mở đường link trong cửa sổ riêng tư. Trạng thái ở đây sẽ tự cập nhật.
      </p>
    );
  }
  if (state.phase === 'failed') {
    return (
      <p className="banner warning" role="status">
        Đăng nhập chưa hoàn tất. Bạn có thể bấm Đăng nhập để thử lại.
      </p>
    );
  }
  return (
    <div className="stack" role="group" aria-label="Đang đăng nhập">
      <p className="hint" role="status">
        {state.privateBrowser
          ? `Đã mở cửa sổ riêng tư của ${state.privateBrowser}. Hãy đăng nhập đúng account bạn muốn thêm; AgentHub sẽ tự cập nhật khi xong. Nếu vẫn thấy account cũ, hãy đóng hết cửa sổ riêng tư rồi bấm Mở lại.`
          : 'Không tự mở được cửa sổ riêng tư. Hãy sao chép link rồi dán vào một cửa sổ riêng tư của trình duyệt; AgentHub sẽ tự cập nhật khi xong.'}
      </p>
      <div className="row">
        <button type="button" onClick={() => onReopen('private')}>
          Mở lại
        </button>
        <button type="button" onClick={() => onReopen('normal')}>
          Dùng trình duyệt thường
        </button>
        <button type="button" onClick={onCopy}>
          Sao chép link
        </button>
        <button type="button" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  status,
  login,
  starting,
  onLogin,
  onOpen,
  onReopen,
  onCopy,
  onCancel,
  onRemove,
}: {
  account: ProfileDto;
  status: ProfileStatusDto | undefined;
  login: LoginStateDto | undefined;
  starting: boolean;
  onLogin: () => void;
  onOpen: (mode: 'desktop' | 'cli') => void;
  onReopen: (browser: 'private' | 'normal') => void;
  onCopy: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const signedIn = status?.login === 'logged_in';
  const inProgress = starting || login?.phase === 'waiting' || login?.phase === 'terminal';
  return (
    <li className="account-row">
      <div className="account-row-main">
        <AccountAvatar account={account} />
        <div className="grow account-row-text">
          <strong className="truncate" data-testid="account-identity">
            {account.accountEmail ?? 'Chưa rõ account'}
          </strong>
          <span className="account-row-meta">
            {PROVIDER_LABELS[account.provider]} · {windowLabel(account)} ·{' '}
            <span className={signedIn ? 'login-state ok' : 'login-state'} data-testid="login-state">
              {loginText(status)}
            </span>
          </span>
        </div>
        {!inProgress && (
          <button type="button" onClick={onLogin}>
            {signedIn ? 'Đăng nhập lại' : 'Đăng nhập'}
          </button>
        )}
        <Menu label={`Thao tác với ${account.name}`} triggerClassName="icon-button" align="end" trigger={<More />}>
          <MenuItem icon={<Monitor />} onSelect={() => onOpen('desktop')}>
            Mở trong Desktop
          </MenuItem>
          <MenuItem icon={<Terminal />} onSelect={() => onOpen('cli')}>
            Mở trong Terminal
          </MenuItem>
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={onRemove}>
            Gỡ khỏi AgentHub
          </MenuItem>
        </Menu>
      </div>
      {starting && (
        <p className="hint account-row-detail" role="status">
          Đang chuẩn bị đăng nhập…
        </p>
      )}
      {login && (
        <div className="account-row-detail">
          <LoginProgress state={login} onReopen={onReopen} onCopy={onCopy} onCancel={onCancel} />
        </div>
      )}
      {status && status.sameAccountAs.length > 0 && (
        <p className="banner warning account-row-detail">
          Account này đang đăng nhập cùng tài khoản với "{status.sameAccountAs.join(', ')}". Có thể trình duyệt đã tự dùng phiên cũ; hãy bấm Đăng nhập lại và chọn account khác trong cửa sổ riêng tư.
        </p>
      )}
      <Disclosure summary="Thông tin kỹ thuật" className="account-row-detail">
        <dl className="facts">
          <dt>Email</dt>
          <dd>Do CLI báo. {account.provider === 'claude' && account.desktopDataDir ? 'Cửa sổ Desktop của account này có đăng nhập riêng.' : ''}</dd>
          <dt>Cấu hình CLI</dt>
          <dd>{account.cliConfigRoot ?? 'Mặc định của máy'}</dd>
          <dt>Dữ liệu Desktop</dt>
          <dd>{account.desktopDataDir ?? 'App chính'}</dd>
          <dt>CLI</dt>
          <dd>{status?.cliPath ? `${status.cliVersion ?? 'không rõ version'} — ${status.cliPath}` : 'Không tìm thấy'}</dd>
          <dt>Desktop</dt>
          <dd>{status?.desktopInstalled ? (status.desktopVersion ?? 'không rõ version') : 'Chưa cài'}</dd>
        </dl>
      </Disclosure>
    </li>
  );
}

export function AccountsSection({ onError, onChanged }: { onError: (message: string | undefined) => void; onChanged: () => void }) {
  const [accounts, setLoadedAccounts] = useState<ProfileDto[]>();
  const [statuses, setStatuses] = useState<Record<string, ProfileStatusDto>>({});
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

  const refreshStatus = useCallback(async (id: string): Promise<ProfileStatusDto | undefined> => {
    try {
      const status = await unwrap(api.getProfileStatus({ id }));
      setStatuses((current) => ({ ...current, [id]: status }));
      // The status is what teaches Main the email, and with it the account's name.
      if (status.accountEmail) setAccounts(await unwrap(api.listProfiles()));
      return status;
    } catch {
      return undefined;
    }
  }, [setAccounts]);

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
      const accepted = window.confirm(
        `Đây là account mặc định của ${PROVIDER_LABELS[account.provider]} CLI trên máy. Đăng nhập lại sẽ đổi account mà CLI dùng ở mọi nơi. Tiếp tục?`,
      );
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
    const accepted = window.confirm(
      `Gỡ "${account.name}" khỏi AgentHub?\n\nAgentHub chỉ quên account này. Đăng nhập và dữ liệu của ${PROVIDER_LABELS[account.provider]} không bị xoá, lịch sử mở vẫn được giữ.`,
    );
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
          <p className="hint">Đăng nhập do Claude và Codex xử lý trong trình duyệt; AgentHub không thấy và không lưu mật khẩu hay token.</p>
        </div>
        {!offer && !checking && (
          <Menu
            label="Thêm account"
            align="end"
            trigger={
              <>
                <Plus />
                Thêm account
              </>
            }
          >
            <MenuItem icon={<span className="avatar claude sm" aria-hidden="true">C</span>} description="Claude Desktop và Claude Code" onSelect={() => void choose('claude')}>
              Claude
            </MenuItem>
            <MenuItem icon={<span className="avatar codex sm" aria-hidden="true">C</span>} description="Codex Desktop và Codex CLI" onSelect={() => void choose('codex')}>
              Codex
            </MenuItem>
          </Menu>
        )}
      </div>
      {accounts?.length === 0 && !offer && !checking && <p className="hint settings-empty">Chưa có account nào.</p>}
      <ul className="settings-list">
        {accounts?.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            status={statuses[account.id]}
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
          Đang kiểm tra account trên máy…
        </p>
      )}
      {offer && (
        <div className="card offer" role="group" aria-label="Chọn account để thêm">
          <p>
            {PROVIDER_LABELS[offer.provider]} trên máy này đang đăng nhập bằng{' '}
            <strong>{offer.machine.accountEmail ?? 'một account chưa rõ email'}</strong>
            {offer.machine.loginDetail ? ` (${offer.machine.loginDetail})` : ''}.
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void add(offer.provider, 'machine')}>
              Dùng account này
            </button>
            <button type="button" onClick={() => void add(offer.provider, 'separate')}>
              Đăng nhập account khác
            </button>
            <button type="button" onClick={() => setOffer(undefined)}>
              Huỷ
            </button>
          </div>
        </div>
      )}
      {launcher.view}
    </section>
  );
}
