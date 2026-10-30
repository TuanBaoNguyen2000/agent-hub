# SPIKE-05 — Account mapping and status

**Status:** Harness sẵn sàng; chưa chạy. Cần profile B từ [SPIKE-01](../01-claude-profile-isolation/README.md).

## Objective

Xác định mỗi surface báo được gì về account đang dùng, để AgentHub phân biệt alias đã kiểm chứng với lựa chọn chỉ do người dùng xác nhận. Kiểm tra profile CLI có ảnh hưởng đến account của Claude Desktop hay không.

## Pass criteria

Theo [feasibility.md](../../docs/feasibility.md): alias CLI và xác nhận account thủ công được phân biệt; Desktop unknown không bị báo là switched.

## Cách chạy

Chạy trong Terminal.app sau khi profile B đã đăng nhập. Script hỏi quan sát sau từng bước và gửi một request ngắn bằng profile B.

```bash
spikes/05-account-mapping/run-account-checks.sh
```

Quan sát ghi vào `local/<timestamp>/` (ignored). Chỉ ghi alias A/B, không ghi email; danh tính account trong log chỉ là hash ngắn.

## Evidence

Chưa có.
