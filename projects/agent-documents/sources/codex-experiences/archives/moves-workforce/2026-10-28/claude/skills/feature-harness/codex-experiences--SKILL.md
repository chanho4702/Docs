---
name: feature-harness
description: "Moves RMS Forge 앱의 신규 기능 설계·개발·검증을 전문 에이전트로 조율하는 오케스트레이터. 새 기능 개발/설계, RFC 기능 구현, 풀스택 기능 추가, 페이지/리포트/화면 신규 개발 시 사용. 후속 작업: 기능 수정·보완·재실행·업데이트, '백엔드만 다시', '프론트만 수정', '검증 다시', 이전 결과 기반 개선 요청 시에도 반드시 이 스킬을 사용."
---

# Feature Harness — 기능 설계·개발·검증 오케스트레이터

Moves RMS Forge 앱의 신규 기능을 **설계 → 백엔드 구현 → 프론트 구현 → 검증** 흐름으로 전문 에이전트를 조율하여 구현하는 통합 스킬.

## 실행 모드: 서브에이전트 순차 파이프라인 (기본)

> **런타임 현황(2026-06-11 재확인).** 이 환경의 Agent 도구는 커스텀 `subagent_type`(`feature-architect`/`backend-engineer`/`frontend-engineer`/`integration-verifier`)을 **직접 지원**하고, `SendMessage`로 기존 에이전트를 컨텍스트 유지한 채 재호출할 수 있다. 단 `TeamCreate`(팀원 간 직접 통신)는 여전히 없으므로 **서브에이전트 순차 파이프라인이 주 경로**다. 아래 워크플로우는 이 모드를 기준으로 기술한다.

**순차 파이프라인이 오히려 경계면 불일치를 줄인다.** 핵심은 경계면 계약(응답 shape)이다. 순차 모드에서는 backend가 **실제** 응답 shape을 `02_backend_report.md`에 확정한 뒤 frontend가 그걸 읽어 소비 경로를 맞춘다 — 프론트가 shape을 추측할 필요가 없다. 병렬(backend ∥ frontend)이었다면 양쪽이 architect의 계약만 보고 독립 작업하다 실제 구현이 계약에서 미세하게 벗어나는 순간 경계면 버그가 난다. **그래서 이 하네스는 backend → frontend 순서를 의도적으로 강제한다.**

각 에이전트는 **자신의 커스텀 타입으로 직접 생성**한다(`subagent_type: "backend-engineer"` 등 — 에이전트 정의 frontmatter의 `model: opus`가 자동 적용되므로 역할 채택용 Read 우회가 필요 없다). 프롬프트에는 **해당 스킬 SKILL.md Read 지시 + 작업 디렉토리**만 주입한다. 리더(이 스킬)가 파일 기반으로 에이전트 간 데이터를 중계하며, **수정 루프에서는 새 에이전트를 띄우지 말고 `SendMessage`로 기존 에이전트를 재호출**한다(컨텍스트 유지로 수정이 빠르고 정확하다).

### (옵션) 에이전트 팀 모드
런타임이 `TeamCreate`(팀원 간 직접 통신)를 **지원하게 되면**, backend ∥ frontend 병렬 + 실시간 shape 동기화로 전환할 수 있다. 그 경우 §"팀 모드 전환" 참조. 미지원이 기본이므로 평소엔 순차로 진행한다.

## 작업 디렉토리: 기능별 서브디렉토리

여러 기능을 독립적으로 작업·보존하기 위해 산출물을 **기능별 서브디렉토리**에 둔다. 평면 `_workspace/01_...`를 쓰지 않는다(기능이 둘 이상이면 충돌).

```
_workspace/
  <feature-slug>/              ← 리더가 기능명에서 슬러그 결정 (예: progress-page)
    00_input/requirement.md
    01_architect_design.md
    02_backend_report.md
    02_frontend_report.md
    03_verify_report.md
```

- **슬러그 규칙:** 기능명을 영문 kebab-case로(예: "프로젝트 진척도 페이지" → `progress-page`). 리더가 Phase 0에서 결정한다.
- **모든 에이전트 호출 시 리더가 작업 디렉토리(`_workspace/<feature-slug>/`)를 프롬프트로 주입한다.** 에이전트 정의/스킬은 경로를 `_workspace/<feature>/NN_...` 플레이스홀더로 기술하므로, 리더가 실제 슬러그로 치환해 전달해야 한다.

## 에이전트 구성

| 팀원 | subagent_type | 역할 | 스킬 | 출력 |
|------|------|------|------|------|
| architect | `feature-architect` | 신규 기능 설계 + 경계면 계약 | feature-design | `01_architect_design.md` |
| backend | `backend-engineer` | resolver/Service/Repository 구현 | forge-backend-dev | `src/` + `02_backend_report.md` |
| frontend | `frontend-engineer` | React/스토어/쿼리키/i18n 구현 | forge-frontend-dev | `static/ui/` + `02_frontend_report.md` |
| verifier | `integration-verifier` | 경계면 교차 검증 + 테스트 | integration-verify | `03_verify_report.md` |

> 각 에이전트는 표의 커스텀 `subagent_type`으로 직접 생성한다. 에이전트 정의(`.claude/agents/{name}.md`) frontmatter의 `model: opus`가 적용된다.

## 워크플로우

### Phase 0: 컨텍스트 확인 + 슬러그 결정 (후속 작업 지원)

작업 시작 전 실행 모드를 결정한다:

1. 요구사항에서 기능을 식별하고 **슬러그를 결정**한다(예: `progress-page`). 작업 디렉토리는 `_workspace/<slug>/`.
2. `_workspace/<slug>/` 존재 여부로 분기:
   - **미존재** → 초기 실행. Phase 1로
   - **존재 + 부분 수정 요청**("백엔드만 다시", "프론트 수정", "검증 다시") → 부분 재실행. 해당 에이전트만 재호출, 이전 산출물 경로를 프롬프트에 포함하여 피드백 반영. 나머지 산출물은 그대로 둔다
   - **존재 + 같은 기능 새 입력** → 기존 `_workspace/<slug>/`를 `_workspace/<slug>_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1
3. 다른 기능은 다른 슬러그 디렉토리를 쓰므로 서로 간섭하지 않는다.

### Phase 1: 준비
1. 요구사항 분석 — 기능 목적, 영향 범위(백엔드/프론트/DB/i18n)
2. `_workspace/<slug>/00_input/` 생성
3. 요구사항을 `_workspace/<slug>/00_input/requirement.md`에 저장

### Phase 2: 설계 (architect 단독)
**실행:** architect 서브에이전트 1명.
- `subagent_type: "feature-architect"`로 생성, 프롬프트에 `.claude/skills/feature-design/SKILL.md` Read 지시
- 작업 디렉토리 `_workspace/<slug>/` 주입
- 산출물: `01_architect_design.md` — **경계면 계약(응답 shape) 표가 핵심.** 이 계약이 이후 단계의 단일 진실 원천이다.
- 완료 후 리더가 설계서를 읽고 계약 표가 명확한지(함수명·입력·응답 shape·대응 훅) 확인. 모호하면 architect를 1회 재호출해 구체화.

### Phase 3: 백엔드 구현 (frontend보다 먼저)
**실행:** backend 서브에이전트 1명.
- 입력: `01_architect_design.md`(경계면 계약 + 백엔드 설계)
- `subagent_type: "backend-engineer"`로 생성, 프롬프트에 `forge-backend-dev/SKILL.md` Read 지시 + 작업 디렉토리 주입
- 산출물: `src/` 코드 + `02_backend_report.md` — **구현한 resolver 함수명 + 실제 응답 shape을 글자 그대로 기록**(다음 단계 frontend가 이걸 읽음)
- `npm test`(루트) 결과를 리포트에 기록
- 완료 후 리더가 `02_backend_report.md`의 실제 shape이 계약과 일치하는지 확인. 벗어났으면 리포트에 명시된 실제 shape을 **다음 frontend 프롬프트에 그대로 전달**(계약보다 실제 구현이 우선).

### Phase 4: 프론트 구현 (백엔드 실제 shape 소비)
**실행:** frontend 서브에이전트 1명.
- 입력: `01_architect_design.md`(프론트 설계) + **`02_backend_report.md`(backend가 확정한 실제 응답 shape)**
- `subagent_type: "frontend-engineer"`로 생성, 프롬프트에 `forge-frontend-dev/SKILL.md` Read 지시 + 작업 디렉토리 주입 + **백엔드 실제 shape을 명시적으로 전달**("invoke result.content 접근을 이 shape에 맞춰라")
- 산출물: `static/ui/` 코드 + `02_frontend_report.md` — 소비하는 응답 shape + i18n merge 실행 여부 기록
- i18n 키 추가 후 `npm run merge` 실행, `cd static/ui && npm test`/`npm run build` 결과 기록

### Phase 5: 통합 검증
**실행:** verifier 서브에이전트 1명.
- 입력: `01_architect_design.md`(계약=검증 기준), `02_backend_report.md`, `02_frontend_report.md`, 실제 소스
- `subagent_type: "integration-verifier"`로 생성, 프롬프트에 `integration-verify/SKILL.md` Read 지시 + 작업 디렉토리 주입
- 핵심: **양쪽 동시 읽기** — backend resolver 응답 shape ↔ frontend `invoke().content` 접근 경로를 교차 비교. "존재 확인"이 아니라 "경계면 일치 확인".
- 실행: `npm test`(루트) + `cd static/ui && npm test`/`npm run build`
- 산출물: `03_verify_report.md` — **통과 / 실패 / 미검증** 3분류. 실패는 `파일:라인` + 불일치 + 수정 방법.
- 실패 항목이 있으면 리더가 해당 에이전트(backend/frontend)를 재호출해 수정 → verifier 재검증. 최대 3회 루프. 잔존 실패는 보고서에 명시(숨기지 않음). **재호출은 가능하면 `SendMessage`로 기존 에이전트에** — 컨텍스트가 유지돼 수정이 빠르다.

> **incremental QA (선택):** 기능이 여러 모듈(resolver+훅 쌍)로 크면, Phase 3~4를 모듈 단위로 쪼개 각 모듈 직후 verifier를 부른다. 단순 기능은 Phase 5 최종 검증 1회로 충분.

### Phase 6: 정리 및 진화
1. 결과를 사용자에게 요약 보고(통과/실패/미검증 + 산출물 경로)
2. `_workspace/<slug>/` 보존(감사 추적용)
3. **사용자에게 피드백 요청**: "결과나 워크플로우에서 개선할 점이 있나요?" — 있으면 하네스 진화(harness 스킬)로 연결

## 데이터 흐름 (순차 파이프라인)

```
[리더] 슬러그 결정 → _workspace/<slug>/ 준비
  │
  ↓ 커스텀 subagent_type 생성 + 스킬 Read 지시 + 작업 디렉토리 전달
architect ──→ 01_architect_design.md (경계면 계약)
  │ 리더가 계약 검증
  ↓
backend ───→ src/ + 02_backend_report.md (실제 응답 shape 확정)
  │ 리더가 실제 shape 추출
  ↓ 실제 shape을 프롬프트로 전달
frontend ──→ static/ui/ + 02_frontend_report.md (실제 shape 소비)
  │
  ↓
verifier ──→ 03_verify_report.md (양쪽 교차 비교 + 테스트)
  │ 실패 시 backend/frontend 재호출 (최대 3회)
  ↓
[리더: 통합 + 사용자 보고]
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 에이전트 실패/중지 | 리더가 1회 재호출, 재실패 시 누락 명시하고 다음 단계 진행 |
| 백엔드 실제 shape이 계약과 다름 | 리더가 `02_backend_report.md`의 실제 shape을 frontend 프롬프트에 전달(실제 구현 우선). 차이가 설계 의도를 깨면 architect 재호출로 계약 갱신 |
| 경계면 불일치 (verifier 지적) | 리더가 해당 에이전트 재호출 → 재검증. 최대 3회 |
| 테스트/빌드 실패 | 담당 에이전트가 수정, 최대 3회. 잔존 실패는 보고서에 명시(숨기지 않음) |
| 설계 모호 | architect가 리더에 질문, 무응답 시 보수적 해석 + 가정 명시 |
| 데이터 충돌 | 출처 병기, 삭제하지 않음 |

## 팀 모드 전환 (런타임이 지원할 때만)

커스텀 `subagent_type`과 `SendMessage`(리더↔에이전트)는 이미 지원된다. `TeamCreate`(팀원 간 직접 통신)까지 가능해지면 병렬화할 수 있다:
- `TeamCreate`로 architect/backend/frontend/verifier 팀 구성, `TaskCreate`로 의존성(`백엔드·프론트는 설계에 depends_on`) 부여
- backend ∥ frontend 병렬 실행, 두 엔지니어가 `SendMessage`로 실제 shape 실시간 동기화
- verifier가 모듈 완성 직후 incremental 교차 검증, 발견 즉시 양쪽에 통지
- 단, 병렬화는 backend/frontend가 실제 shape을 실시간 교환할 수 있을 때만 이득이다. 교환 채널이 불안정하면 순차가 더 안전하다.

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "프로젝트별 워크로그 집계 리포트 추가" 요청
2. Phase 0: 슬러그 `worklog-summary` 결정, `_workspace/worklog-summary/` 미존재 → 초기 실행
3. Phase 1: 영향 범위 분석(백엔드 resolver + 프론트 페이지 + i18n), requirement.md 저장
4. Phase 2: architect가 `getWorklogSummary` 함수 + `{ content:{ rows, total } }` 계약 확정 → `01_architect_design.md`
5. Phase 3: backend가 Service+Repository 구현, 실제 shape `{ content:{ rows:[{userId, totalSec}], total } }`을 `02_backend_report.md`에 기록
6. Phase 4: 리더가 그 실제 shape을 frontend 프롬프트에 전달 → frontend가 `result.content.rows`로 소비, `worklogKeys` 추가, i18n merge
7. Phase 5: verifier가 `result.content.rows` ↔ 백엔드 `{content:{rows}}` 일치 확인 + 테스트 통과 → 보고
8. 결과: `src/`·`static/ui/`에 코드, `_workspace/worklog-summary/`에 산출물

### 에러 흐름
1. Phase 5에서 verifier가 "프론트 `result.rows` 접근 vs 백엔드 `result.content.rows`" 불일치 발견(`파일:라인` 명시)
2. 리더가 frontend 재호출 → `result.content.rows`로 수정
3. verifier 재검증 통과
4. backend 재호출이 다시 실패하면 리더가 보고서에 "백엔드 일부 미완성" 명시 후 진행
