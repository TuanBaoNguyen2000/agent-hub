# ADR-015 — macOS-first delivery

**Status:** Accepted  
**Date:** 2026-10-30  
**Decision source:** Người dùng: "window có thể để sau, hãy tập trung vào macOS trước" (phiên Phase 0, sau SPIKE-08).

## Context

TDD hướng tới macOS và Windows, và các exit criteria của Phase 0–1 đòi hỏi evidence trên cả hai OS. Hiện chưa có môi trường Windows. Toàn bộ evidence Phase 0 (SPIKE-01–08) chỉ có trên macOS, và mọi spike đều ghi Windows là `Not run`.

## Decision

1. **Phát triển và đánh giá exit criteria trên macOS trước.** Từ Phase 0 đến Phase 3, các gate được đánh giá bằng evidence trên macOS. Phần Windows giữ `Not run`, không được ghi là pass.
2. **Windows trở thành milestone riêng (Windows parity),** gồm SPIKE-01–08 trên Windows, ADR-010 và các exit criteria Windows của Phase 1–3. Thời điểm làm milestone này do người dùng quyết định sau.
3. **Kiến trúc vẫn giữ khả năng chạy trên nhiều OS.** API riêng của macOS (`open`, LaunchServices, Terminal.app) chỉ nằm trong `platform` adapter (ADR-012). Không chọn tooling hay dependency nào chỉ chạy được trên macOS khi đã có lựa chọn đa nền tảng tương đương.
4. **Không có tuyên bố hỗ trợ Windows** trong README, release notes hay UI cho đến khi milestone Windows parity có evidence.

## Consequences

- Phase 0 có thể kết thúc khi đạt exit review trên macOS; feasibility vẫn giữ cột Windows `Not run`.
- Rủi ro Windows bị dời lại: hành vi có thể khác hẳn macOS. Ví dụ: `codex app` trên Windows chỉ in đường dẫn theo tài liệu, và `open -n`, `--env`, Keychain không có tương đương trực tiếp. ADR-013 và ADR-014 vẫn chỉ có hiệu lực trên macOS.
- ADR-010 (minimum Windows version) vẫn Open và chuyển sang milestone Windows parity.
- Kiểm thử E2E trong Phase 1–3 chỉ bắt buộc trên macOS. Code của `platform` nên có chỗ cho adapter Windows, nhưng không cần triển khai trước milestone đó.

## Related decisions

ADR-001 (Electron, đa nền tảng), ADR-010 (minimum Windows version, Open), ADR-012 (package boundaries), [ADR-013](013-claude-desktop-account-instances.md) và [ADR-014](014-codex-profiles.md) (chỉ có evidence trên macOS).
