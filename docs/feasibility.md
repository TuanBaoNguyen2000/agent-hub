# Phase 0 — Feasibility plan and evidence

**Updated:** 2026-10-29  
**Phase status:** Not started  
**Evidence:** Chưa chạy spike hoặc xác minh capability trên máy thật

Tài liệu này triển khai kế hoạch ở [TDD §3.5](TDD.md#35-feasibility-gates-cần-làm-trước-ui-lớn) và §13. Các mô tả tích hợp trong TDD là giả thuyết cần kiểm chứng theo exact version; bảng dưới không khẳng định compatibility hiện tại.

## Trạng thái kết quả

- `Not run`: chưa kiểm thử.
- `Pass`: đã đạt pass criteria với evidence phù hợp.
- `Fail`: đã chạy, chưa đạt; ghi lỗi và cách tái hiện.
- `Blocked`: chưa thể chạy do thiếu điều kiện cụ thể.
- `Fallback accepted`: phương án tự động không đạt nhưng fallback đã được review và chấp nhận rõ ràng. Không có nghĩa capability tự động là supported.

## Môi trường cần ghi nhận

| Trường | macOS | Windows |
|---|---|---|
| OS version / architecture | Chưa kiểm kê | Chưa kiểm kê |
| Claude CLI version / executable | Chưa kiểm kê | Chưa kiểm kê |
| Claude Desktop version / Code mode | Chưa kiểm kê | Chưa kiểm kê |
| Codex CLI version / executable | Chưa kiểm kê | Chưa kiểm kê |
| Codex Desktop version | Chưa kiểm kê | Chưa kiểm kê |
| Terminal / shell | Chưa kiểm kê | Chưa kiểm kê |
| Auth mode / profile alias | Chưa xác minh | Chưa xác minh |
| Test fixture project | Chưa tạo | Chưa tạo |

Chỉ ghi alias và loại auth cần cho thử nghiệm; không ghi email, tokens, credential file contents hoặc account secrets. Dùng fixture project không chứa source code công ty khi có thể.

## Spike matrix

| ID | Mục tiêu | macOS | Windows | Điều kiện đạt / evidence cần có |
|---|---|---|---|---|
| SPIKE-01 | Hai Claude CLI profile độc lập | Not run | Not run | Hai config roots, auth riêng, chạy song song và không lẫn session/context; không copy credential stores |
| SPIKE-02 | Claude Desktop launcher | Not run | Not run | Ghi nhận open app/workspace và điều kiện desktop/resume riêng; unsupported path có fallback |
| SPIKE-03 | Codex Desktop launcher | Not run | Not run | Xác minh riêng open app và open workspace theo OS/version; không suy ra thread resumed |
| SPIKE-04 | Project instructions recognition | Not run | Not run | Fixture cho thấy coding mode đọc đúng CLAUDE.md/AGENTS.md từ project root; phân biệt Chat với Code |
| SPIKE-05 | Account mapping/status | Not run | Not run | Alias CLI và xác nhận account thủ công được phân biệt; Desktop unknown không bị báo là switched |
| SPIKE-06 | Integration terms/distribution review | Not run | Not run | Ghi official references, ngày review và phạm vi personal/distributed; ghi các điều kiện cần xử lý |

SPIKE-06 có thể dùng cùng evidence cho hai OS nếu phạm vi tài liệu áp dụng chung được ghi rõ. Kết quả profile/account chỉ xác minh qua workflow chính thức và xác nhận người dùng, không đọc private databases hoặc credential stores.

## Capability matrix thực tế

| Target | OS | Version | Open app/CLI | Open workspace/cwd | Select account | Resume session | Supply context |
|---|---|---|---|---|---|---|---|
| Claude CLI | macOS | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude Desktop | macOS | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex CLI | macOS | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex Desktop | macOS | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |

Sau kiểm thử, ghi mức `supported`, `conditional`, `manual` hoặc `unsupported` cho từng capability, kèm evidence và điều kiện. Không chuyển toàn bộ một hàng sang supported khi chỉ xác minh được open app.

## Mẫu ghi evidence cho mỗi lần chạy

```text
Spike ID / run ID:
Ngày giờ và người xác minh:
OS / architecture / exact tool versions:
Fixture project và profile aliases:
Preconditions / auth mode:
Official reference và ngày kiểm tra:
Các bước và command/args đã làm sạch dữ liệu nhạy cảm:
Expected:
Observed:
Result: Pass | Fail | Blocked | Fallback accepted
Evidence path/link:
Manual steps / limitations:
Fallback và người xác nhận (nếu có):
Next action:
```

Chỉ điền command sau khi xác minh tài liệu và version thực tế. Harness nằm trong [spikes/](../spikes/README.md); output local nhạy cảm không đưa vào Git. `Supply context` phải phân biệt prompt đã chuẩn bị, người dùng đã cung cấp và agent đã đọc theo evidence có được.

## Exit review

- [ ] Có inventory exact versions và preconditions cho môi trường được kiểm thử.
- [ ] SPIKE-01–06 có kết quả, evidence và giới hạn áp dụng rõ ràng.
- [ ] Có evidence macOS và Windows; phần thiếu vẫn được ghi chưa kiểm thử.
- [ ] Desktop/CLI có workflow khả dụng; các bước manual được mô tả đúng mức kiểm soát.
- [ ] Những capability không đạt có fallback được review; không còn giả định chặn workflow chính.
- [ ] Kết luận được cập nhật vào STATUS, TDD và ADR liên quan; chỉ sau đó mở technical bootstrap.

**Kết luận hiện tại:** Chưa đủ bằng chứng kết luận Phase 0 pass. Không có compatibility claim mới trong bước repository foundation.
