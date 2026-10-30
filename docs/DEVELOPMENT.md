# Development guide

Tài liệu này chứa quy tắc dùng chung cho người phát triển, Codex và Claude. Thiết kế nền tảng nằm trong [TDD.md](TDD.md), trạng thái hiện tại ở [STATUS.md](STATUS.md).

## Ngôn ngữ và tài liệu

- Dùng tiếng Việt cho prose; giữ tên file, code identifiers và thuật ngữ kỹ thuật bằng tiếng Anh.
- Giữ đường dẫn tài liệu ổn định khi chuyển sang tiếng Anh sau này.
- TDD mô tả yêu cầu/thiết kế; ROADMAP mô tả kế hoạch; STATUS phản ánh thực tế. Không sao chép toàn bộ nội dung giữa các file.
- AGENTS là entrypoint chung trỏ đến tài liệu này; CLAUDE chỉ nạp lại AGENTS qua `@AGENTS.md`. Không tạo hai bộ quy tắc khác nhau theo provider.
- Cập nhật STATUS khi kết thúc mốc công việc đáng kể, gặp blocker hoặc bàn giao; ghi bước tiếp theo đủ cụ thể cho phiên mới.

## Package boundaries

| Thành phần | Trách nhiệm | Dependency nội bộ dự kiến được phép |
|---|---|---|
| `packages/domain` | Entities, value objects, business rules và domain validation | Không có |
| `packages/application` | Use cases, orchestration và ports cho hệ thống bên ngoài | domain |
| `packages/contracts` | IPC DTOs, events, transport validation schemas | Không có |
| `packages/persistence` | SQLite, migrations, filesystem artifact store | application, domain |
| `packages/integrations` | Claude/Codex launchers và capability mapping | application, domain |
| `packages/platform` | macOS/Windows process, app/folder, terminal và read-only Git/Unity observation adapters | application, domain |
| `apps/desktop/src/main` | Electron lifecycle, IPC handlers, mapping DTOs và composition root | Các package cần để kết nối implementation |
| `apps/desktop/src/preload` | API contextBridge giới hạn, typed theo contracts | contracts |
| `apps/desktop/src/renderer` | React UI, state và tương tác qua Preload API | contracts |

Đây là ranh giới thiết kế được review thủ công trong foundation; chưa có tooling kiểm tra tự động. Dependency thư viện bên ngoài và public package exports sẽ được quyết định tại bootstrap.

`application` không import implementation hạ tầng. `integrations` nhận platform port qua dependency injection; Main nối launcher với platform adapter. `domain` không biết đến Electron, React, database, filesystem hay provider CLI. `contracts` không chứa domain entities trực tiếp; Main map domain results sang DTO cần thiết để giới hạn dữ liệu qua IPC.

Renderer không gọi Node APIs, SQLite, filesystem hoặc process. Preload không expose raw `ipcRenderer` hoặc API thực thi tùy ý. Domain validation và transport validation phục vụ hai boundary khác nhau; không đưa quy tắc nghiệp vụ vào Renderer để thay cho kiểm tra trong Main/application.

## Phạm vi sản phẩm

- Giữ Desktop và CLI ngang hàng trong UX; phân biệt mức tự động hóa thực tế.
- Không thêm chat UI, direct model inference API/SDK, native history scraping hoặc credential ingestion vào MVP.
- Smart Switch dựa trên rules và capability đã kiểm chứng; không suy ra account/session ready từ việc mở app.
- Dùng manual fallback khi tích hợp không hỗ trợ hoặc chưa kiểm chứng; ghi đúng `unknown`/`unverified`.
- Git/Unity observations ban đầu chỉ đọc; không tự checkout/reset/clean/stash/merge hoặc sửa Unity assets.
- Quyết định đã Accepted chỉ thay đổi khi người dùng chấp thuận thay đổi đó; công việc trong phạm vi đã duyệt được tiếp tục bình thường.

## Trước khi triển khai

1. Đọc STATUS, TDD, ADR liên quan và kiểm tra thay đổi có sẵn trong working tree.
2. Xác định objective, phạm vi và acceptance criteria.
3. Nếu là provider integration, kiểm tra evidence theo exact OS/version/auth mode trong feasibility report; tra tài liệu chính thức khi cần xác minh capability mới.
4. Chỉ khởi tạo ứng dụng sau Phase 0. Spike được phép có harness tối thiểu riêng, không đồng nghĩa chốt tooling sản phẩm.
5. Các quyết định chưa có bằng chứng được ghi là giả định hoặc Open; không ghi thành supported.

## Filesystem, process và dữ liệu

- Mọi truy cập hệ thống của sản phẩm đi qua Main và adapter thích hợp; validate IPC payload và giới hạn project paths.
- Truyền executable/args/cwd/env riêng, không nối user input thành shell command.
- Profile env chỉ áp dụng cho child process; provider tự quản lý đăng nhập và credential stores.
- Runtime database/artifacts/logs nằm ngoài source repo theo TDD §6. Dữ liệu kiểm thử local tạm thời của spike đặt trong `spikes/<spike-name>/local/`, đã được ignore.
- Evidence được commit đặt trong `spikes/<spike-name>/evidence/` và phải được làm sạch credentials, account identifiers và nội dung project nhạy cảm; không commit raw authentication files hoặc transcript.
- Ghi file có revision/conflict handling và atomic replacement; dùng transaction/migration khi triển khai persistence.
- Không ghi đè instruction files hoặc context exports của project bên ngoài mà chưa review theo policy của TDD.

## Git workflow

- Giữ nguyên thay đổi của người dùng; không reset hoặc clean working tree để chuẩn bị công việc.
- Khi cần tạo branch, mặc định dùng prefix `agent/`; không cần tạo branch chỉ để viết tài liệu nếu chưa có yêu cầu.
- Không tự commit, push, merge hoặc tạo release trong bước foundation. Khi được yêu cầu ở các bước sau, kiểm tra diff và chỉ đưa file đúng phạm vi vào commit.
- Khi tooling được chọn, commit workspace manifests và lockfile tương ứng; không ignore lockfiles.

## Kiểm chứng

- Thay đổi tài liệu/scaffold: kiểm tra links nội bộ, cấu trúc thư mục, tính nhất quán của path và diff; không cần tạo unit test cho prose.
- Khi có implementation: chạy checks phù hợp với phần thay đổi và quality gates ở TDD §14. Chỉ ghi lệnh thực sự tồn tại và kết quả thực sự đã chạy.
- Provider/platform behavior cần evidence trên OS và exact version liên quan; mock test không thay thế native smoke test.
- Tách `reported`, `observed` và `verified`. Git diff không chứng minh tính năng đúng; một lần mở app không chứng minh account đã đổi.
- Báo rõ test chưa chạy, giới hạn môi trường và phần cần người dùng thao tác; không đánh dấu pass khi thiếu evidence.

## Bàn giao

Khi hoàn tất một mốc, nêu thay đổi, kết quả kiểm chứng, điều chưa xác minh và bước tiếp theo. Cập nhật STATUS; thay đổi kiến trúc cần ADR và cập nhật TDD tương ứng. Không ghi nội dung hội thoại riêng hoặc toàn bộ lịch sử phiên vào tài liệu chung.
