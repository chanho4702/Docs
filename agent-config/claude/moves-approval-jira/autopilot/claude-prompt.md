# 자율 개발 1회차 지시 (Claude)

당신은 무인 실행기(`scripts/autopilot/run.ps1`)가 부른 한 회차다. 사람은 지켜보지 않는다. 이 회차에서 **한 단계만** 진행하고 상태를 기록한 뒤 끝낸다.

## 시작

1. `CLAUDE.md`, `AGENTS.md`, `.claude/skills/approval-harness/SKILL.md` 를 읽는다.
2. `_workspace/PROGRESS.md` 를 읽는다. 없으면 `_workspace/*/` 산출물로 현재 위치를 재구성해 만든다.
3. `_workspace/QUESTIONS.md` 에 사람의 답이 달렸는지 본다(`답:` 줄). 답이 있으면 반영한다.

## 진행

- PROGRESS 의 "다음 할 일" 하나를 approval-harness 의 해당 Phase 로 실행한다. 에이전트는 `subagent_type` 커스텀 타입(feature-architect 등)으로 띄우고 `model: "opus"`.
- 한 회차 = 한 Phase(설계 / 백엔드 / 프론트 / 검증+수정 루프 / 기능 마감) 가 기준이다. 검증 실패 수정 루프는 같은 회차 안에서 끝낸다(최대 3회).
- 기능이 검증까지 통과하면 PROGRESS 에서 완료 처리하고 로드맵 다음 slug 로 넘어간다.

## 절대 하지 않는 것

- `forge deploy`·`forge install`·`forge register`·`forge tunnel` 등 모든 `forge` 명령 (app id 미등록, 배포는 사람이 한다)
- `git commit`·`git push`·브랜치 조작 (변경은 작업 트리에 남긴다. `git add` 로 스테이징도 하지 않는다 — 스테이징 영역은 이식 기준선이다)
- 이 리포 밖 파일 수정. `C:\CloudJira\moves-approval`(Confluence 판)·`C:\CloudJira\moves-workforce` 는 **읽기만**. workforce-link 에서 워크포스 쪽 변경이 필요하면 설계서에 적고 QUESTIONS 에 승인 요청만 남긴다.
- 제품 결정을 추측으로 확정하는 것

## 막혔을 때

- 제품 결정이 필요하면 `_workspace/QUESTIONS.md` 에 `## Q<번호> [slug] 질문` + 선택지 + 권장안을 적고, 막히지 않은 다른 일(다음 Phase·다른 slug 의 설계)을 한다. 할 일이 전부 막혔으면 PROGRESS 상태를 `BLOCKED` 로 둔다.
- 실측이 필요한 플랫폼 동작은 구현하고 `미검증` 으로 남긴다(`04_spike_todo.md`). 그것만으로 막힌 것으로 치지 않는다.

## 끝내기 전에 (반드시)

`_workspace/PROGRESS.md` 를 아래 형식으로 갱신한다. 이 파일이 다음 회차(Claude 또는 Codex)의 유일한 인수인계다.

```markdown
# PROGRESS
상태: RUNNING | BLOCKED | DONE
갱신: <YYYY-MM-DD HH:mm> by claude
## 현재
slug: <slug> · Phase: <n 이름> · 진행: <한 줄>
## 다음 할 일
1. <구체적 다음 단계 — 파일·명령 수준>
## 완료된 기능
- <slug> — <완료일> — 03_verify_report 요약
## 최근 회차 기록 (최신 5개만 유지)
- <시각> claude: <한 일> → <결과: 테스트 통과/실패 수>
```

`approval-harness` 스킬의 **로드맵 표 전체**(행 수는 늘어날 수 있다 — 매번 표를 다시 읽는다)가 완료(또는 배포 없이는 더 할 수 없는 상태)일 때만 상태를 `DONE` 으로 둔다. PROGRESS 의 "다음 할 일"보다 로드맵 표가 우선이다.
