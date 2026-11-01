# Roadmap

**Updated:** 2026-11-01  
**Nguồn thiết kế:** [TDD §13](TDD.md#13-implementation-plan-and-acceptance-gates)

Theo [ADR-015](decisions/015-macos-first-delivery.md), exit criteria của Phase 0–3 được đánh giá trên macOS; yêu cầu Windows chuyển sang milestone Windows parity.

Các milestone dưới đây theo quan hệ phụ thuộc, không phải lịch thực hiện. Trạng thái thực tế nằm ở [STATUS.md](STATUS.md). Chỉ chuyển phase khi có bằng chứng đáp ứng exit criteria; fallback được chấp nhận phải được ghi rõ, không biến capability chưa kiểm thử thành supported.

| Milestone | Deliverables | Exit criteria |
|---|---|---|
| Repository foundation | Documentation map, agent entrypoints, package skeleton và ADR-012 | Cấu trúc đã chốt được phản ánh thống nhất; không có lệnh chạy hoặc tính năng được báo có khi chưa tồn tại |
| Phase 0 — Feasibility | Version inventory, capability matrix, evidence, isolated spikes | SPIKE-01–06 có kết quả và giới hạn rõ ràng trên OS liên quan; fallback được ghi nhận; không còn giả định chặn workflow |
| Phase 1 — Shell and data | Workspace tooling, Electron UI, Project/Task CRUD, SQLite migrations, artifact store, settings | Trên Mac/Windows: thêm project, tạo task, sửa context và restart không mất dữ liệu; path Unicode/spaces hoạt động |
| Phase 2 — Desktop/CLI launchers | Profile manager, bốn launcher adapters, platform adapters, launch history | Desktop/CLI cùng flow; hai Claude CLI profiles độc lập; Desktop account chưa xác minh hiển thị đúng trạng thái |
| Phase 3 — Checkpoint and Handoff | Editor, handoff generator, Smart Switch, copy/open context, manual confirmation, Git observation tối thiểu (ADR-017) | Scenarios A–D ở TDD §9.4 có evidence; không dùng direct model APIs; đây là mốc MVP complete |
| Windows parity (hoãn, ADR-015) | SPIKE-01–08 trên Windows, ADR-010, Windows platform adapters | Exit criteria Windows của Phase 0–3 có evidence; thời điểm do người dùng quyết định |
| Phase 4 — Git/Unity context (P1) | Git observations mở rộng, Unity version detection, stale warnings | Branch/SHA và changed files đúng; cảnh báo context cũ; không sửa file Unity |
| Phase 5 — Robustness (P1) | Backup/restore, diagnostics, hotkeys, context export, optional terminal integration | Recovery và migration checks có evidence; packaging/signing theo chiến lược phát hành đã chốt |
| Phase 6 — Expansion (P2) | Những khả năng mới đã được duyệt | Chỉ lập kế hoạch khi có nhu cầu và capability validation; chưa cam kết triển khai |

## Công việc gần nhất

- Phase 0 đã đạt [exit review](feasibility.md#exit-review) trên macOS; Windows thuộc milestone Windows parity.
- Technical bootstrap Phase 1 theo [ADR-016](decisions/016-workspace-and-build-tooling.md); chỉ ghi lệnh cài/build/test vào README sau khi đã chạy được.
- Chuyển deliverables thành task có objective và acceptance criteria khi chuẩn bị triển khai từng phase.

## Quy tắc cập nhật

Khi thay đổi scope hoặc exit criteria, cập nhật phần TDD liên quan và ADR nếu quyết định kiến trúc thay đổi. Khi hoàn thành một việc, ghi kết quả thực tế trong STATUS và dẫn đến evidence; không đánh dấu hoàn thành chỉ vì đã có thiết kế.
