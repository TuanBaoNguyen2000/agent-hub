# Hai file HTML AgentHub để nộp bài

| Bài nộp | File | Dung lượng |
|---|---|---|
| Mockup dịch vụ / demo tính năng | [agenthub-demo.html](agenthub-demo.html) | Khoảng 0,57 MB |
| Trang giới thiệu dịch vụ | [agenthub-introduction.html](agenthub-introduction.html) | Khoảng 4,38 MB |

Mỗi bài là một file HTML tự chứa, mở độc lập và dưới 10 MB.
Chỉ nộp hai file HTML; không cần gửi README, `demo-source/` hoặc các thư mục khác.
Nhấp đúp file hoặc kéo vào trình duyệt để mở, không cần server hay CDN.

## Demo dùng giao diện thật của ứng dụng

`agenthub-demo.html` build trực tiếp từ `apps/desktop/src/renderer/src/main.tsx`, các component React, bảng dịch và `style.css` của AgentHub.
Không áp dụng haru-ui hoặc dựng lại các màn của demo; font hệ thống, màu nền ấm, màu nhấn, menu và các luồng đều theo app hiện tại.
Thanh mảnh bên ngoài ứng dụng chỉ giải thích dữ liệu mẫu, hướng dẫn và khôi phục demo.

Phần thay thế duy nhất là `window.agentHub`: API trình duyệt có kiểu `AgentHubApi` cung cấp project, tài liệu, account và các phản hồi mẫu thay cho Electron IPC.
Mã đọc/sửa cấu trúc task, scaffold, trạng thái và mẫu task dùng lại các hàm thuần của ứng dụng trong `packages/application/src/task-document.ts`.
Các quan sát Git, usage, đăng nhập và kết nối MCP là dữ liệu giả; các thao tác cần hệ điều hành chỉ được mô phỏng và có thông báo.
Demo không truy cập file, folder, account, provider hay model thật.

### Luồng dùng thử đúng như app

1. Mở file: màn **Tổng quan** có chọn account và hai nút **Mở trong Desktop / Mở trong Terminal**.
2. Sang **Task**, chuyển **Danh sách / Bảng**, mở **TASK-002** để tick tiêu chí, sửa từng mục hoặc đổi trạng thái.
3. Trong chi tiết task, dùng **Thêm handoff** để dán bản bàn giao; app thật không có nút tự sinh “Lưu checkpoint” như demo cũ.
4. Bấm **Mở agent với task này**, chọn account và Desktop/Terminal; tiếp tục qua cảnh báo mô phỏng để xem lời nhắc và lịch sử.
5. Bật **Tài liệu** để dùng cây thư mục, xem/sửa Markdown và tạo file mới như app thật.
6. **Cài đặt → Chung** đổi ngôn ngữ English / Tiếng Việt / 한국어 và theme sáng/tối; **Account**, **Công cụ agent**, **MCP server** dùng đúng các màn của app.
7. Công tắc **Project / Chat** trên sidebar chuyển sang các bản tóm tắt chat rời; project không tài liệu có tab Handoff.

Dữ liệu sửa trong demo được lưu qua localStorage riêng. Nếu storage bị chặn, vẫn dùng được trong lần mở hiện tại.
Giao diện desktop giữ bề rộng tối thiểu 880px; trên điện thoại cần cuộn ngang. Không thêm bố cục mobile khác app.
Các tài liệu mẫu có ngôn ngữ riêng, nên đổi ngôn ngữ giao diện không tự dịch nội dung file, giống sản phẩm thật.

### Build lại và kiểm tra

Chạy từ repository root với dependencies đã cài:

```sh
node_modules/.bin/tsc -p submission/demo-source/tsconfig.json
node scripts/build-submission-demo.mjs
node scripts/test-submission-demo.mjs
```

Bài kiểm thử dùng Chrome headless, profile tạm và chế độ offline; có thể đặt `AGENTHUB_DEMO_BROWSER=chromium` để dùng browser đã cài cho Playwright.
Build không sửa mã ứng dụng, ghi một file HTML duy nhất và kiểm tra giới hạn 10 MB.
Comment đầu HTML ghi SHA-256 của CSS nguồn để đối chiếu.

### Kiểm chứng bản dùng renderer thật (09/11/2026)

- Typecheck `submission/demo-source/tsconfig.json` và build HTML đạt; file khoảng 566 KB theo hệ thập phân.
- Bài kiểm thử offline đạt: danh sách/bảng và chi tiết task, tick tiêu chí, menu trạng thái, dán handoff, mở account/Terminal mô phỏng, lịch sử, tạo task/workstream.
- Panel Tài liệu dùng cây thư mục và editor gốc; Markdown chứa script không thực thi, checksum từ chối ghi bản cũ; tài liệu giữ qua reload.
- Cài đặt gốc: Công cụ agent, trang/thử MCP mẫu, theme tối và ba ngôn ngữ hoạt động; thêm project bằng hộp thoại gốc và reset dữ liệu đạt.
- Không có request HTTP(S) hay lỗi JavaScript trong kiểm thử. Đã xem Tổng quan và chi tiết task, đúng font/màu/bố cục của renderer gốc.
- Không chạy lại toàn bộ test Electron; không thay đổi file trong `apps/` hoặc `packages/`.

### Giới hạn kiểm chứng

Mô phỏng IPC không thay thế kiểm thử ứng dụng native, tài khoản thật, quyền filesystem hay process launcher.
Chưa thử Safari/Firefox. Trang giới thiệu theo haru-ui vẫn là file riêng.

## Ngôn ngữ trang giới thiệu

Dùng các nút **EN / VN / KO** trên đầu trang để chọn tiếng Anh, Việt hoặc Hàn.
Toàn bộ nội dung, nhãn hỗ trợ tiếp cận, mô tả ảnh và bộ tính thời gian đổi theo ngôn ngữ.
Lần đầu mở mặc định tiếng Việt; trang nhớ lựa chọn khi trình duyệt cho phép localStorage.
Nếu storage bị chặn, nút chuyển ngôn ngữ vẫn hoạt động trong lần mở đó.
Ảnh chụp ứng dụng dùng giao diện tiếng Việt; caption tiếng Anh/Hàn ghi rõ điều này.

## Đối chiếu tiêu chí trang giới thiệu

| Tiêu chí trang giới thiệu | Kết quả |
|---|---|
| Một file `.html`, dưới 10 MB | 4.378.004 byte, khoảng 4,38 MB theo hệ thập phân |
| Mở bình thường trên trình duyệt | Đã mở trực tiếp qua `file://` trên Google Chrome, kể cả chế độ offline |
| Hình ảnh dịch vụ | Hai ảnh chụp ứng dụng thật: bảng task và chi tiết task/handoff; dữ liệu demo Orbit Studio |
| Vấn đề | Mất mạch khi chuyển phiên, thông tin phân tán, bắt đầu sai bối cảnh |
| Giải pháp | Project, task, checkpoint và lời nhắc cho phiên mới |
| Hiệu quả kỳ vọng | Kịch bản 10 → 2 phút/lần; tính 80% và thời gian/ngày/tháng theo số lần chuyển phiên |
| Giới hạn, nguồn lực | Server, lưu trữ, dữ liệu, Internet, account, nền tảng, máy phát triển và giới hạn tích hợp |

Các số liệu hiệu quả là giả định để đánh giá, chưa có nghiên cứu người dùng chứng minh.
Trang ghi rõ điều kiện và kế hoạch kiểm chứng đề xuất.

## Bằng chứng kiểm tra trang giới thiệu ngày 08/11/2026

- `npm run build`: pass để chụp giao diện đúng bản source hiện tại.
- Ảnh chụp bằng Playwright/Electron với `--user-data-dir` riêng trong thư mục tạm; không dùng dữ liệu/account thật và không mở agent.
- Playwright với Chrome headless, context offline: không có request HTTP(S), không lỗi JavaScript; font Be Vietnam Pro và ảnh nhúng tải đầy đủ.
- Kiểm tra bề rộng 320, 375, 768, 1440px: không tràn ngang; phóng chữ 200% ở 375px cũng không tràn ngang.
- Đổi ảnh, phóng to, Escape để đóng và trả focus về nút mở: đạt.
- Bộ tính: 0 lần → 0 phút/tháng; 4 lần → 32 phút/ngày, 10 giờ 40 phút/tháng; 10 lần → 80 phút/ngày, 26 giờ 40 phút/tháng.
- Đã xem ảnh giao diện sáng, tối, mobile; `prefers-reduced-motion` tắt smooth scroll; kiểm tra print không tràn ngang.
- Cập nhật EN/VN/KO: Chrome offline đạt cả ba ngôn ngữ ở 320/375/768/980/1440px; font đúng, không tràn ngang và nút ngôn ngữ có vùng bấm tối thiểu 44×44px; chữ 200% ở 375px cũng không tràn ngang.
- Đổi ngôn ngữ giữ ảnh đang chọn, theme và giá trị bộ tính; nhãn theme, alt ảnh phóng to, kết quả tính và số ít tiếng Anh đều đổi đúng.
- Nhớ ngôn ngữ qua reload; lựa chọn lưu không hợp lệ trở về tiếng Việt; storage bị chặn vẫn chuyển được ngôn ngữ.
- Nội dung DOM tiếng Anh/Hàn không còn chuỗi tiếng Việt ngoài tên ngôn ngữ trong bộ chọn; không request HTTP(S) hay lỗi JavaScript.
- Chưa thử Safari hoặc Firefox. Không chạy lại toàn bộ test ứng dụng vì thay đổi chỉ thêm trang HTML và ghi nhận bàn giao.

Ảnh toàn trang mobile do Chrome headless xuất có lỗi ghép lặp viewport; đã kiểm tra lại bằng ảnh từng viewport ở đầu trang và vùng Vấn đề, nội dung DOM chỉ có một `main`.
Đây là giới hạn ảnh QA, không phải nội dung lặp trong HTML.

## Nguồn nội dung và thiết kế trang giới thiệu

- `docs/STATUS.md` trước phần cập nhật trang giới thiệu: trạng thái sản phẩm ngày 06/11/2026.
- `docs/TDD.md` và ADR-019/021/023: mô hình context, task, handoff và phạm vi sản phẩm.
- Skill haru-ui do người dùng cung cấp: nền trung tính, xanh nhấn, font tiếng Việt Be Vietnam Pro, khoảng trắng, bố cục ưu tiên danh sách, không dùng badge trên hero.
- Icon AgentHub đã được chốt tại `apps/desktop/resources/icon.png`.
- Tiếng Việt dùng Be Vietnam Pro; Anh/Hàn dùng Pretendard Variable theo haru-ui. Cả hai font được nhúng với SIL Open Font License 1.1; thông tin bản quyền và toàn văn giấy phép nằm trong comment cuối HTML.
- Bản dịch Hàn chưa được người bản ngữ rà lại.

## Phạm vi đối chiếu bài thi

Đã có hai bài HTML tương ứng hai loại được nêu: **mockup dịch vụ** và **trang giới thiệu dịch vụ**.
Phần tiêu chí được cung cấp có câu “3 bài nộp” nhưng danh sách chỉ nêu hai loại; cần đối chiếu thông báo gốc nếu ban tổ chức yêu cầu thêm loại thứ ba.
