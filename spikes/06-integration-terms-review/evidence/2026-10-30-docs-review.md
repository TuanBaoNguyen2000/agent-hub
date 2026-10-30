# SPIKE-06 evidence — official docs review

```text
Spike ID / run ID: SPIKE-06 / 2026-10-30-docs-review
Ngày giờ và người xác minh: 2026-10-30; Claude (agent) đọc tài liệu, người dùng chưa review
OS / architecture / exact tool versions: Không phụ thuộc OS; đối chiếu với Claude CLI 2.1.295, Claude Desktop 4.29.0, codex-cli 0.155.1 trên macOS
Fixture project và profile aliases: Không dùng
Preconditions / auth mode: Không đăng nhập, không chạy binary
Official reference và ngày kiểm tra: Xem bảng References, kiểm tra 2026-10-30
Expected: Xác định ranh giới được phép cho launcher, profile và context
Observed: Xem Findings
Result: Pass (personal-use scope, giả định)
Evidence path/link: file này
Manual steps / limitations: Chưa đọc toàn văn Consumer/Commercial Terms và OpenAI Terms; chỉ đọc tài liệu sản phẩm
Fallback và người xác nhận (nếu có): Không áp dụng
Next action: Người dùng xác nhận phạm vi personal/distributed (TDD §16 câu 3)
```

## References

| Tài liệu | URL | Ngày kiểm tra |
|---|---|---|
| Claude Code — Legal and compliance | <https://code.claude.com/docs/en/legal-and-compliance> | 2026-10-30 |
| Claude Code — Authentication | <https://code.claude.com/docs/en/authentication> | 2026-10-30 |
| Claude Code — Environment variables | <https://code.claude.com/docs/en/env-vars> | 2026-10-30 |
| Claude Code — Memory (CLAUDE.md/AGENTS.md) | <https://code.claude.com/docs/en/memory> | 2026-10-30 |
| Claude Code — Desktop | <https://code.claude.com/docs/en/desktop> | 2026-10-30 |
| Codex — AGENTS.md | <https://learn.chatgpt.com/docs/agent-configuration/agents-md> (redirect từ developers.openai.com/codex/guides/agents-md) | 2026-10-30 |
| Codex — Authentication | <https://learn.chatgpt.com/docs/auth> (redirect từ developers.openai.com/codex/auth) | 2026-10-30 |

Hai link Codex trong TDD §18 đã chuyển hướng (HTTP 308) sang `learn.chatgpt.com`.

## Findings

### Claude — terms và credentials

- Terms phụ thuộc loại account: Consumer Terms cho Free/Pro/Max; Commercial Terms cho Team/Enterprise/API.
- OAuth subscription dành cho việc dùng Claude Code và native apps một cách thông thường. Bên thứ ba không được đưa Claude.ai login vào app của mình, không được thu thập, lưu hoặc làm trung gian Claude.ai credentials/session tokens; đăng nhập phải đi qua flow của Anthropic.
- Nếu phân phối sản phẩm chạy Claude Code: binary không được sửa, không được tắt phương thức auth có sẵn, mỗi end user tự xác thực; không dùng tên/logo Claude Code hoặc Anthropic trong tên sản phẩm.
- **Hệ quả cho AgentHub:** mô hình hiện tại (khởi chạy binary chính thức, người dùng tự login, AgentHub không đọc credential) phù hợp với tài liệu cho personal use. Giữ nguyên non-goal "không credential ingestion".

### Claude — nhiều profile CLI

- `CLAUDE_CONFIG_DIR` được tài liệu nêu rõ là cách chạy nhiều account song song; mỗi thư mục có settings, session history và login riêng.
- Trên macOS, credential nằm trong Keychain và entry được gắn theo `CLAUDE_CONFIG_DIR`; nếu Keychain từ chối ghi thì fallback sang `.credentials.json` trong thư mục đó. Windows dùng `.credentials.json` trong config dir.
- Ngoại lệ: Console sign-in không có API key được lưu ngoài config dir, nên không tách được theo thư mục.
- `CLAUDE_CONFIG_DIR` bị bỏ qua nếu đặt trong project/local settings; phải đặt qua env của process hoặc user/managed settings.
- **Hệ quả:** SPIKE-01 có cơ chế được hỗ trợ chính thức; spike chỉ cần xác minh hành vi thực tế, không cần workaround.

### Claude Desktop

- Desktop (Code tab) không đọc `ANTHROPIC_API_KEY`, `apiKeyHelper` hay Anthropic profiles; dùng OAuth của app.
- Không tìm thấy deep link, URL scheme hoặc lệnh CLI được tài liệu hoá để mở một folder/session trong Desktop. Folder được chọn trong app.
- Desktop không thấy session do terminal CLI tạo.
- Không có hướng dẫn về nhiều account trong Desktop.
- **Hệ quả:** củng cố ADR-006. SPIKE-02 nhiều khả năng chỉ tự động được bước mở app; chọn workspace/account là bước manual cho đến khi có bằng chứng khác.

### Project instructions

- Claude Code đọc `AGENTS.md` trực tiếp (từ v2.1.277) **chỉ khi** không có `CLAUDE.md`/`.claude/CLAUDE.md`/`CLAUDE.local.md` ở working directory hoặc thư mục cha. Khi có cả hai, chỉ `CLAUDE.md` được đọc, trừ khi `CLAUDE.md` import `@AGENTS.md`. Import tối đa bốn cấp; import ra ngoài working directory cần người dùng duyệt.
- Codex đọc `AGENTS.override.md` hoặc `AGENTS.md` từ project root (thường là Git root) xuống cwd, tối đa một file mỗi cấp, dừng khi tổng đạt `project_doc_max_bytes` (mặc định 32 KiB). `CLAUDE.md` bị bỏ qua nếu không cấu hình `project_doc_fallback_filenames`.
- **Hệ quả:** context export của AgentHub nên ghi vào `AGENTS.md` và để `CLAUDE.md` import nó; cần giới hạn kích thước theo ngưỡng 32 KiB của Codex. SPIKE-04 kiểm chứng các trường hợp này.

### Codex — credentials và nhiều account

- Đăng nhập bằng ChatGPT (subscription) hoặc API key. Credentials lưu ở `auth.json` trong `CODEX_HOME` (mặc định `~/.codex`) hoặc OS credential store, chọn bằng `cli_auth_credentials_store` (`file`, `keyring`, `auto`, `ephemeral`).
- Tài liệu chính thức không mô tả nhiều account song song và không nói keyring entry được gắn theo `CODEX_HOME` hay không.
- Tài liệu nói CLI và IDE extension dùng chung login cache; không nói Desktop có dùng chung với CLI hay không.
- Khuyến nghị dùng API key cho automation; không expose Codex execution trong môi trường không tin cậy.
- **Hệ quả:** tách profile Codex bằng `CODEX_HOME` riêng là giả thuyết chưa được tài liệu xác nhận; cần spike riêng (hiện chưa có trong SPIKE-01–06). Không sao chép hoặc hoán đổi `auth.json`.

## Điều kiện cần xử lý

1. Người dùng xác nhận phạm vi personal/distributed. Nếu distributed: review toàn văn terms của hai provider, không dùng tên/logo provider trong tên sản phẩm.
2. Bổ sung spike cho Codex CLI profile isolation qua `CODEX_HOME`, hoặc ghi Codex multi-account là `manual` trong MVP.
3. Cập nhật link Codex trong TDD §18 sang URL mới.
