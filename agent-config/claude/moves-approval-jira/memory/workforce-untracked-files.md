---
name: workforce-untracked-files
description: 워크포스 리포 커밋 시 폴더 단위 git add 금지 — 사용자 미추적 파일(LeaderTeamBackfill.test.js 등)이 섞여 들어간다
metadata:
  node_type: memory
  type: feedback
  originSessionId: d3aa1205-9e90-45dd-b50f-05f4b19d6c27
  modified: 2026-10-13T01:16:02.418Z
---

워크포스(C:\CloudJira\moves-workforce)에는 사용자가 일부러 커밋하지 않는 미추적 파일이 있다: `src/resolver/backoffice/team/__test__/LeaderTeamBackfill.test.js`, pptx·png, `custom-scopes.yaml`. 커밋할 때 `git add src` 처럼 폴더째 올리지 말고 변경 파일 목록(`git status`)에서 골라 올린 뒤 `git show --stat HEAD` 로 확인한다.

**Why:** 2026-10-11, 2026-10-13 두 번 `git add src` 로 LeaderTeamBackfill.test.js 가 커밋에 들어가 amend 로 뺐다.
**How to apply:** 워크포스 커밋 전 미추적 목록을 보고 제외 파일을 빼고 add. 커밋 후 stat 에서 다시 확인. 관련: [[worklog-certification-model]]
