# ADR-016 — Workspace and build tooling

**Status:** Accepted; đã kiểm chứng bằng build thật trên macOS (2026-11-01)  
**Date:** 2026-11-01  
**Decision source:** Người dùng chọn "Chốt theo đề xuất" sau exit review Phase 0 trên macOS.

## Context

Monorepo của [ADR-012](012-initial-package-boundaries.md) cần workspace tooling trước khi bootstrap, và ADR-001 không chọn package manager hay build tool. Máy phát triển có npm, không có pnpm. [ADR-015](015-macos-first-delivery.md) yêu cầu không chọn tooling chỉ chạy được trên macOS khi đã có lựa chọn đa nền tảng tương đương.

## Decision

1. **Package manager:** npm workspaces. Commit `package-lock.json` ở root.
2. **Build:** electron-vite cho Main, Preload và Renderer.
3. **Packaging:** electron-builder.
4. **Versions:** pin chính xác, xem mục dưới. Test runner, lint và cách enforce package boundaries cũng chốt lúc bootstrap.
5. **Không tái sử dụng harness của SPIKE-09** trong sản phẩm.

## Chốt khi bootstrap (2026-11-01)

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Runtime | Node 24, npm 11, Electron 45.2.1 | Đúng bản Electron có evidence ở SPIKE-09 |
| TypeScript | 6.0.3, không dùng 7.x | typescript-eslint 8.72.1 chỉ hỗ trợ TypeScript `<6.1` |
| SQLite | better-sqlite3 13.0.3 | Có sẵn prebuild Node-API, kể cả Windows; `node:sqlite` có trong Electron 45 nhưng chưa ổn định |
| UI, build | React 19.3.1, Vite 8.3.5, electron-vite 6.0.0, electron-builder 26.18.0 | Theo quyết định trên |
| Test | Vitest 5.0.5, chạy trên runtime của Electron | Test nạp native module giống app |
| Lint, boundary | ESLint 10.14.0, typescript-eslint, `no-restricted-imports` theo từng package | Không thêm dependency; đã thử: chặn được cả 5 import vi phạm |

Cách dùng package nội bộ: mỗi package export thẳng `src/index.ts`; electron-vite bundle chúng vào app, chỉ `dependencies` của `apps/desktop` là external. Thư viện validation IPC chốt ở Phase 1, khi có payload đầu tiên.

## Kiểm chứng (2026-11-01, macOS 26.5.1 arm64)

| Kiểm tra | Kết quả |
|---|---|
| `npm ci` từ đầu, rồi typecheck, lint, test | Đạt; 4 test của persistence, gồm path có Unicode, khoảng trắng, dấu nháy và migration lỗi được rollback |
| `npm run dev` | Đạt; chưa thử hot reload khi sửa code |
| `npm run package` tạo `.app`, ký ad hoc | Đạt; 284 MB, gồm prebuild cho các OS khác |
| Mở `.app` với `env -i … open` | UI đọc được SQLite 3.53.4 qua IPC, không có lỗi console, env không có biến của provider |
| Bảo mật renderer | Không có `require`, `process`; chỉ expose `getSystemStatus`; chặn `window.open`, điều hướng, inline script, fetch ra ngoài |
| Thoát và mở lại | Thoát sạch, không còn file WAL, cùng file DB |

Mở bằng double-click trong Finder: xem [STATUS](../STATUS.md). `npm audit`: 0 lỗi ở production; 25 lỗi moderate ở dev dependency, đều từ một advisory DoS của `minimatch` qua eslint và electron-builder. Cách sửa npm gợi ý là hạ major version nên không áp dụng.

## Consequences

- electron-builder mặc định dùng `build/` cho resources, trùng với mục `build/` trong `.gitignore`. Đã xử lý bằng `directories.buildResources: resources`.
- `npm install` không tải binary Electron, nên root có `postinstall` chạy `install-electron`.
- `better-sqlite3` có `binding.gyp`, nên npm có thể tự chạy `node-gyp rebuild` khi cài. Máy không có toolchain build chưa được kiểm tra.
- Ký ad hoc cho máy này. Không có code signing hay notarization ở phạm vi dùng cá nhân; luồng quarantine và notarize chưa kiểm tra.
- Windows chưa build thử (ADR-015).

## Related decisions

ADR-001 (Electron + React + TypeScript), ADR-004 (SQLite), [ADR-012](012-initial-package-boundaries.md) và [ADR-015](015-macos-first-delivery.md).
