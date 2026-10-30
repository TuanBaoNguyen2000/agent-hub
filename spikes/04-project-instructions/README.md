# SPIKE-04 — Project instructions recognition

**Status:** macOS — Claude CLI, Codex CLI và Claude Desktop Pass; Codex Desktop chờ SPIKE-03.

## Objective

Xác minh coding mode của Claude và Codex đọc đúng `CLAUDE.md`/`AGENTS.md` từ project root, và phân biệt Chat với Code. Kết quả quyết định layout context export của AgentHub.

## Pass criteria

Theo [feasibility.md](../../docs/feasibility.md): fixture cho thấy coding mode đọc đúng file instructions từ project root; Chat và Code được phân biệt.

## Fixture

`setup-fixtures.sh` tạo ba Git repo nhỏ **ngoài repository này**, vì `CLAUDE.md`/`AGENTS.md` của agent-hub ở thư mục cha sẽ bị nạp và làm sai kết quả. Script từ chối chạy nếu thư mục cha có instruction file.

| Variant | Files | Kỳ vọng theo tài liệu (SPIKE-06) |
|---|---|---|
| `a-agents-only` | `AGENTS.md` | Claude: `A-AGENTS`; Codex: `A-AGENTS` |
| `b-both-no-import` | `CLAUDE.md`, `AGENTS.md` | Claude: chỉ `B-CLAUDE`; Codex: chỉ `B-AGENTS` |
| `c-claude-imports-agents` | `CLAUDE.md` có `@AGENTS.md`, `AGENTS.md` | Claude: `C-CLAUDE` và `C-AGENTS`; Codex: chỉ `C-AGENTS` |

## Cách chạy

Prerequisites: macOS, Claude CLI và Codex CLI đã đăng nhập bằng account mặc định. Mỗi CLI nhận một prompt ngắn cho mỗi variant (6 request), tính vào quota của account đang đăng nhập. Claude chạy với `--tools ""`; Codex chạy `--sandbox read-only --ignore-user-config`, log JSONL dùng để kiểm tra nó có đọc file bằng tool hay không. Cả hai CLI chạy với env allowlist để biến của phiên agent đang chạy script không ảnh hưởng auth. Tham số thứ ba (`claude`, `codex` hoặc `all`) chọn CLI cần chạy.

```bash
spikes/04-project-instructions/setup-fixtures.sh
```

```bash
spikes/04-project-instructions/run-cli-checks.sh "$TMPDIR/agenthub-spike04"
```

Output thô ghi vào `local/<timestamp>/` (ignored). Sau khi review, chuyển bản tóm tắt đã làm sạch vào `evidence/`.

## Bước manual (Desktop)

1. Claude Desktop, Code tab: chọn folder `c-claude-imports-agents`, gửi cùng prompt; ghi tokens trả về.
2. Claude Desktop, Chat: gửi cùng prompt không chọn folder; kỳ vọng `NONE`.
3. Codex Desktop (sau khi SPIKE-03 xác nhận app): mở folder `b-both-no-import`, gửi cùng prompt.

## Evidence

- [2026-10-30 — macOS CLI run](evidence/2026-10-30-macos-cli.md)
- [2026-10-30 — macOS Claude Desktop (manual)](evidence/2026-10-30-macos-claude-desktop.md)
