# Kế hoạch sửa Phase 3 theo ADR-020

**Ngày:** 2026-11-05 · **Trạng thái:** bước 1 và 2 xong (2026-11-05), bước 3 và 4 xong (2026-11-06); tiếp theo là bước 5 · **Quyết định:** [ADR-020](../decisions/020-phase3-review-changes.md)

Mỗi bước tự đứng được: có unit test và E2E, cập nhật TDD/STATUS, không dừng chờ người dùng thử. Người dùng thử một lần ở cuối, theo danh sách thử đã cập nhật.

## Bước 1 — Bố cục (ADR-020 mục 2, 3) — xong 2026-11-05

**Cột trái** (`App.tsx`)
- Hai phần có tiêu đề, mỗi phần có nút "+":
  - **Project:** danh sách project.
  - **Chat rời:** mỗi chat là một mục. Danh sách đọc lại khi cửa sổ được focus, vì agent thêm chat qua MCP.
- Screen mới: `loose-chat {id}` và `new-loose-chat`. `LooseChatsView` tách thành `LooseChatView` (xem một chat, copy lời nhắc, chuyển vào project rồi nhảy sang project đó) và `NewLooseChat`.

**Trang project** (`ProjectPane.tsx`) chia tab. Component `Tabs` và `TabPanel` nằm ở `ui.tsx`, giữ mọi panel mounted và ẩn panel không chọn, để lần mở đang chờ quyết định không mất state.

| Tab | Nội dung | Component |
|---|---|---|
| Tổng quan | Thanh mở account, bảng quyết định, kết quả lần mở; dòng "Task cho lần mở: …" (nút Đổi chuyển sang tab Task); Git và cảnh báo cấp project; thẻ Tài liệu | `ProjectLaunch` (bỏ lịch sử), `ProjectDocs` mới |
| Task | Danh sách task theo workstream để chọn (chỉ khi có tài liệu; nếu không có thì giải thích và hiện nút Tạo tài liệu) | `ProjectTasks` (bỏ Git/cảnh báo/Thêm handoff) |
| Handoff | Có tài liệu: copy lời nhắc checkpoint, "Thêm handoff" cho task đang chọn. Không tài liệu: danh sách handoff, thêm handoff | `ProjectHandoffs` |
| Lịch sử | Các lần mở, xác nhận account | `ProjectHistory` mới |
| Cài đặt | Nơi lưu, ngôn ngữ tài liệu, mở folder, "Ngừng dùng tài liệu" (không xoá file) | `ProjectContext` đổi thành `ProjectSettings` |

- Lịch sử chuyển lên `ProjectPane`: pane tải lịch sử rồi truyền `history` và `onLaunched` xuống `ProjectLaunch`, vì `ProjectLaunch` vẫn cần lịch sử để chọn lại account và task lần trước.

**Thẻ Tài liệu thay công tắc** (`ProjectDocs`):
- **Chưa dùng:** "Tạo tài liệu context" mở hộp thoại để chọn nơi lưu (dữ liệu AgentHub hoặc folder khác) và ngôn ngữ, rồi gọi `updateProjectContext({enabled: true, …})`. Lần mở account tiếp theo sẽ chạy `context-init`.
- **Đã bật nhưng chưa có README:** "Mở một account ở trên; agent sẽ hỏi brief", kèm nút "Huỷ tạo".
- **Đã có tài liệu:** số workstream và số task, đường dẫn, nút "Kiểm tra tài liệu" và "Mở folder".
- **Kiểm tra tài liệu:** đọc lại từ file. Thêm `issues` vào `ContextOverview` ở `context-overview.ts`, gồm: thiếu `PROJECT_CONTEXT`, chưa có workstream, workstream thiếu `STATUS`, workstream không có task, task thiếu "Handoff log". Kết quả hiện cùng các cảnh báo hiện có.
- **Đối chiếu với code:** nút copy lời nhắc "đối chiếu tài liệu với code, chưa sửa gì cho tới khi tôi xác nhận".
- Khác kế hoạch: trạng thái chờ `context-init` cũng có nút "Kiểm tra tài liệu", để đọc lại ngay khi agent viết xong mà cửa sổ không mất focus. Git và cảnh báo cấp project nằm trong thẻ Tài liệu (project không dùng tài liệu không có cảnh báo nào).

**Test:**
- Unit cho `issues`.
- Viết lại E2E `workspace.e2e.ts`: điều hướng mới, tab, tạo tài liệu bằng hộp thoại, chat rời theo mục.

## Bước 2 — Tài liệu có sẵn và đổi nơi lưu (ADR-020 mục 4, 5) — xong 2026-11-05

**Thư mục workstream tên tuỳ ý** (`context-overview.ts`):
- Mọi thư mục cấp một không ẩn có ít nhất một thư mục con chứa `STATUS.md` hoặc `Tasks/` đều là thư mục workstream (`Workstreams/`, `Playables/`, …).
- `ref` của task giữ đường dẫn thật, ví dụ `Playables/playable005/Tasks/TASK-016-….md`.
- Kiểm tra `appendHandoff`, `findTask`, MCP (`context_projects` trả `handoffs`) và lời nhắc resume khi tên không phải `Workstreams/`.
- Skill `context-resume` và `context-checkpoint` nói theo "thư mục workstream" thay vì tên cứng.

**Phát hiện** (`packages/persistence/src/context-detect.ts`, mới):
- Quét folder project tối đa 3 cấp, bỏ thư mục ẩn, `node_modules`, `Library`, `Temp`, `obj`, `Build*`. Giới hạn số thư mục để không chậm với project Unity.
- **Cùng khuôn:** folder có `PROJECT_CONTEXT.md`, hoặc có `README.md` kèm thư mục workstream.
- **Khác khuôn:** `Docs/**/*.md` có tên gợi ý (`Continuity`, `STATUS`, `HANDOFF`, `CONTEXT`), cùng `AGENTS.md` và `CLAUDE.md` ở gốc.

**Tự trỏ:**
- **Khi chạy:**
  - lúc thêm project;
  - lúc bấm "Tạo tài liệu";
  - một lần cho project đã có mà chưa có tài liệu. Lần này đánh dấu đã quét bằng cột mới `context_detected_at` (migration 5).
- **Kết quả:**
  - **Tìm thấy đúng một bộ cùng khuôn:** đặt `customPath` và `enabled = true`, rồi hiện thông báo kèm nút "Dùng nơi khác".
  - **Tìm thấy nhiều bộ:** hiện danh sách để người dùng chọn.

**Khác khuôn:** lời nhắc `context-init` thêm "Existing docs: …, link and summarise them, do not copy". `promptFor` nhận danh sách này.

**Đổi nơi lưu** (`moveContext` trong application, platform có `trashItem` qua `shell.trashItem`):
- Nếu folder cũ có file thì hỏi trước: Chuyển / Không chuyển / Huỷ.
- Chuyển: copy từng file, không ghi đè file đã có ở folder mới, rồi đưa folder cũ vào Thùng rác. Nếu có file trùng thì dừng và báo danh sách file trùng.
- Folder cũ nằm trong repo (không phải dữ liệu AgentHub) thì không đưa vào Thùng rác; chỉ thông báo rằng nó vẫn còn đó.

**Khác kế hoạch khi triển khai:**
- `trashItem` không nằm ở platform (package này không dùng Electron): Main truyền `trash` vào workspace; E2E dùng `AGENTHUB_E2E_TRASH_DIR`.
- Chỉ folder cũ trong dữ liệu AgentHub vào Thùng rác; mọi folder người dùng tự chọn (trong hay ngoài repo) đều để nguyên, vì folder đó có thể chứa thứ khác.
- Folder đích nằm trong folder nguồn (hoặc ngược lại) bị từ chối thay vì copy.
- "Dùng nơi khác" chuyển sang tab Cài đặt, nơi đổi nơi lưu đi qua hỏi chuyển tài liệu.
- Chính folder project không được coi là bộ tài liệu, kể cả khi có `PROJECT_CONTEXT.md` ở gốc.

**Test:**
- **Fixture:**
  - bộ `AgentContext/` có `Playables/`;
  - `Docs/Continuity.md`;
  - hai bộ cùng khuôn trong một folder;
  - folder Unity lớn để đo thời gian quét.
- **Move:** file trùng, folder đích nằm trong folder nguồn, và đường dẫn có dấu.

## Bước 3 — Màn Công cụ agent (ADR-020 mục 1) — xong 2026-11-06

**Dữ liệu** (migration):
- Bảng `skills`: `id`, `name`, `source_path`, `kind` (`builtin` hoặc `custom`), `added_at`. Bản chung của skill riêng copy vào `<userData>/skills/<name>`.
- Bảng `profile_tools`: `profile_id`, `auto_install` (account chính mặc định 0).
- Trạng thái đã cài không lưu trong database mà đọc thẳng từ thư mục skill của account, vì người dùng có thể sửa tay.

**Platform** (`skills.ts`): `status(account)` trả `installed`, `missing` hoặc `foreign` theo từng skill; cùng `install` và `uninstall`. Chỉ gỡ symlink do AgentHub tạo.

**MCP:** thêm `status` và `unregister` vào `McpRegistration` (Claude `mcp remove`, Codex `mcp remove`, Desktop instance JSON).

**Thêm skill riêng:** chọn folder có `SKILL.md`, rồi kiểm tra frontmatter `name` và `description` theo chuẩn Agent Skills. Tên không được trùng skill có sẵn. Không thêm từ `~/.agents/skills`.

**UI:** mục "Công cụ agent" trong Cài đặt.
- Bảng: hàng là skill và MCP, cột là account. Mỗi ô có trạng thái và nút cài/gỡ; mỗi cột có công tắc "Tự cài khi mở".

**Mở account** (`launching.ts`):
- Bỏ `CONTEXT_TOOLS_CONFIRMATION` và `skipContextTools`.
- Nếu `auto_install` bật thì cài như hiện nay. Nếu không, plan chỉ có cảnh báo "account thiếu công cụ" và nút dẫn tới màn Công cụ agent.
- Bỏ nút "Mở mà không cài".

**Test:** unit cho trạng thái (gồm symlink trỏ đi nơi khác và skill foreign), gỡ, skill riêng không hợp lệ; E2E cho màn và cho launch không còn hỏi.

**Khác kế hoạch khi triển khai:**
- Bảng `skills` không có cột `kind` và chỉ chứa skill riêng; skill có sẵn đọc từ bundle mỗi lần khởi động.
- Mặc định `auto_install` khi chưa có dòng: account chính tắt, account riêng bật (giữ hành vi cũ cho account riêng).
- "Tự cài khi mở" chỉ cài skill có sẵn và MCP; skill riêng chỉ cài theo ô, để gỡ một skill riêng khỏi một account không bị cài lại.
- Trạng thái MCP lấy từ `mcpRegistration` (thêm trường `registered`), thêm `unregisterMcp` vào port `Launcher`, thay vì đổi kiểu `McpRegistration` thành có `status`.
- Bản chung của skill có sẵn được làm mới lúc app khởi động, thay vì mỗi lần mở account.
- Service ở `packages/application/src/agent-tools.ts`, đọc qua `launching.tools`; kiểm tra frontmatter ở `readSkillManifest` (platform). Skill riêng phải có `name` trùng tên folder, theo chuẩn Agent Skills.
- Xoá skill riêng khỏi AgentHub gỡ symlink ở mọi account còn dùng rồi xoá bản copy; folder gốc giữ nguyên.

## Bước 4 — Ngôn ngữ (ADR-020 mục 6) — xong 2026-11-06

**Package mới `@agenthub/i18n`:** không import nội bộ, mọi tầng dùng được; cập nhật DEVELOPMENT và eslint.
- Bảng `en`, `vi`, `ko` theo khoá phẳng (`launch.openDesktop`), có tham số `{name}`.
- Kiểm tra lúc test: ba bảng phải có đủ cùng một bộ khoá.
- Định dạng ngày giờ theo locale.

**Thông báo từ backend:**
- Đổi các chuỗi tiếng Việt (khoảng 140 dòng ở application, integrations, main) thành `{code, params}`.
- `AppError` đã có `code`; thêm `params`. Cảnh báo, các bước plan, `userActionRequired`, warning kết quả mở đều mang `code`.
- Renderer dịch theo khoá. Main tự dịch những gì nó hiển thị trực tiếp: hộp thoại, menu.

**Ngôn ngữ giao diện:**
- Settings có thêm `uiLanguage` (mặc định theo `app.getLocale()`, ngoài ba ngôn ngữ thì dùng English).
- Renderer có `I18nProvider` và hook `t()`; `<html lang>` đổi theo. E2E ghim `vi`.

**Ngôn ngữ trò chuyện:**
- `chatLanguage` ở settings của app, và `projects.chat_language` (null nghĩa là theo app).
- `promptFor` viết lời nhắc theo ngôn ngữ đó và thêm "Reply to me in Vietnamese/Korean". Tài liệu vẫn theo `context_language` (thêm `ko`). Skill giữ tiếng Anh.

**Thứ tự trong bước:** hạ tầng và bảng `vi` (chuyển nguyên chuỗi hiện có), rồi `en`, rồi `ko`. Bản dịch tiếng Hàn cần người đọc được tiếng Hàn rà lại; ghi rõ là chưa rà.

**Test:** khoá đủ ở cả ba bảng; E2E đổi ngôn ngữ, giao diện đổi ngay, lời nhắc CLI theo ngôn ngữ trò chuyện.

**Khác kế hoạch khi triển khai:**
- `DomainError(code, key, params)`: lỗi giữ `detail: Message`, `message` là bản tiếng Anh để ghi log; IPC trả cả hai. Không có `AppError` riêng.
- Thông báo chỉ agent đọc (lỗi của MCP server, của `context-files`, `notes`) để tiếng Anh, bọc `raw()`. Chữ CLI trả về (gói, tên hạn mức của Codex) cũng là `raw()`.
- `accountName` trả `Message` (email, hoặc "Claude (chưa rõ account)" theo ngôn ngữ); DTO mang `name: Message`.
- Lời nhắc (`prompt.*`) nằm trong cùng bảng dịch. Main dịch lời nhắc khi mở account và lời nhắc checkpoint theo ngôn ngữ trò chuyện của project; renderer dịch lời nhắc tự copy (đối chiếu tài liệu, chat rời). Bản tiếng Anh giữ nguyên câu cũ.
- Lần mở ghi trước bước này lưu chữ tiếng Việt trong `outcome`; khi đọc lại, chữ đó hiện nguyên văn.
- `chatLanguage` của app null nghĩa là theo ngôn ngữ giao diện. Ngôn ngữ trò chuyện của project chọn ở tab Cài đặt của project ("Theo app" hoặc một ngôn ngữ).
- E2E ghim `vi` bằng `--lang=vi` (Electron đổi `app.getLocale()`), không bằng biến môi trường.
- Tiêu đề "Accounts" vẫn là chữ tiếng Anh ở mọi ngôn ngữ, như trước. Nguồn ghi chú dán tay vẫn lưu "AgentHub (dán)" trong file.
- Sửa hai lỗi tìm ra khi chạy E2E: hai lần đọc context của project chồng nhau thì lần cũ ghi đè lần mới (nay bỏ kết quả cũ); đổi ngôn ngữ trò chuyện không đọc lại lời nhắc checkpoint.

## Bước 5 — Sau đợt sửa

- **Màn quản lý Task và tài liệu** (ADR-020 mục 8): đã thiết kế cùng người dùng và **triển khai (2026-11-06)**, ghi ở [ADR-021](../decisions/021-task-and-document-management.md) (Accepted). Tóm tắt: AgentHub đọc và sửa được tài liệu và task (cùng giới hạn, atomic, checksum với MCP); tab Task dạng danh sách + chi tiết; sửa task theo mục hoặc Markdown cả file; bốn trạng thái cố định ghi vào bảng `STATUS`; chuyển Xong ghi xác nhận của người dùng vào Handoff log; tạo task bằng tên + mục tiêu; "Nhờ agent" mở phiên tương tác của account có gói thuê bao với lời nhắc hoàn thiện task, AgentHub theo dõi file và cập nhật khi agent ghi (không chạy agent ngầm, không API key, theo quyết định của người dùng 2026-11-06); tab Tài liệu xem, sửa, tạo file `.md`; file đổi bên ngoài khi đang sửa thì báo ngay và khoá Lưu.
  - **Thứ tự triển khai dự kiến:** (a) persistence: đọc task theo mục, sửa ô trạng thái `STATUS`, tạo task từ mẫu theo ngôn ngữ, ghi qua `writeContext`, theo dõi file; (b) application và IPC; (c) tab Task (danh sách, chi tiết, sửa, đổi trạng thái, tạo); (d) "Nhờ agent" qua luồng mở hiện có; (e) tab Tài liệu và render Markdown; (f) skill `context-init`, `context-checkpoint` dùng bốn trạng thái; (g) ADR-019, TDD §7.3, danh sách thử. Mỗi phần có unit test và E2E.
  - **Khác thiết kế khi triển khai:** theo dõi file bằng kiểm checksum mỗi 2 giây và khi cửa sổ được focus (qua IPC `documents:checksum`), không dùng `fs.watch`. Việc xử lý file task và bảng `STATUS` là hàm thuần trong `packages/application/src/task-document.ts`; ghi đi qua port `ContextDocuments` (`list`, `read`, `write` dùng `listContext`, `readContext`, `writeContext` của persistence). Markdown render bằng component tự viết (`Markdown.tsx`), không thêm thư viện. Đổi giữa "Theo mục" và "Markdown cả file" đọc lại từ file, nên phần đang sửa ở chế độ kia bị bỏ. Chưa có lịch sử phiên bản.
- **Deep link Claude Desktop** (ADR-020 mục 7): spike nhỏ, chỉ khi người dùng muốn. Cần biết hai điều: phát hiện được "chỉ một instance Claude Desktop đang chạy" không (đếm process theo `--user-data-dir`), và `claude://code/new?q=` có tới đúng instance đó không. Chưa có evidence thì giữ clipboard.
- Cập nhật [danh sách thử Phase 3](../testing/phase3-acceptance.md) theo bố cục mới, đóng gói `.app`, người dùng chạy lại bảy scenario.

## Rủi ro

- Viết lại E2E lớn ở bước 1 và 4. Nên làm bước 1 trước bước 4, để chuỗi mới viết thẳng bằng `t()` ở bước 4 mà không phải sửa hai lần.
- Quét folder Unity lớn có thể chậm: giới hạn độ sâu và số thư mục, chạy trong Main không chặn UI.
- Tự trỏ vào folder trong repo khiến agent ghi vào repo. Đây là ý của người dùng (ADR-020 mục 4), nhưng thông báo phải nói rõ thay đổi sẽ hiện trong `git status`.
