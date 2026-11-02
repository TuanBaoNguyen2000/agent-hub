# ADR-018 — Account login qua cửa sổ riêng tư và tên account theo email

**Status:** Accepted for MVP (conditional)  
**Date:** 2026-11-02  
**Decision source:** Người dùng báo hai vấn đề: tên account do AgentHub tự đặt khó phân biệt, và khi thêm account thì trình duyệt tự dùng account đang đăng nhập nên không chọn được. Người dùng yêu cầu hiện đúng mail hoặc account.

## Context

- `claude auth login` và `codex login` mở trình duyệt mặc định, nên trình duyệt tái sử dụng phiên claude.ai hoặc chatgpt.com ([SPIKE-01](../../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md), [SPIKE-08](../../spikes/08-codex-profile-isolation/evidence/2026-10-30-macos.md)). AgentHub không kiểm soát được việc này khi chạy CLI trong Terminal.
- Account đầu tiên của mỗi provider tự nhận login sẵn có của máy mà không hỏi.
- Bên thứ ba không được đưa Claude.ai login vào app của mình hay giữ credentials ([SPIKE-06](../../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md)). Vì vậy không làm cửa sổ đăng nhập nhúng trong AgentHub: ngoài điều khoản, cửa sổ nhúng còn khiến app có thể thấy mật khẩu và cookie.
- [Evidence 2026-11-02](../../spikes/05-account-mapping/evidence/2026-11-02-macos-login-and-identity.md): cả hai CLI đều cho AgentHub giữ địa chỉ trang đăng nhập; Codex có giao diện báo email.

## Decision

1. **Đăng nhập vẫn do CLI chính thức thực hiện, trong trình duyệt của người dùng.** AgentHub chỉ quyết định nơi mở trang đăng nhập. Token đi thẳng từ trình duyệt về CLI qua callback local; AgentHub chỉ thấy địa chỉ trang, không thấy mật khẩu hay token.
2. **Mặc định mở cửa sổ riêng tư,** vì cửa sổ thường sẽ tự dùng phiên có sẵn. Thứ tự: Chrome, Edge, Brave, Firefox. Safari không có cách mở từ bên ngoài, nên người dùng sao chép link. Người dùng vẫn chọn được trình duyệt thường.
3. **Lấy địa chỉ trang:**
   - Claude: đặt `BROWSER` trỏ tới script tạm ghi lại địa chỉ, rồi chạy `claude auth login` không cần cửa sổ Terminal. Không dùng địa chỉ CLI in ra, vì địa chỉ đó bắt người dùng dán mã về.
   - Codex: `codex app-server`, gọi `account/login/start` và chờ `account/login/completed`.
   - Chỉ mở địa chỉ `https` thuộc domain của provider. Không lấy được địa chỉ hợp lệ thì quay về `claude auth login` hoặc `codex login` trong Terminal như trước.
4. **Không tự nhận login của máy.** Nếu máy đang đăng nhập, AgentHub hiện email và hỏi: dùng account này, hay đăng nhập account khác trong thư mục riêng.
5. **Tên account là email do CLI báo.** Claude lấy từ `claude auth status`, Codex từ `account/read` của app server. Alias thành tên gợi nhớ tuỳ chọn; tên AgentHub tự đặt trước đây (`Claude 2`, ...) bị bỏ khi migrate.
6. **Email được lưu trong SQLite local** dưới dạng "lần cuối thấy", để hiện ngay trong danh sách account mà không phải chạy CLI. Không ghi vào log, evidence hay context export. Fingerprint vẫn chỉ ở Main và dùng để phát hiện hai account trùng nhau.

## Consequences

- Người dùng chọn được account và phân biệt được account bằng email. Nếu vẫn đăng nhập trùng, app cảnh báo và cho đăng nhập lại.
- Email chỉ nói về login của **CLI**. Claude Desktop instance có login riêng (SPIKE-07), nên kết quả mở Desktop vẫn cần người dùng xác nhận (ADR-013, FR-014). Email là "lần cuối thấy": đổi account ngoài AgentHub thì tên chỉ cập nhật khi AgentHub đọc lại trạng thái.
- Phụ thuộc vào hành vi không có trong tài liệu: `BROWSER` của Claude CLI, và `codex app-server` vẫn ghi `[experimental]`. Có fallback Terminal, và email thiếu thì hiện "chưa rõ account" chứ không đoán.
- Cửa sổ riêng tư của Chrome dùng chung phiên cho đến khi đóng hết, và incognito có thể bị policy công ty tắt. Giao diện nhắc đóng hết cửa sổ riêng tư; cảnh báo trùng account là lớp kiểm tra cuối.
- Đăng nhập trong cửa sổ riêng tư không có phiên sẵn nên phải nhập lại thông tin; đây là cái giá của việc chọn được account.
- Windows chưa áp dụng (ADR-015).

## Related

ADR-006, ADR-009 (Terminal ngoài vẫn là đường chính để chạy CLI), [ADR-013](013-claude-desktop-account-instances.md), [ADR-014](014-codex-profiles.md), TDD §11.4.
