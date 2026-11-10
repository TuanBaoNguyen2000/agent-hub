# ADR-029 — Công cụ agent thành mục chính, có trang tổng quan và trang từng account

**Status:** Accepted (người dùng duyệt 2026-11-10)  
**Date:** 2026-11-10  
**Decision source:** Góp ý của người dùng sau khi thử trên `.app` với account thật (2026-11-10):
- MCP và skill nằm sâu trong Cài đặt, khó thấy và dễ quên, trong khi đây là tính năng chính.
- Màn hiện tại quản lý bốn account cùng lúc nên rối. Nên có chỗ hiện riêng account đang chọn.
- Vì có thể dùng nhiều account cùng lúc, vẫn cần một chỗ quản lý tất cả account, nhưng UI/UX phải tốt hơn.

Đi cùng [ADR-028](028-resume-with-one-sentence.md): việc làm tiếp bằng một câu chỉ chạy được khi account có đủ skill và MCP, nên người dùng phải thấy ngay khi thiếu.

Sửa đổi:
- [ADR-020](020-phase3-review-changes.md) mục 1: chức năng giữ nguyên, chỉ đổi chỗ đặt.
- [ADR-022](022-desktop-shell-layout.md) mục 2 (thanh bên) và mục 3 (các tab của Cài đặt).

## Context

**Hiện trạng:**
- Công cụ agent và MCP server là hai tab trong hộp thoại Cài đặt (ADR-022 mục 3).
- Tab Công cụ agent có danh sách account ở cột trái và chi tiết account ở cột phải. Mỗi skill cộng MCP là một dòng có nút cài/gỡ, thêm bộ đếm và cảnh báo chung cho mọi account.
- Muốn biết account nào thiếu gì thì phải mở Cài đặt, chọn tab, rồi bấm qua từng account.
- Bên ngoài Cài đặt chỉ có bảng trước khi mở và dòng account (ADR-024 mục 8) báo thiếu, tức là chỉ thấy khi đã định mở phiên.

**Vấn đề:**
- Không có chỗ nào cho biết "mọi account đã sẵn sàng chưa" khi nhìn thoáng qua.
- Hộp thoại Cài đặt hợp cho cấu hình ít khi đổi. Skill thì lại đổi theo mỗi bản AgentHub (ADR-026 mục 1: bản chung được làm mới khi app khởi động), nên phải cập nhật thường xuyên.
- Thông tin của một account bị chia ra nhiều nơi: usage ở thanh bên, đăng nhập ở Cài đặt → Account, công cụ ở Cài đặt → Công cụ agent, chi tiết MCP ở tab thứ tư.
- ADR-028 thêm bảng Lệnh nhanh, cần một chỗ dễ thấy để đặt.

## Decision

### 1. Thanh bên: mục "Công cụ agent", account bấm được

- Thêm dòng **Công cụ agent** ngay trên danh sách account ở cuối thanh bên.
  - Khi có account cần xử lý, dòng hiện chấm vàng và số account đó. Mọi account đều ổn thì không hiện chấm.
  - Bấm vào thì vùng làm việc mở trang tổng quan (mục 2).
- **Mỗi dòng account bấm được** và mở trang của account đó (mục 3).
  - Dòng có chấm vàng khi account thiếu skill, thiếu MCP, có skill bản cũ, hoặc trùng tên với skill không do AgentHub tạo.
  - Chip usage giữ nguyên.
- Công tắc **Project | Chat** và danh sách phía trên không đổi. Rời trang công cụ hay trang account thì quay về project hoặc chat đang mở trước đó, chỉ bằng một lần bấm vào mục đó ở thanh bên.

### 2. Trang tổng quan Công cụ agent (mọi account)

1. **Đầu trang:** một câu tóm tắt ("2 account cần cài" hoặc "Mọi account đã đủ công cụ"). Nút **Cài đủ cho tất cả** chỉ hiện khi có account cần xử lý.
   - Trước khi cài, nút liệt kê sẽ cài gì vào account nào. Account chính được nêu riêng, vì FR-017 yêu cầu người dùng chủ động đồng ý.
2. **Mỗi account một dòng**, theo cùng thứ tự với thanh bên:
   - tên và email, provider, chế độ cửa sổ (App chính hay Cửa sổ riêng);
   - skill: số đã cài trên tổng, kèm trạng thái gộp (Đủ, Thiếu, Bản cũ, Trùng tên);
   - MCP: Đã cài, Thiếu, Một phần hoặc Không xác định;
   - **đúng một nút**, theo thứ tự ưu tiên: Cài → Cập nhật → Xem. Bấm vào dòng thì mở trang account.
3. **Ba phần ít dùng ở cuối trang**, mỗi phần là một trang con:
   - **Thư viện skill:** skill có sẵn và skill riêng; thêm skill riêng; xem skill; cập nhật từ folder gốc kèm diff. Nội dung lấy từ ADR-026 mục 7, 8, không đổi chức năng.
   - **Chi tiết MCP:** nội dung tab MCP server hiện nay (lệnh, tool, thử kết nối, log).
   - **Lệnh nhanh:** bảng câu ngắn và lệnh gọi skill (ADR-028 mục 7.2), có chọn provider.
4. Cảnh báo chung hiện nay (skill lọt vào `~/.agents/skills` theo SPIKE-14…) đặt ở đầu trang tổng quan, không lặp ở từng account.

### 3. Trang một account

- **Đầu trang:** avatar, tên, email, provider, chế độ cửa sổ, thanh usage (5 giờ, tuần, hoặc hạn mức khác: xem lỗi I5 ở danh sách việc).
- **Thẻ Skill:**
  - danh sách skill với trạng thái từng skill (Mới nhất, Bản cũ, Thiếu, Trùng tên);
  - nút gộp "Cài", "Cập nhật N" ở đầu thẻ; cài, gỡ và xem từng skill trong menu ⋯ của dòng;
  - năm skill đầu hiện sẵn, các skill còn lại thu gọn trong "+N skill khác".
- **Thẻ MCP `agenthub`:**
  - trạng thái, số tool, nút "Thử kết nối" (cùng probe với trang Chi tiết MCP), kết quả lần thử cuối;
  - công tắc **Tự cài khi mở**, chuyển từ tab Công cụ agent sang đây.
- **Lệnh nhanh** của đúng provider của account (ADR-028 mục 7.2), có nút copy.
- Liên kết **Quản lý account** mở Cài đặt → Account. Đăng nhập, đổi tên, gỡ account vẫn làm ở đó; ADR này không chuyển các việc đó.

### 4. Cài đặt chỉ còn cấu hình ít đổi

- Hộp thoại Cài đặt còn ba tab: **Chung**, **Account**, **Nâng cao**. Bỏ tab Công cụ agent và MCP server.
- Các chỗ trước đây mở hộp thoại ở hai tab đó thì nay mở trang tương ứng:
  - "Mở Công cụ agent" ở bảng trước khi mở → trang của đúng account đó;
  - "Chi tiết MCP" → trang Chi tiết MCP.
- Nút "Cài cho account này" tại chỗ (ADR-024 mục 8) giữ nguyên.

### 5. Bố cục hẹp

- Trang tổng quan và trang account là trang cuộn, rộng tối đa 880px như các tab khác (ADR-022 mục 4).
- Khi vùng làm việc hẹp hơn khoảng 640px:
  - mỗi dòng account xuống hai dòng (tên ở trên; trạng thái và nút ở dưới);
  - các thẻ của trang account xếp dọc;
  - không có thanh cuộn ngang.
- Dùng chung cách co giãn với dòng account trong bảng mở (lỗi I3), để không phải sửa hai lần.

## Không thuộc ADR này

- **"Đang chạy"** (account nào đang mở phiên, ở project nào): thuộc ADR-025 mục C, chờ spike S1–S3. Khi có, trang account sẽ là chỗ hiện thông tin này.
- **Thứ tự account** (lỗi I6): trang tổng quan dùng chung thứ tự với thanh bên, theo quyết định của I6.
- **Chuyển đăng nhập và quản lý account** từ Cài đặt sang trang account: để sau, nếu người dùng thấy cần.
- Không đổi cách cài, gỡ, symlink hay bản chung của skill (ADR-020, ADR-026); chỉ đổi chỗ hiện.

## Consequences

**Tốt hơn:**
- Nhìn thanh bên là biết account nào chưa sẵn sàng, không cần mở Cài đặt.
- Mỗi lúc chỉ nhìn một account, mỗi dòng có một việc rõ ràng phải làm. Hết cảnh nhìn ma trận bốn account cùng lúc.
- Thông tin một account về một chỗ: usage, skill, MCP, tự cài, lệnh nhanh.
- Bảng Lệnh nhanh của ADR-028 có chỗ đặt dễ tìm.

**Cái giá:**
- Thêm hai trang và ba trang con vào vùng làm việc; điều hướng ở renderer phải biết thêm loại "trang" ngoài project và chat.
- Code của `AgentToolsSection` và `McpServerPage` phải tách khỏi hộp thoại Cài đặt; các E2E đang mở Cài đặt → Công cụ agent hoặc MCP server phải viết lại.
- Trạng thái công cụ phải đọc cho mọi account khi app mở và khi account đổi, để chấm ở thanh bên đúng. Việc đọc thư mục skill cần nhẹ: chỉ đọc metadata và checksum, không đọc nội dung skill.
- Thêm khoá i18n cho vi, en, ko.

## Kiểm chứng cần có

1. **Unit:**
   - gộp trạng thái skill và MCP thành trạng thái của account;
   - chọn đúng một nút theo thứ tự ưu tiên;
   - đếm số account cần xử lý cho dòng ở thanh bên.
2. **E2E:**
   - bấm dòng Công cụ agent và dòng account ở thanh bên;
   - "Cài đủ cho tất cả" có hỏi trước và nêu riêng account chính;
   - cài và cập nhật từ trang account;
   - "Mở Công cụ agent" ở bảng mở đưa tới đúng trang account;
   - hộp thoại Cài đặt chỉ còn ba tab;
   - bố cục khi cửa sổ hẹp (khoảng 900px với thanh bên mở), không có thanh cuộn ngang.
3. **Trên `.app` với bốn account thật:**
   - gỡ một skill ở một account thì chấm vàng hiện trên thanh bên ngay khi màn được đọc lại;
   - cài lại từ trang account thì chấm mất.

## References

- [ADR-020](020-phase3-review-changes.md), [ADR-022](022-desktop-shell-layout.md), [ADR-024](024-one-click-handoff-and-progress-state.md) mục 8, [ADR-026](026-skill-structure-and-management.md), [ADR-028](028-resume-with-one-sentence.md)
- Mục I của [danh sách việc](../plans/2026-11-09-context-flow-backlog.md) (lỗi I3, I5, I6)
- `apps/desktop/src/renderer/src/AgentToolsSection.tsx`, `McpServerPage.tsx`, `SettingsView.tsx`, `App.tsx`
