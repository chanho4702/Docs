# field-change-approval — 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-04 · autopilot 무인 회차(재작업 아님)
> 입력: `01_architect_design.md` §2·§7·§8, `02_backend_report.md`(응답 shape·D1~D10·i18n 목록 — 설계와 다르면 이쪽을 따름), `src/resolver/fieldChange/*`·`src/domain/fieldChange/*` 실물 확인
> 금지 준수: `forge` 명령·git 조작 없음, `src/` 백엔드 수정 없음, 리포 밖 수정 없음.

## 결과

| 대상 | 명령 | 결과 |
|---|---|---|
| locales | `npm run merge` | 통과(`ko-KR.json`·`en-US.json` 생성, 두 언어 키 집합 일치) |
| 프론트 | `npm run test:ui -- --runInBand` | **42 스위트 / 340 테스트 통과**(기준선 35 / 284 → +7 스위트, +56 테스트) |
| 백엔드 | 리포 루트 `npx jest` | **89 스위트 / 1277 테스트 통과**(백엔드 보고서와 동일, 무변경) |
| 빌드 | `npm run build:ui` | 성공("Compiled with warnings" — node_modules 의 source map 2건·`@atlaskit/react-select` postcss-calc 1건, 우리 코드 경고 없음) |

번들(gzip, 빌드 전 → 후): issue 엔트리 **7.7KB → 10.9KB**(+3.2KB, C22), modal 25.1KB → 29.3KB(상세 헤더·결정 안내), projectSettings 9.6KB → 11.0KB. 요청 폼(`FieldChangeRequestForm`)은 lazy 청크(`importWithReloadOnce`)로 분리됨.

## 엔트리·manifest

추가 없음(설계 §7.1). craco ENTRIES·`public/*.html`·manifest 모두 무변경. 기존 `issue`·`modal`·`projectSettings` 엔트리 안에서 분기.

## 변경 파일

신규 `static/ui/src/features/fieldChange/`
- `fieldChangeApi.js` — resolver 래퍼 8개
- `fieldChangeModel.js` — 상태 배지·행 동작·적용 결과 안내(`decisionNotice`·`applyNotice`)·값 표시·폼 검증·일괄 요약(순수)
- `useApplyFieldChange.js` — 다시 적용 훅(성공·실패 후 `fieldChangeKeys.all`·`approvalKeys.detail/history` 무효화, `FIELD_CHANGE_APPLY_IN_PROGRESS` 는 2초 뒤 재조회)
- `FieldChangeSection.jsx`(상시 로드) · `FieldChangeRow.jsx` · `FieldChangeStateLozenge.jsx` · `FieldValueText.jsx` · `FieldBypassList.jsx`
- `FieldChangeRequestForm.jsx`(lazy) · `FieldChangeValueInput.jsx`
- `FieldChangeTargetHeader.jsx` · `FieldChangeRuleSettings.jsx` · `FieldChangeRuleFormModal.jsx`
- `__test__/` 7개: `fieldChangeModel`(F1·F5) · `FieldChangeSection`(F2) · `FieldChangeValueInput`(F3) · `FieldChangeRequestForm` · `FieldChangeTargetHeader` · `FieldChangeRuleSettings` · `fieldChangeI18n`

변경
- `utils/queryKey/approvalKeys.js` — `fieldChangeKeys`(설계 §7.3 그대로)
- `entries/issue.jsx` — 필드 행 [변경 요청] → 모달 intent `fieldChangeRequest`+`fieldId`, onClose 무효화에 `fieldChangeKeys.issue(issueId)`
- `entries/modal.jsx` — lazy 폼, `FieldChangeModalFlow`, 종류 선택 화면의 `fieldChangeRequest` 화면, 상세의 FIELD_CHANGE 재요청 → 필드 폼, 승인 응답 `apply` → 결과 안내 화면(Q100), `FIELD_CHANGE_CONFLICT` → 상세·필드 캐시 재조회, finish 에 `fieldChangeKeys.all`
- `entries/projectSettings.jsx` — 전환 규칙 아래 `FieldChangeRuleSettings`
- `features/transition/transitionModel.js` — `resolveModalTarget` 에 `fieldChangeRequest` → `{flow:'fieldChange', issueId, fieldId}`(fieldId 없으면 overview)
- `features/issueApproval/IssueApprovalOverview.jsx` — 세 번째 칸
- `features/detail/ApprovalDetail.jsx` — `FieldChangeTargetHeader`, 타임라인 이벤트 색·배지 3종, reason 번역(WRITE·ALREADY·BYPASS·FIELD_CHANGED·적용 코드 7)
- `features/inbox/{InboxTable,exportInboxExcel,BulkApproveBar,InboxPage}` — 행 "필드: 이전 → 새", 유형 라벨, 엑셀 열, 일괄 결과 적용 대기/적용 안 됨
- `features/notification/NotificationPanel.jsx` — `{title}` = "제목 · 필드 이름"
- `features/certificate/{CertificateSheet,exportCertificatePdf}` — 최상위 `fieldChange` 블록 행 4개, `appliedBy` 이름 해석
- `features/settings/{AuditSettings,exportRetentionExcel}` — 영역 배지, 보관 엑셀 유형·제목
- 기존 테스트 보강: `IssueApprovalOverview.test`(세 번째 호출), `transitionModel.test`(F4), `CertificateSheet.test`, `InboxTable.test`, `NotificationPanel.test`
- locales: 신규 `kr/fieldChange.json`·`en/fieldChange.json`, 추가 `error`·`notification`·`state`·`policy`·`cert`·`inbox`·`detail`·`issueApproval`

## 백엔드 shape 소비 경로

| resolver | 소비 위치 | 읽는 경로(invokeApproval 이 `content` 를 벗긴 값) | 쿼리키 / 무효화 |
|---|---|---|---|
| `getIssueFieldChanges` | `FieldChangeSection` | `notEnabledReason`, `fields[].{ruleId,fieldId,fieldName,fieldType,current,flowMissing,latest,state,canRequest,canApply}`, `latest.{requestId,applyStatus,applyCode,from,to}`, `history[]`(FieldChangeSummary), `bypass[].{bypassId,fieldId,fieldName,from,to,actorKey,occurredAt,effect}` | `fieldChangeKeys.issue(issueId)` · 이슈 엔트리 모달 onClose 무효화 |
| `getFieldChangeForm` | `FieldChangeRequestForm` | `issue.{issueKey,projectId}`, `field.{fieldId,fieldName,fieldType,clearable}`, `current`, `options[].{id,name}`, `flow`(null → 차단), `pendingApprovedRequestId` | `fieldChangeKeys.form(issueId, fieldId)` staleTime 0 |
| `searchFieldChangeUsers` | `FieldChangeValueInput`(USER) | `users[].{accountId,displayName}` — 2자 미만은 부르지 않음(D7) | `fieldChangeKeys.users(issueId, fieldId, query)`(fetchQuery, 300ms 디바운스) |
| `createFieldChangeApproval` | `FieldChangeRequestForm` | 보냄 `{issueId, fieldId, value:string\|null, requestMessage, expiresAt?, ccKeys?}`(steps·flowId 없음), 받음 `requestId` | 성공: `fieldChangeKeys.issue`·`approvalKeys.all` → 모달 close. 오류 `ALREADY_OPEN`·`FIELD_CHANGE_NO_CHANGE` 등 → `issue`·`form` 재조회 |
| `applyFieldChange` | `useApplyFieldChange`(이슈 행·상세 헤더) | `apply.{status,already,code}` → `applyNotice` | `fieldChangeKeys.all`·`approvalKeys.detail/history(requestId)` |
| `listFieldChangeRules` | `FieldChangeRuleSettings`·`FieldChangeRuleFormModal` | `projectEnabled`, `rules[].{ruleId,issueTypeId,issueTypeName,fieldId,fieldName,fieldType,fieldMissing,flowName,flowMissing,enabled,openCount,rev}`, `issueTypes`, `fields[].{fieldId,name,fieldType}`, `unsupported[].{fieldId,name,reason}`, `flows` | `fieldChangeKeys.rules(projectId)` |
| `saveFieldChangeRule` | `FieldChangeRuleFormModal` | 보냄 `{projectId, ruleId?, rev?, issueTypeId, fieldId, flowId, enabled}`, 오류 `FIELD_CHANGE_UNSUPPORTED_FIELD` 는 `cause.reason` 문구 덧붙임 | 저장 후 `rules` 무효화 |
| `deleteFieldChangeRule` | `FieldChangeRuleSettings` | 보냄 `{projectId, ruleId, rev}` | 후 `rules` 무효화 |
| `decideApproval`(변경) | `modal.jsx ApprovalModalFlow.approve` | `Object.hasOwn(result,'apply')` 일 때만 안내 — `apply` 객체 또는 `null`+`status:'APPROVED'`(D3) | 상세·`fieldChangeKeys.all` 무효화 후 안내 화면 → [닫기] 에서 finish |
| `bulkApprove`(변경) | `BulkApproveBar` | `results[].{ok, applyStatus}` — WAITING·APPLYING 대기, FAILED·CONFLICT 적용 안 됨 | 기존 |
| `getApprovalDetail`(변경) | `ApprovalDetail` → `FieldChangeTargetHeader`, 재요청 분기 | `target.kind==='FIELD_CHANGE'`, `target.fieldChange.{fieldName,fieldType,from,to,current,state,applyStatus,applyCode,appliedAt,appliedBy,conflictValue,applyRetryable}`(null 이면 줄 생략), 재요청은 `target.fieldChange.fieldId` 또는 `target.key` 역파싱 | `approvalKeys.detail` |
| `getApprovalHistory`/상세 `events` | `ApprovalDetail` 타임라인, `CertificateSheet`, 보관 엑셀 | `eventType` `FIELD_APPLIED`·`APPLY_FAILED`·`APPLY_CONFLICT` → `detail.event.<소문자>`(D10), `reason` 번역 | — |
| `getApprovalCertificate`(변경) | `CertificateSheet` | **최상위** `fieldChange.{fieldName,fieldType,from,to,applyStatus,appliedAt,appliedBy}`(`target.fieldChange` 는 null — D4) | — |
| `listInbox`(변경) | `InboxTable`·`exportInboxExcel` | `fieldChange.{fieldName,fieldType,from,to}`(null 은 무시), `targetKind==='FIELD_CHANGE'` → `inbox.type.field_change` | — |
| `listNotifications`(변경) | `NotificationPanel` | `templateKey`(6종), `fieldChange.fieldName` → `{title}` 보강 | — |
| `exportExpiredApprovals`(변경) | `exportRetentionExcel` | `fieldChange.{fieldId,fromValue,toValue}` → 대상 열 | — |

## 계약 차이 (F-D)

- **F-D1** 이력 라벨은 D10 대로 `detail.event.field_applied`·`apply_failed`·`apply_conflict`(설계 §8.2 의 `history.event.*` 아님). `CHANGED_AFTER_APPROVAL` 은 기존 `detail.event.changed_after_approval`("승인 후 변경 감지") 그대로 — 타임시트 전용 문구가 아니라 재사용, reason `BYPASS` 는 `fieldChange.eventReason.BYPASS` 로 번역.
- **F-D2** 알림 kind(`APPLY_FAILED`·`APPLY_CONFLICT`) 전용 키는 **추가하지 않았다** — 알림 패널은 kind 로 아이콘·라벨을 고르지 않고 `templateKey` 만 렌더한다. 같은 이벤트의 라벨은 F-D1 키가 덮는다.
- **F-D3** 알림 템플릿 6종 문구에 `{title}` 을 넣었다(설계 §8.2 문구는 제목 없음) — 다른 템플릿과 같이 어떤 이슈인지 보이게. `notificationTitle` 이 필드 변경 행을 "제목 · 필드 이름" 으로 만든다.
- **F-D4** 설계 §8 밖에서 추가한 키: `fieldChange.section.history`, `fieldChange.applyStatus.*`(6 — 증명서 적용 상태), `fieldChange.decision.unknown`(D3 apply:null 최종 승인), `fieldChange.apply.*`(5 — 다시 적용 결과, 결정 직후 문구와 구분), `fieldChange.eventReason.*`(3), `fieldChange.form.valueRequired`, `fieldChange.rules.{empty,projectDisabled,deleteTitle,form.required}`, `inbox.bulk.applyFailed`.
- **F-D5** 일괄 결과: 설계는 "적용 대기 n건"만 — `applyStatus` FAILED·CONFLICT 도 "적용 안 됨 n건"으로 따로 센다(대기만 세면 실패를 놓친다).
- **F-D6** NO_RULE(D1): compact 는 칸(라벨 포함)을 그리지 않는다. full(issuePanel)은 규칙을 지운 뒤에도 `history`·`bypass` 가 남아 있으면 그것만 보인다. 그래서 라벨은 `IssueApprovalOverview` 가 아니라 `FieldChangeSection` 이 그린다. PROJECT_DISABLED 는 안내 + 행(요청 버튼 없음).
- **F-D7** USER 값은 아바타 이미지 없이 이니셜(`PersonAvatar src=null`, `display` 이름) — FieldValue 에 아바타 URL 이 없고, 상시 로드 칸에서 사람마다 사용자 조회를 하지 않으려고. 우회 목록 행위자 이름만 full 에서 `resolveUsers` 1콜.
- **F-D8** 결정 직후 적용 결과를 모달 안 안내 화면으로 보여 주고 [닫기]로 닫는다(Q100). 중간 단계 승인·다른 종류는 기존대로 즉시 닫힘.
- **F-D9** 보관 엑셀의 필드 변경 행은 정규형 값만 받는다(`fromValue`/`toValue` — 표시 이름·필드 이름 없음). 대상 열에 "제목 · fieldId: from → to" 로 남긴다.

## 백엔드 요청(가공하지 않고 남김)

- `exportExpiredApprovals.fieldChange` 에 `fieldName`·`fromDisplay`·`toDisplay` 추가 — 보관 파일만 돌아다닐 때 사용자 accountId·옵션 id 로는 읽을 수 없다(F-D9). 급하지 않음.
- 우회 기록 `actorKey` 의 계정 종류(앱·자동화) — C24.

## i18n (kr·en 대칭, merge 통과, `fieldChangeI18n.test` 가 화면 리터럴 키·서버 키·자리표시 대칭을 대조)

- `error.*` 12(`FIELD_CHANGE_*` — ErrorCodes 와 정확히 12 일치를 테스트)
- `notification.template.*` 6(NotificationService 의 `fieldChange*` 6 과 대조)
- `detail.event.field_applied`·`apply_failed`·`apply_conflict`(D10)
- `state.expiry.FIELD_CHANGED`, `policy.audit.area.fieldChangeRule`
- `cert.target.field_change`·`inbox.type.field_change`, `cert.{fieldChange,appliedAt,appliedBy,applyStatus}`, `inbox.column.fieldChange`, `inbox.bulk.applyWaiting`·`applyFailed`, `issueApproval.overview.fieldChange`
- 신규 `fieldChange.json` — 설계 §8.1 전부(`state.*` 9, `applyCode.*` 7, `rules.unsupported.*` 8, `bypass.effect.*` 3, `type.*` 5 포함) + F-D4

## 테스트 대응(설계 §7.5)

| # | 파일 | 확인 |
|---|---|---|
| F1 | `fieldChangeModel.test.js` | state 9종(백엔드 `FieldChangeState` 실물 대조), applyCode 7종(`ApplyCode` 대조), applyStatus·UnsupportedReason 대조, decisionNotice(APPLIED/already/FAILED/CONFLICT/WAITING-BUDGET/APPLYING/null/키 없음), 행 동작·안내, 값 표시, 폼 검증, 일괄 요약 |
| F2 | `FieldChangeSection.test.jsx` | 규칙 없음 → 렌더 없음 / compact 주 버튼 하나·full 전부 / 다시 적용 호출·결과·재조회·error.code / PROJECT_DISABLED / 세 칸 독립 조회와 양방향 오류 격리 |
| F3 | `FieldChangeValueInput.test.jsx` | DATE `YYYY-MM-DD`, NUMBER 입력 문자열 그대로, 비우기 → null, PRIORITY 비우기 없음, USER 디바운스·2자 미만 미호출, 내보내는 값은 항상 string·null·undefined |
| F4 | `transitionModel.test.js` | `fieldChangeRequest` → `fieldChange`, fieldId 없으면 overview, ••• 진입이어도 intent 우선 |
| F5 | `fieldChangeModel.test.js` | `fieldChangeKeys` 접두가 approval·transition 과 다름, id 문자열 고정 |
| + | `FieldChangeRequestForm`·`FieldChangeTargetHeader`·`FieldChangeRuleSettings`·`fieldChangeI18n`, 기존 `CertificateSheet`·`InboxTable`·`NotificationPanel`·`IssueApprovalOverview` 보강 | payload(steps 없음, value null), 차단(Flow 없음·D2), 상세 헤더 다시 적용·무효화 키, 규칙 저장·삭제 rev, 증명서 최상위 블록 |

`modal.jsx` 의 결정 안내 화면은 엔트리가 import 시 `mount()` 해 직접 렌더 테스트가 없다 — 판단은 `decisionNotice` 단위 테스트로, 화면 연결은 C21 로 실측.

## 미검증 (04_spike_todo.md 에 C20~C24 추가)

- **C20** 앱 적용 후 Jira 이슈 보기의 필드 값 즉시 갱신 여부
- C21 결정 안내 → 닫기 → 이슈 엔트리 필드 칸 갱신
- C22 issue 엔트리 +3.2KB gz 체감(I16·C13 확장)
- C23 DatePicker 의 `YYYY-MM-DD` 출력(ko-KR iframe)
- C24 우회 행위자가 앱·자동화 계정일 때 이름 표시

## 새 질문

- **Q100** 필드 변경 최종 승인 직후 결과 안내 화면(클릭 1회 추가) — 기본 가정으로 구현(`_workspace/QUESTIONS.md`)
