# Phase 3 — danh sách thử của người dùng

Exit criteria của Phase 3 (TDD §13): chạy được bảy scenario ở TDD §9.4 trên `.app` với account thật. Danh sách này là cách chạy chúng; kết quả ghi vào STATUS (hoặc một evidence mới) với `reported` cho điều người dùng báo, kèm ảnh chụp nếu có. Không gửi email, token hay nội dung công ty.

## Chuẩn bị

1. Thoát hẳn AgentHub (⌘Q), mở `apps/desktop/release/mac-arm64/AgentHub.app` bản mới nhất (`npm run package`).
2. Chọn một project thử có folder là Git repo, và ít nhất hai account (ví dụ Claude ở cửa sổ riêng và Codex).
3. Nếu có sự cố MCP, gửi kèm `~/Library/Application Support/AgentHub/logs/mcp.log`.

## Scenario

| # | Scenario (§9.4) | Các bước | Đạt khi |
|---|---|---|---|
| 1 | Khởi tạo tài liệu | "Thêm project", chọn folder: hộp thoại nêu tài liệu tìm thấy và hỏi. Với project chưa có tài liệu, chọn "Tạo bộ tài liệu mới" → Trong repo (`AgentContext/`) hoặc Trong AgentHub. Thẻ Tài liệu báo "Cần điền"; bấm "Nhờ agent điền tài liệu", mở account Claude bằng **Terminal**, chọn Yes ở câu hỏi tin tưởng folder. Đưa agent một brief ngắn | Khung (README, PROJECT_CONTEXT, `Workstreams/main/`) có ngay khi thêm; agent dùng `context-init`, hỏi lại chỗ chưa rõ, điền vào khung; thẻ chuyển "Sẵn sàng" và tab **Task** hiện các task |
| 2 | Claude Desktop A → Claude Desktop B | Ở phiên A: bấm "Copy lời nhắc checkpoint" (thẻ Tài liệu ở Tổng quan), dán vào. Chọn task, mở account B bằng **Desktop** (cửa sổ riêng); nếu cửa sổ đã mở trước đó thì thoát và mở lại để nạp MCP. Dán lời nhắc đã copy | B đọc đúng task, nêu đúng việc còn lại; handoff của A nằm đầu Handoff log |
| 3 | Claude → Codex CLI | Chọn task, mở account Codex bằng **Terminal** | Lời nhắc tự chạy, không phải dán; Codex đọc cùng tài liệu; khi Codex ghi handoff qua MCP, TUI hỏi quyền (chọn Allow) |
| 4 | Chat mới cùng account | Chuyển folder project sang branch khác (`git switch -c thu`), mở lại cùng account | Trang project và bảng trước khi mở cảnh báo branch khác với `STATUS` |
| 5 | Chat phát sinh ở tab Chat | Trong tab Chat của cửa sổ Claude riêng, bàn một ý tưởng ngoài lề rồi bảo agent dùng `context-capture` lưu thành chat rời. Bật công tắc **Chat** ở thanh bên, mở chat đó, bấm "Copy lời nhắc tiếp tục", dán vào chat ở account khác; rồi "Chuyển vào project" | Chat rời xuất hiện; account khác đọc được qua MCP; chuyển vào project thì nằm ở `Inbox/` của tài liệu |
| 6 | Phiên cũ dừng trước checkpoint | Sau một handoff, làm tiếp vài lượt ở account A (CLI hoặc tab Code) mà không checkpoint. Tab Tổng quan → **Chuyển sang account khác** → chọn B → **Chuyển ngay** | Dòng Tiến độ hiện "Có việc chưa lưu · phiên Claude của A còn làm tới …" và chấm vàng ở sidebar; bảng trước khi mở hỏi có cho agent mới đọc transcript không (Không đọc / Lần này / Luôn với project này), cảnh báo khác account/provider; cho phép thì B dùng `context-recover` (lọc transcript theo giờ checkpoint), viết checkpoint bù ghi là reported, và dòng Tiến độ chuyển sang "Đã lưu" (ADR-024, ADR-026) |
| 8 | Chuyển account một nút, lưu rồi chuyển (ADR-024) | Đang làm ở account A, A còn quota. Tổng quan → **Chuyển sang account khác** → chọn B → **Lưu rồi chuyển** → dán lời nhắc đã copy vào phiên của A | Hộp thoại chờ; ngay khi agent của A ghi handoff, B tự mở với lời nhắc `context-resume` mà không cần bấm thêm; "Mở luôn, không chờ" chuyển sang cách Chuyển ngay |
| 7 | Project không bật tài liệu | Dùng một project chọn "Chưa dùng tài liệu" khi thêm. Ở phiên đang làm: "Copy lời nhắc tóm tắt", dán vào; mở account khác | Agent lưu handoff qua MCP (hoặc in ra để dán vào "Thêm handoff"); phần **Handoff** hiện bản mới nhất; lần mở sau lời nhắc trỏ tới nó |

## Kiểm tra thêm

- **Account chính** (`~/.claude`, `~/.codex`): mặc định không tự cài; bảng quyết định chỉ báo thiếu skill/MCP và có nút "Mở Công cụ agent". Cài từng ô ở Cài đặt → Công cụ agent, hoặc bật "Tự cài khi mở" (ADR-020 mục 1).
- **Thêm handoff** ở panel chi tiết task (dán từ tab Chat không có MCP): mục mới nằm đầu Handoff log. Project có tài liệu không còn tab Handoff; "Copy lời nhắc checkpoint" ở menu ⋯ của dòng Tiến độ (Tổng quan, ADR-024).
- **Mở account (ADR-024):** mỗi account là một dòng có hai thanh usage, trạng thái (Sẵn sàng, Hết hạn mức…) và một nút mở theo cách dùng lần trước (mũi tên chọn cách kia); account còn nhiều quota đứng đầu. Bảng "Trước khi mở" chỉ hiện khi phải quyết định (quyền lần đầu, transcript, thiếu công cụ có nút "Cài cho account này", version Desktop chưa kiểm chứng); cảnh báo khác hiện trong kết quả sau khi mở. Panel task: "Làm tiếp task này" mở ngay account mặc định. Chip usage ở sidebar ghi "Tuần 71%". Một cửa sổ usage của account đang làm vượt 85% thì dòng Tiến độ nhắc lưu tiến độ. Cài đặt của project có lựa chọn đọc transcript.
- **Skill (ADR-026):** Cài đặt → Công cụ agent → "Xem" mở nội dung skill; sau khi cập nhật app, skill đổi có nhãn "Đã cập nhật" và diff; skill riêng có "Folder gốc đã đổi" và "Cập nhật từ folder gốc".
- **Thêm project có tài liệu sẵn (ADR-023):** thêm hai project Unity thật; hộp thoại nêu đúng bộ `AgentContext/` (số workstream, task) và không tự dùng khi chưa bấm. Project thêm từ trước chỉ hiện thông báo "Xem và chọn".
- **Tab Task (ADR-021, ADR-023):** danh sách nhóm theo trạng thái (Đang làm, Bị chặn, Chờ, Xong), chuyển sang Bảng và kéo thẻ sang cột khác; lọc workstream, tìm task. Mở task: thuộc tính (Trạng thái, Workstream, Branch, File), tick acceptance criteria ghi thẳng vào file, sửa từng mục tại chỗ, Handoff log dạng dòng thời gian. Tạo task (tên + mục tiêu) rồi "Nhờ agent": agent viết acceptance criteria và panel tự cập nhật. Đổi trạng thái sang Xong: file task có dòng `Status: Done`, `STATUS.md` cùng chữ, Handoff log có "Verified by user in AgentHub". Tạo workstream mới. Sửa task trong lúc agent đang ghi cùng file thì AgentHub báo và khoá Lưu.
- **Panel Tài liệu (ADR-023):** nút ở thanh tab hoặc ⌘⇧E mở/ẩn ở mọi tab; cây thư mục đóng mở, lọc file; xem, sửa, tạo file `.md`; agent ghi file đang mở thì nội dung tự đổi; kéo cạnh trái để đổi bề rộng; ẩn/hiện được nhớ khi mở lại.
- **Công cụ agent (ADR-023 mục 8):** chọn account bên trái; trạng thái là chấm màu (không bấm được), nút "Cài" riêng, "Gỡ" trong menu ⋯.
- Không có file nào xuất hiện trong folder project ngoài những gì agent cố ý viết; `~/.agents/skills` không có skill `context-*`.

## Điểm cần người dùng quyết định khi đánh giá

- Account bật "Tự cài khi mở" được cài skill và MCP khi mở **mọi** project, kể cả project tắt tài liệu. Account riêng mặc định bật, account chính mặc định tắt.
- Chat rời không thuộc project nên **mọi** account có MCP của AgentHub đều đọc được.
- Fallback transcript chỉ được đề xuất khi project đã có ít nhất một checkpoint hoặc handoff.
- Lời nhắc và skill viết bằng tiếng Anh; tài liệu theo ngôn ngữ chọn cho project.
