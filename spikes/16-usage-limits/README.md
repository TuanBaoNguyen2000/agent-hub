# SPIKE-16 — Đọc hạn mức sử dụng (usage limit) của account

**Status:** macOS Pass (observed, 2026-11-04) — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Người dùng yêu cầu hiển thị usage limit của từng account trong AgentHub (2026-11-04). Câu hỏi:

- Có cách chính thức nào để đọc hạn mức (phiên 5 giờ, tuần) của một account theo `CLAUDE_CONFIG_DIR` hoặc `CODEX_HOME` mà không đọc credential, không gọi private endpoint và không tốn token của account không.
- Lệnh đó có khởi chạy hook, MCP server hay ghi session của người dùng không.

Không xét cách làm của gateway như OmniRoute (giữ token rồi gọi API thay CLI); xem [đánh giá OmniRoute](../../docs/research/2026-11-04-omniroute.md).

## Pass criteria

- Đọc được phần trăm đã dùng và thời điểm đặt lại cho từng cửa sổ hạn mức, đúng account của profile.
- Không có lượt gọi model (`num_turns` 0, token 0) và không lưu session.
- Khi chưa đăng nhập hoặc không có hạn mức, kết quả phân biệt được với "đã dùng 0%".

## Cách chạy

Lệnh dùng trực tiếp, không cần harness:

```bash
claude -p /usage --output-format json --no-session-persistence --strict-mcp-config --settings '{"disableAllHooks":true}'
```

```bash
codex app-server generate-json-schema --out <thư mục tạm>
```

Gọi `account/rateLimits/read` qua `codex app-server` bằng một client JSON-RPC stdio ngắn (cùng khuôn với `readCodexIdentity` trong `packages/integrations`). Output thô nằm trong `local/` (đã ignore).
