---
name: obsidian-vault-sync-2026-09-28
description: 옵시디언 Vault(claude-experiences) 싱크 기록 — 09-28(9월 작업)·10-19(10월 작업 + 기능 지도 MOC 15노드). 다음 싱크 순서·INDEX 규칙·file:// 링크 규약
metadata:
  node_type: memory
  type: project
  originSessionId: eecadb64-1061-4bf0-83c9-50bc19498f7a
  modified: 2026-10-19T00:00:00.000Z
---

2026-09-28 사용자 "문서들 옵시디언에 싱크 맞춤" → Vault `C:\Users\DMOVE\claude-experiences\`를 메모리·`_workspace` 기준으로 대조해 **moveseye 9월 작업 전부 반영**.

- 추가 프로젝트 노트 8: `2026-09-14-zm136-chart-incremental-handover` · `2026-09-15-apm-install-guide-and-fe-polish`(설치 가이드·ResizableDrawer·스케줄러 표·SLO 진입점 오판 묶음) · `2026-09-16-apm-observability-backlogs`(백로그 5건) · `2026-09-21-zm159-scale-call-guard`(감사+ZM-159) · `2026-09-22-zm166-host-duplicate-name` · `2026-09-23-apm-p5-realtime`(P5 전 구간) · `2026-09-28-apm-ingest-resilience` · `2026-09-28-apm-full-review`.
- 추가 주제 노트 3: `topics/backend/shared-it-db-worktree-collision` · `topics/backend/otel-collector-pitfalls` · `topics/claude/codex-exec-operations`.
- 이동 2: `topics/moveseye-history-scan-held-budget` → `topics/backend/` · `projects/moveseye-apm-confluence-guide-2026-09-15` → `projects/moveseye/2026-09-15-apm-confluence-guide`(frontmatter 추가).
- 허브 `moveseye.md`: 결정 6줄·타임라인 08-19~09-28 20줄·열린 항목(미푸시 누적·APM 열린 것·백로그) 갱신, updated 09-28.
- `INDEX.md`: 다른 세션들이 머리·꼬리에 덧붙인 22줄을 절 안으로 이관·중복 통합, 규칙 6번("머리·꼬리에 덧붙이지 말 것") 추가.

**Why:** 타 세션들이 INDEX 머리/꼬리에 `# ` 줄로 덧붙이고 `[[projects/…]]` 경로 링크를 써서 인덱스가 깨져 있었고, 9월 큰 작업(P5·ZM-159·회복력·전체 검토)이 Vault에 없었다.

**How to apply:** 다음 싱크 때는 ① 메모리 MEMORY.md 항목 vs `projects/moveseye/` 파일명 대조 ② INDEX 머리·꼬리 stray 줄 확인 ③ 허브 타임라인 마지막 날짜 확인 순으로. Vault 노트는 상태(`status:`)와 "미푸시" 표기를 유지하고, 커밋 해시는 메모리에서 그대로 옮긴다. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-implementation-progress|apm-implementation-progress]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zm-159-scale-call-guard|zm-159-scale-call-guard]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--workspace-tidy-rule|workspace-tidy-rule]]

**2026-10-19 2차 싱크("최근 문서 싹 뒤져서 옵시디언에" + "문서 링크 기능별로 노드 정리")**
- 프로젝트 노트 9 추가: `2026-10-01-apm-collectors-to-admin-console` · `2026-10-02-zm156-apm-cold-archive` · `2026-10-07-apm-remaining-work-priorities` · `2026-10-07-docs-reading-repo` · `2026-10-08-apm-alert-atomicity` · `2026-10-10-apm-incidents-menu` · `2026-10-12-apm-alert-channel-neutral-delivery` · `2026-10-12-apm-daily-users-ip-hash` · `2026-10-19-zm155-apm-custom-metric-allowlist`. 갱신 2: GPU 설계 노트에 10-10·10-13 병합 절, 회복력 노트 status done.
- 주제 노트 5: `topics/claude/{bash-heredoc-and-inline-quoting,commit-message-hygiene,code-graph-tools-trial}` · `topics/frontend/jest-mock-identity-render-loop`(**frontend 카테고리 신설**) · `topics/backend/spring-security-error-dispatch-sse`.
- **기능 지도 MOC** `projects/moveseye/무브스아이-기능-지도.md` + `projects/moveseye/features/` 영역 노드 15개(홈·인프라·이벤트·자산·맵·Zabbix 구성/운영·클라우드·APM 조회/수집·AI·인증·기반·프리미엄 GPU·DB·문서). 각 노드 = 정본(moveseye-docs) → 설계·계약(_workspace) → 보고·검수 → Vault 노트 링크. 외부 문서는 `file:///C:/solutions/...` 링크(이 PC 전용). 생성기 `scratchpad/gen_feature_map.py`는 일회성 — 재생성 시 기존 노드의 수작업 수정이 덮인다, 다음부턴 노드를 직접 편집.
- 허브 `moveseye.md`: 타임라인 머리에 흩어진 10월 줄 4개를 시간순 꼬리로 이관 + 10월 11줄, 결정 6줄, 열린 항목 3줄(미푸시·APM·백로그) 갱신, 문서 체계에 기능 지도 링크. INDEX: 꼬리 stray 2줄 제거(1 중복·1 이관), moveseye 절 11줄·topics 5줄·Frontend 절 추가.
- 검사: 새 파일의 위키링크·file 링크 깨짐 0. 기존 노트에 메모리 이름(`dev-runtime-startup` 등)을 위키링크로 쓴 깨진 링크 19건은 손대지 않았다.

**How to apply(갱신):** 다음 싱크는 ① MEMORY.md 10-19 이후 항목 vs `projects/moveseye/` 대조 ② INDEX 꼬리(규칙 절 뒤) stray 확인 ③ 허브 타임라인 마지막 날짜 ④ **기능 지도 노드에 새 설계·계약 링크 한 줄**(새 영역이면 허브 표에 행) 순으로.

**2026-10-28 3차 싱크("지금까지 작업 옵시디언에")** — 노트 3: `2026-10-27-zm175-zabbix-web-scenario` · `2026-10-28-runtime-verification-and-actor-fix` · `2026-10-28-zabbix-proxy-management`(active). 허브 타임라인 3줄, 기능 노드 Zabbix-운영(프록시 계약·검수)·Zabbix-구성(Web 시나리오 계약)·apm-수집과-운영 링크, INDEX moveseye 절 3줄. 🔴 INDEX 꼬리(규칙 절 뒤)에 다른 세션 stray 3줄(idc-proxmox·apm-functional-assessment 중복 2) 남아 있음 — 건드리지 않음. 메모리 이름 위키링크는 깨지므로 노트에선 `메모리 이름` 표기.
