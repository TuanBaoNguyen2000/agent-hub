# Icon AgentHub

Người dùng chốt **folder nối với hai khối agent xanh và tím** bằng ảnh đính kèm
ngày 2026-11-06. Folder biểu thị project và context dùng chung; hai khối nối vào
folder biểu thị các agent cùng làm việc trên project. Ảnh đính kèm là nguồn
đối chiếu cho lựa chọn, thay cho nhãn chữ ở các bản xem thử.

- `agenthub-selected-original.png`: ảnh người dùng gửi, giữ nguyên để đối chiếu.
- `../icon.png`: bản dùng cho app, 1024×1024, có alpha ngoài tile bo góc.
- `electron-builder.yml` dùng `../icon.png` và tự chuyển thành ICNS cho macOS.

Đóng gói app với icon từ root repository:

```sh
npm run package
```

Tạo hình bằng công cụ imagegen tích hợp. Bản dùng cho app đã được tách nền
qua imagegen; `sips` chỉ đổi kích thước, electron-builder đóng gói.
Thiết kế, bảng màu và bố cục theo ảnh đính kèm. Chưa có bộ icon Windows.

## Prompt thiết kế

> A central shared project folder with two short broad curved connector arms
> reaching outward to two solid rounded-square tool modules, one on each upper
> side. Folder is the dominant silhouette, with a recognizable folder tab and
> open top edge, no document lines. Compact triangular composition: different
> agents working with one shared project. Deep indigo tile with cobalt-to-violet
> diagonal glow; pale periwinkle folder, vivid blue and violet tool modules.
> Bold simple geometry, subtle sculptural depth, no text or monogram.

## Prompt tách nền

> Remove only the pale background outside the outer purple-blue rounded square
> tile, making those outside pixels genuinely transparent. Preserve the entire
> tile, interior artwork, colors, gradients, pale lavender folder, two rounded
> square blue and purple agent blocks, curved connectors, proportions, framing
> and lighting. Use a clean antialiased outline and transparent corners.
> No checkmarks, cards, letters, redesign or added elements.
