# SPIKE-15 follow-up — fallback transcript của sản phẩm với CLI thật (macOS)

```text
Spike ID / run ID: SPIKE-15 / 2026-11-05-product-fallback
Ngày giờ và người xác minh: 2026-11-05 09:13–09:20 UTC; agent chạy `newestSession` của packages/persistence trên dữ liệu thật của profile B, rồi chạy Claude CLI với lời nhắc do launch service tạo
OS / architecture / exact tool versions: macOS 26.5.1 arm64; Claude CLI 2.1.318; codex-cli 0.166.0
Fixture project và profile aliases: "Dự án game" và "context ngoài" của SPIKE-14 follow-up (trong scratchpad, ngoài repo); profile B của SPIKE-01 và SPIKE-08
Preconditions / auth mode: B đăng nhập bằng claude.ai và ChatGPT
Các bước: tạo một session Codex thật (không `--ephemeral`) trong folder, nêu một quyết định kèm từ mã; định vị session gần nhất của folder ở cả hai provider; chạy Claude với lời nhắc "dùng transcript"
Expected: định vị đúng file chỉ từ metadata; agent đích đọc phần cuối file và dùng nội dung đó
Observed: xem dưới
Result: Pass (observed)
Evidence path/link: file này
Next action: người dùng thử trên `.app` (danh sách thử Phase 3)
```

## Định vị

| Provider | Kết quả | Thời gian |
|---|---|---|
| Claude, `CLAUDE_CONFIG_DIR` của B | Session của lần chạy MCP sáng nay (07:43 UTC), `cwd` khớp sau chuẩn hoá NFC | 1 ms |
| Codex trước khi tạo session | `null`: các lần `codex exec` trước đều `--ephemeral`, không có rollout nào cho folder | 2 ms |
| Codex sau khi tạo session | Rollout mới qua bảng `threads` (`state_5.sqlite`, chỉ-đọc, chỉ cột định vị) | dưới 10 ms |

## Agent đích đọc transcript

Lời nhắc giống hệt `withTranscript` của launch service: resume TASK-001, rồi "Its transcript is <file>. Read only its last 200 lines (for example tail -n 200), not the whole file and nothing else in that folder, then first write the missing checkpoint with the context-checkpoint skill, marking what you take from it as reported." Claude chạy với `--add-dir=<context>` và `--add-dir=<thư mục rollout>` như launcher tạo, ở chế độ `-p`, chỉ cho phép đọc và `tail`.

| Kiểm tra | Observed |
|---|---|
| Đọc file | `tail -n 200 <rollout> \| cut -c1-1500`, không mở file khác trong thư mục session |
| Dùng nội dung | Nêu đúng quyết định "1,5 giây thay vì 2" và từ mã WALRUS-5521 của phiên Codex |
| Đối chiếu | Chỉ ra `STATUS.md` và acceptance criteria của TASK-001 vẫn ghi 2 giây |
| Checkpoint bù | Gọi Edit để thêm mục handoff; bị chặn vì lần thử không cấp quyền ghi, agent dừng và báo |

Agent còn chạy `ls` ở thư mục skill để tìm `context-checkpoint`, vì skill đã được gỡ khỏi B sau lần thử trước. Khi mở từ `.app`, skill được cài cho account trước khi mở.

## Chưa xác minh

- Mở từ `.app`: bảng quyết định, ô "Cho agent mới đọc…" và Terminal.app với hai `--add-dir=`.
- Tab Code của Desktop đọc transcript (agent phải hỏi quyền).
- Session trong worktree, session Codex đã archive.
