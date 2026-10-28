---
name: delegate-implementation-to-codex
description: 사용자는 이 프로젝트의 구현을 Codex CLI에 위임하길 원한다. Claude는 스펙 작성·검증·리뷰를 맡는다.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5570acfa-b090-45bf-a8cf-d0bcf03bf0c8
  modified: 2026-08-13T07:30:23.316Z
---

이 프로젝트에서 사용자는 코드 구현을 직접 하지 말고 `codex exec`로 위임하라고 지시했다
("구현은 코덱스 시켜"). Claude의 역할은 작업 범위 결정, 상세 스펙 작성, 빌드 검증, 코드 리뷰다.

**Why:** 역할을 나눠두니 Codex가 만든 회귀를 Claude가 독립적으로 잡아낼 수 있었다.
실제로 두 건을 잡았다 — `/approvals/users`가 user key 대신 username을 반환하도록 바뀐 회귀,
그리고 수정한 파일 3개를 한 줄로 압축해버린 것. Codex의 "완료" 보고를 그대로 믿지 말고
항상 빌드를 직접 돌리고 코드를 읽어야 한다.

**How to apply:**
- (2026-08-13 강화) **Claude는 검토만, 구현은 전부 Codex** — QA FAIL 재작업도 Codex. 직접 수정
  경로는 폐지(반복 실패 시 사용자 보고). **Codex는 최상위 모델**: `codex exec -m gpt-5.6-sol
  -c model_reasoning_effort="xhigh" ...` (models_cache.json priority 1 실측; ultra effort는
  자체 위임 기능 때문에 제외).
- 스펙은 파일로 써서 `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check - < spec.md` 로 넘긴다.
- 여러 배치가 같은 파일을 건드리면 **절대 병렬 실행하지 말 것.** 한 셸 안에서 순차로 실행한다.
  `pgrep`으로 프로세스를 감시하는 방식은 Windows Git Bash에서 동작하지 않아 실제로 두 배치가
  동시에 돌아 빌드가 깨진 적이 있다.
- 스펙에 코드 스타일(개별 import, statement 한 줄, 중괄호 필수)을 매번 명시한다. 빠뜨리면 압축한다.
- Codex 실행이 네트워크 단절로 죽으면 트리가 부분 적용 상태로 남는다.
  현재 저장소에 커밋이 없어 되돌릴 수 없으므로, 부분 상태를 설명하는 복구 지시를 앞에 붙여 재실행한다.
