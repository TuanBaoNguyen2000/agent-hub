# Architecture Decision Records

Giữ mã ADR ổn định; phân biệt quyết định đã chốt với lựa chọn còn mở. ADR-001–ADR-011 được ghi ban đầu tại [TDD §15](../TDD.md#15-architecture-decision-records-adrs); chỉ tách thành file riêng khi quyết định cần chi tiết, như ADR-009.

## Danh mục

| ID | Quyết định | Trạng thái | Nguồn |
|---|---|---|---|
| ADR-001 | Electron + React + TypeScript | Accepted | TDD §15 |
| ADR-002 | Hybrid Desktop/CLI parity | Accepted | TDD §15 |
| ADR-003 | Không xây lại chat UI | Accepted | TDD §15 |
| ADR-004 | SQLite + Markdown local-first | Accepted | TDD §15 |
| ADR-005 | Rules-based Smart Switch | Accepted; sửa đổi bởi ADR-019 (không còn wizard) | TDD §15 |
| ADR-006 | Manual fallback cho Desktop account switching | Accepted for MVP; sửa đổi bởi ADR-013 (Claude Desktop) và ADR-014 (Codex Desktop) | TDD §15 |
| ADR-007 | Không direct inference API/SDK trong MVP | Accepted | TDD §15 |
| ADR-008 | Git read-only observation trước | Accepted | TDD §15 |
| ADR-009 | Terminal ngoài cho CLI; macOS dùng Terminal.app | Accepted for MVP | [009-external-terminal.md](009-external-terminal.md) |
| ADR-010 | Minimum Windows version | Open; chuyển sang milestone Windows parity (ADR-015) | TDD §15 |
| ADR-011 | Context export policy | Accepted 2026-11-04; nội dung ở ADR-019 mục 2 và 9 | TDD §15, [019-agent-maintained-context.md](019-agent-maintained-context.md) |
| ADR-012 | Tách package ngay từ đầu | Accepted | [012-initial-package-boundaries.md](012-initial-package-boundaries.md) |
| ADR-013 | Instance Claude Desktop riêng cho mỗi account phụ | Accepted for MVP (opt-in, conditional) | [013-claude-desktop-account-instances.md](013-claude-desktop-account-instances.md) |
| ADR-014 | Nhiều profile Codex qua `CODEX_HOME`, CLI và Desktop | Accepted for MVP (opt-in, conditional) | [014-codex-profiles.md](014-codex-profiles.md) |
| ADR-015 | macOS trước, Windows thành milestone riêng | Accepted | [015-macos-first-delivery.md](015-macos-first-delivery.md) |
| ADR-016 | npm workspaces, electron-vite, electron-builder | Accepted; đã kiểm chứng trên macOS | [016-workspace-and-build-tooling.md](016-workspace-and-build-tooling.md) |
| ADR-017 | Git observation tối thiểu trong MVP | Accepted | [017-mvp-git-observations.md](017-mvp-git-observations.md) |
| ADR-018 | Đăng nhập qua cửa sổ riêng tư, tên account theo email | Accepted for MVP (conditional) | [018-account-login-and-identity.md](018-account-login-and-identity.md) |
| ADR-019 | Context do agent duy trì qua tài liệu, skill và MCP của AgentHub | Accepted for MVP (conditional, chờ spike); sửa đổi một phần bởi ADR-020, ADR-021 | [019-agent-maintained-context.md](019-agent-maintained-context.md) |
| ADR-020 | Sửa Phase 3 theo đánh giá của người dùng | Accepted; mục 1 (chỗ đặt màn Công cụ agent) sửa đổi bởi ADR-029 | [020-phase3-review-changes.md](020-phase3-review-changes.md) |
| ADR-021 | AgentHub quản lý tài liệu và task của project | Accepted | [021-task-and-document-management.md](021-task-and-document-management.md) |
| ADR-022 | Bố cục cửa sổ theo kiểu Claude/Codex Desktop và IDE | Accepted; mục 2–3 sửa đổi bởi ADR-029 | [022-desktop-shell-layout.md](022-desktop-shell-layout.md) |
| ADR-023 | Thêm project có hỏi tài liệu, màn Task theo trạng thái, panel Tài liệu | Accepted; mục 4 sửa đổi bởi ADR-027 | [023-project-setup-tasks-and-panels.md](023-project-setup-tasks-and-panels.md) |
| ADR-024 | Chuyển việc một nút và trạng thái tiến độ | Accepted; mục 3 (hộp thoại chuyển account) và mục 10 (tự mở account quen dùng) bỏ theo góp ý 2026-11-10, ghi ở ADR-029 | [024-one-click-handoff-and-progress-state.md](024-one-click-handoff-and-progress-state.md) |
| ADR-025 | Hook, file chỉ dẫn cấp account và trạng thái agent đang chạy | Open; chờ spike S1–S3 | [Danh sách việc 2026-11-09](../plans/2026-11-09-context-flow-backlog.md) mục A–C |
| ADR-026 | Cấu trúc skill và quản lý skill trong AgentHub | Accepted; mục 9 sửa đổi bởi ADR-028 | [026-skill-structure-and-management.md](026-skill-structure-and-management.md) |
| ADR-027 | Số task không trùng, file task là nguồn trạng thái, dẫn link tài liệu có sẵn của repo | Accepted; sửa đổi ADR-023 mục 4 | [027-task-numbers-state-source-and-existing-docs.md](027-task-numbers-state-source-and-existing-docs.md) |
| ADR-028 | Làm tiếp task bằng một câu ngắn trong cửa sổ chat bất kỳ (`context_here`, `context_task`, định tuyến câu ngắn, lời nhắc ngắn, checkpoint giữa chừng, Lệnh nhanh, báo thiếu skill) | Accepted 2026-11-10; sửa đổi ADR-026 mục 9 | [028-resume-with-one-sentence.md](028-resume-with-one-sentence.md) |
| ADR-029 | Công cụ agent thành mục chính: dòng ở thanh bên, trang tổng quan mọi account, trang từng account, Cài đặt còn ba tab | Accepted 2026-11-10; sửa đổi ADR-020 mục 1, ADR-022 mục 2–3 | [029-agent-tools-as-main-area.md](029-agent-tools-as-main-area.md) |

Kết quả capability cần evidence trong [feasibility.md](../feasibility.md), kể cả khi quyết định kiến trúc đã Accepted.

## Cách ghi quyết định mới

- Dùng số tiếp theo, tên file `NNN-short-english-title.md`.
- Ghi ít nhất: status, ngày, context, decision, consequences và references/evidence.
- Quyết định đang thảo luận có status `Proposed` hoặc `Open`; chỉ ghi `Accepted` khi đã được chốt.
- Nếu thay thế quyết định cũ, dẫn đến ADR thay thế và giữ lịch sử; không tái sử dụng mã cũ.
- Cập nhật index và phần TDD liên quan trong cùng thay đổi; nguồn chính của ADR mới là file ADR đó.
