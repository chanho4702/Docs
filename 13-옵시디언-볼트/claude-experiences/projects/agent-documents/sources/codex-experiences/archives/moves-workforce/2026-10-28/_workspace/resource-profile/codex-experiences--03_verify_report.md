# Resource Profile — 통합 정합성 검증 리포트

> 검증자: integration-verifier. 방법: 생산자(resolver/service)↔소비자(invoke 훅/컴포넌트) **양쪽 동시 읽기** 교차 비교 + jest/build 실행.
> 결론: **경계면 불일치·회귀 0건. 전 항목 통과.** 실행 검증(백엔드 223 / 프론트 74 / build) 전부 성공.

---

## 통과 (PASS)

### P1. `getResourceProfile` 경계면 — 3필드 구분 소비까지 일치
- 생산자: `ResourceManagementService.js:222-233` → `content:{ profile, load, inProgressIssues, experience }`.
- 소비자: `useResourceProfile.js:24-29`(`res.success && res.content` 가드 후 `res.content` 반환), Drawer/카드/리스트가 각 필드 정확 경로 소비.
- **핵심 3필드 구분(inProgressIssues[])** — `InProgressIssueList.jsx:59-68`:
  - `remainingEstimateSeconds`(1인 몫) → 주 표기(line 61) ✓
  - `issueRemainingEstimateSeconds`(원본) → 보조 "공유" 표기의 {total}(line 65) ✓
  - `participantCount` → `>1` 게이트 + {count}(line 62,66) ✓
  - 생산자 필드명(`ResourceLoadFetcher.js:84-88`)과 정확히 대응. camelCase 일관.
- 실패 분기: `res.success===false` → throw → React Query `isError` → Drawer `SectionMessage`(`ResourceProfileDrawer.jsx:91-92`). ✓
- 부분성공(Jira 실패 시 빈 inProgressIssues + count 0)도 프론트가 빈배열 기본값(`useResourceProfile.js:37`)으로 안전 소비. ✓

### P2. `getResourceLoadSummary` 경계면 — 0건자 생략 ↔ Map 병합 + lazy 비차단
- 생산자: `ResourceManagementService.js:243-247` → `content:{ load:[{accountId,inProgressCount,remainingEstimateSeconds}], generatedAt }`. 0건자는 `fetchInProgressLoadByAccounts` Map 미포함 → 배열 생략. ✓
- 소비자: `useResourceLoadSummary.js:30-39` → `Map(accountId→{inProgressCount,remainingEstimateSeconds})` 변환, 미존재는 조회측(`ResourceOverviewTable.jsx:52-59`)에서 `load?.inProgressCount ?? 0` / `?? 0`으로 0 취급. ✓
- **lazy 비차단**: 테이블은 `isLoadPending`과 무관하게 즉시 렌더(`ResourceOverviewTab.jsx:123-130` 로딩 게이트는 `useResourceOverview`만; loadSummary는 배경), 미도착 셀은 `-`(`ResourceOverviewTable.jsx:52-55`). ✓

### P3. `getProjectSkillMatch` 강화 — candidate 2필드 추가·기존 회귀 없음
- 생산자: `ResourceManagementService.js:307-308` candidate에 `inProgressCount`/`remainingEstimateSeconds` 추가(기존 12필드 전부 유지, line 291-309).
- 소비자: `CandidateRankTable.jsx:60-64` 신규 2컬럼 소비, 기존 컬럼(util/coverage/matched/missing) 그대로. `useProjectSkillMatch.js`는 shape 무관(변경 없음). ✓
- 정렬 계약 일치: `rankCandidates`(`ResourceMatch.js:45-52`) coverage desc → util asc → remaining asc → inProgressCount asc → name. 백엔드 리포트·설계 §3.4와 동일. ✓

### P4. 서비스 내부 소비자 점검 (하네스 2026-07-13 회귀 교훈) — 회귀 없음
- `buildPeopleContext` 반환 shape(`{people,bands,lastAggregatedAt,aggregateStatus,skillMap}`)는 **변경 없음**. 내부 소비 3곳 전부 정합:
  - `getResourceOverviewService`(`:131`) 구조분해 4필드 ✓
  - `getResourceProfileService`(`:171,178`) `ctx.people.find` ✓
  - `getProjectSkillMatchService`(`:265,269`) `{people,skillMap}` ✓
- `getProjectSkillMatchService`/`fetchInProgress*` 전역 grep 결과 백엔드 내부 타 도메인 import 없음 — 컨트롤러 등록부(`:22`)와 서비스 자체 소비만 존재. 계약 변경(candidate 2필드)은 **순수 가산**이라 하위호환. ✓

### P5. 권한 정합 — 컨트롤러 등록 2 ↔ PermissionMap 2키
- 등록: `ResourceManagementController.js:19-20`(`getResourceProfile`,`getResourceLoadSummary` `guardedDefine`).
- 맵: `PermissionMap.js:209-210` 둘 다 `R('RESOURCE_MANAGEMENT')`.
- `test/permission/permissionMap.contract.test.js` 통과(등록집합 ↔ 맵키 대조) → deny-by-default 누락 없음. ✓
- 프론트 게이트: `useResourceProfile.js:19` / `useResourceLoadSummary.js:15` 모두 `canRead('RESOURCE_MANAGEMENT')`. 쓰기 없음. ✓

### P6. 쿼리키 팩토리 — 인라인 배열 없음
- `resourceKeys.js:8-9` `profile(accountId)`/`loadSummary()` 팩토리. 세 훅 전부 팩토리 참조(`useResourceProfile:22`, `useResourceLoadSummary:18`, `useProjectSkillMatch:12`). ✓

### P7. i18n — remainingTip 리네임·§6 전 키 코드·소스·merge 산출물 3중 일치
- **`match.remaining.tip`→`match.remainingTip` 리네임(프론트 이탈 2)**: nested JSON 충돌(leaf `match.remaining`과 부모 겸용 불가) 회피 목적. 일관성 확인:
  - 코드: `CandidateRankTable.jsx:35` `t('resource.match.remainingTip')` ✓
  - 소스: `locales/kr/resource.json:114`·`locales/en/resource.json:114` `remainingTip` leaf, `remaining` 별도 leaf(113) — 충돌 해소 ✓
  - merge 산출물: `ko-KR.json:1742`·`en-US.json:1742` `remainingTip` 반영 ✓
- 설계 §6 전 키 소스 존재 + merge 반영 확인(`ko-KR.json` `resource.profile.title` @1662 등, `en-US.json` 동일). t() 호출 키 ↔ 로케일 키 대조: `profile.*`/`col.inProgress`/`col.remaining`/`match.inProgress`/`match.remaining`/`match.remainingTip`/`issue.shared`/`load.tip`/`load.hours` 전부 매칭. 누락 0. ✓
- `ko-KR.json`/`en-US.json` 직접 수정 아님(merge 재생성). ✓

### P8. 프론트 이탈 1 — 커스텀 슬라이드 패널
- `ResourceProfileDrawer.jsx`: `@atlaskit/drawer` 미설치 대체. `role="dialog"`+`aria-modal="true"`(:55-56), overlay onClick 닫기(:47) + 닫기 버튼(:86, `aria-label`), 3섹션 구조(load/inProgress/experience :99-112) 설계대로. 빌드 무결(신규 파일발 경고·에러 0). ✓
- 헤더 즉시표기(fallbackPerson, :41,74-84)로 온디맨드 지연 완화 — 기능 손상 없음. ✓
- 행 클릭 드로어 오픈 wiring: `ResourceOverviewTable.jsx:63` `onClick`(row) → DynamicTable 네이티브 지원(`CommonTable.jsx:11` 주석·pass-through 확인), 스킬편집 버튼 `stopPropagation`(:89)으로 오작동 방지. ✓

### P9. 성능 패턴 — 전 항목 준수
- **공통 워크로그/이슈 페처 미수정**: 신규 `ResourceLoadFetcher.js`로 격리(파일 헤더 명시, 공통 페처 grep상 무변경). [[feedback-worklog-fetch-isolation]] 준수. ✓
- **가동률 rollup 1회 read 재사용**: `buildPeopleContext:61` `getRollupMeta()` 1회, 신규 워크로그 페치 없음. ✓
- **N+1 아님**: `getProjectSkillMatchService:273` 후보 전원 배치 1회(`fetchInProgressLoadByAccounts`), 50청크+`p-limit(3)`(`ResourceLoadFetcher.js:25-26,182`). ✓
- **asApp 미사용**: 페처 A/B 모두 `as:'user'`(`ResourceLoadFetcher.js:69,130`). [[feedback-no-asapp]] 준수. ✓

### P10. 실행 검증
- 백엔드 `npm test`: **14 suites / 223 tests 통과**(rankCandidates 부하 tiebreaker 4케이스 + permissionMap.contract 포함, `ResourceMatch.test.js:96-133`). ✓
- 프론트 `CI=true npm test`: **8 suites / 74 tests 통과**(회귀 없음). ✓
- 프론트 `CI=true npm run build`: **Compiled with warnings** — 경고는 사전존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐, 신규/수정 파일발 에러·경고 0. "build folder is ready". ✓

---

## 미검증 (NOT VERIFIED) — 런타임 필요

- **실제 Jira `/rest/api/3/search/jql` POST 응답**: 정적 검증만 수행. `postJiraJson` 시그니처(`RequestJiaJson.js:77` `{as,url,body,fallback,logPrefix}`) ↔ 호출부(`ResourceLoadFetcher.js:129-135`) 인자 일치는 확인했으나, 실 엔드포인트가 `nextPageToken`/`properties=movesRms` body 파라미터를 기대대로 반환하는지는 배포 환경 E2E 필요.
- **`issue.properties.movesRms.coworkers` 실데이터 형상**: 팀 관리형/클래식 프로젝트에서 프로퍼티 반환 구조가 `computeShare`(`:34`)의 `properties[MOVES_PROPERTY_KEY]?.coworkers` 경로와 일치하는지 실이슈로 확인 필요(설계 §3.1 가정). 코드 경로·폴백(빈배열)은 정합.
- **Forge i18n nested key 해석**: merge 산출물이 nested JSON이고 `t()`가 `@forge/bridge` `createTranslationFunction`(`useI18nStore.js:8`)라 dotted 키 traversal은 기존 프로덕션 패턴(`resource.overview.summary.total` 등) 동작으로 신뢰하나, 신규 키의 실런타임 표기는 배포 후 확인 권장.

---

## 관찰 사항 (실패 아님, 정보성)

1. **`resource.match.load` 미소비 키**: 소스/merge에 존재(`match.load`="현재 부하")하나 어느 컴포넌트도 `t('resource.match.load')` 호출 안 함(CandidateRankTable은 inProgress/remaining/remainingTip만 사용). 설계 §6에 나열된 키라 무해한 잉여 키. 정리 여부는 선택.
2. **Drawer ESC 미지원**: 프론트 리포트가 명시한 의도적 이탈(overlay/닫기버튼 대체). `role=dialog`+`aria-modal`은 있으나 focus-trap/ESC는 없음 — 경계면 버그 아님, 접근성 후속 개선 여지.

---

## 종합 판정

**통과.** 백엔드 응답 shape 3종과 프론트 소비 경로가 필드명·중첩·래핑 단계까지 완전 일치하며, 서비스 내부 소비자 회귀·권한 누락·성능 위반·i18n 누락 모두 없음. 프론트 이탈 2건(커스텀 패널, remainingTip 리네임)은 계약을 깨지 않는 안전한 구현으로 확인. 재작업 지시 사항 없음. 잔여 항목은 배포 환경 E2E(미검증 3건)로만 확정 가능.
