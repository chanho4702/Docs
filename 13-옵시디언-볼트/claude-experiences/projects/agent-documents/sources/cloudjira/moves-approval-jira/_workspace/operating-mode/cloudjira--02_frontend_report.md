# 02 프론트 보고서 — 운영 모드(단독 / 워크포스 연동) 표시 분리

작성: 2026-10-12 frontend-engineer · 회차 1 · settings-design 과 같은 회차(같은 파일을 한 번에 고침)
전제: settings-restructure 미커밋 변경 위에서 작업(되돌리지 않음). 백엔드·manifest·엔트리·쿼리키 신규 없음.

## 결과 요약
- 모드 원천: `operatingModeOf(policy)` = `policy == null ? null : (policy.workforceLinkEnabled === true ? 'LINKED' : 'STANDALONE')`.
  **리더 지시(설계 §7·§8 갱신)에 따라 `!== false` 가 아니라 `=== true`** — 서버 `isWorkforceLinkEnabled()`·`getApprovalSettings` 정규화와 같은 규칙. `WorkforceLinkSettings` 의 `EnabledToggle` 도 `=== true`.
- 훅 `useOperatingMode({ enabled })` — `settingsKeys.policy()` 재사용(캐시 공유, 토글의 `setQueryData` 로 즉시 반영), `staleTime 5분`, `retry:false`. 실패·로딩·거부는 `null`(= 전부 보임).
- 단독 모드에서 접히는 요소 §2 전수 반영 + "켜져 있는데 무시 중" 경고 2종(Phase C on, foreignScope LINKED).
- 메뉴 배지: 설정 엔트리(`SettingsPage`)·업무함 설정 children(`InboxPage`, 설정 뷰일 때만 정책 조회) 둘 다.

## 소비하는 resolver · 접근 경로
| resolver | 소비처 | 접근 |
|---|---|---|
| `getApprovalSettings` (관리자 전용) | `useOperatingMode` → SettingsPage·InboxPage(view==='settings' 일 때만)·WorklogControlSettings·RecordRetentionSection·WorklogHistoryAuditSettings | `invokeApproval` 가 벗긴 정책 객체의 `.workforceLinkEnabled` (백엔드 보고서: 항상 boolean) |
| 〃 | `WorkforceLinkSettings`(기존 policy 쿼리) · `AuditPage RetentionNote`(기존 policy 쿼리) | `operatingModeOf(query.data)` |
| `saveApprovalSettings({workforceLinkEnabled})` | 기존 토글 그대로 | 응답으로 `setQueryData(settingsKeys.policy())` → 모든 소비처 갱신 |

## 바뀐 파일
| 파일 | 변경 |
|---|---|
| `static/ui/src/features/settings/operatingModeModel.js` (신규) | `OPERATING_MODES`, `operatingModeOf`(=== true), `isStandalone`, `operatingModeBadgeOf` |
| `static/ui/src/features/settings/useOperatingMode.js` (신규) | 훅 |
| `static/ui/src/features/settings/settingsNavigation.js` | `settingsNavigation(t, {mode})`·`settingsNavigationGroups(t, {mode})` — `workforce` 항목에만 `badge` |
| `static/ui/src/features/settings/SettingsPage.jsx` | `useOperatingMode({enabled:true})`, groups memo 의존성에 mode |
| `static/ui/src/features/inbox/InboxPage.jsx` | `useOperatingMode({enabled: view==='settings'})`, groups memo 의존성에 `operatingMode` |
| `static/ui/src/features/settings/WorkforceLinkSettings.jsx` | 토글 옆 모드 Lozenge(`workforce-mode`), 단독이면 `SectionMessage(information) workforce-standalone` + 펼치기 버튼(`workforce-status-expand`) 뒤에 상태·게시(재게시 포함)·수신·실패 섹션 |
| `static/ui/src/features/worklogControl/WorklogControlSettings.jsx` | PhaseTable `standalone` prop — Phase C 꺼짐: 켜기 버튼·관문 사유 대신 `wc-phase-C-linked-only` + 힌트 / 켜짐: `wc-phase-C-inactive` 경고. ForeignSettings: 저장값 `foreignScope==='LINKED'` 면 `wc-foreign-linked-inactive` 경고 |
| `static/ui/src/features/audit/AuditPage.jsx` | RetentionNote 워크로그 탭 — 단독이면 연결분 문구 생략 |
| `static/ui/src/features/settings/RecordRetentionSection.jsx` | 단독이면 `WORKLOG_HISTORY_LINKED` 카드를 한 줄(`record-WORKLOG_HISTORY_LINKED-collapsed`) + "그래도 보기"(`…-expand`) |
| `static/ui/src/features/worklogHistory/WorklogHistoryList.jsx` | `showLinked`(기본 true) prop — 이력 행·통제 행 둘 다 |
| `static/ui/src/features/settings/WorklogHistoryAuditSettings.jsx` | 모드로 `showLinked` 전달 |
| `locales/{kr,en}/workforce.json` | `mode.{linked,standalone,standaloneHint,showStatus,hideStatus}`, `notice.summary`(디자인 회차와 공용) |
| `locales/{kr,en}/worklogControl.json` | `mode.{linkedOnly,linkedOnlyHint,inactiveWhileStandalone,foreignLinkedInactive}`, `phase.reasonCount` |
| `locales/{kr,en}/data.json` | `retention.linkedCollapsed`, `retention.linkedShow` |

## 설계와 다르게 한 점 (이유)
1. **판정 `=== true`** — 설계 초판(§1)은 `!== false`. 리더 회차 중 지시(기본값 꺼짐, 설계 §7·§8)로 바꿨다. `{}`·`workforceLinkEnabled` undefined 정책은 이제 STANDALONE. 기존 테스트 `정책에 키가 없으면(옛 응답) 켬으로 본다` → `꺼짐(단독)으로 본다` 로 단언 갱신.
2. **메뉴 배지는 Lozenge 가 아니라 토큰 span**(`data-appearance` success/default, Lozenge 와 같은 색 토큰) — `settingsNavigation.js` 가 `@atlaskit/lozenge` 를 import 하면 jest 에서 lozenge 의 중첩 `@atlaskit/primitives`(xcss) 가 로드돼 `settingsNavigation.test.js`·`InboxPage.test.jsx` 스위트가 죽는다(실측: `TypeError: (0 , _xcss.xcss) is not a function`). 메뉴 모델이 UI 라이브러리를 끌고 오지 않게 span 으로. 화면 안 토글 옆 배지는 Lozenge(`workforce-mode`).
3. **연결분 보관 행**: 설계는 "한 줄로 접는다"만 있으나 요구 3("숨기지 않고 한 줄 안내 + 펼치기")에 맞춰 "그래도 보기" 버튼을 붙였다. 또 **`exportRequired`(기간 지남·미확정)인 연결분은 단독이어도 접지 않는다** — 요구 5 "숨겼는데 동작 중인 상태를 만들지 않는다".
4. **WorklogControlSettings 가 `getApprovalSettings` 를 읽게 됨** — 이 화면은 라이선스 INACTIVE 에서도 열리는 예외 화면이라 원래 정책을 안 읽었다. 모드만 훅으로 읽고 거부되면 null(전부 보임) — 화면 자체·현황·해제는 막히지 않는다(테스트로 고정). 파일 머리 주석 갱신.
5. **WorkforceLinkSettings 의 모드 null 분기 없음** — 이 화면은 정책 조회 실패 시 원래부터 에러 화면이다(바꾸지 않음). 모드 null fail-open 은 RecordRetention·WorklogControl 테스트로 고정.
6. 감사 > 워크로그 변경의 "워크포스 연결분만" 필터 체크박스는 설계 §2 표에 없어 손대지 않았다(단독에선 결과가 빈다 — 후속 검토 후보).

## 테스트
- 신규 `features/settings/__test__/operatingModeModel.test.js` 3건 (null→null, true→LINKED, `{}`/undefined/false→STANDALONE, 배지).
- `settingsNavigation.test.js` +1 (배지 유무·모양, workforce 에만).
- `InboxPage.test.jsx` +3 (설정 뷰 아니면 `getApprovalSettings` 미호출 / 단독 배지 / 거부 시 조용히 배지 없음).
- `WorkforceLinkSettings.test.jsx` +3·갱신 2 (단독 접힘·펼치기·저장 호출 없음 / 연동이면 그대로 / 키 없음=단독 / 토글로 끄면 접히고 펼치면 DISABLED).
- `WorklogControlSettings.test.jsx` +4 (단독+C 꺼짐 → 연동 전용·켜기 없음·사유 없음 + foreignScope LINKED 경고 / 단독+C 켜짐 → 무시 중 경고 / 연동 그대로 / 모드 모름(LICENSE_INACTIVE 거부) → 전부 보임, 화면 정상). 기본 backend 는 `{workforceLinkEnabled:true}` 로 명시.
- `RecordRetention.test.jsx` +3 (단독 접힘·저장 없음·펼치기 / exportRequired 는 안 접힘 / 연동·모드 모름은 그대로).
- `AuditTrail.test.jsx` +3 (RetentionNote 단독 생략·연동 포함 / 워크로그 변경 탭 배지 단독 숨김·연동 표시).

## 검증 결과
- `cd static/ui && CI=true npx jest` → **Test Suites 73 passed / Tests 614 passed** (회차 전 71/610 + 신규 스위트 2(components/settings) 포함).
- `cd static/ui && CI=false npm run build` → `Compiled with warnings.` — 경고는 `@atlaskit/analytics-next-stable-react-context` 소스맵 누락 2건과 `@atlaskit/react-select` postcss-calc 1건뿐, **우리 코드 eslint 경고 0**.
- 리포 루트 `npm run merge` → `locales\ko-KR.json 생성`, `locales\en-US.json 생성` (생성물은 git 미추적 확인).

## 미검증 (실기기)
- 개발 사이트에서 연동 끔 → 설정 메뉴 배지 "단독", 워크포스 연동 화면 접힘/펼침, 워크로그 통제 Phase C "연동 전용", 데이터 관리 연결분 한 줄 — 실제 iframe 에서 확인 필요.
- 비관리자(설정 관리자 아님)로 업무함을 열었을 때 `getApprovalSettings` 가 설정 뷰 진입 전에는 호출되지 않는지(네트워크 탭).
- 라이선스 INACTIVE 사이트에서 워크로그 통제 화면이 정책 거부에도 정상(전부 보임)인지.
- 접힌 메뉴(56px)에서 "연동 중/단독" 배지 위치(`.app-page--collapsed .app-nav-badge` 절대 배치)가 아이콘을 가리지 않는지.
