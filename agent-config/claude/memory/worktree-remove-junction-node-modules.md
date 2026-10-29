---
name: worktree-remove-junction-node-modules
description: "git worktree remove가 node_modules 정션을 따라가 원본 FE node_modules를 통째로 지운다 — 제거 전 정션부터 해제"
metadata:
  type: feedback
---

2026-10-23 `git worktree remove C:/solutions/_workspace/lld-fix-20260908/moveseyee_fe` 실행 중 그 워크트리의 `node_modules`(정션 → `C:\solutions\moveseyee_fe\node_modules`)를 따라 **원본 FE node_modules가 비었다**. 복구는 CI와 같은 `npm ci --legacy-peer-deps`(약 7분, 그냥 `npm ci`는 ERESOLVE로 실패).

**Why:** FE 워크트리들은 설치를 아끼려고 node_modules를 메인 레포로 정션해 둔다(apm-alert-history-fe·zm-155-followup-fe 등). git은 정션을 일반 디렉터리처럼 재귀 삭제한다.

**How to apply:** FE 워크트리를 지우기 전에 `Get-Item <wt>\node_modules -Force`로 LinkType을 보고, Junction이면 `cmd /c rmdir <wt>\node_modules`(링크만 제거)로 먼저 끊은 뒤 `git worktree remove`. 관련: [[workspace-tidy-rule]].
