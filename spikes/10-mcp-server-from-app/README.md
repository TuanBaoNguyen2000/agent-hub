# SPIKE-10 — MCP server chạy từ `.app`

**Status:** macOS Pass (observed, 2026-11-04) — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 4 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan): `AgentHub.app` đóng gói có khởi chạy được MCP server stdio mà không cần cài Node riêng không. Cách thử là chạy binary của app ở chế độ Node (`ELECTRON_RUN_AS_NODE=1`). Server phải chạy được khi app AgentHub đang tắt.

Server trong `server/` là stub dùng một lần, không có dependency ngoài và không được import vào sản phẩm. Stub có `context_projects`, `context_read` giới hạn trong thư mục tài liệu, và `spike_facts` để báo cách process được khởi chạy.

[SPIKE-11](../11-codex-mcp/README.md) thêm vào stub `context_write` (ghi atomic, kiểm tra sha256), annotations `readOnlyHint`, và các trường `ancestry`, `writeOutsideWorkspace`, `sandboxEnv` trong `spike_facts`. Harness ở đây vẫn chạy được với bản mới.

## Pass criteria

- Client MCP khởi chạy được server bằng binary của `.app`, với env tối thiểu như khi client được mở từ GUI.
- Script của server chạy được cả khi nằm trong `app.asar`; `better-sqlite3` của app load được ở chế độ Node.
- Stdout chỉ chứa JSON-RPC; process không hiện thành app GUI (không có Dock icon).
- Server thoát khi client đóng stdin hoặc client chết, không để lại process mồ côi.
- Claude CLI và Codex CLI thật khởi chạy được server và bắt tay MCP xong, với đường dẫn có khoảng trắng và dấu tiếng Việt.
- Không dùng `~/.claude` hay `~/.codex`, và không gửi request nào bằng account thật.

## Prerequisites

- Đã có `apps/desktop/release/mac-arm64/AgentHub.app` (`npm run package`) và đã `npm ci` ở root để có `@electron/asar`.
- Có `claude` và `codex` trên PATH nếu muốn thử với client thật.

## Cách chạy

`build-app.sh` sao chép `AgentHub.app` vào `local/build/Thử nghiệm MCP/AgentHub Spike 10.app` và đổi bundle id. Script cũng thêm stub ở hai chỗ, `Resources/mcp/` và bên trong `app.asar`, rồi ký ad hoc. Ngoài ra nó tạo shim `local/bin/agenthub mcp` và fixture trong `local/context/`. App gốc và dữ liệu của nó không bị đụng tới.

```bash
spikes/10-mcp-server-from-app/build-app.sh
```

Harness đóng vai client MCP. Nó chạy ba cách khởi chạy server, chạy hai account song song, rồi kiểm tra trường hợp client bị kill. Report ghi vào `local/runs/` (ignored).

```bash
node spikes/10-mcp-server-from-app/harness.mjs
```

Thử với client thật, dùng thư mục cấu hình tạm. Các lệnh đầy đủ có trong [evidence](evidence/2026-11-04-macos.md#client-thật):

```bash
CLAUDE_CONFIG_DIR="$PWD/spikes/10-mcp-server-from-app/local/claude-home" claude mcp list
```

## Dọn dẹp

Mọi thứ nằm trong `local/`, gồm app copy, `claude-home` và `codex-home` tạm:

```bash
rm -rf spikes/10-mcp-server-from-app/local
```
