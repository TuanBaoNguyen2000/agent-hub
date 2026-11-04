# SPIKE-11 — MCP trên Codex: sandbox và hỏi quyền

**Status:** macOS: CLI Pass (observed), TUI Pass (hộp thoại reported qua ảnh chụp), 2026-11-04. Codex app chưa thử — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 1 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan), gồm hai câu hỏi:

1. Codex có chạy MCP server ngoài sandbox lệnh không, tức server có ghi được thư mục tài liệu nằm ngoài workspace hay không.
2. Codex hỏi quyền thế nào khi agent gọi tool MCP, và AgentHub cần ghi gì vào cấu hình để `context_write` không bị chặn.

Spike dùng lại stub và shim của [SPIKE-10](../10-mcp-server-from-app/README.md). Stub có thêm `context_write` (ghi atomic, kiểm tra sha256 của bản đã đọc) và annotations: các tool đọc có `readOnlyHint: true`, `context_write` có `readOnlyHint: false`.

## Pass criteria

- MCP server do Codex khởi chạy ghi được vào thư mục tài liệu nằm ngoài workspace, trong khi lệnh shell của agent thì không.
- Xác định được chế độ phê duyệt mặc định, cùng cấu hình tối thiểu để tool đọc và tool ghi chạy được mà không cần mở rộng sandbox.
- Ghi lại hộp thoại hỏi quyền trong TUI, và lựa chọn nào được lưu vào `config.toml`.
- Không sửa `~/.codex`. Chỉ dùng profile B của SPIKE-08 (`~/.agenthub-spike/codex-b`); `codex exec` bỏ qua `config.toml` của B và không lưu session.

## Cách chạy

Chạy [SPIKE-10](../10-mcp-server-from-app/README.md) `build-app.sh` trước. Mỗi chế độ gửi một lượt agent ngắn bằng account B. Kết quả thô nằm trong `local/runs/` (ignored).

```bash
spikes/11-codex-mcp/run-codex-mcp.sh ws-default ro-default approve prompt writes auto tool-approve ro-approve on-request
```

| Chế độ | Sandbox | Cấu hình thêm |
|---|---|---|
| `ws-default` | workspace-write | không |
| `ro-default` | read-only | không |
| `approve`, `prompt`, `writes`, `auto` | workspace-write | `mcp_servers.agenthub.default_tools_approval_mode` |
| `tool-approve` | workspace-write | `mcp_servers.agenthub.tools.context_write.approval_mode="approve"` |
| `ro-approve` | read-only | `default_tools_approval_mode="approve"` |
| `on-request` | workspace-write | `approval_policy="on-request"` |

Đối chứng sandbox, không gửi request tới model:

```bash
CODEX_HOME=~/.agenthub-spike/codex-b codex sandbox -P :workspace -C spikes/11-codex-mcp/local/workspace -- /usr/bin/touch "$PWD/spikes/10-mcp-server-from-app/local/context/demo/sb-ctx.md"
```

## Xác nhận của người dùng (TUI)

Chạy lệnh sau trong Terminal. Script sao lưu `config.toml` của B, mở Codex tương tác với một yêu cầu gọi `context_write`, rồi in ra những gì đã đổi trong `config.toml` sau khi thoát.

```bash
spikes/11-codex-mcp/run-codex-mcp.sh tui
```

Khi Codex hỏi quyền gọi `context_write`:

1. Ghi lại nội dung hộp thoại và các lựa chọn. Chỉ ghi alias, không ghi email.
2. Nếu có lựa chọn kiểu "luôn cho phép", chọn lựa chọn đó; nếu không có, chọn cho phép một lần.
3. Đợi Codex trả lời xong, gõ `/exit`. Gửi lại phần script in ra sau đó.

## Dọn dẹp

`rm -rf spikes/11-codex-mcp/local`. Nếu muốn trả `config.toml` của B về như cũ, chép lại từ `local/runs/config-before-tui.toml`.
