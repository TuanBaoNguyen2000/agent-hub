# ADR-012 — Initial package boundaries

**Status:** Accepted  
**Date:** 2026-10-29  
**Decision source:** Người dùng xác nhận tách `packages/` ngay từ đầu và đồng ý cấu trúc repository trong phiên chuẩn bị project.

## Context

TDD v0.1.0 đề xuất monorepo nhưng để mở thời điểm tách package. AgentHub cần giữ nghiệp vụ độc lập với Electron UI, filesystem, persistence và provider/OS adapters. Người dùng chọn tạo package boundaries ngay từ repository foundation.

## Decision

Tạo `apps/desktop` và sáu package:

- `domain`: entities, value objects và business rules.
- `application`: use cases, orchestration và ports.
- `contracts`: IPC DTOs, events và validation schemas dùng chung cho Main/Preload/Renderer.
- `persistence`: SQLite, migrations và artifact store.
- `integrations`: Claude/Codex Desktop/CLI launchers và capability mapping.
- `platform`: macOS/Windows process, app/folder và terminal adapters; read-only Git/Unity observation adapters (bổ sung 2026-10-30).

Electron Main là composition root. Các adapter triển khai port của application; integrations nhận platform port qua dependency injection. Domain và contracts không phụ thuộc các package khác. Renderer/Preload dùng contracts; quyền truy cập hệ thống được giữ ở Main.

Quy tắc dependency chi tiết được duy trì ở [DEVELOPMENT.md](../DEVELOPMENT.md). Cấu trúc được phản ánh ở [TDD §4.3](../TDD.md#43-folderrepository-structure-agreed).

## Consequences

- Có ranh giới module ngay từ đầu và vị trí rõ cho logic có thể kiểm thử độc lập với UI.
- Workspace tooling và dependency checks được chốt ở [ADR-016](016-workspace-and-build-tooling.md); boundaries được kiểm tra bằng ESLint.
- Foundation chỉ tạo thư mục và tài liệu; manifests, dependencies và mã sản phẩm được thêm ở technical bootstrap.
- Không gộp logic provider với OS; không đưa domain entities hoặc quyền Node APIs sang Renderer.
- Spike code tách trong `spikes/`; chỉ đưa vào package sản phẩm sau review và kiểm thử phù hợp.
- Chưa bổ sung package mới hoặc tách nhỏ hơn khi chưa có nhu cầu cụ thể.

## Amendment — 2026-10-30

Git/Unity Observer trong TDD §4.1 chưa có package triển khai. Người dùng chọn đặt implementation trong `platform` thay vì thêm package mới, vì observer chủ yếu chạy Git CLI và đọc file của project. `application` định nghĩa observation port; `platform` triển khai adapter chỉ đọc, tuân theo ADR-008 và TDD §10.2. Phạm vi Git observation trong MVP so với P1 được chốt ở [ADR-017](017-mvp-git-observations.md).

## Related decisions

[TDD §15](../TDD.md#15-architecture-decision-records-adrs): ADR-001 (stack), ADR-002 (Desktop/CLI parity), ADR-004 (storage), ADR-005 (Smart Switch) và ADR-008 (read-only observation).
