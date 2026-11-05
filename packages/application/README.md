# Application

**Status:** Có ports, `createWorkspace` và `createLaunchService` cho Project, cài đặt tài liệu context, settings, profile, quyền và launch. Chưa có skill, MCP, lời nhắc khi mở, handoff.

## Trách nhiệm

Use cases quản lý Project, cài đặt tài liệu context, lời nhắc và cảnh báo khi mở account (ADR-019). Task, checkpoint và handoff nằm trong tài liệu do agent viết; AgentHub chỉ đọc và thêm handoff. Định nghĩa ports cho repository, artifact store, observations, launcher và platform services khi use case cần chúng.

## Boundary

- Dependency nội bộ: domain.
- Không import persistence, integrations, platform, Electron, React hoặc transport contracts.
- Nhận adapter qua dependency injection; Electron Main khởi tạo và kết nối implementation.
- Smart Switch dùng rules và capability inputs, không gọi model APIs.
- AgentHub không tự soạn nội dung context; launch failure không làm mất handoff đã có.

## Kiểm chứng dự kiến

Use-case tests với fake ports cho allowlist, context revision/staleness, handoff và launch decision table. Phân biệt observed/reported/verified và không suy ra session ready từ app opened.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §7–§8](../../docs/TDD.md#7-context-tài-liệu-và-handoff).
