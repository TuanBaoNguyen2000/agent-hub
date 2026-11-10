# Phase 3 — kịch bản thử từng bước

Kịch bản chi tiết để chạy [danh sách thử](phase3-acceptance.md) trên bộ [project thử](sandbox-projects.md). Các phần xếp theo chi phí: **phần A không gọi agent** (0 token), phần B–D dùng agent với việc nhỏ, phần E tốn nhiều token nhất nên để cuối. Tạo ngày 2026-11-10, cho bản `.app` đóng gói cùng ngày (có ADR-024, ADR-026, ADR-027). Bản đóng gói lại sau ADR-028 và ADR-029 (2026-11-10) đổi chỗ của Công cụ agent và lời nhắc khi mở; các bước liên quan đã sửa theo, và phần mới nằm ở **mục G**: chạy mục G trước nếu chỉ muốn thử thay đổi mới.

Mỗi bước có **Làm** (thao tác) và **Đạt khi** (điều phải thấy). Ghi kết quả vào bảng ở cuối file: Đạt / Không đạt / Khựng (làm được nhưng phải dừng để đoán), kèm một dòng ghi chú. Không chép nội dung hội thoại.

## 0. Chuẩn bị (khoảng 10 phút)

| # | Làm | Đạt khi |
|---|---|---|
| 0.1 | Thoát hẳn AgentHub (⌘Q). Mở `apps/desktop/release/mac-arm64/AgentHub.app` bằng double-click trong Finder | App mở, không báo lỗi dữ liệu |
| 0.2 | Đưa ba repo về `baseline`: trong từng repo chạy `git reset --hard baseline && git clean -fd`; với `sandbox_shooter` chạy `git switch VN/playable001` trước | `git status` sạch; shooter ở `VN/playable001` |
| 0.3 | Nếu ba project thử đã có trong sidebar từ lần trước: gỡ chúng khỏi AgentHub | Sidebar không còn project thử |
| 0.4 | Chuẩn bị account. Gọi tên trong file này: **A** = Claude account riêng, **B** = Claude account riêng thứ hai (hoặc account chính), **C** = Codex. Tối thiểu cần A và C | Mỗi account là một dòng ở Account, có usage |
| 0.5 | Thanh bên → **Công cụ agent** → "Cài đủ cho tất cả" (hoặc nút Cài trên từng dòng) | Mọi dòng ghi "Skill 6/6 · Đủ" và "MCP · Đã cài"; dòng Công cụ agent ở thanh bên hết chấm vàng; `~/.agents/skills` không có skill `context-*` |
| 0.6 | Ghi % usage tuần của A, B, C trước khi thử | Có số để so ở cuối |

**Tiết kiệm token:** trong các phiên agent, chỉ nói đúng câu ghi trong bước. Nếu account cho chọn model, dùng model rẻ cho phần B–D; phần E (`context-init`) nên dùng model tốt hơn vì chất lượng tài liệu ảnh hưởng mọi phiên sau.

## A. Không gọi agent (0 token)

### A1. Thêm project và nhận tài liệu có sẵn (ADR-023)

| # | Làm | Đạt khi |
|---|---|---|
| A1.1 | Thêm project → chọn `sandbox_shooter` | Hộp thoại nêu bộ `unity_project/sandbox_shooter/AgentContext` với **2 workstream, 8 task**; chưa tự dùng khi chưa bấm |
| A1.2 | Bấm "Dùng bộ này" | Tổng quan có thẻ Tài liệu "Sẵn sàng"; tab Task có 8 task |
| A1.3 | Thêm project → `sandbox_runner` | Hộp thoại không thấy bộ theo khuôn, nhưng báo "Có ghi chú khác khuôn (`CLAUDE.md`, `Docs/Continuity.md`)". **Bấm Huỷ**; project này được thêm thật ở phần E |
| A1.4 | Thêm project → `sandbox-level-tool` → "Chưa dùng tài liệu" | Project có tab Handoff, không có tab Task |
| A1.5 | Thêm một project Unity thật (ví dụ `luna_captainofspace`) chỉ để xem, rồi gỡ | Quét nhanh (dưới vài giây), hộp thoại nêu đúng bộ `AgentContext/` của nó; không file nào xuất hiện trong repo thật |

### A2. Tab Task trên `sandbox_shooter`

| # | Làm | Đạt khi |
|---|---|---|
| A2.1 | Mở tab Task, xem dạng Danh sách | Nhóm theo trạng thái: Đang làm (TASK-004), Chờ duyệt (TASK-003), Bị chặn (TASK-006), Cần làm (TASK-007, TASK-008), Xong (TASK-001, 002, 005) |
| A2.2 | Chuyển sang Bảng, kéo TASK-007 sang cột Đang làm, rồi kéo về | File `TASK-007-balance-pass.md` đổi dòng `Status:` theo; bảng `STATUS.md` đổi cùng chữ |
| A2.3 | Lọc workstream `playable002`; tìm "boss" | Chỉ còn TASK-008 |
| A2.4 | Mở TASK-005 | Panel báo: file ghi "Done", bảng STATUS ghi "In progress", AgentHub theo file task; có nút **Đồng bộ bảng STATUS**. `STATUS.md` chưa bị sửa |
| A2.5 | Bấm "Đồng bộ bảng STATUS" | Báo "Đã sửa 1 dòng"; `STATUS.md` ghi `TASK-005 … \| Done`; cảnh báo biến mất |
| A2.6 | Trong Finder hoặc terminal, copy `Playables/playable001/Tasks/TASK-007-balance-pass.md` thành `Playables/playable002/Tasks/TASK-007-copy.md`. Quay lại app | Hai task TASK-007 đều có dấu ▲; mở bản copy thấy "TASK-007 trùng số với …" và nút **Đổi số** |
| A2.7 | Bấm "Đổi số" trên bản copy | Task thành TASK-009, file đổi tên `TASK-009-copy.md`, có dòng "Renumbered from TASK-007."; `playable002/STATUS.md` có dòng TASK-009; TASK-007 gốc không đổi. Xoá file này sau bước này (hoặc reset ở cuối) |
| A2.8 | Mở TASK-003, tick tiêu chí còn lại | Ô tick ghi thẳng vào file (`- [x]`) |
| A2.9 | Đổi TASK-003 sang **Xong** | File có `Status: Done`, `STATUS.md` cùng chữ, Handoff log có mục "Verified by user in AgentHub" có giờ kèm múi giờ |
| A2.10 | Tạo task "Pause menu" trong playable001, mục tiêu một câu, **không** bấm Nhờ agent | Thành TASK-009 (hoặc số trống kế tiếp), có dòng trong `STATUS.md` với trạng thái Cần làm |
| A2.11 | Tạo workstream mới "Shop UI" | Có `Playables/shop-ui/STATUS.md` và `Tasks/` |
| A2.12 | Mở TASK-007, bấm sửa mục Goal; trong lúc đang sửa, mở file bằng editor khác, thêm một dòng, lưu | Panel báo file vừa bị sửa bên ngoài, nút Lưu bị khoá; "Tải lại" hiện dòng mới |

### A3. Panel Tài liệu

| # | Làm | Đạt khi |
|---|---|---|
| A3.1 | ⌘⇧E ở tab Tổng quan, rồi ở tab Task | Panel mở/ẩn ở mọi tab |
| A3.2 | Mở cây `Playables/playable001`, lọc "DECISIONS", mở file | Hiện nội dung Markdown |
| A3.3 | Sửa `BRIEF.md` trong panel, lưu; tạo file mới `Notes.md` | File trên đĩa đổi đúng; file mới có trong cây |
| A3.4 | Kéo cạnh trái panel; thoát app, mở lại | Bề rộng và trạng thái ẩn/hiện được nhớ |

### A4. Git và tiến độ

| # | Làm | Đạt khi |
|---|---|---|
| A4.1 | Tổng quan của shooter | Dòng Tiến độ: "Lưu lần cuối …" theo handoff mới nhất (Codex, 2026-11-09); thẻ Git nêu branch `VN/playable001` |
| A4.2 | Trong shooter: `git switch -c thu`. Bấm "Kiểm tra tài liệu" | Cảnh báo branch `thu` khác với `VN/playable001` của STATUS. Chạy `git switch VN/playable001` rồi kiểm tra lại: cảnh báo hết |
| A4.3 | Sửa một file `.cs` bất kỳ (không commit). Kiểm tra lại | Cảnh báo có thay đổi chưa commit. Hoàn tác bằng `git checkout -- .` |

### A5. Account, công cụ, skill

| # | Làm | Đạt khi |
|---|---|---|
| A5.1 | Tổng quan → khu mở account | Mỗi account một dòng, hai thanh usage, trạng thái (Sẵn sàng / Hết hạn mức…); thứ tự giống danh sách account, account gợi ý có nút tô đậm; chip ở sidebar ghi "Tuần …%" |
| A5.2 | Bấm A ở thanh bên (trang của A) → "Xem" ở `context-capture` | Thấy `SKILL.md` có `context_create_task`, và `references/document-layout.md` |
| A5.3 | Gỡ MCP của C trong menu ⋯, rồi mở C cho shooter | Bảng "Trước khi mở" báo thiếu MCP, có nút "Cài cho account này"; bấm thì cài xong và mở tiếp. (Nếu không muốn tốn token: thoát CLI ngay khi nó mở) |
| A5.4 | Công cụ agent → Chi tiết MCP server → "Thử kết nối" cho A | "Kết nối được · 11 tool" |

## B. Agent, việc nhỏ trên `sandbox_shooter` TASK-004

Một chuỗi liền mạch kiểu "một ngày làm việc". TASK-004 chỉ còn sửa 1–2 file (`PlayerHealth.cs` có `TODO(TASK-004)`).

### B1. Tiếp tục task bằng A (Terminal)

| # | Làm | Đạt khi |
|---|---|---|
| B1.1 | Tab Task → TASK-004 → "Làm tiếp task này" → chọn A, cách mở Terminal | Terminal mở ở folder project, lời nhắc tự gửi; nếu Claude hỏi tin folder, chọn Yes |
| B1.2 | Đợi agent báo cáo (`context-resume`) | Agent nêu đúng: task, việc còn lại (phần `TODO(TASK-004)`), handoff mới nhất của Codex, tách verified / observed / reported, **chưa sửa code** |
| B1.3 | Gõ: "Làm phần còn lại của TASK-004, chỉ sửa code, chưa checkpoint." | Agent sửa `PlayerHealth.cs` (và 1 file nữa nếu cần) |
| B1.4 | Trong phiên A, gõ "lưu lại" | Agent dùng `context-checkpoint`: handoff mới ở đầu Handoff log của TASK-004 (giờ có `+0700`), `Status:` trong file đổi (thường In review), dòng trong `STATUS.md` cùng chữ. Dòng Tiến độ thành "Đã lưu · … · A" |

### B2. A → B qua Desktop (scenario 2)

| # | Làm | Đạt khi |
|---|---|---|
| B2.1 | TASK-004 → mở B bằng **Desktop**. Nếu cửa sổ Desktop của B đã mở từ trước khi cài MCP, thoát và mở lại | Cửa sổ riêng của B, đúng account; lời nhắc đã được copy |
| B2.2 | Dán lời nhắc vào chat mới (tab Code nếu có, để agent đọc được file) | B đọc đúng TASK-004, nêu đúng handoff của A ở bước B1.4 |

### B3. Sang Codex (scenario 3)

| # | Làm | Đạt khi |
|---|---|---|
| B3.1 | TASK-004 → mở C bằng **Terminal** | Lời nhắc tự chạy, không phải dán; Codex đọc cùng tài liệu và nêu đúng việc còn lại |
| B3.2 | Gõ: "Ghi checkpoint ngắn cho TASK-004: chỉ xác nhận đã đọc, không đổi trạng thái." | TUI hỏi quyền dùng tool MCP (chọn Allow); handoff mới của Codex ở đầu log |

### B4. Phiên dừng trước checkpoint, chuyển ngay (scenario 6)

| # | Làm | Đạt khi |
|---|---|---|
| B4.1 | Ở phiên A (Terminal, hoặc mở lại A), gõ: "Thêm một dòng comment giải thích ở đầu PlayerHealth.cs. Không checkpoint." Đợi xong, **không** checkpoint | Dòng Tiến độ chuyển "Có việc chưa lưu · phiên Claude của A còn làm tới …"; chấm vàng cạnh project ở sidebar |
| B4.2 | Tổng quan → mở B ở danh sách account | Bảng trước khi mở hỏi đọc transcript: Không đọc / Lần này / Luôn với project này; có cảnh báo khác account |
| B4.3 | Chọn "Lần này", mở B (Terminal nếu được, để đỡ bước dán) | B dùng `context-recover`: lọc transcript sau giờ checkpoint, viết handoff bù ghi rõ "Recovered from the session transcript", các ý đánh dấu reported (hoặc observed nếu B tự kiểm tra Git) |
| B4.4 | Xem Tổng quan | Dòng Tiến độ về "Đã lưu" |

### B5. Lưu rồi chuyển (scenario 8)

Từ 2026-11-10 không còn hộp thoại "Chuyển sang account khác" (người dùng chọn bỏ): lưu là một câu trong phiên cũ, chuyển là mở account khác ở danh sách.

| # | Làm | Đạt khi |
|---|---|---|
| B5.1 | Đang có phiên B mở. Gõ "lưu lại" trong phiên B | B ghi checkpoint đầy đủ; dòng Tiến độ thành "Đã lưu" |
| B5.2 | Tổng quan → mở A (hoặc C) ở danh sách account | Account mới mở với "Làm tiếp project này."; agent nêu đúng task và handoff mới nhất của B |

### B6. Mở lại khi đã đổi branch (scenario 4)

| # | Làm | Đạt khi |
|---|---|---|
| B6.1 | `git switch -c thu` trong shooter. Mở lại A cho TASK-004 | Trang project và kết quả mở đều cảnh báo branch khác STATUS; agent cũng nêu chỗ lệch khi báo cáo |
| B6.2 | `git switch VN/playable001`, xoá branch `thu` | Cảnh báo hết |

## C. Task mới, chat rời, nhiều account cùng lúc

| # | Làm | Đạt khi |
|---|---|---|
| C1 | Task "Pause menu" tạo ở A2.10 → "Nhờ agent viết tiêu chí" → mở A | Agent viết acceptance criteria dạng `- [ ]`; panel task tự cập nhật, không phải tải lại |
| C2 | **Scenario 5.** Mở tab Chat (không có folder) của cửa sổ Claude riêng của A. Bàn một ý ngoài lề trong 2–3 câu (ví dụ "ý tưởng combo khi bắn liên tiếp"), rồi gõ: "Dùng context-capture lưu cuộc chat này thành chat rời." | Sidebar → bật **Chat**: chat rời mới xuất hiện, nguồn ghi tên client |
| C3 | Mở chat rời → "Copy lời nhắc làm tiếp" → dán vào một phiên của C | C đọc được chat qua MCP và tóm tắt đúng |
| C4 | Chat rời → "Chuyển vào project" → `sandbox_shooter` | File nằm ở `AgentContext/Inbox/`; chat biến khỏi danh sách |
| C5 | Mở A cho shooter (không chọn task) | Báo cáo đầu phiên của agent có mục "Inbox" nêu tên note |
| C6 | Gõ: "Biến note trong Inbox thành task trong playable002." | Agent gọi `context_create_task`; task mới có số kế tiếp; note chuyển sang `Inbox/archive/` (nếu agent chỉ có MCP thì nó nhắc bạn tự chuyển) |
| C7 | **Hai account cùng tạo task (ADR-027).** Mở A và C cho shooter. Chuẩn bị sẵn ở cả hai câu: "Dùng context-capture tạo task 'Sound pass' trong playable001." rồi gửi gần như cùng lúc | Hai task có **số khác nhau**; `STATUS.md` có cả hai dòng; tab Task không có cảnh báo trùng |
| C8 | (Tuỳ chọn) Gõ ở A: "Dùng context-tidy." | Agent đề xuất trước khi ghi (handoff cũ chuyển vào `Tasks/archive/`, dòng bảng lệch); chỉ ghi khi bạn đồng ý |

## D. Project không có tài liệu: `sandbox-level-tool` (scenario 7)

| # | Làm | Đạt khi |
|---|---|---|
| D1 | Mở A cho `sandbox-level-tool` (Terminal). Gõ: "Thêm kiểm tra rằng mỗi level có đúng một ô start, kèm một test. Chạy npm test." | Agent sửa `src/` và `test/`, `npm test` đạt |
| D2 | Tab Handoff → "Copy lời nhắc tóm tắt" → dán vào phiên A | Agent lưu handoff bằng `context_save_handoff`; phần Handoff hiện bản mới nhất |
| D3 | Mở C cho cùng project | Lời nhắc trỏ tới handoff mới nhất; Codex nêu đúng việc đã làm |
| D4 | (Không có MCP) Dán một đoạn handoff tự viết vào "Thêm handoff" | Bản dán thành mới nhất |

## E. Khởi tạo tài liệu: `sandbox_runner` (scenario 1, tốn token nhất)

| # | Làm | Đạt khi |
|---|---|---|
| E1 | Thêm project → `sandbox_runner` → **Tạo bộ tài liệu mới** → **Trong repo** | Có ngay khung `AgentContext/` (README, PROJECT_CONTEXT, `Workstreams/main/`); thẻ Tài liệu "Cần điền" |
| E2 | "Nhờ agent điền tài liệu" → mở A bằng **Terminal** → chọn Yes ở câu hỏi tin folder. Đưa brief: "Runner 3 làn, đang làm coins và HUD. Đọc tài liệu cũ trong repo." | Agent dùng `context-init`, hỏi lại chỗ chưa rõ (gom một lần), không sửa code |
| E3 | Trả lời câu hỏi; để agent viết xong | `PROJECT_CONTEXT.md` có mục `## Existing documents` dẫn link tới `CLAUDE.md`, `Docs/Continuity.md`, `Docs/Design.md`, `Docs/ADR/001-…`, **không chép nội dung**. `DECISIONS.md` chỉ link tới ADR-001, không viết lại. Task tạo bằng `context_create_task` (số liên tiếp, có dòng trong `STATUS.md`) |
| E4 | Agent đề xuất `AGENTS.md` / sửa `CLAUDE.md` | Hiện diff và chờ duyệt; không tự ghi |
| E5 | Xem app | Thẻ Tài liệu "Sẵn sàng"; tab Task có các task; "Kiểm tra tài liệu" không có cảnh báo |
| E6 | Tạo mốc: `git add -A && git commit -m "after init" && git tag after-init` | Lần sau reset về `after-init` thay vì chạy lại agent |

## F. Kiểm tra cuối

| # | Làm | Đạt khi |
|---|---|---|
| F1 | `git status` trong ba repo | Chỉ có file agent cố ý viết hoặc bạn tạo trong bước thử; không có file lạ của AgentHub |
| F2 | `ls ~/.agents/skills` | Không có skill `context-*` |
| F3 | Ghi % usage tuần của A, B, C | So với bước 0.6 |
| F4 | Reset ba repo về `baseline` (runner về `after-init`); gỡ project thử khỏi AgentHub nếu muốn | |

## G. Sau ADR-028 và ADR-029: làm tiếp bằng một câu, Công cụ agent, sửa lỗi I1–I5

Chạy sau bước 0. G1–G2 không gọi agent. G3–G4 dùng agent với câu rất ngắn. Ở G3 **không mở qua AgentHub**: tự mở Terminal.app (hoặc tab Code của Claude Desktop) trong folder `sandbox_shooter`.

### G1. Công cụ agent (0 token)

| # | Làm | Đạt khi |
|---|---|---|
| G1.1 | Mở Cài đặt (⌘,) | Chỉ còn ba tab: Chung, Account, Nâng cao |
| G1.2 | Gỡ MCP của C trên trang của C (bấm C ở thanh bên, menu ⋯ của dòng MCP) | Dòng **Công cụ agent** ở thanh bên có chấm vàng và số 1; dòng C có chấm vàng |
| G1.3 | Thanh bên → Công cụ agent | Mỗi account một dòng: số skill, MCP, đúng một nút (Cài / Cập nhật / Xem). Dòng C có nút **Cài** |
| G1.4 | "Cài đủ cho tất cả" | Hộp thoại nêu C và "MCP "agenthub""; account chính (nếu có) có dòng cảnh báo riêng. Bấm Cài: câu tóm tắt thành "Mọi account đã đủ công cụ.", chấm vàng mất |
| G1.5 | Công cụ agent → Lệnh nhanh; bấm một lệnh | Bảng có câu ngắn ("làm tiếp") và lệnh gọi skill (`/context-resume`), không có số task mẫu, không có nút chọn Claude/Codex; bấm thì báo đã copy |
| G1.6 | Bấm A ở thanh bên → "Công cụ agent của account này" | Menu còn "Mở trong Desktop", "Mở trong Terminal". Trang của A: usage, "Tự cài khi mở", nhóm Skill và nhóm MCP tách riêng, Lệnh nhanh cho Claude; hai nút Desktop và Terminal ngang nhau |
| G1.7 | Trang của account Codex free | Có thanh usage (hạn mức 30 ngày), không còn trống (I5) |

### G2. Task và giao diện (0 token)

| # | Làm | Đạt khi |
|---|---|---|
| G2.1 | Tab Task → tạo task "Xoá thử" → mở → ⋯ → "Xoá task…" → Xoá | File vào Thùng rác của macOS; dòng biến khỏi bảng `STATUS.md`, xuất hiện ở mục "Deleted tasks" (hoặc "Task đã xoá") cuối file |
| G2.2 | Tạo task mới ngay sau đó | Nhận số **kế tiếp số đã xoá**, không dùng lại số đó (I1) |
| G2.3 | Tạo workstream "Thử xoá" → nút ⋯ cạnh "Tạo task" → "Xoá workstream "Thử xoá"…" | Folder vào Thùng rác; `README.md` của bộ tài liệu có mục "Deleted workstreams" |
| G2.4 | Làm lệch trạng thái một task (sửa dòng `Status:` bằng editor), "Kiểm tra tài liệu" ở Tổng quan | Thẻ Tài liệu liệt kê cảnh báo **kèm số task**; bấm số task thì mở đúng task ở tab Task (I4) |
| G2.5 | Thu hẹp cửa sổ còn khoảng 1000px, mở panel Tài liệu (⌘⇧E) và một file | Cây file nằm trên, nội dung bên dưới; không chữ nào đè nhau (I2) |
| G2.6 | Trong panel task, "Làm tiếp task này" khi panel hẹp | Mỗi account một hàng, usage xuống dưới tên; có nút **×** để đóng (I3) |
| G2.7 | Panel task → "Copy lệnh" | Menu có câu ngắn và một lệnh `/context-resume TASK-…` dùng chung cho Claude và Codex, đúng số task |
| G2.8 | Tổng quan của shooter | Không còn thanh "Task cho lần mở tới"; dòng Tiến độ chỉ để xem (trạng thái, Lần lưu cuối / Task / Sau lần lưu, câu "Muốn lưu: gõ lưu lại…"), không còn nút; danh sách account không có nút nào tô đậm; khung Tài liệu context không còn "Copy lời nhắc đối chiếu" |
| G2.9 | Tab Cài đặt của project | Có "Đổi folder" và "Gỡ project"; thanh tab không còn menu ⋯ |

### G3. Làm tiếp bằng một câu, không qua AgentHub

| # | Làm | Đạt khi |
|---|---|---|
| G3.1 | Terminal.app: `cd` vào `sandbox_shooter`, chạy `claude` với account A (`CLAUDE_CONFIG_DIR` của A, hoặc mở Terminal của A từ trang của A rồi `cd`). Gõ: **làm tiếp TASK-004** | Agent gọi `context_here` rồi `context_task`, dùng `context-resume`; không hỏi đường dẫn tài liệu; nêu đúng TASK-004, cảnh báo kèm số task; chưa sửa code |
| G3.2 | Gõ: **trạng thái sao rồi** | Trả lời vài dòng (task đang làm, chờ duyệt, bị chặn, cảnh báo, thay đổi chưa commit); không đọc thêm tài liệu, không đề xuất việc |
| G3.3 | Cho agent làm một tiêu chí nhỏ của TASK-004 | Sau khi tick tiêu chí, Handoff log có mục ngắn `(short)` mà bạn không nhắc |
| G3.4 | Gõ: **lưu lại** | Checkpoint đầy đủ; các mục `(short)` trước đó được gộp |
| G3.5 | Phiên mới, gõ `/context-resume TASK-004` | Chạy đúng skill như G3.1 |
| G3.6 | Lặp G3.1, G3.2 với `codex` (account C); thử `/context-resume TASK-004` | Ghi lại Codex có tự nhận câu ngắn không. Lệnh `/` và `$` đều chạy (người dùng đã thử 2026-11-10) |
| G3.7 | Gỡ `context-checkpoint` khỏi C (trang của C). Trong phiên `codex`, gõ **lưu lại** | Agent báo thiếu skill và chỉ chỗ cài trong AgentHub; không tự chép skill. Cài lại sau bước này |

### G4. Mở từ AgentHub

| # | Làm | Đạt khi |
|---|---|---|
| G4.1 | TASK-004 → "Làm tiếp task này" với A (Terminal) | Lời nhắc gửi đi chỉ là "Làm tiếp TASK-004." (cộng câu chọn ngôn ngữ); agent làm như G3.1 |
| G4.2 | Tắt "Tự cài khi mở" của một account rồi gỡ một skill của nó; mở lại TASK-004 bằng account đó | Lời nhắc quay về dạng dài, có tên skill và đường dẫn tài liệu |

## Bảng kết quả

Điền khi chạy; gửi lại nguyên bảng cùng các ghi chú. Cột "Thao tác" là số lần click, copy, dán hoặc gõ giải thích lại cho bước đó, nếu bạn muốn đo mức giảm thao tác.

| Bước | Kết quả | Thao tác | Ghi chú |
|---|---|---|---|
| A1 | | | |
| A2 | | | |
| A3 | | | |
| A4 | | | |
| A5 | | | |
| B1 | | | |
| B2 | | | |
| B3 | | | |
| B4 | | | |
| B5 | | | |
| B6 | | | |
| C1–C8 | | | |
| D1–D4 | | | |
| E1–E6 | | | |
| F1–F4 | | | |
| G1 | | | |
| G2 | | | |
| G3 (Claude) | | | |
| G3 (Codex) | | | |
| G4 | | | |
| Usage trước → sau | A: · B: · C: | | |

## Điểm cần bạn quyết định khi thử

Lấy từ [danh sách thử](phase3-acceptance.md); để ý khi chạy rồi cho ý kiến:

- Account bật "Tự cài khi mở" được cài skill và MCP khi mở **mọi** project, kể cả project tắt tài liệu.
- Chat rời không thuộc project nên **mọi** account có MCP của AgentHub đều đọc được.
- Fallback transcript chỉ được đề xuất khi project đã có ít nhất một checkpoint hoặc handoff.
- Lời nhắc và skill viết bằng tiếng Anh; tài liệu theo ngôn ngữ chọn cho project.
