# Phase 0 — Feasibility plan and evidence

**Updated:** 2026-10-30  
**Phase status:** In progress — macOS: inventory, SPIKE-02, 03, 04, 06 xong; còn SPIKE-01, 05 và toàn bộ Windows  
**Evidence:** Chưa xác minh capability trên máy thật

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
| OS version / architecture | macOS 26.5.1 (25F80), arm64 | Chưa kiểm kê |
| Claude CLI version / executable | 2.1.295 lúc kiểm kê, tự cập nhật lên 2.1.314 cùng ngày (auto-update bật); npm global trong nvm: `~/.nvm/versions/node/v24.21.0/bin/claude` | Chưa kiểm kê |
| Claude Desktop version / Code mode | 4.29.0 lúc kiểm kê, tự cập nhật lên 4.4212.0 cùng ngày; `/Applications/Claude.app` (`com.anthropic.claudefordesktop`); Code tab hoạt động (SPIKE-04) | Chưa kiểm kê |
| Codex CLI version / executable | codex-cli 0.155.1; npm global trong nvm: `~/.nvm/versions/node/v24.21.0/bin/codex` | Chưa kiểm kê |
| Codex Desktop version | Không có `Codex.app`; `/Applications/ChatGPT.app` 26.1023.51421 (`com.openai.codex`), `codex app` mở app này (SPIKE-03) | Chưa kiểm kê |
| Terminal / shell | Terminal.app; zsh 5.9 (`/bin/zsh`) | Chưa kiểm kê |
| Auth mode / profile alias | Chưa xác minh; `CLAUDE_CONFIG_DIR` và `CODEX_HOME` chưa đặt (config mặc định) | Chưa xác minh |
| Test fixture project | Chưa tạo | Chưa tạo |

Chỉ ghi alias và loại auth cần cho thử nghiệm; không ghi email, tokens, credential file contents hoặc account secrets. Dùng fixture project không chứa source code công ty khi có thể.

**macOS inventory (2026-10-30):** thu thập bằng `sw_vers`, `uname -m`, `command -v`, `--version` và `CFBundleShortVersionString`/`CFBundleIdentifier` trong Info.plist; không đọc config hoặc credential directories. Công cụ phụ: git 2.39.5 (Apple Git-154), Node v24.21.0 qua nvm, npm; không có pnpm.

Quan sát cần kiểm chứng tiếp:

- **Executable resolution:** hai CLI nằm trong thư mục nvm, chỉ có trên PATH khi shell nạp nvm. App GUI mở từ Finder/Dock thường không kế thừa PATH đó. SPIKE-01/02 và platform adapter cần kiểm tra cách resolve executable khi AgentHub không chạy từ terminal.
- **Codex Desktop identity:** đã xác nhận ở SPIKE-03: `codex app` mở `/Applications/ChatGPT.app`.

## Spike matrix

| ID | Mục tiêu | macOS | Windows | Điều kiện đạt / evidence cần có |
|---|---|---|---|---|
| SPIKE-01 | Hai Claude CLI profile độc lập | Not run | Not run | Hai config roots, auth riêng, chạy song song và không lẫn session/context; không copy credential stores |
| SPIKE-02 | Claude Desktop launcher | Pass (reported); chọn account manual — [evidence](../spikes/02-claude-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Ghi nhận open app/workspace và điều kiện desktop/resume riêng; unsupported path có fallback |
| SPIKE-03 | Codex Desktop launcher | Pass (reported); chọn account manual, resume chưa kiểm tra — [evidence](../spikes/03-codex-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Xác minh riêng open app và open workspace theo OS/version; không suy ra thread resumed |
| SPIKE-04 | Project instructions recognition | Pass cho Claude CLI, Codex CLI; Claude Desktop (Code tab + Chat) và Codex Desktop Pass (reported) — [CLI](../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md), [Desktop](../spikes/04-project-instructions/evidence/2026-10-30-macos-claude-desktop.md) | Not run | Fixture cho thấy coding mode đọc đúng CLAUDE.md/AGENTS.md từ project root; phân biệt Chat với Code |
| SPIKE-05 | Account mapping/status | Not run | Not run | Alias CLI và xác nhận account thủ công được phân biệt; Desktop unknown không bị báo là switched |
| SPIKE-06 | Integration terms/distribution review | Pass — personal scope, giả định ([evidence](../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md)) | Pass — cùng evidence, tài liệu không phụ thuộc OS | Ghi official references, ngày review và phạm vi personal/distributed; ghi các điều kiện cần xử lý |

SPIKE-06 có thể dùng cùng evidence cho hai OS nếu phạm vi tài liệu áp dụng chung được ghi rõ. Kết quả SPIKE-06 hiện dựa trên giả định personal use; phạm vi distributed cần review lại terms đầy đủ. Review này cũng cho thấy Codex không có cơ chế multi-account được tài liệu hoá; tách profile Codex CLI qua `CODEX_HOME` cần một spike bổ sung trước khi đưa vào launcher. Kết quả profile/account chỉ xác minh qua workflow chính thức và xác nhận người dùng, không đọc private databases hoặc credential stores.

## Capability matrix thực tế

| Target | OS | Version | Open app/CLI | Open workspace/cwd | Select account | Resume session | Supply context |
|---|---|---|---|---|---|---|---|
| Claude CLI | macOS | 2.1.314 | Not run | Not run | Not run | Not run | supported — đọc `AGENTS.md` khi không có `CLAUDE.md`; `CLAUDE.md` import `@AGENTS.md` nạp cả hai (SPIKE-04) |
| Claude CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude Desktop | macOS | 4.4212.0 (Supply context đo trên 4.29.0) | supported — `open -b` | conditional — `claude --desktop`; cần CLI ≥ 2.1.285, subscription, stdout là terminal | manual — logout/login trong app | conditional — chỉ session CLI sang Desktop qua `--resume` | conditional — Code tab nạp `CLAUDE.md`/`@AGENTS.md` của folder đã chọn; Chat không nạp; `claude://code/new?q=` điền sẵn prompt, người dùng tự gửi (reported) |
| Claude Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex CLI | macOS | 0.155.1 | Not run | Not run | Not run | Not run | supported — đọc `AGENTS.md` từ project root, bỏ qua `CLAUDE.md` (SPIKE-04) |
| Codex CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex Desktop | macOS | 26.1023.51421 | supported — `open -b`, `codex app` | supported — `codex app PATH`, mở thread mới | manual — logout/login trong app | Not run | supported — đọc `AGENTS.md`, bỏ qua `CLAUDE.md` (reported) |
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
Evidence path/link: spikes/<spike-name>/evidence/...
Manual steps / limitations:
Fallback và người xác nhận (nếu có):
Next action:
```

Chỉ điền command sau khi xác minh tài liệu và version thực tế. Harness nằm trong [spikes/](../spikes/README.md); evidence đã làm sạch nằm trong `spikes/<spike-name>/evidence/`, output local nhạy cảm nằm trong `local/` và không đưa vào Git. `Supply context` phải phân biệt prompt đã chuẩn bị, người dùng đã cung cấp và agent đã đọc theo evidence có được.

## Exit review

- [ ] Có inventory exact versions và preconditions cho môi trường được kiểm thử.
- [ ] SPIKE-01–06 có kết quả, evidence và giới hạn áp dụng rõ ràng.
- [ ] Có evidence macOS và Windows; phần thiếu vẫn được ghi chưa kiểm thử.
- [ ] Desktop/CLI có workflow khả dụng; các bước manual được mô tả đúng mức kiểm soát.
- [ ] Những capability không đạt có fallback được review; không còn giả định chặn workflow chính.
- [ ] Kết luận được cập nhật vào STATUS, TDD và ADR liên quan; chỉ sau đó mở technical bootstrap.

**Kết luận hiện tại:** Chưa đủ bằng chứng kết luận Phase 0 pass. Không có compatibility claim mới trong bước repository foundation.
