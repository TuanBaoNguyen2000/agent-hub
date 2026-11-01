# Application

**Status:** Có ports và use case `createWorkspace` cho Project, Task, context, settings. Chưa có Smart Switch, handoff, launcher.

## Trách nhiệm

Use cases quản lý Project/Task/context, checkpoint/handoff và Smart Switch planning. Định nghĩa ports cho repository, artifact store, observations, launcher và platform services khi use case cần chúng.

## Boundary

- Dependency nội bộ: domain.
- Không import persistence, integrations, platform, Electron, React hoặc transport contracts.
- Nhận adapter qua dependency injection; Electron Main khởi tạo và kết nối implementation.
- Smart Switch dùng rules và capability inputs, không gọi model APIs.
- Context được lưu trước launch; launch failure không làm mất handoff đã tạo.

## Kiểm chứng dự kiến

Use-case tests với fake ports cho allowlist, context revision/staleness, handoff và launch decision table. Phân biệt observed/reported/verified và không suy ra session ready từ app opened.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §7–§8](../../docs/TDD.md#7-context-checkpoints-and-handoffs).
