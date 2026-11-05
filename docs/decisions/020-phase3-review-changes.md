# ADR-020 — Sửa Phase 3 theo đánh giá của người dùng

**Status:** Accepted  
**Date:** 2026-11-05  
**Decision source:** Người dùng thử `.app` của Phase 3 với hai project Unity thật (một project có `Docs/` riêng, một project có sẵn bộ `AgentContext/` trong repo), gửi đánh giá và trả lời bốn câu hỏi (2026-11-05). Sửa đổi một phần [ADR-019](019-agent-maintained-context.md).

## Context

Người dùng thử tới bước khởi tạo tài liệu (scenario 1 của TDD §9.4) và báo (reported):

- Skill được cài ngầm khi mở account; không có chỗ xem, thêm hay gỡ skill.
- Lịch sử mở luôn hiện; trang project dồn mọi thứ vào một cột, khó đọc.
- Project và Chat rời nằm chung một danh sách ở cột trái.
- Công tắc Bật/Tắt tài liệu không hợp lý; nên là nút tạo hoặc kiểm tra tài liệu.
- Lời nhắc chỉ có tiếng Anh; cần chọn ngôn ngữ.
- Project đã có tài liệu (bộ `AgentContext/` trong repo, hoặc `Docs/Continuity.md`) chưa được xử lý: agent phải hỏi lại và đề nghị dẫn link sang.
- Claude Desktop phải tự dán lời nhắc (đúng: `claude://code/new?q=` chỉ điền sẵn, không chọn folder, và macOS chuyển link tới instance khởi động sớm nhất, SPIKE-02, SPIKE-07).

## Decision

1. **Màn Công cụ agent** trong Cài đặt: bảng skill và MCP server theo account, cài hoặc gỡ từng ô, xem trạng thái (đã cài, chưa cài, trùng tên với skill không do AgentHub tạo).
   - Người dùng **thêm được skill riêng** (một folder có `SKILL.md`) để AgentHub cài cho các account; AgentHub giữ bản chung và symlink như skill có sẵn (SPIKE-14), không cài vào `~/.agents/skills`.
   - Cài tự động khi mở account là tuỳ chọn theo account; account chính mặc định tắt. Thay cho ô đồng ý và nút "Mở mà không cài" trong bảng trước khi mở (sửa ADR-019 mục 5, 6).
2. **Bố cục:** cột trái chia hai phần có tiêu đề, Project và Chat rời (mỗi chat rời là một mục). Trang project chia tab: Tổng quan (mở account, cảnh báo, task đang chọn), Task, Handoff, Lịch sử, Cài đặt. Lịch sử chỉ hiện khi người dùng mở tab của nó.
3. **Tài liệu theo nút thay vì công tắc:** chưa có tài liệu thì "Tạo tài liệu context" (chọn nơi lưu, rồi mở account để chạy `context-init`); đã có thì "Kiểm tra tài liệu" (AgentHub tự kiểm tra cấu trúc, task, handoff cũ, branch; tuỳ chọn mở agent đối chiếu với code). Project không dùng tài liệu vẫn chuyển ngữ cảnh bằng handoff tóm tắt.
4. **Tài liệu có sẵn:** AgentHub tìm trong folder project bộ tài liệu cùng khuôn (folder có `PROJECT_CONTEXT.md`, hoặc có workstream chứa `STATUS.md` và `Tasks/`). Tìm thấy thì **tự trỏ** tài liệu context tới folder đó và chỉ thông báo, không hỏi. Tên thư mục workstream không bắt buộc là `Workstreams/` (ví dụ `Playables/`). Tài liệu khác khuôn (như `Docs/Continuity.md`) được nêu trong lời nhắc `context-init` để agent dẫn link và tóm tắt, không chép.
5. **Đổi nơi lưu tài liệu:** khi folder cũ có tài liệu, AgentHub hỏi có chuyển tài liệu sang folder mới không. Chuyển thì copy sang, bản cũ vào Thùng rác của hệ điều hành (không xoá hẳn). Không ghi đè file đã có ở folder mới.
6. **Hai cài đặt ngôn ngữ tách biệt:**
   - **Ngôn ngữ giao diện** của AgentHub: English, Tiếng Việt, 한국어. Gồm cả thông báo do Main và các package trả về.
   - **Ngôn ngữ trò chuyện** với agent: lời nhắc AgentHub gửi viết theo ngôn ngữ này và yêu cầu agent trả lời bằng nó; chọn ở cấp app, project đổi riêng được. Ngôn ngữ tài liệu vẫn là cài đặt riêng của project. Skill giữ tiếng Anh.
7. **Lời nhắc cho Claude Desktop:** giữ copy vào clipboard. Deep link chỉ khi cửa sổ cần mở là instance Claude Desktop duy nhất đang chạy là một hướng cần kiểm chứng thêm; chưa làm cho tới khi có evidence, và người dùng chấp nhận tự dán nếu không có cách tốt hơn.
8. **Màn quản lý Task** sẽ thiết kế sau đợt sửa này. Nếu màn đó tạo hoặc sửa task thì nó ghi vào file task trong tài liệu (không có bảng task trong SQLite), và ADR-019 mục 3, 4 phải sửa lại.

## Consequences

- Chuỗi giao diện và thông báo phải tách khỏi code thành bảng dịch theo mã; thông báo do Main và các package trả về cũng đi theo mã (cập nhật ranh giới ở DEVELOPMENT nếu thêm package).
- Cài skill tách khỏi việc mở account: bảng trước khi mở chỉ báo account thiếu công cụ và dẫn tới màn Công cụ agent.
- Đọc tài liệu theo mọi thư mục workstream, không chỉ `Workstreams/`; MCP và skill nói theo khuôn chung.
- Danh sách thử Phase 3 phải cập nhật theo bố cục và thao tác mới.
