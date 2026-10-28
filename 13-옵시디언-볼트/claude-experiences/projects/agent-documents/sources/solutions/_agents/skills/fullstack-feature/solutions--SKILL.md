---
name: fullstack-feature
description: moveseye 모노레포(moveseye-be-spring + moveseyee_fe)에서 풀스택 기능을 BE→계약→FE→QA로 한 번에 처리하는 오케스트레이터. be-engineer·fe-engineer·integration-qa·functional-qa 팀을 구성해 조율한다. "풀스택으로", "엔드포인트 추가하고 화면까지", "BE랑 FE 같이", "기능 추가해줘"(양쪽 걸침), "API 만들고 연동", "이 기능 백+프론트"는 물론, "다시 실행/재실행/이어서/수정/보완/이전 결과 기반"의 후속 요청에도 사용. 한쪽만 명확히 끝나는 단순 작업이면 해당 에이전트만 직접 써도 된다.
---

# fullstack-feature — 풀스택 기능 오케스트레이터

`C:\solutions` 모노레포에서 BE(`moveseye-be-spring`, Spring Boot — 2026-06-22 단일 채택)와 FE(`moveseyee_fe`)에 걸친 기능을 하나의 팀으로 완성한다.
구 NestJS(`moveseye-be`)는 참조용 읽기 전용 — 새 BE 코드를 절대 거기에 쓰지 않는다.
**실행 모드: 에이전트 팀** (be-engineer ↔ fe-engineer ↔ integration-qa ↔ functional-qa가 SendMessage로 자체 조율).

데이터 흐름: **BE 구현+계약 산출 → api-contract-sync → FE 연동 → integration-qa 경계면(정적) 검증 → functional-qa 행위(런타임) 검증**.
계약(`_workspace/contract_{feature}.md`)이 팀의 단일 진실원천이다.

## Phase 0: 컨텍스트 확인 (항상 먼저)
`C:\solutions\_workspace/`에서 대상 기능의 기존 산출물(`contract_{feature}.md` 등)을 확인해 실행 모드를 결정한다:
- 해당 기능 산출물 없음 → **초기 실행**.
- 있음 + 사용자가 부분 수정/보완 요청 → **부분 재실행** (해당 에이전트만 재호출, 기존 계약 재사용).
- 있음 + 같은 이름의 새 기능/전면 재작업 → **새 실행** (기존 파일은 지우지 말고 `{name}_prev.md`로 rename 후 시작).

`_workspace/`는 기능별 파일명(`{kind}_{feature}.*`)으로 **누적 보존**한다 — 과거 계약서·QA 문서가 다음 작업의 기준선이자 감사 추적이다. 폴더 전체를 이동/삭제하지 않는다.

## Phase 1: 기능 분해
1. 요청을 기능 단위로 쪼개고, 각 기능의 **엔드포인트 후보**(경로/메서드/요청/응답/권한)와 **FE 화면 연결점**을 초안한다.
2. 영향 도메인을 매핑한다(BE 모듈 ↔ FE services/types/hooks). 1:1 대응표는 `api-contract-sync` 스킬 참조.
3. 모호하면 사용자에게 확인. 명확하면 진행.

## Phase 2: 팀 구성
`TeamCreate`로 팀을 만든다. 권장 구성(소~중규모):
- **be-engineer** — BE 구현 + 계약 산출
- **fe-engineer** — FE 연동
- **integration-qa** — 경계면 정합성(정적 shape) 검증
- **functional-qa** — 행위/E2E(런타임 동작) 검증

`TaskCreate`로 의존성 있는 작업을 등록한다(BE 작업 → FE 작업은 계약 산출에 의존 → QA는 각 모듈 완성에 의존, functional-qa는 FE 연동 완료 + integration-qa의 shape 통과에 의존). 모든 Agent 호출은 `model: "opus"`.

**스폰 타입 주의:** `integration-qa`와 `functional-qa`는 둘 다 빌트인 `general-purpose` 타입으로 스폰한다 — 검증 스크립트·서버 기동·명령 실행이 필요하므로 읽기 전용 타입(`Explore`)을 쓰면 안 된다. be-engineer·fe-engineer는 각자 에이전트 정의를 사용한다.
**두 QA의 분업:** integration-qa는 *정적*(타입·필드명·옵셔널·래퍼 깊이 대조)만, functional-qa는 *런타임*(앱 기동 후 실제 호출·화면 동작)만 본다. shape이 틀리면 integration-qa, 값/동작이 틀리면 functional-qa로 라우팅해 중복 조사를 막는다.
**팀 도구 폴백:** `TeamCreate`가 가용하지 않은 환경이면 팀 대신 `Agent` 도구로 직접 스폰하고(파이프라인 의존성은 순차 호출, 독립 작업만 `run_in_background`), 데이터 전달은 파일 기반(`_workspace/`)으로 대체한다.

## Phase 3: 실행 (파이프라인 + 증분 QA)
1. **be-engineer**가 엔드포인트 구현 → `_workspace/contract_{feature}.md` 산출 → 빌드/테스트 검증 → 계약 경로를 팀에 브로드캐스트.
2. **api-contract-sync** 스킬로 계약을 FE 관점에서 정리/대조한다(fe-engineer가 이 스킬을 사용).
3. **fe-engineer**가 계약대로 types→api→hook→화면 연결.
4. **integration-qa**가 해당 기능 완성 직후 경계면을 *정적* 교차 검증(`_workspace/qa_{feature}.md`). 불일치는 책임 주체에 SendMessage → 수정 → 재검증(클로즈드 루프).
5. **functional-qa**가 shape 통과 후 앱을 실제 기동해 *행위*를 검증(`_workspace/e2e_{feature}.md`) — 인증 흐름·해피패스·에러경로·화면 동작을 실호출/DOM 어서션으로 확인(스크린샷은 시각 판정이 불가피한 항목에만 최소 — 에이전트 정의의 스크린샷 최소화 원칙 준수). 동작 버그는 책임 주체에 SendMessage → 수정 → 같은 흐름 재실행.
6. 기능이 여러 개면 기능 단위로 1~5를 반복(빅뱅 금지).

## Phase 4: 종합
- 각 기능의 계약/QA 결과를 모아 최종 요약을 사용자에게 보고: 추가/변경된 BE 엔드포인트, FE 파일, 잔여 이슈.
- 팀 정리.

## 데이터 전달 프로토콜
- **태스크 기반**(TaskCreate/Update): 진행상황·의존성.
- **파일 기반**(`C:\solutions\_workspace/`): `contract_{feature}.md`, `qa_{feature}.md` 등 산출물. 파일명 컨벤션 `{phase|kind}_{feature}.md`.
- **메시지 기반**(SendMessage): 계약 변경 협의, 불일치 통보 등 실시간 조율.
- 중간 산출물(`_workspace/`)은 보존, 최종 코드는 각 레포에 직접 반영.

## 에러 핸들링
- 에이전트 작업 실패 시 1회 재시도, 재실패하면 해당 부분 없이 진행하되 최종 보고에 누락을 명시.
- 계약 충돌(BE/FE 기대 불일치)은 삭제하지 말고 양측 출처를 병기, be-engineer 결정으로 수렴.
- BE 빌드/테스트 깨짐은 FE 작업 시작 전 차단 사유 — 먼저 해결.

## 테스트 시나리오
- **정상 흐름**: "호스트 태그 필터 엔드포인트 추가하고 목록 화면에 연동해줘" → be-engineer가 `GET /hosts?tag=` + 응답 DTO 구현·계약 산출 → fe-engineer가 host-monitoring api/type/hook/화면 연결 → integration-qa가 tag 필드 shape 대조 → 요약 보고.
- **에러 흐름**: FE에 `asset.api.ts`는 있으나 BE에 asset 도메인 없음 → contract-sync가 "BE 미구현" 탐지 → be-engineer가 Spring에 도메인 패키지 신규 생성(기존 도메인 패턴) → 이후 FE 연동 → QA.
