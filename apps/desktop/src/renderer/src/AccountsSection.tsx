import type { ProfileDto, ProfileStatusDto, ProviderDto } from '@agenthub/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, unwrap } from './api';

const PROVIDER_LABELS = { claude: 'Claude', codex: 'Codex' } as const;
const LOGIN_POLL_MS = 3000;
const LOGIN_POLL_LIMIT = 100;

function loginText(status: ProfileStatusDto | undefined): string {
  if (!status) return 'Đang kiểm tra…';
  if (!status.cliPath) return 'Không tìm thấy CLI';
  if (status.login === 'logged_in') return status.loginDetail ? `Đã đăng nhập (${status.loginDetail})` : 'Đã đăng nhập';
  return status.login === 'logged_out' ? 'Chưa đăng nhập' : 'Không rõ trạng thái đăng nhập';
}

function AccountRow({
  account,
  status,
  waitingForLogin,
  onRename,
  onLogin,
  onRemove,
}: {
  account: ProfileDto;
  status: ProfileStatusDto | undefined;
  waitingForLogin: boolean;
  onRename: (alias: string) => Promise<boolean>;
  onLogin: () => void;
  onRemove: () => void;
}) {
  const [alias, setAlias] = useState(account.alias);
  const signedIn = status?.login === 'logged_in';
  return (
    <li className="card">
      <div className="row">
        <input
          className="grow"
          aria-label={`Tên account ${account.alias}`}
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          onBlur={() => {
            if (alias.trim() === account.alias) return;
            void onRename(alias).then((ok) => {
              if (!ok) setAlias(account.alias);
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span className="badge">{PROVIDER_LABELS[account.provider]}</span>
        <span className={signedIn ? 'badge' : 'badge manual'} data-testid="login-state">
          {loginText(status)}
        </span>
      </div>
      {waitingForLogin && !signedIn && (
        <p className="hint" role="status">
          Hãy đăng nhập trong cửa sổ Terminal vừa mở. Nếu trình duyệt tự dùng account khác, hãy mở đường link trong cửa sổ riêng tư. Trạng thái ở đây sẽ tự cập nhật.
        </p>
      )}
      {status && status.sameAccountAs.length > 0 && (
        <p className="banner warning">
          Account này trùng với "{status.sameAccountAs.join(', ')}". Có thể trình duyệt đã đăng nhập nhầm; hãy đăng xuất rồi đăng nhập lại bằng cửa sổ riêng tư.
        </p>
      )}
      <div className="row">
        {!signedIn && (
          <button type="button" onClick={onLogin}>
            Đăng nhập
          </button>
        )}
        <button type="button" onClick={onRemove}>
          Gỡ
        </button>
      </div>
      <details>
        <summary>Thông tin kỹ thuật</summary>
        <dl>
          <dt>Cấu hình CLI</dt>
          <dd>{account.cliConfigRoot ?? 'Mặc định của máy'}</dd>
          <dt>Dữ liệu Desktop</dt>
          <dd>{account.desktopDataDir ?? 'App chính'}</dd>
          <dt>CLI</dt>
          <dd>{status?.cliPath ? `${status.cliVersion ?? 'không rõ version'} — ${status.cliPath}` : 'Không tìm thấy'}</dd>
          <dt>Desktop</dt>
          <dd>{status?.desktopInstalled ? (status.desktopVersion ?? 'không rõ version') : 'Chưa cài'}</dd>
        </dl>
      </details>
    </li>
  );
}

export function AccountsSection({ onError }: { onError: (message: string | undefined) => void }) {
  const [accounts, setAccounts] = useState<ProfileDto[]>();
  const [statuses, setStatuses] = useState<Record<string, ProfileStatusDto>>({});
  const [choosing, setChoosing] = useState(false);
  const [waiting, setWaiting] = useState<string>();
  const polls = useRef(0);

  const refreshStatus = useCallback(async (id: string): Promise<ProfileStatusDto | undefined> => {
    try {
      const status = await unwrap(api.getProfileStatus({ id }));
      setStatuses((current) => ({ ...current, [id]: status }));
      return status;
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    unwrap(api.listProfiles()).then(
      (loaded) => {
        setAccounts(loaded);
        for (const account of loaded) void refreshStatus(account.id);
      },
      (reason: unknown) => onError((reason as Error).message),
    );
  }, [onError, refreshStatus]);

  // The official sign-in happens in Terminal, so this only watches for it to finish.
  useEffect(() => {
    if (!waiting) return;
    polls.current = 0;
    const timer = setInterval(() => {
      polls.current += 1;
      if (polls.current > LOGIN_POLL_LIMIT) {
        setWaiting(undefined);
        return;
      }
      void refreshStatus(waiting).then((status) => {
        if (status?.login === 'logged_in') setWaiting(undefined);
      });
    }, LOGIN_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, refreshStatus]);

  async function login(id: string): Promise<void> {
    onError(undefined);
    try {
      await unwrap(api.openProfileLogin({ id }));
      setWaiting(id);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function add(provider: ProviderDto): Promise<void> {
    onError(undefined);
    setChoosing(false);
    try {
      const account = await unwrap(api.addAccount({ provider }));
      setAccounts(await unwrap(api.listProfiles()));
      const status = await refreshStatus(account.id);
      if (status?.login === 'logged_out' && status.cliPath) await login(account.id);
    } catch (reason) {
      onError((reason as Error).message);
    }
  }

  async function rename(account: ProfileDto, alias: string): Promise<boolean> {
    onError(undefined);
    try {
      await unwrap(
        api.updateProfile({
          id: account.id,
          provider: account.provider,
          alias,
          cliConfigRoot: account.cliConfigRoot,
          desktopDataDir: account.desktopDataDir,
        }),
      );
      setAccounts(await unwrap(api.listProfiles()));
      return true;
    } catch (reason) {
      onError((reason as Error).message);
      return false;
    }
  }

  async function remove(account: ProfileDto): Promise<void> {
    const accepted = window.confirm(
      `Gỡ "${account.alias}" khỏi AgentHub?\n\nAgentHub chỉ quên account này. Đăng nhập và dữ liệu của ${PROVIDER_LABELS[account.provider]} không bị xoá, lịch sử mở vẫn được giữ.`,
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
    <section className="stack section" aria-label="Accounts">
      <h2>Accounts</h2>
      {accounts?.length === 0 && <p className="hint">Chưa có account nào.</p>}
      <ul className="stack list-plain">
        {accounts?.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            status={statuses[account.id]}
            waitingForLogin={waiting === account.id}
            onRename={(alias) => rename(account, alias)}
            onLogin={() => void login(account.id)}
            onRemove={() => void remove(account)}
          />
        ))}
      </ul>
      {choosing ? (
        <div className="row" role="group" aria-label="Chọn loại account">
          <button type="button" onClick={() => void add('claude')}>
            Claude
          </button>
          <button type="button" onClick={() => void add('codex')}>
            Codex
          </button>
          <button type="button" onClick={() => setChoosing(false)}>
            Huỷ
          </button>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="primary" onClick={() => setChoosing(true)}>
            Thêm account
          </button>
        </div>
      )}
      <p className="hint">Đăng nhập do Claude và Codex xử lý; AgentHub không thấy và không lưu mật khẩu hay token.</p>
    </section>
  );
}
