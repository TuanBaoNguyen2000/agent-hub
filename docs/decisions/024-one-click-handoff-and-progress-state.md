# ADR-024 — Chuyển việc một nút và trạng thái tiến độ

**Status:** Accepted (người dùng duyệt 2026-11-09)  
**Date:** 2026-11-09  
**Decision source:** Người dùng nói việc duy trì context giữa các phiên và account "còn khá thủ công", muốn "bấm 1 nút trên UI là dùng được (hoặc 1–2 thao tác cần thiết)", giao diện dễ nhận biết hơn (2026-11-09). [Review giao diện](../research/2026-11-09-ui-review.md) đo được 7–8 thao tác và hai lần chuyển app cho một lần đổi account. Người dùng đồng ý các đề xuất và câu trả lời Q1–Q4 trong [danh sách việc](../plans/2026-11-09-context-flow-backlog.md) (2026-11-09). ADR này gồm các mục B1–B4, B8, D4, E4, F1, F2, F3 (một phần) của danh sách đó. Sửa đổi [ADR-019](019-agent-maintained-context.md) mục 7 và 10, [ADR-020](020-phase3-review-changes.md) mục 1, [ADR-023](023-project-setup-tasks-and-panels.md) mục 5 và 9.

## Context

- Đổi account hiện cần: biết là nên đổi (chip usage), copy lời nhắc checkpoint ở dòng thứ tư thẻ Tài liệu, dán vào phiên cũ, tự mở task để xem đã ghi chưa, chọn task, chọn account trong dropdown, chọn Desktop hoặc Terminal, đọc bảng "Trước khi mở", bấm Mở, rồi với Desktop thì dán lời nhắc.
- Dữ liệu để rút gọn đã có nhưng chỉ hiện lúc bấm mở hoặc trong panel task: handoff mới nhất của từng task (giờ, account, agent), Git observation (commit mới hơn handoff), phiên mới hơn checkpoint (TDD §7.6), usage theo account (FR-018), theo dõi file tài liệu (ADR-021 mục 9).
- Ghi bù từ transcript (ADR-019 mục 10) cần tick đồng ý mỗi lần mở, mặc định không tick, và đọc "200 dòng cuối". Một dòng JSONL có thể chứa nguyên file hoặc output lệnh, nên 200 dòng có khi tới hàng trăm KB.
- Khi account cũ đã hết quota, cách duy nhất để không mất phần việc sau checkpoint là ghi bù từ transcript.
- Chèn lời nhắc vào phiên Desktop hay vào cửa sổ Terminal đang chạy không có cách chính thức. Bỏ bước dán ở Desktop thuộc ADR-025 (hook, file chỉ dẫn cấp account), sau spike.

## Decision

1. **Trạng thái tiến độ của project.** AgentHub tính một trạng thái từ dữ liệu đã có, không gọi model:
   - **Mốc lưu:** handoff mới nhất trong mọi task (project có tài liệu) hoặc file handoff mới nhất (project không có tài liệu); kèm giờ, account, agent, task.
   - **Có việc chưa lưu** khi có ít nhất một: commit mới hơn mốc lưu; phiên Claude hoặc Codex của folder project (mọi account được phép, cách định vị như TDD §7.6) hoạt động muộn hơn mốc lưu quá một phút. Thay đổi chưa commit mà không có phiên hay commit mới hơn thì vẫn là đã lưu, vì handoff có ghi file chưa commit.
   - **Đã lưu** khi có mốc lưu và không có điều trên. **Chưa có checkpoint** khi không có mốc lưu.
   - Tính lại khi cửa sổ được focus, khi file tài liệu đổi, khi bấm Tải lại, và mỗi 60 giây khi trang project đang mở. Định vị phiên vẫn chỉ đọc metadata (ADR-019 mục 10).

2. **Dòng Tiến độ** ở đầu tab Tổng quan, trên mọi thẻ khác: chấm màu kèm chữ theo ADR-023 mục 8 ("Đã lưu · 17:40 hôm qua · Claude B · TASK-001", "Có việc chưa lưu · phiên Claude A hoạt động tới 18:25", "Chưa có checkpoint"), bên phải là nút chính **Chuyển sang account khác** và menu phụ (Copy lời nhắc checkpoint, Xem handoff mới nhất). Cùng chấm hiện ở dòng project trong sidebar, có tooltip. Nút "Copy lời nhắc checkpoint" rời thẻ Tài liệu và tab Handoff sang dòng này. Sửa ADR-023 mục 9.

3. **Chuyển sang account khác** (nút ở dòng Tiến độ, ở panel chi tiết task, và trong menu của chip usage):
   - **Bước người dùng:** chọn account đích trong danh sách (mục 5). Account đầu danh sách đã được chọn sẵn, nên thường chỉ cần một lần bấm nữa.
   - **Account nguồn** là account của phiên mới nhất trong project (định vị phiên), nếu không có thì của lần mở gần nhất trong lịch sử.
   - **Task** là task đang chọn ở Tổng quan; nếu chưa chọn thì task có handoff mới nhất.
   - AgentHub chọn một trong hai cách, người dùng đổi được ngay trong hộp chọn:
     - **Lưu rồi chuyển** (mặc định khi trạng thái là *Có việc chưa lưu* và account nguồn còn quota): AgentHub copy lời nhắc checkpoint, hiện "Dán vào phiên đang làm ở <account nguồn>; đang chờ agent ghi tiến độ…", theo dõi file task và `STATUS.md`. Khi một handoff mới xuất hiện, AgentHub mở account đích luôn, không hỏi lại. Trong lúc chờ có hai nút: **Mở luôn, không chờ** (chuyển sang cách dưới) và Huỷ.
     - **Chuyển ngay** (mặc định khi account nguồn đã hết quota, khi trạng thái là *Đã lưu* hoặc *Chưa có checkpoint*): mở account đích ngay. Nếu có việc chưa lưu và project đã đồng ý đọc transcript (mục 4), lời nhắc kèm yêu cầu ghi bù bằng `context-recover` (mục 6).
   - Mở theo cách mặc định của account đích (mục 7). Sửa ADR-019 mục 7: lời nhắc vẫn là `context-resume`, cộng phần ghi bù khi có.

4. **Đồng ý đọc transcript theo project.** Thay ô tick mỗi lần mở bằng một lựa chọn lưu trong cài đặt project: Không bao giờ / Hỏi mỗi lần / Luôn cho phép trong cùng provider. Mặc định là Hỏi mỗi lần. Lần hỏi đầu có hai nút "Cho phép lần này" và "Luôn cho phép với project này". Phiên nguồn khác provider với account đích thì luôn hỏi, kèm cảnh báo như hiện nay. Sửa trong tab Cài đặt của project. Sửa ADR-019 mục 10 (bước xác nhận).

5. **Danh sách account có usage** thay dropdown, ở tab Tổng quan và trong hộp chọn của mục 3:
   - Mỗi dòng: tên account, hai thanh usage (5 giờ, tuần) kèm giờ đặt lại, trạng thái (Sẵn sàng, Đăng nhập dở, Hết hạn mức, Không được phép dùng project) và nút mở.
   - Xếp: account được phép và còn quota lên đầu, theo phần trăm còn lại của cửa sổ đang cạn nhất; account nguồn của lần chuyển xuống dưới; account không dùng được ở cuối, có ghi lý do.
   - Chip usage ở sidebar ghi rõ cửa sổ ("Tuần 71%").
   - Không tự đổi account khi chạm hạn mức (FR-018 giữ nguyên); AgentHub chỉ gợi ý.

6. **Ghi bù dùng skill `context-recover`** thay cho lời nhắc "đọc 200 dòng cuối" (`prompt.transcript`). Lời nhắc đưa đường dẫn transcript và giờ của mốc lưu. Skill lọc theo giờ, bỏ thân kết quả tool và giới hạn kích thước đầu ra trước khi đọc. Cách lọc thuộc [ADR-026](026-skill-structure-and-management.md). AgentHub vẫn không đọc nội dung transcript. Sửa ADR-019 mục 10 ("phần cuối" thành "phần sau mốc lưu, đã lọc").

7. **Một nút mở cho mỗi account:**
   - Nút tách: phần chính mở theo cách nhớ cho account đó (Desktop hoặc Terminal, mặc định là cách dùng lần trước), mũi tên chọn cách kia.
   - Bảng "Trước khi mở" chỉ hiện khi cần người dùng quyết định: dùng account cho project lần đầu (FR-016); đọc transcript khi lựa chọn ở mục 4 là Hỏi mỗi lần; cài công cụ vào account chính; version Desktop chưa kiểm chứng (ADR-013, ADR-014). Khi hiện, tiêu đề ghi "Mở <account> bằng <cách mở> · <task>" và nút Mở luôn thấy được, không phải cuộn.
   - Cảnh báo không cần quyết định (branch khác `STATUS`, commit mới hơn handoff, thiếu công cụ ở account riêng đã bật tự cài) thành một dòng trong thông báo sau khi mở, không chặn.
   - Sửa ADR-020 mục 1 (hệ quả "bảng trước khi mở chỉ báo thiếu công cụ").

8. **Cài công cụ tại chỗ.** Khi account thiếu skill, MCP hoặc (sau ADR-025) file chỉ dẫn, bảng trước khi mở và dòng account có nút "Cài cho account này". Màn Công cụ agent có thêm "Cài tất cả". Đây vẫn là thao tác rõ ràng của người dùng, nên FR-017 giữ nguyên với account chính.

9. **Nhắc khi gần hết quota.** Khi một cửa sổ usage của account trong phiên mới nhất vượt 85%, chip usage chuyển màu vàng và dòng Tiến độ hiện "<account> sắp hết hạn mức · Lưu tiến độ". Bấm vào thì copy lời nhắc checkpoint. Ngưỡng là hằng số, chưa cho chỉnh.

10. **Nhãn trong panel task:** "Mở agent với task này" đổi thành **Làm tiếp task này** và mở ngay bằng account mặc định của project: account dùng gần nhất cho project, được phép, còn quota. Nếu không có account như vậy thì mở danh sách ở mục 5. "Nhờ agent" đổi thành **Nhờ agent viết tiêu chí**. Sửa ADR-023 mục 5.

## Không thuộc ADR này

- Bỏ bước dán lời nhắc ở Desktop, checkpoint giữa chừng, trạng thái agent đang chạy: ADR-025, sau spike S1–S3 của danh sách việc.
- Cấu trúc skill, `context-recover`, quản lý skill: ADR-026.
- Các sửa giao diện không đổi quyết định (bố cục hẹp, thẻ Tài liệu, chữ): ghi vào STATUS khi làm.

## Triển khai (2026-11-09)

- **Application** (`packages/application/src/launching.ts`): `progress(projectId)` tính trạng thái từ checkpoint mới nhất (tài liệu hoặc handoff), phiên mới nhất của folder trong các account được phép (chỉ metadata), và giờ của HEAD; `preferredMode` nhớ cách mở lần trước theo account; `transcriptConsent`/`setTranscriptConsent` theo project; preview có `transcriptAutomatic` và lời nhắc tự kèm `context-recover` khi project cho phép và cùng provider; `execute` nhận `rememberTranscript`.
- **Lưu:** cách mở và lựa chọn transcript nằm trong bảng `settings` sẵn có (khoá `launch_mode:<account>`, `transcript_consent:<project>`), không cần migration như phần Consequences dự kiến.
- **Giao diện:** dòng Tiến độ ở đầu Tổng quan (menu ⋯: copy lời nhắc checkpoint, mở task) và chấm ở sidebar cho project chưa lưu hoặc chưa có checkpoint; hộp "Chuyển sang account khác" với Lưu rồi chuyển (copy lời nhắc, kiểm tra mỗi 3 giây và khi cửa sổ được focus, tự mở account đích khi có handoff mới) và Chuyển ngay; danh sách account có thanh usage, trạng thái, nút tách; bảng "Trước khi mở" là hộp thoại, chỉ hiện khi cần quyết định, có "Cài cho account này" và ba lựa chọn transcript; panel task "Làm tiếp task này" mở ngay account mặc định, "Nhờ agent viết tiêu chí"; chip usage ghi tên cửa sổ; tab Cài đặt của project chọn được Không bao giờ / Hỏi mỗi lần / Luôn trong cùng provider.
- **Khác với dự kiến:** project không có tài liệu vẫn giữ nút copy lời nhắc ở tab Handoff (cạnh dán handoff); dòng Tiến độ cũng có lời nhắc đó. Bước dán lời nhắc ở Desktop vẫn còn, chờ ADR-025.
- **Kiểm chứng:** 426 unit test (thêm test cho trạng thái tiến độ, lựa chọn transcript, cách mở được nhớ), typecheck, lint; 30 E2E (2 bỏ qua như trước), gồm test mới cho dòng Tiến độ, hộp chuyển account và lựa chọn transcript. Chưa thử với account và phiên thật: luồng Lưu rồi chuyển chờ handoff thật, ghi bù từ transcript thật, chi phí định vị phiên khi có nhiều session.

## Consequences

- **SQLite:** migration thêm cách mở ưa dùng theo account và lựa chọn đọc transcript theo project. Backup trước migration như các lần trước.
- **Định vị phiên chạy định kỳ:** 60 giây một lần khi trang project mở, thay vì chỉ lúc bấm mở. Cần kiểm tra chi phí với account có nhiều session; Codex đọc bảng `threads` chỉ-đọc.
- **Luồng "Lưu rồi chuyển"** dựa vào theo dõi file. Agent ghi qua MCP vào tài liệu ngoài repo thì file vẫn đổi trên đĩa, nên vẫn bắt được. Agent không checkpoint thì người dùng bấm "Mở luôn, không chờ".
- **Mở account tự động** khi thấy handoff mới là hành vi mới: thông báo sau khi mở phải nói rõ account nào đã được mở và vì sao.
- **Lời nhắc và chữ mới** vào ba bảng dịch. `prompt.transcript` được thay bằng lời nhắc dùng `context-recover`.
- **Kiểm thử:** E2E đổi theo dòng Tiến độ, danh sách account, nút tách và bảng trước khi mở; unit test cho cách tính trạng thái tiến độ và thứ tự account. Danh sách thử Phase 3 thêm scenario "chuyển account một nút" ở cả hai cách.
- **TDD:** §7.5, §7.6, §7.7, §8 và §9 sửa theo ADR này khi triển khai.

## References

- [Danh sách việc 2026-11-09](../plans/2026-11-09-context-flow-backlog.md), [review giao diện](../research/2026-11-09-ui-review.md), [đánh giá Orca](../research/2026-11-06-orca.md)
- [ADR-019](019-agent-maintained-context.md), [ADR-020](020-phase3-review-changes.md), [ADR-021](021-task-and-document-management.md), [ADR-023](023-project-setup-tasks-and-panels.md), [ADR-026](026-skill-structure-and-management.md)
- TDD §7.5–§7.7, §8; FR-016, FR-017, FR-018
