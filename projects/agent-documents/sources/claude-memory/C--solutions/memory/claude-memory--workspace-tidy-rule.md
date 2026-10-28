---
name: workspace-tidy-rule
description: "_workspace 정리 규칙 — 2026-10-19 기능 폴더 재편(features/<영역>/<기능>, 흔적은 _archive/features). 일회성 파일은 scratchpad. 옛 경로는 _moved.tsv"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: eb10f1b8-0d1a-4ab8-bf2b-f9dcb034f2f4
  modified: 2026-08-25T05:20:39.597Z
---

2026-08-25 사용자 지시: "_workspace 지저분하다, 앞으로 문서 정리 잘해줘."

**Why:** 819개 파일 중 문서(.md)는 175개뿐 — 나머지는 E2E 스크린샷 163장, 일회성 검증 스크립트(.cjs/.mjs/.py) 80여 개, 로그·응답 덤프·고아 node_modules(18MB)였다. 산출물 보존 규칙이 부산물까지 쌓이는 핑계가 됐던 것.

**How to apply:**
- 루트엔 `{kind}_{feature}.md` 산출물 문서만. 문서는 삭제·이동 금지(경로 참조 보존).
- 🔴 **일회성 검증 스크립트·로그·덤프·토큰 파일은 처음부터 세션 scratchpad에 만든다** — _workspace에 만들지 않는다. QA/엔지니어 서브에이전트 지시문에도 이걸 명시할 것.
- 스크린샷은 최소 촬영([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--qa-minimize-screenshots|qa-minimize-screenshots]]) + 문서에 인용된 것만 `_archive/screenshots/`.
- 정리 규칙 정본은 `_workspace/README.md`. 과거 부산물은 `_archive/` 하위로 2026-08-25 일괄 이동 완료(삭제 아님, node_modules만 삭제).

**2026-10-19 기능 폴더 재편(사용자 "너의 추천대로")** — `_workspace`가 77,000파일(코덱스 워크트리 3개 75,000 포함)·문서 900여 건이 접두어 폴더에 흩어져 같은 기능이 4~5곳에 있던 것을 **`features/<영역 14>/<기능>/`**(설계·계약·보고·검수 요청서·QA 한 폴더) + **`_archive/features/<영역>/<기능>/`**(코덱스 원시·프롬프트·JSON·테스트 로그·패치)로 재편. 715건 이동, 외부 문서 609건 경로 재작성(메모리·옵시디언·moveseye-docs·CLAUDE/COLLAB·에이전트·스킬). 정본 표 `_workspace/README.md`, 옛→새 경로 `_workspace/_moved.tsv`. 생성 스크립트는 scratchpad `ws_reorg.py`(일회성).
- 🔴 **코드 주석의 `_workspace/...` 경로 245파일은 고치지 않았다**(레포 diff 회피) — `_moved.tsv`로 찾는다.
- 🔴 **진행 중 세션 문서는 옛 경로를 하드링크로 남김**: APM 알람 채널(`planning/apm-alert-*`, `reviews/review_apm-alert-unit*`, 루트 `contract_apm-alert-*`), 장애 메뉴, legacy-hold/rt3, DB 모니터링. 그 브랜치 병합 뒤 `reviews/`·`planning/`·`designs/`에 남은 링크를 지운다(`fsutil hardlink list`로 확인). → **10-22 APM 알람·장애 메뉴·legacy-hold 73건 삭제 완료**(fsutil로 새 경로 짝 확인), DB 모니터링 4건만 남음.
- 워크트리: 병합·클린 확인한 `apm-ux-fix-20261001/moveseyee_fe`만 `git worktree remove`(세션 산출물은 `_archive/features/apm/ux-fix-20261001/`). **`lld-fix-20260908`(FE·BE 각 미병합 커밋 1)·`worktrees/apm-rum-time-20261006`(더티 31)은 남김** — 사용자 확인 뒤 정리.
- 새 문서 규칙: 기능 폴더에 접두어 그대로(`devdesign_`·`contract_`·`review_`…). 새 영역은 README 표 + 옵시디언 기능 지도에 함께 추가. `_tools/docs-publish/stage.py`(Docs 사본)는 옛 폴더 구조를 전제하므로 다음 재동기화 전 수정 필요.
