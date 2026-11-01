# AgentHub

AgentHub là desktop application dự kiến cho macOS và Windows, quản lý **Project → Task → Context → Checkpoint → Handoff**, giúp tiếp tục công việc giữa Claude/Codex, các account profile và Desktop/CLI.

Ứng dụng đi theo hướng **Hybrid Workspace & Context Manager**: Desktop và CLI là hai lựa chọn ngang hàng. Native apps giữ vai trò quản lý hội thoại và model; AgentHub chuẩn bị context, lập kế hoạch chuyển phiên và khởi chạy công cụ phù hợp.

## Trạng thái hiện tại

**Phase 1 đang làm: mới có shell tối thiểu, chưa có tính năng. Chỉ chạy trên macOS; Windows chưa kiểm thử.** Phase 0 đã đạt [exit review](docs/feasibility.md#exit-review) trên macOS. Ứng dụng hiện chỉ mở một cửa sổ hiển thị trạng thái SQLite.

Stack đã chọn: Electron + React + TypeScript; SQLite cho metadata, Markdown/YAML cho context artifacts. Tooling: Node 24, npm workspaces, electron-vite, electron-builder ([ADR-016](docs/decisions/016-workspace-and-build-tooling.md)). Tài liệu dùng tiếng Việt, giữ tên file và thuật ngữ kỹ thuật bằng tiếng Anh.

## Bắt đầu đọc

1. [Bản đồ tài liệu](docs/README.md).
2. [Trạng thái thực tế và bước tiếp theo](docs/STATUS.md).
3. [Technical Design Document](docs/TDD.md), đặc biệt §0, §3, §4, §13 và §15.
4. [Quy tắc phát triển](docs/DEVELOPMENT.md).
5. [Phase 0: feasibility plan và evidence](docs/feasibility.md).

Coding agents bắt đầu từ [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md) nạp lại AGENTS.md để Codex và Claude dùng cùng một bản hướng dẫn.

## Cấu trúc repository

- `docs/`: thiết kế, kế hoạch, trạng thái và quyết định.
- `apps/desktop/`: Electron Main, Preload và React Renderer.
- `packages/`: domain, application, contracts và các adapter hạ tầng.
- `scripts/`: công cụ phát triển repository.
- `spikes/`: thử nghiệm khả thi, tách khỏi sản phẩm.

Cây thư mục đầy đủ ở [TDD §4.3](docs/TDD.md#43-folderrepository-structure-agreed); ranh giới và dependency ở [DEVELOPMENT.md](docs/DEVELOPMENT.md) và [ADR-012](docs/decisions/012-initial-package-boundaries.md).

## Phạm vi MVP

- Quản lý project, task và account profile descriptors; không lưu provider credentials.
- Quản lý context, checkpoint và handoff độc lập với account/provider và Git branch.
- Cho chọn Claude/Codex Desktop hoặc CLI trong cùng launch flow.
- Smart Switch dựa trên rules; phân biệt bước tự động, có điều kiện và thủ công.
- Ghi trạng thái đúng mức có thể kiểm chứng; mở app không đồng nghĩa đã chuyển account hay resume session.

MVP không xây lại chat UI, không sao chép native chat history và không gọi trực tiếp model APIs. Tích hợp provider trong TDD là thiết kế; mức đã kiểm chứng theo OS và version nằm trong [feasibility.md](docs/feasibility.md).

## Dữ liệu local

`docs/` phục vụ phát triển AgentHub. Database, logs và context artifacts của các project được ứng dụng quản lý sẽ nằm trong thư mục `userData` ngoài repository, theo [TDD §6](docs/TDD.md#6-local-storage--data-model). Repo chỉ nhận context export khi người dùng chủ động chọn; không tự đồng bộ hoặc commit dữ liệu runtime.

## Phát triển tiếp

Cài và chạy, cần Node 24:

```bash
npm ci
```

```bash
npm run dev
```

Các lệnh khác ở [DEVELOPMENT.md](docs/DEVELOPMENT.md#lệnh-phát-triển). Lộ trình ở [ROADMAP.md](docs/ROADMAP.md), bước tiếp theo ở [STATUS.md](docs/STATUS.md#bước-tiếp-theo).
