# Documentation map

Tài liệu hiện viết bằng tiếng Việt, giữ tên file và thuật ngữ kỹ thuật bằng tiếng Anh. Khi chuyển sang tiếng Anh, giữ đường dẫn ổn định để bảo toàn liên kết và instruction entrypoints.

## Thứ tự đọc

1. [README của repository](../README.md): sản phẩm và trạng thái tổng quan.
2. [STATUS.md](STATUS.md): những gì đã thực hiện, chưa kiểm chứng và bước tiếp theo.
3. [TDD.md](TDD.md): yêu cầu và thiết kế dự kiến.
4. [DEVELOPMENT.md](DEVELOPMENT.md): cách làm việc trong repo.
5. [ROADMAP.md](ROADMAP.md): milestone và exit criteria.
6. [feasibility.md](feasibility.md): kế hoạch kiểm chứng Phase 0.
7. [ADR index](decisions/README.md): quyết định đã chốt và các mục còn mở.

## Nguồn chính cho từng loại thông tin

| Nội dung | Nơi cập nhật chính |
|---|---|
| Product scope, FR/NFR, kiến trúc và acceptance requirements | TDD.md |
| Quyết định kiến trúc mới | ADR trong decisions/; cập nhật index và phần TDD liên quan |
| Các milestone và điều kiện chuyển phase | ROADMAP.md, tham chiếu TDD §13 |
| Tiến độ thực tế, blocker và bàn giao hiện tại | STATUS.md |
| Quy tắc phát triển và package dependencies | DEVELOPMENT.md |
| Capability đã kiểm thử theo OS/provider/version | feasibility.md cùng evidence được dẫn từ đó |
| Hướng dẫn cục bộ của app/package | README trong thư mục tương ứng |

TDD là thiết kế dự kiến, không phải báo cáo tính năng đã chạy. STATUS là bản bàn giao hiện tại, không phải nhật ký toàn bộ các phiên. ROADMAP không chứa lịch hoặc cam kết thời gian khi chưa có ước lượng.

Chưa tách `REQUIREMENTS.md`: yêu cầu vẫn nằm ở TDD §1–§2 để tránh hai bản khác nhau. Template checkpoint/handoff của sản phẩm sẽ được bổ sung ở phase liên quan; runtime artifact store không nằm trong `docs/`.
