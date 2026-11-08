# ADR-023 — Thêm project có hỏi tài liệu, màn Task theo trạng thái, panel Tài liệu

**Status:** Accepted (người dùng đồng ý đề xuất 2026-11-06)  
**Date:** 2026-11-06  
**Decision source:** Người dùng thử AgentHub sau ADR-022 và nêu sáu điểm (2026-11-06): tìm và tạo tài liệu khi thêm project còn khó dùng và chưa xử lý đủ trường hợp; tên `AgentContext`; màn Task khó hình dung, task phải lấy từ chính folder `Tasks`; "Ghi chú" nên là "Chat"; Tài liệu nên là cây thư mục ẩn/hiện như panel Files của Claude/Codex Desktop và IDE; nút và trạng thái để chung gây khó hiểu. Người dùng đồng ý cả ba phương án đề xuất (trạng thái trong file task, AgentHub tạo khung tài liệu, giữ tên `AgentContext/`). Sửa đổi [ADR-020](020-phase3-review-changes.md) mục 3, 4, [ADR-021](021-task-and-document-management.md) mục 2, 4, 8 và [ADR-022](022-desktop-shell-layout.md) mục 2, 4.

## Context

- Tìm tài liệu có sẵn chạy ngầm sau khi project đã được thêm; tìm thấy một bộ thì tự dùng, không hỏi (ADR-020 mục 4).
- "Tạo tài liệu" chỉ chọn nơi lưu rồi chờ agent chạy `context-init`; trong lúc chờ, project ở trạng thái "đang chờ" và tab Task không dùng được.
- Trạng thái task chỉ nằm trong bảng của `STATUS.md`; file task trong `Tasks/` không có trạng thái.
- Tab Task nhóm theo workstream, chi tiết có chế độ sửa riêng; tab Tài liệu là một tab của project.
- Màn Công cụ agent đặt badge trạng thái ("Chưa cài") cạnh nút ("Cài") cùng kiểu viền; bảng tràn ngang khi có ba account trở lên.

## Decision

1. **Thêm project là hộp thoại hai bước.** Chọn folder, AgentHub quét ngay rồi luôn hỏi:
   - Một bộ tài liệu đúng khuôn: nêu đường dẫn, số workstream, số task; chọn Dùng bộ này, Tạo bộ mới, hoặc Chưa dùng tài liệu.
   - Nhiều bộ: chọn một bộ.
   - Chỉ có tài liệu khác khuôn: đề xuất tạo bộ mới; `context-init` dẫn link sang các file đó.
   - Không có gì: chọn tạo trong repo (`<repo>/AgentContext/`), trong dữ liệu AgentHub, hoặc chưa dùng.
   Project đã thêm trước đây vẫn được quét một lần như cũ, nhưng chỉ thông báo và hỏi, không tự dùng. Sửa ADR-020 mục 4.
2. **AgentHub tạo khung tài liệu** khi tạo bộ mới: `README.md`, `PROJECT_CONTEXT.md` gần như trống, `Workstreams/main/STATUS.md` và `Tasks/`, theo ngôn ngữ tài liệu. Đây là mẫu cấu trúc, không phải nội dung tự soạn; không ghi đè file đã có. Sau đó "Nhờ agent điền tài liệu" chạy `context-init` qua luồng mở hiện có. Bỏ trạng thái "đang chờ `context-init`": thẻ Tài liệu chỉ còn Chưa dùng, Sẵn sàng, Có vấn đề; mỗi vấn đề có thao tác sửa (tạo file thiếu, chọn lại folder). Sửa ADR-020 mục 3.
3. **Tên mặc định trong repo là `AgentContext/`.** AgentHub nhận tài liệu theo khuôn chứ không theo tên.
4. **Trạng thái task nằm trong file task**, dòng `Status: <chữ>` ngay dưới tiêu đề. Đọc: dòng này nếu có, nếu không thì ô trong bảng `STATUS.md` như trước. Đổi trạng thái: AgentHub ghi cả dòng `Status:` (thêm nếu thiếu) và ô trong bảng. Task mới có `Status:` ngay từ đầu. Danh sách task lấy từ file trong `Tasks/`, kể cả task chưa có trong bảng. Skill `context-init`, `context-checkpoint`, `context-capture` ghi cả hai. Sửa ADR-021 mục 4.
5. **Màn Task** (tham khảo Linear, GitHub Projects): danh sách nhóm theo trạng thái (Đang làm, Bị chặn, Chờ, Xong; Xong thu gọn), lọc theo workstream, mỗi dòng có mã, tiêu đề, workstream, tiến độ acceptance criteria, handoff gần nhất; chế độ bảng bốn cột, kéo thả để đổi trạng thái. Chi tiết là panel bên phải: dòng thuộc tính (Trạng thái, Workstream, Branch, File), tick acceptance criteria ghi thẳng vào file, sửa từng mục tại chỗ, Handoff log dạng dòng thời gian chỉ xem; "Sửa Markdown" trong menu. "Dùng cho lần mở" thành "Mở agent với task này". Tạo được workstream mới. Sửa ADR-021 mục 2.
6. **Panel Tài liệu** thay tab Tài liệu: nút ở thanh tiêu đề (⌘⇧E) mở panel bên phải ở mọi tab của project, gồm cây thư mục (ô lọc, folder đóng mở) và vùng xem/sửa file; nhớ ẩn/hiện và bề rộng, kéo được để đổi bề rộng. Sửa ADR-021 mục 8 và ADR-022 mục 4.
7. **"Ghi chú" đổi thành "Chat"** (en "Chats", ko "채팅"). Sửa ADR-022 mục 2.
8. **Trạng thái tách khỏi hành động** trong toàn app: trạng thái là chấm màu kèm chữ, không viền, không bấm được; hành động là nút, mỗi ô tối đa một nút chính, hành động phụ (Gỡ) trong menu. Màn Công cụ agent xếp theo account: danh sách account bên trái, công cụ của account đang chọn bên phải, "Tự cài khi mở" là một dòng cài đặt của account.
9. **Tab Handoff chỉ cho project không dùng tài liệu** (người dùng đồng ý, 2026-11-06). Project có tài liệu: handoff nằm trong Handoff log của từng task, xem ở panel chi tiết task; "Thêm handoff" (dán từ chat không có MCP) chuyển vào panel đó; "Copy lời nhắc checkpoint" chuyển lên thẻ Tài liệu ở Tổng quan. Heading `Handoff log` có chú thích phía sau (ví dụ `Handoff log (newest first)`) vẫn là Handoff log.

## Consequences

- IPC mới: quét folder trước khi thêm, thêm project kèm lựa chọn tài liệu, tạo khung (cũng dùng để sửa file thiếu), tạo workstream.
- `context-overview` đọc dòng `Status:` và tiến độ acceptance criteria; `task-document` ghi dòng `Status:`.
- Không có migration: trạng thái task vẫn chỉ ở tài liệu, không có bảng task trong SQLite.
- E2E đổi theo hộp thoại thêm project, panel Tài liệu và màn Task mới.
- Danh sách thử Phase 3 cập nhật theo.

## References

- [ADR-019](019-agent-maintained-context.md), [ADR-020](020-phase3-review-changes.md), [ADR-021](021-task-and-document-management.md), [ADR-022](022-desktop-shell-layout.md)
- TDD §7.2 (khuôn tài liệu), §7.3, §9
