# Danh sách việc: context một nút, trạng thái agent, skill, giao diện (2026-11-09)

**Mục đích:** gom mọi việc đã bàn từ 2026-11-06 đến 2026-11-09. Người dùng đã duyệt; quyết định nằm ở [ADR-024](../decisions/024-one-click-handoff-and-progress-state.md) và [ADR-026](../decisions/026-skill-structure-and-management.md) (Accepted 2026-11-09), ADR-025 chờ spike. Danh sách này dùng để theo dõi thứ tự và ưu tiên.

**Tiến độ:** D1–D5, E1, E2 xong 2026-11-09 (ADR-026); B1–B4, B8, E4, F1, F2 và một phần F3 xong 2026-11-09 (ADR-024). Xem mục Triển khai của từng ADR. Tiếp theo: người dùng thử với account thật; spike S1, S3 cho ADR-025; F3–F7 còn lại.

**Nguồn:**
- [Đánh giá Orca](../research/2026-11-06-orca.md)
- [Review giao diện](../research/2026-11-09-ui-review.md); trong bảng, "UI #n" là đề xuất số n của bản này.
- Trao đổi trong phiên về skill, MCP, `CLAUDE.md`/`AGENTS.md` và trạng thái agent.

**Cách sửa:** đổi cột **Ưu tiên** (P0 làm ngay, P1 làm sau P0, P2 để sau, ✗ bỏ), sửa mô tả, hoặc ghi ý kiến vào mục "Câu hỏi cần chốt" ở cuối.

## Mục tiêu

1. Chuyển việc sang account hoặc agent khác bằng **một nút**, tối đa thêm một hai thao tác thật sự cần.
2. Nhìn vào là biết **tiến độ đã được lưu chưa**, lưu lúc nào, bởi ai.
3. Thấy **agent nào đang chạy và đang làm gì** ngay trong AgentHub.
4. Skill **gọn, nhất quán**, xem và sửa được trong app.
5. Giao diện **ít bước, nhãn rõ**, dùng được ở cửa sổ hẹp.

## A. Spike cần làm trước

Spike chỉ kiểm chứng, không phải tính năng. Các việc ở mục B và C dựa vào kết quả spike.

| ID | Việc | Cần biết | Mở khoá | Ưu tiên |
|---|---|---|---|---|
| S1 | Hook của Claude Code chạy với `CLAUDE_CONFIG_DIR` của account | `SessionStart` có chèn được ngữ cảnh (`additionalContext`) không; `Stop`, `SessionEnd`, `Notification`, `PreCompact` có chạy không; **tab Code của Claude Desktop** (instance riêng) có chạy hook trong `settings.json` của account không | B6, B7, C1–C3 | P0 |
| S2 | Hook của Codex | Phiên bản CLI hiện có hỗ trợ hook nào; ChatGPT.app có chạy hook trong `CODEX_HOME` không | C1–C3 cho Codex | P1 |
| S3 | File chỉ dẫn cấp account | CLI và tab Code của Desktop có đọc `<CLAUDE_CONFIG_DIR>/CLAUDE.md` không; Codex và ChatGPT.app có đọc `<CODEX_HOME>/AGENTS.md` không | B5 | P0 |

## B. Luồng chuyển việc một nút

| ID | Việc | Chi tiết | Phụ thuộc | Ưu tiên |
|---|---|---|---|---|
| B1 | **Dòng "Tiến độ" và chấm trạng thái** (UI #1) | Đầu tab Tổng quan: "Lưu lần cuối 17:40 · Claude B · TASK-001". Chấm *Đã lưu* / *Có việc chưa lưu* / *Chưa có checkpoint*, tính từ handoff mới nhất, commit mới hơn và phiên mới hơn checkpoint. Cùng chấm hiện ở dòng project trong sidebar. Nút copy lời nhắc checkpoint chuyển vào dòng này | Không (dữ liệu đã có) | P0 |
| B2 | **Nút "Chuyển sang account khác"** | Có hai cách, xem câu hỏi Q1:<br>(a) *Lưu rồi chuyển*: copy lời nhắc checkpoint, AgentHub theo dõi file task, khi có handoff mới thì báo "Đã lưu" và bật nút mở account đích (UI #2).<br>(b) *Chuyển ngay*: mở account đích luôn; agent mới tự ghi bù từ cuối transcript (dùng được cả khi account cũ đã hết quota) | B1, B4, D4 | P0 |
| B3 | **Gợi ý account đích theo usage** | Danh sách xếp theo phần trăm quota còn lại (FR-018). Account hết hạn mức hoặc đăng nhập dở xuống cuối, có ghi lý do | F2 | P0 |
| B4 | **Đồng ý đọc transcript nhớ theo project** | Thay ô tick mỗi lần mở (TDD §7.6, mặc định không tick). Hỏi lại khi khác provider | Không | P0 |
| B5 | **File chỉ dẫn cấp account** | AgentHub cài một đoạn ngắn có đánh dấu vào `<config>/CLAUDE.md` và `<CODEX_HOME>/AGENTS.md`, nội dung: "nếu MCP `agenthub` có mặt và folder là project có tài liệu, dùng `context-resume`; cuối phiên dùng `context-checkpoint`". Cài và gỡ ở màn Công cụ agent như skill. Không chép nội dung tài liệu vào file (ADR-019 mục 9 vẫn giữ) | S3 | P1 |
| B6 | **Hook `SessionStart` bỏ bước dán lời nhắc ở Desktop** | Hook chèn lời nhắc resume khi phiên bắt đầu trong folder project. Nếu B5 đủ dùng thì có thể bỏ việc này | S1 | P1 |
| B7 | **Checkpoint giữa chừng** | Skill: sau mỗi acceptance criterion xong, ghi một dòng handoff ngắn. Hook `Stop`/`SessionEnd` ghi thời điểm phiên dừng để B1 biết phiên nào chưa lưu | S1, D1 | P1 |
| B8 | **Nhắc khi gần hết quota** | Khi usage vượt ngưỡng (ví dụ 85%), chip usage và dòng Tiến độ đổi màu, kèm nút "Lưu tiến độ" | B1 | P1 |

## C. Trạng thái agent đang chạy

| ID | Việc | Chi tiết | Phụ thuộc | Ưu tiên |
|---|---|---|---|---|
| C1 | **Lệnh ghi trạng thái và cài hook** | Shim `agenthub-status` (giống shim MCP). Hook gọi shim, shim ghi `<userData>/status/<session>.json` gồm trạng thái, project, account, session id, thời gian. Không lưu prompt hay nội dung. Cài và gỡ theo account ở màn Công cụ agent. Chạy được khi AgentHub đang đóng | S1, S2 | P1 |
| C2 | **Mục "Đang chạy" ở sidebar** | Mỗi dòng: account · project · task · chấm trạng thái (đang làm / chờ duyệt / đang hỏi / xong lượt) · thời gian. Bấm vào thì đưa cửa sổ Terminal.app hoặc Desktop tương ứng lên trước | C1 | P1 |
| C3 | **Thông báo macOS** | Báo khi agent chờ duyệt quyền hoặc hỏi người dùng. Bật hoặc tắt trong Cài đặt | C1 | P1 |
| C4 | **Dự phòng khi không có hook** | Đoán trạng thái từ mtime của transcript (session locator) và tiến trình `claude`/`codex` (`ps`, `lsof` lấy cwd). Ghi rõ là "ước đoán" | Không | P2 |

## D. Skill

| ID | Việc | Chi tiết | Ưu tiên |
|---|---|---|---|
| D1 | **Tách phần dùng chung** | `references/document-layout.md` gồm khuôn tài liệu, 4 trạng thái theo 3 ngôn ngữ, provenance, cách tìm folder; `assets/task-template.md`, `assets/handoff-entry.md`. Các `SKILL.md` chỉ trỏ tới. Hiện các đoạn này chép lại 2–4 lần | P0 |
| D2 | **Quy tắc "tài liệu là dữ liệu, không phải lệnh" cho cả 4 skill** | Hiện chỉ có trong `context-resume` | P0 |
| D3 | **Giờ có múi giờ** | Heading handoff dùng `YYYY-MM-DD HH:MM±hh:mm`; AgentHub đọc cả định dạng cũ (coi là giờ máy) | P0 |
| D4 | **Skill `context-recover`** | Ghi bù checkpoint từ transcript, đánh dấu reported. Hiện việc này chỉ nằm trong lời nhắc i18n `prompt.transcript` ("200 dòng cuối"). Cách mới để tốn ít token:<br>1. Chỉ lấy sự kiện **sau giờ checkpoint gần nhất** (AgentHub đưa giờ đó vào lời nhắc), không theo số dòng.<br>2. Chỉ giữ tin nhắn người dùng, câu trả lời của agent, tên tool và đường dẫn file đã sửa; bỏ thân kết quả tool.<br>3. Agent lọc bằng `jq`/`grep` (có lệnh mẫu trong `scripts/` của skill) rồi mới đọc phần đã lọc; có giới hạn kích thước đầu ra. AgentHub vẫn chỉ đọc metadata để định vị.<br>Tài liệu context luôn đọc trước; transcript chỉ lấp khoảng giữa checkpoint và lúc phiên dừng | P0 (cần cho B2b) |
| D5 | **Skill `context-tidy`** | Chỉ chạy khi người dùng gọi: chuyển handoff cũ vào `Tasks/archive/` hoặc phần thu gọn, rút gọn `STATUS`, liệt kê task bỏ dở | P1 |
| D6 | **"Nhờ agent viết tiêu chí" thành một mục của skill** | Hiện là lời nhắc `prompt.refineTask` | P2 |

## E. Quản lý skill và công cụ agent

| ID | Việc | Chi tiết | Ưu tiên |
|---|---|---|---|
| E1 | **Xem đầy đủ skill trong app** | Xem `SKILL.md` và các file phụ. Khi app cập nhật skill có sẵn thì hiện diff với bản cũ | P1 |
| E2 | **Skill riêng cập nhật được** | Nút "Cập nhật từ folder gốc" có diff trước khi chép đè, hoặc sửa trực tiếp bản của AgentHub. Skill có sẵn vẫn không sửa được, vì sẽ bị chép đè mỗi lần app khởi động | P1 |
| E3 | **Cài skill cấp project** | Vào `<repo>/.claude/skills` (và chỗ tương ứng của Codex) khi tài liệu nằm trong repo. TDD §7.4 có nhắc nhưng chưa làm | P2 |
| E4 | **Cài công cụ tại chỗ** (UI #8) | Nút "Cài cho account này" và "Cài tất cả" ngay trong bảng trước khi mở | P0 |

## F. Giao diện (từ review)

| ID | Việc | UI # | Ưu tiên |
|---|---|---|---|
| F1 | **Một nút mở cho mỗi account**, nhớ Desktop hay Terminal theo account; bảng "Trước khi mở" chỉ hiện khi có việc phải quyết định | #3 | P0 |
| F2 | **Account ở Tổng quan là danh sách** có hai thanh usage (5 giờ, tuần) và trạng thái; chip sidebar ghi rõ "Tuần 71%" | #4 | P0 |
| F3 | **Nhãn và lối mở:** "Làm tiếp task này" mở ngay; "Nhờ agent viết tiêu chí"; "Đổi" task tại chỗ; menu account ở sidebar mở trong project đang xem | #5 | P1 |
| F4 | **Bố cục hẹp:** thanh tab không xuống dòng, sidebar tự ẩn dưới ~1000px, panel Tài liệu không đè chi tiết task, thanh tiêu đề rút gọn đường dẫn | #6 | P1 |
| F5 | **Cây thư mục bên trái** panel Tài liệu; chưa chọn file thì mở `STATUS.md` | #7 | P2 |
| F6 | **Gọn thẻ Tài liệu:** rút gọn đường dẫn, gom ba nút kiểm tra, cảnh báo nêu tên task | #9 | P1 |
| F7 | **Chữ:** một tên cho account chính, mô tả skill dịch theo giao diện, cột handoff "17:40 · Claude B", ẩn tab Task ở project chưa dùng tài liệu | #10 | P2 |
| F8 | **Mẫu lời nhắc theo task** (từ Orca): chọn ý định khi mở (làm task, điều tra lỗi, viết tiêu chí, test plan, checkpoint), cộng mẫu tự viết theo project | — | P2 |

## H. Khuôn tài liệu (đánh giá 2026-11-09)

Từ đánh giá layout trong `references/document-layout.md` có hỏi "dùng được cho mọi loại project chưa". Khuôn không có gì riêng cho Unity; các mục dưới là chỗ yếu khi dùng nhiều account song song, project nhỏ hoặc repo đã có tài liệu. `Inbox/` (thiếu trong layout dù app đã ghi vào đó) đã bổ sung vào layout, `context-resume` và `context-capture` ngày 2026-11-09. Người dùng duyệt ưu tiên dưới đây (2026-11-09). H1, H2, H5 nằm trong [ADR-027](../decisions/027-task-numbers-state-source-and-existing-docs.md) (Accepted 2026-11-09, triển khai 2026-11-10).

| ID | Việc | Chi tiết | Ưu tiên |
|---|---|---|---|
| H1 | **Số task không trùng khi nhiều account cùng tạo** | Quy tắc "số lớn nhất + 1" cho hai agent song song cùng ra `TASK-007`; `base_sha256` không chặn vì là hai file khác tên. Hướng: tool MCP `context_new_task` cấp số và tạo file nguyên tử; skill dùng tool đó khi có MCP, không có MCP thì kiểm tra lại số ngay trước khi ghi và đổi số nếu đã có | P1 |
| H2 | **Một nguồn cho trạng thái task** | Hiện ghi ở dòng `Status:` của file task và ở bảng trong `STATUS.md`, agent dễ sửa một chỗ quên chỗ kia. Hướng: file task là nguồn duy nhất; bảng trong `STATUS.md` bỏ cột trạng thái hoặc do AgentHub/`context-tidy` sinh lại; AgentHub cảnh báo khi hai nơi lệch (trong lúc chuyển đổi) | P1 |
| H3 | **Gom `<TOPIC>.md` vào `Notes/`** | Gốc thư mục đầy file viết hoa ở project lớn hoặc monorepo, dễ trùng tên với `README.md`/`PROJECT_CONTEXT.md`. AgentHub và skill vẫn đọc file ở gốc của bộ tài liệu cũ | P2 |
| H4 | **Khuôn nhẹ cho project nhỏ** | `BRIEF.md` và `DECISIONS.md` chỉ tạo khi có nội dung; `context-init` không tạo file rỗng; `context-resume` bỏ qua file không có | P2 |
| H5 | **Repo đã có tài liệu: link, không chép** | Repo có `docs/STATUS.md`, ADR… thì `PROJECT_CONTEXT.md` trỏ tới chúng, `DECISIONS.md` chỉ ghi quyết định chưa có ở chỗ khác. Thêm vào `context-init` và layout | P1 |
| H6 | **Tên thư mục workstream khác `Workstreams/`** | Cho phép (ví dụ `Playables/`) nhưng app và agent phải đọc `README.md` mới biết, dễ đọc sai. Hướng: AgentHub nhận diện theo cấu trúc (thư mục con có `STATUS.md` + `Tasks/`) thay vì theo tên, và test cho trường hợp đổi tên | P2 |

## I. Kết quả thử trên `.app` với account thật (2026-11-10)

Người dùng chạy [kịch bản thử](../testing/phase3-runbook.md) tới B1.2 trên `sandbox_shooter`.

**Kết quả các bước:**
- **Đạt:** chuyển account; A4.2 (cảnh báo branch `thu` khác `VN/playable001`); A4.3 ("Có việc chưa lưu", phiên Codex còn làm tới 14:11); B1.2 (`context-resume` tự tìm ra đủ năm chỗ lệch).
- **Nhận xét chung:** phải chuyển qua lại giữa các cửa sổ quá nhiều. Người dùng chốt giữ màn quản lý Task, còn lời nhắc và việc giữ context thì đơn giản hoá bằng skill và MCP: [ADR-028](../decisions/028-resume-with-one-sentence.md) (Accepted 2026-11-10). Góp ý thêm: cần chọn được giữa câu ngắn và lệnh gọi skill, biết khi account thiếu skill (bổ sung vào ADR-028 mục 7); MCP và skill nằm sâu trong Cài đặt, màn bốn account rối: [ADR-029](../decisions/029-agent-tools-as-main-area.md) (Accepted 2026-11-10).

**Lỗi giao diện còn sửa**, vì màn Task được giữ:

| ID | Việc | Chi tiết | Ưu tiên |
|---|---|---|---|
| I1 | **Xoá task và workstream** | Chưa có. Xoá task: bỏ file và dòng trong `STATUS.md`. Xoá workstream: cả thư mục. Cả hai có hỏi xác nhận, chuyển vào Thùng rác thay vì xoá hẳn. **Số đã cấp không dùng lại**, kể cả khi xoá task số lớn nhất. Đây là trả lời câu hỏi của người dùng: không đổi TASK-010 về TASK-009 sau khi xoá `TASK-009-copy`, vì lịch sử Git và handoff đã nhắc tới số đó với nghĩa khác | P1 |
| I2 | **Panel Tài liệu vỡ khi hẹp** (ảnh 1) | Cây file và vùng xem file đè lên nhau. Cần độ rộng tối thiểu; khi hẹp thì xếp dọc hoặc ẩn cây file. Gần với F4, F5 | P1 |
| I3 | **"Làm tiếp task này" trong panel task** (ảnh 2, 7) | Danh sách account bị nhét vào cột hẹp: chữ và thanh usage đè nhau, không có nút đóng. Cần dòng account co giãn được (usage xuống dòng dưới khi hẹp) và nút đóng hoặc Esc | P0 |
| I4 | **"Có 1 cảnh báo ở các task. Xem ở tab Task"** (ảnh 3) | Mở tab Task nhưng không thấy cảnh báo nào, ở task nào. Cần nêu tên task ngay trong thẻ, và bấm vào thì mở đúng task, cuộn tới cảnh báo. Gần với F6 | P1 |
| I5 | **Account Codex free không hiện usage** (ảnh 6) | Account này chỉ có hạn mức 30 ngày, loại `other`, mà `AccountRow` (`ProjectLaunch.tsx`) lọc bỏ `kind === 'other'`. Khi không có cửa sổ 5 giờ hay tuần thì hiện cửa sổ `other` | P1 |
| I6 | **Thứ tự account trông như ngẫu nhiên** | `orderAccounts` xếp theo phần trăm còn lại (B3, đã duyệt), nên usage đổi là thứ tự đổi theo. Đề xuất: thứ tự cố định như ở sidebar, đánh dấu account được gợi ý. **Chờ người dùng chọn**, vì sẽ đổi B3 | P2 |

## G. Để sau (chưa lên kế hoạch)

- **Resume phiên CLI ở account khác** bằng cách dùng chung thư mục `projects/` giữa các account (cách Orca làm). SPIKE-01 và SPIKE-08 ghi rằng resume chéo account bị từ chối, nhưng đó là khi thư mục session tách riêng. Cần spike mới, và phải hỏi trước khi đụng cấu hình account chính.
- **Danh sách phiên theo project** có nút resume (AI Vault của Orca).
- **Task phụ thuộc task khác** (`Depends on:`).
- **Renderer Markdown** bằng thư viện (`react-markdown` + `remark-gfm` + `rehype-sanitize`) khi `Markdown.tsx` không đủ.
- **Task ↔ worktree** (FR-102).

## Đề xuất chia ADR

| ADR | Phạm vi | Cần spike? | Thứ tự |
|---|---|---|---|
| ADR-024 — Luồng chuyển việc và trạng thái tiến độ | B1–B4, B8, D4, F1, F2, E4; sửa ADR-019 (chuyển ngữ cảnh), ADR-020 mục 1, ADR-023 mục 5 và 9 | Không | 1 |
| ADR-025 — Hook, file chỉ dẫn cấp account và trạng thái agent | B5–B7, C1–C4 | S1–S3 | 2, sau spike |
| ADR-026 — Cấu trúc và quản lý skill | D1–D3, D5–D6, E1–E3 | Không | Song song với ADR-024 |
| ADR-028 — Làm tiếp bằng một câu ngắn | Tool `context_here`, `context_task`; định tuyến câu ngắn; lời nhắc ngắn; phần skill của B7 | Không (kiểm chứng baseline trước) | Sau kết quả thử 2026-11-10 (mục I) |
| ADR-029 — Công cụ agent thành mục chính | Dòng ở thanh bên, trang tổng quan, trang account, Lệnh nhanh; Cài đặt còn ba tab | Không | Cùng đợt với ADR-028 |

F3–F7 không đổi quyết định kiến trúc. Chỗ nào chạm ADR-023 thì ghi trong ADR-024; còn lại ghi vào STATUS khi làm.

## Câu hỏi đã chốt (người dùng đồng ý đề xuất, 2026-11-09)

- **Q1.** B2 có cả hai cách. Mặc định *Lưu rồi chuyển* khi account cũ còn quota, *Chuyển ngay* khi đã hết; luôn có nút "Mở luôn, không chờ".
- **Q2.** Thông báo macOS (C3) mặc định bật, tắt được trong Cài đặt; macOS vẫn hỏi quyền thông báo ở lần đầu.
- **Q3.** File chỉ dẫn cấp account (B5) cài vào account chính chỉ khi người dùng bấm Cài, giống MCP và skill ("Tự cài khi mở" của account chính mặc định tắt, FR-017). Account riêng theo "Tự cài khi mở".
- **Q4.** Viết ADR-024 và ADR-026 ngay; spike S1, S3 chạy song song. ADR-025 viết sau khi có kết quả spike.
