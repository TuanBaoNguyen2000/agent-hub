# Domain

**Status:** Scaffold only. Chưa có source implementation hoặc package manifest.

## Trách nhiệm

Entities, value objects và business rules cho Project, Task, AccountProfile, Checkpoint, Handoff và LaunchAttempt. Giữ các invariant và domain validation ở đây; không suy ra trạng thái account/session khi thiếu bằng chứng.

## Boundary

- Không phụ thuộc package nội bộ khác.
- Không import Electron, React, Node filesystem/process, SQLite hoặc provider CLI implementation.
- Không chứa transport DTOs hoặc IPC handlers; chúng thuộc contracts và Electron Main.
- Application sử dụng domain; các adapter map dữ liệu lưu trữ hoặc kết quả bên ngoài sang kiểu cần thiết.

## Kiểm chứng dự kiến

Unit tests cho invariant, trạng thái và quy tắc nghiệp vụ; không yêu cầu khởi chạy Electron hoặc provider app. Chỉ tạo test khi có logic thực tế.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §4](../../docs/TDD.md#4-architecture-overview).
