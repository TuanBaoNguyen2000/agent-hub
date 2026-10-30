# Architecture Decision Records

Giữ mã ADR ổn định; phân biệt quyết định đã chốt với lựa chọn còn mở. ADR-001–ADR-011 được ghi ban đầu tại [TDD §15](../TDD.md#15-architecture-decision-records-adrs); chưa tách thành các file riêng để tránh sao chép nội dung.

## Danh mục

| ID | Quyết định | Trạng thái | Nguồn |
|---|---|---|---|
| ADR-001 | Electron + React + TypeScript | Accepted | TDD §15 |
| ADR-002 | Hybrid Desktop/CLI parity | Accepted | TDD §15 |
| ADR-003 | Không xây lại chat UI | Accepted | TDD §15 |
| ADR-004 | SQLite + Markdown local-first | Accepted | TDD §15 |
| ADR-005 | Rules-based Smart Switch | Accepted | TDD §15 |
| ADR-006 | Manual fallback cho Desktop account switching | Accepted for MVP; sửa đổi bởi ADR-013 cho Claude Desktop | TDD §15 |
| ADR-007 | Không direct inference API/SDK trong MVP | Accepted | TDD §15 |
| ADR-008 | Git read-only observation trước | Accepted | TDD §15 |
| ADR-009 | External/embedded terminal | Open | TDD §15 |
| ADR-010 | Minimum Windows version | Open | TDD §15 |
| ADR-011 | Context export policy | Open | TDD §15 |
| ADR-012 | Tách package ngay từ đầu | Accepted | [012-initial-package-boundaries.md](012-initial-package-boundaries.md) |
| ADR-013 | Instance Claude Desktop riêng cho mỗi account phụ | Accepted for MVP (opt-in, conditional) | [013-claude-desktop-account-instances.md](013-claude-desktop-account-instances.md) |

Các lựa chọn tooling chưa chốt không được suy ra từ ADR-001. Kết quả capability cần evidence trong [feasibility.md](../feasibility.md), kể cả khi quyết định kiến trúc đã Accepted.

## Cách ghi quyết định mới

- Dùng số tiếp theo, tên file `NNN-short-english-title.md`.
- Ghi ít nhất: status, ngày, context, decision, consequences và references/evidence.
- Quyết định đang thảo luận có status `Proposed` hoặc `Open`; chỉ ghi `Accepted` khi đã được chốt.
- Nếu thay thế quyết định cũ, dẫn đến ADR thay thế và giữ lịch sử; không tái sử dụng mã cũ.
- Cập nhật index và phần TDD liên quan trong cùng thay đổi; nguồn chính của ADR mới là file ADR đó.
