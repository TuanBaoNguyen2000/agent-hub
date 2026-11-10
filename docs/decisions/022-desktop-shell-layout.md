# ADR-022 — Bố cục cửa sổ theo kiểu Claude/Codex Desktop và IDE

**Status:** Accepted (người dùng yêu cầu 2026-11-06)  
**Date:** 2026-11-06  
**Decision source:** Người dùng đánh giá giao diện (2026-11-06): "muốn AgentHub có thiết kế UI tương tự Claude/Codex Desktop hay là các IDE": thanh bên ẩn/hiện được và có chuyển Project/Chat, Cài đặt là popup nhiều tab, khung bên phải là nơi làm việc chính, chữ hướng dẫn tự nhiên hơn. Sửa đổi bố cục của [ADR-020](020-phase3-review-changes.md) bước 1 (cột trái hai phần, Cài đặt là một trang).

> **Sửa đổi:** [ADR-029](029-agent-tools-as-main-area.md) (2026-11-10) thêm dòng Công cụ agent và trang account vào thanh bên (mục 2); Cài đặt chỉ còn tab Chung, Account, Nâng cao (mục 3).

## Context

- Sau ADR-020 bước 1, cột trái có hai phần cố định (Project, Ghi chú) và danh sách account; Cài đặt là một trang dài gồm Chung, Account, Công cụ agent, Nâng cao; trang project là một cột giữa rộng tối đa 880px với tiêu đề lớn và tab.
- Tab Task và Tài liệu là danh sách bên cạnh chi tiết, nên cột giữa hẹp làm cả hai bị chật.
- Phạm vi sản phẩm không có chat UI (DEVELOPMENT, TDD §1.4), nên khung chính của AgentHub không phải khung chat như Claude/Codex, mà là vùng làm việc với project.

## Decision

1. **Thanh tiêu đề ngang cửa sổ:** nút ẩn/hiện thanh bên (⌘B), tên và đường dẫn của project hay ghi chú đang mở. Kéo cửa sổ từ thanh này.
2. **Thanh bên ẩn được**, nhớ trạng thái trên máy (localStorage, chỉ là tiện ích). Trên cùng là công tắc **Project | Ghi chú**, rồi nút thêm mục của chế độ đó, danh sách, cuối cùng là account (kèm usage) và Cài đặt. Mở một project thì chuyển sang chế độ Project, mở một ghi chú thì sang Ghi chú.
3. **Cài đặt là hộp thoại** (⌘, hoặc nút Cài đặt), tab dọc: Chung, Account, Công cụ agent, MCP server, Nâng cao. Các chỗ trước đây dẫn tới trang Cài đặt (Quản lý account, Mở Công cụ agent, Chi tiết MCP) mở hộp thoại ở đúng tab. Lỗi trong hộp thoại hiện trong hộp thoại.
4. **Khung bên phải là vùng làm việc:** trang project có thanh tab sát trên (Tổng quan, Task, Tài liệu, Handoff, Lịch sử, Cài đặt) và menu ⋯. Task và Tài liệu chiếm hết chiều cao, chia hai pane (danh sách, chi tiết) với thanh cuộn riêng như editor; khi khung hẹp thì xếp dọc. Các tab còn lại là trang cuộn, rộng tối đa 880px. Đổi tên project chuyển vào tab Cài đặt của project.
5. Chữ giao diện tiếng Việt được viết lại cho ngắn và tự nhiên; khoá dịch không đổi trừ các khoá mới.

## Consequences

- Không có thay đổi dữ liệu, IPC hay migration; chỉ renderer.
- E2E mở Cài đặt bằng ⌘, và chọn tab (`settings()`), đóng hộp thoại trước khi thao tác trên cửa sổ (`closeSettings()`); ghi chú cần bật công tắc Ghi chú.
- Vẫn chưa có: kéo đổi bề rộng pane, nhiều tab tài liệu mở cùng lúc, tìm kiếm trong thanh bên.

## Evidence

- `npm run check` pass (391 test), `npm run test:e2e -- workspace` pass 28/28 (2026-11-06). Đã xem ảnh chụp tab Tổng quan, Task, Tài liệu (có và không có thanh bên), chế độ Ghi chú và các tab Cài đặt.
