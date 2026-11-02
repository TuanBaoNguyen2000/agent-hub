# SPIKE-07 — Claude Desktop account switch

**Status:** macOS Pass (reported) khi dùng cả `--user-data-dir` và `CLAUDE_CONFIG_DIR`. Windows chưa chạy. Cần profile B từ [SPIKE-01](../01-claude-profile-isolation/README.md).

## Objective

Kiểm tra cách đổi account trên Claude Desktop không cần logout/login: mở một instance thứ hai với thư mục dữ liệu riêng cho account khác. [SPIKE-05](../05-account-mapping/evidence/2026-10-30-macos.md) đã cho thấy profile CLI không làm được việc này.

## Pass criteria

- Instance thứ hai giữ account B trong khi instance chính vẫn là account A, không cần logout/login ở instance chính.
- Đăng nhập được giữ lại sau khi tắt và mở lại, và mở lại nhanh hơn đáng kể so với logout/login.
- Mở được mà không cần terminal, để launcher trong Electron Main dùng được.
- Không sửa, re-sign hay giải nén `Claude.app`; không đọc hay sao chép credential; không đọc nội dung thư mục dữ liệu.

Code tab, deep link và resume được ghi riêng. Dù đạt, cơ chế này tối đa là `conditional`, vì không được tài liệu hoá và có thể hỏng khi Desktop cập nhật. Việc đưa vào sản phẩm cần người dùng quyết định và cập nhật ADR-006.

## Tài liệu và điều khoản (kiểm tra 2026-10-30)

| Nguồn | Nội dung liên quan |
|---|---|
| [Log in to your Claude account](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) | Có menu đổi account chính thức, nhưng chỉ cho account cá nhân và Team/Enterprise **cùng email** |
| [Claude Code — Desktop](https://code.claude.com/docs/en/desktop) | Không nói về nhiều instance hay thư mục dữ liệu riêng; `CLAUDE_CONFIG_DIR` chỉ xuất hiện trong bảng biến môi trường |
| [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) | Mục 3 cấm reverse engineer, truy cập tự động và vượt biện pháp bảo vệ; mục 2 cấm chia sẻ account; không có điều khoản về việc một người có nhiều account |
| [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) | D.4 cấm reverse engineer hoặc sao chép Services; không có điều khoản giới hạn số account |

**Đánh giá:** các văn bản đã đọc không cấm rõ và cũng không cho phép rõ cách này. Đây là đánh giá của agent, không phải tư vấn pháp lý; chưa đọc Usage Policy và Service Specific Terms, và chính sách tổ chức có thể áp dụng cho account Team. Spike giữ các ranh giới sau: chỉ quan sát từ bên ngoài, không giải nén hay sửa app, người dùng tự đăng nhập qua flow của Anthropic và tự thao tác trong app.

**Nguồn cộng đồng (chưa kiểm chứng, không chính thức):** [claude-fix](https://github.com/sarhej/claude-fix), [claude-multiprofile](https://github.com/jmdarre-v/claude-multiprofile) và [một gist](https://gist.github.com/aoxborrow/5a3a0ac0aa37819cc19439b70a552221) mô tả `open -n ... --args --user-data-dir=`. Các rủi ro họ nêu là lý do có từng bước kiểm tra trong script:

- Callback đăng nhập qua `claude://` có thể về nhầm instance, vì hai instance dùng chung bundle id.
- Flag chỉ tách dữ liệu của Desktop; session Code tab có thể vẫn dùng `~/.claude`.
- Mở app bằng Dock hoặc Spotlight sẽ vào instance mặc định.

## Trước khi chạy

- **Đăng nhập account B lúc Desktop chính đã tắt.** Lần chạy đầu cho thấy callback từ browser về Desktop chính, không về cửa sổ thứ hai. Chế độ `login` từ chối chạy nếu Desktop chính còn mở.
- **Khi Desktop chính đang mở, không dùng ⌘Q.** Hai cửa sổ có cùng tên và icon nên dễ tắt nhầm; script tự tắt đúng instance thứ hai theo PID.
- Cần profile B và fixture của [SPIKE-04](../04-project-instructions/README.md).

## Cách chạy

Chạy trong Terminal.app. Chỉ ghi alias A/B, không ghi email.

**Lần đầu, đăng nhập account B.** Tắt Desktop chính (⌘Q), rồi chạy lệnh dưới. Sau khi trả lời, script tự tắt cửa sổ thứ hai; mở lại Desktop chính như bình thường.

```bash
spikes/07-desktop-account-switch/run-switch-checks.sh login
```

**Sau đó, kiểm tra khi cả hai cùng chạy.** Script hỏi quan sát sau từng bước và gửi khoảng 5 request ngắn.

```bash
spikes/07-desktop-account-switch/run-switch-checks.sh
```

**Chỉ kiểm tra Code tab,** với và không có `CLAUDE_CONFIG_DIR`. Script gửi khoảng 2 request ngắn; Desktop chính có thể vẫn mở.

```bash
spikes/07-desktop-account-switch/run-switch-checks.sh code
```

Nếu dừng giữa chừng, tắt instance thứ hai bằng:

```bash
spikes/07-desktop-account-switch/run-switch-checks.sh stop
```

Quan sát ghi vào `local/<timestamp>/` (ignored). Script chỉ đếm tên file và đo dung lượng trong thư mục dữ liệu, không đọc nội dung.

Đo macOS chọn instance nào, không dùng app hay account của provider (thư mục làm việc phải được LaunchServices nhận, nên đặt trong `local/`, không đặt trong `/tmp`):

```bash
spikes/07-desktop-account-switch/check-instance-routing.sh "$PWD/node_modules/electron/dist/Electron.app" "$PWD/spikes/07-desktop-account-switch/local/routing"
```

## Dọn dẹp

Đăng xuất account B trong cửa sổ thứ hai trước, rồi tắt instance và xoá thư mục dữ liệu:

```bash
spikes/07-desktop-account-switch/run-switch-checks.sh stop
```

```bash
rm -rf "$HOME/.agenthub-spike/claude-desktop-b"
```

## Evidence

- [2026-10-30 — macOS](evidence/2026-10-30-macos.md)
