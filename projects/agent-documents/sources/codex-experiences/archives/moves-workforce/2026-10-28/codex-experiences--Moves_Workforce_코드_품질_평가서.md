# Moves Workforce 코드 품질 평가서

문서 버전: 1.2  
평가 기준일: 2026-08-06  
개정일: 2026-08-06 (1.1의 우선 조치 구현 결과와 실물 코드를 교차검증, 개정 이력은 부록 A 참조)  
대상 시스템: Atlassian Forge 기반 Moves Workforce  
관련 기술 보고서: `_workspace/logic-bloat-audit/03_verify_report.md`

주요 독자: 개발팀, 기술 책임자, 배포 승인자

---

## 1. 문서 목적

이 문서는 Moves Workforce 프로젝트의 현재 구현을 대상으로 다음 항목을 평가하고, 개선 우선순위와 실행 방향을 제시한다.

- 과도하게 비대해진 Service, Hook, UI component
- 동일하거나 유사한 로직의 중복 구현
- 공용 component·Hook·utility로 전환할 수 있는 구현
- 불필요한 API 호출, 직렬 처리, cache 정책 불일치 등 비효율
- 사용되지 않거나 유지 가치가 낮은 구현
- resolver와 frontend 사이의 경계 계약 및 테스트 상태

본 평가는 단순한 파일 길이보다 **하나의 변경 이유로 함께 바뀌어야 하는 코드가 여러 위치에 흩어져 있는지**, 그리고 **한 모듈이 서로 다른 책임을 동시에 수행하는지**를 중심으로 판단했다.

### 1.1 검증 범위와 제한

- Resolver 경계 검증은 **literal `invoke` 이름과 backend 등록 이름의 매칭**을 확인한 것이다. 모든 응답 shape, dynamic `invoke`, runtime authorization을 E2E로 검증했다는 의미는 아니다.
- i18n 검증은 source에 literal로 작성된 `t('key')`를 대상으로 했다. 실행 중 조립되는 dynamic key는 범위 밖이다.
- 성능 평가는 production build 산출물과 source의 호출 구조를 기준으로 했다. 실제 Forge 환경의 API latency, rate limit, KVS 지연은 계측하지 않았다.
- 사용되지 않는 것으로 보이는 resolver와 dependency는 1.0 시점에는 정적 참조 기준의 후보였다. 1.1에서 dynamic invoke 조립 경로와 import를 전수 확인해 6.1과 4.10의 판정을 확정했다.
- 1.1 개정에서는 각 지적 사항의 **파일·라인 실재 여부, 수치 정확도, 실제 사용자 영향**을 코드로 재확인했다. 그 결과 일부 항목의 등급과 영향 서술이 조정됐다. 조정 내역은 부록 A에 있다.

### 1.2 용어 정의

| 용어 | 이 문서에서의 의미 |
|---|---|
| Characterization test | refactoring 전 현재 외부 동작과 경계 계약을 고정하는 회귀 테스트 |
| Domain adapter | 공용 control flow에 Level/Role/Skill별 validation과 record 변환을 연결하는 얇은 계층 |
| Bridge | SVAR 같은 외부 imperative API의 event와 Workforce callback을 연결하는 모듈 |
| Overlay | Gantt library가 직접 제공하지 않는 marker를 DOM 위에 별도로 그리는 표현 계층 |
| Orchestration | 여러 상태 변경, API 호출, rollback, cache 갱신의 실행 순서를 조정하는 로직 |
| Bounded concurrency | 전체 요청을 한꺼번에 실행하지 않고 정해진 동시 실행 수 안에서 처리하는 방식 |
| Runtime log | production browser 또는 Forge function 실행 중 기록되는 console·운영 log |

## 2. 종합 평가

### 2.1 평가 결론

현재 프로젝트는 주요 resolver 연결, 다국어 key, backend 테스트와 production build 측면에서는 비교적 안정적이다. 반면 일부 핵심 화면과 Service에 책임이 집중돼 있고, 같은 control flow가 여러 도메인에 복제돼 있어 기능 확장 시 회귀 위험과 수정 비용이 커지는 단계에 진입했다.

따라서 현재 상태는 다음과 같이 평가한다.

> **종합 상태: 조건부 개선 필요**  
> 전면 재작성은 필요하지 않지만, P0/P1 항목을 방치한 상태에서 기능을 계속 추가하면 중복과 변경 비용이 빠르게 증가할 가능성이 높다.

배포 관점에서는 P0 1건(4.1, 다건 worklog rollback)이 유일한 차단 요소다. 이 항목은 사용자 데이터가 부분 등록된 채로 남을 수 있고, 그 상황에서 시스템이 "모두 취소되었다"고 안내하므로 사용자가 문제를 인지할 수단이 없다. 나머지 항목은 기능 개발과 병행 처리 가능한 수준이다.

### 2.2 영역별 평가

| 평가 영역 | 상태 | 판단 근거 |
|---|---|---|
| Backend 테스트 안정성 | 양호 | 67 suites, 1,074 tests 전체 통과 |
| Resolver 이름 매핑 | 양호 | frontend literal `invoke` 143종 모두 backend 정의와 매칭 |
| i18n literal key | 양호 | literal `t()` key 1,791종의 ko/en 누락 없음 |
| Frontend 테스트 | 개선 필요 | 1,087 tests 중 query-key 계약 1건 실패 |
| 데이터 정합성 | **조치 필요** | 다건 worklog rollback이 삭제 실패를 확인하지 않고 완료로 안내 |
| 유지보수성 | 개선 필요 | 1,000줄급 component와 800줄급 Service 존재 |
| 중복 구현 | 개선 필요 | quick-add 3벌, project issue pagination 3벌, worklog pagination 2벌 |
| 성능·호출 효율 | 개선 필요 | 다건 worklog 직렬 호출(N일 = N요청) |
| Bundle 관리 | 양호 | 기준값 950,000B 대비 실측 892,894B. 예산 항목 확충은 후속 |
| Forge CLI 검증 | 미검증 | `forge lint` 및 CLI 기본 명령이 출력 없이 timeout |

## 3. 우선순위 정의

| 등급 | 의미 | 처리 원칙 |
|---|---|---|
| P0 | 사용자 데이터가 잘못된 상태로 남거나, 시스템이 사실과 다른 결과를 안내하는 문제 | 다음 배포 전 필수 처리 |
| P1 | 오류 가능성, 테스트 실패, 높은 회귀 위험, 핵심 중복 | 신규 기능보다 우선해 처리 |
| P2 | 유지보수성과 성능을 점진적으로 악화시키는 구조적 부채 | 관련 기능 수정 시 함께 정리 |
| P3 | 개선 여지는 있으나 현재 동작상 해가 없는 항목 | 별도 작업으로 잡지 않음 |

## 4. 핵심 평가 결과

### 4.1 P0 — 다건 worklog rollback 신뢰성 복구

`static/ui/src/pages/myWork/modal/WorklogModal.jsx`의 기간 등록은 날짜별 `addWorklog`를 순차 호출하고, 중간에 실패하면 그때까지 생성된 worklog를 삭제해 되돌린다. 그런데 rollback 경로(`:312-314`)의 `deleteWorklog` 호출은 결과를 확인하지 않는다.

같은 파일 `:33` 주석이 설명하듯 `executeRequest`는 실패해도 예외를 던지지 않고 `{ success: false }`를 반환한다. 따라서 삭제가 실패해도 `Promise.all`은 정상적으로 완료되고, `:251`은 사용자에게 **"등록된 항목은 모두 취소되었습니다"라고 안내한다.**

문제의 성격:

- 등록을 실패시키는 원인(네트워크 단절, 권한 회수, Jira 오류)은 대개 삭제도 실패시키는 원인이다. 즉 **허위 안내가 나가는 조건과 문제가 실제로 발생하는 조건이 일치한다.**
- 사용자는 부분 등록된 worklog가 남은 사실을 모른 채 재시도하므로 중복 등록으로 이어질 수 있다.
- 브라우저를 닫지 않아도 발생한다. 기존에 인지된 "브라우저 종료 시 rollback 미완료"보다 재현 조건이 넓다.

필수 조치:

- rollback의 각 삭제 결과를 개별 확인한다.
- 전부 성공한 경우와 일부 실패한 경우의 안내 문구를 분리한다.
- 삭제에 실패한 worklog는 식별 정보를 안내해 수동 정리가 가능하게 한다.

완료 기준:

- 삭제 실패를 주입한 테스트에서 "모두 취소" 문구가 출력되지 않아야 한다.
- 부분 실패 시 남은 항목이 사용자에게 명시돼야 한다.

### 4.2 P1 — Production debug log 제거

다음 경로에서 사용자 입력 또는 resolver 응답이 브라우저 console에 기록된다.

- `static/ui/src/pages/myWork/modal/WorklogModal.jsx:109`
- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx:843`
- `static/ui/src/pages/myWork/WorklogPage.jsx:268`
- `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:127`
- `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:139`

특히 `WorklogModal`은 markdown 입력이 변경될 때마다 전체 본문을 출력하므로, 업무 설명이 console에 남고 입력 빈도만큼 불필요한 작업이 발생한다. 위 5건은 frontend에 남아 있는 활성 `console.log`의 전량이며, CRA 기본 설정에 `drop_console`이 없어 production 번들에도 그대로 포함된다.

**영향 범위 (1.1 정정):** 이 log는 외부로 전송되지 않는다. `GanttChart.jsx:842` 주석이 명시하듯 Sentry는 error만 전송하므로, 해당 사용자 본인의 devtools에서만 보인다. 따라서 개인정보 유출이 아니라 **코드 위생 및 불필요한 연산 문제**로 분류하고 등급을 P0에서 P1로 조정했다. 제거 비용이 매우 낮으므로 1단계에서 함께 처리한다.

필수 조치:

- 해당 log를 제거한다.
- 운영 진단이 필요한 경우 payload를 싣지 않는 공용 logger를 사용한다.
- development 환경에서만 활성화되도록 명시적으로 제한한다.

완료 기준:

- 사용자 입력, Jira event 객체, resolver 전체 응답을 출력하는 runtime log가 없어야 한다.
- 관련 화면 동작과 오류 처리는 기존과 동일해야 한다.

### 4.3 P1 — Query key factory 계약 복구

다음 두 위치가 query key factory 결과 뒤에 배열을 직접 확장하고 있다.

- `static/ui/src/pages/projectDetail/issue/subscription/IssueTypeFilter.jsx:27`
- `static/ui/src/pages/projectDetail/issue/subscription/useIssueOwnership.js:36`

현재 의미상 cache key는 동작하지만, 저장소의 runtime inline query key 금지 계약을 위반해 frontend 전체 테스트 중 1건이 실패한다.

권장 조치:

- `subscriptionKeys.issueTypes(projectId, sourceType, sourceId)` 추가
- `subscriptionKeys.ownership(projectId, signature)` 추가
- 두 소비처가 factory만 사용하도록 변경

완료 기준:

- `queryKeyContract.test.js`를 포함한 frontend 전체 테스트가 통과해야 한다.

### 4.4 P1 — Level/Role/Skill quick-add 공통화 (backend 우선)

Level, Role, Skill의 quick-add 기능은 다음 흐름을 각각 반복한다.

1. 기존 목록 query
2. 기존 이름 Set 생성
3. 선택·전체 선택 state 처리
4. bulk mutation
5. toast 출력
6. query invalidation

관련 frontend Hook:

- `useLevelQuickAddModal.js`
- `useRoleQuickAddModal.js`
- `useSkillQuickAddModal.js`

Backend의 `addLevelBulkService`, `addRoleBulkService`, `addSkillBulkService`도 `findAll → 중복 판정 → save → added/skipped 집계` 흐름이 반복된다.

1.1에서 세 벌을 대조한 결과, Level과 Role은 상수·query key·invoke 이름·i18n prefix·id prefix만 다른 사실상 동일한 코드이며, Skill만 저장 항목에 `category`가 추가되는 실질적 분기를 갖는다. 중복 판정 기준(기존 이름 Set, added/skipped 집계, 빈 값 skip)은 세 벌 모두 같다.

권장 구조와 순서:

| 대상 | 공통화 함수 | 주입 인자 수 | 판단 |
|---|---|---:|---|
| Backend | `addCatalogItemsBulk({ entity, prefix, items, buildRecord })` | 3 | **먼저 진행.** 28~32줄 함수 3벌을 대체하며 손익이 명확 |
| Frontend | `usePresetQuickAdd()` + `PresetQuickAddModal` | 6 | **보류 권장.** 각 121~128줄, 변경 빈도 낮음, 인자 6개는 추상화 손익분기 언저리 |

frontend 통합은 네 번째 도메인이 추가되는 시점에 진행해도 늦지 않다. 지금 시점에서는 backend만 정리하고 frontend는 현행 유지하는 편이 총비용이 낮다.

주의사항:

모든 backoffice CRUD를 하나의 거대한 범용 framework로 합치는 것은 권장하지 않는다. 현재 명확히 중복된 quick-add control flow만 공유해야 한다.

### 4.5 P1 — `GanttChart` 책임 분리

`GanttChart.jsx`는 파일 1,313줄이며 실제 `GanttChart` 함수가 1,092줄이다. 하나의 component가 다음 책임을 모두 맡고 있다.

- SVAR API 초기화와 intercept
- 최신 callback을 위한 ref mirror
- 일정·상위·담당자·협업자 editor state
- column renderer 조립
- marker overlay 좌표 계산
- DOM resize와 scroll 감시
- drag payload 해석

권장 component·Hook 분리:

| 후보 | 책임 |
|---|---|
| `useLatestRef` | 최신 callback ref 반복 제거 |
| `useSvarGanttBridge` | SVAR init/intercept와 payload 해석 |
| `useGanttMarkerOverlay` | DOM 측정, marker 좌표, resize·scroll 처리 |
| `GanttEditors` | 네 종류 editor 렌더링과 active editor state |
| `useGanttColumns` | column definition과 cell renderer 조립 |

SVAR 자체가 imperative API이므로 복잡성을 완전히 제거할 수는 없다. 목표는 범용 Gantt framework를 만드는 것이 아니라, 외부 library 연동과 Workforce 비즈니스 동작을 분리하는 것이다.

분리 형태에 대한 주의(1.1 추가):

- 네 조각이 공유하는 상태는 `hostRef`, `apiRef`, `openStateRef` 세 개의 ref뿐이다. 따라서 **Hook 형태로 추출하면 prop 전달이 늘어나지 않는다.**
- 반면 editor를 **component로** 분리하면 열기 함수가 column renderer 내부에서 호출되므로 이를 다시 상위로 노출해야 해 배선이 오히려 늘어난다. `useGanttEditors()`가 openers와 modal 요소를 함께 반환하는 형태가 적절하다.
- 실제 위험은 배선이 아니라 타이밍이다. 이 파일의 effect는 애니메이션 프레임 재시도, DOM 변경 감시, 높이 계산 시점에 의존하는 코드를 포함한다. 분리 과정에서 실행 순서가 바뀌면 marker overlay 등에서 시각적 회귀가 조용히 발생할 수 있으므로 화면 확인을 전제로 진행한다.
- `useLatestRef` 치환은 동일 패턴이 18회 반복되고 공유 상태가 없어 위험이 사실상 없다. 여기부터 시작한다.

### 4.6 P1 — `WorklogModal` UI와 다건 처리 분리

`WorklogModal`은 함수 553줄, local state 14개로 다음 책임이 결합돼 있다.

- 단일·기간 입력 form
- validation과 미리보기
- Jira permission 확인
- markdown 변환
- worklog 등록·수정·삭제
- 다건 등록 실패 시 rollback

기간 등록은 날짜별 요청을 브라우저에서 순차 실행한다. 1개월 범위(약 20 근무일)면 요청 20회가 차례로 실행되며, 진행률 표시 없이 제출 버튼의 로딩 상태만 노출된다. 브라우저 종료나 네트워크 단절이 발생하면 rollback이 완료되지 않을 수 있다. rollback 자체의 결함은 4.1에서 별도 P0로 다룬다.

순차 실행이 Jira rate limit을 고려한 의도적 설계라는 근거는 코드와 주석 어디에도 없다. 주석은 실패 시 rollback만 설명하며, backend가 동시성 제어에 `p-limit`을 일관되게 사용하는 것과 대비된다. rollback 대상을 확정하기 쉬운 구조로 선택된 것으로 보인다.

권장 component·Hook 분리:

- `useWorklogDraft`
- `SingleWorklogFields`
- `RangeWorklogFields`
- `WorklogPermissionNotice`

다건 등록의 server-side 이전은 **확정 결정이 아니라 별도 설계 검토 항목**이다. 우선 UI와 orchestration 경계를 분리하고 현재 동작을 characterization test로 고정한다. 이후 `.asUser()` resolver에서 bounded concurrency와 rollback 결과를 관리할지 결정한다. Queue consumer의 `.asApp()`로 단순 이전하면 권한 모델이 달라지므로 적절하지 않다.

### 4.7 P1 — Jira pagination helper 통합 (범위 축소)

**1.1 정정:** 1.0은 6곳 반복으로 서술했으나, 실제로는 **완전 중복 2계열과 구조가 다른 변형 1건**이다.

| 계열 | 위치 | 방식 | 중복 정도 |
|---|---|---|---|
| A | `ProjectCostService.js`, `ProjectProgressService.js`, `PortfolioAggregator.js` | `nextPageToken`, page size 100 | 앞 둘은 완전 동일. 세 번째는 권한 주체 인자 `'app'` 하나만 차이 |
| B | `WorklogService.js`, `MyWorkService.jsx` | `startAt`/`total`, page size 20 | 완전 동일 |
| C | `IssueAnalysisService.js` | page size 100, `total` 게이트 후 루프 | 구조가 달라 통합 대상 아님 |

전제 조건: 이 저장소는 워크로그 조회에 대해 **"공통 경로를 수정하지 말고 기능별 전용 페처로 격리한다"는 명시적 정책**을 갖고 있다(`src/api/jira/issue/IssueApi.js:374` 주석). 따라서 B계열 통합은 해당 정책과 충돌할 소지가 있다.

권장 조치:

- **A계열만 우선 정리한다.** 세 곳 모두 이미 동일한 공용 함수 `getProjectIssuesByFilter`를 호출하므로, 그 위에 `fetchAllProjectIssues({ projectId, coworkerFieldId, as })` 래퍼를 추가하는 것은 공통 조회 경로를 변경하는 것이 아니어서 격리 정책과 충돌하지 않는다.
- B계열은 `MyWorkService.jsx`가 같은 파일에서 다른 함수는 이미 import하고 있으므로, 해당 함수를 export해 공유하는 선에서 그친다.
- C는 변경하지 않는다.
- 공용 helper는 `asUser`와 `asApp`의 차이를 숨기지 않고 인자로 받아야 한다. 호출 순서와 rate limit이 중요한 경로를 무조건 `Promise.all`로 바꾸지 않는다.

### 4.8 P1 — 확인된 correctness 결함

#### 사용자 단건 조회 null dereference

`src/resolver/backoffice/user/UserService.js:281-305`에서 DB 결과가 없으면 `user`가 null인데도 `user.created_id` 등을 읽는다. 같은 함수의 `:288-294`는 null을 가드하고 있어 누락이 명백하다.

발생 조건(1.1 확인): 유일한 소비처가 백오피스 사용자 편집 모달이고 `accountId`는 목록 행에서 전달된다. 따라서 정상 흐름에서는 재현되지 않고, 다른 관리자가 삭제한 직후 갱신되지 않은 목록에서 편집을 여는 경합 상황에서만 발생한다. 그 경우에도 `responseWrapper`가 예외를 잡아 모달 로딩 실패로 처리되므로 앱 전체가 중단되지는 않는다.

권장 조치:

- DB 조회 직후 `USER_NOT_FOUND`를 throw한다.
- 빈 결과를 재현하는 단위 테스트를 추가한다.

#### 급여 histogram의 0 step

`ProjectDashboardService.js`의 histogram 계산은 전체 `min !== max`여도 outlier 제거 후 정상 값이 모두 같으면 `step === 0`이 될 수 있다. 이후 bucket index가 `NaN`이 되어 존재하지 않는 bucket에 접근한다.

1.1에서 산식을 그대로 재현해 `[3000, 3000, 3000, 3000, 9000]` 입력에서 `TypeError`를 확인했다. 즉 잘못된 분포가 그려지는 것이 아니라 **예외가 발생해 해당 위젯의 데이터 요청이 `{ success: false }`로 실패한다.** 사용자에게는 급여 분포 위젯만 오류로 보인다.

권장 조치:

- `normalMin === normalMax`인 경우 단일 bucket을 반환한다.
- `[1, 1, 1, 1, 100]`과 같은 skewed fixture를 테스트한다.

### 4.9 P2 — 근무일 산식의 frontend/backend 중복

다음 두 파일의 핵심 산식이 동일하다.

- `src/utils/workday.js` (76줄)
- `static/ui/src/utils/workday.js` (56줄)

`fmtLocal`, `isWeekend`, `buildHolidayMap`, `workdayValue`, `getMonthMm`는 문자 단위로 동일하다. 차이는 `getWorkdaysInRange`의 frontend 측 null guard 1줄과, 각 환경의 소비처가 필요로 하는 부가 함수뿐이다.

**1.1 정정:** 1.0의 "이미 미세하게 갈라졌다"는 서술은 과장이다. 계산 결과 차이는 없다. null guard 유무조차 실질 영향이 없는데, backend에 null이 들어가면 Invalid Date가 되어 루프가 돌지 않고 동일하게 0을 반환하기 때문이다.

다만 향후 휴일 계산 규칙을 한쪽에서만 변경하면 frontend 표시값과 backend 집계값이 어긋난다. frontend 3개 화면과 backend 4개 Service가 각각 자기 사본을 소비하므로 위험 자체는 실재한다.

권장 조치:

- **물리적 코드 공유는 권장하지 않는다.** `static/ui`는 독립 CRA 패키지이고 backend는 Forge가 `src/`를 번들하며, 런타임 코드 공유 선례가 없다. 두 파일 합계 132줄에 변경 빈도가 낮은 것에 비해 빌드 경계를 여는 비용과 위험이 크다.
- 대신 frontend 테스트에서 backend 구현을 직접 import해 동일 fixture로 공통 함수 5종의 결과를 대조하는 동기화 테스트를 둔다.
- 이 기법은 `static/ui/src/backoffice/page/team/__test__/inheritedPermission.test.js`에 이미 선례가 있다.

### 4.10 P2 — Bundle budget 항목 확충 및 미사용 dependency 정리

**1.0의 지적은 이미 해소됐다.** 평가 기준일 당일 커밋 `7a2d381`(게이트 경고 강등)과 `36edce3`(코드 스플리팅 재도입)으로 `check-bundle-budget.js`는 다음 상태로 갱신됐다. 1.0은 갱신 전 버전을 근거로 작성됐다.

| 항목 | 1.0 서술 | 현재 실제 |
|---|---|---|
| main 기준값 | 1.85MB | **950,000B** |
| 전제 | code splitting 제거 상태 | **splitting 유지 상태** |
| 초과 시 | warning | warning (측정 불가 시에만 실패) |

최신 측정값(asset-manifest 기준 실측):

| 항목 | 측정값 | 기준 대비 |
|---|---:|---|
| Initial main gzip | 892,894B | 950,000B의 94% |
| 최대 async chunk gzip | 372,869B | 기준 없음 |
| 전체 JS chunk 수 | 190개 | 기준 없음 |
| 전체 JS gzip 합계 | 약 2.43MB | 기준 없음 |

현재 기준값 자체는 실측 대비 약 6% 여유로 적정하다. 남은 과제는 기준값 조정이 아니라 **측정 항목이 main 하나뿐이라는 점**이다.

권장 조치:

- `asset-manifest.entrypoints` 기반 initial payload 예산 추가
- 최대 async chunk 예산 추가
- 안정화 후 warning-only 정책을 CI failure gate로 전환

미사용 dependency는 전역 import 검색으로 **8종 모두 사용 0건을 확인**했다.

| Dependency | 확인 결과 |
|---|---|
| `@atlaskit/breadcrumbs` | import 0건 |
| `@atlaskit/navigation-system` | import 0건 |
| `@atlaskit/range` | import 0건 |
| `@atlaskit/side-nav-items` | import 0건 |
| `@fullcalendar/list` | import 0건 |
| `picomatch` | import 0건 |
| `react-apexcharts` | import 0건. `App.jsx:26` 주석 1줄이 유일한 언급 |
| Frontend `p-limit` | `static/ui/src` 0건. backend `src/`에서는 8개 파일이 실사용하므로 root 선언은 유지 |

CRA 트리셰이킹으로 번들에는 포함되지 않으므로 크기상 실해는 없다. `npm install` 시간과 audit 노이즈 수준이며 제거는 안전하다.

부수 조치: `CLAUDE.md`의 기술 스택 항목에 `react-apexcharts`가 차트 라이브러리로 기재돼 있으나 실사용이 없다. 문서에서 제거한다.

### 4.11 P3 — 공휴일 query block 중복 (동작상 무해)

동일한 `backofficeKeys.publicHolidays()`를 사용하는 query가 두 곳에 존재하며 staleTime이 각각 30분과 5분이다.

- `static/ui/src/utils/usePublicHolidayList.js`
- `static/ui/src/backoffice/page/publicHoliday/usePublicHolidayList.js`

**1.1 정정:** 1.0은 이를 "같은 key의 stale 정책이 mount 위치에 따라 달라지는" 문제로 서술했으나, React Query에서 staleTime은 cache entry가 아니라 **각 `useQuery` 인스턴스(observer)의 옵션**이다. cache는 key 단위로 공유되므로 다음이 성립한다.

- 짧은 쪽(5분) 화면이 refetch하면 결과가 공유 cache에 반영돼 다른 화면도 함께 갱신된다.
- 두 화면이 서로 다른 공휴일 값을 보는 상황은 구조적으로 발생할 수 없다.
- 실제 영향은 backoffice 진입 시 background refetch가 1회 더 발생하는 정도이며, `keepPreviousData` 때문에 화면 깜빡임도 없다.

또한 backoffice 쪽은 데이터 Hook이 아니라 table 조립 Hook(74줄) 안에 query block 13줄이 포함된 형태로, "Hook 2벌"이 아니라 "query block 1개 중복"이다. staleTime 차이도 편집 화면과 조회 화면의 성격 차이로 해석할 수 있다.

권장 조치:

- 필수 아님. 별도 작업 항목으로 잡지 않는다.
- 정리한다면 backoffice Hook이 공용 Hook을 내부 호출하도록 바꾸는 선에서 충분하다.

## 5. 추가 분리 후보

### 5.1 `UserService`

현재 826줄이며 paging/search, Jira user mapping, CRUD, cascade, queue upload, Excel export, meta count를 모두 담당한다.

권장 경계:

- `UserReadService`
- `UserWriteService`
- `UserExcelService`

파일 수를 늘리는 것 자체가 목표는 아니다. 변경 이유가 다른 Excel 생성과 사용자 CRUD를 분리하는 정도가 적절하다.

### 5.2 `ProjectAssignmentBoard`

함수 481줄, local state 15개이며 filter, project selection, membership mutation, confirm modal, layout을 함께 관리한다.

권장 분리:

- `useProjectMembershipMutations`
- modal state reducer 또는 단일 modal state
- header count·filter 조립 component

### 5.3 `TreeDetailPanel`

파일 1,087줄이지만 내부는 이미 top-level component 15개로 구분돼 있어, 단일 함수가 비대한 5.1·5.2와는 성격이 다르다. 새로운 추상화보다 다음 단위의 기계적인 파일 분리가 적절하며 우선순위도 셋 중 가장 낮다.

- `IssueDetail`
- `FolderDetail`
- `RelationSection`
- relation display primitives

## 6. 제거 또는 유지 여부를 추가 확인할 항목

### 6.1 Dashboard bulk endpoint — 미사용 확정, 제거 권장

`getChartDataService`와 `getChartData` resolver는 미사용이다. 1.1에서 다음을 확인해 판정을 확정했다.

- frontend의 dynamic invoke는 5곳이며, 각 변수가 가질 수 있는 값을 모두 확인한 결과 `getChartData`를 조립할 수 있는 경로가 없다. 현재 frontend는 `getChartDataById`만 사용한다.
- 결정적 근거로, `ProjectDashboardService.js:124-125` 주석은 과거 이 함수가 scope 밖 변수를 참조해 **호출 즉시 오류가 발생하는 상태였으나 frontend가 다른 함수만 사용해 발현되지 않았다**고 기록한다. 호출됐다면 실패했을 코드가 무사했다는 사실 자체가 미사용의 증거다.

조치:

- endpoint와 Service를 제거한다.
- 함께 정리할 참조: `ProjectDashboardController.js`의 import와 등록, `src/utils/permission/PermissionMap.js`의 `getChartData` 권한 키, `static/ui/src/utils/queryKey/projectKeys.js`의 `dashboardData` 키 및 이를 사용하는 `DashboardPage.jsx`의 무효화 호출 2곳(대상 query가 없어 현재 동작하지 않는다).
- 만약 유지하기로 한다면, 동일 data type의 raw fetch를 request 단위로 재사용하도록 먼저 수정해야 한다. 현재 구조는 같은 data type의 위젯이 여러 개일 때 동일 데이터를 위젯 수만큼 다시 읽는다.

### 6.2 호환 re-export

다음 파일은 중복 구현이 아니라 이전 import 경로를 유지하는 2줄짜리 compatibility shim이다.

- Portfolio의 `ChartTableToggle.jsx`
- Portfolio의 `EmptyState.jsx`
- Portfolio의 `expandContext.js`

소비처 이관이 끝났다면 삭제할 수 있지만, 우선순위는 낮다.

### 6.3 서로 다른 `StatusBadge`

프로젝트 상태 색상을 표현하는 badge와 generic appearance badge는 이름만 같고 계약이 다르다. 억지로 하나로 합치면 props와 분기가 늘어나므로 현재는 별도 유지가 적절하다.

## 7. 개선 로드맵

### 1단계 — 배포 안전성 복구

- **다건 worklog rollback 실패 확인 및 안내 문구 수정 (P0)**
- Query key factory 계약 수정
- 사용자 not-found 처리
- 급여 histogram edge case 처리
- Production debug log 제거
- 관련 회귀 테스트 추가

완료 조건:

- Backend와 frontend 전체 테스트 통과
- Production build 성공
- rollback 부분 실패 시 "모두 취소" 안내가 출력되지 않음
- 사용자 입력·resolver 전체 응답 console 출력 0건

### 2단계 — 명확한 중복 제거

- Level/Role/Skill quick-add **backend** 공통화 (frontend 3벌은 보류)
- 프로젝트 이슈 pagination helper 통합 (A계열 한정)
- 근무일 산식 동기화 테스트 도입

완료 조건:

- 도메인별 동작과 응답 shape 유지
- 공통 control flow의 구현 위치가 한 곳이어야 함
- 각 domain adapter에 characterization test 존재
- 워크로그 조회의 기능별 페처 격리 정책이 유지됨

공휴일 query(4.11)는 동작상 무해로 확인돼 이 단계에서 제외했다.

### 3단계 — 대형 component·Service 분리

- `GanttChart` bridge/overlay/editor 분리
- `WorklogModal` form/orchestration 분리
- `ProjectAssignmentBoard` mutation/modal state 분리
- `UserService` read/write/Excel 분리

완료 조건:

- 기존 resolver 이름과 frontend 응답 소비 계약 유지
- 기능 단위 테스트와 production build 통과
- 단순 줄 수 감소가 아니라 책임 경계가 코드 구조에 드러나야 함

### 4단계 — 성능 기준선과 불필요 구현 정리

- Bundle budget에 initial payload·최대 async chunk 항목 추가 후 CI gate 복원
- 미사용 dependency 8종 제거 및 `CLAUDE.md` 기술 스택 기재 정정
- Dashboard bulk endpoint 제거 (참조 5곳 동반 정리)
- Forge 환경에서 API latency와 주요 route chunk 체감 시간 계측

완료 조건:

- Initial payload, 최대 async chunk의 승인된 임계값이 설정 파일에 기록되고 CI 초과 시 exit 1
- Dependency 제거 후 production build와 주요 화면 smoke test 통과
- 제거한 endpoint의 권한 키·query key 참조가 함께 정리됨
- API latency는 Forge 환경 baseline을 먼저 기록하고, 승인된 목표값과 측정 시나리오가 성능 보고서에 남아야 함

### 7.1 단계별 승인 checklist

| 단계 | 필수 검증 | 객관적 통과 조건 | 산출물 |
|---|---|---|---|
| 1단계 | Backend/frontend 전체 test, production build, `forge lint`, rollback 부분 실패 test, runtime log 검색 | test 0 fail, build exit 0, `forge lint` exit 0, rollback 실패 시 허위 안내 0건, payload log 0건 | test/build/lint 결과와 수정 목록 |
| 2단계 | Domain별 characterization test, resolver 응답 shape 비교, API 호출 주체 확인 | Level/Role/Skill 기존 응답 유지, pagination 결과·종료 조건 동일, `asUser`/`asApp` 변경 없음 또는 별도 승인 | 공통 helper와 domain adapter 계약표 |
| 3단계 | Gantt intercept·overlay, Worklog validation·rollback, Assignment cache invalidation 회귀 테스트 | 기존 resolver 이름·payload·응답 소비 유지, 핵심 행동 test 통과, production build exit 0 | 분리 전후 책임표와 회귀 test |
| 4단계 | Bundle CI gate, dependency build, 주요 route smoke test, Forge latency 계측 | 승인된 bundle 임계값 이내, dependency 누락 0건, smoke test 전부 통과, latency baseline·목표 기록 | Bundle/성능 보고서와 endpoint 유지 결정 |

`forge lint`가 환경 문제로 실행되지 않으면 1단계를 통과로 처리하지 않는다. CLI 장애 원인·재현 정보·후속 검증 담당자·완료 기한을 기록한 위험 수용 승인은 **배포만 예외적으로 허용**할 수 있으며, 1단계 상태는 `조건부 미완료`로 유지한다.

## 8. 검증 결과

### 8.1 실행 환경

- OS/Shell: Windows, PowerShell
- Node.js: `v22.22.0`
- npm: `10.9.4`
- 작업 경로: `C:\CloudJira\moves-workforce`
- Forge CLI: 기본 명령과 `--verbose` 실행이 출력 없이 timeout되어 version 확인 불가

### 8.2 재현 명령

| 목적 | 명령 | 실행 위치 |
|---|---|---|
| Backend test | `npm test -- --runInBand` | 프로젝트 root |
| Frontend test | `npm test -- --runInBand` | `static/ui` |
| Production compile | `npm run build:app` | `static/ui` |
| 현재 bundle 측정 | `npm run bundle:check` | `static/ui` |
| Forge lint | `forge lint` | 프로젝트 root |

`npm run build`는 `prebuild`에서 locale merge를 실행한다. 이번 평가는 기존 locale 작업을 덮어쓰지 않기 위해 source compile용 `build:app`을 사용했고, literal i18n key는 별도로 교차검증했다.

### 8.3 후속 단계에서 구축해야 할 검증 자동화

아래 항목은 현재 존재하는 script가 아니라 **각 개선 단계에서 함께 추가해야 할 필수 산출물**이다. 해당 test 또는 checklist가 만들어지기 전에는 관련 단계를 완료로 판정하지 않는다.

| 대상 | 추가할 검증 | 실행·판정 방식 |
|---|---|---|
| Worklog rollback | `WorklogRollbackContract.test.js` | 삭제 실패를 주입해 안내 문구 분기와 잔여 항목 노출을 확인 |
| Runtime log | `runtimeLogContract.test.js` | 대상 화면의 payload 출력 금지 목록을 source scan하여 0건이어야 함 |
| 근무일 산식 동기화 | `workdayParity.test.js` | frontend test에서 backend 구현을 import해 동일 fixture로 공통 함수 5종 결과 비교 |
| Quick-add 공통화 | `QuickAddContract.test.js` | Level/Role/Skill의 payload, added/skipped 응답, invalidate key를 공통 fixture로 비교 |
| Pagination 통합 | `PaginationContract.test.js` | multi-page, empty page, 마지막 token, `asUser`/`asApp` 경로의 결과와 종료 조건 비교 |
| Gantt 분리 | `GanttChartContract.test.js` | add/delete link, move-task, editor submit, overlay 계산의 기존 callback 계약 고정 |
| Worklog 분리 | `WorklogModalContract.test.js` | simple/range validation, partial failure, rollback 결과, permission 거부 동작 고정 |
| Assignment 분리 | `ProjectAssignmentBoardContract.test.js` | add/remove/bulk membership 후 board·pool invalidation과 modal 종료 상태 고정 |
| 주요 route smoke | 수동 checklist 또는 `test:smoke` script | Dashboard, Project Work tree/Gantt, Resource Assignment, My Worklog의 렌더·전환·console error를 확인하고 증적 첨부 |
| Forge latency | 개발 환경 계측 시나리오 | 주요 resolver별 동일 입력 20회 이상 측정, p50·p95·오류율을 기록하고 승인된 목표 대비 판정 |

계약 test 파일이 추가된 뒤에는 frontend 또는 backend의 기존 `npm test -- --runInBand <test-file>` 명령으로 단독 실행하고, 최종 승인은 전체 test와 production build를 다시 수행한다.

### 8.4 현재 검증 결과

| 검증 항목 | 결과 |
|---|---|
| Backend Jest | 통과 — 67 suites, 1,074 tests |
| Frontend Jest | 실패 — 65 suites 중 1 suite, 1,087 tests 중 1 test 실패 |
| Resolver literal invoke 이름 매칭 | 통과 — 미등록 literal invoke 0건. Dynamic invoke·응답 shape·runtime authorization은 별도 범위 |
| i18n literal key | 통과 — ko/en 누락 0건. Dynamic key는 별도 범위 |
| Production build | 통과 — source map 경고 3건 |
| Code splitting 산출물 | 통과 — route/tab/work view chunk 생성 확인 |
| Bundle budget script | 통과 — 기준 950,000B 대비 실측 892,894B (기준값 적정, 측정 항목만 확충 필요) |
| Dynamic invoke 전수 확인 | 통과 — 변수 invoke 5곳의 가능한 값 확인, `getChartData` 조립 경로 없음 |
| 미사용 dependency 확인 | 8종 모두 import 0건 확인 |
| Forge lint | 미검증 — CLI timeout |

## 9. 최종 권고

현재 프로젝트는 전면 재작성보다 **경계가 명확한 소규모 refactoring을 연속적으로 수행하는 방식**이 적합하다. 먼저 운영 위험과 테스트 실패를 제거하고, 이후 눈에 보이는 3벌 중복과 pagination을 통합해야 한다. 대형 component는 한 번에 교체하지 말고 외부 동작을 고정하는 characterization test를 추가한 뒤 Hook과 child component를 순서대로 추출하는 것이 안전하다.

가장 먼저 실행할 작업은 다음 네 가지다.

1. **다건 worklog rollback의 실패 확인과 안내 문구 수정** — 유일하게 사용자 데이터가 잘못된 상태로 남는 항목이다
2. Query key factory 계약 복구와 debug log 제거
3. 사용자 not-found와 급여 histogram 결함 수정
4. Level/Role/Skill quick-add backend 공통화

이 순서라면 운영 위험을 먼저 낮추면서도 이후 기능 개발에서 반복되는 수정 비용을 빠르게 줄일 수 있다.

한편 1.1 검증에서 **작업하지 않기로 판정한 항목**도 함께 기록한다. 지적 자체가 틀렸거나 현재 동작에 해가 없어, 착수하면 순수 비용만 발생한다.

- 공휴일 query 통합 (4.11) — 공유 cache 구조상 값 불일치가 발생할 수 없음
- 근무일 산식의 물리적 코드 공유 (4.9) — 빌드 경계 비용이 이득을 초과. 동기화 테스트로 대체
- Bundle budget 기준값 조정 (4.10) — 이미 갱신 완료
- Worklog pagination 통합 중 변형 1건 (4.7의 C) — 구조가 달라 통합 대상 아님

## 부록 A. 1.0 → 1.1 개정 이력

### 1.2 구현 상태 갱신 (2026-08-06)

1.1에서 우선순위로 제시한 기간 워크로그 rollback 결과 확인, query key factory 계약 복구, 사용자 not-found·단일 급여 구간 처리, production debug log 제거가 구현됐다. 또한 Level/Role/Skill backend quick-add는 `CatalogBulkService`로, 프로젝트 전체 이슈 수집은 `ProjectIssuesFetcher`로 통합됐다. 근무일 계산은 빌드 경계를 유지하되 frontend/backend fixture 동기화 테스트로 결과 계약을 고정했다.

따라서 이 문서의 P0/P1 항목은 **미해결 결함 목록이 아니라 2026-08-06 기준 해결 이력**으로 읽어야 한다. 이후 개선 우선순위는 대형 화면의 책임 분리, pagination 경계 정리, bundle 측정 항목 확충이다.

1.1은 1.0의 모든 지적 사항을 실물 코드로 재확인한 결과다. 조정 내역은 다음과 같다.

| 항목 | 1.0 | 1.1 | 사유 |
|---|---|---|---|
| 다건 worklog rollback | 미지적 | **신규 P0** | rollback의 삭제 실패를 확인하지 않아 허위 완료 안내 발생 |
| Production debug log | P0 (데이터 노출) | P1 (코드 위생) | 외부 전송 경로 없음. 본인 devtools 한정 |
| Jira pagination | 6곳 복제 | 3벌 + 2벌 + 변형 1 | 실제 구조 확인. 격리 정책 반영해 범위 축소 |
| quick-add 공통화 | frontend·backend 동시 | backend 우선, frontend 보류 | frontend는 주입 인자 6개로 손익분기 언저리 |
| 급여 histogram | NaN으로 잘못된 결과 | 예외 발생 → 위젯 요청 실패 | 재현 실행으로 실패 양상 확인 |
| 사용자 not-found | 일반 결함 | 경합 상황 한정 | 유일 소비처와 호출 경로 확인 |
| 공휴일 query | P2 (정책 불일치) | P3 (무해) | staleTime은 observer별 옵션, cache는 공유 |
| 근무일 산식 | "이미 갈라짐", 모듈 공유 | 결과 차이 0, 동기화 테스트 | 함수 단위 대조 결과 |
| Bundle budget | P2 (기준 부적합) | 해소됨, 항목 확충만 | 커밋 `7a2d381`·`36edce3`으로 이미 갱신 |
| Dashboard bulk endpoint | 추가 확인 필요 | 미사용 확정 | dynamic invoke 전수 확인 + 서비스 주석 근거 |
| 미사용 dependency | 후보 | 8종 확정 | 전역 import 검색. `react-apexcharts` 포함 |

1.0에서 **오탐으로 제외한 항목**(호환 re-export shim, 이름만 같은 `StatusBadge`, 순서가 의미 있는 `await` 루프)은 1.1에서도 그대로 유효하다.
