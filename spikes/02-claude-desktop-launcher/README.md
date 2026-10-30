# SPIKE-02 — Claude Desktop launcher

**Status:** macOS Pass (reported); chọn account là manual. Windows chưa chạy.

## Objective

Ghi nhận AgentHub mở được gì trong Claude Desktop trên macOS: mở app, mở workspace, điền sẵn prompt, chuyển session CLI sang Desktop và chọn account. Phần nào không được hỗ trợ phải có fallback.

## Pass criteria

Theo [feasibility.md](../../docs/feasibility.md): ghi nhận riêng từng bước open app/workspace và điều kiện desktop/resume; đường không hỗ trợ có fallback.

## Cơ chế được tài liệu hoá (Claude Code docs — Desktop, kiểm tra 2026-10-30)

| Cơ chế | Tác dụng theo tài liệu | Điều kiện |
|---|---|---|
| `claude --desktop` | Mở Desktop trên thư mục hiện tại | CLI ≥ 2.1.285, đăng nhập Claude subscription, macOS hoặc Windows x64 |
| `claude --desktop --continue` / `--resume <id>` | Mở session CLI trong Desktop (cùng session, không phải bản sao) | Như trên; session không đang chạy ở terminal khác |
| `claude://code/new?q=` | Mở trang new session, điền sẵn prompt, không tự gửi | Không có tham số folder local; `ssh_*` chỉ cho SSH |
| `/desktop` trong CLI | Lưu session, mở trong Desktop, thoát CLI | Claude subscription |

Không có cơ chế được tài liệu hoá để chọn account trong Desktop.

## Cách chạy

Chạy trong Terminal.app; script mở app trên màn hình và hỏi bạn quan sát được gì sau từng bước. Bước 4 gửi một request ngắn bằng Claude CLI. Bước 5 dùng đường không có trong tài liệu và chỉ chạy khi bạn đồng ý.

```bash
spikes/04-project-instructions/setup-fixtures.sh
```

```bash
spikes/02-claude-desktop-launcher/run-launch-checks.sh
```

Quan sát và version ghi vào `local/<timestamp>/` (ignored).

## Evidence

- [2026-10-30 — macOS](evidence/2026-10-30-macos.md)
