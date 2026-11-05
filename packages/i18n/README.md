# i18n

**Status:** Bảng dịch `vi` (bảng gốc), `en`, `ko` theo khoá phẳng (`launch.openDesktop`) có tham số `{name}`; `translate`, `msg`, `raw`, `joinMessages`, định dạng ngày giờ theo locale (ADR-020 mục 6). Bảng `ko` do máy viết, **chưa có người đọc tiếng Hàn rà lại**.

## Trách nhiệm

- Mọi chữ AgentHub hiển thị, kể cả thông báo từ Main và các package, đi theo khoá. Backend trả `Message` (`{ key, params }`); renderer dịch theo ngôn ngữ giao diện. Main tự dịch những gì nó hiển thị trực tiếp (hộp thoại).
- Lời nhắc gửi cho agent (`prompt.*`) dịch theo **ngôn ngữ trò chuyện**, không theo ngôn ngữ giao diện; ngoài tiếng Anh thì thêm câu yêu cầu trả lời bằng ngôn ngữ đó. Skill giữ tiếng Anh.
- `raw(text)` cho chữ không dịch: email, kết quả của CLI, lần mở cũ ghi trước ADR-020 mục 6.

## Boundary

Không import package nội bộ nào; mọi tầng dùng được. Không dùng Node hay Electron API.

## Thêm hoặc sửa chữ

Thêm khoá vào `src/locales/vi.ts`, rồi vào `en.ts` và `ko.ts`: TypeScript báo thiếu hoặc thừa khoá, và `tests/tables.test.ts` kiểm tra ba bảng có cùng khoá, cùng tham số và không có chữ rỗng.
