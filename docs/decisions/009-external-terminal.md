# ADR-009 — External terminal for CLI launches

**Status:** Accepted for MVP  
**Date:** 2026-11-01  
**Decision source:** Người dùng chọn "Chốt theo đề xuất" sau exit review Phase 0 trên macOS.

## Context

[TDD §15](../TDD.md#15-architecture-decision-records-adrs) để mở lựa chọn terminal ngoài hay terminal nhúng cho CLI. [SPIKE-09](../../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md) đã mở được Claude CLI và Codex CLI tương tác trong Terminal.app từ app Electron mở bằng Finder: đúng cwd và profile, an toàn với path chứa dấu nháy và `$(...)`, không cần quyền Automation. CLI vẫn chạy sau khi app thoát. Người dùng xác nhận `/status` đúng account.

## Decision

1. **MVP dùng terminal ngoài.** Terminal nhúng không thuộc MVP; xem xét lại ở P1 (FR-105).
2. **Trên macOS, MVP chỉ hỗ trợ Terminal.app,** mở bằng file `.command` dùng một lần trong thư mục tạm riêng, chỉ owner được đọc và chạy. File tự xoá khi chạy. Mọi giá trị đều được quote, tool chạy qua `env -i` với env allowlist. iTerm và terminal khác chưa có evidence.
3. **AgentHub không đóng cửa sổ Terminal và không kill CLI** đã mở, kể cả khi AgentHub thoát. Người dùng tự quản lý phiên terminal.
4. **Trạng thái launch chỉ là "đã gửi lệnh mở".** PID và exit status qua file trạng thái là thông tin phụ; không dùng để suy ra account, session hay việc công việc đã xong.
5. **Không dùng `osascript`,** vì nó cần quyền Automation mà MVP không cần tới.

## Consequences

- Không cần native PTY module cho CLI tương tác, nên packaging đơn giản hơn.
- AgentHub không có handle của cửa sổ Terminal, nên không focus hay đóng lại được cửa sổ đó. Cửa sổ có thể còn lại sau khi CLI thoát.
- Rc file của người dùng vẫn chạy trong shell ngoài do Terminal mở, nhưng không ảnh hưởng env của tool.
- CLI có thể để lại process nền, như daemon của Codex; AgentHub không theo dõi các process này.
- Terminal trên Windows thuộc milestone Windows parity ([ADR-015](015-macos-first-delivery.md)).
- `claude --desktop` không thuộc quyết định này: lệnh đó chỉ cần pty ngắn hạn qua `/usr/bin/script`, không mở terminal cho người dùng ([TDD §5.2](../TDD.md#52-process-launching-safety)).

## Related decisions

ADR-002 (Desktop/CLI parity), ADR-012 (terminal adapter nằm trong `platform`), [ADR-013](013-claude-desktop-account-instances.md), [ADR-014](014-codex-profiles.md) và ADR-015.
