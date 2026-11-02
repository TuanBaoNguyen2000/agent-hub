# Evidence — macOS chọn instance nào khi một app chạy nhiều bản (2026-11-02)

**Môi trường:** macOS 26.5.1 arm64, Claude Desktop 4.4212.0, ChatGPT.app đang cài, Electron trong repo. **Mức:** `observed` với app giả; lỗi trên Claude thật là `reported`. Không đăng nhập, không đọc dữ liệu của provider, không tắt instance chính của người dùng.

## Vấn đề người dùng báo

Tắt Desktop của account A (app chính), mở cửa sổ riêng của account B, rồi bấm "Mở trong Desktop" của account A trong AgentHub: cửa sổ hiện ra là B. AgentHub báo `Đã gửi lệnh mở folder`, tức là đã chạy `claude --desktop`. Mở Claude trực tiếp từ app thì được A.

## Đo bằng app giả

[`check-instance-routing.sh`](../check-instance-routing.sh) dùng một bản Electron có bundle id và URL scheme riêng, ghi lại instance nào nhận sự kiện. Không liên quan tới account hay app của provider.

| Đang chạy | Lệnh | Instance nhận |
|---|---|---|
| Chỉ B | `open -b` | B |
| Chỉ B | `open -a` | B |
| Chỉ B | `open <URL>` | B |
| Chỉ B | `open -n -a` | Bản mặc định mới |
| B trước, rồi mặc định | `open <URL>`, `open -b` | B |
| Mặc định trước, rồi B | `open <URL>`, `open -b` | Mặc định |
| Không có gì | `open <URL>`, `open -b` | Khởi động bản mặc định |

**Kết luận:** macOS giao lệnh cho instance **khởi động sớm nhất**, không phải "app chính". Điều này đính chính [evidence 2026-10-30](2026-10-30-macos.md): `claude://`, `--desktop` và callback đăng nhập về Desktop chính chỉ vì lần đó Desktop chính mở trước. Nó giải thích đúng lỗi người dùng báo. Khi B mở trước, kể cả mở thêm app chính cũng không làm lệnh đi đúng chỗ.

## Mở hai lần trên cùng thư mục dữ liệu

Claude và ChatGPT thật, với thư mục tạm, không đăng nhập; chỉ dừng đúng PID của bản thử.

| App | Sau `open -n` lần hai | Kết quả |
|---|---|---|
| Claude 4.4212.0 | 2 process trên cùng thư mục, đo sau 2 và 7 giây | **Sinh bản trùng** |
| ChatGPT | 1 process, giữ nguyên PID | Không sinh bản trùng |

Claude có chuỗi `requestSingleInstanceLock` trong app nhưng thực tế không chặn trường hợp này. Không được dùng `open -n` để gọi lại một instance đang chạy.

## Đưa đúng process lên trước

`osascript -l JavaScript` với `NSRunningApplication.activateWithOptions` theo PID: ChatGPT thật lên trước, xác nhận bằng `lsappinfo front`, rồi trả lại app cũ; không có hộp thoại xin quyền; PID không tồn tại thì báo thất bại. Cũng chạy qua code của platform với app giả: thứ tự instance đúng, `openDefaultInstance` mở được bản mặc định bên cạnh B.

## Xác nhận trên Claude thật

Người dùng chạy trên `.app` đóng gói, với hai account Claude thật, theo bốn bước: tắt Claude chính; mở Desktop của B từ AgentHub; để B chạy và mở Desktop của A; bấm lại B rồi A. Người dùng báo "Đã chạy đúng" (`reported`, không có ảnh chụp).

Sau đó người dùng thử với Codex thật và báo "codex hoạt động tốt" (`reported`, không có ảnh chụp, không nêu chi tiết từng bước).
