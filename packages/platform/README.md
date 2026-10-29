# Platform

**Status:** Scaffold only. Chưa có macOS/Windows implementation hoặc package manifest.

## Trách nhiệm

Triển khai platform ports cho macOS/Windows: resolve executable, khởi chạy process, mở app/folder, terminal và xử lý khác biệt đường dẫn. Giữ logic OS-specific ở adapter tương ứng.

## Boundary

- Dependencies nội bộ: application và domain nếu cần các kiểu được định nghĩa ở đó.
- Không chứa Smart Switch rules, account mapping hoặc logic provider capability; chúng thuộc application/integrations.
- Nhận executable, args, cwd và env riêng; không nối user input thành shell command.
- Không thay global environment, đọc credentials hoặc tự đóng native app khi AgentHub thoát.
- Main chọn platform adapter và inject vào integrations. WSL chỉ là lựa chọn explicit sau khi được thiết kế, không tự chuyển ngầm.

## Kiểm chứng dự kiến

Platform smoke tests trên macOS và Windows cho path spaces/Unicode, binary missing, permission errors và child-process env isolation. Windows `.exe`/`.cmd` behavior cần kiểm chứng riêng.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §5](../../docs/TDD.md#5-cross-platform-design).
