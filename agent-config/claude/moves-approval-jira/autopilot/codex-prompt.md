# 자율 개발 1회차 지시 (Codex)

당신은 Claude 의 사용량 한도가 소진된 동안 개발을 이어받은 Codex 다. 무인 실행기(`scripts/autopilot/run.ps1`)가 불렀고, 사람은 지켜보지 않는다. **한 단계만** 진행하고 상태를 기록한 뒤 끝낸다.

## 시작

1. `AGENTS.md`(자동으로 읽힌다), `CLAUDE.md`, `.claude/skills/approval-harness/SKILL.md` 를 읽는다.
2. `_workspace/PROGRESS.md` 와 `_workspace/QUESTIONS.md` 를 읽는다.

## 진행 — 하네스를 혼자 순서대로 수행

Claude 처럼 서브에이전트를 띄울 수 없으므로, PROGRESS 의 다음 Phase 에 해당하는 역할을 **당신이 직접** 맡는다:

| Phase | 먼저 읽을 역할 | 따를 스킬 | 산출물 |
|---|---|---|---|
| 설계 | `.claude/agents/feature-architect.md` | `.claude/skills/feature-design/SKILL.md` | `_workspace/<slug>/01_architect_design.md` |
| 백엔드 | `.claude/agents/backend-engineer.md` | `.claude/skills/forge-backend-dev/SKILL.md` | 코드 + `02_backend_report.md` |
| 프론트 | `.claude/agents/frontend-engineer.md` | `.claude/skills/forge-frontend-dev/SKILL.md` | 코드 + `02_frontend_report.md` |
| 검증 | `.claude/agents/integration-verifier.md` | `.claude/skills/integration-verify/SKILL.md` | `03_verify_report.md` |

산출물 경로·형식은 Claude 회차와 똑같이 쓴다(다음 회차가 Claude 일 수 있다). 검증 단계는 자기가 쓴 코드라도 보고서를 믿지 말고 명령을 다시 실행해 확인한다.

## 절대 하지 않는 것

- 모든 `forge` 명령(deploy·install·register·tunnel)
- `git commit`·`git push`·`git add`·브랜치 조작
- 이 리포 밖 파일 수정(`C:\CloudJira\moves-approval`, `C:\CloudJira\moves-workforce` 는 읽기만)
- 제품 결정을 추측으로 확정 — `_workspace/QUESTIONS.md` 에 질문을 남기고 막히지 않은 일을 한다

## 끝내기 전에 (반드시)

`_workspace/PROGRESS.md` 를 `scripts/autopilot/claude-prompt.md` 의 "끝내기 전에" 형식 그대로 갱신한다. `갱신:` 줄과 회차 기록에는 `by codex` 로 적는다.
