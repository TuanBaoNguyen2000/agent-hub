# SPIKE-15 — Định vị session gần nhất theo folder

**Status:** macOS Pass (observed, 2026-11-04) — [evidence](evidence/2026-11-04-macos.md). Windows chưa chạy (ADR-015).

## Objective

Kiểm chứng điều kiện 7 của [ADR-019](../../docs/decisions/019-agent-maintained-context.md#conditions-spike-trước-khi-triển-khai-phần-liên-quan), phục vụ fallback transcript (ADR-019 mục 10, TDD §7.6). Câu hỏi:

- Với một account và một folder project, có tìm được file session gần nhất mà chỉ đọc đủ để định vị (`cwd`, đường dẫn, thời gian), không đọc nội dung hội thoại không.
- Agent đích, kể cả của provider khác, có đọc được file đó không.

[`locate.mjs`](locate.mjs) có ba cách định vị:

- `claude`: tìm trong `<CLAUDE_CONFIG_DIR>/projects/<cwd mã hoá>/*.jsonl`, rồi kiểm tra `cwd` ở dòng đầu tiên có trường này.
- `codex-db`: đọc bảng `threads` trong `<CODEX_HOME>/state_5.sqlite` ở chế độ chỉ đọc, và chỉ chọn các cột dùng để định vị.
- `codex-scan`: đọc dòng `session_meta` đầu tiên của mỗi file `sessions/**/rollout-*.jsonl`.

Folder được so sánh sau khi chuẩn hoá về NFC.

## Pass criteria

- Tìm đúng session gần nhất của folder, kể cả khi:
  - hai folder có cùng tên thư mục sau khi Claude mã hoá đường dẫn;
  - tên folder ở dạng Unicode NFD;
  - đường dẫn dài;
  - một session cũ được resume sau các session khác.
- Phân biệt được session của folder và của thư mục con.
- Agent đích của provider kia đọc được phần cuối file, và nêu ra được nội dung của lượt cuối.

## Prerequisites

Profile B của SPIKE-01 (Claude) và SPIKE-08 (Codex) đã đăng nhập. Fixture nằm ở `~/.agenthub-spike/spike15/`. Mỗi session là một lượt ngắn, trong đó agent được yêu cầu ghi nhớ một từ mã. Vì vậy nội dung transcript đã biết trước và vô hại.

## Cách chạy

```bash
spikes/15-session-locate/run-session-checks.sh sessions
```

```bash
spikes/15-session-locate/run-session-checks.sh locate
```

```bash
spikes/15-session-locate/run-session-checks.sh read
```

Dùng `locate.mjs` trực tiếp:

```bash
node spikes/15-session-locate/locate.mjs claude ~/.agenthub-spike/claude-b "<folder>" --subfolders
```

## Dọn dẹp

```bash
spikes/15-session-locate/run-session-checks.sh cleanup
```

Lệnh này chỉ xoá fixture. Các session đã tạo vẫn nằm trong profile B.
