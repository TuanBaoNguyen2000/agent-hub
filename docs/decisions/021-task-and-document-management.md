# ADR-021 — AgentHub quản lý tài liệu và task của project

**Status:** Accepted (người dùng chốt 2026-11-06)  
**Date:** 2026-11-06  
**Decision source:** Người dùng trả lời các câu hỏi thiết kế màn quản lý Task (ADR-020 mục 8) và yêu cầu thêm (2026-11-06): "xem AgentHub như nơi quản lý documents và Task, nên có thể đọc và edit chúng", "có chức năng gọi đến các AI khi tạo task". Sau khi bàn về điều khoản của nhà cung cấp, người dùng chốt: AgentHub chỉ dùng account có gói thuê bao, không dùng API key, không chạy agent ngầm, tự tuân thủ quy định của nhà cung cấp và không dựa vào việc xin phép. Sửa đổi [ADR-019](019-agent-maintained-context.md) mục 3, 4; hoàn thành [ADR-020](020-phase3-review-changes.md) mục 8.

## Context

- ADR-019 mục 3, 4: AgentHub không quản lý task; task và trạng thái nằm trong tài liệu do agent viết; AgentHub chỉ có một thao tác ghi là "Thêm handoff". Context Editor của Phase 2 đã bị bỏ.
- Task là file `<thư mục workstream>/<slug>/Tasks/TASK-NNN-<slug>.md` (mục tiêu, acceptance criteria, ghi chú, "Handoff log" mới nhất ở trên). Trạng thái nằm trong bảng của `STATUS.md`, chữ tự do do agent viết ("In progress", "Đang làm", "done"…).
- MCP server đã có cách ghi an toàn: chỉ file `.md` trong folder tài liệu, tối đa 1 MB, ghi qua file tạm rồi rename, kiểm `base_sha256` để không ghi đè bản người khác vừa sửa (FR-013).
- Phạm vi sản phẩm không có gọi model API/SDK trực tiếp (DEVELOPMENT, TDD §1.4). Lý do (người dùng nêu, 2026-11-06): không vi phạm quy định của nhà cung cấp. AI chạy trong app hoặc CLI của account, AgentHub mở chúng.
- Điều khoản hiện hành (tra ngày 2026-11-06, tài liệu công khai): Anthropic không cho sản phẩm bên thứ ba dùng đăng nhập claude.ai hoặc hạn mức của gói nếu chưa được duyệt, kể cả agent xây trên Claude Agent SDK, và hướng tới API key. OpenAI khuyên dùng API key cho chạy tự động, đăng nhập bằng gói ChatGPT là cho người dùng trực tiếp. Vì vậy chạy `claude -p` hay `codex exec` ngầm bằng gói thuê bao để trả kết quả về AgentHub bị loại; dùng API key cũng bị loại vì người dùng chỉ dùng account có gói thuê bao.

## Decision

1. **AgentHub đọc và sửa được tài liệu và task của project.** Sửa ADR-019 mục 3, 4: ngoài agent và editor của người dùng, AgentHub cũng ghi tài liệu, theo cùng giới hạn với MCP (chỉ `.md` trong folder tài liệu, không file ẩn, tối đa 1 MB, atomic, kiểm checksum). AgentHub vẫn không tự soạn nội dung: chỉ ghi những gì người dùng nhập, cộng các dòng cấu trúc nêu ở mục 4–6. SQLite vẫn không có bảng task.
2. **Màn Task** (tab Task của project): danh sách nhóm theo workstream, lọc theo trạng thái; chọn một task thì panel bên phải hiện mục tiêu, acceptance criteria, ghi chú, handoff log, các nút "Dùng cho lần mở", "Sửa", "Nhờ agent", "Mở file". Không có bảng Kanban kéo thả.
3. **Sửa task, hai chế độ:**
   - **Theo mục** (mặc định): tiêu đề (dòng `#` đầu), Goal, Acceptance criteria (từng dòng, tick được, thêm, xoá), Notes. Mục không nhận ra được giữ nguyên thứ tự và sửa dạng Markdown. Handoff log không sửa trong chế độ này, chỉ thêm mục mới ("Thêm handoff").
   - **Markdown cả file**: một ô sửa toàn bộ file, có xem trước; cảnh báo rằng sửa Handoff log là sửa lịch sử agent dựa vào.
4. **Trạng thái: bốn giá trị cố định** Chờ, Đang làm, Bị chặn, Xong, ghi vào ô trạng thái của bảng `STATUS.md` bằng ngôn ngữ tài liệu của project (`To do`, `In progress`, `Blocked`, `Done`; `Chờ`, `Đang làm`, `Bị chặn`, `Xong`; `대기`, `진행 중`, `막힘`, `완료`). Chữ khác agent đã viết vẫn hiện nguyên văn và được xếp vào nhóm gần nhất; chỉ khi người dùng đổi trạng thái thì ô đó mới được viết lại. Task chưa có dòng trong bảng thì thêm dòng. Skill `context-init` và `context-checkpoint` được sửa để dùng đúng bốn chữ này.
5. **Chuyển sang Xong** thêm một mục ngắn lên đầu Handoff log: ngày giờ tuyệt đối, "Verified by user in AgentHub" (theo ngôn ngữ tài liệu). Đây là xác nhận của người dùng theo provenance contract (TDD §7.2), khác với agent tự báo.
6. **Tạo task:** chọn workstream, nhập tên và mục tiêu. AgentHub đặt số `TASK-NNN` kế tiếp số lớn nhất trong toàn bộ tài liệu (không trùng giữa các workstream), tạo file từ mẫu theo ngôn ngữ tài liệu (Goal đã điền, Acceptance criteria và Notes để trống, Handoff log rỗng) và thêm dòng `Chờ` vào bảng `STATUS`.
7. **Gọi AI khi tạo hoặc xem task** ("Tạo và nhờ agent", "Nhờ agent" ở panel): luôn là **phiên tương tác** của account có gói thuê bao. Chọn account và Desktop/Terminal như thanh mở account, rồi mở phiên với lời nhắc theo ngôn ngữ trò chuyện: dùng `context-resume` cho task đó, khảo sát code, viết acceptance criteria kiểm chứng được và ghi chú vào file task (qua MCP hoặc ghi file), hỏi trước khi đổi gì khác. Đi qua đúng luồng mở hiện có (quyền account–project, công cụ agent, lịch sử mở ghi `task_ref`). Trong lúc agent làm, AgentHub theo dõi file task và cập nhật panel ngay khi agent ghi, nên người dùng vẫn theo dõi và duyệt kết quả trong AgentHub.
   - **Không có:** chạy agent ngầm (`claude -p`, `codex exec`, Agent SDK, app-server) để lấy kết quả về app; gọi model API trực tiếp; API key. Đổi điều này cần ADR mới và phải phù hợp điều khoản của nhà cung cấp tại thời điểm đó.
   - **Đọc usage limit** (FR-018) vẫn giữ: lệnh cục bộ `/usage` và `account/rateLimits/read` không gọi model và không tiêu quota (SPIKE-16), nên không thuộc trường hợp trên. Chu kỳ tự đọc 10 phút ở sidebar có thể đổi sang chỉ đọc khi mở app hoặc khi bấm Làm mới nếu người dùng muốn thận trọng hơn (chưa quyết).
8. **Tài liệu khác** (tab Tài liệu mới): cây các file `.md` trong folder tài liệu, xem dạng Markdown, sửa Markdown cả file, tạo file `.md` mới. Không xoá hay đổi tên file trong app (làm trong editor hoặc nhờ agent).
9. **Khi file thay đổi từ bên ngoài trong lúc đang sửa** (agent ghi, editor khác): Main theo dõi file đang mở; ngay khi file đổi, giao diện báo "File vừa được sửa bên ngoài (có thể là agent)" và khoá nút Lưu cho tới khi người dùng tải lại. Phần đang sửa được giữ lại để copy. Mọi lần lưu vẫn kiểm checksum; AgentHub không bao giờ ghi đè hay tự gộp, kể cả khi agent chỉ thêm handoff.

## Consequences

- ADR-019 mục 3, 4 và TDD §7.3 ("Ai ghi") sửa theo mục 1. STATUS và README của các package bỏ câu "AgentHub chỉ có thao tác Thêm handoff".
- Ghi tài liệu từ Main dùng lại `writeContext`, `insertHandoff` của persistence (cùng code với MCP); thêm sửa ô trạng thái trong bảng `STATUS.md` và tạo task từ mẫu, có unit test riêng.
- Renderer cần hiển thị Markdown: chọn thư viện render không chạy HTML thô, hợp với CSP hiện tại (`script-src 'self'`), quyết định khi triển khai.
- Không có lịch sử phiên bản trong app. Tài liệu trong repo có Git; tài liệu trong dữ liệu AgentHub thì không. Có thể bổ sung bản lưu trước mỗi lần ghi nếu người dùng muốn (chưa quyết).
- Lời nhắc mới ("Nhờ agent") và chữ trạng thái đi vào ba bảng dịch.
- Theo dõi file (mục 9) được dùng cả khi xem task, để panel cập nhật lúc agent ghi trong phiên "Nhờ agent".
- DEVELOPMENT, mục Phạm vi sản phẩm, ghi nguyên tắc: chỉ account có gói thuê bao, chỉ phiên tương tác qua app hoặc CLI chính thức, không API key, không chạy agent ngầm, tự tuân thủ quy định nhà cung cấp.
- Danh sách thử Phase 3 thêm thao tác quản lý task và tài liệu.

## References

- [ADR-019](019-agent-maintained-context.md), [ADR-020](020-phase3-review-changes.md), [kế hoạch ADR-020 bước 5](../plans/adr-020-plan.md#bước-5--sau-đợt-sửa)
- TDD §7.2 (khuôn tài liệu, provenance), §7.3 (quyền ghi), §7.4 (MCP), FR-013
