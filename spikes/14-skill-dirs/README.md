# SPIKE-14 — Thư mục skill theo account và theo project

**Status:** macOS Pass có điều kiện (observed, 2026-11-04) — [evidence](evidence/2026-11-04-macos.md). Thư mục account tách biệt ở cả hai provider, nhưng Codex còn đọc `~/.agents/skills` dùng chung cho mọi account. Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 6 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan): Claude CLI và Codex CLI nạp skill (`SKILL.md`) từ những thư mục nào khi chạy với thư mục cấu hình riêng của account (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Cụ thể:

- Skill cài cho một account có bị account khác thấy không.
- Các thư mục ở cấp home (`~/.claude`, `~/.agents`, `~/.codex`) có được đọc dù đã đặt thư mục account.
- Thư mục skill ở cấp project là gì, có đi ngược lên gốc repo không.
- Thư mục thêm bằng `--add-dir` có mang skill theo không.
- Một bản skill symlink vào nhiều account có được nạp không.

## Pass criteria

- Mỗi provider có một thư mục skill theo account mà account khác không đọc.
- Biết thư mục skill cấp project của từng provider.
- Ghi lại mọi thư mục dùng chung giữa các account.

## Prerequisites

Profile B của SPIKE-01 (Claude) và SPIKE-08 (Codex) đã đăng nhập. Fixture nằm ở `~/.agenthub-spike/spike14/`, gồm một HOME giả, một repo Git (`repo dự án`, làm việc trong thư mục con `app`) và một thư mục `context ngoài`. Mỗi thư mục ứng viên có một skill đánh dấu, tên nói lên vị trí của nó.

## Cách chạy

`setup` đặt skill đánh dấu. Các bước kiểm tra đọc danh sách skill mà CLI thực sự nạp: với Claude là trường `skills` trong sự kiện init của `claude -p --output-format stream-json`, với Codex là bảng skill roots và danh sách skill trong file session. Các bước này chạy với `HOME` giả, để thử thư mục cấp home mà không sửa thư mục thật.

```bash
spikes/14-skill-dirs/run-skill-checks.sh setup
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh claude
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh codex
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh codex-host
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh links
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh invoke-claude
```

```bash
spikes/14-skill-dirs/run-skill-checks.sh invoke-codex
```

- `codex-host`: chạy với `features.skip_host_skill_discovery=true`, và với HOME thật (chỉ in bảng roots và tên skill lấy từ `~/.agents`).
- `links`: symlink một skill vào thư mục account của cả hai provider.
- `invoke-*`: yêu cầu agent dùng skill và in token. Claude chạy với HOME thật, vì với HOME giả Claude báo `Not logged in`.

## Dọn dẹp

```bash
spikes/14-skill-dirs/run-skill-checks.sh cleanup
```

Lệnh này xoá skill đánh dấu trong thư mục account của B và toàn bộ `~/.agenthub-spike/spike14`.
