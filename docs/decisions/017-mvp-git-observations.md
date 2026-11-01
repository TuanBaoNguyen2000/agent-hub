# ADR-017 — Minimum Git observations in MVP

**Status:** Accepted  
**Date:** 2026-11-01  
**Decision source:** Người dùng chọn "Chốt theo đề xuất" sau exit review Phase 0 trên macOS.

## Context

TDD §7, §9 và §10 cần branch và SHA để kiểm tra context, nên Scenario D (TDD §9.4) phải cảnh báo khi chúng thay đổi. Trong khi đó §2.2 và §13 đặt Git/Unity mở rộng ở P1. Hai phần này chưa khớp nhau.

## Decision

1. **MVP chỉ đọc:** repo root (để chạy lệnh đúng chỗ), branch hiện tại, HEAD SHA và trạng thái dirty/clean.
2. **MVP dùng các giá trị đó** để ghi vào checkpoint và cảnh báo khi branch hoặc SHA khác với checkpoint mới nhất (Scenario D).
3. **Chuyển sang P1 (Phase 4):** tên file đã đổi, diff summary, phát hiện Unity version, phân biệt Editor và worktree.
4. Mọi lệnh Git đều chỉ đọc, chạy qua allowlist, theo ADR-008 và TDD §10.2. Implementation nằm trong `platform` theo ADR-012.

## Consequences

- Phase 3 có thêm Git observation tối thiểu, vì checkpoint và handoff cần nó.
- Checkpoint của MVP không tự liệt kê file đã đổi; mục "Files to inspect" do agent hoặc người dùng điền.
- Project không phải Git repo vẫn dùng được, với observation là `unknown` và không có cảnh báo.
- Cần kiểm thử trên repo sạch, repo dirty, detached HEAD và thư mục không phải Git repo khi triển khai.

## Related decisions

ADR-008 (read-only observation), [ADR-012](012-initial-package-boundaries.md) (Git observer trong `platform`).
