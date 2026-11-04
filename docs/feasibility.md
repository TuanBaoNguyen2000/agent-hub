# Phase 0 — Feasibility plan and evidence

**Updated:** 2026-11-01  
**Phase status:** macOS: đạt exit review (2026-11-01), có điều kiện; Windows hoãn theo ADR-015, vẫn `Not run`  
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
| Claude CLI version / executable | 2.1.295 lúc kiểm kê, tự cập nhật lên 2.1.314 cùng ngày và 2.1.316 ngày 2026-11-01 (auto-update bật); npm global trong nvm: `~/.nvm/versions/node/v24.21.0/bin/claude` | Chưa kiểm kê |
| Claude Desktop version / Code mode | 4.29.0 lúc kiểm kê, tự cập nhật lên 4.4212.0 cùng ngày; `/Applications/Claude.app` (`com.anthropic.claudefordesktop`); Code tab hoạt động (SPIKE-04) | Chưa kiểm kê |
| Codex CLI version / executable | codex-cli 0.155.1 lúc kiểm kê, tự cập nhật lên 0.166.0 cùng ngày (SPIKE-08); npm global trong nvm: `~/.nvm/versions/node/v24.21.0/bin/codex` | Chưa kiểm kê |
| Codex Desktop version | Không có `Codex.app`; `/Applications/ChatGPT.app` 26.1023.51421 (`com.openai.codex`), tự cập nhật lên 26.1027.51404 trước 2026-11-01; `codex app` mở app này (SPIKE-03) | Chưa kiểm kê |
| Terminal / shell | Terminal.app; zsh 5.9 (`/bin/zsh`) | Chưa kiểm kê |
| Auth mode / profile alias | Claude: alias A (`~/.claude`, gói Pro), alias B (`~/.agenthub-spike/claude-b`, gói Team), đều đăng nhập claude.ai; Desktop dùng alias A; Codex đăng nhập ChatGPT, `CODEX_HOME` chưa đặt | Chưa xác minh |
| Test fixture project | `$TMPDIR/agenthub-spike04` từ `setup-fixtures.sh` của SPIKE-04 (macOS đã xoá trước 2026-11-01, chạy lại script khi cần); `~/.agenthub-spike/spike09` cho SPIKE-09 | Chưa tạo |

Chỉ ghi alias và loại auth cần cho thử nghiệm; không ghi email, tokens, credential file contents hoặc account secrets. Dùng fixture project không chứa source code công ty khi có thể.

**Đối chiếu lúc exit review (2026-11-01):** macOS 26.5.1, Claude CLI 2.1.316, Claude Desktop 4.4212.0, codex-cli 0.166.0, ChatGPT.app 26.1027.51404.

**macOS inventory (2026-10-30):** thu thập bằng `sw_vers`, `uname -m`, `command -v`, `--version` và `CFBundleShortVersionString`/`CFBundleIdentifier` trong Info.plist; không đọc config hoặc credential directories. Công cụ phụ: git 2.39.5 (Apple Git-154), Node v24.21.0 qua nvm, npm; không có pnpm.

Quan sát cần kiểm chứng tiếp:

- **Executable resolution:** hai CLI nằm trong thư mục nvm, chỉ có trên PATH khi shell nạp nvm. Mô phỏng môi trường GUI ở [SPIKE-01](../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md): cả hai không tìm thấy; `zsh -ilc` tìm được; đường dẫn tuyệt đối chạy được với Claude, còn Codex cần thêm `node` vào PATH. [SPIKE-09](../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md) cho kết quả tương tự từ app Electron đóng gói mở bằng double-click trong Finder (người dùng báo) và bằng `env -i … open`; `zsh -lc` không đủ.
- **Codex Desktop identity:** đã xác nhận ở SPIKE-03: `codex app` mở `/Applications/ChatGPT.app`.

## Spike matrix

| ID | Mục tiêu | macOS | Windows | Điều kiện đạt / evidence cần có |
|---|---|---|---|---|
| SPIKE-01 | Hai Claude CLI profile độc lập | Pass — [evidence](../spikes/01-claude-profile-isolation/evidence/2026-10-30-macos.md) | Not run | Hai config roots, auth riêng, chạy song song và không lẫn session/context; không copy credential stores |
| SPIKE-02 | Claude Desktop launcher | Pass (reported); chọn account manual — [evidence](../spikes/02-claude-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Ghi nhận open app/workspace và điều kiện desktop/resume riêng; unsupported path có fallback |
| SPIKE-03 | Codex Desktop launcher | Pass (reported); chọn account manual, resume chưa kiểm tra — [evidence](../spikes/03-codex-desktop-launcher/evidence/2026-10-30-macos.md) | Not run | Xác minh riêng open app và open workspace theo OS/version; không suy ra thread resumed |
| SPIKE-04 | Project instructions recognition | Pass cho Claude CLI, Codex CLI; Claude Desktop (Code tab + Chat) và Codex Desktop Pass (reported) — [CLI](../spikes/04-project-instructions/evidence/2026-10-30-macos-cli.md), [Desktop](../spikes/04-project-instructions/evidence/2026-10-30-macos-claude-desktop.md) | Not run | Fixture cho thấy coding mode đọc đúng CLAUDE.md/AGENTS.md từ project root; phân biệt Chat với Code |
| SPIKE-05 | Account mapping/status | Pass (reported); Codex Desktop không có trong lần chạy này, account do người dùng xác nhận ở SPIKE-08 và SPIKE-09 — [evidence](../spikes/05-account-mapping/evidence/2026-10-30-macos.md) | Not run | Alias CLI và xác nhận account thủ công được phân biệt; Desktop unknown không bị báo là switched |
| SPIKE-06 | Integration terms/distribution review | Pass — personal scope, người dùng xác nhận 2026-11-01 ([evidence](../spikes/06-integration-terms-review/evidence/2026-10-30-docs-review.md)) | Pass — cùng evidence, tài liệu không phụ thuộc OS | Ghi official references, ngày review và phạm vi personal/distributed; ghi các điều kiện cần xử lý |
| SPIKE-07 | Đổi account Claude Desktop bằng thư mục dữ liệu riêng (bổ sung, không tài liệu hoá) | Pass (reported) khi dùng cả `--user-data-dir` và `CLAUDE_CONFIG_DIR`; thiếu biến này thì Code tab dùng chung config với account mặc định — [evidence](../spikes/07-desktop-account-switch/evidence/2026-10-30-macos.md) | Not run | Instance thứ hai giữ account khác, instance chính không đổi; login được giữ lại; mở được không cần terminal; không sửa app, không đọc credential |
| SPIKE-08 | Codex profile isolation qua `CODEX_HOME`, CLI và Desktop (bổ sung) | CLI Pass; Desktop Pass (reported), instance riêng tự dùng login của `CODEX_HOME` — [evidence](../spikes/08-codex-profile-isolation/evidence/2026-10-30-macos.md) | Not run | Hai `CODEX_HOME` dùng hai account; đăng nhập B không đổi A; instructions và session tách nhau; instance Desktop thứ hai đọc `CODEX_HOME` của B |
| SPIKE-09 | Launcher prototype trên Electron (bổ sung) | Pass (process observed, màn hình reported); rủi ro còn mở: profile A của Claude CLI từng mất đăng nhập ngay sau `claude --desktop` qua pty, không tái hiện được với token mới, chưa rõ nguyên nhân — [evidence](../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md) | Not run | App mở từ Finder tìm và chạy được hai CLI với env allowlist; instance Desktop đúng account; CLI tương tác đúng cwd và profile trong Terminal.app; `claude --desktop` qua pty mở đúng folder |
| SPIKE-10 | MCP server chạy từ `.app` (ADR-019 điều kiện 4) | Pass (observed): binary của app với `ELECTRON_RUN_AS_NODE=1` chạy stub trong `app.asar`, load được `better-sqlite3`; Claude CLI 2.1.316 và Codex CLI 0.166.0 khởi chạy được và bắt tay xong; cần giữ fuse `RunAsNode` — [evidence](../spikes/10-mcp-server-from-app/evidence/2026-11-04-macos.md) | Not run | Không cần Node riêng; stdout sạch, không có Dock icon; thoát khi client đóng hoặc chết; đường dẫn có dấu và khoảng trắng; không dùng account thật |
| SPIKE-11 | MCP trên Codex: sandbox và hỏi quyền (ADR-019 điều kiện 1) | CLI Pass (observed): MCP server chạy ngoài seatbelt, ghi được thư mục tài liệu ngoài workspace ở mọi sandbox mode; tool có `readOnlyHint` chạy luôn, tool ghi cần phê duyệt hoặc `tools.<tool>.approval_mode="approve"`; TUI hỏi Allow / Allow for this session / Always allow / Cancel (reported); Codex app chưa thử — [evidence](../spikes/11-codex-mcp/evidence/2026-11-04-macos.md) | Not run | MCP ghi được ngoài workspace còn shell thì không; xác định được cấu hình phê duyệt tối thiểu; không sửa `~/.codex` |
| SPIKE-12 | MCP trên Claude Desktop: tab Code và Chat của instance phụ (ADR-019 điều kiện 2, 3) | Tab Code Pass (observed): dùng MCP trong `CLAUDE_CONFIG_DIR` của account, và Desktop còn đưa server của `claude_desktop_config.json` vào session, ưu tiên bản này khi trùng tên. Instance phụ khởi chạy server từ `claude_desktop_config.json` riêng (observed); Chat dùng được tool khi không có instance khác cùng account; bridge tool local chỉ cho một instance mỗi account (`device_id held by a live connection`) — [evidence](../spikes/12-claude-desktop-mcp/evidence/2026-11-04-macos.md) | Not run | Tab Code và Chat của instance phụ gọi được tool; instance chính không bị ảnh hưởng |
| SPIKE-13 | Prompt ban đầu và `--add-dir` của hai CLI (ADR-019 điều kiện 5) | Pass (observed): lời nhắc chứa ký tự đặc biệt vào session khớp từng byte, không bị thực thi; Claude chặn bằng hộp thoại tin tưởng folder ở lần đầu, Codex không; `--add-dir` của cả hai cho ghi ra ngoài workspace, Claude phải dùng dạng `--add-dir=<dir>` — [evidence](../spikes/13-cli-prompt-add-dir/evidence/2026-11-04-macos.md) | Not run | Hai CLI nhận đúng lời nhắc từ script theo khuôn launcher; `--add-dir` mở quyền ghi, thiếu nó thì bị chặn |
| SPIKE-14 | Thư mục skill theo account và project (ADR-019 điều kiện 6) | Pass có điều kiện (observed): `$CLAUDE_CONFIG_DIR/skills` và `$CODEX_HOME/skills` tách theo account, symlink được nạp; project là `.claude/skills` và `.agents/skills` từ cwd lên gốc repo; Claude nạp skill của thư mục `--add-dir`, Codex không; Codex đọc `~/.agents/skills` dùng chung cho mọi account — [evidence](../spikes/14-skill-dirs/evidence/2026-11-04-macos.md) | Not run | Mỗi provider có thư mục skill theo account mà account khác không đọc; ghi lại thư mục dùng chung |
| SPIKE-15 | Định vị session gần nhất theo folder (ADR-019 điều kiện 7) | Pass (observed): tìm đúng session gần nhất kể cả khi tên thư mục mã hoá của Claude trùng hoặc bị cắt, folder tên NFD, session cũ được resume, có hoặc không tính thư mục con; Codex đọc qua bảng `threads` chỉ-đọc hoặc quét `session_meta`; Codex đọc được file của Claude, Claude cần `--add-dir` — [evidence](../spikes/15-session-locate/evidence/2026-11-04-macos.md) | Not run | Tìm đúng session gần nhất của folder chỉ từ metadata; agent provider kia đọc được phần cuối file |

SPIKE-06 có thể dùng cùng evidence cho hai OS nếu phạm vi tài liệu áp dụng chung được ghi rõ. Kết quả SPIKE-06 chỉ áp dụng cho personal use, phạm vi người dùng đã xác nhận; phạm vi distributed cần review lại terms đầy đủ. Review này cũng cho thấy Codex không có cơ chế multi-account được tài liệu hoá; tách profile Codex CLI qua `CODEX_HOME` cần một spike bổ sung trước khi đưa vào launcher. Kết quả profile/account chỉ xác minh qua workflow chính thức và xác nhận người dùng, không đọc private databases hoặc credential stores.

## Capability matrix thực tế

| Target | OS | Version | Open app/CLI | Open workspace/cwd | Select account | Resume session | Supply context |
|---|---|---|---|---|---|---|---|
| Claude CLI | macOS | 2.1.316 (SPIKE-01, SPIKE-04 đo trên bản cũ hơn) | conditional — cần resolve executable; mở tương tác trong Terminal.app từ Electron (SPIKE-09) | supported — cwd của child process | supported — `CLAUDE_CONFIG_DIR` riêng, người dùng tự đăng nhập; xác minh qua `claude auth status` | Not run, MVP không yêu cầu; fallback là session mới với handoff — resume chéo profile bị từ chối đúng kỳ vọng | supported — đọc `AGENTS.md` khi không có `CLAUDE.md`; `CLAUDE.md` import `@AGENTS.md` nạp cả hai (SPIKE-04) |
| Claude CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Claude Desktop | macOS | 4.4212.0 (Supply context đo trên 4.29.0) | supported — `open -b` | conditional — `claude --desktop`; cần CLI ≥ 2.1.285, subscription, stdout là terminal; từ Electron chạy qua `/usr/bin/script` và kiểm tra login trước, sau (SPIKE-09) | manual — logout/login trong app; mở từ profile CLI không đổi account (SPIKE-05). conditional — instance riêng với `--user-data-dir` và `CLAUDE_CONFIG_DIR`, không tài liệu hoá; link và `--desktop` vẫn về instance chính (SPIKE-07) | conditional — session CLI của profile mặc định sang Desktop qua `--resume`; session của profile khác báo lỗi dù exit 0 (SPIKE-05) | conditional — Code tab nạp `CLAUDE.md`/`@AGENTS.md` của folder đã chọn; Chat không nạp; `claude://code/new?q=` điền sẵn prompt, người dùng tự gửi (reported) |
| Claude Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex CLI | macOS | 0.166.0 (SPIKE-04 đo trên 0.155.1) | conditional — cần resolve executable và `node` trên PATH; config cá nhân lỗi làm `exec` thất bại; mở tương tác trong Terminal.app từ Electron (SPIKE-09) | supported — cwd của child process | conditional — `CODEX_HOME` riêng, không tài liệu hoá cho nhiều account; account do người dùng xác nhận qua `/status` (SPIKE-08) | Not run, MVP không yêu cầu; fallback là session mới với handoff — resume chéo profile bị từ chối đúng kỳ vọng | supported — đọc `AGENTS.md` từ project root, bỏ qua `CLAUDE.md` (SPIKE-04); đọc `AGENTS.md` trong `CODEX_HOME` (SPIKE-08) |
| Codex CLI | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |
| Codex Desktop | macOS | 26.1027.51404 | supported — `open -b`, `codex app` | supported — `codex app PATH`, mở thread mới | manual — logout/login trong app. conditional — instance riêng với `--user-data-dir` và `CODEX_HOME`, không tài liệu hoá; `codex app` vẫn về app chính (SPIKE-08) | Not run, MVP không yêu cầu; fallback là thread mới với handoff | supported — đọc `AGENTS.md`, bỏ qua `CLAUDE.md` (reported) |
| Codex Desktop | Windows | Chưa ghi nhận | Not run | Not run | Not run | Not run | Not run |

Sau kiểm thử, ghi mức `supported`, `conditional`, `manual` hoặc `unsupported` cho từng capability, kèm evidence và điều kiện. Không chuyển toàn bộ một hàng sang supported khi chỉ xác minh được open app.

**Launch từ Electron (SPIKE-09, macOS):** các launch trong bảng đều chạy được từ app Electron mở bằng Finder, nên các mức giữ nguyên, kết quả trên màn hình là `reported`. Điều kiện thêm cho launcher: `open` chuyển env của process gọi sang app được mở, nên mọi lệnh `open` phải chạy với env allowlist; `claude --desktop` cần pty, và `/usr/bin/script` được chấp nhận với exit 0; profile A của CLI từng mất đăng nhập ngay sau lần chạy đầu, không tái hiện được với token mới, nên launcher cần kiểm tra `claude auth status` trước và sau; CLI tương tác mở được qua file `.command` dùng một lần, không cần quyền Automation, nhưng không có handle của cửa sổ Terminal.

**Chọn instance (SPIKE-07, macOS, 2026-11-02):** `open -b`, link và các lệnh dựa trên chúng đi tới instance khởi động sớm nhất của app, không phải app chính. Khi đó AgentHub không dùng lệnh mở folder cho app chính ([evidence](../spikes/07-desktop-account-switch/evidence/2026-11-02-macos-instance-routing.md)).

**Nhận diện account (SPIKE-05, macOS):** Claude CLI báo danh tính account theo profile qua `claude auth status`. `codex login status` chỉ báo phương thức đăng nhập; `codex app-server` (`[experimental]`) báo email theo `CODEX_HOME` ([evidence 2026-11-02](../spikes/05-account-mapping/evidence/2026-11-02-macos-login-and-identity.md)). Account trên Desktop do người dùng xác nhận, nếu chưa xác nhận thì là `unverified`. Exit 0 của `claude --desktop` không xác nhận account hay session.

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

Thực hiện 2026-11-01, chỉ cho macOS theo [ADR-015](decisions/015-macos-first-delivery.md).

- [x] Có inventory exact versions và preconditions cho môi trường được kiểm thử.
- [x] SPIKE-01–06 có kết quả, evidence và giới hạn áp dụng rõ ràng; SPIKE-07–09 cũng vậy.
- [x] Có evidence macOS; Windows hoãn theo [ADR-015](decisions/015-macos-first-delivery.md) và vẫn ghi `Not run`.
- [x] Desktop/CLI có workflow khả dụng; các bước manual được mô tả đúng mức kiểm soát.
- [x] Những capability không đạt có fallback được review; không còn giả định chặn workflow chính.
- [x] Kết luận được cập nhật vào STATUS, TDD và ADR liên quan; chỉ sau đó mở technical bootstrap.

**Kết luận:** Phase 0 đạt exit criteria trên macOS, với các điều kiện bên dưới. Đây không phải compatibility claim cho Windows hay cho version khác. Các quyết định trước bootstrap đã chốt ở [ADR-009](decisions/009-external-terminal.md), [ADR-016](decisions/016-workspace-and-build-tooling.md), [ADR-017](decisions/017-mvp-git-observations.md) và TDD §16.

Phần lớn kết quả trên màn hình là `reported`: người dùng báo, không có ảnh chụp. Các cơ chế instance của ADR-013 và ADR-014 không được tài liệu hoá.

### Workflow trên macOS

| Scenario (TDD §9.4) | AgentHub làm được | Người dùng tự làm | Evidence |
|---|---|---|---|
| A — Claude Desktop A → B | Mở instance của B, chuẩn bị file và prompt | Đăng nhập lần đầu, chọn folder, dán prompt, xác nhận account | SPIKE-07, SPIKE-09 |
| B — Claude Desktop A → CLI B | Mở Terminal đúng cwd và `CLAUDE_CONFIG_DIR`, chuẩn bị prompt | Đăng nhập nếu cần, nhập prompt | SPIKE-01, SPIKE-09 |
| C — Claude → Codex Desktop | App chính: mở đúng workspace. Instance B: mở app. Chuẩn bị prompt | Instance B: mở folder. Kiểm tra account, tạo thread, nhập prompt | SPIKE-03, SPIKE-08, SPIKE-09 |
| D — Cùng account, chat mới | Mở Desktop hoặc CLI, chuẩn bị handoff | Dán prompt nếu dùng Desktop | SPIKE-02, SPIKE-04, SPIKE-09 |

Kiểm tra branch/SHA trong scenario D chưa thuộc Phase 0; phạm vi MVP đã chốt ở [ADR-017](decisions/017-mvp-git-observations.md).

### Fallback

| Capability không tự động hoặc chưa xác minh | Fallback | Nguồn quyết định |
|---|---|---|
| Đổi account Desktop khi instance không đạt | Logout/login trong app | ADR-006, ADR-013, ADR-014 |
| Mở workspace, resume ở instance phụ | Người dùng tự chọn folder, dán handoff | ADR-013, ADR-014 |
| Xác nhận account trên Desktop và Codex | Người dùng xác nhận; nếu chưa thì `unverified` | ADR-013, ADR-014, SPIKE-05 |
| `claude --desktop` lỗi, hoặc CLI thiếu, chưa đăng nhập | `Open app` + `Open folder` + `Copy Handoff Prompt` | TDD §3.5 |
| Resume native (ba ô `Not run` trên macOS) | Session mới với handoff; MVP không yêu cầu resume | TDD §0, §3.5 |
| Prompt dài qua `claude://` (chưa đo giới hạn của `q`) | Copy prompt; prompt trỏ đến file context | TDD §3.5 |

### Điều kiện mang sang các phase sau

1. **Launcher (Phase 2):** gọi `open` với env allowlist; tự đặt `LANG`; thêm thư mục của executable vào `PATH`; tìm CLI bằng `zsh -ilc` với dự phòng quét thư mục; chạy `claude --desktop` qua pty và kiểm tra `claude auth status` trước, sau; không dùng exit code để báo đã mở đúng folder, account hay session. Chi tiết ở [TDD §5.2](TDD.md#52-process-launching-safety).
2. **Kiểm tra theo version:** ADR-013 và ADR-014 chỉ có evidence trên Claude Desktop 4.4212.0 và ChatGPT.app 26.1027.51404. Cả hai CLI và ChatGPT.app đã tự cập nhật trong lúc làm Phase 0.
3. **Phạm vi là personal use,** người dùng xác nhận 2026-11-01. Nếu phân phối cho người khác, phải review lại terms và có thể phải bỏ ADR-013, ADR-014.

### Rủi ro còn mở, không chặn workflow

- Chưa rõ vì sao profile A của Claude CLI mất đăng nhập ngay sau `claude --desktop` qua pty ([SPIKE-09](../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md#profile-a-của-claude-cli-mất-đăng-nhập)).
- Chưa kiểm tra project instructions trong instance Claude phụ; SPIKE-04 trên Claude Desktop đo ở 4.29.0.
- Chưa thử `claude --desktop` khi Desktop chưa mở, app đã notarize và quarantine, terminal khác Terminal.app.
