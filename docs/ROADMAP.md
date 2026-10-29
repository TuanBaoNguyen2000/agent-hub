# Roadmap

**Updated:** 2026-10-29  
**Nguồn thiết kế:** [TDD §13](TDD.md#13-implementation-plan-and-acceptance-gates)

Các milestone dưới đây theo quan hệ phụ thuộc, không phải lịch thực hiện. Trạng thái thực tế nằm ở [STATUS.md](STATUS.md). Chỉ chuyển phase khi có bằng chứng đáp ứng exit criteria; fallback được chấp nhận phải được ghi rõ, không biến capability chưa kiểm thử thành supported.

| Milestone | Deliverables | Exit criteria |
|---|---|---|
| Repository foundation | Documentation map, agent entrypoints, package skeleton và ADR-012 | Cấu trúc đã chốt được phản ánh thống nhất; không có lệnh chạy hoặc tính năng được báo có khi chưa tồn tại |
| Phase 0 — Feasibility | Version inventory, capability matrix, evidence, isolated spikes | SPIKE-01–06 có kết quả và giới hạn rõ ràng trên OS liên quan; fallback được ghi nhận; không còn giả định chặn workflow |
| Phase 1 — Shell and data | Workspace tooling, Electron UI, Project/Task CRUD, SQLite migrations, artifact store, settings | Trên Mac/Windows: thêm project, tạo task, sửa context và restart không mất dữ liệu; path Unicode/spaces hoạt động |
| Phase 2 — Desktop/CLI launchers | Profile manager, bốn launcher adapters, platform adapters, launch history | Desktop/CLI cùng flow; hai Claude CLI profiles độc lập; Desktop account chưa xác minh hiển thị đúng trạng thái |
| Phase 3 — Checkpoint and Handoff | Editor, handoff generator, Smart Switch, copy/open context và manual confirmation | Scenarios A–D ở TDD §9.4 có evidence; không dùng direct model APIs; đây là mốc MVP complete |
| Phase 4 — Git/Unity context (P1) | Git observations mở rộng, Unity version detection, stale warnings | Branch/SHA và changed files đúng; cảnh báo context cũ; không sửa file Unity |
| Phase 5 — Robustness (P1) | Backup/restore, diagnostics, hotkeys, context export, optional terminal integration | Recovery và migration checks có evidence; packaging/signing theo chiến lược phát hành đã chốt |
| Phase 6 — Expansion (P2) | Những khả năng mới đã được duyệt | Chỉ lập kế hoạch khi có nhu cầu và capability validation; chưa cam kết triển khai |

## Công việc gần nhất

- Thực hiện Phase 0 theo [feasibility.md](feasibility.md).
- Chốt tooling trước technical bootstrap; chưa gán lệnh cài/build/test giả định vào README.
- Làm rõ Git branch/SHA observation tối thiểu cần cho MVP; giữ Git/Unity mở rộng trong P1 theo TDD. Đây là điểm cần reconcile trước khi tách implementation tasks.
- Chuyển deliverables thành task có objective và acceptance criteria khi chuẩn bị triển khai từng phase.

## Quy tắc cập nhật

Khi thay đổi scope hoặc exit criteria, cập nhật phần TDD liên quan và ADR nếu quyết định kiến trúc thay đổi. Khi hoàn thành một việc, ghi kết quả thực tế trong STATUS và dẫn đến evidence; không đánh dấu hoàn thành chỉ vì đã có thiết kế.
