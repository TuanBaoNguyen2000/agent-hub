import type { GitObservation, GitObserver, PlatformPort } from '@agenthub/application';

// ADR-017 and TDD §10.2: a fixed set of read-only commands. --no-optional-locks keeps
// `git status` from refreshing the index, so observing never writes to the repository.
const READ_ONLY = ['--no-optional-locks', '-c', 'core.fsmonitor=false'];
const ENV = { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };

const UNKNOWN: GitObservation = { state: 'unknown', root: null, branch: null, head: null, headAt: null, dirty: null };
const NOT_REPO: GitObservation = { ...UNKNOWN, state: 'not_repo' };

export function createGitObserver(platform: Pick<PlatformPort, 'findCli' | 'run'>): GitObserver {
  // /usr/bin/git is only a stub without the Command Line Tools, and running it would ask the
  // user to install them; in that case Git is simply unknown.
  async function gitExecutable(): Promise<string | null> {
    const git = await platform.findCli('git', null);
    if (git !== '/usr/bin/git') return git;
    const tools = await platform.run('/usr/bin/xcode-select', ['-p'], { timeoutMs: 5000 });
    return tools.exit === 0 ? git : null;
  }

  return {
    async observe(path) {
      const git = await gitExecutable();
      if (!git) return UNKNOWN;
      const run = (...args: string[]) => platform.run(git, [...READ_ONLY, '-C', path, ...args], { extraEnv: ENV, timeoutMs: 15_000 });

      const root = await run('rev-parse', '--show-toplevel');
      if (root.timedOut || root.errorCode) return UNKNOWN;
      if (root.exit !== 0) return NOT_REPO;
      const [branch, head, headAt, status] = await Promise.all([
        run('symbolic-ref', '--quiet', '--short', 'HEAD'),
        run('rev-parse', '--verify', '--quiet', 'HEAD'),
        run('log', '-1', '--format=%cI'),
        run('status', '--porcelain', '--untracked-files=normal'),
      ]);
      return {
        state: 'repo',
        root: root.stdout.trim() || null,
        branch: branch.exit === 0 ? branch.stdout.trim() || null : null,
        head: head.exit === 0 ? head.stdout.trim() || null : null,
        headAt: headAt.exit === 0 && headAt.stdout.trim() ? new Date(headAt.stdout.trim()).toISOString() : null,
        dirty: status.exit === 0 ? status.stdout.trim() !== '' : null,
      };
    },
  };
}
