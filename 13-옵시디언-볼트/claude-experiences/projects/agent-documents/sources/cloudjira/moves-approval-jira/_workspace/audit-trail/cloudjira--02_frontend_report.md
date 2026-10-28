# 02 프론트 보고서 — audit-trail

작성: 2026-10-10 · frontend-engineer · 입력 `01_architect_design.md`(§7·§8) + `02_backend_report.md`(응답 shape 원천) · 회차 1
열린 질문 Q112~Q118 은 설계서 기본 가정 그대로(탭 분리·관리자만·보관 그대로 등).

## 결과 요약

| 항목 | 결과 |
|---|---|
| `npm run merge` | 통과(ko-KR.json·en-US.json 생성, 두 언어 키 집합 일치) |
| `npm run test:ui -- --runInBand` | **54 suites / 466 tests 전부 통과** (신규 2 suites: `features/audit/__test__/AuditTrail.test.jsx` 23건, `auditI18n.test.js` 2건) |
| `npm run build:ui` | 성공 — "Compiled with warnings" 는 기존 경고뿐(`@atlaskit/analytics-next-stable-react-context` source map, `react-select` postcss-calc). 감사 파일 경고 없음 |
| 엔트리 | 추가 없음(설정 화면 `settings`·업무함 설정 패널 안) — craco·public·manifest 무변경 |
| `src/` | 손대지 않음 |
| 커밋·배포 | 안 함 |

## 1. 소비하는 resolver ↔ 접근 경로

`invokeApproval` 이 `content` 를 벗겨 주므로 아래는 전부 `res.content` 기준(이중 접근 없음).

| resolver | 호출 위치 | payload | 소비 필드 |
|---|---|---|---|
| `listApprovalAudit` | `ApprovalAuditTab`(useInfiniteQuery, `auditKeys.approval(applied)`), `exportApprovalAuditExcel` | `{from,to}`(정수 ms) + `actorAccountId?`·`requesterAccountId?`·`projectId?`·`targetKinds?`·`eventTypes?` + `limit:50`(화면)/`200`(엑셀) + `cursor` | `items[].{eventId,eventType,occurredAt,actorAccountId,delegateAccountId,reason,step.{order,name},request.{requestId,targetKind,title,issueId,issueKey,subjectAccountId,periodKey,requesterAccountId,status}}`, `hiddenCount`, `nextCursor`, `users[id].{displayName,avatarUrl,accountType}` |
| `listCertificationAudit` | `CertificationAuditTab`(`auditKeys.certification(applied)`), `exportCertificationAuditExcel` | `{from,to}` + `actorAccountId?`·`subjectAccountId?`·`periodKey?`·`modes?`·`selfOnly?`·`outcomes?` + `limit:25`(화면) / 엑셀 `includeItems:true, limit:10` | `items[].{batchId,createdAt,actorAccountId,subjectAccountId,selfCertified,periodKey,mode,pinVerified,itemCount,current.{certified,mismatch,deleted,superseded,certifiedSeconds},outcome}`, `filteredCount`, `nextCursor`, `users`, (엑셀) `itemsByBatch`, `hiddenCount` |
| `getCertificationBatchAudit` | `CertBatchItems`(펼침, `auditKeys.certBatch(batchId)`) | `{batchId}` | `items[].{worklogId,issueId,issue.{issueKey,summary},certifiedStarted,certifiedSeconds,countedSeconds,state,stateChangedAt,selfCertified,frozen.{firstSeconds,editCount,signals,lateDays}}`, `hiddenCount` |
| `listWorklogHistory`(가산) | `WorklogHistoryAuditSettings`(감사 > 워크로그 변경) | 기존 + `linkedOnly:true`(체크 시에만) | 기존 + `items[].workforceLinked`, `users[id].accountType` |
| `listSettingsAudit` | `AuditSettings`(감사 > 설정 변경), `exportSettingsAuditExcel` | `{cursor}`(무변경) | 무변경 |
| `getRetention` / `getWorklogHistoryRetention` | `AuditPage` 의 탭별 보관 안내(결재·워크로그 탭일 때만 enabled, 기존 쿼리키 재사용) | `{}` | `years` / `months`(0 = 무기한) |
| `get/saveApprovalSettings` | `TimesheetPolicySettings` | patch 에 `worklogHistoryScope` 가산 | 동일 키 |

- **정수 epoch ms**: 모든 기간은 `auditRangeModel.rangePayloadOf` → `new Date(y,m,d).getTime()` 정수. 테스트가 `Number.isInteger`·`typeof number` 를 단언. 366일 경계(366 통과·367 거부) 테스트 있음.
- **outcomes 후처리 쪽 비움**: 인증 탭은 `items` 가 비어도 `nextCursor` 가 있으면 "더 보기"를 그대로 보이고 빈 문구를 `audit.emptyPageHasMore`("이 쪽에는 보여 줄 기록이 없습니다. 더 보기로 이어서…")로 바꾼다. 결재 탭(hiddenCount 로 쪽이 빌 때)도 같다. 내보내기 버튼도 "불러온 행 0 + 다음 쪽 있음"이면 켜 둔다. 엑셀 반복은 빈 쪽을 건너 커서를 따라간다(테스트).
- **hiddenCount / filteredCount 안내**: 결재 탭 `aa-hidden`(쪽 합계), 인증 탭 `ca-filtered`(쪽 합계), 펼침 `cert-batch-hidden-*`, 인증 엑셀 hiddenCount 결과 문구. 엑셀 시트 제목 줄에 뺀 건수·상한 도달을 적는다.
- **에러 분기**: `error.code` 로만. `INVALID_TARGET` + `cause.field ∈ {from,to}` → 기간 문구, `periodKey` → 월 문구, 그 밖 `error.<code>`.

## 2. 화면 구성

```
설정 > 감사 (settingsNavigation 'audit', 라벨 "감사"/"Audit")
  AuditPage  — @atlaskit/tabs: 결재 | 인증 | 워크로그 변경 | 설정 변경 (탭 내용은 importWithReloadOnce lazy 청크)
    머리: 제목·안내 + 탭별 보관 기간(결재 {years}년·인증 무기한·워크로그 {months}개월·설정 1년)
    ApprovalAuditTab        필터 기간·행위자·요청자·프로젝트·종류·결과 / CursorPagingTable / 행 제목 → 승인 상세 모달(main/modal, intent detail)
    CertificationAuditTab   필터 기간·인증자·대상자·대상 월·방식(+본인만)·결과 / 묶음 카드 + 펼침 CertBatchItems
    WorklogHistoryAuditSettings (embedded)  기존 화면 + "워크포스 연결분만"(linkedOnly) + 행 워크포스 배지·앱 계정 배지
    AuditSettings (embedded)                기존 화면 + 엑셀 + 행 링크
```

- **같은 사람·같은 기간 링크**(`SamePersonLinks`): 결재 행(대상자/요청자) → 인증·워크로그 변경 / 인증 묶음(대상자) → 결재·워크로그 변경 / 워크로그 행(작성자) → 결재·인증 / 설정 행(행위자) → 결재(행위자 필터). 기간 키가 있는 행(타임시트·인증)은 **기간 시작 ~ min(오늘, 시작+365일)**(늦은 승인·인증·수정까지 보이게), 없는 행은 지금 탭의 검색 기간, 설정 행은 그 달. 인증 탭으로 갈 때 월 키면 대상 월 필터도 채운다. 대상 탭은 씨앗 nonce 로 다시 마운트해 초기 필터로 바로 조회한다.
- **행위자 표시**(`ActorCell`): `accountType === 'app'` 일 때만 "앱 계정" 배지(모르면 단정하지 않음), 계정 없으면 결재는 "시스템", 그 밖 "알 수 없음". 대리 결재(`delegateAccountId` ≠ `actorAccountId`)는 "명의자 (누른 사람 대리)".
- **인증 건 상태**: 감사 응답의 `DELETED` → 인증 화면 `CertStateBadge` 의 `DELETED_AFTER_CERT` 로 매핑해 재사용, `SUPERSEDED` 는 감사 전용 배지. 신호는 `SignalBadges`(frozen 을 summary 로) 재사용.
- **URL**: 업무함 설정 패널은 `setting=audit&auditTab=<approval|certification|worklog|settings>`. 옛 링크 `setting=worklogHistory` 는 `setting=audit&auditTab=worklog` 로 replace. 감사 탭 변경은 `replace:true`(뒤로 가기로 탭 이력을 쌓지 않음). 독립 `settings` 엔트리는 화면 안 상태만.
- **수집 범위 정책**: 타임시트 정책 > 워크로그 이력에 `worklogHistoryScope` Select(3값, 기본 `PROJECT_OR_LINKED`) + 안내 + `LINKED_ONLY` 경고.

## 3. 엑셀 내보내기

| 탭 | 함수 | 반복 | 상한 |
|---|---|---|---|
| 결재 | `exportApprovalAuditExcel` | `limit 200` | 10,000행, 초과 시 capped |
| 인증 | `exportCertificationAuditExcel` | `includeItems:true, limit 10` — 건마다 한 줄, 보이는 건이 0인 묶음은 요약 한 줄 | 10,000행 |
| 워크로그 변경 | 기존 `exportAuditHistoryExcel`(filters 에 linkedOnly 포함) — 시트에 "워크포스" 칼럼, 행위자 앱 계정 표기 추가(issueId·projectId 는 끝 2칸 유지) | `limit 200` | 10,000행 |
| 설정 변경 | `exportSettingsAuditExcel` — 서버가 50건 고정이라 50건씩, 이름은 `loadUsersByAccountIds` | — | 10,000행 |

**서버 세션 패턴**은 확인했고 쓰지 않았다: `exportExpiredWorklogHistory`·결재 보관 내보내기의 `sessionId` 는 "내보낸 자료만 지운다"를 보장하는 삭제 허가용이다. 감사 내보내기는 읽기 전용이라 확정(confirm) 단계가 없다.

## 4. 쿼리키

`utils/queryKey/approvalKeys.js` 에 `auditKeys = { all, approval(filters), certification(filters), certBatch(batchId) }` 추가(파일 끝에 덧붙임 — 다른 에이전트의 `worklogCertKeys` 미커밋 변경과 겹치지 않음). 워크로그 변경·설정 변경 탭은 기존 `worklogHistoryKeys.audit`·`settingsKeys.audit`, 보관 안내는 기존 `settingsKeys.retention`·`worklogHistoryRetention`. 감사는 읽기 전용이라 무효화 없음.

## 5. i18n

- 신규 `locales/{kr,en}/audit.json` — 설계 §8.1 키 + 구현 중 필요한 키: `retention.approvalUnlimited`·`worklogUnlimited`, `filter.monthInvalid`, `loading`, `emptyPageHasMore`, `approval.stepOrder`, `cert.summary`·`current`·`expand`·`collapse`, `cert.item.{issue,started,counted,state,stateChangedAt,frozen,signals,empty}`, `excel.{settingsSheet,delegate,issueKey,period,status,worklogId,editCount,yes}`.
- `worklogHistory.json` 가산: `audit.filter.scope`·`audit.filter.linkedOnly`, `badge.linked`·`badge.linkedHint`, `policy.scope`·`policy.scopeHint`·`policy.linkedOnlyWarning`, `scope.{PROJECT,PROJECT_OR_LINKED,LINKED_ONLY}`.
- `policy.json`: `settings.tab.audit` 값 "변경 이력"/"Change log" → "감사"/"Audit". `settings.tab.worklogHistory` 는 남김(값 무변경).
- `error.json` 무변경(새 에러 코드 없음). 기존 파일은 CRLF·2칸 들여쓰기 그대로(재직렬화가 바이트 동일함을 확인 후 수정).
- `auditI18n.test.js` 가 감사 화면 리터럴 키 + 동적 키(탭·이벤트·종류·방식·결과·범위·상태)를 두 사전에 대조.

## 6. 변경 파일

신규: `static/ui/src/features/audit/{AuditPage.jsx, ApprovalAuditTab.jsx, CertificationAuditTab.jsx, CertBatchItems.jsx, ActorCell.jsx, AuditFilters.jsx, auditModel.js, auditRangeModel.js, exportAuditExcel.js}`, `features/audit/__test__/{AuditTrail.test.jsx, auditI18n.test.js}`, `locales/{kr,en}/audit.json`
수정: `features/settings/{settingsNavigation.js, SettingsPage.jsx, AuditSettings.jsx, WorklogHistoryAuditSettings.jsx, worklogHistoryAuditModel.js, TimesheetPolicySettings.jsx}`, `features/worklogHistory/{WorklogHistoryList.jsx, exportWorklogHistoryExcel.js}`, `features/inbox/InboxPage.jsx`(설정 패널 auditTab 배선만), `utils/queryKey/approvalKeys.js`(끝에 추가), `locales/{kr,en}/{worklogHistory,policy}.json`

`InboxPage.jsx`·`approvalKeys.js` 는 착수 전부터 다른 작업의 미커밋 변경이 있던 파일이다 — 해당 줄만 고쳤다. 커밋 시 경로·hunk 단위 스테이징 필요.

## 7. 설계 대비 차이

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| F1 | 감사 머리에 시간 추적 제공자 상태 한 줄(`provider.active/inactive`, "TimeTrackingProviderGuide 가 이미 쓰는 상태 조회 재사용") | **넣지 않음**, 키도 만들지 않음 | 그런 조회가 없다 — `TimeTrackingProviderGuide` 는 안내문만 두고 실제 선택 여부 조회는 P13 미검증이라 일부러 안 한다고 주석에 적혀 있다. 근거 없는 상태 표시를 만들지 않음 |
| F2 | 수집 범위 RadioGroup | `@atlaskit/select` | `@atlaskit/radio` 미설치. 패키지 추가 없이 기존 Select 패턴 |
| F3 | 인증 탭 표 + 행 펼침 | 묶음 **카드** + 카드 안 펼침(건별 표는 `CommonTable`) | DynamicTable 은 행 펼침이 없다. 워크로그 변경 탭(`WorklogHistoryList`)과 같은 카드형 |
| F4 | `CertBatchItems` 건마다 "이 워크로그 변경 이력" 링크 | 묶음 카드의 "같은 사람·같은 기간 → 워크로그 변경" 하나 | 이력 검색에 워크로그 id 필터가 없어 건별 링크도 결국 같은 (대상자·기간) 필터가 된다 |
| F5 | 결재 행 클릭 → 상세 모달 | 대상 칸의 제목 버튼 → 상세 모달(3회차: TIMESHEET·WORKLOG_CREATE·WORKLOG_CERTIFICATION 은 버튼 없이 글자) | 행 전체 클릭은 행 안의 링크 버튼과 충돌 |
| F6 | `AuditFilterBar.jsx` | `AuditFilters.jsx`(`UserFilter`·`ProjectFilter`·`PeriodFields`·`FilterField`·`auditErrorText`) | 탭마다 필터 칸 구성이 달라 바(bar) 하나보다 조각이 맞았다. `WorklogHistoryAuditSettings` 의 두 필터를 여기로 추출해 같이 쓴다 |
| F7 | — | 설정 변경 탭에도 엑셀 | 요구 "각 탭 엑셀". 2회차부터 기간·행위자 필터 그대로 내보낸다 |
| F8 | — | 탭 이동 시 이전 탭 필터는 유지되지 않음(활성 탭만 마운트) | 탭 lazy 로드와 iframe 메모리. 링크 이동은 필터를 넘긴다 |

## 8. 백엔드 요청(화면이 가공하지 않고 남긴 것)

1. ~~**`listSettingsAudit` 에 기간 필터·`users` 맵**~~ — 백엔드 2회차로 반영, 프론트 2회차 절 참조. 원 요청: 지금은 기간 없이 50건 고정이고 이름을 따로 `resolveUsers` 해야 한다. 다른 세 탭과 달리 설정 변경 탭만 기간 검색·같은 기간 이동의 대상이 될 수 없다(설정 행 → 결재 링크만 둠).
2. (확인 완료, 요청 아님) 감사 응답의 `users` 는 결재·인증 모두 `WorklogHistoryService.userMapOf` 를 써서 `accountType` 이 실린다(`src/resolver/audit/{ApprovalAuditService,CertAuditService}.js`). D11 의 "무변경"은 인증 화면(`WorklogCertService`) 쪽 이야기다.
3. **`listWorklogHistory` 의 문자열 기간 허용**(백엔드 "발견"): 프론트는 정수만 보내므로 문제 없음. 서버 규칙 통일은 백엔드 판단.

## 9. 테스트 목록(신규)

`AuditTrail.test.jsx` — 입력 모델(정수 ms·빈 조건 생략·366일 경계·월 형식·linkedOnly·옛 링크·기간 키/ISO 주·늦은 처리 범위·씨앗 적용·쿼리키) / 결재 탭(첫 payload `limit 50`, 대리·앱 계정·hiddenCount, 빈 쪽 + nextCursor 더 보기와 내보내기, 링크 씨앗·상세 모달, INVALID_TARGET 기간 문구) / 인증 탭(filteredCount, 빈 쪽 더 보기, 펼침 호출·DELETED 배지 매핑·hiddenCount, 월 형식 검색 막기) / 엑셀(결재 상한·capped·hidden 합계, 인증 includeItems·빈 쪽 이어 받기·묶음 한 줄, 건별 행) / AuditPage(탭 4개, 보관 안내, 링크로 인증 탭 필터 이전·onTabChange, 옛 링크 → 워크로그 변경) / 워크로그 변경(linkedOnly payload, 워크포스·앱 계정 배지).
`auditI18n.test.js` — kr/en 키 대조.

---

## 2회차 (2026-10-10) — 설정 변경 탭을 다른 탭과 같게

입력: `02_backend_report.md` 2회차 절 — `listSettingsAudit` 가 선택 입력 `from`·`to`(정수 ms, 함께, ≤366일)·`actorAccountId` 를 받고 응답에 `users` 를 준다.

| 항목 | 내용 |
|---|---|
| 필터 | `AuditSettings` 에 기간(기본 오늘 포함 30일)·행위자(`UserFilter`) + 검색 버튼. payload 는 `settingsPayloadOf` — `{from,to}` 정수 ms 를 **늘 함께** 보내고 `actorAccountId` 는 골랐을 때만. 366일 초과는 화면에서 막고 서버 `INVALID_TARGET {field}` 는 `auditErrorText`(기간 문구) |
| 사람 표시 | 응답 `users` 로 `ActorCell` — 이름·아바타·`accountType==='app'` 이면 "앱 계정" 배지, `actorKey` 없으면 "시스템". **`loadUsersByAccountIds` 별도 조회 제거** |
| 링크 수신 | `applySeed(…, 'settings')` → `actorAccountId`. 결재 행(행위자)·인증 묶음(인증자)·워크로그 행(변경한 사람) → 설정 변경 탭 링크 추가. 설정 행 → 결재·인증(행위자 역할, 지금 검색 기간) |
| 엑셀 | `exportSettingsAuditExcel({ filters })` — 필터 그대로 커서 반복(50건 고정), 이름은 쪽 `users`(앱 계정 표기), 시트 제목에 기간, 10,000 상한 |
| 쿼리키 | `settingsKeys.auditSearch(filters)` = `['settings','audit', filters]` 추가 — 기존 `settingsKeys.audit()` 무효화(PeriodClose·WorkforceLink 저장 후)가 접두로 계속 맞는다 |
| i18n | 새 키 없음(기존 `audit.filter.*`·`audit.actor.*` 재사용) — merge 무변경 |

검증:
- `npm run test:ui -- --runInBand`: **54 suites / 471 tests 통과**(+5: 설정 payload·키 접두 / 기본 조회·users 배지·시스템 / 씨앗 수신·행 링크 / 결재 → 설정 링크 이동 / 엑셀 필터·users)
- `npm run build:ui`: 성공(기존 경고만 — Atlaskit source map, react-select postcss-calc)
- `src/` 무수정

변경 파일: `static/ui/src/features/settings/AuditSettings.jsx`(재작성), `features/audit/{auditModel.js, exportAuditExcel.js, ApprovalAuditTab.jsx, CertificationAuditTab.jsx}`, `features/settings/WorklogHistoryAuditSettings.jsx`(링크 대상 추가), `utils/queryKey/approvalKeys.js`(`auditSearch` 한 줄), `features/audit/__test__/AuditTrail.test.jsx`

남은 백엔드 요청: 없음.

---

## 3회차 (2026-10-10) — 검증 지적 반영(`03_verify_report.md`)

| # | 지적 | 수정 |
|---|---|---|
| 1 | 결재 감사의 모든 행 제목이 상세 모달 버튼 → `getApprovalDetail` 이 종류별로 열람을 다시 판정해 관리자에게 TIMESHEET(본인·참여자·팀장)·WORKLOG_CREATE(이슈 열람+참여자)·WORKLOG_CERTIFICATION(제한 공개 워크로그) 상세가 막힌다 | `auditModel.DETAIL_BLOCKED_KINDS` + `canOpenDetail(request)`. 이 세 종류는 제목을 **글자**(`approval-audit-title-<requestId>`)로만 보이고 모달을 만들지 않는다 — 종류 배지·이슈 키·기간 키는 감사 행에 이미 있는 정보 그대로. ISSUE·ISSUE_TRANSITION·FIELD_CHANGE 는 기존대로 버튼 → `main/modal` intent detail |
| 2 | 인증 묶음 요약의 `certifiedSeconds` 라벨 "인증 시간" | `audit.cert.column.seconds` "인증 당시 시간"/"Time at certification", `audit.cert.summary` "{count}건 · 인증 당시 시간 {time}"/"{count} items · time at certification {time}". 새 키 `audit.cert.secondsHint`("삭제·변경 처리 정책(KEEP/ZERO)에 따라 현재 인증 집계와 다를 수 있습니다") — 묶음 요약 툴팁 + 인증 탭 보조문(`ca-seconds-hint`) 두 곳. 엑셀 칼럼 머리도 같은 키라 함께 바뀜 |

테스트 추가: 종류 6개 × 상세 버튼 유무(`it.each` — 열리는 종류는 Modal context `{intent:'detail', requestId, issueId}` 단언, 막힌 종류는 버튼 없음·글자·Modal 미호출), 기존 링크 테스트의 TIMESHEET 행은 버튼 없음 단언으로 바꿈, 인증 탭 보조문 단언.

검증:
- `npm run merge`: 통과(kr/en 키 집합 일치)
- `npm run test:ui -- --runInBand`: **54 suites / 477 tests 통과**(+6)
- `npm run build:ui`: 성공(기존 경고만)
- `src/` 무수정

변경 파일: `static/ui/src/features/audit/{auditModel.js, ApprovalAuditTab.jsx, CertificationAuditTab.jsx, __test__/AuditTrail.test.jsx}`, `locales/{kr,en}/audit.json`
