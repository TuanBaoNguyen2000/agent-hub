# Contracts

**Status:** Scaffold only. Chưa có source implementation, validation library hoặc package manifest.

## Trách nhiệm

Hợp đồng IPC dùng chung giữa Electron Main, Preload và Renderer: request/response DTOs, events, error payloads và transport validation schemas. Đây là hợp đồng dữ liệu, không phải thư viện nghiệp vụ.

## Boundary

- Không phụ thuộc package nội bộ khác, Electron APIs hoặc Node APIs.
- Không chứa database entities, credentials, process handles hay service implementations.
- Electron Main map domain/application results sang DTO; validate payload tại privileged boundary.
- Domain validation vẫn thuộc domain; schema IPC không thay thế business rules.
- Không quyết định thư viện validation hoặc channel implementation trước technical bootstrap.

## Kiểm chứng dự kiến

Schema checks cho payload không hợp lệ, unknown channels và dữ liệu vượt phạm vi API. Khi có tooling, kiểm tra Renderer/Preload không import package có quyền hệ thống.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §4.5](../../docs/TDD.md#45-typed-ipc-proposal).
