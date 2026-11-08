# Trang giới thiệu AgentHub để nộp bài

File cần nộp: [agenthub-introduction.html](agenthub-introduction.html).

Chỉ cần nộp file HTML này; không cần gửi README hoặc các thư mục khác.
Ảnh, icon, CSS, JavaScript và font đều nhúng bên trong, không dùng CDN.
Mở bằng cách nhấp đúp file hoặc kéo vào trình duyệt, không cần chạy server.

## Ngôn ngữ

Dùng các nút **EN / VN / KO** trên đầu trang để chọn tiếng Anh, Việt hoặc Hàn.
Toàn bộ nội dung, nhãn hỗ trợ tiếp cận, mô tả ảnh và bộ tính thời gian đổi theo ngôn ngữ.
Lần đầu mở mặc định tiếng Việt; trang nhớ lựa chọn khi trình duyệt cho phép localStorage.
Nếu storage bị chặn, nút chuyển ngôn ngữ vẫn hoạt động trong lần mở đó.
Ảnh chụp ứng dụng dùng giao diện tiếng Việt; caption tiếng Anh/Hàn ghi rõ điều này.

## Đối chiếu tiêu chí

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

## Bằng chứng kiểm tra ngày 08/11/2026

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

## Nguồn nội dung và thiết kế

- `docs/STATUS.md` trước phần cập nhật trang giới thiệu: trạng thái sản phẩm ngày 06/11/2026.
- `docs/TDD.md` và ADR-019/021/023: mô hình context, task, handoff và phạm vi sản phẩm.
- Skill haru-ui do người dùng cung cấp: nền trung tính, xanh nhấn, font tiếng Việt Be Vietnam Pro, khoảng trắng, bố cục ưu tiên danh sách, không dùng badge trên hero.
- Icon AgentHub đã được chốt tại `apps/desktop/resources/icon.png`.
- Tiếng Việt dùng Be Vietnam Pro; Anh/Hàn dùng Pretendard Variable theo haru-ui. Cả hai font được nhúng với SIL Open Font License 1.1; thông tin bản quyền và toàn văn giấy phép nằm trong comment cuối HTML.
- Bản dịch Hàn chưa được người bản ngữ rà lại.

## Phần bài thi còn lại

Đây là bài **trang giới thiệu dịch vụ**.
Chưa tạo hoặc kiểm tra file **mockup dịch vụ** để nộp riêng.
Phần tiêu chí được cung cấp có câu “3 bài nộp” nhưng danh sách chỉ nêu hai loại; cần đối chiếu thông báo gốc nếu ban tổ chức yêu cầu thêm loại thứ ba.
