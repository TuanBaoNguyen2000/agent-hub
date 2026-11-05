# SPIKE-10 follow-up — MCP server của sản phẩm với CLI thật (macOS)

```text
Spike ID / run ID: SPIKE-10 / 2026-11-05-product-server
Ngày giờ và người xác minh: 2026-11-05 07:40–07:44 UTC; agent chạy `.app` đóng gói, CLI thật và đọc log của server, file tài liệu
OS / architecture / exact tool versions: macOS 26.5.1 arm64; AgentHub.app build 2026-11-05 (Electron 45.2.1, ký ad hoc); Claude CLI 2.1.318; codex-cli 0.166.0
Fixture project và profile aliases: thư mục dữ liệu tạm "mcpdata dữ liệu" (database do `.app` tạo, schema 4); project "Dự án game" với tài liệu ở "context ngoài" (fixture của SPIKE-14 follow-up); profile B của SPIKE-01 và SPIKE-08
Preconditions / auth mode: B đăng nhập bằng claude.ai và ChatGPT. Project, account và quyền được chèn thẳng vào database tạm bằng sqlite3: account Claude được phép, account Codex lúc đầu chưa được phép
Các bước: mở `.app` với --user-data-dir tạm để tạo database và shim; đăng ký server vào B bằng đúng lệnh của launcher; cho agent dùng tool; gỡ đăng ký
Expected: server chạy bằng binary của app qua shim, chỉ thấy project của account, đọc và ghi tài liệu ngoài project
Observed: xem dưới
Result: Pass (observed)
Evidence path/link: file này
Next action: thử qua `.app` với account thật (đăng ký tự động khi mở), tab Code và tab Chat của cửa sổ Claude Desktop riêng
```

## Shim do `.app` viết

`<data>/bin/agenthub-mcp` chạy `ELECTRON_RUN_AS_NODE=1 AGENTHUB_VERSION=… exec <AgentHub.app>/Contents/MacOS/AgentHub <AgentHub.app>/Contents/Resources/app.asar/out/main/mcp.js "$@"`. Chạy với `env -i` chỉ có `HOME` và `PATH`: bắt tay được, `better-sqlite3` trong `app.asar` mở database ở chế độ chỉ đọc.

## Giới hạn theo account

| Gọi `context_projects` với | Observed |
|---|---|
| `--account=<Claude B>`, được phép | Trả về "Dự án game" |
| `--account=<Codex B>`, chưa được phép | "No project with context documents is open to this account." |
| Codex B sau khi thêm quyền vào database (server không khởi động lại) | Thấy project ở lần gọi tiếp |

## Agent thật

| | Claude CLI (`-p`, `--allowedTools=mcp__agenthub`) | Codex CLI (`exec -s read-only`) |
|---|---|---|
| Đăng ký | `claude mcp add-json -s user agenthub …` với `CLAUDE_CONFIG_DIR` của B; init báo `agenthub` `connected` | `codex mcp add agenthub -- …` với `CODEX_HOME` của B |
| Protocol | `2025-11-25` | `2025-06-18` |
| Tool đã gọi | `context_projects`, `context_read` (theo tên project tiếng Việt), `context_append_handoff` | như Claude |
| Ghi tài liệu ngoài project | Có, qua MCP | Có, qua MCP, dù sandbox là `read-only` |
| Kết quả trong file task | Mục mới nằm ngay dưới "Handoff log" | Mục của Codex nằm trên mục của Claude |

Codex cần `-c 'mcp_servers.agenthub.tools.context_append_handoff.approval_mode="approve"'` vì `exec` không có người duyệt (SPIKE-11); ở TUI, Codex sẽ hỏi. Claude `-p` cần `--allowedTools=` dạng có dấu `=`; viết `--allowedTools mcp__agenthub "<prompt>"` thì cờ nuốt luôn lời nhắc, giống `--add-dir` ở SPIKE-13.

Sau khi chạy đã gỡ đăng ký bằng `claude mcp remove -s user agenthub` và `codex mcp remove agenthub`; cấu hình MCP của B trở lại như trước.

## Lần chạy thứ hai: handoff khi không có tài liệu và Chat rời (2026-11-05 09:00 UTC)

Cùng thư mục dữ liệu tạm, `.app` build lại với bước 5; thêm project "Dự án khác" không bật tài liệu, cho phép cả hai account của B.

| | Observed |
|---|---|
| Claude CLI (`-p`, `--allowedTools=mcp__agenthub`) | `context_projects` báo project không có tài liệu; gọi `context_save_handoff` (tạo `projects/<id>/handoffs/<id>-mcp-check.md`) và `context_capture` (tạo `loose-chats/<id>-y-tuong-combo.md`) |
| Codex CLI (`exec -s read-only --add-dir=<handoffs>`), với đúng lời nhắc launcher tạo cho project không có tài liệu | Đọc file handoff mới nhất theo đường dẫn trong lời nhắc, kiểm tra Git (folder không phải repo), gọi `context_loose_chats` và trả đúng tiêu đề, nội dung chat rời Claude vừa lưu |

Sau khi chạy đã gỡ đăng ký khỏi B.

## Chưa xác minh

- Đăng ký tự động khi mở account từ `.app` với account thật, và Codex TUI hỏi quyền cho tool ghi.
- Tab Code và tab Chat của cửa sổ Claude Desktop riêng với `claude_desktop_config.json` do AgentHub ghi; Codex app.
- Server khi `.app` bị di chuyển (shim được viết lại ở lần mở sau, cấu hình account giữ nguyên đường dẫn shim).
