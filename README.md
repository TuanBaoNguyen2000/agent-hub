# AgentHub

AgentHub là desktop application dự kiến cho macOS và Windows, quản lý **Project → Task → Context → Checkpoint → Handoff**, giúp tiếp tục công việc giữa Claude/Codex, các account profile và Desktop/CLI.

Ứng dụng đi theo hướng **Hybrid Workspace & Context Manager**: Desktop và CLI là hai lựa chọn ngang hàng. Native apps giữ vai trò quản lý hội thoại và model; AgentHub chuẩn bị context, lập kế hoạch chuyển phiên và khởi chạy công cụ phù hợp.

## Trạng thái hiện tại

**Repository foundation — chưa bắt đầu Phase 0.** Repo đã có cấu trúc thư mục và tài liệu ban đầu; chưa có mã ứng dụng, workspace manifests, dependencies hay lệnh build/test/run. Những thư mục mã nguồn hiện là scaffold, chưa phải package có thể build.

Stack đã chọn: Electron + React + TypeScript; SQLite cho metadata, Markdown/YAML cho context artifacts. Package manager, build tool, runtime versions và dependency versions chưa được chốt. Tài liệu dùng tiếng Việt, giữ tên file và thuật ngữ kỹ thuật bằng tiếng Anh.

## Bắt đầu đọc

1. [Bản đồ tài liệu](docs/README.md).
2. [Trạng thái thực tế và bước tiếp theo](docs/STATUS.md).
3. [Technical Design Document](docs/TDD.md), đặc biệt §0, §3, §4, §13 và §15.
4. [Quy tắc phát triển](docs/DEVELOPMENT.md).
5. [Phase 0: feasibility plan và evidence](docs/feasibility.md).

Codex bắt đầu từ [AGENTS.md](AGENTS.md); Claude bắt đầu từ [CLAUDE.md](CLAUDE.md). Hai entrypoint dẫn đến cùng bộ quy tắc phát triển.

## Cấu trúc repository

```text
agent-hub/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── .gitignore
├── docs/                       # Thiết kế, kế hoạch, trạng thái và quyết định
├── apps/desktop/               # Electron Main, Preload, React Renderer
├── packages/
│   ├── domain/                 # Entities, value objects, business rules
│   ├── application/            # Use cases và ports
│   ├── contracts/              # Hợp đồng IPC
│   ├── persistence/            # SQLite và artifact store
│   ├── integrations/           # Claude/Codex adapters
│   └── platform/               # macOS/Windows adapters
├── scripts/                    # Công cụ phát triển repository
└── spikes/                     # Thử nghiệm khả thi, tách khỏi sản phẩm
```

Ranh giới và dependency được mô tả trong [DEVELOPMENT.md](docs/DEVELOPMENT.md) và [ADR-012](docs/decisions/012-initial-package-boundaries.md).

## Phạm vi MVP

- Quản lý project, task và account profile descriptors; không lưu provider credentials.
- Quản lý context, checkpoint và handoff độc lập với account/provider và Git branch.
- Cho chọn Claude/Codex Desktop hoặc CLI trong cùng launch flow.
- Smart Switch dựa trên rules; phân biệt bước tự động, có điều kiện và thủ công.
- Ghi trạng thái đúng mức có thể kiểm chứng; mở app không đồng nghĩa đã chuyển account hay resume session.

MVP không xây lại chat UI, không sao chép native chat history và không gọi trực tiếp model APIs. Tích hợp provider trong TDD là thiết kế cần xác minh bằng Phase 0, chưa phải compatibility được kiểm thử.

## Dữ liệu local

`docs/` phục vụ phát triển AgentHub. Database, logs và context artifacts của các project được ứng dụng quản lý sẽ nằm trong thư mục `userData` ngoài repository, theo [TDD §6](docs/TDD.md#6-local-storage--data-model). Repo chỉ nhận context export khi người dùng chủ động chọn; không tự đồng bộ hoặc commit dữ liệu runtime.

## Phát triển tiếp

Lộ trình ở [ROADMAP.md](docs/ROADMAP.md). Bước tiếp theo là chạy các feasibility spike và ghi bằng chứng trên macOS/Windows. Chỉ khởi tạo tooling ứng dụng sau khi Phase 0 đạt exit criteria.
