# 구독 편입 이슈 등록이력 보완 — 프론트엔드 구현 리포트

> 설계서: `_workspace/subscription-assigned-history/01_architect_design.md` §4 + §7 frontend (F1~F6)
> 백엔드 계약: `02_backend_report.md` §7 (프론트엔드에 전달할 사실)
> 구현일: 2026-08-11 / 브랜치 `develop`

**신규 페이지·라우트·스토어·쿼리키·권한 변경 없음.** `invoke` 신규 호출 없음(경계면은 resolver 응답이 아니라 이슈 프로퍼티 `movesRms`).

---

## 1. 수정 파일 목록

| F# | 파일 | 종류 | 요약 |
|----|------|------|------|
| F1 | `static/ui/src/utils/jiraApi/coworkerProperty.js` | 수정 | `ASSIGNED_VIA_SUBSCRIPTION` 상수 + `getIssueAssignedVia()` getter + 상단 스키마 주석 |
| F2 | `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` | 수정 | `assignedVia` export + `normalizeIssue` 필드 추가 + 주석 |
| F3 | `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx` | 수정 | 등록자 셀 3분기 |
| F4 | `locales/kr/taskHistory.json`, `locales/en/taskHistory.json` | 수정 | `table.assignedBySubscription` 추가 |
| F4 | `locales/ko-KR.json`, `locales/en-US.json` | **생성물** | `npm run merge` 산출 (직접 수정 안 함) |
| F5 | `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.test.js` | 수정 | `mkIssue`에 `via` 파라미터 + 마커 추출 케이스 1개 |

DB·manifest·`queryKey/`·`usePermissionStore` 관련 변경 **없음**.

---

## 2. 소비한 프로퍼티 shape (백엔드 리포트 §7 그대로)

```jsonc
issue.properties.movesRms = {
  "coworkers":     ["..."],
  "assignedAt":    "2026-08-11",                  // date-only (JQL 정렬용, 프론트는 미소비)
  "assignedAtIso": "2026-08-11T04:12:33.123Z",    // 표시용
  "assignedById":  "5b10a2...",                   // 수동 등록 경로만 (구독 편입 이슈엔 키 없음)
  "assignedVia":   "subscription"                 // 구독 편입 경로만, 값은 이 문자열 하나
}
```

- 마커 문자열은 `ASSIGNED_VIA_SUBSCRIPTION = 'subscription'` — 백엔드 `AssignedDateRecorder.ASSIGNED_VIA.SUBSCRIPTION`과 **글자 그대로 일치**.
- 구독 편입 이슈는 `assignedById` 키가 없으므로 `accountIds` 수집(`.filter(Boolean)`)에서 자연 탈락 → `useUserInfos` lookup 로직 **무변경**.
- 재편입 이슈(옛 `assignedById` 보존 + `assignedVia` 없음)는 사용자 우선 분기로 기존 아바타 유지.
- **접근 경로 불일치 없음.** 백엔드가 통지한 shape과 getter 경로(`properties.movesRms.assignedVia`)가 정확히 일치한다.

### 소비 경로 단일성 (설계 V7)
`assignedVia`를 읽는 지점은 `coworkerProperty.js:36-37`의 getter **하나뿐**이다. `TaskHistoryTable.jsx`·`taskHistory.transform.js` 모두 인라인 `issue.properties` 접근을 하지 않는다(`src` 전역 grep으로 확인 — 매치는 getter 정의 1건 + transform 경유 소비뿐).

---

## 3. 3분기 구현 위치 (파일:라인)

`static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx`

| 라인 | 내용 |
|------|------|
| 14 | `import SemanticBadge from '../../../components/lozenge/SemanticBadge';` |
| 15 | `import { ASSIGNED_VIA_SUBSCRIPTION } from '../../../utils/jiraApi/coworkerProperty';` |
| 129-131 | `rows` useMemo 내 `viaSubscription = it.assignedVia === ASSIGNED_VIA_SUBSCRIPTION` 판정 + 우선순위 주석 |
| 147-153 | `assignedBy` 셀 3분기 — `assignedUser`(UserAvatar) **>** `viaSubscription`(배지) **>** `-` |

우선순위는 설계 §2-3 고정 순서 그대로(사용자 > 구독 > `-`).
`assignedAt` 셀·`tracked` 판정·`accountIds`/`useUserInfos`·`buildJql`·`fetchPage` 등 **다른 로직은 한 줄도 건드리지 않았다.**

### 설계 대비 이탈 1건 — 배지 컴포넌트

| 항목 | 설계 | 구현 | 사유 |
|------|------|------|------|
| 배지 | `@atlaskit/lozenge` `appearance="default"` | `components/lozenge/SemanticBadge` `appearance="neutral"` | **`@atlaskit/lozenge`는 이 리포지토리에 설치돼 있지 않다** (`static/ui/package.json` 의존성 없음, `node_modules/@atlaskit/lozenge` 부재). 그대로 import 하면 빌드가 깨진다. 리포지토리에는 이 목적의 대체 컴포넌트가 이미 있고(`SemanticBadge.jsx:15` 주석 "`@atlaskit/lozenge` 미설치 환경용 경량 구현"), `resource` 화면 4곳에서 쓰이는 확립된 패턴이다. `appearance="neutral"`은 Lozenge `default`와 동일한 회색 톤(`color.background.neutral`)이라 `StatusComponent`와 색으로 경쟁하지 않는다는 설계 의도도 유지된다. 범위 외 의존성 추가(번들 예산 게이트 영향)를 피하기 위해 재사용 쪽을 택했다. |

툴팁(`assignedBySubscriptionTip`)은 설계 §6의 **선택 항목이라 미적용**(지시대로 과잉 방지). 키도 추가하지 않았다.

---

## 4. i18n

`locales/kr/taskHistory.json` / `locales/en/taskHistory.json`의 `table` 블록에 추가:

| 키 | kr | en |
|----|----|----|
| `table.assignedBySubscription` | `구독` | `Subscription` |

호출부: `t('taskHistory.table.assignedBySubscription')` (`TaskHistoryTable.jsx:151`).

**merge 실행: 완료.** `cd static/ui && npm run merge` (`locales/script/merge.js`) 실행.

반영 확인 (생성물 grep):
```
locales/ko-KR.json:2986:      "assignedBySubscription": "구독",
locales/en-US.json:2986:      "assignedBySubscription": "Subscription",
```
`ko-KR.json`/`en-US.json`은 **직접 수정하지 않았다** (merge 산출물).

---

## 5. F5 — 기존 테스트 영향

`taskHistory.transform.test.js`는 `normalizeIssue` 결과를 `toEqual`로 통째 비교하는 케이스가 **없어** 키 추가로 깨지는 기대값은 없었다(전 케이스 개별 필드 단언). 실제로 기존 9개 케이스 무수정 통과.

보강한 것은 최소 2가지:
- `mkIssue` 헬퍼에 `via = null` 파라미터 추가(기본값이라 기존 호출부 무영향)
- 케이스 1개 추가(`taskHistory.transform.test.js:99-109`) — 구독 이슈는 `assignedVia==='subscription'` & `assignedById===null`, 수동 이슈는 `assignedVia===null`. 셀 3분기가 의존하는 계약을 고정한다.

---

## 6. 테스트 / 빌드 결과

### 6-1. 프론트 전체 테스트 — 통과
```
cd static/ui && CI=true npm test
Test Suites: 66 passed, 66 total
Tests:       1110 passed, 1110 total
Snapshots:   1 passed, 1 total
Time:        17.31 s
```

### 6-2. taskHistory 단독
```
PASS src/pages/projectDetail/taskHistory/taskHistory.transform.test.js
Tests: 10 passed (기존 9 + 신규 1)
```

### 6-3. 빌드 — 통과 (번들 예산 내)
```
cd static/ui && CI=true npm run build
The build folder is ready to be deployed.

> bundle:check
{"file":"static/js/main.92f3ff04.js","rawBytes":3690963,"gzipBytes":895146,"budgetBytes":950000,"withinBudget":true}
```
경고는 CRA 상시 경고(bundle size 안내)뿐, 신규 경고·에러 없음. 의존성을 추가하지 않았으므로 번들 증가는 사실상 0.

---

## 7. 범위 밖 (하지 않은 것)

- **등록자 필터 관련 코드 없음** — 설계 §4-4 확인대로 `ProjectFilter`에 등록자 필터가 존재하지 않고, `TaskHistoryTable` 필터는 서버 JQL 경로라 클라이언트 필터를 넣을 자리가 없다.
- 툴팁 키/컴포넌트 미적용(선택 항목).
- `@atlaskit/lozenge` 의존성 추가 안 함(§3 이탈 사유).
- `buildBurnup`/`buildInsight`/`transformTaskHistory` 로직 무변경 — 구독 편입분이 `tracked`로 잡히는 것은 설계 §4-5의 의도된 부수 효과이며 코드 변경 없이 자동 반영된다.
- 과거 편입 이슈 소급 표시 없음(백엔드 미소급 — 배포 이후 편입분부터 배지가 보인다).
