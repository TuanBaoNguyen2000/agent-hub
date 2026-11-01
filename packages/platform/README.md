# Platform

**Status:** Có `PathInspector`. Chưa có adapter process, terminal, Git; thuộc Phase 2 và Phase 3.

## Trách nhiệm

Triển khai platform ports cho macOS/Windows: resolve executable, khởi chạy process, mở app/folder, terminal và xử lý khác biệt đường dẫn. Giữ logic OS-specific ở adapter tương ứng.

Triển khai observation port của application cho Git/Unity: branch, SHA, trạng thái dirty/changed files qua Git CLI và Unity version từ project files. Observer chỉ đọc, theo ADR-008 và [ADR-012 amendment](../../docs/decisions/012-initial-package-boundaries.md#amendment--2026-10-30).

## Boundary

- Dependencies nội bộ: application và domain nếu cần các kiểu được định nghĩa ở đó.
- Không chứa Smart Switch rules, account mapping hoặc logic provider capability; chúng thuộc application/integrations.
- Nhận executable, args, cwd và env riêng; không nối user input thành shell command.
- Không thay global environment, đọc credentials hoặc tự đóng native app khi AgentHub thoát.
- Không chạy lệnh Git thay đổi working tree (checkout/reset/clean/stash/merge) và không sửa Unity assets.
- Main chọn platform adapter và inject vào integrations. WSL chỉ là lựa chọn explicit sau khi được thiết kế, không tự chuyển ngầm.

## Kiểm chứng dự kiến

Platform smoke tests trên macOS và Windows cho path spaces/Unicode, binary missing, permission errors và child-process env isolation. Windows `.exe`/`.cmd` behavior cần kiểm chứng riêng. Git observer tests trên temporary repositories: clean, dirty, branch và detached HEAD (TDD §14.2).

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §5](../../docs/TDD.md#5-cross-platform-design).
