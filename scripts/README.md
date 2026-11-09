# Repository scripts

**Status:** Các script chạy bằng Node từ repository root.

| Script | Mục đích | Cách chạy |
|---|---|---|
| `run-tests.mjs` | Chạy Vitest trên runtime của Electron, để test nạp native module giống app | `npm test`, có thể thêm tham số của Vitest sau `--` |
| `build-submission-demo.mjs` | Build renderer React/CSS thật với API dữ liệu mẫu, đóng gói thành `submission/agenthub-demo.html` tự chứa dưới 10 MB | Cần dependencies đã cài; chạy `node scripts/build-submission-demo.mjs`. Đọc `submission/demo-source/` và mã renderer, ghi đè HTML demo; không sửa ứng dụng |
| `test-submission-demo.mjs` | Kiểm tra HTML đã build bằng Chrome headless offline với dữ liệu trình duyệt tạm: task, handoff, mở agent, tài liệu, xung đột ghi, cài đặt, ngôn ngữ, MCP, reload và reset | Cần Chrome hoặc Playwright Chromium (`AGENTHUB_DEMO_BROWSER=chromium`); chạy `node scripts/test-submission-demo.mjs`. Chỉ ghi dữ liệu demo trong profile tạm, không mở agent hoặc đăng nhập thật |

Thư mục này dành cho tooling dùng chung của repository, chẳng hạn kiểm tra tài liệu, đóng gói hoặc tác vụ phát triển sau bootstrap. Mỗi script tương lai cần ghi mục đích, prerequisites, input/output và cách chạy.

Code thử nghiệm provider/OS đặt ở [spikes/](../spikes/README.md); logic sản phẩm đặt ở app/package phù hợp. Không đặt dữ liệu runtime, credentials hoặc launcher implementation sản phẩm trong scripts.
