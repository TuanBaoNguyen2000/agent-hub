# ADR-027 — Số task không trùng, một nguồn cho trạng thái task, tài liệu có sẵn của repo

**Status:** Accepted (người dùng duyệt 2026-11-09)  
**Date:** 2026-11-09  
**Decision source:** Người dùng hỏi khuôn tài liệu (`references/document-layout.md`) đã dùng được cho mọi loại project chưa. Đánh giá ra sáu điểm yếu, ghi thành H1–H6 ở mục H của [danh sách việc](../plans/2026-11-09-context-flow-backlog.md); người dùng duyệt ưu tiên (2026-11-09): H1, H2, H5 là P1. ADR này gồm H1, H2, H5. Sửa đổi [ADR-023](023-project-setup-tasks-and-panels.md) mục 4 (ghi trạng thái ở hai nơi).

## Context

- **Số task.** Quy tắc hiện tại là "lấy số lớn nhất trong cả bộ tài liệu rồi cộng 1". Cả agent (theo skill) lẫn AgentHub (`nextTaskId` trong `createTask`) đều làm vậy.
  - AgentHub sinh ra để nhiều account làm song song. Hai agent tạo task cùng lúc sẽ cùng ra `TASK-007`.
  - `context_write` chỉ từ chối khi **cùng một file** đã đổi (`base_sha256`). Hai task có slug khác nhau là hai file khác tên, nên không có gì chặn.
  - MCP server chạy thành tiến trình riêng cho từng phiên agent và chạy được khi app đóng (ADR-019 mục 6, SPIKE-10). Muốn ngăn trùng thì phải khoá giữa các tiến trình, không khoá trong bộ nhớ được.
  - Khi tài liệu nằm trong repo (`AgentContext/`), hai người ở hai máy hoặc hai branch vẫn có thể tạo cùng số. Khoá trên một máy không ngăn được trường hợp này, nên cần phát hiện thêm.
  - Hai task trùng số làm hỏng mọi chỗ tìm task theo id: lựa chọn task khi mở, `addHandoff`, bảng `STATUS.md`, lời nhắc.
- **Trạng thái ghi hai nơi.** ADR-023 mục 4 coi dòng `Status:` trong file task là nguồn chính, nhưng vẫn yêu cầu skill và AgentHub ghi cả bảng trong `STATUS.md`.
  - Agent, nhất là model rẻ, hay sửa một chỗ rồi quên chỗ kia.
  - Khi hai nơi lệch, AgentHub đọc file task trước nên vẫn hiện đúng. Nhưng agent đọc `STATUS.md` ở đầu phiên (`context-resume` bước 3) sẽ thấy trạng thái cũ.
  - Hiện không có cảnh báo khi hai nơi lệch.
- **Repo đã có tài liệu.** Repo như chính `agent-hub` có `docs/STATUS.md`, ADR, `AGENTS.md`.
  - `context-init` hiện không có quy tắc cho trường hợp này. Agent dễ chép nội dung sang `PROJECT_CONTEXT.md` và `DECISIONS.md`, và hai bản sẽ lệch dần.
  - Quy tắc của repo (ví dụ "cập nhật STATUS khi có tiến độ") cũng có thể mâu thuẫn với skill.

## Decision

### 1. Số task do một chỗ cấp, có khoá giữa các tiến trình (H1)

1. **Tool MCP mới `context_create_task`.**
   - **Đầu vào:** `project`, `workstream` (slug), `title`, `goal`, và `body` (phần còn lại theo `assets/task-template.md`, tuỳ chọn).
   - **Cách làm:** giữ khoá, quét lại số lớn nhất, tạo file `TASK-NNN-<slug>.md`, thêm dòng vào bảng `STATUS.md`, rồi nhả khoá.
   - **Trả về:** id, đường dẫn và `sha256` của file, để agent sửa tiếp bằng `context_write`.
   - Nội dung ban đầu dùng cùng hàm với `createTask` của app (`newTaskDocument`), nên task tạo bằng app và bằng agent có cùng khuôn.
2. **Khoá:** thư mục `<userData>/locks/context-<project id>`, tạo bằng `mkdir`. `mkdir` là thao tác nguyên tử: chỉ một tiến trình tạo được, các tiến trình khác thử lại tối đa khoảng 2 giây.
   - Khoá cũ hơn 30 giây coi là bỏ dở (tiến trình chết giữa chừng) và được gỡ.
   - Khoá nằm ở dữ liệu của AgentHub, **không ghi gì vào folder tài liệu hay repo**.
   - App (`createTask`) và MCP server dùng chung khoá này. MCP server đã biết `<userData>` qua thư mục chat rời.
3. **Skill:** `context-capture` và `context-init` dùng `context_create_task` khi có MCP. Không có MCP (agent ghi file trực tiếp) thì áp dụng hai bước:
   - Ngay trước khi ghi, liệt kê lại `Tasks/` của mọi workstream để lấy số.
   - Ghi xong, liệt kê lại một lần nữa. Nếu có file khác cùng số, đổi file của mình sang số trống tiếp theo, rồi báo người dùng.
4. **Phát hiện trùng.** Overview của AgentHub thêm issue `duplicate_task_id` khi hai file task có cùng số, nêu rõ hai đường dẫn. Lỗi trùng vẫn có thể xảy ra qua Git hoặc qua agent không có MCP, và cảnh báo này giúp thấy được.
   - Trong lúc trùng, AgentHub tìm task theo đường dẫn file (`taskRef`), không theo id. Lời nhắc ghi đường dẫn, nên agent không nhầm task.
   - Panel task có nút **Đổi số**: chuyển task sang số trống tiếp theo, sửa dòng tiêu đề và dòng trong bảng `STATUS.md`, rồi để lại một dòng ghi chú "Renumbered from TASK-NNN" trong file.

### 2. File task là nguồn duy nhất của trạng thái (H2)

1. **Agent chỉ bắt buộc ghi dòng `Status:` trong file task.** Bảng trong `STATUS.md` vẫn giữ (agent đọc nó đầu phiên để thấy toàn cảnh trong một file), nhưng chỉ là **bản tóm tắt**.
   - Skill cập nhật bảng khi tiện, theo cách đã có.
   - Khi bảng và file lệch nhau, **file task thắng**: `context-resume` ghi rõ "theo file task" khi báo cáo.
2. **AgentHub không tự ghi vào tài liệu khi chỉ đọc.**
   - Khi thấy lệch, AgentHub thêm issue `state_mismatch`, nêu task và hai giá trị, kèm nút **Đồng bộ bảng**. Nút này ghi lại cột trạng thái của bảng theo các file task, qua `guardedWrite` như hiện nay.
   - Không tự sửa khi chỉ đọc, vì việc đó làm hiện thay đổi trong Git mà người dùng không yêu cầu. Danh sách thử có mục "không có file nào xuất hiện ngoài những gì agent cố ý viết".
   - Khi người dùng đổi trạng thái trong app, app vẫn ghi cả hai nơi như ADR-021, ADR-023.
3. **`context-tidy` đồng bộ bảng** như một mục trong danh sách đề xuất, có chờ duyệt.
4. `document-layout.md` sửa mục "Task states": bỏ câu "must match"; ghi rằng file task là nguồn chính, bảng là tóm tắt, và agent ưu tiên file khi hai nơi lệch.

### 3. Repo đã có tài liệu: dẫn link, không chép (H5)

1. **`context-init`:** trước khi điền khung, tìm tài liệu sẵn có trong repo. Gồm `README.md`, `AGENTS.md`/`CLAUDE.md`, thư mục `docs/`, ADR (`docs/decisions/`, `adr/`) và file trạng thái hoặc roadmap.
   - `PROJECT_CONTEXT.md` có mục **"Existing documents"**: mỗi tài liệu một dòng, gồm đường dẫn tương đối tới gốc repo và một câu nói dùng khi nào. Không chép nội dung sang.
   - Chỉ tóm tắt những gì repo chưa ghi ở đâu.
2. **`DECISIONS.md`** chỉ ghi quyết định của workstream mà repo chưa ghi. Quyết định đã có ADR thì ghi một dòng có link tới ADR đó.
3. **Quy tắc của repo vẫn áp dụng.** Chỉ dẫn của repo (`AGENTS.md`/`CLAUDE.md`) yêu cầu cập nhật tài liệu nào của repo thì agent làm theo chỉ dẫn đó. Tài liệu context của AgentHub chỉ thêm handoff và trạng thái task, không thay thế tài liệu của repo.
   - Skill không tự sửa tài liệu của repo ngoài những gì chỉ dẫn của repo hoặc người dùng yêu cầu.
   - Đây không phải ngoại lệ của quy tắc an toàn. Tài liệu repo vẫn là dữ liệu, chỉ có file chỉ dẫn mà agent tự nạp (`AGENTS.md`/`CLAUDE.md`) mới là chỉ dẫn, như bình thường.
4. `context-resume` đọc mục "Existing documents" trong `PROJECT_CONTEXT.md` và chỉ mở tài liệu repo khi task chạm tới, để giữ ít token.

## Không thuộc ADR này

- H3 (gom `<TOPIC>.md` vào `Notes/`), H4 (khuôn nhẹ cho project nhỏ), H6 (nhận diện workstream theo cấu trúc thay vì theo tên): P2. Các mục này không đổi cách ghi dữ liệu nên ghi trong STATUS khi làm, hoặc ghi ADR riêng nếu cần.
- Đồng bộ số task giữa nhiều máy (tài liệu trong repo, hai người cùng tạo): chỉ phát hiện và đổi số (mục 1.4), không khoá được.

## Consequences

- **Tốt:** hai account song song không còn tạo trùng số qua MCP hoặc qua app. Lỗi trùng do Git hoặc do agent không có MCP sẽ hiện ra và sửa được bằng một nút. Agent mới không bị bảng `STATUS.md` cũ làm sai trạng thái. Repo có tài liệu không bị chép thành hai bản.
- **Chi phí:**
  - Thêm một tool MCP (cần mục mô tả ở i18n `mcpTool.*`) và hai loại issue.
  - Khoá trong `<userData>/locks/` cần test cho các trường hợp: hai tiến trình tạo cùng lúc, khoá bỏ dở.
  - Skill dài thêm vài dòng.
  - Bảng trong `STATUS.md` có thể cũ hơn file task cho tới khi người dùng bấm đồng bộ hoặc chạy `context-tidy`; điều này được chấp nhận vì file task là nguồn chính.
- **Rủi ro:** agent không có MCP vẫn có thể trùng số khi hai bên ghi đúng trong khoảng giữa hai lần liệt kê. Mục 1.4 bắt được trường hợp này.

## Triển khai (2026-11-10)

- **Khoá và tạo task** (`packages/persistence/src/context-tasks.ts`): `withContextLock` tạo thư mục `<userData>/locks/context-<hash của folder tài liệu>` bằng `mkdir`, chờ tối đa 2 giây, gỡ khoá cũ hơn 30 giây bằng `rename` (chỉ một tiến trình lấy được). `createContextTask` cấp số, ghi file, thêm dòng `STATUS.md`; `renumberContextTask` đổi số, sửa dòng tiêu đề, thêm "Renumbered from TASK-NNN.", đổi tên file (`renameContext`, không ghi đè) và sửa đúng dòng của task trong bảng (dòng có cùng số và tên task; không có thì thêm dòng mới); `syncStatusTable` ghi lại cột trạng thái theo file task, thêm dòng thiếu, bỏ qua task trùng số. Hàm thuần ở `task-document.ts`: `taskDocumentFromBody`, `renumberTaskDocument`, `renumberStatusRow`.
- **App:** `createTask` của workspace đi qua cùng hàm và cùng khoá; thêm `renumberTask`, `syncStatusTable` (IPC `tasks:renumber`, `tasks:sync-status`). Khoá bận thì báo `tasks.busy` để người dùng thử lại.
- **Overview:** issue `duplicate_task_id` (mỗi file trùng số, `detail` là file kia) và `state_mismatch` (chỉ khi khác nhóm trạng thái, "in progress" và "Đang làm" không tính; `detail` là chữ trong bảng). Panel task hiện cảnh báo kèm nút **Đổi số** hoặc **Đồng bộ bảng STATUS**. Đọc tài liệu không bao giờ tự sửa bảng.
- **MCP:** tool `context_create_task` (project, workstream, title, goal hoặc body); `INSTRUCTIONS` nhắc dùng tool này. Server nhận thư mục khoá từ `--data`.
- **Skill:** `document-layout.md` (đánh số qua tool hoặc liệt kê trước và sau khi ghi; file task là nguồn trạng thái, bảng là tóm tắt; repo có sẵn tài liệu thì dẫn link, mục `## Existing documents`); `context-init`, `context-capture` dùng `context_create_task`; `context-checkpoint` ghi `Status:` trước rồi mới tới bảng; `context-resume` báo khi hai nơi lệch và chỉ mở tài liệu repo khi cần; `context-tidy` đề xuất đồng bộ bảng và chỉ người dùng đổi số.
- **Kiểm chứng:** `npm run check` đạt (442 unit test, typecheck, lint); 13 test mới ở `packages/persistence/tests/context-tasks.test.ts`, có một test cho một **tiến trình khác** giữ khoá 300 ms rồi nhả; test workspace và MCP mới; E2E mới cho nút Đổi số và Đồng bộ bảng; toàn bộ E2E 31 đạt, 2 bỏ qua như trước.
- **Chưa làm:** test hai MCP server thật chạy song song (đã thử bằng tiến trình con giữ khoá, chưa chạy hai server cùng tạo task); thử `context_create_task` và `context-init` trên repo có `docs/` với agent thật. Đã đóng gói `.app` (2026-11-10, ký ad hoc); 31 E2E đạt trên bản đóng gói, 2 bỏ qua như trước.

## Kiểm chứng cần có khi triển khai

- Unit test: `context_create_task` cấp số liên tiếp; hai tiến trình chạy song song (spawn hai MCP server) không ra trùng số; khoá cũ hơn 30 giây được gỡ; issue `duplicate_task_id` và `state_mismatch`; nút Đổi số và Đồng bộ bảng.
- Test skill bằng agent thật trên project nháp: hai account cùng `context-capture` gần như cùng lúc; `context-init` trên một repo có `docs/` và ADR.

## References

- [Danh sách việc 2026-11-09](../plans/2026-11-09-context-flow-backlog.md) mục H.
- `packages/application/src/task-document.ts` (`nextTaskId`), `packages/application/src/index.ts` (`createTask`), `packages/persistence/src/context-overview.ts` (`taskFileState`, `taskStates`), `packages/persistence/src/context-files.ts` (`writeContext`), `apps/desktop/src/mcp/server.ts`.
- [ADR-019](019-agent-maintained-context.md) mục 6 (MCP server), [ADR-021](021-task-and-document-management.md), [ADR-023](023-project-setup-tasks-and-panels.md) mục 4, [ADR-026](026-skill-structure-and-management.md).
