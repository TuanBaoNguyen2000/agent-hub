# SPIKE-03 — Codex Desktop launcher

**Status:** macOS Pass (reported); chọn account là manual, resume chưa kiểm tra. Windows chưa chạy.

## Objective

Xác nhận app nào là Codex Desktop trên macOS, kiểm tra riêng open app và open workspace, và chạy phần Codex Desktop của SPIKE-04. Không suy ra thread đã resume.

## Pass criteria

Theo [feasibility.md](../../docs/feasibility.md): xác minh riêng open app và open workspace theo OS/version; không suy ra thread resumed.

## Bối cảnh

- `/Applications/ChatGPT.app` 26.1023.51421 có bundle id `com.openai.codex` và đăng ký URL scheme `codex`. Không có `Codex.app` riêng.
- Tài liệu OpenAI (developer commands, kiểm tra 2026-10-30): `codex app [PATH]` mở ChatGPT desktop app hoặc chạy installer nếu thiếu; trên macOS mở workspace PATH, trên Windows chỉ in PATH. Tài liệu nhắc đến deep links trong app nhưng không công bố định dạng `codex://`.
- Kết quả tìm kiếm cho thấy Codex app đang được gộp vào ChatGPT desktop app (Chat, Work, Codex); chưa đọc được toàn văn bài help center (HTTP 403).

## Cách chạy

Chạy trong Terminal.app; script mở app và hỏi bạn quan sát được gì. Bước 3 copy prompt SPIKE-04 vào clipboard để bạn dán vào thread Codex.

```bash
spikes/04-project-instructions/setup-fixtures.sh
```

```bash
spikes/03-codex-desktop-launcher/run-launch-checks.sh
```

Quan sát và version ghi vào `local/<timestamp>/` (ignored).

## Evidence

- [2026-10-30 — macOS](evidence/2026-10-30-macos.md)
