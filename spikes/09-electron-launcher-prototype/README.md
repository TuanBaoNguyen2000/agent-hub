# SPIKE-09 — Electron launcher prototype

**Status:** macOS Pass (process: observed; màn hình: reported). Rủi ro còn mở: profile A của Claude CLI từng mất đăng nhập ngay sau lần `claude --desktop` qua pty; không tái hiện được với token mới, chưa rõ nguyên nhân ([evidence](evidence/2026-11-01-macos.md#profile-a-của-claude-cli-mất-đăng-nhập)). Windows chưa chạy (ADR-015).

**Cảnh báo:** `desktop-pty` và `check-desktop-login.sh` có thể làm profile A mất đăng nhập khi token đã cũ; chỉ chạy khi sẵn sàng đăng nhập lại.

## Kiểm tra login quanh `claude --desktop`

Mỗi lần chạy kiểm tra `claude auth status` và thời gian sửa của Keychain item trước và sau 2, 10, 30, 60 giây; không yêu cầu secret. Script dừng với exit 3 nếu profile A mất đăng nhập. Trừ `baseline`, mỗi lần mở một Code session trong Claude Desktop. Lần `electron` cần chạy từ env có biến của provider để lặp đúng điều kiện cũ.

```bash
spikes/09-electron-launcher-prototype/check-desktop-login.sh script
```

Các chế độ: `baseline`, `terminal`, `script`, `electron`. Kết quả ghi vào `local/login-trials.log` (ignored).

## Objective

Kiểm tra các launch đã chốt ở Phase 0 khi chạy từ Electron Main thật, không phải từ terminal: tìm executable khi app mở từ Finder, env allowlist, `open -n --env` của ADR-013 và ADR-014, CLI tương tác trong Terminal.app và `claude --desktop` qua pty. Đây là deliverable "minimal throwaway launcher prototypes" của TDD Phase 0. Code trong đây không được import vào sản phẩm, và Electron cài ở đây chưa phải là lựa chọn tooling.

## Pass criteria

- App mở từ Finder tìm được `claude` và `codex`, và chạy được chúng với env allowlist.
- Child process không nhận biến của provider từ env của app, kể cả khi app mang env nhiễm.
- Instance Desktop của ADR-013 và ADR-014 mở được từ Electron, đúng account, instance mặc định không đổi.
- CLI tương tác mở được trong Terminal.app đúng cwd và profile, an toàn với path chứa ký tự đặc biệt.
- `claude --desktop` được chấp nhận từ Electron và mở đúng folder.
- Không đọc thư mục dữ liệu, `auth.json` hay nội dung session; report không giữ giá trị env và account identifier.

## Cách chạy

Chạy từ thư mục của spike. `npm ci` không tải binary Electron; `install-electron` tải và kiểm tra checksum. Tổng dung lượng khoảng 272 MB.

```bash
npm ci
```

```bash
npx install-electron
```

```bash
./build-app.sh
```

App nằm ở `local/build/AgentHub Spike 09.app`. Mở không có tham số sẽ hiện cửa sổ với các nút; `--run=a,b` chạy không cửa sổ rồi thoát. Report ghi vào `local/runs/` (ignored).

**Mở bằng `open` để kiểm thử thì phải xoá env trước,** vì `open` chuyển env của process gọi sang app:

```bash
env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH=/usr/bin:/bin:/usr/sbin:/sbin /usr/bin/open -W -n "$PWD/local/build/AgentHub Spike 09.app" --args --run=launch-facts,resolve-claude,resolve-codex,env-allowlist --label=clean
```

## Xác nhận của người dùng

Mở thư mục chứa app, rồi **double-click** `AgentHub Spike 09.app` trong Finder. Nếu macOS chặn app chưa notarize, ghi lại thông báo đó.

```bash
open spikes/09-electron-launcher-prototype/local/build
```

Bấm các nút theo thứ tự và ghi lại quan sát. Chỉ ghi alias A/B, không ghi email. Các bước 2 và 4 làm Claude Desktop chuyển khỏi cuộc trò chuyện đang mở.

| # | Nút | Cần xác nhận |
|---|---|---|
| 1 | `launch-facts`, `resolve-claude`, `resolve-codex`, `versions` | Không cần quan sát; agent đọc report |
| 2 | `desktop-pty` | Claude Desktop mở Code session mới ở folder `Dự án thử`? |
| 3 | `codex-app` | ChatGPT mở workspace `Dự án thử`? |
| 4 | `deep-link` | Trang new session có prompt điền sẵn và chưa gửi? |
| 5 | `claude-b` | Cửa sổ thứ hai là account B, cửa sổ chính vẫn là A? |
| 6 | `codex-b` | Cửa sổ thứ hai là account B, không cần đăng nhập lại? |
| 7 | `terminal-claude-b` | Terminal mở Claude trong `Dự án thử`? Gõ `/status`: đúng account B? Rồi `/exit` |
| 8 | `terminal-codex-b` | Tương tự, gõ `/status`, rồi `/exit` |
| 9 | `stop-instances` | Hai cửa sổ của bước 5 và 6 đóng, cửa sổ chính còn nguyên? |

Không dùng ⌘Q trên hai cửa sổ cùng tên ở bước 5 và 6, vì dễ tắt nhầm. Bước 7 và 8 không gửi request nào nếu chỉ gõ `/status` và `/exit`.

## Dọn dẹp

Spike này không đăng nhập gì trong `spike09/`; các profile B của SPIKE-01, SPIKE-07, SPIKE-08 vẫn được giữ.

```bash
rm -rf "$HOME/.agenthub-spike/spike09" "$HOME/Library/Application Support/AgentHub Spike 09"
```

```bash
rm -rf spikes/09-electron-launcher-prototype/node_modules spikes/09-electron-launcher-prototype/local
```

## Evidence

- [2026-11-01 — macOS](evidence/2026-11-01-macos.md)
