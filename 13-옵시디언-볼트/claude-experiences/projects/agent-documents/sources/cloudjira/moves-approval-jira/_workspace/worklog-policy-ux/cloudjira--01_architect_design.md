# 설계 — 워크로그 정책 화면 정리 (worklog-policy-ux, 프론트 전용)

작성: 2026-10-12 리더. 사용자 원문: "사이트 워크로그 기본 정책 이거 좀 잘 정리해줘, 뭔 소리인지 모르겠음". 요구서는 이 문서가 겸한다.
feature-selection 프론트 회차에 **같이** 구현한다(같은 파일 `TimesheetPolicySettings.jsx` 를 두 번 고치지 않기 위해). 백엔드 변경 없음.

## 0. 왜 어려운가 (실측)
1. **같은 값이 두 번**: 설정 > 타임시트 > 정책 탭에 `TimesheetPolicyForm`(분·일 단위, 평문)과 `WorklogPolicyPanel scope="site"`(초 단위, 카탈로그 키 이름)가 **같은 키 12개**를 둘 다 편집한다(`policyFields.js` 의 `legacy` 매핑). 한쪽에서 저장하면 다른 쪽이 바뀐다 — 사용자는 두 개의 다른 설정이라 생각한다.
2. **지원용 정보가 본문에**: 리비전, "유효한 검증 캐시", 출처별 authority 상태, "정책 진단 카운터"(SQL 조회 수·Jira 호출 예산) 가 설정 페이지 본문에 그대로 나온다.
3. **안내문 3단락**: "사이트 기본값 → Workforce 프로젝트(해당 이슈 제약 포함) → Jira 프로젝트 → Jira 이슈 순서로 항목별 적용…" 같은 문장이 매 범위마다 반복된다.
4. **단위·이름**: "하루 시간 상한(초)", "주간 시간 상한(초)", "고통제 · 승인 후 본인 등록", "강화만 허용", "명시값/상속".

## 1. 사이트 범위 (설정 > 타임시트 > 정책 탭)

### 1.1 중복 제거
- `TimesheetPolicySettings.jsx` 에서 `<WorklogPolicyPanel scope="site">` 섹션을 **제거**한다. 사이트 값의 편집기는 `TimesheetPolicyForm` 하나다.
- 계층 패널에만 있던 키 4개를 `TimesheetPolicyForm` 에 **평문 섹션으로 추가**한다(서버 `saveApprovalSettings` 가 이미 받는다 — `SettingsService.normalizeSettingsPatch` 의 `createWindowDays`·`editWindowDays`·`deleteWindowDays`·`approvalMode`). 저장 patch 에 포함, `valuesOf`/formKey 에 포함.

| 새 하위 섹션(SettingsSection level sub) | 필드 | 라벨(kr) | 도움말 |
|---|---|---|---|
| `timesheet.settings.windowSection` "기록할 수 있는 기간" | `createWindowDays` | "작업한 날로부터 기록 가능한 일수 (0 = 제한 없음)" | — |
| | `editWindowDays` | "처음 기록한 날로부터 수정 가능한 일수 (0 = 제한 없음)" | — |
| | `deleteWindowDays` | "처음 기록한 날로부터 삭제 가능한 일수 (0 = 제한 없음)" | "마감된 기간과 승인된 기간은 이 일수와 상관없이 잠깁니다." |
| `timesheet.settings.approvalModeSection` "작업 시간 승인 방식" | `approvalMode` (select) | `CERTIFICATION` "기록한 뒤 팀장이 확인(기본)" / `PREAPPROVAL` "먼저 승인받고 기록" | "프로젝트에서 '먼저 승인받고 기록'을 필수로 정해 둔 경우, 사이트 값을 바꿔도 그 프로젝트는 그대로 유지됩니다."(기존 `worklogPolicy.preapprovalFloor` 의미) |

- 기존 섹션 라벨 교정(timesheet.json, 같은 키에 값만): `limits` "제한선" → "기록 시간·날짜 기준", `dailyMax` → "하루 최대 기록 시간(분, 0 = 제한 없음)", `weeklyMax` → "한 주 최대 기록 시간(분, 0 = 제한 없음)", `futureDate` → "미래 날짜 기록 금지", `backdate` → "지난 날짜 기록 가능 일수(0 = 제한 없음)", `lockSubmitted` → "결재 중인 기간에 기록 추가 금지" + 도움말 "승인된 기간은 항상 잠깁니다", `unit.WEEK` → "주(월요일~일요일)", `exceptionGroup` → "기준을 넘긴 기록의 추가 결재자 그룹", `action.label` → "기준을 넘기면", `action.WARN` → "경고만 하고 제출", `action.EXTRA_STEP` → "추가 결재자 거침", `action.BLOCK` → "제출 막기".

### 1.2 진단은 접는다
- `WorklogPolicyDiagnostics` 섹션은 탭 맨 아래 `<details className="settings-details">` 로. summary 라벨 `worklogPolicy.diagnosticsSupport` "정책 진단(지원용)". 기본 접힘. 안의 `counterNotice` 는 그대로(지원용이므로 평문화 대상 아님).

## 2. 프로젝트·이슈 범위 (`WorklogPolicyPanel` — ProjectPolicyModal, WorklogTab)

패널은 **"이 프로젝트(이슈)에서 다르게 적용할 항목"** 하나의 질문으로 재구성한다. 동작·resolver·쿼리키·저장 payload(`expectedRevision`, `override`) 는 그대로.

### 2.1 머리
- 제목(`scope.project`) "이 프로젝트에서 다르게 적용할 항목" / (`scope.issue`) "이 이슈에서 다르게 적용할 항목".
- 한 줄 설명(`hierarchyShort`, 신규): "체크한 항목만 여기서 바뀝니다. 나머지는 사이트 기본값(또는 상위 설정)을 따릅니다. 워크포스가 고정한 항목은 더 엄격하게만 바꿀 수 있습니다."
- 기존 3단락(`hierarchy`·`lockNotice`·`retentionNotice`)과 `refreshHelp` 는 `<details>` "자세히"(`SettingsPageIntro.details` 패턴) 로.
- **경고는 접지 않는다**: authorityState 중 `STALE`/`EXPIRED`/`INVALID` 가 있으면 `SectionMessage warning` 한 개, 평문(`authorityWarn.STALE` "워크포스 정책 확인 기한이 지났습니다. 24시간 동안은 마지막 값으로 동작합니다." / `EXPIRED` "워크포스 정책 확인이 만료됐습니다. 워크포스가 고정한 항목과 관련된 기록·수정이 막힐 수 있습니다. '워크포스 정책 다시 받기'를 누르세요." / `INVALID` "워크포스 정책을 확인할 수 없습니다. 서명 키 설정을 점검하세요."). `FRESH`/`ABSENT` 는 표시하지 않는다.

### 2.2 항목 행 (SettingsRows 와 같은 그리드)
| 열 | 내용 |
|---|---|
| 라벨 | 평문 라벨(§4). 단위는 입력칸 뒤에 붙인다(분/일) |
| 지금 적용되는 값 | `policyValueText` + 출처 칩(span, 토큰 색): `SITE_DEFAULT` "사이트 기본값", `WORKFORCE_PROJECT`/`WORKFORCE_ISSUE` "워크포스", `JIRA_PROJECT` "이 프로젝트", `JIRA_ISSUE` "이 이슈" |
| 여기서 바꾸기 | 체크박스(기존 override 체크). 체크하면 입력칸 활성. 잠금이면 체크박스 대신 로젠지 `locked` "워크포스 고정" + 한 줄(`allowTighten` ? "더 엄격하게만 바꿀 수 있습니다" : "바꿀 수 없습니다") |

- **초 → 분**: `dailyMaxSeconds`·`weeklyMaxSeconds` 입력은 **분** 으로 보여 주고 저장 시 ×60 (`policyFields.scale` 사용, 사이트 폼과 같은 단위). 표시값도 분.
- 리비전·"명시값/상속"·`ignored` 목록·`sourceRevision` 은 행에서 빼고 `<details>` "상태 정보(지원용)"(`supportInfo`) 안에 기존 형식으로 유지(테스트 호환 — 기존 테스트가 `worklogPolicy.authority.EXPIRED`·`noOverride`·`migration` 문자열을 찾는다. 경고와 details 안에 그 키 문구가 남도록).
- siteOnly 키(승인 단위·시간대·이력 보존)는 행으로 그리지 않고 details 안에 "사이트에서만 정하는 항목" 목록으로.
- 버튼: 저장 / "워크포스 정책 다시 받기"(`refresh` 라벨 교정) / 새로 고침. 수신 결과(`refreshResult`)는 "확인 {checked} · 갱신 {updated} · 같음 {unchanged} · 실패 {failed}" 로 평문(`refreshResultLine` 신규, tFormat).

### 2.3 WorklogTab 의 쓰기 전 요약 (`WorklogPolicySummary`)
- 제목 `beforeWrite` → "이 이슈에 적용되는 기록 규칙". `writeNotice` 4문장은 `<details>` "자세히" 로.
- 값 목록은 **제한이 걸린 항목만**(0·false·기본값과 같은 항목은 생략), 출처 칩 포함. 전부 기본이면 "제한 없음 · 사이트 기본값" 한 줄.

## 3. 테스트
- `WorklogPolicy.test.jsx`: site 범위 테스트(historyRetentionMonths 등)는 **삭제하거나 project 범위로 옮긴다**(site 패널이 없어졌으므로). 기대 문자열은 details 를 열어(`details.open = true` 또는 summary 클릭) 확인. 분 단위 변환 1건 추가(입력 30 → 저장 1800).
- `TimesheetPolicySettings` 테스트: 새 4키 저장 patch 포함 1건, 진단 details 기본 접힘 1건, 사이트 패널 미렌더 1건(`ts-worklog-policy-section` 없음).
- `ProjectPolicyModal`·`WorklogTab` 기존 테스트의 testId·키 문자열 유지.

## 4. i18n (worklogPolicy.json kr/en — 키 유지, 값 교정 + 신규 키)
값 교정: `scope.project`·`scope.issue`(§2.1), `key.dailyMaxSeconds` "하루 최대 기록 시간", `key.weeklyMaxSeconds` "한 주 최대 기록 시간", `key.pastDateMaxDays` "지난 날짜 기록 가능 일수", `key.futureDateAllowed` "미래 날짜 기록 허용", `key.createWindowDays` "작업한 날로부터 기록 가능한 일수", `key.editWindowDays` "처음 기록한 날로부터 수정 가능한 일수", `key.deleteWindowDays` "처음 기록한 날로부터 삭제 가능한 일수", `key.violationAction` "기준을 넘기면", `key.approvalMode` "작업 시간 승인 방식", `key.lockSubmittedPeriod` "결재 중인 기간에 기록 추가 금지", `key.periodAutoCloseDays` "기간 종료 후 자동 마감 일수", `key.historyEnabled` "변경 이력 남기기", `key.historyKeepComment` "변경 이력에 설명 원문 보관", `key.worklogDateWindow` "이슈 시작일~마감일 안에서만 기록(워크포스 연동 이슈)", `value.WARN` "경고만 하고 처리", `value.BLOCK` "막기", `value.CERTIFICATION` "기록한 뒤 팀장이 확인", `value.PREAPPROVAL` "먼저 승인받고 기록", `locked` "워크포스 고정", `tightenOnly` "더 엄격하게만", `noOverride` "바꿀 수 없음", `explicit` "여기서 정함", `inherited` "상위 값 따름", `refresh` "워크포스 정책 다시 받기", `unlimited` "제한 없음", `unlimitedRetention` "무기한", `source.SITE_DEFAULT` "사이트 기본값", `source.WORKFORCE_PROJECT` "워크포스", `source.WORKFORCE_ISSUE` "워크포스(이슈)", `source.JIRA_PROJECT` "이 프로젝트", `source.JIRA_ISSUE` "이 이슈".
신규: `hierarchyShort`, `authorityWarn.{STALE,EXPIRED,INVALID}`, `supportInfo` "상태 정보(지원용)", `siteOnlyList` "사이트에서만 정하는 항목", `diagnosticsSupport` "정책 진단(지원용)", `refreshResultLine` "확인 {checked} · 갱신 {updated} · 같음 {unchanged} · 실패 {failed}", `noLimits` "제한 없음 · 사이트 기본값", `overrideHere` "여기서 바꾸기", `effectiveNow` "지금 적용되는 값".
timesheet.json: §1.1 의 신규·교정 키. en 은 같은 뜻으로.

## 5. 불변식·함정
- 저장 payload·resolver·쿼리키 무변경. 분↔초 변환은 프론트에서만(`policyFields.scale`), 사이트 폼은 이미 분 단위 legacy 키로 저장하므로 서버 값 의미는 동일.
- 경고(authority STALE/EXPIRED/INVALID)는 절대 details 안에 숨기지 않는다 — 쓰기 차단과 직결.
- `WorklogPolicyPanel` 은 lazy 로드되는 공용 컴포넌트(WorklogTab) — 번들 크기 늘리지 않게 `SettingsRows` 같은 가벼운 것만 import.
