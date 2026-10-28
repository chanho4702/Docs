# 워크로그 인증 모델(worklog-certification-model) 설계서

작성: 2026-10-08 · feature-architect · 입력 `00_input/requirement.md`(D1~D6)
원칙: 엔진(상태 머신·결재선)은 고치지 않는다. 인증은 **결재 요청이 아니라 레코드**다 — `approval_request` 를 만들지 않고, 새 테이블 3개 + 순수 도메인 + resolver 3개 + 기존 응답 4곳 가산(additive)으로 끝낸다.

### 요구서와 실제 코드의 차이 (설계 전 확인)

| 요구서 표현 | 실제 | 설계에 반영 |
|---|---|---|
| 테이블 `worklog_certification_entry` | 실제 이름은 `worklog_certification`(+`worklog_certification_request`), v040·v041 | 기존 테이블은 **동결**, 새 테이블 `worklog_cert` 신설(§5.1 비교) |
| 마지막 마이그레이션 v045 | 다른 세션(review-hardening, 미커밋)이 **v046~v048** 을 이미 썼다(`migrate.js` diff) | 새 번호는 **v049 부터**. 그 세션이 번호를 바꾸면 여기서 밀어 쓴다(§11 선행 조건) |
| 게시는 "시간당 스윕" | `WorkforcePublisher.tick` 은 **5분 스윕**(`wf-publish`), 대조만 일일 | 5분 스윕에 얹는다 |
| "WorkforceLink 미설치·미연결 판정 재사용" | 지금은 설치 감지가 없다(`workforceLinkEnabled`·키·cloudId·`WRITE_DENIED` 만). 주석: "모드 판정은 설치 감지가 아니라 검증 결과" | 같은 철학으로 **"서명 검증된 워크포스 게시물을 최근 30일 안에 본 적 있음"** 을 연결 판정으로 추가(§4.6) |
| 워크포스가 v1 문서를 소비 | 워크포스 리포에 `movesApproval.*` 소비 코드 **없음**(2026-10-08 grep) | v1 은 그대로 두고 v2 를 별도 키로. 워크포스는 v2 부터 구현하면 된다(§12) |

## 열린 질문

> 2026-10-08 14:10 사용자 결정(requirement §7 D7~D9)으로 Q104·Q109 는 답이 확정됐고, 나머지(Q101~Q103·Q105~Q108·Q110)는 기본 가정 그대로 **확정**한다. 남은 열린 질문은 Q111 하나다.

| # | 질문 | 상태 | 결정(이 설계의 값) | 근거 |
|---|---|---|---|---|
| Q101 | 인증 후 Jira 에서 **시간이 줄거나 바뀐**(MISMATCH) 건의 "인증된 시간" | 확정(기본 가정) | D1 옵션에 묶는다: `deletedCertifiedHandling=KEEP` → 인증값 그대로, `ZERO` → min(인증값, 현재값). 삭제는 현재값 0 이라 ZERO=0 | "인증된 시간은 수정 불가"(KEEP)와 "줄어든 주장은 반영"(ZERO)을 한 스위치로. 증가분은 어느 쪽이든 미인증 |
| Q102 | MISMATCH 였다가 Jira 값이 **인증값으로 되돌아오면** | 확정(기본 가정) | 자동 CERTIFIED. `state_changed_at` 갱신 | 지문이 같으면 인증된 사실 = 현재 주장. 인증 레코드는 한 번도 바뀌지 않았다 |
| Q103 | 지문에 **설명·공개 범위**를 넣는가 | 확정(기본 가정) | 시간 필드만(작성자·이슈·시작·초) | 인증 대상은 "시간". 설명 오타 수정이 재인증 노동을 만들면 안 된다. 설명 변경은 이력(신호)에는 보인다 |
| Q104 | **팀장 본인**의 워크로그 | **답 확정(D8)** | 기본은 **상위자 인증**(그 팀장이 MEMBER 로 속한 팀의 LEAD — 기존 `certifyWorklogs` 경로 그대로). **상위자가 없으면 본인 인증 허용**(SELF 축 별도 resolver `certifyOwnWorklogs`). 본인 서명은 `worklog_cert.self_certified`·묶음 행·게시 문서(`sc`·`sn`·항목 flag 4)·화면 배지에 구분해 남긴다 | 사용자 결정 2026-10-08. 상세 §1.2 |
| Q105 | 매트릭스에서 **여러 사람을 골라 한 번에 월 인증** | 확정(기본 가정) | 제공 안 함 — 사람을 펼쳐 본 뒤 "이 달 전체 인증" | 펼치지 않은 월 인증은 판단 근거 없는 서명. 호출량도 15초 예산에 3~5명뿐 |
| Q106 | 기존 **사후 인증 요청형**(`createWorklogCertification`, 결재선) | 확정(기본 가정) | 신규 생성 중단·기존 읽기 유지(동결). 테이블 DROP 안 함 | 같은 워크로그를 두 방식으로 인증하면 진실이 갈린다. 프로덕션 미배포라 이관 없음 |
| Q107 | 인증 레코드 **보관 기간** | 확정(기본 가정) | 무기한. 정리 경로는 후속 | 200명 연 ~80MB(§9). 원가·정산 근거 |
| Q108 | **사전 승인(PREAPPROVAL)** 으로 만들어진 워크로그 | 확정(기본 가정) | 일반 워크로그와 같이 인증 대상 | 자동 인증은 결재자 ≠ 팀장일 수 있어 D3 와 충돌 |
| Q109 | 최초 인증 주체 | **답 확정(D7·D9)** | 플로우가 기본: 팀에 속한 사람은 그 팀장만 인증(본인 불가). 본인 인증은 **D8 의 경우에만**(팀장이고 상위자 없음). **재인증도 같은 규칙** | 사용자 결정 2026-10-08. 옛 결정("팀장만, 본인 불허")을 D8 예외로 대체 |
| Q110 | 워크포스 게시 문서에 건별 목록을 항상 싣는가 | 확정(기본 가정) | 단위와 무관하게 항상 `w` 포함(1,000건 상한) | 워크포스 원가는 프로젝트별 배분이 필요 |
| Q111 | **팀장도 아니고 어느 팀에도 속하지 않은 사람**의 워크로그 | 열림 | 기본 가정: **인증 불가**(매트릭스에 안 나오고 본인 인증도 불가). D8 은 "팀장 본인"에만 예외를 둔다 | D7 "플로우가 기본"을 넓히지 않는 쪽. 허용하면 팀 미배정만으로 누구나 자기 서명이 가능해져 D7 이 무력화된다. 관리자의 팀 배정으로 해결하는 것이 정상 경로 |

## 1. 개요·영향 범위

**무엇을 만드나**: 팀장이 팀원의 Jira 워크로그를 보고 "이 시간은 인증한다"고 서명하면, 그 순간의 값(이슈·작성자·시작·초)과 **판단 근거 요약**을 우리 SQL 에 고정한다. 이후 Jira 쪽 변경은 지문 불일치로 감지해 그 건을 MISMATCH/DELETED 로 표시하지만, 인증 레코드는 그대로 남는다. 워크포스가 같이 있으면 사용자×월로 **인증된 시간만** 서명해 넘긴다.

| 영역 | 변경 |
|---|---|
| 도메인 | `src/domain/worklogCertification/` 에 `certFingerprint`(fingerprint.js 확장)·`state.js`·`summary.js`·`counting.js`·`policy.js` 추가. 기존 `certificationSnapshot`·`observedCertificationState` 는 그대로(동결된 요청형이 쓴다) |
| resolver | **신규 5**: 팀장 축 `getCertificationMatrix`·`listMemberCertifications`·`certifyWorklogs`, 본인 축(D8) `listOwnCertifications`·`certifyOwnWorklogs`(`src/resolver/worklogCert/`). **가산 5**: `getTimesheetContext`·`getMyTimesheet`·`getIssueWorklogs`·`getTimesheetWorklogHistory`·`getWorkforceLinkStatus`. **설정 2**: `getApprovalSettings`/`saveApprovalSettings` 키 추가. **제거 1**: `createWorklogCertification`(Q106). **의미 축소 1**: `getWorklogCertification`(읽기 전용, `canRequest:false`) |
| 스키마 | v049 `worklog_cert`(`self_certified` 포함) · v050 `worklog_cert_batch` · v051 `worklog_cert_log` · v052 `worklog_mirror` 인덱스(작성자×시작) |
| 트리거·스윕 | 관찰 경로(`WorklogHistoryRecorder` → 인증 관찰)를 새 테이블로. 전이 시 아웃박스 touch. 게시 스윕에 인증 문서 배출·변경 스캔 추가 |
| manifest | **변경 없음**(모듈·scope 추가 없음. W11 결과에 따라 scope 추가 가능 — §10 U1) |
| 엔트리 | **추가 없음.** 팀장 화면은 `inbox` 엔트리의 새 view `teamCertification`(lazy). 배지는 기존 `worklog`·`inbox`·`modal` 엔트리 안 |
| i18n | 새 namespace `worklogCert`(kr/en). `worklogCertification` 은 동결된 요청형 표시용으로 유지(문구 일부 정리) |
| 워크포스 연동 | 계약 추가: typ `approval.cert`, 사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}`(v2 문서). v1(`movesApproval.{YYYY}`)은 그대로. 워크포스 리포 작업은 §12 로 분리 |

### 1.1 대상과 단위 (scopeKey 대응)

- 인증 대상 = **워크로그 1건**. "열린 요청" 개념이 없으므로 불변식 1 의 대응물은 **`worklog_cert` 기본키 `worklog_id`** — 워크로그당 인증 레코드는 언제나 하나(현재본). 재인증은 그 행을 CAS 로 덮고, 덮이기 전 판을 `worklog_cert_log (worklog_id, cert_rev)` 에 보관한다.
- 월 귀속 = 인증 시점 사이트 타임존(`timesheetTimezone`)으로 계산한 `started` 의 달력 월 `YYYY-MM`. **`approvalUnit`(WEEK/MONTH)과 무관하게 항상 월**(D2·D5 가 사용자×월). 행에 `period_key` 로 고정 — 타임존 정책이 나중에 바뀌어도 과거 귀속은 안 바뀐다.
- 정책 `certificationUnit` 은 **UI 흐름과 게시 표시(`u`)만** 바꾼다. 저장은 항상 건별(D2). 옵션을 바꿔도 데이터 이전 없음.

### 1.2 인증 주체와 서명/PIN (요구 §4.2·D3·D7~D9)

**판정 순서(최초·재인증 공통, D9)** — 대상 워크로그 작성자를 `A`, 호출자를 `X` 라 하면:

| # | 경로 | 조건 | resolver(권한 축) | 기록 |
|---|---|---|---|---|
| 1 | **팀장 인증**(D7 — 기본 플로우) | `X ≠ A` 이고 `TeamScope.leads(X, A)` | `certifyWorklogs` (`{teamLead:true}`) | `self_certified=0` |
| 1' | **상위자 인증**(D8 기본) | `A` 가 팀장이고 `A` 가 MEMBER 로 속한 팀의 LEAD 가 `X` — 즉 `TeamScope.leads(X, A)`. 1 과 **같은 판정·같은 resolver**(상위자 입장에선 A 가 그냥 팀원이다) | `certifyWorklogs` | `self_certified=0` |
| 2 | **본인 인증**(D8 예외) | `X = A` 이고 `TeamScope.isTeamLead(A)` 이고 `TeamScope.upperLeadsOf(A)` 가 **빈 집합** | `certifyOwnWorklogs` (`SELF`) | `self_certified=1` |
| — | 거부 | 그 밖(팀원이 자기 것, 상위자가 있는 팀장이 자기 것, 팀 없는 비팀장 — Q111) | — | `WORKLOG_CERT_SELF_DENIED` (`cause.reason`) |

**"상위자 없음" 판정 — `TeamScope.upperLeadsOf(accountId)` 신설**(TeamScope 에는 지금 역방향 조회가 없다)

- 정의: `upperLeadsOf(A) = { X | X ≠ A 이고 TeamScope.leads(X, A) }`. 즉 **A 를 MEMBER 로 둔 팀의 LEAD 들**. 계층(팀장의 팀장)은 따로 모델링하지 않는다 — 한 단계 위만 본다.
- 구현은 `membersOf` 와 **같은 합성 규칙(Q33 — 워크포스 우선)** 의 역방향:
  - 워크포스가 A 의 결재자를 정했으면(`org.overriddenSubjects([A])` 에 A 포함 — 서명 검증된 `rms.org`) → `org.forSubject(A).leaderKeys` − {A}
  - 아니면 명부: `repository.findMemberTeam(A)`(활성 팀의 MEMBER 행) → 그 팀의 LEAD 들(`findLeadScope` 와 같은 테이블) − {A}
  - 이 규칙은 타임시트 결재선 해석(`TimesheetRouting` — 명부 `team.leadKeys` 에서 본인 제외, 워크포스 `org.leaderKeys`)과 같은 원천이다.
- **일관성 계약 테스트**: 임의의 명부·워크포스 조합에서 `X ∈ upperLeadsOf(A) ⇔ X ≠ A ∧ leads(X, A)`. 둘이 어긋나면 "상위자가 있는데 본인 인증이 열리는" 구멍이 생긴다.
- **fail-close(방향 주의)**: `membersOf` 에서는 조회 실패 시 범위를 줄이는 것이 안전하지만, `upperLeadsOf` 에서 집합이 줄면 **본인 인증이 열린다**(위험 방향이 반대). 그래서 명부·워크포스(`forSubject`·`overriddenSubjects`) 중 **하나라도 실패하면 throw** 하고, 서비스는 이를 "상위자 있음"으로 보아 거부한다 — `WORKLOG_CERT_SELF_DENIED`, `cause.reason='UPPER_LEAD_UNKNOWN'`. 워크포스 연동이 꺼져 있거나 게시물이 없는(null) 것은 실패가 아니다(명부만으로 판정).
- invocation memo(`upperLeads:{A}`) — 가드·서비스·목록이 같은 호출 안에서 다시 묻는다.

**두 팀 이상에 속하면?**
- 명부는 `member_slot` UNIQUE 로 **MEMBER 는 한 팀에만**이다. 같은 팀의 LEAD 가 여럿이면 **그중 누구든** 인증할 수 있다.
- 워크포스 연동 시 A 를 MEMBER 로 둔 워크포스 팀의 `leaderKeys`(최대 10)도 **누구든** 가능하다.
- 이는 타임시트 결재와 같은 규칙이다: 결재선은 그 팀 LEAD 전원 중 1명(`requiredApprovals:1`), 상세 열람은 `TimesheetAccess.canView` → `scope.leads(viewer, subject)` — 어느 현재 팀장이든. 인증도 `leads` 하나로 판정하므로 자동으로 같다.

**본인 인증 이후 상위자가 생기면**: 기존 `self_certified=1` 레코드는 그대로 유효하다(인증 당시 규칙으로 정당). 이후 재인증·신규 인증은 1' 경로만 열린다. 상위자는 본인 인증 건을 **같은 지문 그대로 다시 인증해 확인(승격)** 할 수 있다 — `planCertify` 의 `UPGRADE`(§3.2). 승격하면 `self_certified=0`, 이전 판은 log 로 보관.

| 결정 | 내용 | 근거 |
|---|---|---|
| 팀원의 본인 인증 | **불허**(D7) | Jira 워크로그 자체가 본인 주장이라 본인 서명은 정보량이 같다. 원가·정산(D5)의 근거는 제3자 확인 |
| 팀장 본인 인증 | 상위자 없을 때만(D8). 레코드·게시물·화면에 구분 | 조직 최상위 팀장의 시간도 원가에 들어가야 하는데 확인해 줄 사람이 없다. 대신 워크포스가 "본인 서명분"을 구분해 다룰 수 있게 `sc`·flag 로 남긴다 |
| 재인증 | 같은 규칙(D9) — 팀원 건은 팀장, 팀장 건은 상위자, 상위자 없으면 본인 | D3·D9 |
| 권한 축 분리 | 팀장 경로 `certifyWorklogs` 는 **넓히지 않는다**(`X ≠ A` 강제 그대로). 본인 경로는 SELF 축 별도 resolver 2개 | 한 resolver 에 분기를 넣으면 `{teamLead:true}` 가드 통과 후 "본인이면 허용" 분기가 생겨 축의 의미가 흐려진다. SELF 축은 "자기 데이터만" 이라 대상이 호출자로 고정된다 |
| PIN | 사이트 정책 `pinRequired` — **호출(묶음)당 1회** `pinService.verifyIfRequired`. 본인 인증도 같다 | 인증은 결정 행위다 |
| 서명(도장) | `signatureEnabled` 면 화면에서 인증자 계정의 등록 서명/이름 도장. 본인 인증은 도장 옆에 "본인" 표시 | 결재 순서표와 같은 방식. 이미지는 행에 싣지 않는다 |
| 증거 | 묶음 행(`worklog_cert_batch`)에 인증자·대상자·월·모드·PIN 검증 여부·정책 값·화면 지문·건수. 본인 여부는 `actor_account = subject_account` 로 **파생**(두 칼럼 모두 NOT NULL·불변이라 어긋날 수 없다) | 감사·증명 |
| 위임 | 결재 위임은 적용하지 않는다 | 인증은 팀장 범위 판정만 쓴다 |

## 2. 경계면 계약

공통: 응답은 `{success:true, ...}` 의 `content` 안. 실패는 `error.code`. 권한 축 표기는 `PermissionMap` 그대로. 신규 resolver 는 **3단계 등록**(Controller `guardedDefine` → `PermissionMap` → `CONTROLLER_REGISTRARS` 에 `registerWorklogCertController`).

### 2.1 신규

| resolver | 권한 축 | 입력(payload) | 응답 shape (content) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getCertificationMatrix` | `{teamLead:true}` | `{periodKey?: 'YYYY-MM'(없으면 현재 월), teamKey?: string\|null(≤80)}` | `CertMatrix` (§2.3) | `PERMISSION_TEAM_LEAD_REQUIRED`(가드), `INVALID_TARGET`(월 형식·이끌지 않는 teamKey) | 업무함 > 워크로그 인증(`TeamCertificationPage` 매트릭스) |
| `listMemberCertifications` | `{teamLead:true}` | `{accountId, periodKey: 'YYYY-MM'}` | `MemberCertList` (§2.3) | 가드, `INVALID_TARGET`, `PERMISSION_TARGET_VIEW_DENIED`(팀원 아님), `TIMESHEET_TOO_LARGE`(수집 상한), `STORAGE_NOT_READY` | 매트릭스 행 펼침(`MemberCertificationPanel` + `WorklogSummaryTable mode="certify"`) |
| `certifyWorklogs` | `{teamLead:true}` | `{accountId, periodKey, mode: 'ENTRY'\|'MONTH', batchKey: uuid v4, setDigest?: string(16), items: [{worklogId, fp: string(16), lastSeq: int\|null}] (1~200), pin?: string}` | `CertifyResult` (§2.3) | 묶음 단위(throw): 가드, `INVALID_TARGET`(형식·건수 0/200 초과·월 형식), `PERMISSION_TARGET_VIEW_DENIED`(팀원 아님), `WORKLOG_CERT_SELF_DENIED`, `WORKLOG_CERT_UNIT_MISMATCH`(mode ≠ 정책 단위), `WORKLOG_CERT_BATCH_CONFLICT`(같은 batchKey 를 다른 대상·월로 재사용), `PIN_REQUIRED`·`PIN_INVALID`·`PIN_LOCKED`·`PIN_NOT_SET`, `STORAGE_NOT_READY`. **건별(results[].code)**: `WORKLOG_NOT_FOUND`(조회자에게 안 보이거나 없음), `WORKLOG_CERT_SUBJECT_MISMATCH`(작성자 ≠ accountId), `WORKLOG_CERT_OUT_OF_PERIOD`(시작이 그 월 밖), `WORKLOG_CERT_STALE`(지문·seq 가 화면과 다름 — `cause:{reason:'FINGERPRINT'\|'SEQ'}`), `WORKLOG_CERT_DELETED`, `WORKLOG_CERT_CONFLICT`(CAS 3회 실패), `UNKNOWN_ERROR` | 펼침의 "선택 인증"(ENTRY)·"이 달 전체 인증"(MONTH) |
| `listOwnCertifications` | `SELF` | `{periodKey: 'YYYY-MM'}` | `OwnCertList` (§2.3) = `MemberCertList` 와 같은 shape(`accountId`=호출자) + `selfCert: { eligible: boolean, reason: null\|'NOT_TEAM_LEAD'\|'UPPER_LEAD_EXISTS'\|'UPPER_LEAD_UNKNOWN', upperLeadCount: number }`. 수집은 `collectMine`(asUser 본인). **누구나 자기 것은 조회 가능**(상태 확인용) — 인증 버튼만 `eligible` 로 연다 | `INVALID_TARGET`(월 형식), `TIMESHEET_TOO_LARGE`, `STORAGE_NOT_READY` | 업무함 > 워크로그 인증 > "내 워크로그" 섹션(`OwnCertificationPanel`, `selfCertEligible` 일 때만 노출) |
| `certifyOwnWorklogs` | `SELF` | `{periodKey, mode, batchKey, setDigest?, items: [{worklogId, fp, lastSeq}] (1~200), pin?}` — **accountId 를 받지 않는다**(대상 = 호출자 고정) | `CertifyResult` (§2.3, 결과 행에 `selfCertified:true`) | 묶음 단위: `WORKLOG_CERT_SELF_DENIED`(`cause:{reason:'NOT_TEAM_LEAD'\|'UPPER_LEAD_EXISTS'\|'UPPER_LEAD_UNKNOWN', upperLeadCount}` — 상위자 계정 id 는 싣지 않는다), `INVALID_TARGET`, `WORKLOG_CERT_UNIT_MISMATCH`, `WORKLOG_CERT_BATCH_CONFLICT`, `PIN_*`, `STORAGE_NOT_READY`. 건별: `certifyWorklogs` 와 같은 목록(`SUBJECT_MISMATCH` = 남의 워크로그 id) | "내 워크로그" 섹션의 선택 인증·이 달 전체 인증 |

### 2.2 기존 resolver 변경

| resolver | 권한 축(변경 없음) | 변경 | 응답 가산 shape | 소비 화면 |
|---|---|---|---|---|
| `getTimesheetContext` | `SELF` | 가산 필드 1 | `certification: { selfCertEligible: boolean }` — `isTeamLead && upperLeadsOf(me) 가 빈 집합`. 판정 실패는 `false`(fail-close). SQL 만, Jira 0 | 업무함 nav·"내 워크로그" 섹션 노출 여부 |
| `getMyTimesheet` | `SELF` | 가산 필드 1 | `certification: { unit, deletedHandling, certifiedSeconds, counts: {certified, mismatch, deleted, uncertified}, byWorklog: { [worklogId]: { state, certifiedSeconds, countedSeconds, certifiedAt, selfCertified } } }` — `live.entries` 의 워크로그만. 조회 실패·미준비면 `certification: null` | 내 타임시트(`MyTimesheetPage` 인증 현황 줄 + 항목 배지) |
| `getIssueWorklogs` | `{issue:'view', issueIdKey:'issueId', appAccess:false}` | 가산 필드 1 | `worklogs[].certification: { state, certifiedSeconds, countedSeconds, selfCertified } \| null` — **이력 카운트와 같은 자격**(작성자 본인 · 현재 팀장 · 앱 관리자)만 채우고 나머지는 null. 최상위 `certification: { unit } \| null` | 작업 로그 탭(`WorklogTab` 배지) |
| `getTimesheetWorklogHistory` | `SELF` + `TimesheetAccess.canView` | 가산 필드 1 | `worklogs: WorklogSummaryRow[]` (§2.3) — 제출 스냅샷 항목 중 **조회자가 볼 수 있는 이슈**의 것만. 미준비면 `[]` | 승인 상세 > 이력 섹션(`TimesheetHistorySection` 위에 `WorklogSummaryTable mode="review"`) |
| `getWorkforceLinkStatus` | `{admin:true}` | 가산 필드 1 | `certPublish: { state: 'OK'\|'NOT_LINKED'\|PublishState.*, linkedAt: number\|null, pending, failed, published, lastPublishedAt }` | 설정 > 워크포스 연동 |
| `getApprovalSettings` / `saveApprovalSettings` | `{admin:true}`(기존) | 키 5 추가(§4.5). 단위·삭제 처리 변경 시 인증 문서 연도 표식 touch | 기존 shape 에 키만 | 설정 > 타임시트 정책 옆 "워크로그 인증" 섹션 |
| `getWorklogCertification` | 기존 | **읽기 전용** — `canRequest:false`, `availableFlows:[]` 고정. 관찰(observe) 호출 제거(옛 테이블 동결) | shape 동일 | 승인 상세(옛 `WORKLOG_CERTIFICATION` 요청) |
| `createWorklogCertification` | — | **제거**(Controller·PermissionMap 동시. 계약 테스트 갱신) | — | 작업 로그 탭의 옛 "사후 인증" 버튼 제거 |

### 2.3 응답 타입

```ts
type CertState = 'UNCERTIFIED' | 'CERTIFIED' | 'MISMATCH' | 'DELETED_AFTER_CERT';
type SignalCode = 'LATE_ENTRY' | 'NEAR_CLOSE_EDIT' | 'GROWTH' | 'OTHER_ACTOR' | 'OUTSIDE_APP' | 'OBSERVED_LATE' | 'NO_HISTORY';

type WorklogSummary = {
  first: { started: number, seconds: number } | null,   // 처음 관측값(CREATED 또는 BASELINE 의 after)
  firstIsBaseline: boolean,                              // true = 수집 시작 이후 처음 본 값(생성 시점 값이 아님)
  final: { started: number, seconds: number } | null,    // 판단 시점 값(조회: 현재 / 동결: 인증값)
  editCount: number,                                     // UPDATED 행 수
  lastSeq: number | null,                                // 이력 마지막 seq(없으면 null)
  lateDays: number | null,                               // 작업일 대비 기록 지연(일)
  growthPercent: number | null,                          // (final-first)/first*100, first 없으면 null
  signals: SignalCode[],
};

type CertMatrix = {
  periodKey: string, timeZone: string, period: { start: number, end: number },
  unit: 'ENTRY' | 'MONTH', deletedHandling: 'KEEP' | 'ZERO',
  teams: [{ teamKey, displayName, source }], teamKey: string | null,
  coverage: { mirror: boolean, since: number | null },  // 주장 시간·미인증 건수의 출처(이력 수집). false 면 아래 claimed*/uncertified 는 null
  rows: [{
    accountId, displayName, avatarUrl, teamKey, teamSource,
    certifiedSeconds: number,      // countedSeconds 합(D1·Q101 정책 적용)
    certifiedCount: number, mismatchCount: number, deletedCount: number,
    selfCertifiedCount: number,    // 본인 서명 건수(상위자가 하위 팀장 행을 볼 때 — 승격 대상)
    claimedSeconds: number | null, claimedCount: number | null, uncertifiedCount: number | null,
    lastCertifiedAt: number | null,
  }],
  summary: { total, fullyCertified, withMismatch, withUncertified },
};

type WorklogCertRow = {
  worklogId: string, issueId: string,
  issue: { issueKey: string | null, summary: string | null, projectKey: string | null },
  current: { started, seconds, created, updated } | null,   // null = Jira 에서 삭제됨
  currentFp: string | null,
  state: CertState,                                           // effectiveState(행, 현재) — 화면 표시용
  certification: null | {
    storedState: 'CERTIFIED' | 'MISMATCH' | 'DELETED',
    periodKey: string, certifiedStarted: number, certifiedSeconds: number, countedSeconds: number,
    certifiedAt: number, certifiedBy: string, certRev: number, mode: 'ENTRY' | 'MONTH',
    selfCertified: boolean,                                   // D8 본인 서명(certifiedBy = 작성자)
    frozen: WorklogSummary,                                   // 인증 시점에 동결한 요약
  },
  summary: WorklogSummary,                                    // 지금 계산한 요약(현재값 기준)
  certifiable: boolean,                                       // UNCERTIFIED·MISMATCH 이고 현재값이 그 월 안. 상위자 화면에서는 본인 서명 CERTIFIED(승격 대상)도 true
};

type MemberCertList = {
  accountId, displayName, periodKey, period, timeZone, unit, deletedHandling,
  thresholds: { lateDays: number, nearCloseHours: number, growthPercent: number },
  items: WorklogCertRow[],          // 현재 Jira 에 있는(조회자에게 보이는) 그 월 워크로그
  deleted: WorklogCertRow[],        // 그 월 귀속 인증 레코드 중 DELETED(조회자에게 보이는 이슈만)
  hiddenCount: number,              // 인증 레코드·미러에는 있으나 조회자에게 안 보이는 건수(내용 미표시)
  setDigest: string,                // items 의 (worklogId, currentFp) 집합 지문 — MONTH 인증 시 되돌려 보낸다
  totals: { claimedSeconds, certifiedSeconds, uncertifiedCount, mismatchCount, deletedCount },
  history: { enabled: boolean, since: number | null },
  users: { [accountId]: { displayName, avatarUrl } },        // 인증자·행위자
};

type CertifyResult = {
  batchKey: string,
  results: [{ worklogId, ok: true, state: 'CERTIFIED', certRev: number, unchanged: boolean, selfCertified: boolean, upgraded: boolean }
          | { worklogId, ok: false, code: string, cause?: object }],
  certified: number, unchanged: number, failed: number,
  remaining: string[],              // 시간 예산(15초) 초과로 처리하지 않은 worklogId
  monthTotals: { certifiedSeconds: number, certifiedCount: number },
};

type WorklogSummaryRow = {          // 타임시트 결재 상세 공용
  worklogId, issueId, issue, submitted: { started, seconds },
  summary: WorklogSummary,          // 이력 기반(현재값 대신 이력 마지막 after)
  certification: { state: CertState, certifiedSeconds, countedSeconds, selfCertified: boolean } | null,
};

type OwnCertList = MemberCertList & {
  selfCert: { eligible: boolean, reason: null | 'NOT_TEAM_LEAD' | 'UPPER_LEAD_EXISTS' | 'UPPER_LEAD_UNKNOWN', upperLeadCount: number },
};
```

### 2.4 범위 재확인(불변식 7) — 형제 resolver 전수

| 데이터 | 경로 | 좁히는 규칙 |
|---|---|---|
| 팀원 인증 집계 | `getCertificationMatrix` | 행 = `TeamScope.membersOf(lead,{teamKey})`. 집계 숫자만(이슈 정체는 내지 않음 — 기존 팀 매트릭스의 `totalSeconds` 와 같은 수준) |
| 팀원 워크로그·인증 상세 | `listMemberCertifications` | `scope.leads(lead, accountId)` false → `PERMISSION_TARGET_VIEW_DENIED`. 현재값은 **팀장 asUser** 수집(보이는 이슈·공개 범위만). 삭제 행은 `filterVisibleIssues`(asUser permissions/check)로 다시 거른다. 안 보이는 건은 `hiddenCount` 만 |
| 인증 쓰기 | `certifyWorklogs` | 같은 `leads` + 건마다 asUser `worklog/list` 응답에 있어야 함(안 보이면 `WORKLOG_NOT_FOUND`) + 작성자 = accountId + 월 안 |
| 본인 상태 | `getMyTimesheet` | 본인 live 항목 id 로만 조회 |
| 탭 배지 | `getIssueWorklogs` | 이력 카운트와 같은 자격(`countsForIssue` 의 eligible 계산을 공용 함수로 뽑아 둘이 쓴다) |
| 결재 상세 요약 | `getTimesheetWorklogHistory` | `TimesheetAccess.canView` + 스냅샷 항목 + 조회자 이슈 가시성 |
| 본인 인증 목록 | `listOwnCertifications` | SELF — 대상 = 호출자 고정(payload 에 accountId 없음). 현재값은 본인 asUser 수집 |
| 본인 인증 쓰기(D8) | `certifyOwnWorklogs` | SELF + 서비스가 `isTeamLead(me)` ∧ `upperLeadsOf(me)=∅` 를 **매 호출 다시** 확인(가드 통과 ≠ 자격). 건마다 asUser `worklog/list` 응답의 작성자 = 호출자. 팀장 축 resolver 와 저장소는 공유하되 진입 판정은 섞지 않는다 |
| 본인 인증 자격 표시 | `getTimesheetContext.certification` | 같은 `upperLeadsOf` — 표시와 쓰기 판정이 한 함수 |
| 상위자의 하위 팀장 건 | `getCertificationMatrix`·`listMemberCertifications`·`certifyWorklogs` | 하위 팀장은 상위자의 `membersOf` 에 MEMBER 로 들어 있으므로 추가 규칙 없음. 반대로 하위 팀장은 자기 행을 매트릭스에서 못 본다(membersOf 가 본인 제외) |
| 읽기/쓰기 대칭 | 매트릭스·펼침·인증·본인 목록·본인 인증·컨텍스트 | 모두 같은 `TeamScope` 인스턴스(invocation memo) — `leads` 와 `upperLeadsOf` 일관성은 계약 테스트 |

## 3. 도메인 (순수 함수 — `src/domain/worklogCertification/`)

SQL 무발행, Jira 무호출, `Date.now()` 금지. 시각·타임존·정책 값은 전부 인자(불변식 3).

### 3.1 `fingerprint.js` (확장)

| 함수 | 입력 → 출력 |
|---|---|
| `certFingerprintOf(state)` | `{worklogId, issueId, authorId, started, seconds}` → `string(16)` = base64url(sha256(JSON.stringify([worklogId, issueId, authorId, started, seconds])))의 앞 16자(96비트). 필드 누락·비유한수면 `null`. 설명·공개 범위는 넣지 않는다(Q103) |
| `setDigestOf(items)` | `[{worklogId, fp}]` → `string(16)`. worklogId 숫자 오름차순 정렬 후 같은 방식. 순서 무관·결정적 |

기존 `certificationSnapshot`·`observedCertificationState` 는 수정하지 않는다.

### 3.2 `state.js` — 상태 전이표

저장 상태(`worklog_cert.state`): `CERTIFIED` · `MISMATCH` · `DELETED`. 행 없음 = 미인증.
표시 상태(`CertState`): `UNCERTIFIED` · `CERTIFIED` · `MISMATCH` · `DELETED_AFTER_CERT`.

**관찰 전이 `planObservation(row, obs)`** — `obs = {deleted: boolean, fp, seconds, updated}`(트리거·스윕 asApp 또는 화면 asUser 현재값)

| 현재(저장) | 관찰 | 다음 | 부수 | transition |
|---|---|---|---|---|
| 없음 | 무엇이든 | 없음(no-op) | — | null |
| 어느 상태든 | `obs.updated < row.src_updated` (늦게 도착한 옛 관찰) | 그대로 | — | null |
| CERTIFIED | `fp == cert_fp` | CERTIFIED | — | null |
| CERTIFIED | `fp != cert_fp` | **MISMATCH** | `obs_fp, obs_seconds, src_updated, state_changed_at` | CERTIFIED→MISMATCH |
| CERTIFIED | deleted | **DELETED** | `obs_seconds=0, state_changed_at` | CERTIFIED→DELETED |
| MISMATCH | `fp == cert_fp` | **CERTIFIED**(Q102 자동 복구) | `obs_fp=null, obs_seconds=null, state_changed_at` | MISMATCH→CERTIFIED |
| MISMATCH | `fp != cert_fp`, `fp != obs_fp` | MISMATCH | `obs_fp, obs_seconds, src_updated` (state_changed_at 유지) | MISMATCH→MISMATCH (게시 값이 바뀌므로 touch) |
| MISMATCH | `fp == obs_fp` | MISMATCH | — | null |
| MISMATCH | deleted | **DELETED** | `obs_seconds=0, state_changed_at` | MISMATCH→DELETED |
| DELETED | 무엇이든 | DELETED(종단 — Jira 워크로그 id 는 되살아나지 않는다) | — | null |

반환: `{patch, transition} | null`. `transition = {from, to, periodKey, authorId}` 이면 Service/Recorder 가 아웃박스 touch.

**인증 계획 `planCertify(row, live, expect)`** — `live = {fp, started, seconds, updated, authorId, periodKey}`(asUser 현재값), `expect = {fp, lastSeq, currentLastSeq, subjectId, periodKey, selfCertified}` (`selfCertified` = 이번 인증이 본인 경로인가 — 경로 판정은 `certAuthority` 가 먼저 끝낸다)

| 조건(위에서부터 첫 일치) | 결과 |
|---|---|
| `live == null` | `{error:'WORKLOG_NOT_FOUND'}` |
| `live.authorId != expect.subjectId` | `{error:'WORKLOG_CERT_SUBJECT_MISMATCH'}` |
| `live.periodKey != expect.periodKey` | `{error:'WORKLOG_CERT_OUT_OF_PERIOD'}` |
| `live.fp != expect.fp` | `{error:'WORKLOG_CERT_STALE', cause:{reason:'FINGERPRINT'}}` |
| `expect.lastSeq != expect.currentLastSeq`(둘 다 null 이면 같음) | `{error:'WORKLOG_CERT_STALE', cause:{reason:'SEQ'}}` — 화면을 본 뒤 이력이 늘었다(설명만 바뀐 경우 포함) |
| `row == null` | `{action:'INSERT', certRev:1}` |
| `row.state == 'DELETED'` | `{error:'WORKLOG_CERT_DELETED'}` (live 가 있으면 사실상 불가능 — 방어) |
| `row.state == 'CERTIFIED' && row.cert_fp == live.fp && row.self_certified && !expect.selfCertified` | `{action:'UPGRADE', certRev: row.cert_rev + 1}` — 상위자가 본인 서명 건을 같은 값으로 확인(D8). 이전 판을 log 로 보관, `self_certified=0` |
| `row.state == 'CERTIFIED' && row.cert_fp == live.fp` | `{action:'UNCHANGED'}` (본인 경로가 상위자 인증 건을 다시 눌러도 강등하지 않는다) |
| 그 밖(MISMATCH, 또는 관찰이 아직 안 온 CERTIFIED+다른 fp) | `{action:'RECERTIFY', certRev: row.cert_rev + 1}` — 이전 판을 log 로 보관. `self_certified = expect.selfCertified` |

쓰기 결과의 `self_certified` 는 INSERT·RECERTIFY 면 `expect.selfCertified`, UPGRADE 면 0, UNCHANGED 면 기존 값.

**인증 자격 `certAuthority({actorId, subjectId, actorIsTeamLead, actorLeadsSubject, upperLeads})`** (`authority.js` 신규 — 조회는 Service, 판정만 순수)

| 조건(위에서부터) | 결과 |
|---|---|
| `actorId != subjectId && actorLeadsSubject` | `{ok:true, selfCertified:false}` (경로 1·1') |
| `actorId != subjectId` | `{error:'PERMISSION_TARGET_VIEW_DENIED'}` |
| `upperLeads === null`(조회 실패) | `{error:'WORKLOG_CERT_SELF_DENIED', cause:{reason:'UPPER_LEAD_UNKNOWN', upperLeadCount:0}}` |
| `!actorIsTeamLead` | `{error:'WORKLOG_CERT_SELF_DENIED', cause:{reason:'NOT_TEAM_LEAD', upperLeadCount: upperLeads.size}}` (팀원·팀 없는 사람 — D7·Q111) |
| `upperLeads.size > 0` | `{error:'WORKLOG_CERT_SELF_DENIED', cause:{reason:'UPPER_LEAD_EXISTS', upperLeadCount}}` |
| 그 밖 | `{ok:true, selfCertified:true}` (경로 2 — D8) |

`certifyWorklogs` 는 payload `accountId` 가 호출자와 같으면 `certAuthority` 를 부르기 전에 `WORKLOG_CERT_SELF_DENIED`(`cause.reason:'TEAM_LEAD_AXIS'`)로 끊는다 — 팀장 축으로는 본인 인증이 절대 열리지 않는다. `certifyOwnWorklogs` 는 `actorId = subjectId` 로 호출한다.

**표시 상태 `effectiveState(row, live)`**

| row | live | 결과 |
|---|---|---|
| null | 있음 | UNCERTIFIED |
| DELETED | — | DELETED_AFTER_CERT |
| CERTIFIED/MISMATCH | null(현재 목록에 없음·삭제 확인됨) | DELETED_AFTER_CERT 가 아니라 **저장 상태 그대로**(삭제 확정은 관찰 경로만 한다 — 안 보이는 것과 삭제를 구분 못 한다) |
| CERTIFIED/MISMATCH | `live.fp == cert_fp` | CERTIFIED |
| CERTIFIED/MISMATCH | `live.fp != cert_fp` | MISMATCH |

### 3.3 `counting.js` — 인증된 시간 계산(D1·Q101)

| 함수 | 규칙 |
|---|---|
| `countedSeconds(row, {deletedHandling})` | CERTIFIED → `cert_seconds`. MISMATCH → KEEP: `cert_seconds` / ZERO: `min(cert_seconds, obs_seconds ?? cert_seconds)`. DELETED → KEEP: `cert_seconds` / ZERO: `0` |
| `monthTotals(rows, policy)` | `{certifiedSeconds: Σ countedSeconds, certifiedCount, mismatchCount, deletedCount, lastCertifiedAt}` |

D1 기본값 권고 = **KEEP**: 인증 이후 Jira 삭제는 대부분 정리·실수이고, 인증 레코드가 원본이라는 요구 §1 과 일치한다. 감액을 즉시 반영하고 싶은 고객만 ZERO.

### 3.4 `summary.js` — 판단 요약·신호

| 함수 | 입력 → 출력 |
|---|---|
| `summarizeWorklog({historyRows, live, period, closeAt, thresholds})` | `historyRows` = 그 워크로그의 이력 행(seq 오름차순, `historyItemOf` 이전의 Repository 행), `live = {started, seconds, created, updated, authorId}` 또는 null(그때는 이력 마지막 after 를 final 로) → `WorklogSummary` |
| `signalsOf(...)` | 위 계산의 신호 부분만(테스트 단위) |
| `encodeFrozen(summary)` / `decodeFrozen(columns)` | 요약 ↔ `worklog_cert` 의 6개 칼럼(`first_started, first_seconds, edit_count, last_seq, signal_mask, late_days`). final 은 인증값(cert_started/cert_seconds) |
| `thresholdsOf(policyValues)` | `{lateDays, nearCloseHours, growthPercent}` |
| `closeAtOf({periodEnd, autoCloseDays, timeZone})` | `domain/timesheet/lock.autoCloseAtOf` 재사용, autoCloseDays=0 이면 `periodEnd` |

**신호 정의**(비트 = `signal_mask`)

| 비트 | 코드 | 조건 | 기준값(정책) |
|---|---|---|---|
| 1 | `LATE_ENTRY` | `lateDays = floor((created − started)/1일) ≥ lateDays` (created 는 live.created, 없으면 CREATED 행 changed_at. BASELINE 뿐이면 판단 불가 → 비트 없음) | `certSignalLateDays` 기본 **7**, 0 = 끔 |
| 2 | `NEAR_CLOSE_EDIT` | 실제 수정이 있었고(editCount>0 또는 `updated − created > 60초`) 마지막 수정 시각 ≥ `closeAt − nearCloseHours` | `certSignalNearCloseHours` 기본 **24**, 0 = 끔 |
| 4 | `GROWTH` | first 있음, `final.seconds − first.seconds ≥ 1800`(상수 30분 — 10분→20분 같은 잡음 제거) 이고 증가율 ≥ growthPercent | `certSignalGrowthPercent` 기본 **50**, 0 = 끔 |
| 8 | `OTHER_ACTOR` | 이력 행 중 actor 가 작성자와 다른 것(`'='`·null 아님)이 하나라도 | 항상 |
| 16 | `OUTSIDE_APP` | 이력 행 중 `source='JIRA'`(우리 화면 밖 — REST·자동화·모바일·기본 UI)인 CREATED/UPDATED 가 하나라도 | 항상 |
| 32 | `OBSERVED_LATE` | `source='SWEEP'` 행(누락 보정으로 본 변경 — 경로·행위자 불명, `gapPossible`) | 항상 |
| 64 | `NO_HISTORY` | 이력 행이 하나도 없음(수집 꺼짐·설치 전) — 판단 근거 부족 알림 | 항상 |

### 3.5 `policy.js`

`certPolicyOf(values)` → `{unit, deletedHandling, thresholds, rev}`. `rev = 'cp1:' + sha256(canonical({u,d,l,n,g})) 앞 8 hex` — 게시 `pr`·묶음 `policy_json` 에 같이 싣는다.

### 3.6 테스트 케이스 목록

- fingerprint: 같은 입력 같은 값 / 필드 하나 다르면 다름 / 설명 차이 무시 / 누락 → null / `setDigestOf` 순서 무관
- `planObservation`: 표의 10행 각각 + 늦은 관찰 무시 + DELETED 종단
- `planCertify`: 표 순서대로 10 케이스 + lastSeq null/null 같음, null/3 다름 + **D8**: 본인 INSERT 시 `self_certified=1` 기록 / 본인 RECERTIFY(MISMATCH) 시 1 / 상위자가 본인 건 같은 fp → UPGRADE·0 / 본인이 상위자 인증 건 같은 fp → UNCHANGED(강등 없음) / 상위자가 본인 건 다른 fp(MISMATCH) → RECERTIFY·0
- `certAuthority`(D8): 팀장→팀원 허용(self=false) / 팀장 아닌 사람→남 거부 / **상위자 있음 + 본인 → 거부(`UPPER_LEAD_EXISTS`, count)** / **상위자 없음 + 팀장 본인 → 허용(self=true)** / 팀원 본인 → `NOT_TEAM_LEAD` / 팀 없는 비팀장 본인 → `NOT_TEAM_LEAD`(Q111) / 상위자 조회 실패 → `UPPER_LEAD_UNKNOWN`
- `TeamScope.upperLeadsOf`(통합, 순수 아님): 명부만 / 워크포스가 결재자를 정함(명부 상위 팀 무시) / 한 팀 LEAD 여럿 → 전원 / 본인이 자기 팀 LEAD 이자 다른 팀 MEMBER / 워크포스 실패 → throw / **`leads` 와의 일관성 속성 테스트**
- `effectiveState`: 5 케이스(특히 live 없음 ≠ 삭제)
- `countedSeconds`: 3상태 × KEEP/ZERO = 6 + MISMATCH 증가(ZERO 여도 cert 값)
- `summarizeWorklog`: 이력 없음(NO_HISTORY) / BASELINE 시작 / 지연 입력 경계(6일·7일) / 마감 직전 경계 / 증가 29분(무신호)·30분 50% / 타 행위자 / JIRA·SWEEP 출처 / 삭제 행 포함
- `encodeFrozen`↔`decodeFrozen` 왕복
- `certPolicyOf` rev 결정적

## 4. 백엔드

### 4.1 파일

| 파일 | 역할 |
|---|---|
| `src/resolver/worklogCert/WorklogCertController.js` | `guardedDefine` 3개 |
| `src/resolver/worklogCert/WorklogCertService.js` | 매트릭스·펼침·인증 + `forMyTimesheet`·`forIssueWorklogs`·`forTimesheetDetail`(다른 서비스가 부르는 읽기) |
| `src/resolver/worklogCert/WorklogCertRepository.js` | `worklog_cert`·`_batch`·`_log` CAS·집계 |
| `src/resolver/timesheet/TeamScope.js` | `upperLeadsOf(accountId)` 추가(§1.2 — 명부 `findMemberTeam`→그 팀 LEAD, 워크포스 `forSubject`·`overriddenSubjects` 합성, 실패 throw, memo). `TeamRepository.findTeamLeads(teamKey)` 1개 추가 |
| `src/resolver/worklogCert/WorklogCertObserver.js` | 관찰 → 전이 → touch (Recorder·화면 공용, **throw 하지 않음**) |
| `src/resolver/timesheet/WorklogCollector.js` | `collectForAuthor({accountId, range, timeZone})` 추가 — asUser(팀장 컨텍스트), JQL `worklogAuthor = "<accountId>"`(ACCOUNT_ID 정규식 검증 후), 상한은 `collectMine` 과 동일(`TIMESHEET_TOO_LARGE`). `fetchWorklogsByIdAsUser(ids)` 추가 — `POST /rest/api/3/worklog/list`(asUser, ≤1000/호출) |
| `src/resolver/worklogHistory/WorklogHistoryRepository.js` | `listByWorklogIds(ids, {perWorklogCap:50, totalCap:5000})` 추가(요약용 칼럼만) · 미러 집계 `mirrorTotals(authorIds, start, end)` 추가 |
| `src/integration/workforce/{contract,certificationDoc}.js` | §4.6 |
| `src/resolver/workforce/{WorkforcePublisher,WorkforceOutbox,WorkforceLinkRepository,WorkforceLinkService}.js` | 인증 문서 배출·스캔·touch·상태 |

### 4.2 `listMemberCertifications` 흐름

1. 정책(`settingsRepository.getPolicy` 1회) → 타임존·단위·기준값. 월 키 검증(`parsePeriodKey` MONTH), `periodRange`.
2. `scope.leads(lead, accountId)` false → 거부.
3. 병렬: (a) `collector.collectForAuthor` asUser — 현재값·이슈 메타·created/updated (b) `repo.listByPeriodAuthor(periodKey, accountId)` (c) `history.mirrorIds(accountId, range)`(미러에 있는 그 월 워크로그 id — hiddenCount 용).
4. live 워크로그 id ∪ 인증 행 id 로 `history.listByWorklogIds` 1회 → 워크로그별 `summarizeWorklog`.
5. 인증 행 중 live 에 없는 것: DELETED 면 `filterVisibleIssues` 로 걸러 `deleted[]`, 나머지(안 보임·다른 월로 옮겨감 등)는 `hiddenCount`. 미러에만 있고 live 에 없는 id 도 `hiddenCount`.
   - 다른 월로 옮겨간 인증 건: live 에서 그 월에 없으면 이 화면엔 숨김 수만 오르고, 옮겨간 월 화면에 MISMATCH 로 나온다(행의 `period_key` 는 인증 월 그대로).
6. **화면 관찰 반영**: live fp ≠ 저장 cert_fp 인데 저장 상태가 CERTIFIED 인 행(또는 반대로 복구)은 `observer.observeLive` 로 CAS 반영(최대 50건, 실패 무시) — 트리거 누락분을 화면이 메운다. 이 쓰기는 상태를 "미인증 쪽"으로만 옮기거나 Q102 복구만 하며, 인증을 만들지는 않는다.
7. `setDigest = setDigestOf(items)`. 사용자 표시 `loadUsers`(인증자·행위자) 1회.

### 4.3 `certifyWorklogs` 흐름 (시간 예산 15초, 부분 성공)

1. 형식 검증: `batchKey` uuid v4, items 1~200, worklogId 숫자, fp 16자, 중복 제거. `mode == certPolicy.unit` 아니면 `WORKLOG_CERT_UNIT_MISMATCH`.
2. `scope.leads` → 아니면 거부. 작성자 = 호출자 → `WORKLOG_CERT_SELF_DENIED`.
3. PIN: `pinVerifier(lead, pin)` 1회(묶음당).
4. 묶음 행: `INSERT IGNORE worklog_cert_batch` — 이미 있으면 같은 (actor, subject, period, mode)인지 확인, 다르면 `WORKLOG_CERT_BATCH_CONFLICT`. 같으면 재시도로 보고 계속(건별 UNCHANGED 로 수렴 — 멱등).
5. 현재값: `fetchWorklogsByIdAsUser(ids)` 1회 → `certFingerprintOf`, `periodKeyOf(started, MONTH, tz)`. 프로젝트 id: 미러 → 없으면 asUser `POST /rest/api/3/issue/bulkfetch fields=project`(≤100 이슈/호출).
6. 이력: `listByWorklogIds` 1회 → `currentLastSeq`·요약(동결용). 기존 인증 행: `findMany(ids)` 1회.
7. 건마다 `planCertify` → 묶음 처리:
   - INSERT 들: 다건 `INSERT IGNORE ... VALUES (...),(...)` 50행 단위. 삽입 안 된 행(경합)은 재조회 후 RECERTIFY/UNCHANGED 경로로.
   - RECERTIFY 들: 건마다 ① `INSERT IGNORE worklog_cert_log` (현재 행 복사, PK `(worklog_id, cert_rev)` — **결정적 id**, 불변식 6) ② `UPDATE worklog_cert SET ..., cert_rev=?, rev=rev+1 WHERE worklog_id=? AND rev=?`(불변식 4). CAS 실패 시 재조회·재계획 최대 3회 → `WORKLOG_CERT_CONFLICT`.
   - 각 건 처리 전 `clock() − startedAt > 15_000` 이고 처리한 건이 1개 이상이면 나머지는 `remaining`(최소 1건 진전 약속 — 실행기 무한 루프 방지).
8. 묶음 행 `item_count` 갱신. 아웃박스 `touchCert(accountId, periodKey)` + RECERTIFY 로 월이 바뀐 건의 옛 월도 touch(던지지 않음).
9. `monthTotals` 재계산(SQL 1)해 응답.

**CAS 지점 요약**: `worklog_cert` 의 모든 UPDATE 는 `WHERE rev=?` + `SET rev=rev+1`. 행 삭제 경로는 없다(보관 정리는 후속 Q107). 승인자 행 규칙(불변식 5)은 결재 엔진을 안 타므로 해당 없음.

### 4.3.1 본인 경로(D8) — `listOwnCertifications`·`certifyOwnWorklogs`

- 둘 다 `WorklogCertService` 의 같은 내부 함수(`listFor(subjectId, viewer)`·`certifyFor(subjectId, actor)`)를 쓰고, 진입부만 다르다.
- `listOwnCertifications`: 현재값 수집은 `collectMine`(본인 asUser — `/myself` 대조 포함). `selfCert` 는 `certAuthority({actorId:me, subjectId:me, actorIsTeamLead, actorLeadsSubject:false, upperLeads})` 의 결과를 그대로 싣는다(인증 가능 여부 표시). 화면 관찰 반영(§4.2-6)은 같다.
- `certifyOwnWorklogs`: ① `isTeamLead(me)`·`upperLeadsOf(me)` 조회(SQL, 워크포스 연동 시 asUser 프로퍼티 읽기 — 기존 `WorkforceOrgSource` 경로) ② `certAuthority` 거부면 즉시 throw(PIN 확인 전 — 자격 없는 사람의 PIN 실패 횟수를 올리지 않는다) ③ 이후는 §4.3 의 3~9 와 같고 `expect.selfCertified=true`, 묶음 행 `actor_account = subject_account = me`.
- **경합**: 본인 인증 진행 중 관리자가 상위 팀을 만들면? 자격은 호출 시작 시 1회 판정한다(한 호출 ≤15초). 다음 호출(실행기의 `remaining` 재전송)은 다시 판정하므로 거기서 멈춘다.

### 4.4 관찰 경로(트리거·스윕) — `WorklogCertObserver`

- `WorklogHistoryRecorder` 가 지금 옛 `certificationRepository` 로 하는 3곳(`wants`·`scopeOf` 의 contexts·`observe` 루프의 `certification.observe`, `sweep` 의 `hasTracked`)을 **새 observer 로 바꾼다**. 옛 테이블 관찰은 끊는다(Q106 동결).
- 입력은 Recorder 가 이미 가진 asApp 현재값(`fetchCurrent` — 추가 asApp 호출 없음, AGENTS asApp 1번 범위 그대로: 지문 계산·상태 판정).
- `observe(changes, now)`: 인증 행이 있는 id 만 `findMany` 1회 → 건별 `planObservation` → CAS(3회) → transition 있으면 `outbox.touchCert`. 건별 예외는 삼킨다(트리거 규칙).
- 지연: 이벤트 누락은 이력 스윕(시간당, `/worklog/updated`·`/deleted` since)이 메운다. 그 사이는 화면 관찰(§4.2-6)이 메운다. 게시 반영 = 관찰 + 5분.

### 4.5 정책 키 (요구 §4.1·3번)

**위치: `CATALOG`(정책 계층) 에 `siteOnly:true` 로.** `approvalUnit`·`timeZone` 과 같은 자리.
이유: ① 사용자×월 합계(D5)는 한 달에 여러 프로젝트가 섞이므로 프로젝트별 단위·삭제 처리가 다르면 합계를 정의할 수 없다 ② `siteOnly` 는 `merge.js` 가 워크포스 `rms.policy` 잠금에서도 건너뛴다(워크포스가 인증 기준을 바꾸지 못한다 — 판정은 우리 DB) ③ `normalizeOverride` 가 프로젝트·이슈 덮어쓰기를 거부한다.

| CATALOG 키 | type | 값 | 기본 | KVS(`SETTINGS_KEYS`) |
|---|---|---|---|---|
| `certificationUnit` | enum | `ENTRY`·`MONTH` | **`MONTH`** (타임시트 기본 단위 결정과 같은 결; 고객 핵심이 월 정산) | `approval:settings:certificationUnit` |
| `deletedCertifiedHandling` | enum | `KEEP`·`ZERO` | **`KEEP`** (§3.3) | `approval:settings:deletedCertifiedHandling` |
| `certSignalLateDays` | integer 0~365 | | **7** | `approval:settings:certSignalLateDays` |
| `certSignalNearCloseHours` | integer 0~720 | | **24** | `approval:settings:certSignalNearCloseHours` |
| `certSignalGrowthPercent` | integer 0~1000 | | **50** | `approval:settings:certSignalGrowthPercent` |

동반 수정(하나라도 빠지면 정책 조회 전체가 죽는다 — CLAUDE.md 함정):
- `SettingsRepository`: `SETTINGS_KEYS` 5개, `DEFAULT_APPROVAL_SETTINGS` 5개, **`GLOBAL_ONLY_KEYS` 에 5개 추가**(안 넣으면 `PROJECT_OVERRIDABLE_KEYS` 계산식이 siteOnly·no-legacy 키를 프로젝트 덮어쓰기 가능으로 분류한다 — `HIERARCHY_ONLY_PROJECT_KEYS` 는 `!siteOnly` 만 잡는다).
- `SettingsService.normalizeSettingsPatch` 정규화기 5개. `certificationUnit`·`deletedCertifiedHandling` 변경 시 `touchCertYears`(인증 문서 연도 표식, §4.6) — 게시 본문 `u`·`cs`·`pr` 이 바뀐다.
- 계약 테스트: `SettingsPolicyKeys.test.js`(기본값 ↔ KVS 키 집합) 가 그대로 대조. 추가 단언: CATALOG 의 `siteOnly` 키가 전부 `GLOBAL_ONLY_KEYS` 에 있다.
- 정책 키 읽기 비용: `getPolicy()` 는 청크 조회라 키 5개 추가로 KVS 동시성 문제 없음(청크 유지).

### 4.6 워크포스 계약 v2 (승인 앱 쪽)

**contract.js 추가**(워크포스 리포에 그대로 복사되는 파일)

| 항목 | 값 |
|---|---|
| typ | `TYP.APPROVAL_CERT = 'approval.cert'`, `TYP_FAMILY` = APPROVAL(승인 앱 키로만 검증) |
| ent | `entOf('approval.cert', {accountId, periodKey})` — 다른 사용자·다른 달로 복사 재사용 차단 |
| 문서 키 | `CERT_DOC_PREFIX = 'movesApproval.cert.'`, `certDocKeyOf('2026-10') = 'movesApproval.cert.2026-10'`(25자, `workforce_publish.doc_key VARCHAR(32)` 안). `periodOfCertDocKey(key)`. 연도 표식 `certMarkerKeyOf('2026') = 'movesApproval.cert.2026'` |
| 문서 판별 | 기존 `yearOfDocKey` 는 `movesApproval.cert.*` 에 null 을 돌려준다(4자리 숫자 아님) → v1 경로와 충돌 없음. 배출은 `docKindOf(docKey)` 로 `TIMESHEET_YEAR`·`CERT_MONTH`·`CERT_MARKER` 분기 |
| 버전 | `CERT_DOC_VERSION = 2`, `CERT_DOC_KIND = 'movesApproval.certification'`. **`CONTRACT_VERSION`(=1, v1 문서 `v`) 은 올리지 않는다** — 올리면 v1 문서 전부의 publishedDigest 가 바뀌어 일일 대조가 전량 재게시한다 |
| 상한 | `CERT_LIST_MAX = 1000` |

**문서 shape** (사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}`)

```json
{
  "v": 2, "kind": "movesApproval.certification",
  "accountId": "712020:…", "periodKey": "2026-10", "updatedAt": 1791000000000,
  "entry": {
    "u": "MONTH", "dh": "KEEP",
    "cs": 576000, "cn": 58, "mn": 2, "dn": 1, "sc": 0, "sn": 0,
    "pr": "cp1:1a2b3c4d", "at": 1790990000000,
    "ps": 1790780400000, "pe": 1793458800000,
    "w": [["10234567", 28800], ["10234570", 14400, 1], ["10234588", 7200, 4]],
    "wn": 61,
    "kid": "…", "iat": 1791000000000, "sig": "<86자 base64url>"
  }
}
```

| 필드 | 의미 |
|---|---|
| `u` | 인증 단위 정책(ENTRY/MONTH) — 표시용. 저장은 항상 건별 |
| `dh` | 삭제·감소 처리 정책(KEEP/ZERO) |
| `cs` | **인증된 시간 합(초)** = `monthTotals.certifiedSeconds`. 워크포스 원가·정산의 단일 입력 |
| `cn`·`mn`·`dn` | CERTIFIED·MISMATCH·DELETED 건수 |
| `sc`·`sn` | **본인 서명(D8)** 분의 인증 시간 합(초, `cs` 에 포함된 부분)·건수. 상위자 없는 팀장의 자기 인증만 0 이 아니다. 워크포스는 `cs − sc` 를 "제3자 확인분"으로 구분할 수 있다. 항상 싣는다(0 이어도) — 필드 유무로 의미가 갈리지 않게 |
| `pr` | 정책 rev(§3.5) |
| `at` | 그 달 마지막 인증 시각(없으면 생략) |
| `ps`·`pe` | 월 경계 ms(인증 시점 타임존) |
| `w` | `[worklogId, countedSeconds, flag?]` — flag 는 **비트**: 생략(0)=CERTIFIED·제3자, 1=MISMATCH, 2=DELETED, 4=본인 서명(D8). 조합 가능(5 = 본인 서명 후 변경, 6 = 본인 서명 후 삭제). 한 자리라 크기 불변. worklogId 숫자 오름차순. **단위와 무관하게 항상 싣는다** — 워크포스 원가는 프로젝트별이라 워크로그→이슈→프로젝트 귀속이 필요하다(요구서는 "건별 모드면"이었으나, 월 모드에서 합계만 주면 워크포스가 프로젝트 배분을 할 수 없다. 계약 결정으로 변경 — §12 에 명시) |
| `wn` | 전체 건수. `w.length < wn` 이면 잘림 |
| `wt` | 잘렸으면 `true`. 이때 `cs`·`cn` 은 전체 기준 그대로 |

**32KB 계산** (게시 판정은 기존 `DOC_SIZE_LIMIT = 30,000` 바이트 — 32,768 보다 2.7KB 여유)
- 고정부: `v`·`kind`(≈45) + `accountId`(≈60) + `periodKey`(≈22) + `updatedAt`(≈25) + `entry` 의 스칼라 11개(`sc`·`sn` 추가 ≈ +25, 합 ≈195) + `kid`·`iat`·`sig`(≈130) ≈ **475B**
- 항목: `["1234567890",28800,6],` 최대 **23B**(id 10자리·초 5자리·flag 한 자리 — 본인 비트를 더해도 최대 6 이라 자릿수 불변). 1,000건 = 23,000B
- 최댓값 ≈ 23,475B ≈ 23.5KB < 30,000(재계산 — D8 추가분은 고정부 +25B 뿐). 현실값: 200명 중 상위가 월 150건 ≈ 3.9KB, 평균 월 100건 ≈ 2.5KB
- 1,000건 초과: id 오름차순 앞 1,000건만 + `wt:true`. 워크포스 규칙(§12): 목록에 없는 워크로그는 "인증 여부 불명"으로 표시하고 합계는 `cs` 로만. 그래도 `byteSize > DOC_SIZE_LIMIT`(id 가 비정상적으로 길 때)면 기존과 같이 `PUBLISH_TOO_LARGE` 로그
- 문자는 전부 ASCII(계정 id·숫자·base64url) → JSON 길이 = 바이트 수(UTF-8). 실측은 U2

**순수 빌더** `src/integration/workforce/certificationDoc.js`
- `certEntryBodyOf({rows, policy, range})` → body | null(그 달 인증 행이 하나도 없으면 null — 문서 안 씀)
- `buildCertDoc({accountId, periodKey, body, cloudId, kid, now, signer})` → `{value, contentDigest, publishedDigest, byteSize, entryCount}` — `contentDigest` 는 `iat`·`sig`·`updatedAt` 제외(같은 내용이면 PUT 생략), kid 포함
- validators[`approval.cert`]: `u`∈{ENTRY,MONTH}, `dh`∈{KEEP,ZERO}, `cs`·`cn`·`mn`·`dn`·`sc`·`sn`·`wn` 0 이상 정수, `sc ≤ cs`·`sn ≤ cn+mn+dn`, `pr` `/^cp1:[0-9a-f]{8}$/`, `ps<pe`, `w` 배열 ≤1000·각 원소 `[NUMERIC_ID 문자열, 0 이상 정수, (1|2|4|5|6)?]`, `wt` boolean 선택

**발행 트리거**

| 계기 | touch |
|---|---|
| `certifyWorklogs` 성공 건 ≥1 | `(accountId, certDocKeyOf(periodKey))` + 재인증으로 월이 바뀐 건의 옛 월 |
| 관찰 전이(Observer — 트리거·스윕·화면) | `(authorId, certDocKeyOf(row.period_key))` |
| 정책 `certificationUnit`·`deletedCertifiedHandling` 변경, `workforceLinkEnabled` false→true, 관리자 재게시 ALL | 연도 표식 `('*', certMarkerKeyOf(올해·작년))` |
| 키 교체(kid 변경) | 기존 `touchKidMismatch` 가 doc_key 무관하게 처리 |

놓친 touch 보정: 스윕 ② 변경 스캔에 **인증 쪽 커서**를 추가 — 잡 `wf-cert-scan`, `worklog_cert` 의 `(updated_at, worklog_id)` 키셋(인덱스 `ix_wcert_updated`), `SCAN_SETTLE_MS` 동일, touch 성공 페이지까지만 커서 전진(AGENTS 규칙).
연도 표식 펼침: `universeOfCert(year)` = `SELECT DISTINCT author_account, period_key FROM worklog_cert WHERE period_key LIKE 'YYYY-%'`(상한 `UNIVERSE_MAX`).

**미설치·미연결이면 게시 생략(D6)**
- 기존 차단(`blockedState`: 꺼짐·crypto·키·cloudId)은 v1·v2 공통.
- v2 만 추가 판정 `certLinkState()`: `workforce_inbound` 에 **서명 검증 통과(`status='VERIFIED'`) 행이 최근 30일 안 `verified_at`** 이 하나라도 있으면 `LINKED`, 아니면 `NOT_LINKED`. 워크포스가 없거나 서로 키가 안 맞으면 검증 통과 게시물이 없다 → 게시하지 않는다.
- `NOT_LINKED` 면 인증 문서 행은 **배출 대상에서 SQL 로 뺀다**(`listDue` 에 `AND doc_key NOT LIKE 'movesApproval.cert.%'`). 그냥 건너뛰면 매 tick 같은 50행을 다시 집어 v1 배출이 굶는다. 행은 pending 으로 남아 연결되는 순간 전부 게시된다(백필).
- 인증 자체는 이 판정과 무관하게 동작한다.

**v1 과의 공존·전환**: v1(`movesApproval.{YYYY}`, typ `approval.timesheet`)은 **그대로 유지**한다. 타임시트 결재(선택 기능)를 쓰는 고객의 기간 승인 상태다. 통합하지 않는 이유 ① 단위가 다르다(v1 은 WEEK 가능, v2 는 항상 월) ② 의미가 다르다(기간 결재 상태 vs 건별 인증 시간) ③ 연 단위 문서에 건별 목록을 넣으면 32KB 를 넘는다(D5) ④ v1 을 고치면 전량 재게시. 워크포스는 원가·정산에 **v2 만** 쓰고, v1 은 현황 배지(결재 상태)로만 쓴다(§12).

## 5. 스키마·마이그레이션

### 5.1 기존 테이블 확장 vs 신규 — 결정: **신규**

| 기준 | 기존 `worklog_certification` 확장 | 신규 `worklog_cert` |
|---|---|---|
| 행 크기 | `snapshot_json`(JSON ≈250B)·`fingerprint`/`verified_fingerprint` CHAR(64)×2·`latest_request_id` 를 떠안아 ≈600B. 목표 150B 불가 | ≈175B(아래) |
| 의미 | 상태가 결재 요청형(`UNVERIFIED/PENDING/VERIFIED/REJECTED/CHANGED_AFTER_VERIFICATION`). 같은 칼럼에 두 모델이 섞인다 | 인증 모델 전용 |
| 인덱스 | 월·작성자 인덱스 없음 → ALTER 2~3개 | 처음부터 |
| 동시 작업 | `WorklogCertificationRepository` 는 다른 세션이 수정 중 | 새 파일이라 충돌 없음 |
| 옛 데이터 | 그대로 쓰는 경로(승인 상세·증명서·보관)가 있다 | 옛 테이블은 동결해 그 경로를 살린다 |

### 5.2 DDL (`src/rdb/schema/ddl/worklogCert.sql.js`)

```sql
-- v049_create_worklog_cert
CREATE TABLE IF NOT EXISTS worklog_cert (
    worklog_id        VARCHAR(20)  NOT NULL,
    author_account    VARCHAR(128) NOT NULL,
    issue_id          VARCHAR(20)  NOT NULL,
    project_id        VARCHAR(20)  NULL,
    period_key        CHAR(7)      NOT NULL,          -- 인증 월(인증 시점 사이트 TZ). 재인증 때만 바뀐다
    state             VARCHAR(10)  NOT NULL,          -- CERTIFIED | MISMATCH | DELETED
    cert_started      BIGINT       NOT NULL,          -- 인증값(고정) ms
    cert_seconds      INT          NOT NULL,
    cert_fp           CHAR(16)     NOT NULL,
    src_updated       BIGINT       NULL,              -- 마지막으로 반영한 Jira updated(늦은 관찰 무시)
    obs_fp            CHAR(16)     NULL,              -- MISMATCH 때만
    obs_seconds       INT          NULL,              -- MISMATCH·DELETED 때만(ZERO 계산)
    batch_id          BINARY(16)   NOT NULL,          -- 인증자·시각·모드·정책은 묶음 행에
    cert_rev          SMALLINT     NOT NULL DEFAULT 1,
    self_certified    TINYINT(1)   NOT NULL DEFAULT 0, -- D8 본인 서명(인증자 = 작성자). UPGRADE 로만 1→0
    first_started     BIGINT       NULL,              -- 동결 요약 6칼럼
    first_seconds     INT          NULL,
    edit_count        SMALLINT     NOT NULL DEFAULT 0,
    last_seq          INT          NULL,
    signal_mask       SMALLINT     NOT NULL DEFAULT 0,
    late_days         SMALLINT     NULL,
    state_changed_at  TIMESTAMP    NULL,
    updated_at        TIMESTAMP    NOT NULL,
    rev               INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (worklog_id),
    INDEX ix_wcert_period_author (period_key, author_account),
    INDEX ix_wcert_updated (updated_at, worklog_id)
)

-- v050_create_worklog_cert_batch
CREATE TABLE IF NOT EXISTS worklog_cert_batch (
    batch_id          BINARY(16)   NOT NULL,          -- 클라이언트 batchKey(uuid v4) — 재시도 멱등
    actor_account     VARCHAR(128) NOT NULL,
    subject_account   VARCHAR(128) NOT NULL,          -- 본인 인증(D8) = actor_account = subject_account 로 파생(칼럼 두지 않음)
    period_key        CHAR(7)      NOT NULL,
    mode              VARCHAR(8)   NOT NULL,          -- ENTRY | MONTH
    pin_verified      TINYINT(1)   NOT NULL DEFAULT 0,
    policy_json       VARCHAR(255) NOT NULL,          -- {"u","d","l","n","g","rev"}
    set_digest        CHAR(16)     NULL,              -- MONTH: 팀장이 본 목록 지문(증거)
    item_count        INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL,
    PRIMARY KEY (batch_id),
    INDEX ix_wcb_subject (subject_account, period_key)
)

-- v051_create_worklog_cert_log  (재인증으로 덮이기 전 판 — append-only)
CREATE TABLE IF NOT EXISTS worklog_cert_log (
    worklog_id        VARCHAR(20)  NOT NULL,
    cert_rev          SMALLINT     NOT NULL,          -- (worklog_id, cert_rev) = 결정적 id(불변식 6)
    self_certified    TINYINT(1)   NOT NULL DEFAULT 0,
    author_account    VARCHAR(128) NOT NULL,
    issue_id          VARCHAR(20)  NOT NULL,
    period_key        CHAR(7)      NOT NULL,
    state             VARCHAR(10)  NOT NULL,
    cert_started      BIGINT       NOT NULL,
    cert_seconds      INT          NOT NULL,
    cert_fp           CHAR(16)     NOT NULL,
    obs_seconds       INT          NULL,
    batch_id          BINARY(16)   NOT NULL,
    first_started     BIGINT       NULL,
    first_seconds     INT          NULL,
    edit_count        SMALLINT     NOT NULL DEFAULT 0,
    last_seq          INT          NULL,
    signal_mask       SMALLINT     NOT NULL DEFAULT 0,
    late_days         SMALLINT     NULL,
    state_changed_at  TIMESTAMP    NULL,
    superseded_by     BINARY(16)   NOT NULL,          -- 덮은 묶음
    superseded_at     TIMESTAMP    NOT NULL,
    PRIMARY KEY (worklog_id, cert_rev)
)

-- v052_index_worklog_mirror_author_started  (매트릭스 미인증 건수·주장 시간)
CREATE INDEX IF NOT EXISTS ix_wlm_author_started ON worklog_mirror (author_account, started)
```

- 시각 바인딩은 `SqlTime` 경계(`toSqlTimestamp`) — TIMESTAMP 에 숫자 금지(CLAUDE.md 함정). `cert_started`·`src_updated` 는 BIGINT ms(미러·이력과 같은 단위).
- `TableReadiness`: 세 테이블 미준비면 매트릭스·펼침은 `STORAGE_NOT_READY`, 가산 필드는 `null`(화면이 깨지지 않게).
- **v052 는 이 리포 최초의 인덱스 추가 마이그레이션**이다(U6). 실패하면 뒤 마이그레이션이 막히므로 맨 뒤에 두고, 미러 인덱스가 없을 때(`isIndexReady` 대신 쿼리 실패 catch) 매트릭스는 `coverage.mirror:false` 로 내려간다.
- **SQL 추가 = major upgrade** → 배포 시 `--approve MAJOR_VERSION_RULE`.
- 옛 `worklog_certification`·`_request` 는 DROP 하지 않는다(보관 내보내기 `RetentionRepository` 가 `worklog_certification_request` 를 쓴다).
- 번호: 다른 세션의 v046~v048 이 커밋된 뒤 이어 붙인다. 그 세션이 번호를 바꾸면 v049~ 를 그 다음으로 민다(프로덕션 미배포라 재정렬 가능 — 첫 배포 뒤로는 금지).

### 5.2.1 본인 서명 구분(D8) — 칼럼 vs 파생

| 테이블 | 방식 | 근거 |
|---|---|---|
| `worklog_cert` | **칼럼 `self_certified`** | 파생하려면 `batch_id` 로 묶음 행을 조인해 actor = author 를 봐야 한다. 매트릭스 집계·게시 문서(`sc`·`sn`·flag 4)·작업 로그 탭 배지가 전부 이 테이블만 읽는 경로라 조인을 붙이면 집계 쿼리가 두 테이블 GROUP BY 가 된다. 또 UPGRADE 는 같은 값으로 인증자만 바뀌는 전이라 "현재 판의 인증 주체 성격"을 행 자체에 두는 것이 명확하다 |
| `worklog_cert_log` | 칼럼(복사) | 보관된 판의 성격을 그대로 남긴다(승격 이전 판 = 1) |
| `worklog_cert_batch` | **파생**(`actor_account = subject_account`) | 두 칼럼 모두 NOT NULL·삽입 후 불변이라 어긋날 수 없다. 칼럼을 따로 두면 오히려 두 진실이 생긴다 |

용량 영향: `worklog_cert`·`_log` 행당 +1B → 연 24만 행 ≈ **+0.25MB**(무시할 수준).

### 5.3 동결 요약 크기

칼럼 6개: `first_started` 8 + `first_seconds` 4 + `edit_count` 2 + `last_seq` 4 + `signal_mask` 2 + `late_days` 2 = **22B**(JSON 이었으면 ≈80~120B). 인증자·시각·모드·정책 기준값은 묶음 행 1개가 수십~수백 건을 대신한다.

## 6. Jira 연결

| REST | 주체 | 호출 위치 | 사유·허용 근거 |
|---|---|---|---|
| `POST /rest/api/3/search/jql` (`worklogAuthor = "<id>" AND worklogDate …`) | asUser(팀장) | `collectForAuthor` | 기본 |
| `GET /rest/api/3/issue/{id}/worklog?startedAfter&startedBefore` | asUser(팀장) | `collectForAuthor` | 기본 |
| `POST /rest/api/3/worklog/list` | **asUser(팀장)** | `certifyWorklogs` | 기본. 조회자가 볼 수 없는 워크로그는 응답에 없다고 가정(U3) |
| `POST /rest/api/3/issue/bulkfetch` (`fields=project`) | asUser | `certifyWorklogs`(미러에 프로젝트 없을 때만) | 기본 |
| `POST /rest/api/3/permissions/check`(`filterVisibleIssues`) | asUser | 펼침의 삭제·숨김 행, 결재 상세 요약 | 기본 |
| `POST /rest/api/3/worklog/list` | asApp | Recorder(기존 호출 공유 — **추가 호출 없음**) | AGENTS asApp 1번(지문 계산·상태 판정) 범위 안 |
| `PUT/GET /rest/api/3/user/properties/movesApproval.cert.{YYYY-MM}?accountId=` | asApp | `WorkforcePublisher` 만 | AGENTS asApp 2번 — 문서 키 종류만 늘어난다. **AGENTS.md 에 "사용자×월 인증 문서" 한 줄 추가**(사유 문자열은 기존 `workforce-publish`/`-verify` 재사용) |

- manifest: 모듈·scope 변경 없음. 사용자 프로퍼티 쓰기 scope 는 W11 실측 결과를 따른다(§10 U1).
- `route` 인코딩 함정: JQL 은 POST 본문이라 해당 없음. 워크로그 쪽 쿼리는 값마다 보간(기존 코드 그대로).

## 7. 프론트

### 7.1 엔트리 — 추가 없음

| 화면 | 엔트리 | 근거 |
|---|---|---|
| 팀장 인증(매트릭스·펼침) | `inbox` 의 새 view `teamCertification`(lazy `importWithReloadOnce`) | 팀 타임시트와 같은 전역 페이지·같은 팀장 판정(`getTimesheetContext.isTeamLead`) |
| **본인 인증(D8)** | 같은 `teamCertification` view 의 "내 워크로그" 탭 — `getTimesheetContext.certification.selfCertEligible` 일 때만 탭·버튼 노출 | 본인 인증 대상은 정의상 팀장이라 이미 이 화면에 들어온다. 월 단위·판단 요약·PIN·실행기를 팀장 화면과 그대로 공유. 내 타임시트(주 단위일 수 있음)·작업 로그 탭(이슈 단위)에 버튼을 두면 같은 기능 진입점이 셋이 된다 — 거기엔 **배지만** |
| 본인 상태(내 타임시트) | `inbox` view `timesheet` | 기존 |
| 작업 로그 탭 배지 | `worklog` | 기존 |
| 결재 상세 요약 | `modal`(승인 상세 안 `TimesheetSnapshotSection` → `TimesheetHistorySection`) | 기존 |

엔트리 3곳(craco ENTRIES·`public/*.html`·manifest resources) **무변경**.

### 7.2 화면 트리

```
features/worklogCert/                       (신규)
  TeamCertificationPage.jsx                 view=teamCertification. 월 PeriodPicker(MONTH 고정) · 팀 선택 · 필터 · 매트릭스
                                            상단 탭: "팀원"(기본) | "내 워크로그"(selfCertEligible 일 때만 — false 면 탭 자체를 렌더하지 않음)
    OwnCertificationPanel.jsx               listOwnCertifications. 상단 SectionMessage(information): "상위 인증자가 없어 본인 서명으로 인증합니다. 본인 서명은 구분해 기록·게시됩니다"
                                            WorklogSummaryTable mode="certify" + CertifyBar(invoke='certifyOwnWorklogs', accountId 없음)
                                            응답 selfCert.eligible=false(그 사이 상위자 생김)면 버튼 숨기고 사유 문구(reason별)
    CertMatrixTable.jsx                     CommonTable. 행 클릭 = 펼침(한 번에 한 사람). 높이는 내용(100vh 금지)
      columns: 팀원 · 인증 시간 · 인증/주장 건수 · 미인증 · 불일치 · 삭제후 · 본인 서명 · 마지막 인증
      (본인 서명 칸 = selfCertifiedCount — 하위 팀장 행에서만 0 이 아닐 수 있다. 펼치면 해당 행에 "확인(승격)" 가능)
      coverage.mirror=false 면 주장·미인증 칸 "—" + 안내 툴팁
    MemberCertificationPanel.jsx            listMemberCertifications. 상단 합계(주장 vs 인증), 숨김 N건 안내
      CertFilterBar.jsx                     전체 / 미인증만 / 불일치만 / 신호 있음 (클라이언트 필터)
      WorklogSummaryTable.jsx  mode="certify"   ← 공용
      CertifyBar.jsx                        unit=ENTRY: 체크 선택 → "선택 인증(N)"
                                            unit=MONTH: "이 달 전체 인증(N건)" — certifiable 전부, setDigest 동봉
                                            확인 대화상자: 건수·시간·신호별 건수 + PIN(pinStatus.required)
      certifyRunner.js                      CHUNK=100 순차, remaining 재전송(같은 PIN·같은 batchKey 아님 — 호출마다 새 batchKey, 재시도만 같은 키)
  WorklogSummaryTable.jsx                   공용: 이슈 · 일자 · 처음→현재(또는 제출) · 수정 N회 · 인증값 · 상태 · 신호 배지
                                            mode="certify"(체크박스·현재값) | mode="review"(제출값, 체크 없음)
                                            행 펼침 = 기존 WorklogHistoryList(getWorklogHistory) 재사용
  CertStateBadge.jsx                        Lozenge: UNCERTIFIED(default) CERTIFIED(success) MISMATCH(moved) DELETED_AFTER_CERT(removed)
                                            selfCertified=true 면 라벨 "인증됨(본인)" + appearance inprogress, Tooltip "상위 인증자가 없어 본인 서명" — 모든 화면 공통(D8 화면 구분)
  SignalBadges.jsx                          신호 코드 → 짧은 라벨 + Tooltip(기준값 포함)
  certFormat.js                             초→시간, 지연일, 증가율

features/inbox/InboxPage.jsx, inboxUrl.js   view 'teamCertification' 추가(INBOX_VIEWS·nav 아이콘·isTeamLead 필터). parseTimesheetSearch 재사용(period=월 키, team, tab=team|own)
features/timesheet/MyTimesheetPage.jsx      view.certification 있으면 "인증 현황" 줄(인증 Xh · 불일치 N · 미인증 N) + 항목 표에 CertStateBadge
features/worklog/WorklogTab.jsx             LockBadge 옆 CertStateBadge(worklog.certification). 옛 "사후 인증" 버튼·WorklogCertificationPanel 호출 제거
features/worklog/WorklogCertificationPanel.jsx  읽기 전용(결재선 선택·요청 버튼 제거). ApprovalDetail 의 옛 요청 표시용으로만 남는다
features/worklogHistory/TimesheetHistorySection.jsx  data.worklogs 가 있으면 WorklogSummaryTable mode="review" 를 사건 목록 위에
features/settings/WorklogCertSettings.jsx   설정 > 타임시트 정책 아래 섹션: 단위·삭제 처리·기준값 3. 저장 = saveApprovalSettings
features/settings/WorkforceLinkSettings(기존) certPublish 상태 줄(NOT_LINKED = "워크포스 미연결 — 게시 대기")
```

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const worklogCertKeys = {
  all: ['worklogCert'],
  matrix: (teamKey, periodKey) => [...worklogCertKeys.all, 'matrix', teamKey ?? '-', periodKey ?? '-'],
  member: (accountId, periodKey) => [...worklogCertKeys.all, 'member', String(accountId), periodKey ?? '-'],
  own: (periodKey) => [...worklogCertKeys.all, 'own', periodKey ?? '-'],
};
```
인증 성공 후 `worklogCertKeys.all` + `timesheetKeys.all` 무효화(같은 iframe 의 내 타임시트 배지).

### 7.4 에러 분기(`error.code`)

| code | 화면 처리 |
|---|---|
| `WORKLOG_CERT_STALE` | 결과 목록에 "화면 이후 변경됨 — 새로고침 후 다시" + 펼침 재조회 |
| `WORKLOG_CERT_UNIT_MISMATCH` | "관리자가 인증 단위를 바꿨습니다" + 매트릭스 재조회 |
| `PIN_*` | 기존 PIN 문구 재사용 |
| `TIMESHEET_TOO_LARGE` | 펼침 영역 경고(기존 문구) |
| `PERMISSION_TEAM_LEAD_REQUIRED` | 팀 타임시트와 같은 경고 |
| `WORKLOG_CERT_SELF_DENIED` | 본인 경로: `cause.reason` 별 문구(`own.denied.*`) + `timesheetKeys.context()` 무효화(탭을 다시 판정해 숨긴다). 팀장 경로(`TEAM_LEAD_AXIS`): 일반 오류 |

## 8. i18n 키 (namespace `worklogCert`, `locales/kr/worklogCert.json`·`locales/en/worklogCert.json` → `npm run merge`)

| 키 | kr | en |
|---|---|---|
| `nav` | 워크로그 인증 | Worklog certification |
| `matrix.title` | 팀 워크로그 인증 | Team worklog certification |
| `matrix.column.member` | 팀원 | Member |
| `matrix.column.certified` | 인증 시간 | Certified time |
| `matrix.column.count` | 인증/기록 | Certified/logged |
| `matrix.column.uncertified` | 미인증 | Uncertified |
| `matrix.column.mismatch` | 불일치 | Changed |
| `matrix.column.deleted` | 인증 후 삭제 | Deleted after cert. |
| `matrix.column.lastCertifiedAt` | 마지막 인증 | Last certified |
| `matrix.coverageOff` | 변경 이력 수집 범위 밖이라 기록 건수를 알 수 없습니다. 사람을 펼치면 Jira 에서 직접 확인합니다. | Logged counts are unavailable outside history collection. Expand a member to read Jira directly. |
| `member.totals` | 기록 {claimed} · 인증 {certified} | Logged {claimed} · Certified {certified} |
| `member.hidden` | 볼 수 없는 워크로그 {count}건은 표시하지 않았습니다. | {count} worklogs you cannot view are hidden. |
| `filter.all` / `filter.uncertified` / `filter.mismatch` / `filter.signals` | 전체 / 미인증만 / 불일치만 / 신호 있음 | All / Uncertified / Changed / With signals |
| `column.issue` / `column.date` / `column.firstToFinal` / `column.edits` / `column.certifiedValue` / `column.state` / `column.signals` | 이슈 / 작업일 / 처음→현재 / 수정 / 인증값 / 상태 / 신호 | Issue / Date / First→now / Edits / Certified / State / Signals |
| `column.firstToSubmitted` | 처음→제출 | First→submitted |
| `edits` | {count}회 | {count} edits |
| `state.UNCERTIFIED` / `.CERTIFIED` / `.MISMATCH` / `.DELETED_AFTER_CERT` | 미인증 / 인증됨 / 인증 후 변경 / 인증 후 삭제 | Uncertified / Certified / Changed after cert. / Deleted after cert. |
| `signal.LATE_ENTRY` | 지연 입력 {days}일 | Logged {days}d late |
| `signal.NEAR_CLOSE_EDIT` | 마감 직전 수정 | Edited near close |
| `signal.GROWTH` | 시간 {percent}% 증가 | Time +{percent}% |
| `signal.OTHER_ACTOR` | 작성자 외 수정 | Edited by others |
| `signal.OUTSIDE_APP` | 앱 밖 변경 | Changed outside app |
| `signal.OBSERVED_LATE` | 늦게 감지된 변경 | Detected late |
| `signal.NO_HISTORY` | 이력 없음 | No history |
| `signal.firstBaseline` | 수집 시작 시점 값 | Value at collection start |
| `action.certifySelected` | 선택 인증({count}) | Certify selected ({count}) |
| `action.certifyMonth` | 이 달 전체 인증({count}건) | Certify whole month ({count}) |
| `confirm.title` | 워크로그 인증 | Certify worklogs |
| `confirm.body` | {name}님의 {count}건, {time}을 인증합니다. 인증한 값은 이후 Jira 에서 바뀌어도 그대로 남습니다. | Certify {count} worklogs ({time}) for {name}. Certified values stay as recorded even if Jira changes later. |
| `confirm.signals` | 신호가 있는 건 {count}건 | {count} with signals |
| `result.summary` | 인증 {certified} · 변경 없음 {unchanged} · 실패 {failed} | Certified {certified} · Unchanged {unchanged} · Failed {failed} |
| `result.code.WORKLOG_CERT_STALE` | 화면을 연 뒤 바뀌었습니다. 새로고침 후 다시 인증하세요. | Changed since you opened it. Refresh and try again. |
| `result.code.WORKLOG_CERT_OUT_OF_PERIOD` | 이 달 밖으로 옮겨졌습니다. | Moved outside this month. |
| `result.code.WORKLOG_CERT_DELETED` | 삭제된 워크로그입니다. | The worklog was deleted. |
| `result.code.WORKLOG_CERT_SUBJECT_MISMATCH` | 작성자가 다릅니다. | Different author. |
| `result.code.WORKLOG_NOT_FOUND` | 볼 수 없거나 없는 워크로그입니다. | Not found or not visible. |
| `error.unitMismatch` | 관리자가 인증 단위를 바꿨습니다. 화면을 새로 엽니다. | The certification unit changed. Reloading. |
| `mine.title` | 인증 현황 | Certification |
| `own.tab` | 내 워크로그 | My worklogs |
| `team.tab` | 팀원 | Members |
| `own.notice` | 상위 인증자가 없어 본인 서명으로 인증합니다. 본인 서명은 구분해 기록되고 워크포스에도 따로 표시됩니다. | No upper approver is assigned, so you certify with your own signature. Self-certifications are recorded and published separately. |
| `own.denied.UPPER_LEAD_EXISTS` | 상위 팀장이 있어 본인 인증을 할 수 없습니다. 상위 팀장에게 인증을 요청하세요. | An upper team lead exists. Ask them to certify your worklogs. |
| `own.denied.NOT_TEAM_LEAD` | 팀장만 상위 인증자가 없을 때 본인 인증을 할 수 있습니다. | Only team leads without an upper approver can self-certify. |
| `own.denied.UPPER_LEAD_UNKNOWN` | 상위 인증자를 확인하지 못했습니다. 잠시 후 다시 시도하세요. | Could not verify upper approvers. Try again later. |
| `state.CERTIFIED_SELF` | 인증됨(본인) | Certified (self) |
| `state.selfTooltip` | 상위 인증자가 없어 본인이 서명했습니다. | Self-certified: no upper approver. |
| `matrix.column.self` | 본인 서명 | Self-signed |
| `action.confirmUpgrade` | 확인 | Confirm |
| `result.upgraded` | 본인 서명 {count}건을 확인했습니다. | Confirmed {count} self-certified worklogs. |
| `workforce.selfSeconds` | 본인 서명분 {time} | Self-signed {time} |
| `mine.summary` | 인증 {certified} · 불일치 {mismatch} · 미인증 {uncertified} | Certified {certified} · Changed {mismatch} · Uncertified {uncertified} |
| `settings.title` | 워크로그 인증 | Worklog certification |
| `settings.unit` / `settings.unit.ENTRY` / `settings.unit.MONTH` | 인증 단위 / 건별 / 사용자×월 | Unit / Per worklog / Per member-month |
| `settings.unitHelp` | 저장은 항상 건별입니다. 단위를 바꿔도 기존 인증은 그대로입니다. | Records are always per worklog. Changing the unit keeps existing certifications. |
| `settings.deleted` / `.KEEP` / `.ZERO` | 인증 후 삭제·감소 / 인증 시간 유지 / 0(감소분 반영) | After deletion/decrease / Keep certified time / Zero (apply decrease) |
| `settings.lateDays` / `settings.nearCloseHours` / `settings.growthPercent` | 지연 입력 기준(일) / 마감 직전 기준(시간) / 증가율 기준(%) | Late entry (days) / Near close (hours) / Growth (%) |
| `settings.zeroOff` | 0 = 끔 | 0 = off |
| `workforce.certPublish` | 인증 시간 게시 | Certified time publishing |
| `workforce.notLinked` | 워크포스와 연결되지 않아 게시를 기다립니다. 인증은 그대로 동작합니다. | Waiting for Workforce link. Certification works without it. |

`worklogCertification.json`(동결 요청형): `notice`·`flow`·`select`·`request`·`empty`·`requested`·`changed` 는 읽기 전용 패널에서 안 쓰게 되지만 **삭제하지 않는다**(테스트·보관 엑셀이 키를 참조 — 정리는 후속). `state.*` 는 유지.

## 9. 용량·호출량

### 9.1 행·바이트 (200명, 연 24만 건 = 200 × 250일 × 4.8건)

| 테이블 | 행/년 | 행 데이터(B) | 인덱스 포함(B) | 연간 |
|---|---|---|---|---|
| `worklog_cert` | 240,000 | ≈176 (self_certified 1 포함, id 10·계정 43·이슈 7·프로젝트 6·월 7·상태 9·인증값 12·fp 16·src_updated 8·batch 16·요약 22·rev류 8·시각 5 + 대부분 NULL 인 obs) | ≈265 (+ `ix_wcert_period_author` ≈60, `ix_wcert_updated` ≈30) | **≈64MB** |
| `worklog_cert_batch` | ≈3,000 (200명 × 12월 × 재인증 포함 1.25) | ≈150 | ≈200 | <1MB |
| `worklog_cert_log` | ≈24,000 (재인증 10% 가정) | ≈190 | ≈200 | ≈5MB |
| `worklog_mirror` 인덱스 추가 | (기존 행) | — | ≈60 × 미러 행(이력 보관 12개월 상한) | ≈15MB 상한 |
| `workforce_publish` | +2,400 문서 행(200 × 12) | — | ≈300 | <1MB |
| **합** | | | | **≈80MB/년**(미러 인덱스는 상한 고정) |

목표 150B 대비: 행 데이터 175B — 계정 id(43B)가 절반 가까이다. 더 줄이려면 작성자를 정수 키로 정규화해야 하는데 조인 비용·이력 테이블과의 불일치가 커서 하지 않는다. 1GiB 에서 이력(상한 ≈150MB)·결재 기록과 합쳐도 무기한 보관 10년 내외(Q107).

### 9.2 resolver 1회당 Jira 호출

| resolver | Jira 호출 | SQL |
|---|---|---|
| `getCertificationMatrix` | 1 (사용자 일괄) | TeamScope 1~2 + 인증 집계 1 + 미러 집계 1 |
| `listMemberCertifications` | 검색 1~2 + 이슈별 워크로그 N(평균 20~40, 상한 200 이슈 × 40쪽) + permissions/check 0~1 + 사용자 1 ≈ **25~45**(동시 6 → 3~6초) | 4~5 + 화면 관찰 CAS ≤50 |
| `certifyWorklogs`(200건) | worklog/list 1 + bulkfetch 0~2 = **1~3** | PIN 1 + 묶음 1 + 행 조회 1 + 이력 1~2 + INSERT 4(50행씩) + 재인증 CAS 건당 2 + touch 1 + 합계 1 |
| `listOwnCertifications` | `/myself` 1 + 검색 1~2 + 이슈별 워크로그 N + 사용자 1 ≈ 25~45(내 타임시트 수집과 같은 비용) | `listMemberCertifications` 와 같음 + 상위자 판정 2~3 |
| `certifyOwnWorklogs`(200건) | `certifyWorklogs` 와 같음(1~3) + 워크포스 연동 시 상위자 판정의 org 읽기(기존 `WorkforceOrgSource` asUser, memo) 0~1 | 같음 + 상위자 판정 2~3 |
| `getTimesheetContext`(가산) | **+0**(org 읽기는 이미 `ledTeams` 가 하는 memo 와 공유, 미공유 시 +1) | +2 (`findMemberTeam`·`findTeamLeads`) |
| `getMyTimesheet`(가산) | **+0** | +1 |
| `getIssueWorklogs`(가산) | **+0** | +1 |
| `getTimesheetWorklogHistory`(가산) | **+0** | +2 |
| 트리거(워크로그 이벤트) | **+0**(Recorder asApp 공유) | 인증 행 있을 때만 +1~2 |
| 게시 스윕 | 문서당 PUT 1(내용 같으면 0). 월초 일괄 인증 200명 → 200 PUT ≈ 4 tick(20분) | |

N+1 제거: 인증 현재값은 `worklog/list` 일괄(≤1000), 가시성은 `permissions/check` 일괄, 이력은 `IN` 일괄.

### 9.3 시간 예산

`certifyWorklogs` 15초(요구) — 200건 기준 Jira 3회(≈1.5초) + SQL ≈20문(≈0.6초) + 재인증 CAS(건당 ≈40ms). 재인증 200건이면 ≈8초. 예산 초과분은 `remaining`. Forge 25초 한도 안.

## 10. 미검증

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| U1 (=W2·W11) | 앱(asApp)이 **다른 사용자**의 사용자 프로퍼티를 PUT/GET 할 수 있는가, 필요한 scope(`write:jira-user`?) | v2 게시 전체. 실패 시 v1 과 같은 후퇴안(워크로그 단위)은 D4 로 **기각**됐으므로 → 프로젝트 프로퍼티 등 별도 경로 재설계 필요 | 인증 1건 후 5분 안에 `certPublish.published ≥ 1`. 403 이면 `WRITE_DENIED`. 관리자 REST 로 `movesApproval.cert.YYYY-MM` GET |
| U2 | 사용자 프로퍼티 값 한도 32,768B 실측, 1,000건 문서(≈23.5KB) PUT 성공 | `CERT_LIST_MAX` | dev 사이트에 합성 1,000건 문서 PUT·GET, 30,001B 문서는 거부되는지 |
| U3 | `POST /worklog/list` asUser 가 **조회자에게 안 보이는**(이슈 열람 불가·공개 범위 제한) 워크로그를 응답에서 빼는가 | 인증 쓰기의 범위 방어(불변식 7). 안 빼면 팀장이 못 보는 건을 인증할 수 있다 | 팀장 계정으로 열람 불가 이슈의 워크로그 id 를 넣어 호출. 섞여 오면 `filterVisibleIssues` 를 인증 경로에 추가(호출 +1) |
| U4 | 워크로그 이벤트 누락률·지연 → MISMATCH 반영 지연 | 게시가 늦게 바뀐다 | 우리 화면 밖(REST)으로 수정 후 화면 관찰·이력 스윕·게시까지 시간 측정. `forge logs` 대신 DB 상태로 |
| U5 | 삭제 이벤트에 worklog id 가 오는가(기존 H 항목과 같음) | DELETED 전이 | 삭제 후 `worklog_cert.state` 가 DELETED 인지 |
| U6 | Forge SQL(TiDB)에서 `CREATE INDEX IF NOT EXISTS` 마이그레이션이 멱등·성공하는가(이 리포 최초) | v052 실패 시 뒤 마이그레이션 정지 | dev 배포 후 `ensureMigratedOnce` 결과, 두 번째 실행 무오류. 실패면 `ALTER TABLE … ADD INDEX IF NOT EXISTS` 로 교체하거나 v052 제거(매트릭스 `coverage.mirror:false`) |
| U7 | JQL `worklogAuthor = "<accountId>"` 가 팀장 컨텍스트에서 타인 워크로그 이슈를 찾는가(T5 타임존 해석 포함) | 펼침 목록 완전성 | 팀원 워크로그 있는 이슈를 팀장이 볼 수 있을 때 항목 수 = 미러 수 |
| U8 | `workforce_inbound` 의 검증 통과 행이 "연결됨" 신호로 충분한가(워크포스 설치·org 미설정 사이트) | 연결돼 있는데 게시가 안 될 수 있다 | 두 앱 설치 dev 에서 `certPublish.state`. 부족하면 rms.pm·rms.policy 도 신호로 |
| U9 | `issue/bulkfetch` asUser 응답의 project id | 프로젝트 칼럼 | 미러가 없는 이슈로 인증 후 `project_id` 확인 |
| U10 | 워크포스 `rms.org` 의 `leaderKeys` 가 "A 를 MEMBER 로 둔 팀의 LEAD" 와 같은 의미인가(워크포스 조직 계층에서 팀장 자신의 org 게시물에 자기 자신이 leader 로 실리는지) | D8 상위자 판정 — 자기 자신만 실리면 `−{A}` 로 빈 집합이 되어 본인 인증이 열린다(의도대로). 상위 조직장이 실리면 상위자 있음 | 두 앱 dev 에서 팀장 계정의 `movesRms.org` 를 관리자 REST 로 GET 해 `leaderKeys` 확인. 워크포스 리포 계약 문서와 대조 |

## 11. 작업 분해

### 선행 조건 (요구 §6)

**백엔드는 `review-hardening-2026-10-08` 세션의 미커밋 변경이 커밋되거나 사용자가 허락한 뒤에 시작한다.** 겹치는 파일: `migrate.js`(v046~v048), `WorklogHistoryRecorder.js`, `WorklogHistoryRepository.js`, `WorklogCertificationRepository.js`, `TimesheetDriftService.js`, retention 일체. 순수 도메인(§3)·계약 순수 빌더(§4.6 `certificationDoc.js`)·프론트 컴포넌트는 그 파일들을 건드리지 않으므로 먼저 해도 된다.

### backend 체크리스트

- [ ] 도메인: `fingerprint.js`(`certFingerprintOf`·`setDigestOf`), `state.js`, `counting.js`, `summary.js`, `policy.js` + §3.6 테스트
- [ ] CATALOG 5키(`siteOnly:true`) + `SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`·**`GLOBAL_ONLY_KEYS`** + `normalizeSettingsPatch` + 계약 테스트 단언(siteOnly ⊂ GLOBAL_ONLY)
- [ ] DDL `worklogCert.sql.js` + `migrate.js` v049~v052(번호는 선행 세션 뒤)
- [ ] `WorklogCertRepository`(findMany·listByPeriodAuthor·matrixTotals·insertMany·recertify CAS·archive·batch·changedSince 키셋·universeOfCert)
- [ ] `WorklogHistoryRepository.listByWorklogIds`·`mirrorTotals`·`mirrorIds`
- [ ] `WorklogCollector.collectForAuthor`·`fetchWorklogsByIdAsUser`
- [ ] `WorklogCertService`(매트릭스·펼침·인증, 15초 예산·부분 성공·멱등 batchKey) + `WorklogCertObserver`
- [ ] Controller·PermissionMap 5개(팀장 축 `{teamLead:true}` 3 + 본인 축 `'SELF'` 2: `listOwnCertifications`·`certifyOwnWorklogs`)·`CONTROLLER_REGISTRARS` — 계약 테스트 통과
- [ ] D8: `TeamScope.upperLeadsOf`(+`TeamRepository.findTeamLeads`, 실패 throw, memo) + `leads` 일관성 속성 테스트 · 도메인 `authority.js`(`certAuthority`) · `planCertify` UPGRADE · `self_certified` 기록 · `getTimesheetContext.certification.selfCertEligible`
- [ ] `createWorklogCertification` 제거(3곳)·`getWorklogCertification` 읽기 전용·옛 관찰 끊기
- [ ] Recorder 를 새 Observer 로(wants·contexts·observe·sweep `hasTracked`)
- [ ] 가산: `getMyTimesheet.certification`·`getIssueWorklogs.worklogs[].certification`(eligible 공용 함수 추출)·`getTimesheetWorklogHistory.worklogs`·`getWorkforceLinkStatus.certPublish`
- [ ] 계약: `contract.js`(TYP·ent·키·validator·상한) + `certificationDoc.js` + vectors 갱신
- [ ] 게시: `WorkforceOutbox.touchCert/touchCertYears`, `WorkforcePublisher` 배출 분기(`docKindOf`)·`certLinkState`·`listDue` 제외 조건·`wf-cert-scan`·인증 표식 펼침, `WorkforceLinkService` 재게시 ALL 에 인증 표식, 설정 저장 시 touch
- [ ] ErrorCodes 신규 8: `WORKLOG_CERT_STALE`·`WORKLOG_CERT_DELETED`·`WORKLOG_CERT_OUT_OF_PERIOD`·`WORKLOG_CERT_SUBJECT_MISMATCH`·`WORKLOG_CERT_SELF_DENIED`·`WORKLOG_CERT_UNIT_MISMATCH`·`WORKLOG_CERT_BATCH_CONFLICT`·`WORKLOG_CERT_CONFLICT`
- [ ] AGENTS.md asApp 2번에 "사용자×월 인증 문서" 문구
- [ ] 회귀: 타임시트 결재·옛 사후 인증(`WorklogCertification.test.js` 읽기 경로)·이력 Recorder·게시 v1 테스트 무회귀, `forge lint`

### frontend 체크리스트

- [ ] `features/worklogCert/` 신규(§7.2) — `WorklogSummaryTable` 공용(certify/review)
- [ ] 업무함 view `teamCertification`(inboxUrl·nav·isTeamLead 필터·lazy) + "내 워크로그" 탭(`selfCertEligible` 일 때만) `OwnCertificationPanel` → `certifyOwnWorklogs`
- [ ] `CertStateBadge` 본인 서명 표시(모든 화면), 매트릭스 "본인 서명" 칸·승격(확인) 버튼
- [ ] `certifyRunner`(CHUNK 100, remaining 재전송, 진전 없으면 중단, PIN 재사용, 호출마다 새 batchKey·재시도는 같은 키)
- [ ] `MyTimesheetPage` 인증 현황, `WorklogTab` 배지·옛 버튼 제거, `WorklogCertificationPanel` 읽기 전용, `TimesheetHistorySection` 요약 표
- [ ] 설정 `WorklogCertSettings`, 워크포스 연동 상태 줄
- [ ] 쿼리키 `worklogCertKeys`, 무효화 규칙
- [ ] i18n `worklogCert` kr/en + merge, 옛 키 유지
- [ ] 테스트: `TransitionApplyCertification.test.jsx`·`WorklogTab.test.jsx` 의 옛 버튼 단언 갱신, 새 컴포넌트 테스트, 빌드

## 12. 워크포스 리포 작업 항목 (이 하네스에서 구현하지 않음 — 별도 승인)

| # | 작업 | 내용 |
|---|---|---|
| WF-1 | 계약 파일 동기화 | 승인 앱 `src/integration/workforce/contract.js`(typ `approval.cert`·키·validator·`CERT_LIST_MAX`)를 그대로 복사. 서명 검증은 기존 Ed25519·승인 앱 공개키 |
| WF-2 | 수신 | 사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}` 을 **asUser** 로 읽고 `verifyEntry(family=APPROVAL, typ='approval.cert', ent={accountId, periodKey})`. 실패·부재 = "인증 없음"(조용히 단독 경로, 로그만). 워크포스 DB 무증가 — 캐시하지 않거나 기존 메모리 캐시만 |
| WF-3 | 원가·정산 | 지금의 "Jira 워크로그 라이브 재계산" 을 **인증 문서가 있는 사용자×월에 한해 `w`(워크로그별 countedSeconds)** 로 바꾼다. 프로젝트 귀속은 워크로그 id → 워크포스가 이미 읽는 워크로그의 이슈 → 프로젝트. `w` 에 없는 워크로그는 "미인증"(정산 제외). `wt:true` 면 목록 밖 워크로그는 "확인 불가", 월 합계는 `cs` |
| WF-4 | 현황 표시 | 워크로그·사람·프로젝트 현황에 "주장 / 인증" 배지(전부 표시 + 상태 배지 — CLAUDE.md 확정 결정). MISMATCH(flag 비트 1)는 "인증 후 변경", DELETED(비트 2)는 "인증 후 삭제", **본인 서명(비트 4, 합계 `sc`·`sn`)은 "본인 인증" 배지로 구분**(D8). 원가·정산에 본인 서명분을 포함할지 별도 표시할지는 워크포스 쪽 정책(기본: 포함 + 구분 표시) |
| WF-5 | v1 문서 | v1(`movesApproval.{YYYY}`, `approval.timesheet`)은 결재 상태 배지용으로만. 원가·정산에 쓰지 않는다 |
| WF-6 | 스파이크 | U1(W2·W11)·U2·W5(두 앱 프로퍼티 키 격리)를 같은 dev 사이트에서 승인 앱과 함께 |

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-08 | 초안 | requirement.md D1~D6 |
| 2026-10-08 | D7~D9 반영 — 열린 질문 Q104·Q109 답 확정, 나머지 확정·Q111 신설 / §1.2 인증 주체 판정 순서·`TeamScope.upperLeadsOf`·두 팀 규칙 / §2 SELF 축 신규 `listOwnCertifications`·`certifyOwnWorklogs`, `getTimesheetContext.certification` 가산, 응답 `selfCertified`·`selfCertifiedCount`, §2.4 행 추가 / §3 `certAuthority`·`planCertify` UPGRADE·테스트 / §4.3.1 본인 경로 / §5 `self_certified` 칼럼(묶음은 파생) / §4.6 게시 `sc`·`sn`·flag 비트 4, 32KB 재계산(≈23.5KB 불변) / §7·§8 "내 워크로그" 탭·배지·i18n / §9·§10(U10)·§11 | requirement §7 사용자 결정(2026-10-08 14:10) |
