# ADR-016 — Workspace and build tooling

**Status:** Accepted; chưa kiểm chứng bằng build thật  
**Date:** 2026-11-01  
**Decision source:** Người dùng chọn "Chốt theo đề xuất" sau exit review Phase 0 trên macOS.

## Context

Monorepo của [ADR-012](012-initial-package-boundaries.md) cần workspace tooling trước khi bootstrap, và ADR-001 không chọn package manager hay build tool. Máy phát triển có npm, không có pnpm. [ADR-015](015-macos-first-delivery.md) yêu cầu không chọn tooling chỉ chạy được trên macOS khi đã có lựa chọn đa nền tảng tương đương.

## Decision

1. **Package manager:** npm workspaces. Commit `package-lock.json` ở root.
2. **Build:** electron-vite cho Main, Preload và Renderer.
3. **Packaging:** electron-builder.
4. **Versions:** chọn và pin khi bootstrap, ghi vào STATUS. Test runner, lint và cách enforce package boundaries cũng chốt lúc đó.
5. **Không ràng buộc Electron với spike:** Electron 45.2.1 và harness của SPIKE-09 không tự động trở thành lựa chọn của sản phẩm.

## Consequences

- Lựa chọn này dựa trên mức phổ biến và hỗ trợ đa nền tảng, chưa có spike kiểm chứng. Kiểm tra `npm view` ngày 2026-11-01: electron-vite 6.0.0 cần Node ^20.19 hoặc ≥22.12 và Vite 6–8; electron-builder 26.18.0; máy có Node 24.21.0. Việc này chỉ cho thấy không có xung đột khai báo.
- **Bootstrap phải chứng minh được:** build và đóng gói một `.app` tối thiểu, mở bằng Finder, với một package workspace và module SQLite đã chọn. Nếu không đạt, quay lại quyết định này cùng người dùng.
- electron-builder mặc định dùng `build/` cho resources, trùng với mục `build/` trong `.gitignore`. Xử lý khi bootstrap, bằng cách đổi `directories.buildResources` hoặc sửa `.gitignore`.
- Không có code signing hay notarization ở phạm vi dùng cá nhân. Luồng quarantine và notarize chưa kiểm tra (SPIKE-09).

## Related decisions

ADR-001 (Electron + React + TypeScript), ADR-004 (SQLite), [ADR-012](012-initial-package-boundaries.md) và [ADR-015](015-macos-first-delivery.md).
