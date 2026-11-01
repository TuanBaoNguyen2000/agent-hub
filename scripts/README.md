# Repository scripts

**Status:** Có một script, chạy bằng Node.

| Script | Mục đích | Cách chạy |
|---|---|---|
| `run-tests.mjs` | Chạy Vitest trên runtime của Electron, để test nạp native module giống app | `npm test`, có thể thêm tham số của Vitest sau `--` |

Thư mục này dành cho tooling dùng chung của repository, chẳng hạn kiểm tra tài liệu, đóng gói hoặc tác vụ phát triển sau bootstrap. Mỗi script tương lai cần ghi mục đích, prerequisites, input/output và cách chạy.

Code thử nghiệm provider/OS đặt ở [spikes/](../spikes/README.md); logic sản phẩm đặt ở app/package phù hợp. Không đặt dữ liệu runtime, credentials hoặc launcher implementation sản phẩm trong scripts.
