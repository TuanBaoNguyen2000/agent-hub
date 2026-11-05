# ADR-019 — Context do agent duy trì qua tài liệu, skill và MCP của AgentHub

**Status:** Accepted for MVP (conditional, chờ spike ở mục Conditions); mục 3, 4 sửa bởi [ADR-021](021-task-and-document-management.md) (AgentHub đọc, sửa tài liệu và task)  
**Date:** 2026-11-04  
**Decision source:** Người dùng thảo luận hướng Phase 3 (2026-11-03 đến 2026-11-04) và chốt các mục dưới đây. Mẫu tham khảo là bộ `AgentContext/` người dùng đã dùng ở một dự án Unity trước (README quy trình, `PROJECT_CONTEXT`, mỗi đợt việc có `BRIEF`, `STATUS`, `DECISIONS`, `Tasks/` với handoff log).

## Context

- TDD §7–§8 bản trước giao cho AgentHub giữ checkpoint và handoff: có checkpoint editor, wizard Smart Switch, task trong SQLite, và người dùng copy/dán prompt dài sang phiên mới. Người dùng thấy cách này còn nhiều hạn chế: phải tạo task trước, không dùng được cho chat phát sinh, và vẫn phụ thuộc chat cũ còn quota để tóm tắt.
- AgentHub không đọc được nội dung chat và không gọi model (ADR-003, ADR-007). Người tóm tắt ngữ cảnh chỉ có thể là agent trong chính phiên đó.
- Claude Code và Codex dùng chung chuẩn Agent Skills (`SKILL.md`); máy người dùng đã có `~/.codex/skills/`. Một skill viết một lần chạy được trên cả hai provider.
- Mỗi account có thư mục cấu hình riêng (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`; ADR-013, ADR-014), nên skill và cấu hình MCP cài cho account này thì account khác không thấy.
- Session của Claude Code (CLI và tab Code) và của Codex là file JSONL trên máy, đánh chỉ mục theo `cwd`. Chat ở tab Chat của Claude Desktop, Project của claude.ai và cloud environment nằm trên server. Định dạng session không được công bố. Resume chéo account bị từ chối (SPIKE-01, SPIKE-08).
- Agent chỉ ghi file thoải mái trong folder đang làm việc: Claude Code cần `--add-dir` hoặc hỏi quyền, Codex chạy lệnh trong sandbox chỉ cho ghi workspace, tab Chat không có tool file. MCP server là process riêng nên ghi được thay agent.
- Các tool cùng loại (chuyển session, memory qua MCP, workflow tài liệu như Spec Kit) đều dùng tài liệu hoặc memory dùng chung làm trục chính; chuyển transcript chỉ là bản "dịch", không phải bản sao.

## Decision

1. **Tài liệu context là tuỳ chọn theo project.** Khi bật, khuôn cố định:
   - `README.md` (mô tả cấu trúc cho người đọc), `PROJECT_CONTEXT.md` (môi trường, thuật ngữ, pitfalls), các tài liệu khảo sát code tuỳ dự án.
   - `Workstreams/<slug>/` cho mỗi đợt việc: `BRIEF.md` (yêu cầu gốc, giữ link nguồn), `STATUS.md` (điểm vào, đọc trong 30 giây), `DECISIONS.md` (chỉ thêm), `Tasks/TASK-NNN-<slug>.md` (acceptance criteria và handoff log mới nhất ở trên).
   - Được thêm file tự do; AgentHub chỉ hiển thị task với tài liệu theo khuôn. Ngôn ngữ chọn theo project, mặc định tiếng Anh.
2. **Nơi lưu mặc định là dữ liệu project của AgentHub** (`<userData>/projects/<project-id>/context/`), không vào repo. Người dùng chọn được đường dẫn khác; chọn đường dẫn trong repo nghĩa là tự quyết định đưa tài liệu vào repo. Tài liệu gắn với project, dùng chung cho mọi folder và worktree của project.
3. **AgentHub không quản lý task.** Task (nếu có) nằm trong tài liệu. Bảng `tasks` của Phase 1 chỉ có dữ liệu thử nên bị bỏ (có backup trước migration). Project quản lý: tên và folder theo thiết bị, cài đặt tài liệu, account được phép (FR-016), lịch sử mở (gắn project, task chỉ là tham chiếu tuỳ chọn), Git observation (ADR-017), skill đã cài theo account.
4. **Ai ghi tài liệu:** agent (qua skill hoặc MCP) và người dùng (mở trong editor). AgentHub chỉ có một thao tác ghi, "Thêm handoff", để dán handoff từ tab Chat vào đầu handoff log của task; ghi atomic, phát hiện xung đột bằng checksum (FR-013). AgentHub không tự soạn nội dung.
5. **Bốn skill theo chuẩn Agent Skills:** `context-init` (từ GDD/brief và codebase tạo bộ tài liệu), `context-resume` (đọc ngữ cảnh đầu phiên, kiểm tra branch, nêu chỗ chưa chắc), `context-checkpoint` (ghi handoff log, `STATUS`, `DECISIONS`, pitfalls; tách reported/observed/verified), `context-capture` (chat phát sinh thành task hoặc chat rời). AgentHub cài vào từng account được phép; khi tài liệu nằm trong repo có thể cài thêm ở cấp project.
6. **MCP server của AgentHub** là đường chính khi tài liệu nằm ngoài repo, và là cách duy nhất để tab Chat đọc, ghi tài liệu không qua copy/dán.
   - Tool: `context_projects`, `context_read`, `context_write` (ghi cả file kèm checksum bản đã đọc), `context_append_handoff`, `context_capture`.
   - Chỉ đụng vào thư mục tài liệu, không nhận đường dẫn tuỳ ý. Mỗi account được đăng ký kèm định danh của nó, và server chỉ cho thấy project account đó được phép dùng.
   - Chạy được khi app AgentHub không mở. Hướng dẫn kèm theo của server là một con trỏ ("project có tài liệu, đọc `STATUS` trước").
   - Đăng ký vào cấu hình MCP của từng account. Với account chính (`~/.claude`, `~/.codex`, Claude Desktop chính) phải hỏi người dùng trước khi sửa.
7. **Mở account kèm lời nhắc.** CLI nhận lời nhắc làm prompt đầu tiên; Desktop được copy sẵn một dòng để dán. Lời nhắc là `context-resume` cho task đã chọn, hoặc "đọc handoff mới nhất" khi không bật tài liệu. Kế hoạch chỉ hiện khi có điều cần quyết định (theo thay đổi UX 2026-11-02). Thay cho wizard Smart Switch.
8. **Project không bật tài liệu vẫn chuyển được:** AgentHub đưa prompt tóm tắt chuẩn; bản tóm tắt lưu thành lịch sử handoff gọn của project. Chat không thuộc project nào lưu ở mục "Chat rời", chuyển vào project được.
9. **`CLAUDE.md` và `AGENTS.md` chỉ là con trỏ** (đóng ADR-011).
   - Tài liệu trong AgentHub: không tạo, không sửa hai file này trong repo. Con trỏ đi qua lời nhắc khi mở, `description` của skill và hướng dẫn của MCP server.
   - Tài liệu trong repo: `context-init` đề xuất `AGENTS.md` ngắn trỏ tới tài liệu, `CLAUDE.md` chỉ có `@AGENTS.md`; file đã có thì chỉ chèn vài dòng. Luôn hiện diff cho người dùng duyệt. Không chép kiến thức dự án vào hai file này (tránh hai bản lệch nhau và giới hạn 32 KiB của Codex).
10. **Fallback transcript** khi phiên cũ dừng trước checkpoint, chỉ cho chat có folder (CLI, tab Code, Codex app):
    - AgentHub chỉ tìm đường dẫn file session gần nhất của folder project trong account nguồn, đọc tối thiểu để định vị (`cwd`, đường dẫn, thời gian), không đọc hay hiển thị nội dung. Claude: `<config dir>/projects/<cwd mã hoá>/*.jsonl`. Codex: cột `cwd`, `rollout_path` của bảng `threads` (đọc chỉ-đọc), fallback là dòng `session_meta` đầu file (SPIKE-15).
    - Agent đích tự đọc phần cuối transcript và viết checkpoint bù. Người dùng xác nhận trước, nhất là khi chuyển sang account hoặc provider khác.
    - Đây là ngoại lệ có giới hạn của non-goal "đọc local DB của app khác" và quy tắc "native history scraping" (TDD §1.4, DEVELOPMENT).
11. **Bỏ khỏi Phase 3:** checkpoint editor, wizard Smart Switch, bảng `checkpoints` và `handoffs` theo draft TDD §6.2, artifact theo task ở TDD §6.3 bản cũ.

## Conditions (spike trước khi triển khai phần liên quan)

1. Codex chạy MCP server ngoài sandbox lệnh không, và hỏi quyền thế nào khi agent gọi tool MCP. **CLI đạt trên macOS** ([SPIKE-11](../../spikes/11-codex-mcp/evidence/2026-11-04-macos.md), 2026-11-04): server chạy ngoài seatbelt; tool có `readOnlyHint` chạy không cần hỏi, `context_write` cần người dùng duyệt hoặc `tools.context_write.approval_mode = "approve"`. TUI hỏi mỗi lần với Allow, Allow for this session, Always allow, Cancel. Codex app chưa thử.
2. Tab Code của Claude Desktop có dùng cấu hình MCP trong `CLAUDE_CONFIG_DIR` của account không. **Đạt trên macOS** ([SPIKE-12](../../spikes/12-claude-desktop-mcp/evidence/2026-11-04-macos.md), 2026-11-04). Desktop còn đưa server của `claude_desktop_config.json` vào session và ưu tiên bản đó khi trùng tên, nên hai nơi phải đăng ký cùng tên, cùng tham số. Tab Code ở chế độ auto không hỏi quyền.
3. Instance Claude Desktop của account phụ có dùng `claude_desktop_config.json` riêng trong thư mục dữ liệu của nó không. **Đạt có điều kiện** ([SPIKE-12](../../spikes/12-claude-desktop-mcp/evidence/2026-11-04-macos.md)): instance phụ đọc file riêng và khởi chạy server, instance chính không bị ảnh hưởng, Chat gọi được tool. Tool local đến Chat qua một bridge thiết bị chỉ cho một instance mỗi account, nên hai instance cùng account thì instance mở sau không dùng được; khi đó dùng copy/dán.
4. `.app` đóng gói khởi chạy được MCP server mà không cần Node riêng (ví dụ chạy binary Electron ở chế độ Node). **Đạt trên macOS** ([SPIKE-10](../../spikes/10-mcp-server-from-app/evidence/2026-11-04-macos.md), 2026-11-04): script trong `app.asar`, chạy bằng binary của app với `ELECTRON_RUN_AS_NODE=1`, đăng ký qua shim ở đường dẫn ổn định. Không được tắt fuse `RunAsNode`.
5. CLI Claude và Codex nhận prompt ban đầu, và `--add-dir` (hoặc tương đương của Codex) hoạt động. **Đạt trên macOS** ([SPIKE-13](../../spikes/13-cli-prompt-add-dir/evidence/2026-11-04-macos.md), 2026-11-04): lời nhắc là tham số cuối, khớp từng byte. Claude chặn bằng hộp thoại tin tưởng folder ở lần đầu. Claude phải dùng `--add-dir=<dir>`, vì `--add-dir <dir>` nuốt lời nhắc đứng sau.
6. Thư mục skill theo account và theo project của từng provider. **Đạt có điều kiện trên macOS** ([SPIKE-14](../../spikes/14-skill-dirs/evidence/2026-11-04-macos.md), 2026-11-04): theo account là `$CLAUDE_CONFIG_DIR/skills` và `$CODEX_HOME/skills`, account khác không thấy; symlink tới một bản chung được nạp. Cấp project là `.claude/skills` (Claude) và `.agents/skills` (Codex), đi từ cwd lên gốc repo. Claude nạp `.claude/skills` của thư mục `--add-dir`, Codex thì không. Codex còn đọc `~/.agents/skills` cho mọi account, nên AgentHub không được cài skill vào đó.
7. Định vị session gần nhất theo folder cho từng account, và agent đích đọc được file đó. **Đạt trên macOS** ([SPIKE-15](../../spikes/15-session-locate/evidence/2026-11-04-macos.md), 2026-11-04): Claude tìm theo tiền tố tên thư mục mã hoá rồi kiểm tra `cwd` trong file (tên mã hoá có thể trùng giữa hai folder và bị cắt khi dài); Codex đọc bảng `threads` chỉ-đọc, chỉ các cột định vị, quét `session_meta` làm fallback. So sánh `cwd` sau khi chuẩn hoá Unicode (Codex giữ NFD, Claude ghi NFC). Codex sandbox read-only đọc được file; Claude cần `--add-dir=<thư mục chứa file>`.

Spike nào không đạt thì phần tương ứng quay về fallback: tài liệu trong repo hoặc `--add-dir` cho CLI, copy/dán cho Desktop và tab Chat.

## Consequences

- Ngữ cảnh được ghi dần trong lúc làm, nên khi đổi account chỉ cần ghi phần từ checkpoint gần nhất. Cùng tài liệu dùng được cho Claude và Codex, cho cả người không dùng AgentHub nếu tài liệu nằm trong repo.
- AgentHub nhỏ lại ở phần context (không editor, không wizard) nhưng thêm thành phần mới phải bảo trì: bộ skill, MCP server, và việc đăng ký cấu hình vào từng account.
- Chất lượng tài liệu phụ thuộc agent. Quên checkpoint thì chỉ còn transcript (chat có folder) hoặc tự copy (tab Chat). Cảnh báo "có thay đổi mới hơn handoff" giảm rủi ro này, không loại bỏ được.
- Phụ thuộc hành vi không có trong tài liệu: định dạng và vị trí session, cách app nạp MCP theo instance. Mỗi phần có fallback.
- MCP mở một kênh để agent đọc tài liệu của project khác; giới hạn theo account (FR-016) là bắt buộc, không tuỳ chọn.
- Sửa đổi ADR-005: Smart Switch còn là quy tắc chọn lời nhắc và cảnh báo, không còn là wizard. Đóng ADR-011. FR-002, FR-008–FR-012 và TDD §6–§9, §13 đổi theo.
- Windows chưa áp dụng (ADR-015).

## Related

ADR-003, ADR-005, ADR-007, ADR-011 (TDD §15), [ADR-013](013-claude-desktop-account-instances.md), [ADR-014](014-codex-profiles.md), [ADR-017](017-mvp-git-observations.md), [SPIKE-04](../../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md), [SPIKE-06](../../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md), TDD §7.
