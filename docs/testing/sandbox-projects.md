# Bộ project thử (sandbox)

Ba repo nhỏ để thử AgentHub trên `.app` thật mà không đụng project đang làm và tốn ít token. Agent dùng tài liệu này để tự kiểm tra một thay đổi hoặc hướng dẫn người dùng thử. Tạo ngày 2026-11-10 theo trao đổi với người dùng.

## Đã chốt

- **Vị trí:** `/Volumes/Supercent/agent-hub-testing-projects/`, nằm ngoài repo AgentHub và tách khỏi các project thật cùng ổ. Đường dẫn này chỉ có trên máy của người dùng.
- **Dữ liệu AgentHub:** dùng `.app` thật với dữ liệu thật (`~/Library/Application Support/AgentHub`), không dùng `--user-data-dir` riêng. Hệ quả:
  - Project thử nằm chung sidebar với project thật; xoá khỏi AgentHub khi thử xong.
  - Trước mỗi lần nâng cấp cấu trúc DB, AgentHub tự sao lưu vào `backups/`.
  - Muốn thử trải nghiệm lần đầu (thêm account, cài skill) thì mới cần thư mục dữ liệu riêng.
- **Project thật:** chỉ dùng để thử "Thêm project", tốc độ quét và cách nhận `AgentContext/` có sẵn. Không mở agent trên project thật để thử luồng.
- **Git:** mỗi repo chỉ có ở máy, **không có remote**, danh tính commit `AgentHub Sandbox <sandbox@agenthub.invalid>`, có tag `baseline` là trạng thái ban đầu. Không thêm remote, không push.
- Thư mục gốc chỉ có `README.md`, không có `CLAUDE.md` hay `AGENTS.md`, vì Claude Code đọc hai file này ở các thư mục cha.

## Ba project

| Project | Loại | Tài liệu context | Branch ban đầu |
|---|---|---|---|
| `sandbox_shooter/` | Unity 2022.3.16f1 ở `unity_project/sandbox_shooter/` (cùng khuôn với `luna_*`), 10 script C# trong `Assets/Sandbox/Shooter/Scripts/`, namespace `Sandbox.Shooter` | `AgentContext/` đầy đủ, workstream đặt trong `Playables/` | `VN/playable001` (có `main`) |
| `sandbox_runner/` | Unity 2022.3.16f1 ở `unity_project/sandbox_runner/`, 6 script, namespace `Sandbox.Runner` | Chưa theo khuôn. Có tài liệu kiểu cũ: `CLAUDE.md` ở gốc, `Docs/Continuity.md`, `Docs/Design.md`, `Docs/ADR/001-lane-movement-without-physics.md` | `main` |
| `sandbox-level-tool/` | Node.js, không có dependency; `npm test` chạy `node --test` (4 test) | Không có; thêm vào AgentHub với "Chưa dùng tài liệu" | `main` |

Hai project Unity có thêm `com.unity.ugui`, có commit file `.meta`, và chưa commit scene nào (D-002 trong tài liệu của shooter). Lần đầu mở bằng Unity Hub mất khoảng một phút để tạo lại `Library/`.

### `sandbox_shooter`: project đang làm dở

Tài liệu trong `unity_project/sandbox_shooter/AgentContext/` viết bằng tiếng Anh, theo khuôn §7.2 của TDD:

- `README.md`, `PROJECT_CONTEXT.md`
- `Playables/playable001/`: `BRIEF.md`, `DECISIONS.md` (D-001 đến D-005), `STATUS.md` (có dòng `Branch: \`VN/playable001\``), 7 task
- `Playables/playable002/`: `BRIEF.md`, `STATUS.md` (branch dự kiến, chưa tạo), 1 task

Gốc repo có `AGENTS.md` trỏ tới `AgentContext/` và `CLAUDE.md` chỉ chứa `@AGENTS.md`.

| Task | Trạng thái trong file | Điểm cài sẵn |
|---|---|---|
| TASK-001 Project skeleton | Done | Có "Verified by user in AgentHub" |
| TASK-002 Player movement and auto-fire | Done | |
| TASK-003 Enemy waves | In review | Còn một tiêu chí chờ người dùng chơi thử |
| TASK-004 Player damage feedback | In progress | Handoff mới nhất của Codex (2026-11-09) sau khi Claude hết quota tuần; `PlayerHealth.cs` có `TODO(TASK-004)` đúng chỗ còn thiếu. Agent chỉ cần sửa 1–2 file. |
| TASK-005 Score and HUD | Done | **Cố ý lệch:** bảng `STATUS.md` ghi `In progress` |
| TASK-006 EndCard and CTA | Blocked | Chờ URL store và art |
| TASK-007 Balance pass | To do | Handoff log trống |
| TASK-008 Boss wave prototype (playable002) | To do | Handoff log trống |

### `sandbox_runner`: project đưa vào AgentHub lần đầu

`Docs/Continuity.md` là nhật ký kiểu cũ (mới nhất ở trên, mục 2026-11-08 có bước tiếp theo và một lỗi đã biết). `CLAUDE.md` có hướng dẫn thật, không chỉ là con trỏ. Sau `context-init`, kết quả đúng là `PROJECT_CONTEXT.md` có mục `## Existing documents` dẫn link tới bốn file trên, không chép nội dung. `context-init` cũng phải đề xuất `AGENTS.md` và `CLAUDE.md` theo ADR-019 mục 9, và người dùng duyệt diff trước khi ghi.

## Kết quả AgentHub đọc được (observed 2026-11-10)

Kết quả có được khi chạy `detectContext` và `readContextOverview` của `packages/persistence` trên ba repo:

| Project | `found` | `others` | Overview |
|---|---|---|---|
| `sandbox_shooter` | `unity_project/sandbox_shooter/AgentContext` | `AGENTS.md`, `CLAUDE.md` | 2 workstream. `playable001` có branch `VN/playable001` và 7 task với trạng thái như bảng trên. `playable002` có branch `null`. Một issue duy nhất là `state_mismatch` ở TASK-005. |
| `sandbox_runner` | không có | `CLAUDE.md`, `Docs/Continuity.md` | Không có |
| `sandbox-level-tool` | không có | không có | Không có |

Nếu kết quả khác bảng này, nghĩa là logic nhận tài liệu đã đổi hoặc repo không còn ở `baseline`.

Agent tự kiểm tra lại mà không cần mở app: lưu đoạn dưới thành file `.ts` trong scratchpad, rồi chạy `npx jiti <file>` từ gốc repo AgentHub.

```ts
import { detectContext } from '/Volumes/Supercent/agent-hub/packages/persistence/src/context-detect';
import { readContextOverview } from '/Volumes/Supercent/agent-hub/packages/persistence/src/context-overview';

const root = '/Volumes/Supercent/agent-hub-testing-projects';
for (const project of ['sandbox_shooter', 'sandbox_runner', 'sandbox-level-tool']) {
  const detected = detectContext(`${root}/${project}`);
  console.log(project, JSON.stringify(detected));
  for (const folder of detected.found) {
    const overview = readContextOverview(folder);
    console.log(JSON.stringify(overview.issues));
    for (const w of overview.workstreams) console.log(' ', w.slug, w.branch, w.tasks.map((t) => `${t.id}:${t.state}`).join(', '));
  }
}
```

## Đưa về trạng thái ban đầu

Chạy trong từng repo:

```bash
git reset --hard baseline && git clean -fdx
```

- Với `sandbox_shooter`, chạy `git switch VN/playable001` trước nếu đã đổi branch, và xoá branch thử (ví dụ `thu`) nếu có.
- `git clean -fdx` xoá luôn `Library/` của Unity.
- Tài liệu context mà AgentHub lưu **trong AgentHub** (không nằm trong repo) không bị reset. Muốn thử lại từ đầu thì xoá project khỏi AgentHub rồi thêm lại.
- Sau khi `context-init` trên `sandbox_runner` chạy thành công một lần, tạo mốc để lần sau không phải chạy lại agent:

```bash
git add -A && git commit -m "after init" && git tag after-init
```

## Project nào cho scenario nào

Số scenario lấy theo [phase3-acceptance.md](phase3-acceptance.md). Kịch bản từng bước trên ba project này ở [phase3-runbook.md](phase3-runbook.md).

| Scenario hoặc kiểm tra | Project | Ghi chú |
|---|---|---|
| 1 Khởi tạo tài liệu | `sandbox_runner` | Chọn "Tạo bộ tài liệu mới" → Trong repo. Chỉ scenario này tốn nhiều token. |
| 2, 3, 6, 8 Chuyển account hoặc provider | `sandbox_shooter`, task TASK-004 | Việc còn lại nhỏ, dễ nhìn ra agent mới có hiểu đúng không |
| 4 Branch khác với STATUS | `sandbox_shooter` | `git switch -c thu` rồi mở lại account |
| 5 Chat rời → Chuyển vào project | `sandbox-level-tool` hoặc `sandbox_shooter` | |
| 7 Project không bật tài liệu | `sandbox-level-tool` | |
| Số task và trạng thái (ADR-027) | `sandbox_shooter` | Đã có sẵn chỗ lệch ở TASK-005. Muốn thử trùng số thì copy một file task sang số đã có. |
| Tab Task, panel Tài liệu | `sandbox_shooter` | Đủ 5 trạng thái, có Handoff log, có tiêu chí đã tick |
| Thêm project có tài liệu sẵn, tốc độ quét | Project thật (`luna_captainofspace`, `linked_cubic`) | Chỉ thêm và xem, không mở agent |

## Hướng dẫn người dùng thử

1. Chuẩn bị:
   - Nếu có thay đổi code thì chạy `npm run package`.
   - Thoát hẳn AgentHub (⌘Q), mở `apps/desktop/release/mac-arm64/AgentHub.app`.
   - Đưa các repo cần dùng về `baseline`.
2. **Tiết kiệm token:**
   - Phần lớn bước kiểm tra không cần agent: tab Task, cảnh báo, Git, Kiểm tra tài liệu, panel Tài liệu. Chỉ cần sửa file trong repo thử bằng tay rồi xem app hiển thị.
   - Chỉ mở agent khi thử luồng do agent làm (`context-init`, checkpoint, resume, capture).
   - Nếu muốn dùng model rẻ, tạo một account riêng (thư mục config riêng) và đặt model trong config của account đó: `settings.json` với Claude, `config.toml` với Codex.
3. **Đánh giá có giảm thao tác không:** chạy cùng một tình huống hai lần từ `baseline`.
   - Lần A: cách cũ, tức là tự mở Claude hoặc Codex và tự giải thích lại.
   - Lần B: dùng AgentHub.

   Với mỗi bước, ghi lại:

   | Chỉ số | Cách đo |
   |---|---|
   | Số thao tác | Số lần click, copy, dán, gõ giải thích lại |
   | Thời gian | Từ lúc quyết định chuyển tới lúc agent mới bắt đầu làm đúng việc |
   | Agent hiểu đúng không | Số lượt phải sửa hoặc giải thích thêm |
   | Token | % usage của account trước và sau |
   | Chỗ khựng lại | Lúc phải dừng để tìm nút hoặc đoán nghĩa |

   Có thể nối các scenario thành kịch bản "một ngày làm việc" trên `sandbox_shooter`:
   1. Tiếp tục TASK-004 bằng account A.
   2. Account A gần hết quota → chuyển sang account B, rồi sang Codex.
   3. Lỡ đổi branch → mở lại agent.
   4. Lưu một ý ngoài lề thành chat rời → chuyển vào project.
   5. Đánh dấu task Xong, tạo task mới và nhờ agent viết acceptance criteria.
4. Ghi kết quả vào STATUS dưới dạng `reported`. Không chép nội dung hội thoại.

## Tạo lại khi mất

Phần nội dung không lưu trong repo AgentHub. Nếu thư mục bị xoá, tạo lại theo mô tả ở trên:

1. Tạo project Unity bằng dòng lệnh:

   ```bash
   /Applications/Unity/Hub/Editor/2022.3.16f1/Unity.app/Contents/MacOS/Unity -batchmode -nographics -quit -createProject <path>/unity_project/<name>
   ```

   Template này chỉ có module, nên phải thêm `"com.unity.ugui": "1.0.0"` vào `Packages/manifest.json`.
2. Viết script và tài liệu theo hai mục project ở trên. Mở lại project ở chế độ không giao diện (`-projectPath … -quit`) để biên dịch và sinh `.meta`. Log không được có `error CS`.
3. Thêm `.gitignore` chuẩn Unity theo dạng `**/Library/`, vì project Unity nằm trong `unity_project/`.
4. `git init -b main`, đặt danh tính commit như mục "Đã chốt", commit theo từng giai đoạn, rồi tạo tag `baseline`. Với shooter: tạo `main` trước, sau đó làm trên `VN/playable001`.
5. Chạy lại đoạn kiểm tra ở mục "Kết quả AgentHub đọc được" và so với bảng.
