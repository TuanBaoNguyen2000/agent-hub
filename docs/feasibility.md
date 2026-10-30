# Phase 0 — Feasibility plan and evidence

**Updated:** 2026-10-30  
**Phase status:** In progress — macOS: inventory và SPIKE-01–06 xong; còn toàn bộ Windows  
**Evidence:** macOS có evidence, phần Desktop là `reported`; Windows chưa có

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
| Codex CLI version / executable | codex-cli 0.155.1 lúc kiểm kê, tự cập nhật lên 0.166.0 cùng ngày (SPIKE-08); npm global trong nvm: `~/.nvm/versions/node/v24.21.0/bin/codex` | Chưa kiểm kê |
| Codex Desktop version | Không có `Codex.app`; `/Applications/ChatGPT.app` 26.1023.51421 (`com.openai.codex`), `codex app` mở app này (SPIKE-03) | Chưa kiểm kê |
| Terminal / shell | Terminal.app; zsh 5.9 (`/bin/zsh`) | Chưa kiểm kê |
| Auth mode / profile alias | Claude: alias A (`~/.claude`, gói Pro), alias B (`~/.agenthub-spike/claude-b`, gói Team), đều đăng nhập claude.ai; Desktop dùng alias A; Codex đăng nhập ChatGPT, `CODEX_HOME` chưa đặt | Chưa xác minh |
| Test fixture project | `$TMPDIR/agenthub-spike04` từ `setup-fixtures.sh` của SPIKE-04 | Chưa tạo |

Chỉ ghi alias và loại auth cần cho thử nghiệm; không ghi email, tokens, credential file contents hoặc account secrets. Dùng fixture project không chứa source code công ty khi có thể.

**macOS inventory (2026-10-30):** thu thập bằng `sw_vers`, `uname -m`, `command -v`, `--version` và `CFBundleShortVersionString`/`CFBundleIdentifier` trong Info.plist; không đọc config hoặc credential directories. Công cụ phụ: git 2.39.5 (Apple Git-154), Node v24.21.0 qua nvm, npm; không có pnpm.

Quan sát cần kiểm chứng tiếp:

- **Executable resolution:** hai CLI nằm trong thư mục nvm, chỉ có trên PATH khi shell nạp nvm. Mô phỏng môi trường GUI ở [SPIKE-01](../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md): cả hai không tìm thấy; `zsh -ilc` tìm được; đường dẫn tuyệt đối chạy được với Claude, còn Codex cần thêm `node` vào PATH. Chưa kiểm tra từ app Electron đóng gói.
- **Codex Desktop identity:** đã xác nhận ở SPIKE-03: `codex app` mở `/Applications/ChatGPT.app`.

## Spike matrix

| ID | Mục tiêu | macOS | Windows | Điều kiện đạt / evidence cần có |
|---|---|---|---|---|
| SPIKE-01 | Hai Claude CLI profile độc lập | Pass — [evidence](../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md) | Not run | Hai config roots, auth riêng, chạy song song và không lẫn session/context; không copy credential stores |
| SPIKE-02 | Claude Desktop launcher | Pass (reported); chọn account manual — [evidence](../spikes/02-claude-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Ghi nhận open app/workspace và điều kiện desktop/resume riêng; unsupported path có fallback |
| SPIKE-03 | Codex Desktop launcher | Pass (reported); chọn account manual, resume chưa kiểm tra — [evidence](../spikes/03-codex-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Xác minh riêng open app và open workspace theo OS/version; không suy ra thread resumed |
| SPIKE-04 | Project instructions recognition | Pass cho Claude CLI, Codex CLI; Claude Desktop (Code tab + Chat) và Codex Desktop Pass (reported) — [CLI](../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md), [Desktop](../spikes/04-project-instructions/evidence/2026-10-30-macos-claude-desktop.md) | Not run | Fixture cho thấy coding mode đọc đúng CLAUDE.md/AGENTS.md từ project root; phân biệt Chat với Code |
| SPIKE-05 | Account mapping/status | Pass (reported); Codex Desktop chưa kiểm tra — [evidence](../spikes/05-account-mapping/evidence/2026-10-30-macos.md) | Not run | Alias CLI và xác nhận account thủ công được phân biệt; Desktop unknown không bị báo là switched |
| SPIKE-06 | Integration terms/distribution review | Pass — personal scope, giả định ([evidence](../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md)) | Pass — cùng evidence, tài liệu không phụ thuộc OS | Ghi official references, ngày review và phạm vi personal/distributed; ghi các điều kiện cần xử lý |
| SPIKE-07 | Đổi account Claude Desktop bằng thư mục dữ liệu riêng (bổ sung, không tài liệu hoá) | Pass (reported) khi dùng cả `--user-data-dir` và `CLAUDE_CONFIG_DIR`; thiếu biến này thì Code tab dùng chung config với account mặc định — [evidence](../spikes/07-desktop-account-switch/evidence/2026-10-30-macos.md) | Not run | Instance thứ hai giữ account khác, instance chính không đổi; login được giữ lại; mở được không cần terminal; không sửa app, không đọc credential |
| SPIKE-08 | Codex profile isolation qua `CODEX_HOME`, CLI và Desktop (bổ sung) | CLI Pass; Desktop Pass (reported), instance riêng tự dùng login của `CODEX_HOME` — [evidence](../spikes/08-codex-profile-isolation/evidence/2026-10-30-macos.md) | Not run | Hai `CODEX_HOME` dùng hai account; đăng nhập B không đổi A; instructions và session tách nhau; instance Desktop thứ hai đọc `CODEX_HOME` của B |

SPIKE-06 có thể dùng cùng evidence cho hai OS nếu phạm vi tài liệu áp dụng chung được ghi rõ. Kết quả SPIKE-06 hiện dựa trên giả định personal use; phạm vi distributed cần review lại terms đầy đủ. Review này cũng cho thấy Codex không có cơ chế multi-account được tài liệu hoá; tách profile Codex CLI qua `CODEX_HOME` cần một spike bổ sung trước khi đưa vào launcher. Kết quả profile/account chỉ xác minh qua workflow chính thức và xác nhận người dùng, không đọc private databases hoặc credential stores.

## Capability matrix thực tế

| Target | OS | Version | Open app/CLI | Open workspace/cwd | Select account | Resume session | Supply context |
|---|---|---|---|---|---|---|---|
| Claude CLI | macOS | 2.1.314 | conditional — cần resolve executable; mới kiểm tra `-p` | supported — cwd của child process | supported — `CLAUDE_CONFIG_DIR` riêng, người dùng tự đăng nhập; xác minh qua `claude auth status` | Not run — resume chéo profile bị từ chối đúng kỳ vọng | supported — đọc `AGENTS.md` khi không có `CLAUDE.md`; `CLAUDE.md` import `@AGENTS.md` nạp cả hai (SPIKE-04) |
| Claude CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude Desktop | macOS | 4.4212.0 (Supply context đo trên 4.29.0) | supported — `open -b` | conditional — `claude --desktop`; cần CLI ≥ 2.1.285, subscription, stdout là terminal | manual — logout/login trong app; mở từ profile CLI không đổi account (SPIKE-05). conditional — instance riêng với `--user-data-dir` và `CLAUDE_CONFIG_DIR`, không tài liệu hoá; link và `--desktop` vẫn về instance chính (SPIKE-07) | conditional — session CLI của profile mặc định sang Desktop qua `--resume`; session của profile khác báo lỗi dù exit 0 (SPIKE-05) | conditional — Code tab nạp `CLAUDE.md`/`@AGENTS.md` của folder đã chọn; Chat không nạp; `claude://code/new?q=` điền sẵn prompt, người dùng tự gửi (reported) |
| Claude Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex CLI | macOS | 0.166.0 (SPIKE-04 đo trên 0.155.1) | conditional — cần resolve executable và `node` trên PATH; config cá nhân lỗi làm `exec` thất bại | supported — cwd của child process | conditional — `CODEX_HOME` riêng, không tài liệu hoá cho nhiều account; account do người dùng xác nhận qua `/status` (SPIKE-08) | Not run — resume chéo profile bị từ chối đúng kỳ vọng | supported — đọc `AGENTS.md` từ project root, bỏ qua `CLAUDE.md` (SPIKE-04); đọc `AGENTS.md` trong `CODEX_HOME` (SPIKE-08) |
| Codex CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex Desktop | macOS | 26.1023.51421 | supported — `open -b`, `codex app` | supported — `codex app PATH`, mở thread mới | manual — logout/login trong app. conditional — instance riêng với `--user-data-dir` và `CODEX_HOME`, không tài liệu hoá; `codex app` vẫn về app chính (SPIKE-08) | Not run | supported — đọc `AGENTS.md`, bỏ qua `CLAUDE.md` (reported) |
| Codex Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |

Sau kiểm thử, ghi mức `supported`, `conditional`, `manual` hoặc `unsupported` cho từng capability, kèm evidence và điều kiện. Không chuyển toàn bộ một hàng sang supported khi chỉ xác minh được open app.

**Nhận diện account (SPIKE-05, macOS):** chỉ Claude CLI báo được danh tính account theo profile. Codex CLI chỉ báo phương thức đăng nhập. Account trên Desktop do người dùng xác nhận, nếu chưa xác nhận thì là `unverified`. Exit 0 của `claude --desktop` không xác nhận account hay session.

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
