---
name: approval-harness
description: "moves-approval-jira(Jira 승인 앱) 기능 개발 오케스트레이터 — 설계(feature-architect) → 백엔드(backend-engineer) → 프론트(frontend-engineer) → 경계면 검증(integration-verifier) 순차 파이프라인. 코어 이식, 타임시트 승인, 기간 잠금(시간 추적 제공자), 워크포스 연동, 이슈 상태 변경 승인 등 이 리포의 기능 구현 요청 시 반드시 사용. 후속: '다시 실행', '백엔드만 다시', '프론트 수정', '검증 다시', 이전 결과 기반 보완·업데이트 요청에도 사용."
---

# Approval Harness — 기능 개발 오케스트레이터

## 실행 모드: 서브에이전트 순차 파이프라인

backend 가 **실제** 응답 shape 을 확정한 뒤 frontend 가 그것을 소비한다. 병렬로 두면 양쪽이 설계서만 보고 만들다 실제 구현이 미세하게 어긋나 경계면 버그가 난다(워크포스 하네스에서 확립한 순서).

**에이전트 호출 방식**
- 이 리포에서 시작한 세션: `subagent_type` 에 커스텀 타입(`feature-architect` 등)을 직접 쓴다. frontmatter 의 `model: opus` 가 적용된다.
- 다른 리포에서 시작한 세션(커스텀 타입이 목록에 없을 때): `subagent_type: "general-purpose"`, `model: "opus"` 로 띄우고 프롬프트 첫 줄에 "`C:\CloudJira\moves-approval-jira\.claude\agents\<name>.md` 를 읽고 그 역할로 동작하라"를 넣는다.
- 모든 프롬프트에 포함: 리포 절대경로, 작업 디렉토리 `_workspace/<slug>/`, 읽을 스킬 경로, 직전 단계 산출물 경로.
- 수정 루프는 새 에이전트를 띄우지 말고 `SendMessage` 로 기존 에이전트를 재호출한다(컨텍스트 유지).

| 단계 | 에이전트 | 스킬 | 산출물 |
|---|---|---|---|
| 설계 | feature-architect | feature-design | `01_architect_design.md` |
| 백엔드 | backend-engineer | forge-backend-dev | `src/` + `02_backend_report.md` |
| 프론트 | frontend-engineer | forge-frontend-dev | `static/ui/`·`locales/` + `02_frontend_report.md` |
| 검증 | integration-verifier | integration-verify | `03_verify_report.md` |

## 기능 로드맵 (slug)

| 순서 | slug | 내용 | 근거 |
|---|---|---|---|
| 1 | `core-port` | Confluence 전용 제거(byline·매크로·결재란·영역·페이지 트리거·스페이스), `RequestJira`, 권한 축 issue/project, manifest Jira 골격, 업무함·설정 엔트리 Jira 모듈로 이전. **기능 추가 없음** — 테스트 녹색 유지가 완료 기준 | DESIGN §6 |
| 2 | `timesheet-approval` | 사용자×월 제출·스냅샷 지문·팀장 매트릭스·일괄 승인·반려·승인 후 변경 감지·자체 제한선 | DESIGN §2.2, §5 |
| 3 | `period-lock` | `jira:timeTrackingProvider` + 대체 Log work 화면 + 기간 마감 | DESIGN §2.0 |
| 4 | `workforce-link` | 서명 계약·사용자×기간 프로퍼티 게시·검증(워크포스 리포 작업은 별도 승인 후) | DESIGN §4 |
| 5 | `transition-approval` | 함수형 workflowValidator + 이슈 패널 | DESIGN §2.1 |
| 6 | `worklog-history` | 워크로그 생성·수정·삭제 이력(이전→이후 값·행위자·횟수), 미러, 보관 12개월, 감사 화면 | 고객 미팅 5장, `_workspace/worklog-history/00_input/requirement.md` |
| 7 | `issue-approval` | 이슈 일반 승인(검토·결재) 화면 공개 — 요청자 결재선, 요청 이후 수정 안내·재상신 | Q1 답, `_workspace/issue-approval/00_input/requirement.md` |
| 8 | `field-change-approval` | 필드 변경 요청형 승인 — 규칙(프로젝트×유형×필드), 최종 결재자 asUser 적용 우선, 스냅샷 충돌 시 미적용, 우회 감지 | DESIGN §2 ③, `_workspace/field-change-approval/00_input/requirement.md` |

사용자가 slug 를 지정하지 않고 "다음 거 진행"이라 하면 `_workspace/` 에 완료 리포트가 없는 가장 앞 순서를 고른다.

## 워크플로우

### Phase 0: 컨텍스트 확인
1. slug 결정(로드맵 또는 요청에서 kebab-case).
2. `_workspace/<slug>/` 분기:
   - 없음 → 초기 실행
   - 있음 + 부분 수정 요청 → 해당 에이전트만 재호출(이전 산출물 경로 포함)
   - 있음 + 새 요구 → `_workspace/<slug>_<YYYYMMDD_HHMMSS>/` 로 옮기고 초기 실행
3. `git status` 로 작업 트리를 확인한다. 다른 사람의 미완성 변경이 있으면 사용자에게 알린다.

### Phase 1: 준비
`_workspace/<slug>/00_input/requirement.md` 에 요구·완료 기준·범위 밖을 적는다. 로드맵 항목이면 DESIGN 해당 절을 인용한다.

### Phase 2: 설계
architect 실행 → 리더가 계약 표의 빈칸·`## 열린 질문` 을 확인. 열린 질문이 제품 결정이면 **사용자에게 묻고** 답을 requirement.md 에 추가한 뒤 architect 재호출. 기술적 모호함이면 1회 재호출로 구체화.

### Phase 3: 백엔드
backend 실행 → `02_backend_report.md` 의 실제 shape 이 계약과 다른지 확인. 다르면 그 shape 을 frontend 프롬프트에 그대로 넘긴다(실제 구현 우선). 설계 의도를 깨는 차이면 architect 재호출.

### Phase 4: 프론트
frontend 실행. 프롬프트에 백엔드 실제 shape 을 붙인다. 백엔드 없는 단계(core-port 의 UI 정리 등)도 같은 순서로 돈다.

### Phase 5: 검증
verifier 실행 → 실패가 있으면 담당 에이전트를 `SendMessage` 로 재호출 → 재검증. 최대 3회. 남은 실패는 숨기지 않고 보고.

### Phase 6: 스파이크·정리
1. 각 보고서의 `미검증` 과 `04_spike_todo.md` 를 모아 사용자에게 보여 준다. 배포는 **모든 에이전트 완료 후** 리더가, 그리고 manifest app id 가 등록된 뒤에만 한다.
2. 커밋은 사용자가 요청할 때만. 경로를 지정해 스테이징하고 `Co-Authored-By` 를 넣지 않는다(`AGENTS.md`).
3. 사용자에게 요약 보고(통과/실패/미검증 + 산출물 경로) 후 피드백을 묻는다. 피드백은 harness 스킬로 하네스에 반영하고 `CLAUDE.md` 하네스 변경 이력에 기록.

## 데이터 흐름

```
리더 → 00_input/requirement.md
  → architect → 01_architect_design.md (계약)
  → backend   → src/ + 02_backend_report.md (실제 shape)
  → frontend  → static/ui/ + 02_frontend_report.md
  → verifier  → 03_verify_report.md ──실패──→ backend/frontend 재호출 (≤3)
  → 리더: 04_spike_todo.md 취합, 사용자 보고
```

## 에러 핸들링

| 상황 | 대응 |
|---|---|
| 에이전트 실패·중단 | 1회 재호출, 재실패 시 누락을 명시하고 다음 단계 |
| 실제 shape ≠ 계약 | 실제를 frontend 에 전달, 의도 위반이면 architect 재호출 |
| 테스트·빌드 실패 | 담당 에이전트 수정 ≤3회, 잔존은 출력과 함께 보고 |
| 제품 결정이 필요한 질문 | 추측하지 말고 사용자에게 묻는다 |
| 불변식 충돌 | 구현 중단, 설계로 되돌린다 |

## 테스트 시나리오

**정상**: "타임시트 승인 시작해" → slug `timesheet-approval`, `_workspace` 없음 → requirement 작성 → architect 가 `submitTimesheet`·`getTeamTimesheetMatrix`·`decideTimesheets` 계약 확정 → backend 구현·jest 통과·실제 shape 보고 → frontend 가 그 shape 으로 매트릭스 화면 → verifier 통과 → 미검증(이벤트 누락률 등) 목록과 함께 보고.

**에러**: verifier 가 "`getTeamTimesheetMatrix` 는 팀 범위를 좁히는데 `exportTeamTimesheets` 는 안 좁힘(형제 resolver)" 지적 → backend 재호출로 공용 범위 함수 적용 → 재검증 통과. 3회 후에도 실패면 보고서에 잔존 실패로 남긴다.
