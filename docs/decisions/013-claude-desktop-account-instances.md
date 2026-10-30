# ADR-013 — Claude Desktop account instances

**Status:** Accepted for MVP (opt-in, `conditional`); sửa đổi ADR-006 cho Claude Desktop  
**Date:** 2026-10-30  
**Decision source:** Người dùng chọn cập nhật ADR-006 sau khi xem kết quả SPIKE-07 trong phiên Phase 0.

## Context

Mục tiêu chính của người dùng là đổi account Claude Desktop ngay trong AgentHub, không phải logout rồi login lại. [ADR-006](../TDD.md#15-architecture-decision-records-adrs) chọn manual fallback vì chưa có cơ chế chung đáng tin cậy.

Kết quả Phase 0 trên macOS:

- [SPIKE-05](../../spikes/05-account-mapping/evidence/2026-10-30-macos.md): profile CLI không đổi account của Desktop. `claude --desktop` trả exit 0 cả khi session không mở được.
- [SPIKE-07](../../spikes/07-desktop-account-switch/evidence/2026-10-30-macos.md): instance Desktop thứ hai mở bằng `--user-data-dir` riêng giữ được account B song song với account A, và không cần đăng nhập lại khi mở lại. Code tab dùng account của instance, nhưng config và session đi theo `CLAUDE_CONFIG_DIR`. Đăng nhập lần đầu, `claude://` và `--desktop --resume` đều về instance mặc định khi nó đang chạy. Kết quả Desktop là `reported`.
- Cơ chế không có trong tài liệu chính thức. Các văn bản điều khoản đã đọc không cấm rõ, cũng không cho phép rõ ([README SPIKE-07](../../spikes/07-desktop-account-switch/README.md#tài-liệu-và-điều-khoản-kiểm-tra-2026-10-30)). Menu đổi account chính thức chỉ dùng được khi các account cùng email.

## Decision

1. **Account instance là tùy chọn người dùng tự bật** cho Claude Desktop. Account mặc định vẫn dùng instance mặc định. Mỗi account phụ có một thư mục dữ liệu riêng và một config root, dùng chung với profile Claude CLI của cùng account.
2. **Lệnh mở trên macOS:** `open -n -a Claude --env CLAUDE_CONFIG_DIR=<config root> --args --user-data-dir=<data dir>`, truyền bằng argument array. Bắt buộc có cả hai thư mục. Không bao giờ trỏ instance thứ hai vào thư mục dữ liệu mặc định.
3. **Mức capability là `conditional`.** AgentHub kiểm tra version Desktop đã có evidence. Khi chưa có evidence, hoặc người dùng báo instance không giữ đúng account, AgentHub quay về manual flow của ADR-006.
4. **Trạng thái account không phải `verified`.** Người dùng xác nhận account sau lần đăng nhập đầu, và AgentHub ghi đó là xác nhận của người dùng. Kết quả mở chỉ là "đã mở instance", không bao giờ là `switched` (TDD §8.4).
5. **Đăng nhập lần đầu cần tắt instance mặc định.** AgentHub phát hiện instance mặc định và yêu cầu người dùng tự tắt; AgentHub không tắt nó. AgentHub chỉ được tắt instance do chính nó mở, theo PID.
6. **Ranh giới dữ liệu:** thư mục dữ liệu chứa phiên đăng nhập, nên được xem như credential store. AgentHub chỉ tạo thư mục và truyền đường dẫn. Không đọc, sao chép, backup, đồng bộ hay đưa nội dung vào log. Không sửa, clone, re-sign hay giải nén `Claude.app`.
7. **Người dùng chọn account cho từng lần mở.** Không tự xoay account khi hết quota (TDD §1.4).
8. **Phạm vi:** dùng cá nhân (giả định TDD §16 câu 3), chỉ macOS. Windows là `Not run` cho đến khi chạy SPIKE-07 trên Windows. Codex Desktop vẫn theo ADR-006.

## Consequences

- Người dùng đổi account Claude Desktop bằng một lựa chọn trong AgentHub, sau một lần đăng nhập cho mỗi account phụ.
- Ở instance phụ, mở workspace và resume vẫn là manual: người dùng tự chọn folder; AgentHub chuẩn bị handoff để dán. Lệnh `--desktop` và deep link chỉ dùng cho instance mặc định.
- `platform` cần adapter mở instance và theo dõi PID. `integrations` cần capability mapping theo version Desktop. `persistence` lưu đường dẫn và alias, không lưu nội dung thư mục.
- Mỗi account phụ tốn khoảng 361 MB, trong đó có một bản Claude Code riêng.
- Cơ chế có thể hỏng khi Desktop cập nhật. Cần kiểm tra lại theo version, và luôn giữ manual fallback.
- Chưa kiểm tra lệnh mở từ app Electron đóng gói; SPIKE-07 chỉ chạy `open` với stdin và stdout là `/dev/null`.
- Trước khi phân phối cho người khác, phải review lại terms (gồm Usage Policy) và có thể phải bỏ tính năng này.
- TDD §1.4 cấm private endpoints và đọc DB/Keychain của app khác. Quyết định này không làm hai việc đó: chỉ khởi chạy app chính thức và để app tự đăng nhập.

## Related decisions

ADR-002 (Desktop/CLI parity), ADR-006 (manual fallback, vẫn áp dụng cho Codex Desktop, cho instance mặc định và khi cơ chế này không đạt) và ADR-012 (package boundaries).
