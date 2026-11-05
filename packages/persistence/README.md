# Persistence

**Status:** Có SQLite (better-sqlite3), migration 1–6, backup trước khi nâng schema và tests. Migration 4 bỏ bảng `tasks` (ADR-019); migration 6 thêm skill riêng và "Tự cài khi mở" theo account (ADR-020). Có đọc, ghi tài liệu context cho MCP (đường dẫn giới hạn trong folder, checksum, ghi atomic, chèn handoff) catalog chỉ-đọc theo account, đọc lại task, trạng thái, handoff từ tài liệu, kho ghi chú cho handoff không tài liệu và Chat rời, và định vị session gần nhất theo folder (fallback transcript).

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
