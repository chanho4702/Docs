---
name: feature-design
description: "Moves RMS Forge 기능 설계 스킬. 요구사항을 계층별 구조, 권한·데이터 범위, 응답·소비자·캐시 계약 및 구현 작업으로 구체화한다. feature-architect가 기능 설계·아키텍처 작업에 사용한다."
---

# Feature Design — 기능과 경계면 계약 설계

## 시작 조건

1. 루트 `AGENTS.md`, `CLAUDE.md`, 작업 계약과 파일 소유권을 먼저 읽는다.
2. `_workspace/<feature>/`의 기존 설계·리포트와 관련 실제 소스를 확인한다.
3. 설계 수정은 요청 범위 안에서 수행하고 다른 작업자의 변경을 되돌리지 않는다.
4. 문서와 소스가 다르면 차이를 기록하고 요구사항·생산자·소비자를 대조해 계약을 확정한다.
   구현이 이미 존재한다는 이유로 그 shape이나 권한 동작을 자동으로 정답 처리하지 않는다.

## 조사와 재사용

- `rg`로 유사 도메인의 Controller/Service/Repository와 모든 호출부를 찾는다.
- `src/index.js`, `src/permission/PermissionMap.js`, 관련 권한 모듈을 읽는다.
- `static/ui/src/components/`의 공용 레이아웃·테이블·스켈레톤·차트를 먼저 확인한다.
- 페이지·스토어·`static/ui/src/utils/queryKey/`에서 기존 소비와 캐시 구조를 확인한다.
- `src/rdb/query/`, `src/nosql/query/CustomEntityManager.js`, `manifest.yml`을 확인한다.
- 재사용 후보마다 실제 `파일:라인`, export, 입력·반환 shape, 사용처를 기록한다.
  이름만 비슷한 함수를 재사용 대상으로 지정하지 않는다.

## 경계면 계약

resolver마다 아래 항목을 확정한다. 복잡한 shape은 표 아래에 JSON 예시를 둔다.

| 항목 | 명시할 내용 |
|------|-------------|
| 함수와 입력 | resolver 이름, 필수·선택 필드, 타입, 기본값, 페이지·날짜 범위 |
| 성공 | `{ success: true, ...result }` 전체 필드·중첩, 빈 결과, nullable 의미 |
| 실패 | `{ success: false, error: { name, code, message, cause } }`, 발생 조건과 UI 처리 |
| 호출 권한 | `PermissionMap`의 resource/action 또는 PUBLIC/SELF, project 범위 |
| 데이터 범위 | principal 전달, 프로젝트·팀·개인 행 범위, 허용 필드·민감 필드 제거 |
| 소비자 | 프론트 훅·컴포넌트와 직접 호출하는 백엔드 Service·큐·트리거 |
| 캐시 | 쿼리키 팩토리, 응답을 바꾸는 입력·권한 축, 수명과 공유 범위 |
| mutation | 변경 후 invalidate/setQueryData 대상과 prefix/exact 범위, 서버 캐시 갱신 |

- `content`는 실제 계약이 쓰는 경우에 명시한다. 모든 응답에 있다고 가정하지 않는다.
- 비동기 작업은 즉시 반환하는 작업 ID와 폴링 최종 결과 계약을 분리한다.
- 하나의 컴포넌트가 여러 shape을 받으면 공통 필드와 각 shape 전용 필드를 구분한다.
- 계약 변경 시 함수명으로 `src/` 전체를 검색해 내부 서비스 소비자까지 포함한다.

## 권한과 저장 설계

- resolver는 `guardedDefine`, 컨트롤러는 `CONTROLLER_REGISTRARS` 배열에 등록한다.
  `PermissionMap` 누락은 `PERMISSION_UNMAPPED`로 거부되므로 등록 항목을 설계에 포함한다.
- 가드 통과 후에도 서비스가 `principal`로 데이터 범위를 좁히며 누락은 fail-close 한다.
- SELF mutation은 `context.accountId`를 SQL row owner predicate까지 전달한다.
- 급여·원가는 `CostAccess.canReadCost(principal)`와 `SalaryVisibility`를 함께 적용한다.
  일반 resource DTO에서 `salary`를 제외하고 `PROJECT_COST` 전용 경로를 설계한다.
- 인력 범위는 `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)`을 재사용한다.
- 동일 데이터를 반환하는 형제 resolver와 읽기·쓰기 경로에 공통 검증을 적용한다.
- 프로젝트·사용자·워크로그는 기존 MySQL Query 계층, 설정·팀 등은 기존 KVS 엔티티를 따른다.
- SQL DML은 `rowsAffected` alias, raw mock은 `{ rows: { affectedRows } }` 계약이다.
- KVS 속성 추가는 manifest schema 변경·배포 순서를 명시하며 선택 빈 문자열은 생략한다.
- `findAll()`은 100건 상한이다. 전량 조회는 `findAllPaged(indexName, pageLimit, maxItems)`를 쓰고
  목록·중복 판정은 같은 상한 상수와 잘림 처리 정책을 공유한다.
- Jira REST는 `asUser()` 기본이다. `asApp()` 예외는 `CLAUDE.md`와 인가 근거를 확인한다.

## UI와 성능 설계

- React Custom UI와 Atlaskit을 사용하고 실제 의존성은 `static/ui/package.json`에서 확인한다.
- `App.jsx`의 `ForgeHistoryRouter`와 Forge 밖 `MemoryRouter` 폴백을 유지한다.
- i18n은 `locales/kr/<기능>.json`, `locales/en/<기능>.json`과 merge를 전제로 설계한다.
- 다건 워크로그는 기능별 전용 페처와 `p-limit`을 사용한다. 공통 페치 변경은 회귀 범위를 검토한다.
- Resource/MM 분석은 기존 프로젝트 단위 1회 페치와 KVS 캐시 패턴을 따른다.
  새 SQL 적재·캐시 도입은 데이터량, 권한 범위와 기존 소비자 영향을 먼저 확인한다.

## 설계서 출력

`_workspace/<feature>/01_architect_design.md`에 아래 구조를 직접 사용한다.

1. 목적·완료 조건·범위와 미확정 사항
2. 조사 근거와 재사용 대상 (`파일:라인`, export, 재사용 이유)
3. resolver 경계면 계약 표 및 성공·실패 예시
4. 권한 행렬과 프로젝트·팀·SELF·급여 데이터 범위
5. 백엔드 계층, 등록과 DB/schema·배포 의존성
6. 프론트 컴포넌트·라우트·상태·쿼리키와 mutation 무효화 표
7. 한국어·영어 i18n 키/값 목록
8. backend/frontend 작업 목록·파일 소유권·의존성과 검증 시나리오

## 검증과 인계

- 실행 검증은 [공통 검증 기준](../feature-harness/references/codex-experiences--verification.md)을 따른다.
- 완료 기준·권한·실패·빈 결과·캐시 갱신 시나리오가 계약에 연결됐는지 확인한다.
- 설계만 요청된 작업에서는 구현·배포를 수행하지 않고 설계와 남은 의문을 인계한다.
- 계약 drift가 발견되면 관련 구현 전에 조율된 계약과 영향 소비자 목록을 갱신한다.
