# Phase 3 — danh sách thử của người dùng

Exit criteria của Phase 3 (TDD §13): chạy được bảy scenario ở TDD §9.4 trên `.app` với account thật. Danh sách này là cách chạy chúng; kết quả ghi vào STATUS (hoặc một evidence mới) với `reported` cho điều người dùng báo, kèm ảnh chụp nếu có. Không gửi email, token hay nội dung công ty.

## Chuẩn bị

1. Thoát hẳn AgentHub (⌘Q), mở `apps/desktop/release/mac-arm64/AgentHub.app` bản mới nhất (`npm run package`).
2. Chọn một project thử có folder là Git repo, và ít nhất hai account (ví dụ Claude ở cửa sổ riêng và Codex).
3. Nếu có sự cố MCP, gửi kèm `~/Library/Application Support/AgentHub/logs/mcp.log`.

## Scenario

| # | Scenario (§9.4) | Các bước | Đạt khi |
|---|---|---|---|
| 1 | Khởi tạo tài liệu | Bật "Tài liệu context" (nơi lưu mặc định). Mở account Claude bằng **Terminal**, chọn Yes ở câu hỏi tin tưởng folder. Đưa agent một brief ngắn | Agent dùng `context-init`, hỏi lại chỗ chưa rõ, tạo README, PROJECT_CONTEXT, Workstreams/…; bấm "Tải lại" thì phần **Task** hiện các task |
| 2 | Claude Desktop A → Claude Desktop B | Ở phiên A: bấm "Copy lời nhắc checkpoint", dán vào. Chọn task, mở account B bằng **Desktop** (cửa sổ riêng); nếu cửa sổ đã mở trước đó thì thoát và mở lại để nạp MCP. Dán lời nhắc đã copy | B đọc đúng task, nêu đúng việc còn lại; handoff của A nằm đầu Handoff log |
| 3 | Claude → Codex CLI | Chọn task, mở account Codex bằng **Terminal** | Lời nhắc tự chạy, không phải dán; Codex đọc cùng tài liệu; khi Codex ghi handoff qua MCP, TUI hỏi quyền (chọn Allow) |
| 4 | Chat mới cùng account | Chuyển folder project sang branch khác (`git switch -c thu`), mở lại cùng account | Trang project và bảng trước khi mở cảnh báo branch khác với `STATUS` |
| 5 | Chat phát sinh ở tab Chat | Trong tab Chat của cửa sổ Claude riêng, bàn một ý tưởng ngoài lề rồi bảo agent dùng `context-capture` lưu thành chat rời. Mở màn **Chat rời**, bấm "Copy lời nhắc tiếp tục", dán vào chat ở account khác; rồi "Chuyển vào project" | Chat rời xuất hiện; account khác đọc được qua MCP; chuyển vào project thì nằm ở `Inbox/` của tài liệu |
| 6 | Phiên cũ dừng trước checkpoint | Sau một handoff, làm tiếp vài lượt ở account A (CLI hoặc tab Code) mà không checkpoint. Mở account B cho cùng project | Bảng trước khi mở nêu phiên của A sau checkpoint gần nhất, cảnh báo khác account/provider; tick ô "Cho agent mới đọc…" thì B đọc phần cuối transcript và viết checkpoint bù, ghi là reported |
| 7 | Project không bật tài liệu | Dùng một project tắt tài liệu. Ở phiên đang làm: "Copy lời nhắc tóm tắt", dán vào; mở account khác | Agent lưu handoff qua MCP (hoặc in ra để dán vào "Thêm handoff"); phần **Handoff** hiện bản mới nhất; lần mở sau lời nhắc trỏ tới nó |

## Kiểm tra thêm

- **Account chính** (`~/.claude`, `~/.codex`): lần đầu mở một project, bảng quyết định hỏi trước khi thêm skill và MCP; thử cả "Mở mà không cài".
- **Thêm handoff** cho task đã chọn (dán từ tab Chat không có MCP): mục mới nằm đầu Handoff log.
- Không có file nào xuất hiện trong folder project ngoài những gì agent cố ý viết; `~/.agents/skills` không có skill `context-*`.

## Điểm cần người dùng quyết định khi đánh giá

- Skill và MCP được cài cho account khi mở **mọi** project, kể cả project tắt tài liệu. "Mở mà không cài" không được nhớ, lần sau hỏi lại.
- Chat rời không thuộc project nên **mọi** account có MCP của AgentHub đều đọc được.
- Fallback transcript chỉ được đề xuất khi project đã có ít nhất một checkpoint hoặc handoff.
- Lời nhắc và skill viết bằng tiếng Anh; tài liệu theo ngôn ngữ chọn cho project.
