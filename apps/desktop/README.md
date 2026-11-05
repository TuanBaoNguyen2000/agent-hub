# Desktop application

**Status:** Có danh sách Project, cài đặt tài liệu context theo project, settings, account, launch và lịch sử mở theo project; bốn skill `context-*` ở `skills/` (đóng gói ra `Contents/Resources/skills`); MCP server ở `src/mcp/` (build ra `out/main/mcp.js`); trang project có task đọc từ tài liệu, cảnh báo và "Thêm handoff"; handoff cho project không có tài liệu và màn Chat rời; mục Công cụ agent trong Cài đặt; tab Task (xem, sửa, tạo, đổi trạng thái, "Nhờ agent") và tab Tài liệu (ADR-021). `tests/` có integration test nối các adapter thật, `tests/e2e/` có E2E trên cửa sổ Electron. Lệnh chạy ở [Development guide](../../docs/DEVELOPMENT.md#lệnh-phát-triển).

Đây là entrypoint ứng dụng desktop cho macOS/Windows, dùng các package nghiệp vụ và hạ tầng trong repository.

## Cấu trúc

| Thư mục | Trách nhiệm |
|---|---|
| `src/main/` | Electron lifecycle, typed IPC handlers, DTO mapping, composition root và kết nối adapter |
| `src/preload/` | API contextBridge giới hạn theo contracts |
| `src/renderer/` | React UI, presentation state và gọi Preload API |
| `tests/` | Kiểm thử tích hợp app, IPC boundary và E2E khi có implementation |

Main kết nối domain/application với persistence, integrations và platform. Preload/Renderer chỉ import package contracts; Renderer không truy cập Node, database, filesystem hoặc process. UI phải phân biệt `appOpened`, `workspaceOpened`, `sessionStarted` và `userActionRequired` theo capability/evidence thực tế.

Khi bootstrap, áp dụng TypeScript strict, Electron context isolation, giới hạn preload API và các yêu cầu ở TDD §11/§14. Cấu hình và lệnh cụ thể sẽ được bổ sung sau Phase 0.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD](../../docs/TDD.md), [ADR-012](../../docs/decisions/012-initial-package-boundaries.md).
