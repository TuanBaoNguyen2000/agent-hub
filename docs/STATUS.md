# Project status

**Updated:** 2026-10-30  
**Stage:** Repository foundation complete; Phase 0 not started  
**Application:** Chưa có implementation hoặc build có thể chạy

## Đã hoàn thành

- Đưa TDD vào `docs/TDD.md` làm bản chính, revision 0.1.1.
- Ghi nhận hướng C — Hybrid, Desktop/CLI ngang hàng, macOS/Windows.
- Tạo bộ tài liệu ban đầu, Codex/Claude entrypoints và `.gitignore`.
- Tạo cấu trúc app, sáu package, scripts và spikes; các thư mục nguồn trống được giữ bằng `.gitkeep`.
- Ghi nhận package boundaries trong ADR-012; mỗi app/package có README mô tả trách nhiệm.
- Chốt ngôn ngữ tài liệu: tiếng Việt, tên file và thuật ngữ kỹ thuật tiếng Anh.
- Review cấu trúc (2026-10-30): CLAUDE.md nạp AGENTS.md qua `@AGENTS.md`; README chỉ tóm tắt cấu trúc và dẫn đến TDD §4.3; thêm `.gitattributes` cho line endings; chốt evidence đã làm sạch ở `spikes/<spike-name>/evidence/`; Git/Unity observer thuộc `platform` (ADR-012 amendment); branch prefix mặc định đổi thành `agent/`.

## Kiểm chứng repository foundation

- Đã kiểm tra 68 local links/anchors trong 20 tài liệu Markdown sau review cấu trúc 2026-10-30: không có đích thiếu. Mọi file đang theo dõi đều dùng LF, nên `.gitattributes` không làm thay đổi line endings hiện có.
- Đã kiểm tra 13 thư mục theo cấu trúc đã chốt và tính đồng nhất hướng dẫn ở AGENTS/CLAUDE.
- TDD chỉ còn một bản chính; chưa có package manifest hoặc dependency được cài.
- Đã kiểm tra `.gitignore`: bỏ qua file OS, output, env secrets và spike local data; vẫn cho phép env examples, lockfiles và tài liệu/evidence đã làm sạch.
- Các kiểm tra này chỉ xác nhận tài liệu/scaffold; không phải build, kiểm thử sản phẩm hoặc evidence tích hợp provider.

## Chưa thực hiện hoặc kiểm chứng

- Chưa chạy feasibility spike; mọi capability thực tế còn `Not run` trong [feasibility.md](feasibility.md).
- Chưa khởi tạo workspace manifests, package manager, build tool hay dependencies.
- Chưa có UI, IPC implementation, database, migration hoặc launcher sản phẩm.
- Chưa chạy build, unit/integration/E2E hoặc smoke test trên macOS/Windows.
- Chưa xác minh provider version, authentication mode, profile isolation hoặc Desktop launch/resume.

## Quyết định còn mở

- Tooling: package manager, build/packaging tool, runtime và dependency versions. Nếu chọn electron-builder, xem lại mục `build/` trong `.gitignore`.
- ADR-009: terminal lifecycle và external/embedded terminal.
- ADR-010: minimum Windows version; Windows 11 x64 là test target ban đầu của TDD.
- ADR-011: chi tiết context export policy.
- Các câu hỏi sản phẩm và môi trường ở TDD §16; ghi rõ giả định khi chạy spike.
- Phân định Git observations tối thiểu trong MVP và Git/Unity mở rộng ở P1: TDD §7/§9/§10 yêu cầu branch/SHA để kiểm tra context, trong khi §2/§13 đặt phần Git/Unity rộng hơn ở P1. Cần chốt phạm vi này trước khi lập implementation tasks cho Phase 1–3.

## Bước tiếp theo

1. Kiểm kê môi trường và phiên bản công cụ phục vụ Phase 0, không đọc provider credential stores.
2. Chạy SPIKE-01–SPIKE-06 theo [feasibility plan](feasibility.md), bắt đầu từ máy macOS hiện tại.
3. Bổ sung bằng chứng trên Windows; nếu chưa có môi trường thì giữ mục Windows chưa kiểm thử, không đánh dấu Phase 0 đã pass.
4. Tổng hợp capability matrix và manual fallback; chốt các quyết định ảnh hưởng bootstrap.
5. Sau khi đạt exit criteria Phase 0, khởi tạo tooling và triển khai Phase 1.

## Bàn giao cho phiên tiếp theo

Đọc DEVELOPMENT, TDD §3/§13 và feasibility plan. Công việc kế tiếp thuộc Phase 0; sự hiện diện của app/package directories không có nghĩa đã bắt đầu implementation. Người dùng đã duyệt cấu trúc repository; chưa chọn tooling và chưa yêu cầu chạy thử tích hợp trong bước repository foundation.
