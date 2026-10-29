# Feasibility spikes

**Status:** Chưa có harness và chưa chạy spike nào.

Code thử nghiệm Phase 0 nằm ở đây, tách khỏi app/package sản phẩm. Mỗi spike có thư mục riêng, ví dụ `spikes/01-claude-profile-isolation/`; chỉ tạo khi bắt đầu thử nghiệm tương ứng.

Một spike cần README ghi objective, pass criteria, OS/tool versions, prerequisites, cách chạy và link evidence. Có thể dùng tooling tối thiểu riêng khi cần; lựa chọn đó chưa quyết định tooling sản phẩm.

Output local hoặc chứa thông tin nhạy cảm đặt ở `spikes/<spike-name>/local/` và được `.gitignore` loại khỏi Git. Evidence an toàn để chia sẻ phải được làm sạch và ghi vào hoặc dẫn từ [feasibility.md](../docs/feasibility.md).

Không import spike code từ app/package sản phẩm. Chỉ chuyển ý tưởng hoặc implementation đã review vào package phù hợp khi qua phase gate và có kiểm thử cần thiết.

Xem [Development guide](../docs/DEVELOPMENT.md) và [Feasibility plan](../docs/feasibility.md).
