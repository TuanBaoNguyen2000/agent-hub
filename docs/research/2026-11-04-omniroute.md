# Đánh giá OmniRoute (2026-11-04)

**Nguồn:** <https://github.com/cheaper-inference/OmniRoute>, commit `788f8801` (2026-11-04), license MIT. Đã đọc tài liệu kiến trúc (`docs/architecture/ARCHITECTURE.md`, `docs/providers/CLAUDE_CODE.md`, `docs/guides/CLI-LAUNCH-CONTRACTS.md`, `docs/guides/CLAUDE-CODE-CONFIGURATION.md`) và một phần mã (`src/lib/oauth/`, `src/lib/db/`). Chưa chạy thử.

**Kết luận:** không dùng lại mô hình quản lý account của OmniRoute. Chỉ mượn vài ý tưởng ở mục cuối.

## OmniRoute làm gì

OmniRoute là gateway chạy cục bộ (Next.js, SQLite) mở một endpoint chung `/v1/*` theo chuẩn OpenAI/Anthropic. Mọi request của agent đi qua nó.

- **Account** là một "provider connection" trong bảng `providerConnections`: `apiKey`, `accessToken`, `refreshToken`, `expiresAt`, `priority`, `isActive`, `rateLimitedUntil`, `testStatus`, `lastError`. Một provider có nhiều connection.
- **Đăng nhập:** OmniRoute tự chạy OAuth (PKCE hoặc device code) bằng client id công khai của Claude Code và Codex, giữ token và tự refresh khi xử lý request. Có thể dán `auth.json` hoặc setup-token. Token chỉ được mã hoá AES-256-GCM khi đặt `STORAGE_ENCRYPTION_KEY`; không đặt thì lưu plaintext.
- **Định tuyến:** "combo" là chuỗi provider + model + account. Lỗi 429 hoặc lỗi khác làm account bị cooldown, rồi chuyển sang account kế tiếp và model kế tiếp; có chọn theo quota, circuit breaker, lockout.
- **Context Relay:** khi account dùng tới khoảng 85% quota, gateway tóm tắt hội thoại và chèn vào request gửi tới account mới (hiện cho Codex).
- **Agent:** trỏ Claude Code vào gateway bằng `ANTHROPIC_BASE_URL` và `ANTHROPIC_AUTH_TOKEN`, Codex bằng profile `config.toml`. `omniroute launch` chạy CLI với env lọc theo allowlist, chuyển tiếp signal, dọn cấu hình tạm. Danh sách CLI khai báo trong `config/cli-tools-manifest.json`, có test chống lệch.
- **Cloaking:** với account Claude đăng nhập OAuth, gateway chèn dòng nhận diện Claude Code và header billing, xoá đoạn system prompt nhận diện agent khác, chèn ký tự zero-width vào các từ như "cursor", "copilot". Tài liệu của họ nêu mục đích là tránh lỗi `Third-party apps now draw from extra usage`.

## Vì sao không dùng lại

| | OmniRoute | AgentHub |
|---|---|---|
| Account | Token do app giữ | Thư mục cấu hình riêng (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `--user-data-dir`) |
| Đăng nhập | App tự chạy OAuth | Flow chính thức của CLI ([ADR-018](../decisions/018-account-login-and-identity.md)) |
| Đổi account | Tự xoay khi hết quota | Người dùng chọn |
| Desktop app | Không hỗ trợ | Desktop và CLI ngang hàng |
| Chuyển context | Proxy tự tóm tắt rồi chèn | Agent tự viết qua skill và MCP ([ADR-019](../decisions/019-agent-maintained-context.md)) |

Mô hình gateway trái với [TDD](../TDD.md) §1.4 (non-goal tự đảo account để vượt quota), NFR-004 và §11.4 (không lưu token, không đọc `auth.json`), §3.2 (không trích xuất credential, không làm trung gian billing). Cloaking là cố ý lách cơ chế tính phí của Anthropic, có rủi ro khoá account. Gateway cũng không giúp gì cho Claude Desktop và ChatGPT.app.

## Ý tưởng có thể mượn

1. **Manifest cho CLI kèm test chống lệch:** khai báo binary, capability, cách cài trong một file. Hữu ích khi hỗ trợ thêm tool ngoài Claude và Codex.
2. **Hợp đồng khởi chạy:** AgentHub đã có env allowlist; có thể thêm chuyển tiếp signal, chờ child kết thúc rồi mới dọn file tạm, chế độ dry-run chỉ in đường dẫn.
3. **Trạng thái account:** `lastError`, lần kiểm tra gần nhất, thứ tự ưu tiên; lấy từ CLI, không từ proxy.
4. **Ngưỡng nhắc checkpoint:** ý tưởng 85% của Context Relay. AgentHub đã có nguồn số liệu chính thức cho hạn mức ([SPIKE-16](../../spikes/16-usage-limits/README.md)), nên có thể nhắc người dùng chạy `context-checkpoint` khi gần chạm hạn mức; chưa thiết kế.

Code không đáng chép: kiến trúc khác hẳn (web server so với Electron), phần đáng mượn là thiết kế.
