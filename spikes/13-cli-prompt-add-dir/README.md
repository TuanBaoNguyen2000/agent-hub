# SPIKE-13 — Prompt ban đầu và `--add-dir` của hai CLI

**Status:** macOS Pass (observed, 2026-11-04) — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 5 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan): Claude CLI và Codex CLI có nhận lời nhắc làm prompt đầu tiên khi mở tương tác không, và `--add-dir` có cho agent ghi vào thư mục tài liệu nằm ngoài workspace không.

Lời nhắc được truyền qua một script có cùng khuôn với script Terminal.app của launcher sản phẩm (`terminalScript` trong `packages/platform`: `env -i` với allowlist, mọi giá trị được quote). Lời nhắc chứa nháy đơn, nháy kép, `$(...)`, backtick, `$HOME`, `; & | \`, tiếng Việt và xuống dòng.

## Pass criteria

- Cả hai CLI mở tương tác nhận đúng nguyên văn lời nhắc làm tin nhắn đầu tiên, và không có lệnh nào trong lời nhắc bị shell thực thi.
- Ghi lại các hộp thoại chặn lời nhắc (tin tưởng folder…).
- `--add-dir` của mỗi CLI cho agent ghi được thư mục ngoài workspace; thiếu nó thì không ghi được.

## Prerequisites

Profile B của SPIKE-01 (Claude) và SPIKE-08 (Codex) đã đăng nhập. Fixture nằm ở `~/.agenthub-spike/spike13/`, ngoài mọi repo, để không có `CLAUDE.md` hay `AGENTS.md` của thư mục cha. Mỗi lần chạy tạo một workspace mới (`ws <giờ> dự án`), nên hộp thoại tin tưởng folder hiện lại.

## Cách chạy

Mỗi phép thử gửi một lượt agent ngắn. Bản chạy tương tác diễn ra trong pty bằng `/usr/bin/script`; màn hình được lưu vào `local/runs/*.typescript` (ignored), rồi script so sánh tin nhắn đầu tiên trong file session với lời nhắc đã gửi.

```bash
TRUST=1 spikes/13-cli-prompt-add-dir/run-cli-checks.sh prompt-claude
```

```bash
spikes/13-cli-prompt-add-dir/run-cli-checks.sh prompt-codex
```

```bash
spikes/13-cli-prompt-add-dir/run-cli-checks.sh add-dir-claude
```

```bash
spikes/13-cli-prompt-add-dir/run-cli-checks.sh add-dir-codex
```

Các biến tuỳ chọn:

- `TRUST=1`: bấm "Yes, I trust this folder" trong hộp thoại của Claude.
- `CLAUDE_ADD_DIR=1`: thêm `--add-dir=<context>` trước lời nhắc.
- `CODEX_SANDBOX_ARGS=`: bỏ `-s workspace-write`.
- `CLAUDE_VARIANTS=with`: chỉ chạy biến thể có `--add-dir`.

**Lưu ý:** Claude CLI mở tương tác có thể tự cập nhật bằng `npm install -g`. Trong lúc cập nhật, lệnh `claude` biến khỏi PATH vài phút (xem evidence).

## Dọn dẹp

```bash
rm -rf ~/.agenthub-spike/spike13 spikes/13-cli-prompt-add-dir/local
```

Mỗi workspace đã tin tưởng để lại một mục `projects` trong `.claude.json` của profile B.
