# Domain

**Status:** Có Project (kèm cài đặt tài liệu context), AccountProfile, LaunchAttempt, mã lỗi và quy tắc nhãn, path. Không có Task: task nằm trong tài liệu do agent viết (ADR-019).

## Trách nhiệm

Entities, value objects và business rules cho Project, AccountProfile và LaunchAttempt. Giữ các invariant và domain validation ở đây; không suy ra trạng thái account/session khi thiếu bằng chứng.

## Boundary

- Chỉ phụ thuộc `@agenthub/i18n`: lỗi và thông báo mang khoá dịch (`DomainError.detail`), không mang chữ (ADR-020 mục 6).
- Không import Electron, React, Node filesystem/process, SQLite hoặc provider CLI implementation.
- Không chứa transport DTOs hoặc IPC handlers; chúng thuộc contracts và Electron Main.
- Application sử dụng domain; các adapter map dữ liệu lưu trữ hoặc kết quả bên ngoài sang kiểu cần thiết.

## Kiểm chứng dự kiến

Unit tests cho invariant, trạng thái và quy tắc nghiệp vụ; không yêu cầu khởi chạy Electron hoặc provider app. Chỉ tạo test khi có logic thực tế.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §4](../../docs/TDD.md#4-architecture-overview).
