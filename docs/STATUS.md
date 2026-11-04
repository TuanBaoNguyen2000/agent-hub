# Project status

**Updated:** 2026-11-04  
**Stage:** Phase 2 đủ deliverables trên macOS; người dùng báo đăng nhập với account thật ổn (reported, 2026-11-03). Hướng Phase 3 đã chốt ở ADR-019 (context do agent duy trì qua tài liệu, skill và MCP), chưa triển khai; đang chạy các spike điều kiện (SPIKE-10 đạt; SPIKE-11 đạt ở CLI và TUI; SPIKE-12 đạt, Chat cần mỗi account một instance; SPIKE-13 đạt; SPIKE-14 đạt, tránh `~/.agents/skills` của Codex; SPIKE-15 đạt — đủ bảy điều kiện). Windows hoãn theo ADR-015, vẫn `Not run`  
**Application:** Quản lý Project, Task, context, account; hiển thị usage limit của từng account; mở Claude/Codex bằng Desktop hoặc Terminal từ một task. Chưa có checkpoint, handoff, Smart Switch. `npm run package` tạo `.app` ký ad hoc

## Đã hoàn thành

- **Usage limit của account (FR-018, 2026-11-04):** theo yêu cầu người dùng.
  - **Nguồn ([SPIKE-16](../spikes/16-usage-limits/evidence/2026-11-04-macos.md), observed):** Claude `claude -p /usage` (lệnh cục bộ, không tốn token, tắt hook và MCP, không lưu session); Codex `account/rateLimits/read` của app-server. Kiểm tra login trước; chưa đăng nhập thì không chạy.
  - **App:** mỗi account trong Cài đặt có thanh "Phiên 5 giờ" và "Tuần" kèm giờ đặt lại, gói (Codex), giờ cập nhật và nút Làm mới; cảnh báo khi chạm hạn mức. Sidebar hiện phần trăm cao nhất, đọc lại mỗi 10 phút. Main giữ kết quả trong bộ nhớ 60 giây, gộp các lần hỏi cùng lúc; không lưu vào database.
  - **Kiểm chứng:** 205 unit test (thêm parser Claude/Codex, cờ dòng lệnh, không chạy CLI khi chưa đăng nhập, cache); 23 bài E2E, có bài mới cho thanh usage, chip ở sidebar và Làm mới. Gọi `launcher.usage` với CLI thật cho một account Claude và Codex: đúng số liệu. Đã xem ảnh chụp UI sáng và tối. Chưa thử trên `.app` với nhiều account; chưa thử account Claude dùng API key, Codex Free.
- **Đánh giá OmniRoute (2026-11-04):** [docs/research](research/2026-11-04-omniroute.md). Không dùng lại mô hình gateway giữ token và tự xoay account (trái TDD §1.4, §11.4); ghi lại vài ý tưởng có thể mượn.
- **SPIKE-15 — Định vị session gần nhất theo folder (ADR-019 điều kiện 7), macOS Pass (observed, 2026-11-04):** [evidence](../spikes/15-session-locate/evidence/2026-11-04-macos.md). `locate.mjs` chỉ đọc metadata; profile B, session ngắn có từ mã.
  - Claude: tên thư mục `projects/<cwd mã hoá>` có thể trùng giữa hai folder (`src dự án` và `src-dự-án`) và bị cắt ở 200 ký tự kèm hash, nên tìm theo tiền tố rồi kiểm tra `cwd` trong file. Session tab Code của Desktop nằm cùng chỗ (`entrypoint` `claude-desktop`).
  - Codex: bảng `threads` của `state_5.sqlite` (better-sqlite3 `readonly`, chỉ cột định vị) khớp với file rollout; quét dòng `session_meta` làm fallback. Folder tên NFD: Codex ghi `cwd` dạng NFD, Claude ghi NFC, nên phải so sánh sau khi chuẩn hoá.
  - Resume giữ nguyên file và id; sắp theo mtime hoặc `updated_at_ms` cho đúng session có hoạt động gần nhất. Codex sandbox read-only đọc được file của Claude; Claude cần `--add-dir=<thư mục chứa file>`.
- **SPIKE-14 — Thư mục skill theo account và project (ADR-019 điều kiện 6), macOS Pass có điều kiện (observed, 2026-11-04):** [evidence](../spikes/14-skill-dirs/evidence/2026-11-04-macos.md). Skill đánh dấu ở từng thư mục ứng viên, HOME giả, profile B; đọc danh sách skill CLI thực sự nạp.
  - Theo account: `$CLAUDE_CONFIG_DIR/skills` và `$CODEX_HOME/skills`, account khác không thấy; thư mục skill là symlink tới một bản chung vẫn được nạp.
  - Cấp project: Claude đọc `.claude/skills`, Codex đọc `.agents/skills` (và `.codex/skills` ở cwd), cả hai từ cwd lên gốc repo. Claude nạp `.claude/skills` của thư mục `--add-dir`; Codex không nạp skill qua `--add-dir`.
  - Codex đọc `~/.agents/skills` cho mọi account (`skip_host_skill_discovery` không tắt được), nên AgentHub không cài skill vào đó. Claude Desktop tự đồng bộ skill của account claude.ai vào `skills/synced/`; AgentHub không ghi vào thư mục này.
- **SPIKE-13 — Prompt ban đầu và `--add-dir` (ADR-019 điều kiện 5), macOS Pass (observed, 2026-11-04):** [evidence](../spikes/13-cli-prompt-add-dir/evidence/2026-11-04-macos.md). Script theo khuôn `terminalScript`, chạy trong pty, profile B.
  - Lời nhắc chứa nháy, `$(...)`, backtick, tiếng Việt, xuống dòng vào session của Claude và Codex khớp từng byte; không lệnh nào bị thực thi.
  - Claude chặn lời nhắc bằng hộp thoại tin tưởng folder ở lần đầu (thêm hộp thoại import nếu workspace nằm dưới repo có `CLAUDE.md` import file ngoài); Codex không chặn. Thiếu `USER` trong env thì Claude báo chưa đăng nhập.
  - `--add-dir` của cả hai cho ghi thư mục ngoài workspace. Claude phải dùng `--add-dir=<dir>`: dạng có khoảng trắng nuốt lời nhắc đứng sau.
  - Claude CLI tự cập nhật bằng npm sau khi mở tương tác; trong khoảng 8 phút lệnh `claude` không có trên PATH.
- **SPIKE-12 — MCP trên Claude Desktop (ADR-019 điều kiện 2, 3), macOS (2026-11-04):** [evidence](../spikes/12-claude-desktop-mcp/evidence/2026-11-04-macos.md). Dùng instance B của SPIKE-07, Desktop 4.16336.0.
  - Tab Code (observed): Claude Code 2.1.317 nhúng trong instance chạy với `CLAUDE_CONFIG_DIR` của B và khởi chạy server trong user scope của nó. Desktop còn đưa server của `claude_desktop_config.json` vào mỗi session và ưu tiên bản đó khi trùng tên, nên agent đã gọi bản của Desktop. Chế độ auto không hỏi quyền.
  - Instance B khởi chạy server từ `claude_desktop_config.json` riêng ngay khi mở, qua helper `disclaimer`; shim chạy được; instance chính không bị ảnh hưởng. Mỗi server có hai process (client `claude-ai` và `local-agent-mode-*`). Log của mọi instance ghi chung vào `~/Library/Logs/Claude`.
  - Chat: lần đầu không thấy tool vì một instance khác cùng account đang giữ bridge tool local (`device_id held by a live connection`). Thử lại khi tắt instance đó: Chat gọi được tool và ghi được file (observed). Bridge chỉ cho một instance mỗi account trên một máy. Chưa biết Chat có hỏi quyền không.
- **SPIKE-11 — MCP trên Codex (ADR-019 điều kiện 1), macOS CLI Pass (observed, 2026-11-04):** [evidence](../spikes/11-codex-mcp/evidence/2026-11-04-macos.md). Chạy `codex exec` 0.166.0 bằng profile B, bỏ qua `config.toml` của B, không lưu session.
  - MCP server do Codex khởi chạy nằm ngoài seatbelt và ghi được thư mục tài liệu ngoài workspace, kể cả ở sandbox read-only. Đối chứng: cùng server chạy trong `codex sandbox` thì bị `EPERM`; shell `touch` ra ngoài workspace bị chặn.
  - Phê duyệt: tool có `readOnlyHint` chạy luôn; `context_write` cần người duyệt (trong `exec` thì bị chặn) trừ khi có `[mcp_servers.agenthub.tools.context_write] approval_mode = "approve"`. `prompt` chặn cả tool đọc. Không nên dùng `approve` cho cả server.
  - TUI (người dùng chạy, gửi ảnh chụp): hộp thoại hiện nguyên tham số, có Allow / Allow for this session / Always allow / Cancel; chọn Allow thì `config.toml` không đổi. Chưa thử: "Always allow" có lưu `approval_mode = "approve"` không, và Codex app.
- **SPIKE-10 — MCP server chạy từ `.app` (ADR-019 điều kiện 4), macOS Pass (observed, 2026-11-04):** [evidence](../spikes/10-mcp-server-from-app/evidence/2026-11-04-macos.md).
  - Binary của `AgentHub.app` với `ELECTRON_RUN_AS_NODE=1` chạy MCP stub đặt trong `app.asar`, không cần Node riêng; load được `better-sqlite3` của app; stdout sạch, không có Dock icon, khoảng 64 MB mỗi process; thoát khi client đóng stdin hoặc bị kill.
  - Claude CLI 2.1.316 (`claude mcp list`: Connected) và Codex CLI 0.166.0 (`codex exec` khởi chạy và bắt tay) dùng được cả lệnh trực tiếp lẫn shim, với đường dẫn có dấu và khoảng trắng, trong config dir tạm, không dùng account thật. Hai client gửi protocol khác nhau (`2025-11-25`, `2025-06-18`).
  - Ràng buộc: giữ fuse `RunAsNode`. Đề xuất đăng ký qua shim ở `<userData>/bin/`, AgentHub viết lại khi khởi động.
- **Chốt hướng Phase 3 ([ADR-019](decisions/019-agent-maintained-context.md), 2026-11-04):** người dùng chốt sau khi thảo luận.
  - **Context do agent viết** qua bốn skill (`context-init`, `context-resume`, `context-checkpoint`, `context-capture`) và MCP server của AgentHub; AgentHub không đọc nội dung chat, không tự soạn tóm tắt, chỉ có thao tác "Thêm handoff".
  - **Tài liệu tuỳ chọn theo project**, khuôn theo bộ `AgentContext/` người dùng dùng ở dự án Unity trước; mặc định lưu trong dữ liệu AgentHub, chọn đường dẫn trong repo nghĩa là đưa vào repo. `CLAUDE.md`/`AGENTS.md` chỉ là con trỏ, chỉ sửa khi tài liệu nằm trong repo và qua diff được duyệt (đóng ADR-011).
  - **AgentHub không quản lý task:** bỏ bảng `tasks` (chỉ có dữ liệu thử). Project quản lý folder, cài đặt tài liệu, quyền account, lịch sử mở, Git, skill đã cài.
  - **Không có tài liệu** vẫn chuyển được bằng bản tóm tắt lưu thành lịch sử handoff; chat không thuộc project vào mục "Chat rời". Fallback transcript cho chat có folder khi phiên cũ hết quota, chỉ trỏ đường dẫn.
  - **Tài liệu đã sửa:** TDD 0.1.13 (§0, §1, §2.1, §4.5, §6, §7, §8, §9, §13, §15–17), DEVELOPMENT, ROADMAP, ADR index. Bỏ checkpoint editor, wizard Smart Switch và scenario A–D; exit criteria mới là bảy scenario ở TDD §9.4.
- **Giao diện theo phong cách Claude/Codex Desktop (2026-11-02):** theo góp ý của người dùng.
  - **Khung:** thanh tiêu đề ẩn trên macOS, sidebar sát đèn giao thông và kéo được cửa sổ; bảng màu trung tính ấm cho cả sáng và tối; tiêu đề trang dùng font serif; icon SVG nội bộ, không thêm dependency.
  - **Dropdown:** thay `<select>` và `<details>` bằng menu và disclosure tự viết (`renderer/src/ui.tsx`). Menu cách nút mở 6px, rộng ít nhất bằng nút, tự lật lên trên khi thiếu chỗ, có phím mũi tên, Escape trả focus về nút. Nội dung mở rộng thụt vào dưới chữ của tiêu đề.
  - **Account:** bỏ ô tên gợi nhớ, tên là email (ghi chú ở ADR-018). Mỗi account hiện "App chính" hoặc "Cửa sổ riêng". Chọn account cho task bằng menu có avatar, email và loại cửa sổ.
  - **Mở từ account:** account nằm ở cuối sidebar và trong Cài đặt, mở được Desktop hoặc Terminal không cần task. Desktop mở app hoặc cửa sổ của account mà không gửi lệnh mở folder; Terminal mở ở thư mục home. Không có project nên không hỏi quyền project và không ghi lịch sử, vì lịch sử gắn với task. Vẫn giữ định tuyến tránh cửa sổ account khác và xác nhận version chưa kiểm chứng.
  - **Kiểm chứng:** 194 unit test, có test mới cho mở không project ở launcher và use case; 22 bài E2E, có bài mới đo vị trí menu so với nút mở và kiểm tra focus. Đã xem ảnh chụp ở giao diện sáng và tối với dữ liệu mẫu. Người dùng xem trên `.app` và báo UI ổn (reported). Chưa thử mở từ account với Claude và Codex thật.
- **Sửa lỗi mở nhầm cửa sổ Desktop (2026-11-02):** người dùng báo khi cửa sổ account B đang chạy một mình, mở account A lại ra B. Nguyên nhân: macOS giao `open -b` và link cho instance khởi động sớm nhất, nên `claude --desktop` và `codex app` đi nhầm ([evidence](../spikes/07-desktop-account-switch/evidence/2026-11-02-macos-instance-routing.md)). Giờ nếu instance sớm nhất là cửa sổ account khác thì app chính được mở bằng `open -n -a` hoặc đưa đúng PID lên trước, và người dùng tự chọn folder. Bấm mở cửa sổ đang chạy cũng đưa nó lên trước; không gọi `open -n` lại vì Claude sinh process trùng. Cảnh báo đăng nhập lần đầu giờ áp dụng cho mọi cửa sổ khác, không chỉ app chính. Người dùng thử trên `.app` với account Claude và Codex thật và báo chạy đúng (reported).
- **Đăng nhập và tên account ([ADR-018](decisions/018-account-login-and-identity.md), 2026-11-02):**
  - **Tên:** account hiện theo email do CLI báo, Codex lấy qua `codex app-server`. Alias thành tên gợi nhớ tuỳ chọn; migration 3 bỏ các tên tự đặt `Claude 2`, ... và thêm cột `account_email`.
  - **Chọn account:** nếu máy đang đăng nhập, app hiện email và hỏi dùng account đó hay đăng nhập account khác, không tự nhận nữa. Đăng nhập chạy CLI ở nền, mở trang trong cửa sổ riêng tư, tự cập nhật khi xong; có Mở lại, Dùng trình duyệt thường, Sao chép link, Huỷ. Huỷ khi đang thêm thì gỡ luôn account đó. Không lấy được địa chỉ trang thì quay về Terminal.
  - **Kiểm chứng:** xem mục Phase 2 bên dưới và [evidence](../spikes/05-account-mapping/evidence/2026-11-02-macos-login-and-identity.md). Đã chạy `.app` với CLI thật và browser giả: đúng email, đúng địa chỉ trang, Huỷ và thoát không để lại process. Đã xem ảnh chụp UI ở giao diện sáng.
- **Làm lại UX theo góp ý của người dùng (2026-11-02):**
  - **Thêm account:** bấm Thêm, chọn Claude hoặc Codex, rồi đăng nhập bằng flow chính thức; app tự theo dõi đến khi đăng nhập xong. Account đầu tiên của mỗi loại dùng cấu hình sẵn có của máy; các account sau được tự tạo thư mục trong `~/.agenthub/accounts/<id>/`. Đường dẫn chỉ hiện trong "Thông tin kỹ thuật".
  - **Giao diện:** cột trái là cây project và task giống Claude/Codex; tạo task chỉ cần gõ tiêu đề. Một account có hai nút mở, Desktop và Terminal; app chỉ hỏi lại khi cần quyết định (lần đầu ghép account với project, version chưa kiểm chứng, lần đầu đăng nhập cửa sổ Desktop). Khác với FR-011 và TDD §3.4: khi không có gì cần quyết định thì không hiện kế hoạch trước khi mở, các bước thủ công hiện ở kết quả sau khi mở.
  - **Hướng sản phẩm:** người dùng xác nhận không xây lại khung chat; nếu sau này cần thì chọn CLI nhúng trong app (ghi ở ADR-009). ADR-003 và ADR-007 không đổi.
- **Phase 2 (2026-11-01, macOS):**
  - **Profile:** alias, provider, thư mục cấu hình CLI, thư mục dữ liệu Desktop tuỳ chọn (FR-003); không lưu secret. Từ chối cấu hình trùng, instance thiếu một trong hai thư mục, và thư mục dữ liệu mặc định của app. Có nút kiểm tra trạng thái và đăng nhập trong Terminal; hai profile Claude cùng account thì có cảnh báo, so bằng hash.
  - **Launcher 4 target:** Claude và Codex, Desktop và CLI ngang hàng, không chọn sẵn (FR-004–007). Trước khi mở có kế hoạch ghi rõ từng bước tự động, có điều kiện hay thủ công. CLI mở trong Terminal.app (ADR-009); instance theo ADR-013, ADR-014; `claude --desktop` qua pty, có kiểm tra login trước và sau, lỗi thì quay về mở app và chọn folder tay.
  - **Quyền project–profile (FR-016):** cặp mới phải được cho phép rõ ràng; cặp bị từ chối thì không mở được, kiểm tra ở Main.
  - **Lịch sử:** ghi mỗi lần mở, kể cả thất bại. Kết quả không bao giờ là `switched`; account là `Account chưa xác minh` cho đến khi người dùng xác nhận (FR-014).
  - **Kiểm chứng (sau khi sửa mở nhầm cửa sổ, 2026-11-02):** 187 test; 21 bài E2E chạy trên `.app`; 2 bài native trên `.app` mở Terminal.app và instance Claude Desktop thật, với CLI giả, từ env nhiễm: chỉ có biến allowlist, cwd đúng với path hostile, Desktop chính không đổi. Test chạy thật đã bắt lỗi `status` là biến chỉ đọc trong zsh.
- **Phase 1 (2026-11-01, macOS):**
  - **Tính năng:** thêm, đổi tên, chọn lại folder, gỡ Project; tạo và sửa Task (FR-001, FR-002); context Markdown cho project và task, gồm `task.md`, `decisions.md` (FR-008); settings: giao diện, thư mục dữ liệu, thông tin phiên bản.
  - **Dữ liệu:** migration 1 trong SQLite, có backup trước khi nâng schema và từ chối database mới hơn app; artifact theo TDD §6.3, ghi atomic, phát hiện xung đột bằng checksum (FR-013).
  - **Bảo vệ:** validate mọi payload IPC bằng zod và kiểm tra sender; single-instance lock; hỏi trước khi bỏ nội dung chưa lưu.
  - **Kiểm chứng:** 62 test và 10 bài E2E chạy trên bản build và trên `.app`, gồm exit criteria (thêm project, tạo task, sửa context, restart, path có dấu, khoảng trắng, dấu nháy, `$(...)`). Đã xem ảnh chụp UI ở cả hai giao diện. Người dùng mở `.app` từ Finder, dùng bộ chọn folder thật, tạo task, sửa context, thoát rồi mở lại và báo chạy tốt (reported).
- **Technical bootstrap (2026-11-01):** npm workspaces cho app và sáu package, TypeScript strict, ESLint kiểm tra package boundaries, Vitest, electron-vite, electron-builder, better-sqlite3 với runner migration. Đường Renderer → Preload → Main → persistence → SQLite chạy được ở dev và trong `.app`; người dùng mở `.app` bằng double-click trong Finder và thấy đúng dữ liệu (reported). Versions và kết quả kiểm chứng ở [ADR-016](decisions/016-workspace-and-build-tooling.md); lệnh ở [DEVELOPMENT](DEVELOPMENT.md#lệnh-phát-triển).
- [Exit review Phase 0 trên macOS](feasibility.md#exit-review) (2026-11-01): đạt, có điều kiện. Cả bốn scenario của TDD §9.4 có đường chạy khả thi, mỗi capability không tự động có fallback, không còn giả định chặn workflow. Điều kiện launcher ghi ở TDD §5.2.
- Người dùng chốt các quyết định trước bootstrap (2026-11-01): [ADR-009](decisions/009-external-terminal.md) terminal ngoài, Terminal.app trên macOS; [ADR-016](decisions/016-workspace-and-build-tooling.md) npm workspaces, electron-vite, electron-builder; [ADR-017](decisions/017-mvp-git-observations.md) Git MVP chỉ đọc branch, HEAD SHA, dirty; TDD §16: Code tab là chính, công cụ cá nhân.
- Đưa TDD vào `docs/TDD.md` làm bản chính, hiện là revision 0.1.6.
- Ghi [ADR-015](decisions/015-macos-first-delivery.md) (2026-10-30): người dùng chọn làm macOS trước; gate Phase 0–3 đánh giá trên macOS, Windows thành milestone riêng (Windows parity).
- Ghi [ADR-013](decisions/013-claude-desktop-account-instances.md) (2026-10-30): người dùng chọn đưa account instance của Claude Desktop vào MVP, ở dạng opt-in, `conditional`, có manual fallback.
- Ghi [ADR-014](decisions/014-codex-profiles.md) (2026-10-30): người dùng chọn đưa nhiều profile Codex qua `CODEX_HOME` vào MVP, cho cả CLI và instance ChatGPT.app riêng, cùng mô hình opt-in, `conditional`; TDD §3.3 được sửa theo.
- Ghi nhận hướng C — Hybrid, Desktop/CLI ngang hàng, macOS/Windows.
- Tạo bộ tài liệu ban đầu, Codex/Claude entrypoints và `.gitignore`.
- Tạo cấu trúc app, sáu package, scripts và spikes; các thư mục nguồn trống được giữ bằng `.gitkeep`.
- Ghi nhận package boundaries trong ADR-012; mỗi app/package có README mô tả trách nhiệm.
- Chốt ngôn ngữ tài liệu: tiếng Việt, tên file và thuật ngữ kỹ thuật tiếng Anh.
- Review cấu trúc (2026-10-30): CLAUDE.md nạp AGENTS.md qua `@AGENTS.md`; README chỉ tóm tắt cấu trúc và dẫn đến TDD §4.3; thêm `.gitattributes` cho line endings; chốt evidence đã làm sạch ở `spikes/<spike-name>/evidence/`; Git/Unity observer thuộc `platform` (ADR-012 amendment); branch prefix mặc định đổi thành `agent/`.

## Phase 0 — tiến độ (2026-10-30)

- **macOS inventory:** macOS 26.5.1 arm64, Claude CLI 2.1.295, codex-cli 0.155.1 (cả hai cài qua npm trong nvm), Claude Desktop 4.29.0; chi tiết trong [feasibility.md](feasibility.md). Không đọc config hoặc credential directories.
- **SPIKE-06 — Pass (personal scope, người dùng xác nhận 2026-11-01):** [evidence](../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md). Điểm chính:
  - `CLAUDE_CONFIG_DIR` là cơ chế chính thức cho nhiều Claude account song song; Keychain entry trên macOS gắn theo config dir.
  - Claude Desktop có cơ chế chính thức để mở workspace và chuyển session CLI (`claude --desktop`, `--resume`, `claude://code/new?q=`); không có cơ chế chọn account, nên ADR-006 vẫn đúng cho account. (Đính chính 2026-10-30: bản review đầu ghi sai là không có.)
  - Claude Code chỉ đọc `AGENTS.md` khi không có `CLAUDE.md`; layout `CLAUDE.md` import `@AGENTS.md` là cách để cả hai agent dùng chung. Codex giới hạn instructions mặc định 32 KiB.
  - Codex không có multi-account được tài liệu hoá; tách bằng `CODEX_HOME` là giả thuyết cần spike bổ sung.
- **SPIKE-04 (macOS):** [evidence](../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md).
  - Codex CLI Pass: cả ba fixture trả đúng token `AGENTS.md`, bỏ qua `CLAUDE.md`, không dùng tool đọc file.
  - Claude CLI Pass (2.1.314, người dùng chạy sau khi đăng nhập Pro): tự đọc `AGENTS.md` khi không có `CLAUDE.md`, chỉ đọc `CLAUDE.md` khi có cả hai, import `@AGENTS.md` nạp cả hai. CLI và Desktop giữ login riêng; CLI tự cập nhật từ 2.1.295 trong ngày.
  - Claude Desktop 4.29.0 Pass (người dùng chạy thủ công, reported): Code tab nạp instructions giống CLI; Chat không nạp, trả `NONE`. [Evidence](../spikes/04-project-instructions/evidence/2026-10-30-macos-claude-desktop.md).
  - Codex Desktop Pass (reported): đọc `AGENTS.md`, bỏ qua `CLAUDE.md`.
- **SPIKE-01 (macOS) — Pass:** [evidence](../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md).
  - Hai profile (`~/.claude` và `CLAUDE_CONFIG_DIR` riêng) dùng hai account khác nhau; instructions và session tách nhau, resume chéo bị từ chối; chạy song song được; login không đổi sau khi chạy.
  - Browser tái sử dụng phiên claude.ai khi đăng nhập profile mới; luồng tạo profile phải kiểm tra account sau khi đăng nhập.
  - Mô phỏng GUI: không tìm thấy CLI qua PATH mặc định; `zsh -ilc` tìm được; Codex cần thêm `node` vào PATH.
- **SPIKE-02 (macOS) — Pass (reported):** [evidence](../spikes/02-claude-desktop-launcher/evidence/2026-10-30-macos.md).
  - `claude --desktop` mở đúng folder; `--resume` mở đúng session CLI; `claude://code/new?q=` điền sẵn prompt, không chọn được folder.
  - Chọn account là manual: phải logout/login trong app.
  - `claude --desktop` từ chối khi stdout là pipe hoặc `/dev/null` (exit 1). Electron Main không gọi trực tiếp được qua `child_process` thông thường; dưới pty lệnh được chấp nhận nhưng harness Python bị treo, chưa có kết luận.
- **SPIKE-03 (macOS) — Pass (reported):** [evidence](../spikes/03-codex-desktop-launcher/evidence/2026-10-30-macos.md).
  - ChatGPT.app là Codex Desktop; `codex app PATH` mở workspace với thread mới.
  - Chọn account là manual; resume chưa kiểm tra.
  - Phát hiện cho launcher: env của phiên agent host (~30 biến `CLAUDE_*`/`ANTHROPIC_*`) lọt vào child process nếu không lọc, nên platform adapter phải dựng env từ allowlist; `config.toml` cá nhân của Codex (model không hỗ trợ, MCP server localhost) làm `codex exec` thất bại, nên launcher phải hiển thị lỗi cấu hình thay vì báo launch thành công.
- **SPIKE-05 (macOS) — Pass (reported):** [evidence](../spikes/05-account-mapping/evidence/2026-10-30-macos.md).
  - `claude auth status` báo được account theo profile; `codex login status` chỉ báo phương thức; account trên Desktop do người dùng xác nhận.
  - Mở Desktop từ profile B không đổi account của app, nên profile CLI không phải cách đổi account Desktop.
  - Session của profile B không mở được trong Desktop đang dùng alias A: người dùng báo lỗi session đã bị remove, trong khi CLI vẫn exit 0. Chưa tách được nguyên nhân do account hay do config root. Launcher không được dùng exit code để báo đã đổi account hoặc đã resume.
- **SPIKE-07 (macOS) — Pass (reported):** [evidence](../spikes/07-desktop-account-switch/evidence/2026-10-30-macos.md).
  - Mở Desktop với `--user-data-dir` riêng: account B và A chạy song song, chat tách nhau, đăng nhập được giữ sau khi mở lại, không cần terminal. Cơ chế không có trong tài liệu.
  - Code tab dùng account của instance. Config và session đi theo `CLAUDE_CONFIG_DIR`: thiếu biến này, account B nạp `CLAUDE.md` và ghi session vào `~/.claude` của account A; có biến thì tách hẳn sang profile B.
  - Đăng nhập lần đầu phải tắt Desktop chính, vì callback từ browser về Desktop chính. `claude://` và `--desktop --resume` cũng về Desktop chính khi nó đang chạy, nên cửa sổ thứ hai phải tự chọn folder.
- **SPIKE-08 (macOS) — CLI Pass, Desktop Pass (reported):** [evidence](../spikes/08-codex-profile-isolation/evidence/2026-10-30-macos.md).
  - `CODEX_HOME` riêng tách được account Business (A) và Free (B): login, `AGENTS.md` của profile và session đều tách; resume chéo bị từ chối; chạy song song được. Logout B không ảnh hưởng A.
  - Đăng nhập bằng mã bị chặn với account Business cho đến khi admin bật. Browser tái sử dụng phiên chatgpt.com nên lần đầu B vào nhầm A; cửa sổ riêng tư xử lý được.
  - `codex login status` không báo account nào, nên account Codex chỉ do người dùng xác nhận qua `/status`. CLI tự cập nhật từ 0.155.1 lên 0.166.0 trong ngày.
  - Codex Desktop: instance thứ hai mở với `--user-data-dir` và `CODEX_HOME` của B đã đăng nhập sẵn B, không cần đăng nhập trong app; app chính vẫn là A; login giữ sau khi mở lại. `codex app` vẫn mở folder ở app chính.
- **SPIKE-09 (macOS, 2026-11-01) — Pass (process observed, màn hình reported):** [evidence](../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md). App Electron 45.2.1 đóng gói thành `.app`, ký ad hoc, người dùng mở từ Finder.
  - Người dùng xác nhận: `--desktop` và `codex app` mở đúng folder, deep link điền sẵn prompt, instance đúng account B, `/status` đúng account B trong Terminal.app. Login của instance Codex B qua được bản cập nhật ChatGPT.app.
  - `open` chuyển env của process gọi sang app được mở, và `ppid=1` không chứng minh env sạch. Launcher phải gọi `open` với env allowlist. Từ app mang 33 biến của provider, instance Desktop chỉ nhận đúng biến profile.
  - Với env sạch, không CLI nào có trên `PATH`; `zsh -lc` cũng không thấy. `zsh -ilc` (khoảng 450 ms) và quét thư mục nvm tìm được cả hai. Codex cần thư mục của executable trên `PATH`.
  - `open -n --env` chạy được từ Electron cho cả Claude và ChatGPT với path có dấu và khoảng trắng; tìm và tắt được instance theo PID; instance mặc định không đổi.
  - `claude --desktop` bị từ chối khi dùng pipe, được chấp nhận qua `/usr/bin/script` với exit 0 sau 1,3 giây và không bị treo; không cần native module.
  - **Rủi ro còn mở, chưa rõ nguyên nhân:** profile A của Claude CLI mất đăng nhập; người dùng không tự đăng xuất. Keychain item được ghi cùng giây với lần `--desktop` qua pty đầu tiên (12:23:23 UTC), và sau đó `auth status` báo `loggedIn: false`; profile B và Codex không bị. Sau khi người dùng đăng nhập lại, bốn lần `--desktop` (Terminal.app, `script`, Electron) đều giữ login và Keychain không đổi. Kết quả này chỉ áp dụng cho token mới và rất có thể cho CLI 2.1.316 (sự cố xảy ra trên 2.1.314); chưa loại trừ `--desktop` khi token đã cũ. Launcher cần kiểm tra login trước và sau.
  - Daemon của Codex trong `CODEX_HOME` của B vẫn chạy sau khi CLI thoát; exit status của CLI không có nghĩa là profile đã hết process nền.
  - CLI tương tác mở được trong Terminal.app qua file `.command` dùng một lần, đúng cwd và profile, an toàn với path chứa dấu nháy và `$(...)`, còn chạy sau khi app thoát, có exit status qua file. Không có handle của cửa sổ Terminal.

## Kiểm chứng

- Đã kiểm tra 200 local links/anchors trong 45 tài liệu Markdown (2026-11-02): không có đích thiếu. Mọi file đang theo dõi dùng LF (kiểm tra 2026-10-30).
- `setup-fixtures.sh` đã chạy thử: tạo đúng ba variant, từ chối thư mục cha có instruction files và thư mục không phải fixture.
- Các kiểm tra này chỉ xác nhận tài liệu/harness; không phải build, kiểm thử sản phẩm hoặc evidence tích hợp provider.

## Chưa thực hiện hoặc kiểm chứng

- **Nguyên nhân profile A của Claude CLI mất đăng nhập ở SPIKE-09;** cần chạy lại `check-desktop-login.sh` khi token đã cũ.
- SPIKE-09 dùng app ký ad hoc, chưa thử luồng notarize và quarantine; mở CLI chỉ thử với Terminal.app.
- Chưa kiểm tra resume trong cùng profile cho Claude CLI và Codex CLI; chưa kiểm tra giới hạn độ dài của tham số `q`.
- Kết quả Desktop ở SPIKE-02/03/04/05/07/08/09 là `reported`: người dùng báo, không có ảnh chụp. SPIKE-04 trên Claude Desktop đo ở 4.29.0, chưa chạy lại trên 4.4212.0.
- Windows: toàn bộ `Not run`, hoãn theo ADR-015.
- Chưa thử hot reload khi sửa code, máy không có toolchain build, và build trên Windows.
- **Chưa chạy launcher với account và CLI thật:** native smoke dùng CLI giả và thư mục rỗng. Chưa xác nhận: `claude --desktop` từ app sản phẩm, instance đúng account B, `/status`.
- **Đăng nhập với account thật (ADR-018):** người dùng báo đã ổn (reported, 2026-11-03), chưa có evidence ghi lại; chưa xác nhận riêng việc đăng nhập lại đè lên login cũ.
- Giới hạn của Phase 1: project đã gỡ chưa khôi phục được trong app; Context Editor chưa có preview và history (TDD §9.1); chưa có log có rotation (TDD §11.3).
- Mở account không cần task chưa thử với app thật; lần mở này không có trong lịch sử.
- Giới hạn của Phase 2: email chỉ nói về login của CLI, và chỉ cập nhật khi app đọc lại trạng thái; AgentHub không tắt được cửa sổ Desktop đã mở; đường dẫn account chưa tách theo thiết bị; chỉ hỗ trợ Terminal.app; đọc exit status của CLI để P1 (FR-105). Account Claude phụ cần đăng nhập hai lần nếu dùng cả Terminal và Desktop, vì hai bên giữ login riêng (SPIKE-04, SPIKE-07).
- Chưa triển khai gì của Phase 3 (ADR-019): skill, MCP server, tài liệu context, mô hình Project mới, Git observation, fallback transcript. Điều kiện 4 của ADR-019 đạt (SPIKE-10), điều kiện 1 đạt ở CLI và TUI (SPIKE-11, Codex app chưa thử), điều kiện 2 đạt và điều kiện 3 đạt có điều kiện (SPIKE-12: Chat cần mỗi account một instance), điều kiện 5 đạt (SPIKE-13), điều kiện 6 đạt có điều kiện (SPIKE-14: tránh `~/.agents/skills`), điều kiện 7 đạt (SPIKE-15). SPIKE-10 chưa thử agent gọi tool thật, client GUI, app notarize hoặc hardened runtime.

## Quyết định còn mở

- ADR-010: minimum Windows version; chuyển sang milestone Windows parity (ADR-015).
- Đổi account nhanh trên Desktop (mục tiêu chính của người dùng): đã chốt trên macOS cho Claude Desktop (ADR-013) và Codex Desktop (ADR-014); Windows thuộc milestone Windows parity.
- Đề xuất sửa ADR-013 và ADR-014 cho version Desktop chưa có evidence: cho người dùng tick xác nhận từng lần mở thay vì chỉ có manual flow. Đã triển khai, chờ người dùng chấp thuận.

## Bước tiếp theo

Chỉ macOS (ADR-015):

1. **Triển khai Phase 3** (bảy điều kiện của ADR-019 đã có spike SPIKE-10 đến SPIKE-15; các mục "Chưa xác minh" trong evidence kiểm tra khi triển khai phần liên quan) theo thứ tự ở TDD §13: mô hình Project và migration bỏ `tasks` → skill và lời nhắc khi mở (thử trước với tài liệu trong repo của dự án Unity cũ) → MCP → hiển thị task và cảnh báo → không tài liệu và Chat rời → fallback transcript. Trước khi bắt đầu, xem các thay đổi chưa commit.
2. **Kiểm tra lại rủi ro login của SPIKE-09:** khi token của profile A đã cũ (ít nhất một ngày sau lần đăng nhập 2026-11-01 12:54 UTC), chạy `spikes/09-electron-launcher-prototype/check-desktop-login.sh script` một lần; người dùng cần sẵn sàng đăng nhập lại. Việc này không chặn bootstrap, vì vẫn có fallback chọn folder thủ công, và launcher sản phẩm cần kiểm tra login trước và sau khi chạy `--desktop`. Ghi kết quả vào evidence của spike.
3. **Người dùng thử usage limit trên `.app`** (`npm run package`) với các account thật, kể cả cửa sổ riêng; ghi kết quả vào evidence SPIKE-16. Khi Claude CLI đổi version lớn, chạy lại lệnh ở README SPIKE-16 vì `/usage` trả văn bản.
4. Các profile và thư mục dữ liệu dùng cho spike vẫn được giữ; lệnh dọn dẹp nằm trong README của SPIKE-01, SPIKE-07, SPIKE-08 và SPIKE-09.

## Bàn giao cho phiên tiếp theo

Đọc feasibility.md và evidence SPIKE-06 trước khi chạy spike khác. Raw output đặt trong `spikes/<spike-name>/local/` (ignored); chỉ chuyển bản đã làm sạch vào `evidence/`. Không đọc hoặc sao chép credential stores; người dùng tự đăng nhập.
