# Project status

**Updated:** 2026-10-30  
**Stage:** Phase 0 in progress — macOS: SPIKE-01–07 xong; còn toàn bộ Windows  
**Application:** Chưa có implementation hoặc build có thể chạy

## Đã hoàn thành

- Đưa TDD vào `docs/TDD.md` làm bản chính, revision 0.1.1.
- Ghi nhận hướng C — Hybrid, Desktop/CLI ngang hàng, macOS/Windows.
- Tạo bộ tài liệu ban đầu, Codex/Claude entrypoints và `.gitignore`.
- Tạo cấu trúc app, sáu package, scripts và spikes; các thư mục nguồn trống được giữ bằng `.gitkeep`.
- Ghi nhận package boundaries trong ADR-012; mỗi app/package có README mô tả trách nhiệm.
- Chốt ngôn ngữ tài liệu: tiếng Việt, tên file và thuật ngữ kỹ thuật tiếng Anh.
- Review cấu trúc (2026-10-30): CLAUDE.md nạp AGENTS.md qua `@AGENTS.md`; README chỉ tóm tắt cấu trúc và dẫn đến TDD §4.3; thêm `.gitattributes` cho line endings; chốt evidence đã làm sạch ở `spikes/<spike-name>/evidence/`; Git/Unity observer thuộc `platform` (ADR-012 amendment); branch prefix mặc định đổi thành `agent/`.

## Phase 0 — tiến độ (2026-10-30)

- **macOS inventory:** macOS 26.5.1 arm64, Claude CLI 2.1.295, codex-cli 0.155.1 (cả hai cài qua npm trong nvm), Claude Desktop 4.29.0; chi tiết trong [feasibility.md](feasibility.md). Không đọc config hoặc credential directories.
- **SPIKE-06 — Pass (personal scope, giả định):** [evidence](../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md). Điểm chính:
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

## Kiểm chứng

- Đã kiểm tra 111 local links/anchors trong 35 tài liệu Markdown (2026-10-30): không có đích thiếu. Mọi file đang theo dõi dùng LF.
- `setup-fixtures.sh` đã chạy thử: tạo đúng ba variant, từ chối thư mục cha có instruction files và thư mục không phải fixture.
- Các kiểm tra này chỉ xác nhận tài liệu/harness; không phải build, kiểm thử sản phẩm hoặc evidence tích hợp provider.

## Chưa thực hiện hoặc kiểm chứng

- Toàn bộ Windows chưa chạy. Dòng Codex CLI trong capability matrix phần lớn còn `Not run`.
- Kết quả Desktop ở SPIKE-02/03/04/05 là `reported`: người dùng báo, không có ảnh chụp. SPIKE-04 trên Claude Desktop đo ở 4.29.0, chưa chạy lại trên 4.4212.0.
- Chưa thử Desktop đăng nhập alias B rồi mở session của profile B; chưa kiểm tra nhận diện account trên Codex Desktop.
- Chưa kiểm tra launcher qua pty từ Node/Electron và giới hạn độ dài của tham số `q`.
- Chưa có môi trường Windows.
- Chưa khởi tạo workspace manifests, package manager, build tool hay dependencies.
- Chưa có UI, IPC implementation, database, migration hoặc launcher sản phẩm.

## Quyết định còn mở

- Tooling: package manager, build/packaging tool, runtime và dependency versions. Nếu chọn electron-builder, xem lại mục `build/` trong `.gitignore`.
- ADR-009: terminal lifecycle và external/embedded terminal.
- ADR-010: minimum Windows version; Windows 11 x64 là test target ban đầu của TDD.
- ADR-011: chi tiết context export policy. SPIKE-06 gợi ý ghi `AGENTS.md` và để `CLAUDE.md` import, giới hạn theo 32 KiB của Codex.
- TDD §16: đang giả định Code tab (câu 1) và personal use (câu 3); cần người dùng xác nhận.
- Codex multi-account: thêm spike `CODEX_HOME` hay ghi `manual` trong MVP.
- Đổi account nhanh trên Desktop là mục tiêu chính của người dùng, nhưng hiện là manual trên cả hai app; SPIKE-05 xác nhận profile CLI không giúp được việc này. [SPIKE-07](../spikes/07-desktop-account-switch/README.md) cho thấy thư mục dữ liệu riêng cộng `CLAUDE_CONFIG_DIR` đổi được account cho cả Chat lẫn Code tab. Cơ chế không có trong tài liệu; văn bản điều khoản đã đọc không cấm rõ, cũng không cho phép rõ. Chờ người dùng quyết định có cập nhật ADR-006 để đưa vào MVP không.
- Phân định Git observations tối thiểu trong MVP và Git/Unity mở rộng ở P1: TDD §7/§9/§10 yêu cầu branch/SHA để kiểm tra context, trong khi §2/§13 đặt phần Git/Unity rộng hơn ở P1.

## Bước tiếp theo

1. Người dùng quyết định cập nhật ADR-006 theo SPIKE-07 và có làm spike `CODEX_HOME` không. Lệnh dọn dẹp profile B và thư mục dữ liệu nằm trong README của SPIKE-01 và SPIKE-07.
2. Bổ sung bằng chứng trên Windows; nếu chưa có môi trường thì giữ mục Windows `Not run`, không đánh dấu Phase 0 đã pass.
3. Tổng hợp capability matrix và manual fallback; chốt các quyết định ảnh hưởng bootstrap.

## Bàn giao cho phiên tiếp theo

Đọc feasibility.md và evidence SPIKE-06 trước khi chạy spike khác. Raw output đặt trong `spikes/<spike-name>/local/` (ignored); chỉ chuyển bản đã làm sạch vào `evidence/`. Không đọc hoặc sao chép credential stores; người dùng tự đăng nhập.
