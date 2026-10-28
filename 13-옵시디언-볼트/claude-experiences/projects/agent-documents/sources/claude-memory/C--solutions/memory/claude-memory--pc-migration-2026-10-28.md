---
name: pc-migration-2026-10-28
description: "10-28 PC 교체 인계 — 문서·미커밋 패치·미푸시 번들을 옵시디언 Vault `projects/moveseye/_pc-migration-2026-10-28/`로, 인계 노트 2026-10-28-pc-migration-handoff"
metadata:
  node_type: memory
  type: project
  originSessionId: eee4683d-0280-4673-9a67-5cecb7771b95
  modified: 2026-10-28T08:15:48.574Z
---

2026-10-28 사용자가 PC를 바꾼다며 문서·진행 중 작업을 옵시디언으로 옮기라고 했다.
- Vault 인계 노트 `projects/moveseye/2026-10-28-pc-migration-handoff.md` — 복원 순서·남은 작업 16건·Vault에 안 넣은 비밀값 목록.
- 사본 `projects/moveseye/_pc-migration-2026-10-28/`: workspace 문서 905개, `git/`(프록시 미커밋 패치 BE·FE, 번들: BE master df1b39f·ZM-172·license ZM-172·codex apm-deep 3저장소·로컬 전용 moveseye-docs 전체), `archives/`(moveseye-docs 작업 트리·Claude 메모리 zip), `tools/`.

**Why:** 새 PC에서 프록시 작업(미커밋)과 미푸시 커밋을 잃지 않고 이어 가기 위해.
**How to apply:** 새 PC 첫 세션에서 "남은 작업"·"이어서" 요청이 오면 인계 노트부터 읽고, 프록시 워크트리가 없으면 노트 §2 순서로 패치를 되살린다. `.env`·라이선스 개인키·도커 DB는 Vault에 없다(사용자가 직접 옮김). 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-proxy-mgmt|zabbix-proxy-mgmt]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--obsidian-vault-sync-2026-09-28|obsidian-vault-sync-2026-09-28]]
