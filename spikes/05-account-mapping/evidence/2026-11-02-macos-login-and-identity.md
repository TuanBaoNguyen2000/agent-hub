# Evidence — lấy địa chỉ đăng nhập và email qua CLI (2026-11-02, macOS)

**Môi trường:** macOS 26.5.1 arm64, Claude CLI 2.1.316, codex-cli 0.166.0, Chrome là trình duyệt mặc định. **Mức:** `observed` với CLI thật và thư mục cấu hình tạm; chưa hoàn tất một lần đăng nhập nào trong browser. Email, query value và tên workspace đã được che; không đọc credential store.

## Claude CLI

- `claude auth login` chạy được không cần tty, với stdin đóng hoặc pipe mở. Sau 8 giây vẫn chờ.
- CLI gọi chương trình trong `BROWSER` với địa chỉ làm tham số đầu tiên.
- Hai địa chỉ khác nhau, cùng `state`: địa chỉ truyền cho `BROWSER` có `redirect_uri=http://localhost:<port>/callback`; địa chỉ in ra stdout có `redirect_uri=https://platform.claude.com/oauth/code/callback`, tức là bắt người dùng dán mã về. Chỉ địa chỉ đầu dùng được khi không có Terminal.
- `claude auth status` với env sạch thiếu `USER` báo `loggedIn: false` dù profile đang đăng nhập; có `USER` (env allowlist của platform) thì báo đúng và có `email`. Env thử nghiệm phải có `USER`.

## Codex CLI

- `codex login` in địa chỉ ra stdout và tự mở trình duyệt; **không** dùng `BROWSER`. Lần thử này đã mở một tab đăng nhập thật trên máy người dùng, không có thao tác đăng nhập nào.
- `codex app-server` (ghi `[experimental]` trong `--help`) nói JSON-RPC qua stdio; khởi động khoảng 250 ms.
  - `initialize` với `clientInfo`, rồi notification `initialized`.
  - `account/read` với `refreshToken: false`: `CODEX_HOME` trống không có `account`; profile đã đăng nhập trả `type`, `email`, `planType`, `workspaceName`.
  - `account/login/start` với `{ type: 'chatgpt' }`: trả `authUrl` trên `auth.openai.com`, callback `http://127.0.0.1:1455/auth/callback`, không tự mở trình duyệt. Cổng 1455 cố định, nên mỗi lần chỉ có một lượt đăng nhập.
  - `account/login/cancel` trả `canceled`, sau đó có notification `account/login/completed` với `success: false`.
- Đóng stdin rồi kết thúc process thì không còn process `app-server` của thư mục đó. `CODEX_HOME` trống có thêm các file state của Codex sau khi chạy.

## Qua app đóng gói

`.app` với CLI thật, browser giả, dữ liệu tạm: màn hình hỏi hiện đúng email của Claude và Codex trên máy (đã so ở dạng che); "Đăng nhập account khác" tạo đúng lệnh `open -na "Google Chrome" --args --incognito <địa chỉ>`, host `claude.com` với callback localhost và `auth.openai.com` với callback 127.0.0.1; Huỷ gỡ account đang thêm; thoát app không để lại process `claude auth login` hay `app-server` của AgentHub (các `app-server` còn lại thuộc ChatGPT.app).

## Chưa kiểm chứng

- Một lượt đăng nhập trọn vẹn trong cửa sổ riêng tư, gồm CLI nhận callback và thoát. Việc này cần người dùng thao tác.
- Chrome thật mở đúng cửa sổ riêng tư. Chỉ kiểm tra được lệnh và tham số; lệnh mở với Chrome thật chưa chạy.
- `claude auth login` và `account/login/start` đè lên login cũ khi đăng nhập lại trên profile đã có login.
- Kết quả có thể đổi theo version CLI; không có trong tài liệu chính thức.
