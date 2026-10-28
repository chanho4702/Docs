---
name: integration-verify
description: "Moves RMS 통합 검증 스킬. 실제 생산자·소비자의 응답 계약, 내부 서비스·다중 shape 회귀, backend 권한·데이터 범위, 캐시·i18n과 필수 검증을 확인한다. integration-verifier가 QA·정합성 검증에 사용한다."
---

# Integration Verify — 통합 정합성 검증

## 시작 조건

1. 루트 `AGENTS.md`, `CLAUDE.md`, 작업 계약과 파일 소유권을 먼저 읽는다.
2. `_workspace/<feature>/`의 기존 설계·구현 리포트와 변경 diff를 확인한다. 작은 수정에 선행 문서가 없으면 리더가 기록한 요구사항·현재 계약·변경 범위를 기준으로 검증한다.
3. 실제 생산자·소비자 소스를 양쪽 모두 읽는다. 리포트·빌드 통과만으로 정상 판정하지 않는다.
4. 수정은 배정된 소유권 안에서 수행하고 다른 작업자의 변경을 되돌리지 않는다.
5. 설계와 구현이 다르면 요구사항·소스·전체 소비자를 대조해 계약을 조율한다.
   실제 구현 우선으로 문서를 덮거나 검증 기대값을 바꿔 통과시키지 않는다.

## 경계면 교차 비교

| 경계면 | 생산자 | 소비자·확인 사항 |
|--------|--------|----------------|
| 응답 | guardedDefine 내부 handler/Service 반환 + 래퍼 | invoke의 성공·실패 분기와 정확한 중첩·nullable |
| 내부 서비스 | 계약 변경 Service의 실제 반환값 | 다른 Service·큐·트리거의 직접 import와 호출 |
| 다중 shape | 같은 컴포넌트에 넘기는 서로 다른 객체 | 각 shape에 컴포넌트가 참조하는 모든 필드가 존재 |
| 등록 | CONTROLLER_REGISTRARS + guardedDefine + PermissionMap | invoke 함수명 일치, deny-by-default 등록 누락 |
| 데이터 변환 | DB 컬럼 → Query → DTO | camelCase/snake_case, 배열·객체·content 래핑 일치 |
| 캐시 | 조회 팩토리·서버 캐시·mutation 결과 | 동일 키의 shape·범위, 권한 축, 무효화 prefix/exact |
| i18n | kr/en 원본 + merge 생성물 | t()의 실제 참조 키·파라미터 |
| 비동기 | 큐의 즉시 작업 ID와 최종 상태 | 폴링 소비, 실패·완료 처리 시점 |

- `success: false` 분기 후에는 return/throw하여 content에 접근하지 않아야 한다.
- 동작하는 빈 결과와 권한 오류·서버 오류를 같은 빈 배열로 감추지 않는지 확인한다.
- 공용 컴포넌트·Service 변경은 해당 기능 바깥의 호출부도 영향 범위에 포함한다.

## 보존해야 할 회귀 검증

**서비스 내부 소비자:** 계약 변경 함수명으로 `src/` 전체를 `rg` 검색한다.
모든 import·호출 지점의 소비 필드를 실제 반환 코드와 비교한다.
`getProjectStatusListService`를 배열에서 `{ rows }`로 바꿀 때 프론트만 고치고
`PortfolioDashboardService`의 배열 `.map` 소비를 놓쳐 대시보드가 중단된 전례가 있다.

**다중 shape 컴포넌트:** 호출부를 검색해 전달 객체를 모두 수집하고 생산 코드를 읽는다.
`ScopeSplitCell`은 `candidate.project`·`candidate.company`를 받지만 `assignedCount`는
project에만 있어 `scope?.assignedCount ?? 0`이 company를 항상 빈 할당으로 표시한 전례가 있다.
공통 필드 / A 전용 / B 전용 표를 만들고, 옵셔널 체이닝·기본값이 누락을 숨기지 않는지 확인한다.
resolver↔프론트 계약이 각각 맞아도 이 검증은 별도로 필요하다.

## backend 권한 행렬

변경 함수마다 아래 조건의 기대 결과와 실제 근거를 기록한다.
기능에 해당하지 않는 항목은 이유를 적고, 실행하지 못했으면 미검증으로 남긴다.

| 조건 | 확인할 경계 |
|------|-------------|
| 무권한·권한 보유·관리자 | 화면 노출과 별도로 직접 invoke 호출에서 인가 |
| principal 누락 | 서비스에서 fail-close, 배치는 명시적 SYSTEM_PRINCIPAL |
| ALL/MEMBER_ONLY/TEAM_ONLY | 목록 필터, 허용·타 프로젝트, detail/inherited의 projectId 누락 |
| SELF | 위조 payload accountId·타인 row ID·context 누락 모두 차단 |
| 팀장·일반 사용자 | TeamAnalyticsScope의 명부 범위, 팀장 쓰기 대상·허용 필드 |
| 급여·비용 | CostAccess.canReadCost + SalaryVisibility, PROJECT_COST 전용 경로 |
| 권한 세트 배정 | PermissionAssignment 공통 검증, 직접 배정·팀 상속 상한 |

- SELF mutation은 Controller의 신원 덮어쓰기만 보지 않고 Service → SQL까지 추적한다.
  UPDATE/DELETE에서 row ID와 `context.accountId`의 소유자 predicate가 함께 적용돼야 한다.
- 일반 resource DTO에 `salary`가 유출되지 않는지 실제 응답을 확인한다.
- 동일 데이터를 반환하는 형제 resolver를 전부 찾아 같은 범위 검증을 비교한다.
- 읽기가 거부하는 teamKey·projectId를 쓰기가 허용하지 않는지 공용 검증과 호출부를 비교한다.
- 과거 인력 명부는 한 resolver를 막아도 형제 4개로 우회됐고, 급여 정책 기본값만으로는
  비용 권한이 열렸다. UI 숨김·단일 resolver 성공 검증으로 보안 통과를 판정하지 않는다.
- Jira 호출은 asUser 기본과 asApp 플랫폼 예외·product permission 검증을 확인한다.

## 저장·라이선스·UI 검증

- SQL DML은 `rowsAffected` alias로 판정하고 raw mock은 `{ rows: { affectedRows } }`를 재현한다.
  0건과 실제 수정된 행을 구분하며 mock이 SDK 계약 오류를 가리지 않는지 확인한다.
- KVS 새 속성의 manifest schema와 사용 전 배포 순서를 확인하고 선택 빈 문자열 저장을 막는다.
- `findAll()` 100건 초과는 `findAllPaged`로 읽는지, 목록·중복 판정이 같은 상한을 쓰는지 확인한다.
  페이지 경계와 `truncated` 처리도 대조한다.
- 라이선스는 명시적 INACTIVE만 차단하고 UNAVAILABLE은 통과하는지 frontend/backend를 비교한다.
  License API 200에 활성 라이선스 없음은 INACTIVE다. 원문·민감정보 console 노출도 확인한다.
- Custom UI 공용 컴포넌트 재사용, ForgeHistoryRouter·MemoryRouter 폴백과 lazy 탭 Suspense를 확인한다.
- 쿼리키는 팩토리를 사용하고 필터·페이지·권한 전환에 낡은 데이터가 남지 않는지 확인한다.
- mutation의 목록·상세·요약·형제 탭 무효화와 서버 캐시 갱신을 계약과 대조한다.
- i18n은 kr/en 원본에 있고 merge 산출물에 반영됐는지 확인한다. 생성 파일 직접 수정은 금지다.
- 다건 워크로그의 전용 페처·p-limit, Resource/MM의 프로젝트 단위 조회·KVS 캐시를 확인한다.
  공통 페치 경로 변경이 있으면 관련 소비자 회귀 근거를 요구한다.

## 실행과 출력

- 실행 명령·필수 체크·증거 재사용은 [공통 검증 기준](../feature-harness/references/codex-experiences--verification.md)을 따른다.
- 각 resolver와 대응 훅이 완성될 때 계약을 점진적으로 검증하고 마지막에 통합 결과를 기록한다.
- `_workspace/<feature>/03_verify_report.md`에 **통과 / 실패 / 미검증**으로 구분한다.
- 실패는 `파일:라인`, 기대 계약·실제 동작, 영향, 수정 방향을 기록하고 양쪽 담당자에게 전달한다.
- 검증 근거에는 확인한 소스, 명령·종료 코드·결과, 관련 source 상태와 남은 제한을 포함한다.
- 하네스 변경은 구조·참조·행동 검증을 추가하고, AGENTS가 요구하는 앱 검증도 생략하지 않는다.
- 빌드 통과로 런타임·권한 검증을 대신하거나 미검증 항목을 추측으로 통과시키지 않는다.
