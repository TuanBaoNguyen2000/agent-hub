# SPIKE-04 evidence — macOS Claude Desktop (manual)

```text
Spike ID / run ID: SPIKE-04 / 2026-10-30-macos-claude-desktop
Ngày giờ và người xác minh: 2026-10-30; người dùng thực hiện thủ công, báo kết quả cho agent
OS / architecture / exact tool versions: macOS 26.5.1 arm64; Claude Desktop 4.29.0 (đọc từ Info.plist sau lần chạy)
Fixture project và profile aliases: $TMPDIR/agenthub-spike04 từ setup-fixtures.sh; account đang đăng nhập trong Desktop
Preconditions / auth mode: Desktop đăng nhập claude.ai; Code tab môi trường Local, không bật worktree; mỗi kiểm tra là một session mới
Official reference và ngày kiểm tra: Claude Code memory và desktop docs — xem SPIKE-06, 2026-10-30
Các bước và command/args đã làm sạch dữ liệu nhạy cảm: chọn folder qua project folder control (Cmd+Shift+G tới fixture), gửi cùng prompt với run-cli-checks.sh
Expected: Code tab C → C-CLAUDE + C-AGENTS; Code tab B → chỉ B-CLAUDE; Chat không có folder → NONE
Observed: Người dùng báo cả ba khớp kỳ vọng
Result: Pass (reported)
Evidence path/link: file này
Manual steps / limitations: Kết quả do người dùng báo, không có ảnh chụp hoặc transcript; người dùng xác nhận khớp kỳ vọng nhưng không báo riêng việc có tool call hay không
Fallback và người xác nhận (nếu có): Không áp dụng
Next action: Codex Desktop kiểm tra sau SPIKE-03
```

## Results

| # | Surface | Folder | Kỳ vọng | Báo cáo |
|---|---|---|---|---|
| 1 | Code tab | `c-claude-imports-agents` | `SPIKE04-C-CLAUDE`, `SPIKE04-C-AGENTS` | Khớp |
| 2 | Code tab | `b-both-no-import` | `SPIKE04-B-CLAUDE` | Khớp |
| 3 | Chat | Không có | `NONE` | Khớp |

## Kết luận

- Code tab của Claude Desktop nạp project instructions giống Claude CLI: chỉ `CLAUDE.md` khi có cả hai file, và `@AGENTS.md` import hoạt động.
- Chat không nạp instructions của project. AgentHub phải coi Chat là surface cần cung cấp context thủ công (copy/attach), đúng với TDD §16 câu 1.
- Ghi nhận thêm cho SPIKE-02: folder được chọn trong app qua project folder control; thư mục ẩn như `/var/folders` cần Cmd+Shift+G.
