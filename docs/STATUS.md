# Project status

**Updated:** 2026-10-30  
**Stage:** Phase 0 in progress — macOS inventory xong, SPIKE-06 pass (personal scope), SPIKE-04 pass trừ Codex Desktop  
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
  - Claude Desktop không có deep link/CLI được tài liệu hoá để mở folder/session; củng cố ADR-006.
  - Claude Code chỉ đọc `AGENTS.md` khi không có `CLAUDE.md`; layout `CLAUDE.md` import `@AGENTS.md` là cách để cả hai agent dùng chung. Codex giới hạn instructions mặc định 32 KiB.
  - Codex không có multi-account được tài liệu hoá; tách bằng `CODEX_HOME` là giả thuyết cần spike bổ sung.
- **SPIKE-04 (macOS):** [evidence](../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md).
  - Codex CLI Pass: cả ba fixture trả đúng token `AGENTS.md`, bỏ qua `CLAUDE.md`, không dùng tool đọc file.
  - Claude CLI Pass (2.1.314, người dùng chạy sau khi đăng nhập Pro): tự đọc `AGENTS.md` khi không có `CLAUDE.md`, chỉ đọc `CLAUDE.md` khi có cả hai, import `@AGENTS.md` nạp cả hai. CLI và Desktop giữ login riêng; CLI tự cập nhật từ 2.1.295 trong ngày.
  - Claude Desktop 4.29.0 Pass (người dùng chạy thủ công, reported): Code tab nạp instructions giống CLI; Chat không nạp, trả `NONE`. [Evidence](../spikes/04-project-instructions/evidence/2026-10-30-macos-claude-desktop.md).
  - Codex Desktop chờ SPIKE-03.
  - Phát hiện cho launcher: env của phiên agent host (~30 biến `CLAUDE_*`/`ANTHROPIC_*`) lọt vào child process nếu không lọc, nên platform adapter phải dựng env từ allowlist; `config.toml` cá nhân của Codex (model không hỗ trợ, MCP server localhost) làm `codex exec` thất bại, nên launcher phải hiển thị lỗi cấu hình thay vì báo launch thành công.

## Kiểm chứng

- Đã kiểm tra 74 local links/anchors trong 23 tài liệu Markdown (2026-10-30): không có đích thiếu. Mọi file đang theo dõi dùng LF.
- `setup-fixtures.sh` đã chạy thử: tạo đúng ba variant, từ chối thư mục cha có instruction files và thư mục không phải fixture.
- Các kiểm tra này chỉ xác nhận tài liệu/harness; không phải build, kiểm thử sản phẩm hoặc evidence tích hợp provider.

## Chưa thực hiện hoặc kiểm chứng

- SPIKE-01, 02, 03, 05 chưa chạy; SPIKE-04 còn phần Codex Desktop. Capability matrix phần lớn còn `Not run`.
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
- Phân định Git observations tối thiểu trong MVP và Git/Unity mở rộng ở P1: TDD §7/§9/§10 yêu cầu branch/SHA để kiểm tra context, trong khi §2/§13 đặt phần Git/Unity rộng hơn ở P1.

## Bước tiếp theo

1. SPIKE-02/03: kiểm tra mở Claude Desktop và xác nhận ChatGPT.app (`com.openai.codex`) có phải Codex Desktop; sau đó chạy phần Codex Desktop của SPIKE-04.
2. SPIKE-01/05: người dùng đăng nhập profile thứ hai qua `CLAUDE_CONFIG_DIR` riêng; kiểm tra cả executable resolution khi không chạy từ terminal (CLI nằm trong nvm).
3. Bổ sung bằng chứng trên Windows; nếu chưa có môi trường thì giữ mục Windows `Not run`, không đánh dấu Phase 0 đã pass.
4. Tổng hợp capability matrix và manual fallback; chốt các quyết định ảnh hưởng bootstrap.

## Bàn giao cho phiên tiếp theo

Đọc feasibility.md và evidence SPIKE-06 trước khi chạy spike khác. Raw output đặt trong `spikes/<spike-name>/local/` (ignored); chỉ chuyển bản đã làm sạch vào `evidence/`. Không đọc hoặc sao chép credential stores; người dùng tự đăng nhập.
