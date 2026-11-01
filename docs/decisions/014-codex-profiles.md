# ADR-014 — Codex profiles

**Status:** Accepted for MVP (opt-in, `conditional`); sửa đổi TDD §3.3 và ADR-006 cho Codex Desktop  
**Date:** 2026-10-30  
**Decision source:** Người dùng chọn ghi ADR-014 sau khi xem kết quả SPIKE-08 trong phiên Phase 0.

## Context

TDD §3.3 chỉ yêu cầu một profile Codex trong MVP, và [ADR-006](../TDD.md#15-architecture-decision-records-adrs) để việc đổi account trên Codex Desktop là manual. Người dùng có hai account ChatGPT: một account Business cho công việc và một account Free cá nhân. Mục đích là giữ hai account tách nhau (TDD §16 câu 8), không phải để có thêm quota.

Kết quả Phase 0 trên macOS:

- [SPIKE-08](../../spikes/08-codex-profile-isolation/evidence/2026-10-30-macos.md): `CODEX_HOME` riêng tách được login, `AGENTS.md` của profile và session của Codex CLI; resume chéo bị từ chối, chạy song song được, logout một profile không ảnh hưởng profile kia. Một instance ChatGPT.app mở với `--user-data-dir` riêng và `CODEX_HOME` của profile B đã đăng nhập sẵn account B, trong khi app chính vẫn là account A. `codex app` vẫn mở folder ở app chính. Kết quả Desktop là `reported`.
- [SPIKE-05](../../spikes/05-account-mapping/evidence/2026-10-30-macos.md): `codex login status` chỉ báo phương thức đăng nhập, không báo account nào.
- Đăng nhập bằng mã (`--device-auth`) bị chặn với workspace Business cho đến khi admin bật. Browser có thể tự xác nhận bằng account đang mở trên chatgpt.com.
- Dùng `CODEX_HOME` cho nhiều account và `--user-data-dir` trên ChatGPT.app đều không có trong tài liệu chính thức. [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) không có điều khoản về việc một người có nhiều account, nhưng cấm vượt rate limit hay restriction. Business Terms chưa đọc ([README SPIKE-08](../../spikes/08-codex-profile-isolation/README.md#tài-liệu-và-điều-khoản-kiểm-tra-2026-10-30)).

## Decision

1. **Codex profile là tùy chọn người dùng tự bật.** Mỗi profile gồm một alias và một `CODEX_HOME`. Profile mặc định dùng `~/.codex`; mỗi profile phụ có thư mục riêng.
2. **CLI:** AgentHub truyền `CODEX_HOME` vào env của child process, dựng env từ allowlist, bằng argument array.
3. **Desktop trên macOS:** profile mặc định dùng app chính. Profile phụ mở bằng `open -n -a ChatGPT --env CODEX_HOME=<home> --args --user-data-dir=<data dir>`; bắt buộc có cả hai thư mục. Không bao giờ trỏ instance phụ vào thư mục dữ liệu mặc định.
4. **Đăng nhập:** người dùng tự chạy `codex login` chính thức trong terminal do AgentHub mở. AgentHub hướng dẫn dùng cửa sổ riêng tư, và yêu cầu người dùng kiểm tra `/status` sau khi đăng nhập. Không dựa vào `--device-auth`.
5. **Trạng thái account không phải `verified`.** AgentHub chỉ biết profile đã đăng nhập (`codex login status`). Account là do người dùng xác nhận qua `/status`; kết quả mở không bao giờ là `switched` (TDD §8.4).
6. **Ranh giới dữ liệu:** `auth.json` trong `CODEX_HOME` và thư mục dữ liệu của instance phụ được xem như credential store. AgentHub không mở, sao chép, backup, đồng bộ hay ghi log nội dung của chúng. Không sửa, giải nén hay re-sign `ChatGPT.app`.
7. **Không tự sao chép config giữa các profile.** `CODEX_HOME` mới không có `config.toml`, MCP server, plugin hay `AGENTS.md` của profile mặc định; người dùng tự cấu hình. `config.toml` có thể chứa thông tin của MCP server nên không được sao chép tự động.
8. **Người dùng chọn profile cho từng lần mở.** Không tự xoay profile khi hết quota (TDD §1.4). Allowlist project–profile (TDD §11) đặc biệt áp dụng để project công ty không mở bằng account cá nhân.
9. **Mức capability là `conditional`,** kiểm tra theo version CLI và app; khi không đạt thì quay về manual flow của ADR-006. Phạm vi: dùng cá nhân (người dùng xác nhận 2026-11-01, TDD §16 câu 3), chỉ macOS. Windows là `Not run` cho đến khi chạy SPIKE-08 trên Windows.

## Consequences

- Người dùng đổi account Codex trên CLI và Desktop bằng một lựa chọn trong AgentHub. Một lần đăng nhập bằng CLI dùng được cho cả CLI lẫn Desktop của profile đó.
- Ở instance phụ, mở workspace là manual: người dùng tự mở folder. `codex app` chỉ dùng cho app chính.
- Mỗi profile phụ có Desktop tốn khoảng 390 MB.
- Codex CLI tự cập nhật (0.155.1 lên 0.166.0 trong ngày SPIKE-08), nên launcher phải đọc version mỗi lần chạy.
- Workspace Business có thể bị admin giới hạn: chặn đăng nhập bằng mã, hoặc khoá vào một workspace (`forced_chatgpt_workspace_id`). AgentHub phải hiển thị lỗi đó, không coi là launch thành công.
- `platform` dùng chung adapter mở instance và theo dõi PID với ADR-013. `integrations` cần capability mapping cho Codex CLI và ChatGPT.app.
- Chưa kiểm tra resume trong cùng profile. [SPIKE-09](../../spikes/09-electron-launcher-prototype/evidence/2026-11-01-macos.md) đã chạy lệnh mở từ app Electron mở bằng Finder, người dùng báo đúng account B, kể cả sau khi ChatGPT.app cập nhật lên 26.1027.51404. Vì `open` chuyển env của process gọi sang instance, lệnh mở phải chạy với env allowlist.
- Trước khi phân phối cho người khác, phải review Business Terms và Usage Policies, và có thể phải bỏ tính năng này.

## Related decisions

ADR-002 (Desktop/CLI parity), ADR-006 (manual fallback, vẫn áp dụng cho app chính và khi cơ chế này không đạt), ADR-012 (package boundaries) và [ADR-013](013-claude-desktop-account-instances.md) (cùng mô hình instance cho Claude Desktop).
