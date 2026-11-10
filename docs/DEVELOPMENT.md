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
| `packages/i18n` | Bảng dịch `en`, `vi`, `ko` theo khoá, dịch `Message`, định dạng ngày giờ (ADR-020 mục 6) | Không có |
| `packages/domain` | Entities, value objects, business rules và domain validation | i18n |
| `packages/application` | Use cases, orchestration và ports cho hệ thống bên ngoài | domain, i18n |
| `packages/contracts` | IPC DTOs, events, transport validation schemas | i18n |
| `packages/persistence` | SQLite, migrations, filesystem artifact store | application, domain, i18n |
| `packages/integrations` | Claude/Codex launchers và capability mapping | application, domain, i18n |
| `packages/platform` | macOS/Windows process, app/folder, terminal và read-only Git/Unity observation adapters | application, domain, i18n |
| `apps/desktop/src/main` | Electron lifecycle, IPC handlers, mapping DTOs và composition root | Các package cần để kết nối implementation |
| `apps/desktop/src/mcp` | MCP server của AgentHub, chạy bằng binary của app ở chế độ Node, không có Electron API (ADR-019) | application, domain, i18n, persistence |
| `apps/desktop/src/preload` | API contextBridge giới hạn, typed theo contracts | contracts, i18n |
| `apps/desktop/src/renderer` | React UI, state và tương tác qua Preload API | contracts, i18n |

Ranh giới này được kiểm tra bằng `no-restricted-imports` trong `eslint.config.mjs`, và chỉ bắt được import, không phát hiện được truy cập gián tiếp. Khi thêm package hoặc đổi dependency được phép, sửa bảng này và file đó cùng lúc. Mỗi package export `src/index.ts`; `apps/desktop` khai báo package nội bộ ở `devDependencies` để chúng được bundle, còn dependency runtime có native code ở `dependencies`.

`application` không import implementation hạ tầng. `integrations` nhận platform port qua dependency injection; Main nối launcher với platform adapter. `domain` không biết đến Electron, React, database, filesystem hay provider CLI. `contracts` không chứa domain entities trực tiếp; Main map domain results sang DTO cần thiết để giới hạn dữ liệu qua IPC.

**Chữ hiển thị (ADR-020 mục 6):** không viết chữ cho người dùng thẳng trong code. Backend trả `Message` (khoá `@agenthub/i18n` kèm tham số), `DomainError` nhận khoá thay cho câu; renderer dịch bằng `useI18n()`. Thêm khoá vào cả ba bảng `vi`, `en`, `ko` (test kiểm tra cùng khoá và tham số). Lời nhắc cho agent dịch theo ngôn ngữ trò chuyện; lỗi chỉ agent đọc qua MCP để tiếng Anh với `raw()`. E2E chạy với `--lang=vi`.

**Cách viết chữ giao diện** (người dùng góp ý 2026-11-10):
- Mỗi ý là một câu ngắn. Không nối hai câu bằng dấu chấm phẩy ("a; b"); tách thành hai câu hoặc nối bằng "và", "nên", "rồi".
- Không nhắc lại điều giao diện đã cho thấy. Ví dụ: tiêu đề đã ghi "Gỡ khỏi AgentHub" thì gợi ý không viết lại "Chỉ gỡ khỏi AgentHub"; lựa chọn "Folder khác" thì gợi ý không mở đầu bằng "Folder bạn chọn".
- Gợi ý nói điều người dùng cần biết để quyết định, không giải thích cách AgentHub làm bên trong.
- Khi đổi nội dung một khoá, sửa cả ba bảng `vi`, `en`, `ko`.

Renderer không gọi Node APIs, SQLite, filesystem hoặc process. Preload không expose raw `ipcRenderer` hoặc API thực thi tùy ý. Domain validation và transport validation phục vụ hai boundary khác nhau; không đưa quy tắc nghiệp vụ vào Renderer để thay cho kiểm tra trong Main/application.

## Lệnh phát triển

Cần Node 24 (`.nvmrc`) và npm 11. Chạy từ thư mục gốc; tooling và versions ở [ADR-016](decisions/016-workspace-and-build-tooling.md).

| Lệnh | Tác dụng |
|---|---|
| `npm ci` | Cài dependencies và tải binary Electron |
| `npm run dev` | Chạy app với dev server |
| `npm run check` | Typecheck, lint và test |
| `npm test` | Chỉ chạy test, trên runtime của Electron |
| `npm run test:e2e` | Build rồi chạy E2E trên cửa sổ Electron, với dữ liệu tạm |
| `npm run package` | Đóng gói `.app` vào `apps/desktop/release/`, ký ad hoc |

`AGENTHUB_E2E_NATIVE=1 npx playwright test native` mở Terminal.app và một cửa sổ Claude Desktop thật, với CLI giả và thư mục rỗng; không đăng nhập gì. Mặc định E2E bỏ qua hai bài này.

Dữ liệu nằm ngoài repo: bản đóng gói dùng `~/Library/Application Support/AgentHub/`, `npm run dev` dùng `AgentHub Dev` trong cùng thư mục cha, để migration chưa phát hành không đụng dữ liệu thật. Thư mục của account phụ nằm trong `~/.agenthub/accounts/` ở bản đóng gói, và trong thư mục dữ liệu riêng khi chạy dev hoặc E2E, để thử nghiệm không đụng login thật. E2E luôn dùng thư mục tạm, `AGENTHUB_E2E_BROWSER_DIR` thay trình duyệt bằng script giả để không mở cửa sổ thật, và `AGENTHUB_E2E_TRASH_DIR` thay Thùng rác của macOS bằng một thư mục tạm; hai biến này chỉ có tác dụng khi app dùng dữ liệu riêng. Chạy E2E trên bản đóng gói bằng cách đặt `AGENTHUB_E2E_EXECUTABLE` trỏ tới binary trong `.app`.

Thử bản đóng gói bằng double-click trong Finder. Nếu mở bằng `open`, phải xoá env trước (`env -i`), vì `open` chuyển env của process gọi sang app ([SPIKE-09](../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md)).

## Phạm vi sản phẩm

- Giữ Desktop và CLI ngang hàng trong UX; phân biệt mức tự động hóa thực tế.
- Không thêm chat UI, direct model inference API/SDK, native history scraping hoặc credential ingestion vào MVP. Ngoại lệ duy nhất là fallback transcript của [ADR-019](decisions/019-agent-maintained-context.md): chỉ đọc đủ để định vị file session theo folder, không đọc hay hiển thị nội dung.
- **Tuân thủ quy định của nhà cung cấp, không dựa vào việc xin phép** (người dùng chốt 2026-11-06, [ADR-021](decisions/021-task-and-document-management.md)): AgentHub chỉ làm việc với account có gói thuê bao, qua app hoặc CLI chính thức, ở phiên tương tác do người dùng mở. Không dùng API key, không chạy agent ngầm (`claude -p`, `codex exec`, Agent SDK, app-server) để lấy kết quả về app, không lấy hay dùng lại token đăng nhập. Lệnh chỉ đọc không gọi model (như đọc usage limit, SPIKE-16) thì được.
- Ngữ cảnh do agent viết qua skill hoặc MCP (ADR-019); AgentHub không tự soạn nội dung tài liệu. AgentHub chỉ ghi những gì người dùng nhập: "Thêm handoff", và theo ADR-021 các thao tác trên tab Task và Tài liệu, qua cùng `writeContext` (atomic, checksum) với MCP.
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
- Commit workspace manifests và `package-lock.json`; không ignore lockfiles.

## Kiểm chứng

- Thay đổi tài liệu/scaffold: kiểm tra links nội bộ, cấu trúc thư mục, tính nhất quán của path và diff; không cần tạo unit test cho prose.
- Khi có implementation: chạy checks phù hợp với phần thay đổi và quality gates ở TDD §14. Chỉ ghi lệnh thực sự tồn tại và kết quả thực sự đã chạy.
- Provider/platform behavior cần evidence trên OS và exact version liên quan; mock test không thay thế native smoke test.
- Tách `reported`, `observed` và `verified`. Git diff không chứng minh tính năng đúng; một lần mở app không chứng minh account đã đổi.
- Báo rõ test chưa chạy, giới hạn môi trường và phần cần người dùng thao tác; không đánh dấu pass khi thiếu evidence.
- Thử trên `.app` thật bằng bộ project thử ở [testing/sandbox-projects.md](testing/sandbox-projects.md), không bằng project đang làm của người dùng; tài liệu đó có cách tự kiểm tra logic nhận tài liệu không cần mở app và cách hướng dẫn người dùng thử.

## Bàn giao

Khi hoàn tất một mốc, nêu thay đổi, kết quả kiểm chứng, điều chưa xác minh và bước tiếp theo. Cập nhật STATUS; thay đổi kiến trúc cần ADR và cập nhật TDD tương ứng. Không ghi nội dung hội thoại riêng hoặc toàn bộ lịch sử phiên vào tài liệu chung.
