---
name: integration-verify
description: "Moves RMS 통합 정합성을 검증하는 스킬. 백엔드 resolver 응답 shape ↔ 프론트 invoke 소비 코드를 교차 비교하고, jest/빌드를 실행하며, 성능 패턴 위반과 i18n 누락을 점검한다. integration-verifier 에이전트가 사용. 검증/QA/테스트/정합성 확인 시 사용."
---

# Integration Verify — 통합 정합성 검증

각 컴포넌트가 개별적으로 맞아도 **연결 지점에서 계약이 어긋나는** 경계면 버그가 런타임 에러의 주원인이다. 이 스킬의 핵심은 "존재 확인"이 아니라 **"경계면 교차 비교"** 다.

## 검증 원칙: 양쪽 동시 읽기

한쪽만 보면 경계면 버그를 못 잡는다. 생산자와 소비자를 **같이** 열고 비교한다.

| 경계면 | 생산자 (왼쪽) | 소비자 (오른쪽) | 점검 |
|--------|-------------|---------------|------|
| 응답 shape | resolver의 responseWrapper 반환 객체 | `invoke()` 결과 `result.content.xxx` 접근 | 필드명·중첩 구조 일치 |
| **서비스 내부 소비자** | Service 함수 반환 shape 변경 | **그 함수를 import 하는 다른 백엔드 Service** | 함수명 전역 grep → 모든 내부 호출 지점의 소비 코드 일치 |
| **다중 shape 재사용 컴포넌트** | 같은 컴포넌트에 전달되는 **서로 다른 객체 2종 이상** | 그 컴포넌트가 읽는 필드 전체 | 각 shape에 **모든 참조 필드가 실재하는가** (한쪽에만 있는 필드 = 조용한 오표기) |
| **동일 데이터 다중 경로** | 게이팅을 넣은 resolver | **같은 데이터를 내주는 형제 resolver 전부** | 모든 경로에 같은 판정이 걸렸는가 (한 곳만 막으면 우회된다) |
| **읽기↔쓰기 검증 대칭** | 읽기 resolver의 스코프/자격 검증 | **같은 대상을 바꾸는 쓰기 resolver** | 읽기가 거부하는 입력을 쓰기도 거부하는가 |
| 함수 매핑 | `src/index.js` 등록 + `registerXxxController` | 프론트 `invoke('fnName')` | fnName 일치, 등록 누락 없음 |
| 래핑 | 백엔드가 `{ content:{ items:[] } }`로 감쌈 | 프론트가 `.content.items` unwrap | 래핑 단계 일치 |
| 쿼리키 | — | `queryKey/` 팩토리 사용 여부 | 인라인 배열 아님 |
| i18n | `locales/kr/*`·`locales/en/*` 키 + merge 실행 | UI `t('key')` | 키 존재 (`locales/script/*.json`은 빈 스텁 — 거기 있으면 미반영) |
| 권한 | 백오피스 resolver 권한 가정 | `canRead/canWrite(pageId)` | 일치 |

> ⚠️ **서비스 응답 계약 변경 시 필수 절차** (2026-07-13 회귀 교훈): resolver↔프론트 경계만 보면 안 된다.
> Service 함수는 다른 도메인 Service 가 직접 import 해 재사용하는 경우가 있다 — 예: `getProjectStatusListService`
> 계약을 `{rows:[...]}` 로 바꿨을 때 프론트 소비처 3곳은 고쳤지만 `PortfolioDashboardService` 의 내부 호출(배열로
> `.map`)을 놓쳐 통합 대시보드 전체가 "데이터를 불러오지 못했습니다"로 다운됐다.
> **계약이 바뀐 함수는 함수명으로 `src/` 전역 grep 하여 리졸버 등록부 외의 모든 import/호출 지점을 교차 비교하라.**

> ⚠️ **한 컴포넌트가 여러 shape을 받을 때** (2026-07-22 회귀 교훈): resolver↔프론트 축만 보면 못 잡는 부류가 있다.
> **양쪽 다 계약을 지켰는데도** 버그가 난다 — 작업 배정 화면의 `ScopeSplitCell` 은 `candidate.project` 와
> `candidate.company` 두 객체에 재사용되는데, `assignedCount` 는 `project` 에만 있고 `company` 에는 없다.
> 컴포넌트가 `scope?.assignedCount ?? 0` 으로 읽어 전사 스코프가 **항상 "할당 작업 없음"** 으로 표기됐다
> (과부하 인원을 여유롭다고 오판시키는, 그 화면이 막으려던 실패 모드 그 자체).
> **점검법:** 같은 컴포넌트에 2종 이상의 객체를 넘기는 지점을 찾고(호출부 grep), 컴포넌트가 참조하는 **모든 필드**를
> 각 shape의 실제 생산 코드와 대조하라. 옵셔널 체이닝·`?? 0` 은 이 결함을 **에러 없이 삼켜** 잘못된 값으로 렌더한다.
> 공통 필드 / A 전용 / B 전용을 표로 분리해 리포트에 남길 것.

> ⚠️ **권한은 "문 하나"가 아니다** (2026-08-10 감사 교훈): 게이팅을 넣었다고 끝이 아니다. 세 부류를 놓쳤다.
> 1. **형제 resolver 우회** — 인력 명부를 `getResourceOverview` 한 곳만 좁혔는데, 같은 `buildPeopleContext()` 를 쓰는
>    `getResourceProfile`·`getProjectSkillMatch`·`getResourceLoadSummary`·`getResourceAllocationGraph` 넷이 **모두
>    같은 명부를 그대로 내줬다.** 화면은 막혔지만 `invoke` 직접 호출로 전부 뚫렸다.
> 2. **읽기/쓰기 비대칭** — `getTeamMemberCandidates`(읽기)가 `TEAM_NOT_IN_PROJECT_SCOPE` 로 거부하는 teamKey 를
>    `addTeamMembersToProject`(쓰기)가 무검증 통과시켰다. **데이터를 바꾸는 쪽에 검증이 없었다.**
> 3. **조건부 게이팅의 기본값** — 급여 제거 로직이 "정책이 LEVEL_BAND 일 때만" 돌았는데 기본값이 INDIVIDUAL 이라
>    **기존 설치는 전부 열려 있었다.** 게이팅에 조건이 붙어 있으면 그 조건의 **기본값**에서 무엇이 열리는지 확인하라.
>
> **점검법:** 민감 데이터(급여·원가·인력 명부·개인정보)를 내주는 resolver를 **데이터 기준으로 묶어** 목록화하고
> (`PermissionMap` 을 훑지 말고, 그 데이터를 만드는 공용 함수의 호출부를 grep 하라), 목록 전체에 같은 판정이
> 걸렸는지 표로 대조하라. 검증이 복제돼 있으면 공용 함수로 뽑혔는지도 함께 본다.

## 강한 체크리스트 (존재 확인 < 교차 비교)

| 약함 | 강함 |
|------|------|
| resolver가 존재하는가? | resolver 응답 shape과 프론트 `result.content` 접근이 일치하는가? |
| invoke를 호출하는가? | 호출 fnName이 `src/index.js`에 등록된 함수와 매칭되는가? |
| 번역 키가 있는가? | `t()`가 참조하는 키가 `locales/kr/`·`locales/en/`에 있고 merge됐는가? |
| 컴포넌트가 필드를 읽는가? | 그 컴포넌트에 넘어오는 **모든 shape**에 그 필드가 실재하는가? |

## 프로젝트 특화 점검

- **invoke 응답 접근:** `{ success, content, error }`에서 `result.content`를 정확히 꺼내고 `result.success===false`를 처리하는가?
- **camelCase/snake_case:** DB 컬럼 → Query 결과 → 응답 필드 → 프론트 접근의 필드명 일관성
- **즉시 응답 vs 큐(비동기):** 엑셀 업로드 등(`src/queue/consumer.js`+`JobPollingManager.jsx`)에서 프론트가 즉시 응답에서 최종 결과를 접근하지 않는가?
- **성능 위반:** 워크로그 다건 조회가 공통 페치 경로를 수정했는가(금지)? 전용 병렬 페처 + `p-limit`인가? Resource 분석이 프로젝트 단위 1회 페치 + KVS 캐시인가?
- **i18n:** ko-KR/en-US를 직접 수정하지 않았는가? merge가 실행됐는가?

## 실행 검증

- 백엔드: 루트 `npm test` (jest)
- 프론트: `cd static/ui && npm test`, 필요 시 `npm run build`
- **빌드 통과 ≠ 정상 동작.** 빌드가 통과해도 shape 불일치는 런타임에 터진다. 반드시 교차 비교를 병행한다.

## 검증 시점: 점진적(incremental)

전체 완성 후 1회가 아니라 **각 모듈(resolver + 대응 훅) 완성 직후** 즉시 해당 경계면을 교차 검증. 초기 불일치가 후속 모듈로 전파되는 것을 막는다.

## 출력

`_workspace/<feature>/03_verify_report.md`에 **통과 / 실패 / 미검증** 3분류로 작성. 실패 항목은 `파일:라인` + 불일치 내용 + 수정 방법. 경계면 이슈는 backend·frontend 양쪽에 통지. 검증 불가 항목은 "미검증"으로 명시하고 추측으로 통과 처리하지 않는다.
