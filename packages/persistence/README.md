# Persistence

**Status:** Có SQLite (better-sqlite3), migration 1–4, backup trước khi nâng schema và tests. Migration 4 bỏ bảng `tasks` (ADR-019). Context store của Phase 1 đã bỏ cùng Context Editor; ghi tài liệu có checksum sẽ quay lại cùng thao tác "Thêm handoff" và MCP.

## Trách nhiệm

Triển khai application ports cho SQLite metadata, migrations và Markdown/YAML artifact store. Quản lý transaction, revision/conflict handling, atomic writes và recovery theo TDD.

## Boundary

- Dependencies nội bộ: application và domain.
- Không import UI, Electron APIs hoặc provider adapters.
- Nhận đường dẫn runtime từ composition root; không dùng source repo làm primary database/artifact store.
- Không lưu provider credentials hoặc native chat databases.
- Schema thực tế nằm trong `src/migrations.ts`; khác biệt so với draft ghi ở TDD §6.2.

## Kiểm chứng dự kiến

Integration tests trên temporary storage cho migrations, restart durability, concurrent writes, orphan artifacts và path Unicode/spaces. Kiểm thử phải có dữ liệu fixture riêng, không đọc runtime data của người dùng.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §6](../../docs/TDD.md#6-local-storage--data-model).
