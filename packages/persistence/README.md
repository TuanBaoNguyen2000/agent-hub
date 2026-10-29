# Persistence

**Status:** Scaffold only. Chưa có source implementation, SQLite driver, migration hoặc package manifest.

## Trách nhiệm

Triển khai application ports cho SQLite metadata, migrations và Markdown/YAML artifact store. Quản lý transaction, revision/conflict handling, atomic writes và recovery theo TDD.

## Boundary

- Dependencies nội bộ: application và domain.
- Không import UI, Electron APIs hoặc provider adapters.
- Nhận đường dẫn runtime từ composition root; không dùng source repo làm primary database/artifact store.
- Không lưu provider credentials hoặc native chat databases.
- Schema trong TDD là draft; chưa có migration được áp dụng.

## Kiểm chứng dự kiến

Integration tests trên temporary storage cho migrations, restart durability, concurrent writes, orphan artifacts và path Unicode/spaces. Kiểm thử phải có dữ liệu fixture riêng, không đọc runtime data của người dùng.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [TDD §6](../../docs/TDD.md#6-local-storage--data-model).
