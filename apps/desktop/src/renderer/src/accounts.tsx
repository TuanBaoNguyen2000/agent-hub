import type { AccountLaunchPreviewDto, ClientModeDto, LaunchOutcomeDto, ProfileDto, UsageDto } from '@agenthub/contracts';
import { type ReactNode, useState } from 'react';
import { api, unwrap } from './api';
import { useI18n } from './i18n';
import { Close } from './icons';
import { Dialog } from './ui';

export const PROVIDER_LABELS = { claude: 'Claude', codex: 'Codex' } as const;
export const MODE_LABELS: Record<ClientModeDto, string> = { desktop: 'Desktop', cli: 'Terminal' };

// Which Desktop window the account opens in; the two differ in what AgentHub can do (ADR-013).
export const windowLabel = (t: ReturnType<typeof useI18n>['t'], account: ProfileDto): string =>
  t(account.desktopDataDir ? 'account.ownWindow' : 'account.mainApp');

export function AccountAvatar({ account, size = 'md' }: { account: ProfileDto; size?: 'sm' | 'md' }) {
  const letter = (account.accountEmail ?? PROVIDER_LABELS[account.provider]).charAt(0).toUpperCase();
  return (
    <span className={`avatar ${account.provider} ${size}`} aria-hidden="true">
      {letter}
    </span>
  );
}

// ADR-024 item 5: how much an account can still take, from its tightest limit; null when unknown.
export function remainingPercent(usage: UsageDto | undefined): number | null {
  if (!usage || usage.state !== 'ok' || usage.windows.length === 0) return null;
  if (usage.limitReached) return 0;
  return Math.max(0, 100 - Math.max(...usage.windows.map((window) => window.usedPercent)));
}

export type AccountReadiness = 'ready' | 'full' | 'loggedOut' | 'unknown';

export function readiness(usage: UsageDto | undefined): AccountReadiness {
  if (!usage) return 'unknown';
  if (usage.state === 'logged_out') return 'loggedOut';
  if (usage.state !== 'ok') return 'unknown';
  return remainingPercent(usage) === 0 ? 'full' : 'ready';
}

export function needsDecision(preview: AccountLaunchPreviewDto): boolean {
  return preview.blocker !== null || preview.requiredConfirmations.length > 0 || preview.steps.some((step) => step.warning !== undefined);
}

interface Pending {
  account: ProfileDto;
  mode: ClientModeDto;
  preview: AccountLaunchPreviewDto;
}

// Opens an account on its own, without a task. Returns the launcher and what it has to show.
export function useAccountLauncher(onError: (message: string) => void): {
  launch: (account: ProfileDto, mode: ClientModeDto) => void;
  view: ReactNode;
} {
  const { t, tr } = useI18n();
  const [pending, setPending] = useState<Pending>();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [result, setResult] = useState<{ account: ProfileDto; mode: ClientModeDto; outcome: LaunchOutcomeDto }>();
  const [busy, setBusy] = useState(false);

  async function execute(account: ProfileDto, mode: ClientModeDto, confirmations: string[]): Promise<void> {
    setBusy(true);
    setPending(undefined);
    setConfirmed([]);
    try {
      const outcome = await unwrap(api.openAccount({ request: { profileId: account.id, mode }, confirmations }));
      setResult({ account, mode, outcome });
    } catch (reason) {
      onError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function launch(account: ProfileDto, mode: ClientModeDto): void {
    if (busy) return;
    setResult(undefined);
    unwrap(api.planAccountLaunch({ profileId: account.id, mode })).then(
      (preview) => {
        if (needsDecision(preview)) {
          setConfirmed([]);
          setPending({ account, mode, preview });
        } else {
          void execute(account, mode, []);
        }
      },
      (reason: unknown) => onError((reason as Error).message),
    );
  }

  const missing = pending?.preview.requiredConfirmations.some((item) => !confirmed.includes(item.id)) ?? false;

  const view = (
    <>
      {pending && (
        <Dialog
          label={t('launch.decide')}
          title={t('account.openIn', { account: tr(pending.account.name), mode: MODE_LABELS[pending.mode] })}
          onClose={() => setPending(undefined)}
          actions={
            <>
              <button type="button" onClick={() => setPending(undefined)}>
                {t('common.cancel')}
              </button>
              {!pending.preview.blocker && (
                <button
                  type="button"
                  className="primary"
                  disabled={missing || busy}
                  onClick={() => void execute(pending.account, pending.mode, confirmed)}
                >
                  {t('launch.continue')}
                </button>
              )}
            </>
          }
        >
          {pending.preview.blocker && (
            <p className="banner error" role="alert">
              {tr(pending.preview.blocker.message)}
            </p>
          )}
          {pending.preview.steps
            .filter((step) => step.warning)
            .map((step, index) => (
              <p key={index} className="banner warning">
                {tr(step.warning)}
              </p>
            ))}
          {pending.preview.requiredConfirmations.map((item) => (
            <label key={item.id} className="choice">
              <input
                type="checkbox"
                checked={confirmed.includes(item.id)}
                onChange={(event) =>
                  setConfirmed((current) => (event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))
                }
              />
              {tr(item.label)}
            </label>
          ))}
        </Dialog>
      )}
      {result && (
        <div className="toast" role="status" aria-label={t('account.launchResult')}>
          <div className="toast-header">
            <AccountAvatar account={result.account} size="sm" />
            <strong className="grow truncate">
              {t('account.opened', { mode: MODE_LABELS[result.mode], account: tr(result.account.name) })}
            </strong>
            <button type="button" className="icon-button" aria-label={t('common.close')} onClick={() => setResult(undefined)}>
              <Close />
            </button>
          </div>
          {result.outcome.warnings.map((warning, index) => (
            <p key={index} className="banner warning">
              {tr(warning)}
            </p>
          ))}
          {result.outcome.userActionRequired.length > 0 && <p className="hint">{t('account.todo')}</p>}
          {result.outcome.userActionRequired.length > 0 && (
            <ul className="todo">
              {result.outcome.userActionRequired.map((item, index) => (
                <li key={index}>{tr(item)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  return { launch, view };
}
