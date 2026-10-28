---
name: workforce-dev-env-moves-rms
description: 개발 사이트 tom-chkim-dev 의 워크포스는 forge 환경 moves-rms 로 설치 — 배포는 -e moves-rms (development 환경은 dmove-sandbox)
metadata:
  node_type: memory
  type: reference
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-22T01:07:30.988Z
---

tom-chkim-dev.atlassian.net 의 Moves Workforce 설치는 forge 환경 **moves-rms**(설치 id 08f67563-…)다. `forge deploy -e development` 는 dmove-sandbox 설치로 가서 개발 사이트에 반영되지 않는다. 워크포스 AGENTS.md 배포 절의 `--e development` 예시는 이 사이트 기준으로는 틀리다.

**How to apply:** 개발 사이트 검증용 워크포스 배포는 `cd moves-workforce && forge deploy --non-interactive -e moves-rms`. 승인 앱은 그대로 `-e development`. 2026-10-22 moves-rms 10.7.0 배포 확인. 관련: [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-approval-jira/memory/claude-memory--channel-decision-2026-10-19|channel-decision-2026-10-19]]
