# SPIKE-01 — Claude CLI profile isolation

**Status:** Harness sẵn sàng; chưa chạy phần cần đăng nhập. Executable resolution đã kiểm tra trên macOS.

## Objective

Xác minh hai Claude CLI profile độc lập: config root riêng, auth riêng, chạy song song được, không lẫn session hoặc context. Đồng thời kiểm tra AgentHub tìm được CLI khi không chạy từ terminal.

## Pass criteria

Theo [feasibility.md](../../docs/feasibility.md): hai config roots, auth riêng, chạy song song và không lẫn session/context; không copy credential stores.

## Thiết lập

- **Profile A:** config mặc định `~/.claude`, không đặt `CLAUDE_CONFIG_DIR`. Tài liệu nói Keychain entry gắn theo config dir, nên đặt biến này trỏ về `~/.claude` có thể không dùng lại login hiện có.
- **Profile B:** `~/.agenthub-spike/claude-b`, nằm ngoài repo. Có thể đổi bằng `AGENTHUB_SPIKE_PROFILE_B`.

Đăng nhập profile B trong Terminal.app. Người dùng tự thực hiện; không sao chép credential.

```bash
CLAUDE_CONFIG_DIR="$HOME/.agenthub-spike/claude-b" claude auth login
```

Trình duyệt thường dùng account claude.ai đang đăng nhập. Để chọn account thứ hai, đổi account trên trang đăng nhập hoặc dán link đăng nhập vào cửa sổ riêng tư.

## Cách chạy

```bash
spikes/04-project-instructions/setup-fixtures.sh
```

```bash
spikes/01-claude-profile-isolation/run-isolation-checks.sh
```

Script gửi 3 request ngắn cho mỗi profile, cộng thêm hai lần resume chéo được kỳ vọng thất bại. Danh tính account chỉ ghi dưới dạng hash ngắn; script không đọc Keychain, credential file hay nội dung session. Script tạo `CLAUDE.md` chứa token kiểm tra trong profile B, không sửa `~/.claude`.

| Kiểm tra | Kỳ vọng |
|---|---|
| Auth status | Cả hai đã đăng nhập, hash account khác nhau |
| Instructions theo profile | A trả `NONE`; B trả `SPIKE01-B-USER` |
| Lưu session | Mỗi session chỉ nằm trong config root của profile tạo ra nó |
| Resume chéo | Thất bại theo cả hai chiều |
| Chạy song song | Mỗi profile trả đúng từ của mình |
| Auth sau khi chạy | Không đổi |

Kiểm tra executable resolution không gửi request:

```bash
spikes/01-claude-profile-isolation/check-executable-resolution.sh
```

## Dọn dẹp

Sau khi có kết quả, đăng xuất rồi xoá profile B nếu không dùng nữa:

```bash
CLAUDE_CONFIG_DIR="$HOME/.agenthub-spike/claude-b" claude auth logout
```

```bash
rm -rf "$HOME/.agenthub-spike/claude-b"
```

## Evidence

Chưa có.
