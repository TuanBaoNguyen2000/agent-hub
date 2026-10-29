# Integrations

**Status:** Scaffold only. Chưa có launcher implementation hoặc capability được xác minh trên máy thật.

## Trách nhiệm

Bốn launcher adapters: Claude Desktop, Claude CLI, Codex Desktop và Codex CLI. Ánh xạ capability theo provider/version, chuẩn bị request phù hợp và báo giới hạn/manual steps chính xác.

## Boundary

- Dependencies nội bộ: application và domain.
- Nhận platform port qua dependency injection; không import trực tiếp platform implementation.
- Không gọi process/OS trực tiếp; platform adapter thực hiện thao tác hệ thống.
- Không truy cập provider credentials/private databases hoặc xây lại agent/chat loop.
- Desktop account alias là target được chọn, không chứng minh account đang đăng nhập.
- Exact commands/flags chỉ được triển khai sau capability verification; hiện chưa chốt launcher commands.

## Kiểm chứng dự kiến

Fake-platform tests cho executable/args/cwd/env, capability gating và fallback; native smoke tests theo OS/version trong Phase 0 và các phase launcher. Không đánh dấu session resumed khi chỉ mở app.

Tham chiếu: [Development guide](../../docs/DEVELOPMENT.md), [Feasibility plan](../../docs/feasibility.md), [TDD §3](../../docs/TDD.md#3-integration-feasibility-and-policy-boundaries).
