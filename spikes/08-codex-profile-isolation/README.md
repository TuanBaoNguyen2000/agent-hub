# SPIKE-08 — Codex profile isolation

**Status:** macOS: CLI Pass, Desktop Pass (reported). Windows chưa chạy.

## Objective

Kiểm tra xem `CODEX_HOME` riêng có tách được hai account ChatGPT cho Codex CLI không, và Codex Desktop (ChatGPT.app) có mở được instance thứ hai cho account đó theo cách của [SPIKE-07](../07-desktop-account-switch/README.md) không. Mục đích là tách account Team (công việc) với account Free (cá nhân), không phải để có thêm quota.

## Pass criteria

- **CLI:** hai `CODEX_HOME` dùng hai account khác nhau. Đăng nhập B không làm đổi A. Instructions và session của hai profile tách nhau, và chạy song song được.
- **Desktop:** instance thứ hai dùng account B và đọc `CODEX_HOME` của B, trong khi app chính vẫn dùng account cũ; đăng nhập được giữ sau khi mở lại.
- Không đọc `auth.json` hay nội dung session; chỉ kiểm tra file có tồn tại và đếm tên file. Không sửa, giải nén hay re-sign `ChatGPT.app`.

## Tài liệu và điều khoản (kiểm tra 2026-10-30)

| Nguồn | Nội dung liên quan |
|---|---|
| [Codex — Authentication](https://learn.chatgpt.com/docs/auth) | Login lưu trong `auth.json` dưới `CODEX_HOME` (mặc định `~/.codex`) hoặc trong OS credential store, theo `cli_auth_credentials_store`; không có hướng dẫn nhiều account. Admin có thể khoá login vào một workspace (`forced_chatgpt_workspace_id`) |
| [Codex — AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Codex đọc `AGENTS.md` trong thư mục Codex home trước instructions của project |
| [Codex pricing](https://learn.chatgpt.com/codex/pricing) | Free có Codex, nhưng surface duy nhất được ghi cho Free là Desktop app; chưa rõ Free có dùng CLI được không |
| [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) (hiệu lực 2026-01-01) | Cấm chia sẻ credential, cấm sửa, sao chép hoặc reverse engineer Services, cấm vượt rate limit hay restriction; không có điều khoản về việc một người có nhiều account. Account Team theo [Business Terms](https://openai.com/policies/business-terms/), chưa đọc |

**Đánh giá:** các văn bản đã đọc không cấm rõ việc một người dùng hai account của chính mình. Dùng account Free để bù quota của account Team thì có thể bị coi là vượt restriction, nên AgentHub không làm (TDD §1.4). Đây là đánh giá của agent, không phải tư vấn pháp lý; Business Terms và chính sách của workspace Team có thể giới hạn thêm.

**Trạng thái máy trước khi chạy:** `~/.codex/auth.json` tồn tại (agent chỉ kiểm tra file có tồn tại, không mở), nên login của profile A đang lưu dạng file. Đây là lý do rủi ro đăng nhập B ghi đè A qua Keychain chung được đánh giá thấp, nhưng vẫn phải kiểm tra.

## Thiết lập

- **Profile A:** `~/.codex`, account đang đăng nhập hiện tại. Không đổi.
- **Profile B:** `~/.agenthub-spike/codex-b`, cho account còn lại.
- **Instance Desktop B:** thư mục dữ liệu `~/.agenthub-spike/codex-desktop-b`.

Đăng nhập profile B trong Terminal.app. Người dùng tự thực hiện; script không chạm vào bước này.

```bash
mkdir -p "$HOME/.agenthub-spike/codex-b"
```

```bash
CODEX_HOME="$HOME/.agenthub-spike/codex-b" codex login --device-auth
```

`--device-auth` in một mã và một đường link. Mở link trong **cửa sổ riêng tư** của browser rồi đăng nhập account B, vì browser có thể tự dùng account đang mở ([SPIKE-01](../01-claude-profile-isolation/evidence/2026-10-30-macos.md)). Nếu account Team có nhiều workspace, chọn đúng workspace.

Với account Team, đăng nhập bằng mã có thể bị chặn cho đến khi admin của workspace bật tính năng này (đã gặp ngày 2026-10-30). Khi đó dùng cách đăng nhập thường. CLI tự mở browser, và browser có thể tự xác nhận bằng account đang đăng nhập trên chatgpt.com: lần chạy đầu ngày 2026-10-30, profile B vì thế đã vào nhầm account A. Hãy đóng tab browser tự mở, copy đường link mà Terminal in ra sang cửa sổ riêng tư, rồi đăng nhập account B:

```bash
CODEX_HOME="$HOME/.agenthub-spike/codex-b" codex login
```

## Cách chạy

Chạy trong Terminal.app, từ thư mục gốc của repo. Chỉ ghi alias A/B và tên gói, không ghi email.

**1. CLI** (khoảng 7 request ngắn, mỗi profile 3–4). Script mở Codex tương tác hai lần để bạn gõ `/status`:

```bash
spikes/08-codex-profile-isolation/run-codex-checks.sh cli
```

**2. Desktop** (1 request). Có thể giữ app chính mở. Không dùng ⌘Q khi có hai cửa sổ, vì chúng trùng tên và icon; script tự tắt đúng instance thứ hai theo PID:

```bash
spikes/08-codex-profile-isolation/run-codex-checks.sh desktop
```

Nếu cửa sổ thứ hai hiện màn hình đăng nhập, tắt app chính rồi chạy lệnh dưới, sau đó mở lại app chính và chạy lại bước 2:

```bash
spikes/08-codex-profile-isolation/run-codex-checks.sh desktop-login
```

Nếu dừng giữa chừng, tắt instance thứ hai bằng:

```bash
spikes/08-codex-profile-isolation/run-codex-checks.sh stop
```

Quan sát ghi vào `local/<timestamp>-<mode>/` (ignored).

## Dọn dẹp

Đăng xuất profile B, tắt instance thứ hai, rồi xoá thư mục:

```bash
CODEX_HOME="$HOME/.agenthub-spike/codex-b" codex logout
```

```bash
spikes/08-codex-profile-isolation/run-codex-checks.sh stop
```

```bash
rm -rf "$HOME/.agenthub-spike/codex-b" "$HOME/.agenthub-spike/codex-desktop-b"
```

## Evidence

- [2026-10-30 — macOS](evidence/2026-10-30-macos.md)
