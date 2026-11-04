# SPIKE-12 — MCP trên Claude Desktop: tab Code và Chat của instance phụ

**Status:** macOS (2026-11-04): điều kiện 2 Pass (observed). Điều kiện 3 Pass có điều kiện: Chat của instance B dùng được tool khi không có instance nào khác cùng account đang chạy — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 2 và 3 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan):

- **Điều kiện 2:** tab Code của Claude Desktop có dùng cấu hình MCP trong `CLAUDE_CONFIG_DIR` của account không.
- **Điều kiện 3:** instance Claude Desktop của account phụ (`--user-data-dir` riêng, ADR-013) có dùng `claude_desktop_config.json` trong thư mục dữ liệu của nó cho Chat không.

Spike dùng instance B của [SPIKE-07](../07-desktop-account-switch/README.md): `CLAUDE_CONFIG_DIR=~/.agenthub-spike/claude-b`, thư mục dữ liệu `~/.agenthub-spike/claude-desktop-b`. Server là stub và shim của [SPIKE-10](../10-mcp-server-from-app/README.md). Mỗi lần khởi động, stub ghi vào log alias được đăng ký và instance Desktop đã khởi chạy nó (`desktopInstance`, lấy từ `--user-data-dir` của tiến trình cha thuộc Claude.app).

## Pass criteria

- Tab Code của instance B khởi chạy được server đăng ký trong user scope của `CLAUDE_CONFIG_DIR` của B (alias `B-code`), và gọi được tool.
- Chat của instance B khởi chạy được server đăng ký trong `claude_desktop_config.json` của B (alias `B-chat`), và gọi được tool.
- Instance chính không khởi chạy server nào của B. `~/.claude` và `~/Library/Application Support/Claude` không bị sửa.
- Ghi lại cách Desktop hỏi quyền, và biết Desktop có chạy được shim là shell script hay chỉ chạy được lệnh gọi binary trực tiếp (`-direct`).

## Cách chạy

Chạy [SPIKE-10](../10-mcp-server-from-app/README.md) `build-app.sh` trước. `setup` sao lưu hai file cấu hình của B vào `local/backup/`, rồi đăng ký bốn server:

| Alias | Nơi đăng ký | Lệnh |
|---|---|---|
| `B-code` | user scope trong `CLAUDE_CONFIG_DIR` của B (`claude mcp add`) | shim |
| `B-code-direct` | như trên | binary của app, env `ELECTRON_RUN_AS_NODE=1` |
| `B-chat` | `claude_desktop_config.json` của B | shim |
| `B-chat-direct` | như trên | binary của app, env `ELECTRON_RUN_AS_NODE=1` |

```bash
spikes/12-claude-desktop-mcp/run-desktop-mcp.sh setup
```

```bash
spikes/12-claude-desktop-mcp/run-desktop-mcp.sh open
```

## Xác nhận của người dùng

Làm trong cửa sổ của instance B, tức cửa sổ thứ hai. Chỉ ghi alias, không ghi email. Mỗi prompt gửi một request ngắn.

**1. Tab Code.** Tạo session mới, chọn folder `spikes/12-claude-desktop-mcp/local/workspace`, rồi gửi:

```text
Call the MCP tool spike_facts on the agenthub server and on the agenthub-direct server. Report the fields account and desktopInstance from each. Then call context_write on the agenthub server with path demo/DESKTOP-code.md and content 'written from the Desktop Code tab'.
```

**2. Chat.** Mở cuộc trò chuyện mới ở tab Chat, rồi gửi:

```text
Call the MCP tool spike_facts on the agenthub server and on the agenthub-direct server. Report the fields account and desktopInstance from each. Then call context_write on the agenthub server with path demo/DESKTOP-chat.md and content 'written from Desktop Chat'.
```

Với mỗi bước, ghi lại:

- Desktop có hỏi quyền không. Nếu có, hộp thoại trông thế nào và có những lựa chọn nào. Chọn cho phép (một lần là đủ).
- Có báo lỗi kết nối server nào không. Nếu có, tìm trong Settings → Developer (Chat) hoặc `/mcp` (tab Code).
- Ảnh chụp màn hình nếu tiện.

Xong thì báo agent để chạy `report` (chỉ đọc log của server và kiểm tra file):

```bash
spikes/12-claude-desktop-mcp/run-desktop-mcp.sh report
```

## Dọn dẹp

Tắt instance B theo PID, rồi trả hai file cấu hình của B về bản sao lưu:

```bash
spikes/12-claude-desktop-mcp/run-desktop-mcp.sh stop
```

```bash
spikes/12-claude-desktop-mcp/run-desktop-mcp.sh restore
```
