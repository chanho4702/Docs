# audit-trail 설계서 — 워크로그·결재·인증 감사 이력

> 작성: feature-architect · 2026-10-10 · 입력 `00_input/requirement.md`(전부 반영)
> 선행: `worklog-history`(구현됨 — v031·v032, `listWorklogHistory`), `worklog-certification-model`(백엔드 **구현 중** — v049~v052, 미커밋 diff 확인: `migrate.js`·`SettingsRepository`·`SettingsService`·`ErrorCodes`·`fingerprint.js`).
> 기준 코드: `src/resolver/worklogHistory/*`, `src/domain/timesheet/worklogHistory.js`, `src/resolver/approval/{ApprovalService,ApprovalRepository}.js`(`getApprovalHistory`·`listHistory`), `src/resolver/settings/SettingsAuditRepository.js`, `src/rdb/schema/ddl/{approvalEvent,approvalRequest,approvalApprover,auditDelegation,worklogHistory,workforceLink}.sql.js`, `src/integration/workforce/contract.js`, `src/resolver/workforce/{WorkforceInbound,WorkforceLinkRepository,WorkforcePublisher}.js`, `src/domain/worklogPolicy/{catalog,merge}.js`, `src/resolver/worklogPolicy/*`, `src/trigger/sweepJobs.js`, `static/ui/src/features/settings/{AuditSettings,WorklogHistoryAuditSettings,settingsNavigation,worklogHistoryAuditModel}.js(x)`.
> 플랫폼 근거 등급: **문서**(공식 문서 확인 2026-10-10, 실측 전) / **미검증**(추정 — §10 A 번호) / **실측**(CLAUDE.md 표).

### 입력과 실제 코드의 차이 (설계 전 확인)

| 입력 표현 | 실제 | 설계 반영 |
|---|---|---|
| `ddl/approvalSettingsAudit.sql.js` | 설정 감사 DDL 은 `ddl/auditDelegation.sql.js` 의 `CREATE_APPROVAL_SETTINGS_AUDIT_TABLE`(v014) | 그 파일 기준. 설정 감사는 **무변경** |
| 이력 스윕 "시간당" | 2026-10-10 커밋 `1523ee1` 로 일일 `approval-sweep` 의 큐 작업 `worklog-history` 로 바뀜 | 새 작업 없음. 기존 작업의 빈 상태 SQL 도 무변경(§9.3) |
| `movesRmsLink` 표식 | 워크포스의 **서명 없는 이슈 프로퍼티**(이슈 연결 기능, `docs/DESIGN.md` §4). 우리 코드는 읽지 않는다 | 판정에 쓰지 않는다(불변식 9). 서명 검증된 `rms.org`·`rms.policy`·`rms.pm` 수신 캐시(`workforce_inbound` VERIFIED)만 쓴다(§4.4) |
| 워크포스 "연결 프로젝트" | `rms.policy`(프로젝트·이슈, exp ≤30일, 수동 새로고침만), `rms.pm`(위반 프로젝트만 갱신), `rms.org`(사용자, 본인 접속 때만 갱신, sticky Q41), `rms.check`(워크로그, **캐시 없음**) | 범위 판정은 **"검증된 적 있음"(sticky)** 으로 본다 — 범위를 넓히는 방향이라 만료를 따지지 않는다(§4.4 근거) |
| `approval_event` 기간 조회 | 인덱스는 `(request_id, occurred_at)` 와 PK `event_id` 뿐 — 기간 범위 스캔 불가 | 인덱스 3개 추가(v054~v056) |
| 인증 묶음 기간 조회 | `worklog_cert_batch` 인덱스는 `(subject_account, period_key)` 뿐, `worklog_cert_log` 는 PK 뿐 | 인덱스 2개(v057·v058). 인증 백엔드가 **첫 배포 전**이면 v050·v051 CREATE 에 인라인 흡수 가능(§5.3) |
| 감사 화면 사용자 표시 | `DirectoryService.normalizeUser` 가 `accountType` 을 버린다 | 가산 필드로 살린다(행위자 "앱 계정" 배지 — §0 K6) |

## 열린 질문

제품 결정만. 답이 없으면 **기본 가정**으로 구현한다. 번호는 `QUESTIONS.md` 다음(Q112~).

| # | 질문 | 선택지 | 기본 가정(이 설계) | 근거 |
|---|---|---|---|---|
| Q112 | 워크로그 이력 **수집 범위** | (a) 지금처럼 "앱 켠 프로젝트" (b) 앱 켠 프로젝트 **∪ 워크포스 연결 워크로그** (c) 워크포스 연결 워크로그만 | **(b)** — 정책 `worklogHistoryScope = 'PROJECT_OR_LINKED'`. (a)=`PROJECT`, (c)=`LINKED_ONLY` 로 바꿀 수 있다 | 요구 1 "연결된 워크로그는 이력이 남아야 한다"를 지키면서 현행 범위를 줄이지 않는다. 감사 기록은 "켜 두었는데 안 남았다"가 가장 큰 사고(worklog-history Q70). (c)는 용량을 줄이지만 워크포스 미설치 사이트에서 0행이 된다 |
| Q113 | "워크포스와 연결된" 의 정의 | (a) 작성자 `rms.org` 검증 이력 **또는** 프로젝트 `rms.policy`/`rms.pm` 검증 이력 (b) 작성자만 (c) 프로젝트만 | **(a)** | 워크포스 원가·정산은 "사람 × 프로젝트". 둘 중 하나라도 워크포스가 서명해 관리한다고 밝힌 대상이면 포함. 넓히는 쪽 오판은 용량만 늘린다 |
| Q114 | 감사 화면 구성 | (a) 탭 분리(결재 / 인증 / 워크로그 변경 / 설정 변경) (b) 한 타임라인 통합 | **(a)** + 행에서 다른 탭으로 "같은 사람·같은 기간" 이동 링크 | §7.1 비교표. 단위·보관 기간·필터·가림 규칙이 서로 달라 통합 타임라인은 구멍 난 목록이 된다 |
| Q115 | 보관 기간 정렬 | (a) 그대로(이력 12개월 · 결재 3년 · 인증 무기한) (b) 워크포스 연결분 이력만 길게 | **(a)** + 감사 화면 머리에 "탭별 보관 기간" 안내 | 이력 12개월은 용량 목표(연 150MB)의 전제. 인증 레코드가 "동결 요약"(첫 값·수정 횟수·신호)을 이미 남기므로 정산 근거는 이력 없이도 남는다. (b)는 행 단위 보관 분기라 정리 쿼리가 복잡해진다 — 요구가 생기면 후속 |
| Q116 | 결재 결정에 **PIN 확인 여부**를 행으로 남길지 | (a) 안 함 — 당시 PIN 정책은 설정 감사로 보인다 (b) `approval_event` 에 칼럼 추가 | **(a)** | (b)는 엔진(전이 `changes.event`)과 이벤트 INSERT 변경. PIN 정책이 켜져 있으면 결정 경로는 PIN 없이 통과할 수 없으므로 "당시 정책"으로 충분. 인증은 이미 `worklog_cert_batch.pin_verified` 가 있다 |
| Q117 | Jira 이슈 changelog 로 **삭제 행위자·중간 수정** 보강 | (a) 이번 범위 밖 — 스파이크 A3·A4 결과 뒤 별도 기능 (b) 이번에 구현 | **(a)** | 공식 문서로 워크로그 항목이 changelog 에 실린다는 근거를 찾지 못했다(§0). 근거 없는 수집 경로에 asApp 허용 확장을 붙이지 않는다 |
| Q118 | 감사 화면 접근 | (a) 앱 관리자만 (b) 팀장에게 자기 팀 결재·인증 감사 | **(a)** | 요구 3 "관리자가". (b)는 팀장 범위 축소(불변식 7)를 새로 설계해야 하는 형제 resolver 가 늘어난다 |

---

## 0. "어떻게 수정됐는지" 조사 결과

요구 2 의 완료 기준 표. 조사 출처는 문서 끝 "출처". 실측은 하지 않았다.

### 0.1 알 수 있음

| # | 항목 | 어떻게 | 근거 등급 | 지금 반영 |
|---|---|---|---|---|
| K1 | 우리 화면에서 한 변경의 **행위자·이전 값·이후 값** | 호출자 principal + 쓰기 직전 asUser `loadOwn` + Jira 응답 | 코드(확정) | 있음(`source=APP`) |
| K2 | 생성·수정의 **마지막 수정자** | 워크로그 `author`·`updateAuthor` | 문서(워크로그 REST 객체). asApp `worklog/list` 응답에 오는지는 H2(기존 스파이크) | 있음(`source=JIRA/SWEEP` 의 actor) |
| K3 | 생성·수정 **시각** | 워크로그 `created`·`updated` | 문서 | 있음 |
| K4 | **삭제 사실과 시각** | `GET /rest/api/3/worklog/deleted?since=`(id·`updatedTime`) + 삭제 이벤트 | 문서 | 있음(행위자는 없음 — U1) |
| K5 | **무엇이** 바뀌었나(시작·시간·설명 지문/앞부분·공개 범위) | 미러와 현재값의 차이 | 코드(확정) | 있음 |
| K6 | 행위자가 **사람 계정인지 앱 계정인지** | `user/bulk` 의 `accountType`(`atlassian`/`app`/`customer`) — 이미 `loadUsers` 가 부르는 호출 | 문서(사용자 객체). Jira 자동화가 기본 규칙 행위자(앱 계정)로 돌 때 `app` 으로 보이는지는 미검증 A5 | **이번에 추가**(UserMap 에 `accountType` 가산, 화면 "앱 계정" 배지) |
| K7 | 이벤트가 **우리 앱이 일으킨 것인지** | 워크로그 이벤트 페이로드 `selfGenerated`(문서: 받는 앱이 일으킨 이벤트인가) | 문서. asUser 쓰기도 true 인지는 미검증 A6 | 이번 범위 밖 — A6 통과 시 L6(APP 기록보다 트리거가 먼저 처리되면 JIRA 로 남음) 해소에 쓴다 |
| K8 | 이슈째 삭제된 워크로그는 **삭제 이벤트가 오지 않는다** | 이벤트 레퍼런스의 워크로그 절: "for deletions, cascading events aren't emitted" | 문서 | 한계 L4 를 "미검증"에서 "**문서로 확정**"으로 고친다. `worklog/deleted` 피드에 실리는지는 여전히 H12 |
| K9 | 우리 앱이 **시간 추적 제공자**일 때 Jira 기본 "Log work" 버튼·작업 로그 탭은 숨겨지고 우리 `issueAction`·`issueActivity` 로 대체 | 매니페스트 레퍼런스(Preview) | 문서 | 감사 화면 머리에 "제공자 상태" 안내(§7.2) — 행 단위 경로 추정은 하지 않는다 |

### 0.2 알 수 없음

| # | 항목 | 왜 | 화면 처리 |
|---|---|---|---|
| U1 | Jira 경로 **삭제의 행위자** | 워크로그 이벤트 페이로드의 문서 필드는 `eventType`·`selfGenerated`·`worklog` 뿐 — 이슈 이벤트와 달리 `atlassianId` 가 **문서에 없다**. 삭제 피드도 id·시각만 | "알 수 없음"(기존). 페이로드에 실제로 오는지는 H1(=A2) |
| U2 | **경로**(웹 화면 / REST / 모바일 / 자동화 / 다른 앱 / CSV 가져오기) 구분 | 이벤트·워크로그 객체에 경로 필드가 없다. 자동화가 사람 계정(규칙 행위자 = 사용자)으로 돌면 사람의 화면 수정과 구별 불가 | 출처는 `APP`(우리 화면 확정) / `JIRA`(그 밖 전부) / `SWEEP`(놓쳐서 나중에 발견) 세 값 그대로. K6 배지로 "앱 계정"만 추가 구분 |
| U3 | 이벤트 사이의 **중간 수정** | 이벤트 처리 시 최신 값을 읽는다(L1). 스윕은 최종 상태만 본다 | `SWEEP` 행에 "중간 변경 누락 가능"(기존) |
| U4 | 설치·켜기 **이전 이력**, 한 번도 관측하지 않은 워크로그의 삭제 | 백필 없음(worklog-history Q74) | `BASELINE` "처음 관측"(기존) |
| U5 | 접속 IP·기기·클라이언트 | Jira 가 앱에 주지 않는다 | 표시 안 함 |
| U6 | 시간 추적 제공자 사용 시 **REST·자동화·모바일 경로가 막히는지** | 매니페스트 레퍼런스가 언급하지 않는다(CLAUDE.md 미검증 표와 같음) | 막힌다고 표시하지 않는다 |

### 0.3 추가로 얻을 수단 (비용·scope·미검증)

| # | 수단 | 얻는 것 | 비용 | scope·권한 | 근거·미검증 | 판단 |
|---|---|---|---|---|---|---|
| M1 | 감사 로그 REST `GET /rest/api/3/auditing/record`(`from`·`to`·`filter`·`offset`·`limit`) | **워크로그에 대해선 얻는 것 없음.** 관리 도움말의 감사 범주는 프로젝트·권한·스킴·워크플로·사용자 관리 등 **설정 활동**이고, 서버판 이벤트 카탈로그의 "issue operations" 도 이슈 링크 생성·삭제뿐이다. 워크로그·이슈 필드 편집은 범주에 없다 | 호출 자체는 싸다. 다만 1,000건 상한·다음 페이지 없음이라는 사용자 보고가 있다(커뮤니티, 2022) | **Administer Jira 전역 권한** + classic `manage:jira-configuration`(granular `read:audit-log:jira`) — scope 추가 = 재동의·`install --upgrade`. 사용자 컨텍스트 없는 수집이면 asApp → AGENTS 허용 목록 확장. 모든 Jira 제품이 Free 플랜이면 사용 불가 | 문서(Cloud 범주 전체 목록 대조는 A1) | **채택 안 함.** 시간 추적 제공자 변경 같은 설정 사건이 잡히는지만 A1 로 확인 |
| M2 | 이슈 changelog `GET /rest/api/3/issue/{id}/changelog`·`POST /rest/api/3/changelog/bulkfetch` | 히스토리 `author`·`created`·`items[]`. Jira 가 워크로그 변경 때 `timespent`·`timeestimate`·`WorklogId`·`WorklogTimeSpent` 항목을 남긴다면 **삭제 행위자**와 **중간 수정 횟수 일부** | 이슈당 changelog 페이지 1회 이상(bulkfetch 로 묶어도 이슈 수에 비례) | `read:jira-work`(기존). 스윕 경로면 asApp → AGENTS 허용 1번 확장 필요 | **미검증 A3** — 공식 문서에서 워크로그 항목 이름·존재를 확인하지 못했다(서버판 이슈 트래커가 "삭제 워크로그는 changeitem 에 있다"고 언급할 뿐) | Q117 — 이번 범위 밖. A3 통과 시 별도 기능 |
| M3 | 이미 구독 중인 `avi:jira:updated:issue` 의 `atlassianId`(문서: 사건을 일으킨 사용자, optional) + `changelog` | M2 와 같은 정보를 **추가 Jira 호출 0** 으로 | `onIssueChanged` 에 워크로그 항목 분기(상태 변경이 아니면 지금은 SQL 없이 반환) | 없음 | **미검증 A4** — 워크로그 변경이 이 이벤트를 내는지 문서에 없다(워크로그는 별도 이벤트로만 기술) | Q117 — A4 통과 시 M2 보다 우선. 이력 테이블은 append-only 라 행위자 "보강"은 별도 힌트 테이블(INSERT IGNORE, `(worklog_id, seq)` 키)로 설계해야 한다 — 그 기능에서 |
| M4 | `selfGenerated`(K7) | 우리 앱 경유 확정 표기, L6 해소 | 0 | 없음 | 미검증 A6 | 후속 |
| M5 | `accountType`(K6) | 사람/앱 계정 구분 | **0**(기존 `user/bulk` 응답) | 없음 | 문서 | **이번에 채택** |
| M6 | 우리 앱을 시간 추적 제공자로(K9) | 기본 UI 경로를 우리 화면(APP)으로 돌려 "누가·이전 값"이 확정되는 비율을 올린다 | 고객 관리자 설정 작업. 사이트당 제공자 하나(Tempo 공존 불가 — CLAUDE.md) | 없음 | 문서(UI 대체) / 미검증 U6(비UI 경로) | 기존 결정 유지 — 감사 화면에 제공자 상태 안내만 |

**결론**: "어떻게"는 **우리 화면(APP) vs 그 밖(JIRA) vs 늦게 발견(SWEEP)** 이 확정 구분의 한계다. 이번에 싸게 더하는 것은 행위자 계정 종류(M5) 하나, 나머지는 스파이크 결과에 묶는다.

---

## 1. 개요·영향 범위

세 감사 축을 **관리자 설정 > 감사** 한 화면의 탭으로 제공한다.

| 축 | 원천(진실) | 단위 | 보관 | 이번 변경 |
|---|---|---|---|---|
| 결재 | `approval_event`(+ `approval_request`·`approval_approver`) | 이벤트 1건 | 결재 기록 보관(기본 3년, 내보낸 뒤 삭제) | **신규 조회** `listApprovalAudit` + 인덱스 3 |
| 인증 | `worklog_cert_batch`(+ `worklog_cert`·`worklog_cert_log`) | 인증 묶음 1건(펼치면 건별) | 무기한(cert Q107) | **신규 조회** `listCertificationAudit`·`getCertificationBatchAudit` + 인덱스 2 |
| 워크로그 변경 | `worklog_history` | 변경 1건 | 12개월(정책) | 수집 범위에 워크포스 연결분 추가, 행에 `wf_linked`, 조회 필터·필드 가산 |
| 설정 변경 | `approval_settings_audit` | 변경 1건 | 1년 | 무변경(탭 위치만 이동) |

| 영역 | 변경 |
|---|---|
| 도메인(순수) | 신규 `src/domain/audit/approvalAudit.js`(입력 정규화·커서·행 투영), `src/domain/audit/certAudit.js`(묶음·건 투영·결과 분류), `src/domain/timesheet/worklogHistory.js` **가산**(`HistoryScope`·`linkedOf`·`historyScopeDecision`). 승인 엔진(`src/domain/approval/**`) **무변경** |
| resolver | 신규 3: `listApprovalAudit`·`listCertificationAudit`·`getCertificationBatchAudit`(전부 `{admin:true}`). 가산: `listWorklogHistory`(입력 `linkedOnly`, 항목 `workforceLinked`), `getApprovalSettings`/`saveApprovalSettings`(정책 키 `worklogHistoryScope`), 모든 이력·감사 응답의 UserMap(`accountType`) |
| 서비스 | 신규 `src/resolver/audit/{AuditController,ApprovalAuditService,ApprovalAuditRepository,CertAuditService,CertAuditRepository}.js`. 변경 `WorklogHistoryRecorder`(범위 판정·`wf_linked` 기록), `WorklogHistoryRepository`(`insertHistory` 칼럼·`search` 필터·행 읽기), `WorklogHistoryService`(`linkedOnly` 파싱·`userMapOf`), `WorkforceLinkRepository`(`verifiedLinkSignals`), `DirectoryService.normalizeUser`(`accountType` 가산), `SettingsRepository`·`SettingsService`(키 1) |
| 스키마 | v053 `worklog_history.wf_linked` ALTER, v054~v058 인덱스 5 |
| 트리거·스윕 | **새 트리거·새 큐 작업 없음.** 연결 판정은 관측 묶음 처리 중에만 SQL 1회(§4.4) |
| manifest | 변경 없음(모듈·scope·스케줄 추가 없음) |
| 엔트리 | 추가 없음(`settings` 엔트리 안) |
| i18n | 신규 `locales/{kr,en}/audit.json`, `worklogHistory.json`·`policy.json` 가산 |
| 워크포스 연동 | 계약(`contract.js`) **무변경**. 수신 캐시 `workforce_inbound` 를 읽기만(서명 검증 통과 행) |

### 1.1 대상과 scopeKey

이 기능은 결재 요청을 만들지 않는다(불변식 1 해당 없음). 감사 조회는 읽기 전용이고, 새 쓰기는 `worklog_history.wf_linked` 칼럼 하나 — 기존 `(worklog_id, seq)` PK·INSERT IGNORE 멱등 장치를 그대로 탄다.

---

## 2. 경계면 계약

공통: `{success:true, content:<아래>}` / `{success:false, error:{name,code,message,cause}}`. **아래 shape 은 전부 `res.content`.** 시각 epoch ms, 시간 양은 초. 새 resolver 는 **3단계 등록**(Controller `guardedDefine` → `PermissionMap` → `CONTROLLER_REGISTRARS` 에 `registerAuditController`).

### 2.1 신규 resolver

| resolver | 권한 축 | 입력(payload) | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `listApprovalAudit` | `{admin:true}` | `{ from: number, to: number (to>from, to-from ≤ 366일, to 배타), actorAccountId?: string, requesterAccountId?: string, projectId?: string(숫자), targetKinds?: TargetKind[], eventTypes?: EventType[], cursor?: string, limit?: int 1..200 (기본 50) }` | `ApprovalAuditPage` (§2.3) | `INVALID_TARGET`(cause `{field}` — from·to·actorAccountId·requesterAccountId·projectId·targetKinds·eventTypes·cursor·limit) | 설정 > 감사 > 결재(`ApprovalAuditTab`) + 엑셀 |
| `listCertificationAudit` | `{admin:true}` | `{ from, to (≤366일), actorAccountId?: string, subjectAccountId?: string, periodKey?: 'YYYY-MM', modes?: ('ENTRY'\|'MONTH')[], selfOnly?: boolean, outcomes?: CertOutcome[], includeItems?: boolean, cursor?: string, limit?: int 1..50 (기본 25; includeItems 면 1..10, 기본 10) }` | `CertAuditPage` (§2.4) | `INVALID_TARGET`(cause `{field}`) | 설정 > 감사 > 인증(`CertificationAuditTab`) + 엑셀(includeItems) |
| `getCertificationBatchAudit` | `{admin:true}` | `{ batchId: uuid }` | `CertBatchDetail` (§2.4) | `INVALID_TARGET`(batchId 형식), `REQUEST_NOT_FOUND`(묶음 없음) | 인증 탭 행 펼침 |

권한 축 결정 근거:
- 세 resolver 모두 기존 감사 검색(`listWorklogHistory`·`listSettingsAudit`)과 같은 `{admin:true}`(Jira 관리자 또는 앱 설정 관리자). 팀장용은 Q118 로 범위 밖.
- **가드 통과 ≠ 데이터 범위**(불변식 7): 이슈에 묶인 행은 조회자 asUser `filterVisibleIssues`(permissions/check 일괄)로 다시 좁혀 **행을 빼고 `hiddenCount`** — `listWorklogHistory` 와 같은 규칙(§2.6 형제 표).
- 쓰기 resolver 없음. 감사 데이터의 수정·삭제 경로는 기존 보관 정리뿐(계약 테스트 §4.7).

### 2.2 변경 resolver (가산만, 기존 필드 무변경)

| resolver | 권한 축(무변경) | 가산 | 소비 화면 |
|---|---|---|---|
| `listWorklogHistory` | `{admin:true}` | 입력 `linkedOnly?: boolean`(기본 false, boolean 아니면 `INVALID_TARGET {field:'linkedOnly'}`). `HistoryItem.workforceLinked: boolean \| null`(null = 칼럼 추가 전 행 또는 `PROJECT` 모드라 판정 안 함). `users[id].accountType` | 감사 > 워크로그 변경 |
| `getWorklogHistory`·`getTimesheetWorklogHistory`·`exportExpiredWorklogHistory` | 기존 | `HistoryItem.workforceLinked`, `users[id].accountType` | 탭 펼침·결재 상세·보관 내보내기(표시만) |
| `getApprovalSettings`·`saveApprovalSettings` | `{admin:true}` | 정책 키 `worklogHistoryScope: 'PROJECT' \| 'PROJECT_OR_LINKED' \| 'LINKED_ONLY'`(기본 `PROJECT_OR_LINKED`, GLOBAL_ONLY). 검증 실패 `INVALID_TARGET` | 타임시트 정책 > 워크로그 이력 |
| `listSettingsAudit` | `{admin:true}` | shape 무변경(정책 키 변경은 기존 `area:'policy'` 로 남는다) | 감사 > 설정 변경 |

```js
// UserMap 항목(가산) — 모든 이력·감사 응답 공통
{ displayName: string|null, avatarUrl: string|null, accountType: 'atlassian'|'app'|'customer'|null }
```

### 2.3 `ApprovalAuditPage`

```js
{
  items: ApprovalAuditItem[],      // occurredAt 내림차순 → eventId 내림차순
  hiddenCount: number,             // 이 페이지에서 열람 불가 이슈라 뺀 행 수
  nextCursor: string | null,       // SQL 페이지가 꽉 찼으면 다음 커서(뺀 행 때문에 items < limit 여도 계속 있음)
  users: UserMap,                  // 행위자·대리인·요청자·대상자
}

// ApprovalAuditItem
{
  eventId: 'uuid',                 // approval_event.event_id(결정적 — 불변식 6) = React key
  eventType: 'REQUESTED'|'APPROVED'|'REJECTED'|'EXPIRED'|'CANCELLED'|'CHANGED_AFTER_APPROVAL'|'CONSUMED'|'FIELD_APPLIED'|'APPLY_FAILED'|'APPLY_CONFLICT',
  occurredAt: number,
  actorAccountId: string | null,   // 명의자(결재자·요청자). 시스템 이벤트(EXPIRED 등)는 null
  delegateAccountId: string | null,// 대리 결재 시 실제로 누른 사람(ApprovalService: onBehalfOf 면 delegateKey = principal)
  reason: string | null,           // getApprovalHistory 의 events[].reason 과 같은 의미(만료 사유는 ExpiryReason 코드, 반려·회수는 사용자 입력)
  contentVersion: number | null,
  step: { order: number, name: string | null } | null,  // APPROVED·REJECTED 만 — approval_approver(같은 actor, decided_at = occurredAt) 매칭이 정확히 1개일 때
  request: {
    requestId: 'uuid',
    targetKind: TargetKind,
    title: string | null,          // approval_request.target_title(요청 시점 제목)
    issueId: string | null,
    issueKey: string | null,       // bulkfetch 현재 키 우선, 없으면 저장값 issue_key
    projectId: string | null,
    projectKey: string | null,     // bulkfetch 현재값(없으면 null)
    subjectAccountId: string | null, periodKey: string | null,   // TIMESHEET
    requesterAccountId: string | null,
    status: ApprovalStatus,        // 현재 상태
    revision: number,
  },
}
```

필터 의미:
- `actorAccountId` — 이 사람이 **명의자**(`actor_key`)이거나 **대리인**(`delegate_key`)인 이벤트. 요청·회수·결정을 모두 포함한다("이 사람이 한 일").
- `requesterAccountId` — 이 사람이 올린 요청의 **모든** 이벤트(요청의 생애).
- `targetKinds` — 종류(`TargetKind` 값 집합). `eventTypes` — 결과(이벤트 종류 집합). 빈 배열·생략 = 전체.
- 여러 필터는 AND.

엑셀: 프론트가 `limit:200` 으로 반복, **최대 10,000행**에서 멈추고 잘림 표시(`listWorklogHistory` 와 같은 규칙). 뺀 행 수 합계를 시트 머리에.

### 2.4 `CertAuditPage` / `CertBatchDetail`

```ts
type CertOutcome = 'ALL_VALID' | 'HAS_MISMATCH' | 'HAS_DELETED' | 'HAS_SUPERSEDED';

type CertBatchSummary = {
  batchId: string,                 // uuid
  createdAt: number,
  actorAccountId: string,          // 인증자
  subjectAccountId: string,        // 대상자(작성자)
  selfCertified: boolean,          // actor = subject (cert §5.2.1 — 파생)
  periodKey: string,
  mode: 'ENTRY' | 'MONTH',
  pinVerified: boolean,
  itemCount: number,               // 묶음 행의 item_count(인증 시점)
  policy: { unit: string, deletedHandling: string, revision: string|null } | null,   // policy_json 해석(형식 밖이면 null)
  current: {                       // 지금 이 묶음이 "현재본"인 건들의 상태
    certified: number, mismatch: number, deleted: number,
    superseded: number,            // 재인증·승격으로 덮인 건(worklog_cert_log.batch_id = 이 묶음)
    certifiedSeconds: number,      // 현재본 cert_seconds 합
  },
  outcome: CertOutcome,            // 우선순위 HAS_DELETED > HAS_MISMATCH > HAS_SUPERSEDED > ALL_VALID
};

type CertAuditPage = {
  items: CertBatchSummary[],       // createdAt 내림차순 → batchId 내림차순
  filteredCount: number,           // outcomes 필터로 이 페이지에서 뺀 묶음 수(SQL 이 아니라 서버 후처리)
  nextCursor: string | null,
  users: UserMap,
  itemsByBatch?: { [batchId: string]: CertBatchItem[] },   // includeItems:true 일 때만(엑셀)
  hiddenCount?: number,            // includeItems 에서 열람 불가 이슈라 뺀 건 수
};

type CertBatchItem = {
  worklogId: string, issueId: string,
  issue: { issueKey: string|null, summary: string|null, projectKey: string|null },
  certifiedStarted: number, certifiedSeconds: number,
  countedSeconds: number | null,   // 현재본만(정책 KEEP/ZERO 적용 — cert counting.js) — 덮인 판은 null
  state: 'CERTIFIED' | 'MISMATCH' | 'DELETED' | 'SUPERSEDED',
  stateChangedAt: number | null,   // 인증 후 변경·삭제 감지 시각(현재본)
  superseded: { byBatchId: string, at: number } | null,
  selfCertified: boolean,
  frozen: { firstStarted: number|null, firstSeconds: number|null, editCount: number, lastSeq: number|null, signals: SignalCode[], lateDays: number|null },
};

type CertBatchDetail = {
  batch: CertBatchSummary,
  items: CertBatchItem[],          // worklogId 숫자 오름차순, 최대 200(인증 1회 상한과 같다)
  hiddenCount: number,
  users: UserMap,
};
```

필터 의미(요구 "결재자/요청자/종류/결과"의 인증 대응):
- 결재자 → `actorAccountId`(인증자), 요청자 → `subjectAccountId`(대상자 = 워크로그 작성자), 종류 → `modes` + `selfOnly`, 결과 → `outcomes`(현재 상태 분류 — 저장 칼럼이 아니라 조회 시 계산이라 **페이지 후처리**, `filteredCount` 로 알린다).
- `periodKey` 는 인증 대상 월. 기간(`from`·`to`)은 **인증 시각**(`created_at`) 기준.
- 관찰 경로의 자동 전이(인증 후 변경·삭제 감지)는 행위자가 없는 사실이라 묶음의 `current` 숫자와 건의 `stateChangedAt` 으로 보인다(별도 이벤트 행을 만들지 않는다).
- 동결된 옛 요청형 인증(`WORKLOG_CERTIFICATION` 결재 요청, cert Q106)은 **결재 탭**에 `targetKind=WORKLOG_CERTIFICATION` 으로 나온다.

### 2.5 커서

| resolver | 형식 | 정렬 키 |
|---|---|---|
| `listApprovalAudit` | `'<occurredAtMs>\|<eventUuid>'` | `(occurred_at DESC, event_id DESC)` |
| `listCertificationAudit` | `'<createdAtMs>\|<batchUuid>'` | `(created_at DESC, batch_id DESC)` |

형식 밖 → `INVALID_TARGET {field:'cursor'}`. `occurred_at`·`created_at` 은 TIMESTAMP(초 정밀)라 동률이 흔하다 — id 가 동률을 끊는다.

### 2.6 형제 resolver 범위(불변식 7)

| 데이터 | resolver | 좁히는 규칙 |
|---|---|---|
| 결재 이벤트 | `listApprovalAudit` | `{admin:true}` + 이슈에 묶인 요청(`issue_id` 있음 — ISSUE·ISSUE_TRANSITION·FIELD_CHANGE·WORKLOG_CREATE·WORKLOG_CERTIFICATION)은 `filterVisibleIssues` 로 열람 불가면 **행 제외** + `hiddenCount`. TIMESHEET(이슈 없음)는 관리자에게 그대로 |
| 결재 이벤트(요청 단위) | `getApprovalHistory`(기존 SELF) | 무변경 — `assertTargetVisible` |
| 인증 묶음 | `listCertificationAudit` | `{admin:true}`. 묶음 요약은 **숫자만**(이슈 정체 없음 — cert 매트릭스와 같은 수준) |
| 인증 건 | `getCertificationBatchAudit`·`listCertificationAudit(includeItems)` | 건의 `issue_id` 를 `filterVisibleIssues` → 열람 불가 건 **제외** + `hiddenCount` |
| 인증 건(팀장·본인) | `listMemberCertifications`·`listOwnCertifications`(cert 설계) | 무변경 |
| 워크로그 변경 | `listWorklogHistory` 외 4종 | 무변경(worklog-history §4.7). `linkedOnly` 는 범위를 **좁히기만** 한다 |
| 설정 변경 | `listSettingsAudit` | 무변경 |
| 읽기/쓰기 대칭 | 감사는 읽기 전용 | 쓰기 resolver 없음 — 계약 테스트로 단언 |

`filterVisibleIssues` 가 throw 하거나 판정 불완전이면 그 이슈 행은 **뺀다**(fail-close, 기존 이력 검색과 같다).

### 2.7 에러 코드

새 코드 없음. `INVALID_TARGET`(cause `{field}`), `REQUEST_NOT_FOUND`. 테이블 미준비는 **빈 결과**(`items:[]`) — 인증 테이블이 아직 없는 설치에서도 탭이 깨지지 않는다.

### 2.8 프론트 호출 대응

| 화면 | 호출 | 쿼리키 | 무효화 |
|---|---|---|---|
| `ApprovalAuditTab` | `listApprovalAudit`(useInfiniteQuery) | `auditKeys.approval(filters)` | 없음(읽기 전용) |
| `CertificationAuditTab` | `listCertificationAudit` | `auditKeys.certification(filters)` | 없음 |
| 묶음 펼침 | `getCertificationBatchAudit` | `auditKeys.certBatch(batchId)` | 없음 |
| `WorklogHistoryAuditSettings`(이동) | `listWorklogHistory` | `worklogHistoryKeys.audit(filters)`(기존) | 없음 |
| `AuditSettings`(설정 변경, 이동) | `listSettingsAudit` | `settingsKeys.audit()`(기존) | 없음 |
| 타임시트 정책 수집 범위 | `saveApprovalSettings({worklogHistoryScope})` | `settingsKeys.*`(기존) | 기존 |

---

## 3. 도메인 (순수 — `Date.now()`·무인자 `new Date()` 금지)

### 3.1 `src/domain/audit/approvalAudit.js`

| 함수 | 입력 → 출력 | 규칙 |
|---|---|---|
| `parseApprovalAuditQuery(payload)` | → `{ ok:true, query } \| { ok:false, field }` | from/to 정수·`to>from`·`to-from ≤ 366*86400000`. 계정 id `/^[A-Za-z0-9:_-]{1,128}$/`, projectId `/^\d{1,18}$/`. `targetKinds ⊆ TargetKind`, `eventTypes ⊆ EventType`(중복 제거, 빈 배열 = 필터 없음). limit 정수 1..200 |
| `encodeAuditCursor({at, id})` / `decodeAuditCursor(s)` | ↔ `'ms\|uuid'` | uuid 소문자 정규식, ms 0 이상 안전 정수. 밖이면 null |
| `isIssueBound(row)` | → boolean | `issue_id` 가 숫자 문자열이면 true(종류 목록이 늘어도 칼럼 기준) |
| `stepOf(event, approverRows)` | → `{order, name} \| null` | APPROVED·REJECTED 이고 같은 actor·`decidedAt === occurredAt` 행이 정확히 1개일 때만 |
| `approvalAuditItemOf(row, { issueMeta, step })` | Repository 행 → `ApprovalAuditItem` | 키 이름만 바꾸고 값은 그대로 |
| `peopleOfApprovalItems(items)` | → string[] | actor·delegate·requester·subject, 중복 제거 |

### 3.2 `src/domain/audit/certAudit.js`

| 함수 | 입력 → 출력 | 규칙 |
|---|---|---|
| `parseCertAuditQuery(payload)` | → `{ok, query}\|{ok:false, field}` | 위 + `periodKey` `/^\d{4}-(0[1-9]\|1[0-2])$/`, `modes ⊆ {ENTRY,MONTH}`, `outcomes ⊆ CertOutcome`, `selfOnly`·`includeItems` boolean, `includeItems` 면 limit ≤10 |
| `batchSummaryOf(batchRow, { currentRows, logRows })` | → `CertBatchSummary` | `current` 집계: `currentRows` 중 `batch_id = 이 묶음` 을 state 별로, `logRows` 중 `batch_id = 이 묶음` 수 = superseded. `selfCertified = actor === subject`. `policy_json` 파싱 실패 → `policy:null` |
| `outcomeOf(current)` | → `CertOutcome` | 우선순위 DELETED > MISMATCH > SUPERSEDED > ALL_VALID |
| `batchItemsOf(batchId, { currentRows, logRows, policy })` | → `CertBatchItem[]` | 현재본(`batch_id` 일치) + 덮인 판(log `batch_id` 일치, state=`SUPERSEDED`, `superseded={byBatchId: superseded_by, at: superseded_at}`). `countedSeconds` 는 cert 도메인 `counting.js` 를 그대로 호출(재구현 금지). `signals` 는 cert `summary.js` 의 비트 해석 함수 재사용 |
| `encodeCertCursor`/`decodeCertCursor` | 3.1 과 같은 형식 | |

### 3.3 `src/domain/timesheet/worklogHistory.js` 가산

```js
export const HistoryScope = Object.freeze({ PROJECT: 'PROJECT', PROJECT_OR_LINKED: 'PROJECT_OR_LINKED', LINKED_ONLY: 'LINKED_ONLY' });

/** 워크포스 연결 판정 — 서명 검증된 수신 캐시에서 뽑은 집합만 받는다(불변식 9). 프로퍼티 원문은 이 함수에 오지 않는다. */
export const linkedOf = ({ authorId, projectId, signals }) =>
  Boolean((authorId && signals.orgAccounts.has(authorId)) || (projectId && signals.projects.has(projectId)));

/** 수집 여부. projectEnabled = 기존 규칙(적용 프로젝트 미선택이면 전체, 선택 뒤엔 켠 것만). */
export const historyScopeDecision = ({ scope, projectEnabled, linked }) => {
  if (scope === HistoryScope.LINKED_ONLY) return linked;
  if (scope === HistoryScope.PROJECT) return projectEnabled;
  return projectEnabled || linked;          // 기본 PROJECT_OR_LINKED. 모르는 값도 여기(넓히는 쪽)
};
```
기존 행 빌더에 `wfLinked: boolean|null` 인자 가산 — 행에 그대로 싣는다(`planObservation` 결정 표는 무변경, 행 내용만 하나 늘어난다). `historyItemOf` 는 `workforceLinked: row.wfLinked ?? null`.

### 3.4 테스트 케이스

`src/domain/audit/__test__/approvalAudit.test.js`
1. 범위: `to-from = 366일` 통과, `+1ms` 거부(`field:'to'`), `to ≤ from` 거부
2. 계정·프로젝트·종류·결과·limit 형식 밖 → 해당 field
3. 커서 왕복, 대문자 uuid·음수·문자 섞임 거부
4. `stepOf`: 매칭 0·2개 → null, 1개 → 값, REQUESTED 는 항상 null
5. `isIssueBound`: TIMESHEET(issue_id null) false, 숫자 문자열 true
6. 정적 단언: 파일에 `Date.now`·무인자 `new Date()` 없음

`src/domain/audit/__test__/certAudit.test.js`
1. `batchSummaryOf`: 현재본 3(CERTIFIED 2·MISMATCH 1) + log 1 → `{certified:2, mismatch:1, deleted:0, superseded:1}`, outcome `HAS_MISMATCH`
2. outcome 우선순위 4종
3. `selfCertified` 파생, `policy_json` 깨짐 → null
4. `batchItemsOf`: 덮인 판 state `SUPERSEDED`·`countedSeconds:null`, 현재본은 cert `counting` 결과와 동일(KEEP/ZERO 각 1건)
5. 입력 불변(in-place 없음), 정적 단언

`src/domain/timesheet/__test__/worklogHistory.test.js` 가산
1. `historyScopeDecision` 3모드 × (projectEnabled, linked) 4조합 = 12건, 모르는 scope 값 = PROJECT_OR_LINKED
2. `linkedOf`: author 만 / project 만 / 둘 다 없음 / null 인자

---

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/audit/approvalAudit.js · certAudit.js                신규(순수)
src/resolver/audit/ApprovalAuditRepository.js                    신규 — approval_event/request/approver 읽기 전용
src/resolver/audit/ApprovalAuditService.js                       신규
src/resolver/audit/CertAuditRepository.js                        신규 — worklog_cert_batch/cert/log 읽기 전용
src/resolver/audit/CertAuditService.js                           신규
src/resolver/audit/AuditController.js                            신규 — guardedDefine 3
src/resolver/worklogHistory/WorklogHistoryRecorder.js            변경 — 범위 판정(§4.4), wf_linked
src/resolver/worklogHistory/WorklogHistoryRepository.js          변경 — insertHistory 칼럼, search linkedOnly, 행 읽기
src/resolver/worklogHistory/WorklogHistoryService.js             변경 — linkedOnly 파싱, userMapOf 에 accountType
src/resolver/workforce/WorkforceLinkRepository.js                변경 — verifiedLinkSignals(§4.4)
src/resolver/directory/DirectoryService.js                       변경 — normalizeUser 에 accountType(가산)
src/resolver/settings/SettingsRepository.js · SettingsService.js 변경 — worklogHistoryScope(세 곳 동시 + normalizer)
src/rdb/schema/ddl/audit.sql.js · ddl/index.js · migrate.js      v053~v058
src/permission/PermissionMap.js · src/index.js                   등록
```

### 4.2 `ApprovalAuditRepository`

| 메서드 | SQL 요지 |
|---|---|
| `ready()` | `approval_request`·`approval_event`·`approval_approver` 준비(기존 `READ_TABLES` 와 같은 프로브) |
| `search(q)` | 아래 |
| `stepsFor(pairs)` | `SELECT BIN_TO_UUID(request_id) AS request_id, actor_key, step_order, step_name, decided_at FROM approval_approver WHERE request_id IN (…) AND actor_key IN (…)` 후 메모리에서 쌍 매칭 — 페이지의 APPROVED·REJECTED 이벤트만. 빈 배열이면 SQL 없음. PK `(request_id, step_order, actor_key)` 접두 |

`search` — 한 문장(Forge SQL 단일 문장 규칙):

```sql
SELECT BIN_TO_UUID(e.event_id) AS event_id, BIN_TO_UUID(e.request_id) AS request_id, e.event_type, e.actor_key,
       e.delegate_key, e.occurred_at, e.reason, e.content_version,
       r.target_kind, r.target_title, r.issue_id, r.issue_key, r.project_id, r.subject_account, r.period_key,
       r.requester_key, r.status, r.revision
  FROM approval_event e
  JOIN approval_request r ON r.request_id = e.request_id
 WHERE e.occurred_at >= ? AND e.occurred_at < ?
   AND r.commit_state = 'LIVE' AND r.deleted_at IS NULL
   [AND e.event_id IN (SELECT event_id FROM approval_event WHERE actor_key = ? AND occurred_at >= ? AND occurred_at < ?
                       UNION SELECT event_id FROM approval_event WHERE delegate_key = ? AND occurred_at >= ? AND occurred_at < ?)]  -- actorAccountId
   [AND e.request_id IN (SELECT request_id FROM approval_request WHERE requester_key = ?)]                                       -- requesterAccountId
   [AND r.project_id = ?] [AND r.target_kind IN (…)] [AND e.event_type IN (…)]
   [AND (e.occurred_at < ? OR (e.occurred_at = ? AND e.event_id < UUID_TO_BIN(?)))]                                              -- cursor
 ORDER BY e.occurred_at DESC, e.event_id DESC
 LIMIT n
```

- 사람 필터 하위 질의는 각자 인덱스(`ix_event_actor_occurred`·`ix_event_delegate_occurred`·기존 `ix_request_requester`)를 탄다. 필터가 없으면 `ix_event_occurred` 범위 스캔.
- **인덱스는 성능만 바꾼다** — 인덱스 마이그레이션이 실패해도 결과는 같다(더 느릴 뿐). 그래서 인덱스 준비 프로브는 두지 않는다.
- 시각 바인딩은 `toSqlTimestamp`(SqlTime 경계 — TIMESTAMP 에 숫자 금지), `IN` 은 `inClause`. 빈 목록은 파서가 "필터 없음"으로 정규화해 절 자체를 만들지 않는다(빈 `IN ()` 미발행).
- LIMIT 은 정수 검증 뒤 리터럴(기존 Repository 관례).
- 하위 질의 문법(`IN (… UNION …)`)이 거부되거나 인덱스를 못 타면 두 질의로 나눠 서비스에서 키셋 병합(미검증 A8).

### 4.3 `ApprovalAuditService.listApprovalAudit`

```
q = parseApprovalAuditQuery(payload)  (실패 → INVALID_TARGET {field})
ready() 거짓 → { items:[], hiddenCount:0, nextCursor:null, users:{} }
rows = repo.search(q)                                   // limit 그대로(빈 행 보충 안 함 — 이력 검색과 같은 의미)
visibility = filterVisibleIssues(rows.filter(isIssueBound).map(issue_id)).catch(→ 빈 결과 = 이슈 행 전부 숨김)
kept = rows.filter(row => !isIssueBound(row) || visibility.visible.has(row.issue_id))
approvers = repo.stepsFor(kept 중 APPROVED/REJECTED)
items = kept.map(row => approvalAuditItemOf(row, { issueMeta: visibility.issues.get(issue_id), step: stepOf(row, approvers) }))
users = loadUsers(peopleOfApprovalItems(items))         // user/bulk, accountType 포함
return { items, hiddenCount: rows.length - kept.length, nextCursor: rows.length === q.limit ? encode(rows 마지막) : null, users }
```
- 반려 사유는 사용자 텍스트 — 응답에는 싣되 로그에는 남기지 않는다(AGENTS).
- 보관 정리로 지운 요청은 나오지 않는다(L7 — 엑셀이 원본).

### 4.4 워크로그 이력 수집 범위 — "워크포스와 연결된 워크로그"

**신호(불변식 9 준수)**: `workforce_inbound` 의 `status='VERIFIED'` 행만. 이 테이블에는 **서명 검증을 통과한 본문만** 들어간다(`workforceLink.sql.js` 주석·`WorkforceInbound` 의 verify→apply 경로). 엔티티 프로퍼티 원문(`movesRmsLink` 포함)은 읽지 않는다.

| 신호 | typ / entity_id | 의미 | 갱신 |
|---|---|---|---|
| 작성자 | `rms.org` / `{accountId}` | 워크포스 조직에 속한 사람 | 본인 접속(selfRead) 때. sticky(Q41) |
| 프로젝트 | `rms.policy` / `P:{projectId}` | 워크포스가 정책을 서명한 프로젝트 | 프로젝트 관리자 새로고침(`refreshWorkforcePolicies`) |
| 프로젝트 | `rms.pm` / `{projectId}` | 워크포스가 PM 을 서명한 프로젝트 | 위반 표시 때 |

`rms.check`(워크로그 단위)는 캐시가 없어(수집 때 검증만) 쓰지 않는다.

**"검증된 적 있음"으로 충분한 이유**: 만료(`exp`)는 정책 **강제**의 신선도 문제다. 범위 판정은 "더 기록할지"라 오판의 방향이 용량뿐이고, 서명은 이미 검증됐다(위조 불가). 만료로 범위에서 빠지면 오히려 연결 워크로그의 이력이 끊긴다(요구 1 위반). 워크포스가 연결을 끊어도 sticky 라 수집이 계속된다 — 이것도 넓히는 쪽이다. 연결 해제를 반영하려면 정책을 `PROJECT` 로.

**새 Repository 메서드** `WorkforceLinkRepository.verifiedLinkSignals({ accountIds, projectIds })`:
```sql
SELECT typ, entity_id FROM workforce_inbound
 WHERE status = 'VERIFIED'
   AND ((typ = 'rms.org' AND entity_id IN (…accountIds))
     OR (typ = 'rms.policy' AND entity_id IN (…'P:'+projectIds))
     OR (typ = 'rms.pm' AND entity_id IN (…projectIds)))
```
PK `(typ, entity_id)` 접두. 빈 목록 절은 빼고, 둘 다 비면 SQL 없이 빈 집합. → `{ orgAccounts:Set, projects:Set }`.

**Recorder 변경(`observe`)** — 현재 `inScope = projectId && (!configured || detail?.enabled === true)` 를 다음으로:
```
scopeMode = settings.getValue(worklogHistoryScope)   (KVS 1 — isEnabled 와 같은 방식, 저장값 없으면 PROJECT_OR_LINKED)
needSignals = scopeMode !== PROJECT && linkGate()
signals = needSignals ? linkRepo.verifiedLinkSignals({authors, projects}) : EMPTY     // 관측 묶음당 SQL 1
for change:
  projectEnabled = Boolean(projectId) && (!configured || detail?.enabled === true)
  linked = needSignals ? linkedOf({authorId, projectId, signals}) : null
  inScope = historyScopeDecision({scope: scopeMode, projectEnabled, linked: linked === true})
  observeOne(..., wfLinked: linked)        // PROJECT 모드면 null(판정 안 함)
```
- `linkGate()` = 정책 `workforceLinkEnabled !== false`(KVS) **그리고** `hasAnyVerifiedInbound()`(SQL 1, invocation memo). 워크포스 미설치 사이트는 SQL 1회로 끝나고 `linked=false` — `LINKED_ONLY` 면 아무것도 기록하지 않는다(설정 화면 경고 §7).
- 작성자 id 는 `current.authorId ?? knownBefore.authorId ?? mirror.authorId`. 프로젝트를 못 정해도(조회 실패) 작성자 신호로 연결이면 수집한다(이력 `project_id` NULL 허용 — 기존 칼럼 그대로).
- 정책 계층의 `historyEnabled`(프로젝트·이슈 덮어쓰기)가 false 인 이슈: `PROJECT_OR_LINKED`·`LINKED_ONLY` 에서 **연결 워크로그는 수집한다**(요구 1 이 우선). 전역 `worklogHistoryEnabled=false` 는 지금처럼 전부 끈다(관리자의 명시적 결정 — 설정 화면 경고).
- `wants()`(트리거의 asApp 조회 전 관문)는 무변경 — 전역 스위치·준비 여부만 본다. 범위 판정은 조회 뒤라 이벤트당 asApp 호출 수 불변.
- 인증 관찰은 범위와 무관하게 지금처럼 돈다(무변경).
- `wf_linked` 칼럼 준비 여부는 `isColumnReady('worklog_history','wf_linked')`(스키마 마커 신뢰 경로) — 미준비면 칼럼 없이 기존 INSERT.
- 같은 seq 경합에서 진 쪽은 "저장된 행 채택" 규칙대로 먼저 저장된 행의 `wf_linked` 를 따른다(재조회 결과를 그대로 씀).

**Recorder 는 인증 백엔드가 지금 고치는 파일이다.** 이 변경은 인증 백엔드 커밋 뒤에 얹는다(§11 선행 조건).

### 4.5 `CertAuditRepository` / `CertAuditService`

| 메서드 | SQL 요지 |
|---|---|
| `ready()` | `worklog_cert_batch`·`worklog_cert`·`worklog_cert_log` 준비 |
| `searchBatches(q)` | `SELECT BIN_TO_UUID(batch_id) AS batch_id, actor_account, subject_account, period_key, mode, pin_verified, policy_json, item_count, created_at FROM worklog_cert_batch WHERE created_at >= ? AND created_at < ? [AND actor_account=?] [AND subject_account=?] [AND period_key=?] [AND mode IN (…)] [AND actor_account = subject_account] [키셋] ORDER BY created_at DESC, batch_id DESC LIMIT n` — `ix_wcb_created` |
| `currentRowsFor(pairs)` | `SELECT … FROM worklog_cert WHERE (period_key, author_account) IN ((?,?),…)` — 페이지 묶음의 (월, 대상자) 쌍(≤ limit 개). 기존 `ix_wcert_period_author`. 묶음 매칭은 도메인이 `batch_id` 로 |
| `logRowsFor(pairs)` | 같은 조건으로 `worklog_cert_log` — `ix_wcl_period_author`(v058) |
| `findBatch(batchId)` | PK |

- 대상자×월 한 쌍의 행은 평균 100건 안팎(cert §9.1). 페이지 25 묶음이면 최대 수천 행이지만 칼럼이 작다(id·상태·초·batch).
- 재인증으로 **월이 바뀐** 건: 덮인 판은 log 에 옛 월로 남고(그 월 쌍으로 잡힌다), 현재본은 새 묶음의 새 월에 잡힌다 — 누락 없음.
- `includeItems`: 묶음 ≤10 × 건 ≤200 = 최대 2,000건/호출. 이슈 메타·가시성은 `filterVisibleIssues` 일괄.
- `outcomes` 후처리: 요약 계산 뒤 거르고 `filteredCount`. 커서는 SQL 마지막 행 기준(빠진 묶음 때문에 멈추지 않는다).
- 인증 테이블 미준비(인증 기능 배포 전) → 빈 결과.

### 4.6 정책 키 (`SettingsRepository` 세 곳 동시 + `SettingsService` normalizer)

| 키 | KVS | 기본 | 검증 | GLOBAL_ONLY |
|---|---|---|---|---|
| `worklogHistoryScope` | `approval:settings:worklogHistoryScope` | `'PROJECT_OR_LINKED'` | `enumValue(Object.values(HistoryScope))` | 예 |

`SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`·`GLOBAL_ONLY_KEYS` 를 함께(어긋나면 정책 조회 전체가 죽는다 — CLAUDE.md 함정). 계약 테스트 `SettingsPolicyKeys.test.js` 가 대조. 인증 백엔드가 같은 세 곳에 5키를 넣는 중이라 **병합 충돌 주의**(그 뒤에 붙인다).
기본값 효과: 배포 즉시 "앱 꺼진 프로젝트의 연결 워크로그"가 수집 대상이 된다 — 보고서·릴리스 노트에 적는다.

### 4.7 불변식·완료 기준 대조

| 항목 | 이 설계 |
|---|---|
| 1 열린 요청 하나 | 해당 없음(요청 생성 없음) |
| 2 결정이 진실 | 결재 감사는 `approval_event` 를 보여 주고, 단계는 `approval_approver` 원천에서 붙인다. 상태 재계산 없음 |
| 3 도메인 순수 | `src/domain/audit/*` 는 범위·커서·행만 받는다. 정적 단언 테스트 |
| 4 CAS | 새 UPDATE 없음 |
| 5 승인자 행 | 읽기만 |
| 6 결정적 id | 결재 행 key = `event_id`, 인증 = `batch_id`·`(worklog_id, cert_rev)`, 이력 = `(worklog_id, seq)`. `wf_linked` 는 기존 INSERT IGNORE 에 칼럼만 추가 |
| 7 범위 재축소 | §2.6 — 형제 전수 |
| 8 asUser 기본 | 새 Jira 호출은 전부 asUser(`permissions/check`·`issue/bulkfetch`·`user/bulk`). asApp 추가 없음 |
| 9 프로퍼티 불신 | 연결 판정은 서명 검증 캐시만. `movesRmsLink` 등 원문 미사용 — 테스트: `verifiedLinkSignals` 가 `status<>'VERIFIED'` 행을 돌려주지 않는다 |
| 10 validator | 해당 없음 |
| 감사 읽기 전용 | 계약 테스트: ① `PermissionMap` 의 신규 3 키가 `list`/`get` 으로 시작 ② `src/resolver/audit/**` 소스에 `INSERT`·`UPDATE`·`DELETE` 문자열 없음 ③ `worklog_history` UPDATE 없음(기존) |
| 유휴 SQL 0 추가 | §9.3 + `idleSqlBudget.test.js` 상한 무변경 통과 |

### 4.8 필수 테스트

- `ApprovalAuditService.test.js`: ① 열람 불가 이슈 행 제외·`hiddenCount` ② TIMESHEET 행은 가시성 호출 없이 통과 ③ `filterVisibleIssues` throw → 이슈 행 전부 제외(fail-close), TIMESHEET 는 남음 ④ 꽉 찬 SQL 페이지 → `nextCursor` 있음(일부가 빠져도) ⑤ 미준비 → 빈 페이지 ⑥ `step` 매칭 ⑦ 대리 결재 행(`delegateAccountId`)
- `ApprovalAuditRepository.test.js`: SQL 에 `toSqlTimestamp` 경계, 빈 IN 미발행, `commit_state='LIVE' AND deleted_at IS NULL`, 사람 필터 둘 다면 두 하위 질의가 함께
- `CertAuditService.test.js`: ① 묶음 요약 숫자 ② 펼침에서 열람 불가 건 제외 ③ 재인증으로 월이 바뀐 건이 옛 묶음에는 SUPERSEDED, 새 묶음에는 현재본 ④ `outcomes` 후처리·`filteredCount` ⑤ `selfOnly` ⑥ 미준비 → 빈 결과
- `WorklogHistoryRecorder.test.js` 가산: 3모드 × (프로젝트 켬/끔) × (연결/비연결) 기록 여부, `PROJECT` 모드에서 `verifiedLinkSignals` 미호출, 워크포스 미연결(`hasAnyVerifiedInbound=false`) → 신호 SQL 0, `wf_linked` 칼럼 미준비 → 기존 INSERT, 프로젝트 조회 실패 + 작성자 연결 → 수집(project_id NULL), 정책 계층 `historyEnabled=false` 이슈의 연결 워크로그 → 수집
- `WorkforceLinkRepository.test.js`: `verifiedLinkSignals` 빈 입력 SQL 0, VERIFIED 만
- `permissionMap.contract.test.js`: 신규 3 등록 대조(자동)
- `idleSqlBudget.test.js`: 무변경 통과

---

## 5. 스키마·마이그레이션

### 5.1 `src/rdb/schema/ddl/audit.sql.js` (신규)

```sql
-- v053_alter_worklog_history_wf_linked — 기록 시점 워크포스 연결 여부(NULL = 판정 안 함·칼럼 이전 행)
ALTER TABLE worklog_history ADD COLUMN IF NOT EXISTS wf_linked TINYINT(1) NULL

-- v054_index_approval_event_occurred — 기간 범위 스캔·키셋(필터 없음)
CREATE INDEX IF NOT EXISTS ix_event_occurred ON approval_event (occurred_at, event_id)

-- v055_index_approval_event_actor — 행위자 필터
CREATE INDEX IF NOT EXISTS ix_event_actor_occurred ON approval_event (actor_key, occurred_at)

-- v056_index_approval_event_delegate — 대리인 필터(대부분 NULL — 작다)
CREATE INDEX IF NOT EXISTS ix_event_delegate_occurred ON approval_event (delegate_key, occurred_at)

-- v057_index_worklog_cert_batch_created — 인증 묶음 기간 조회
CREATE INDEX IF NOT EXISTS ix_wcb_created ON worklog_cert_batch (created_at, batch_id)

-- v058_index_worklog_cert_log_period_author — 묶음 펼침의 덮인 판
CREATE INDEX IF NOT EXISTS ix_wcl_period_author ON worklog_cert_log (period_key, author_account)
```

근거(파일 머리 주석에 옮긴다):
- **칼럼을 인덱스보다 앞에 둔다.** 인덱스 마이그레이션이 실패하면 뒤가 막히는데, 칼럼은 기록 경로가 쓰고 인덱스는 조회 성능만이다.
- `approval_request` 인덱스는 이미 충분하다(`ix_request_requester` 가 요청자 하위 질의를 덮는다). 프로젝트·종류는 기간 범위 안에서 거른다.
- `approval_approver` 는 PK `(request_id, step_order, actor_key)` 접두로 단계 이름을 찾는다 — 인덱스 추가 없음.
- `worklog_cert` 에 `batch_id` 인덱스를 두지 않는다(연 24만 행 × ≈50B ≈ 12MB). 펼침은 기존 `(period_key, author_account)` + 메모리 매칭으로 충분.
- `wf_linked` 는 NULL 허용 — DEFAULT 0 이면 "칼럼 추가 전 행"과 "비연결"이 구분되지 않는다. 인덱스 없음(감사 검색은 기간 범위 안에서 거른다).

### 5.2 migrate.js (뒤에만 붙인다)

```js
  ['v053_alter_worklog_history_wf_linked', ALTER_WORKLOG_HISTORY_WF_LINKED],
  ['v054_index_approval_event_occurred', CREATE_IX_EVENT_OCCURRED],
  ['v055_index_approval_event_actor', CREATE_IX_EVENT_ACTOR],
  ['v056_index_approval_event_delegate', CREATE_IX_EVENT_DELEGATE],
  ['v057_index_worklog_cert_batch_created', CREATE_IX_WCB_CREATED],
  ['v058_index_worklog_cert_log_period_author', CREATE_IX_WCL_PERIOD_AUTHOR],
```
- **v052 뒤에만**(인증 백엔드 v049~v052 커밋 뒤). 그쪽 번호가 바뀌면 밀어 쓴다(프로덕션 미배포라 재정렬 가능 — 첫 배포 뒤로는 금지).
- `CREATE INDEX IF NOT EXISTS` 는 v052 와 같은 미검증(cert U6 = A7)이다. v052 실측 결과를 따른다 — 실패면 `ALTER TABLE … ADD INDEX IF NOT EXISTS …` 로 일괄 교체.
- `ddl/index.js` re-export. 신규 테이블 없음 — 인덱스·칼럼 추가의 major 여부는 배포 시 확인(`--approve MAJOR_VERSION_RULE` 준비).
- 스키마 마커(`schema:version`)가 v058 로 바뀐다 — 첫 호출의 `ensureMigratedOnce` 가 따라잡는다(기존 흐름).

### 5.3 인증 백엔드와의 조율(선택)

인증 테이블(v050 `worklog_cert_batch`, v051 `worklog_cert_log`)이 **아직 배포 전**이면 v057·v058 인덱스를 각 CREATE 안에 인라인으로 넣는 것이 낫다(마이그레이션 2개 감소, migrate.js 머리 주석 "인덱스는 CREATE 안에 인라인" 관례와 일치). 결정은 인증 백엔드 리더가 한다 — 흡수하면 이 설계의 v057·v058 은 빠진다. 이 설계는 **흡수하지 않은 경우**를 기본으로 적었다(구현 중인 DDL 을 건드리지 않는다).

---

## 6. Jira 연결

| REST | 주체 | 호출 위치 | 비고 |
|---|---|---|---|
| `POST /rest/api/3/permissions/check` + `POST /rest/api/3/issue/bulkfetch`(`filterVisibleIssues`) | asUser | 결재 감사·인증 펼침·인증 엑셀 | 이슈 100개당 각 1 |
| `POST /rest/api/3/user/bulk`(`loadUsers` → `DirectoryService.resolveUsers`) | asUser | 신규 3 + 기존 이력 조회 | 50명당 1. `accountType` 은 같은 응답 |

- manifest: 모듈·scope·트리거 **변경 없음**. M1(감사 로그 REST)을 채택하지 않으므로 `manage:jira-configuration` 추가 없음.
- asApp: 추가 없음. AGENTS.md 허용 목록 무변경.
- `route` 인코딩: 새 GET 쿼리스트링 없음(전부 POST 본문).

---

## 7. 프론트

### 7.1 통합 타임라인 vs 탭 — 권고: **탭 분리**(Q114)

| 기준 | 통합 타임라인 | 탭 분리 |
|---|---|---|
| 단위 | 이벤트·묶음·변경이 섞여 한 줄의 의미가 행마다 다르다 | 탭마다 한 단위 |
| 보관 기간 | 이력 12개월·결재 3년·인증 무기한 → 13개월 전 구간은 이력만 비어 "변경 없이 승인"처럼 보인다 | 탭 머리에 그 탭의 보관 기간 |
| 페이징 | 세 테이블 k-way 병합 + 3중 커서, 페이지마다 SQL 3 | 탭당 SQL 1~3 |
| 필터 | 결재자·요청자·종류·결과·출처·월이 축마다 달라 교집합만 남는다 | 축에 맞는 필터 |
| 가림 | 행 제외 규칙은 같지만 hiddenCount 가 세 종류 | 탭마다 하나 |
| 엑셀 | 시트 하나에 이질 칼럼 | 탭 = 시트 |
| 사람 중심 추적 | 강점 | 행의 "같은 사람·같은 기간 보기" 링크로 탭을 바꾸며 필터를 옮긴다 |

### 7.2 화면 트리 (엔트리 추가 없음 — `settings`)

```
features/settings/settingsNavigation.js   'worklogHistory' 항목 제거, 'audit' 하나로. normalizeSetting('worklogHistory') → 'audit'(옛 링크 호환),
                                           하위 탭은 파라미터(audit?tab=worklog)
features/audit/                            신규
  AuditPage.jsx                 @atlaskit/tabs: 결재 | 인증 | 워크로그 변경 | 설정 변경. 탭 내용은 lazy(importWithReloadOnce)
                                머리: 탭별 보관 기간 안내 + 시간 추적 제공자 상태 한 줄(TimeTrackingProviderGuide 가 이미 쓰는 상태 조회 재사용)
  auditRangeModel.js            worklogHistoryAuditModel 의 기간 함수(toIsoDate·startOfLocalDay·범위 검증)를 옮겨 공용화.
                                기존 모델은 이걸 re-export(기존 테스트 무변경)
  AuditFilterBar.jsx            기간 DatePicker 2 + 사람 Select(UserFilter 를 WorklogHistoryAuditSettings 에서 추출) + 슬롯(children)
  ApprovalAuditTab.jsx          필터: 기간·행위자·요청자·프로젝트(ProjectFilter 추출)·종류(Checkbox)·결과(Checkbox).
                                CursorPagingTable 칼럼: 시각 / 결과(Lozenge) / 행위자(대리면 "A (B 대리)") / 대상(종류 배지 + 제목·이슈 키) /
                                요청자 / 단계 / 사유(말줄임). 행 클릭 → 기존 승인 상세 모달(requestId). hiddenCount 안내. 엑셀
  CertificationAuditTab.jsx     필터: 기간·인증자·대상자·월·종류(ENTRY/MONTH/본인)·결과. 표: 시각 / 인증자 / 대상자 / 월 / 방식 / 본인·PIN 배지 /
                                건수 / 현재 상태(인증·변경·삭제·대체 숫자) / 인증 시간. 행 펼침 → CertBatchItems. filteredCount 안내
  CertBatchItems.jsx            getCertificationBatchAudit 표: 이슈 / 인증 시작·시간 / 반영 시간 / 상태(cert 프론트의 CertStateBadge 재사용) /
                                동결 요약(첫 값·수정 횟수·신호). "이 워크로그 변경 이력" → 워크로그 변경 탭(대상자·월 필터로 이동)
  exportAuditExcel.js           utils/excel.js 동적 import. 결재 시트 / 인증 시트(includeItems — 묶음 10개씩 반복, 10,000건 상한)
  ActorCell.jsx                 PersonAvatar + 이름 + accountType==='app' 이면 "앱 계정" Lozenge, null 이면 "시스템"/"알 수 없음"
features/settings/WorklogHistoryAuditSettings.jsx  AuditPage 의 "워크로그 변경" 탭으로 이동(내용 유지).
                                필터에 "워크포스 연결분만" Checkbox(linkedOnly), 행에 workforceLinked 배지
features/settings/AuditSettings.jsx                "설정 변경" 탭으로 이동(내용 무변경)
features/worklogHistory/WorklogHistoryList.jsx      행위자 칸 ActorCell, workforceLinked===true 면 "워크포스" 배지
features/settings/TimesheetPolicySettings.jsx      "워크로그 이력" 묶음에 수집 범위 RadioGroup(3) + LINKED_ONLY 선택 시 경고 문구
```
iframe 함정: 표는 내용 높이(100vh 금지), 탭 lazy 청크는 `importWithReloadOnce`.

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const auditKeys = {
  all: ['audit'],
  approval: (filters) => [...auditKeys.all, 'approval', filters ?? null],
  certification: (filters) => [...auditKeys.all, 'certification', filters ?? null],
  certBatch: (batchId) => [...auditKeys.all, 'certBatch', String(batchId)],
};
```

### 7.4 재사용

`CursorPagingTable`, `PersonAvatar`, `utils/excel.js`(`HEADER_BG`·`CELL_BORDER`·`isoLocal`·동적 import), `exportWorklogHistoryExcel` 의 진행·상한 흐름, `UserFilter`·`ProjectFilter`(추출), `CertStateBadge`(cert 프론트), 승인 상세 모달 열기(업무함의 기존 경로), `invokeApproval` 의 `error.code` 분기.

---

## 8. i18n 키 (kr / en) — `npm run merge`

### 8.1 신규 `locales/{kr,en}/audit.json`

| 키 | kr | en |
|---|---|---|
| `title` / `hint` | 감사 / 결재·인증·워크로그 변경·설정 변경 기록을 기간과 사람으로 찾고 내보냅니다. 볼 수 없는 이슈의 기록은 제외됩니다. | Audit / Search and export approval, certification, worklog and settings records by period and person. Records on issues you cannot view are excluded. |
| `tab.approval` / `certification` / `worklog` / `settings` | 결재 / 인증 / 워크로그 변경 / 설정 변경 | Approvals / Certifications / Worklog changes / Settings changes |
| `retention.approval` / `certification` / `worklog` / `settings` | 결재 기록은 {years}년 보관합니다(내보낸 뒤 삭제). / 인증 기록은 무기한 보관합니다. / 워크로그 변경 이력은 {months}개월 보관합니다. / 설정 변경 이력은 1년 보관합니다. | Approval records are kept for {years} years (deleted after export). / Certification records are kept indefinitely. / Worklog history is kept for {months} months. / Settings history is kept for 1 year. |
| `provider.active` / `inactive` | 이 앱이 시간 추적 제공자입니다 — Jira 기본 작업 기록 화면은 숨겨져 있습니다. / 시간 추적 제공자가 이 앱이 아닙니다 — Jira 화면에서 직접 바뀐 워크로그는 "Jira" 출처로 남습니다. | This app is the time tracking provider — Jira's native log work UI is hidden. / This app is not the time tracking provider — worklogs changed directly in Jira are recorded with source "Jira". |
| `filter.from` / `to` / `actor` / `requester` / `project` / `kind` / `result` / `subject` / `certifier` / `month` / `mode` / `selfOnly` | 시작일 / 종료일 / 행위자 / 요청자 / 프로젝트 / 종류 / 결과 / 대상자 / 인증자 / 대상 월 / 방식 / 본인 인증만 | From / To / Actor / Requester / Project / Type / Result / Subject / Certifier / Month / Mode / Self-certified only |
| `filter.rangeInvalid` | 기간은 1년 이내로 지정하세요. | Choose a period of up to one year. |
| `search` / `loadMore` / `empty` | 검색 / 더 보기 / 조건에 맞는 기록이 없습니다. | Search / Load more / No matching records. |
| `hiddenCount` | 볼 수 없는 이슈의 기록 {count}건 제외 | {count} records on hidden issues excluded |
| `filteredCount` | 결과 조건으로 이 페이지에서 {count}건 제외 | {count} excluded on this page by result filter |
| `export` / `exporting` / `exportCapped` | 엑셀로 내보내기 / {count}건 받는 중… / 10,000건까지만 내보냈습니다. 기간을 나눠 다시 내보내세요. | Export to Excel / Fetching {count}… / Exported the first 10,000 rows. Split the period and export again. |
| `actor.app` / `system` / `unknown` / `onBehalf` | 앱 계정 / 시스템 / 알 수 없음 / {actor} ({delegate} 대리) | App account / System / Unknown / {actor} (by {delegate}) |
| `approval.column.at` / `result` / `actor` / `target` / `requester` / `step` / `reason` | 시각 / 결과 / 행위자 / 대상 / 요청자 / 단계 / 사유 | Time / Result / Actor / Target / Requester / Step / Reason |
| `approval.event.REQUESTED` / `APPROVED` / `REJECTED` / `EXPIRED` / `CANCELLED` / `CHANGED_AFTER_APPROVAL` / `CONSUMED` / `FIELD_APPLIED` / `APPLY_FAILED` / `APPLY_CONFLICT` | 요청 / 승인 / 반려 / 만료 / 회수 / 승인 후 변경 / 전환됨 / 적용됨 / 적용 실패 / 값 충돌 | Requested / Approved / Rejected / Expired / Cancelled / Changed after approval / Transitioned / Applied / Apply failed / Value conflict |
| `approval.kind.ISSUE` / `TIMESHEET` / `ISSUE_TRANSITION` / `FIELD_CHANGE` / `WORKLOG_CREATE` / `WORKLOG_CERTIFICATION` | 이슈 / 타임시트 / 상태 변경 / 필드 변경 / 워크로그 사전 승인 / 워크로그 인증(이전 방식) | Issue / Timesheet / Transition / Field change / Worklog pre-approval / Worklog certification (legacy) |
| `cert.column.at` / `certifier` / `subject` / `month` / `mode` / `count` / `state` / `seconds` | 시각 / 인증자 / 대상자 / 월 / 방식 / 건수 / 현재 상태 / 인증 시간 | Time / Certifier / Subject / Month / Mode / Items / Current state / Certified time |
| `cert.mode.ENTRY` / `MONTH` | 건별 / 월 전체 | Per entry / Whole month |
| `cert.badge.self` / `pin` | 본인 인증 / PIN 확인 | Self-certified / PIN verified |
| `cert.outcome.ALL_VALID` / `HAS_MISMATCH` / `HAS_DELETED` / `HAS_SUPERSEDED` | 모두 유효 / 인증 후 변경 있음 / 인증 후 삭제 있음 / 재인증으로 대체됨 | All valid / Changed after certification / Deleted after certification / Superseded |
| `cert.state.SUPERSEDED` | 재인증으로 대체 | Superseded |
| `cert.item.firstValue` / `editCount` / `openHistory` | 처음 값 / 수정 {count}회 / 이 워크로그 변경 이력 | First value / Edited {count} times / Worklog history |
| `cert.legacyHint` | 이전 방식(결재 요청형) 인증은 결재 탭에서 "워크로그 인증(이전 방식)"으로 찾습니다. | Legacy request-based certifications are under Approvals as "Worklog certification (legacy)". |
| `excel.approvalSheet` / `certSheet` / `hiddenNote` | 결재 감사 / 인증 감사 / 볼 수 없는 이슈의 기록 {count}건은 포함하지 않았습니다. | Approval audit / Certification audit / {count} records on hidden issues are not included. |
| `link.samePerson` | 같은 사람·같은 기간 보기 | Same person and period |

### 8.2 기존 네임스페이스 가산

| 파일 | 키 | kr | en |
|---|---|---|---|
| `worklogHistory.json` | `audit.filter.linkedOnly` | 워크포스 연결분만 | Workforce-linked only |
| `worklogHistory.json` | `badge.linked` / `badge.linkedHint` | 워크포스 / 기록 당시 워크포스와 연결된 사람 또는 프로젝트의 워크로그입니다. | Workforce / Worklog of a person or project linked to Workforce when recorded. |
| `worklogHistory.json` | `policy.scope` / `scope.PROJECT` / `scope.PROJECT_OR_LINKED` / `scope.LINKED_ONLY` | 수집 범위 / 앱을 사용하는 프로젝트 / 앱을 사용하는 프로젝트 + 워크포스 연결 워크로그 / 워크포스 연결 워크로그만 | Collection scope / Projects using the app / Projects using the app + Workforce-linked worklogs / Workforce-linked worklogs only |
| `worklogHistory.json` | `policy.scopeHint` / `policy.linkedOnlyWarning` | 워크포스 연결은 서명이 검증된 워크포스 게시물(조직·프로젝트)로만 판정합니다. / 워크포스와 연결되지 않은 사이트에서는 아무것도 기록되지 않습니다. | Workforce links are determined only from signature-verified Workforce data (organization, project). / Nothing is recorded on a site that is not linked to Workforce. |
| `policy.json` | `settings.tab.audit` | 감사 | Audit |

`policy.settings.tab.worklogHistory` 키는 옛 링크 호환 기간 동안 남긴다(값 무변경).

---

## 9. 용량·호출량

### 9.1 행·바이트 (200명, 실측 전)

가정: 결재 이벤트 연 ≈22,000건 = 타임시트 200명×12월×≈2.6건(요청·승인 1~2·승인 후 변경 일부) ≈6,200 + 상태·필드 변경 승인 하루 20건×≈3건×250일 ≈15,000. 보관 3년 ≈66,000행. 계정 id 평균 43B.
산정 방식: 인덱스 항목 바이트(키 + PK) × 2(오버헤드) — 선례(`DESIGN §8`·worklog-history §9.1)와 같다.

| 추가물 | 항목당(×2) | 연간 | 보관 상한 |
|---|---|---|---|
| `ix_event_occurred` (ts 5 + event_id 16 + PK 16) | ≈74B | ≈1.6MB | 3년 ≈4.9MB |
| `ix_event_actor_occurred` (actor 43 + 5 + 16) | ≈128B | ≈2.8MB | 3년 ≈8.4MB |
| `ix_event_delegate_occurred` (대부분 NULL 1 + 5 + 16) | ≈44B | ≈1.0MB | 3년 ≈2.9MB |
| `ix_wcb_created` (ts 5 + batch 16 + PK 16), 묶음 연 ≈3,000 | ≈74B | ≈0.2MB | 무기한 — 10년 ≈2MB |
| `ix_wcl_period_author` (7 + 43 + PK 12), 로그 연 ≈24,000 | ≈124B | ≈3.0MB | 무기한 — 10년 ≈30MB |
| `worklog_history.wf_linked` 1B, 36만 행(12개월 정상 상태) | ≈2B | ≈0.7MB(고정) | — |
| **합** | | **≈9.3MB/년** | |

- 수집 범위 기본값(`PROJECT_OR_LINKED`)으로 **늘어나는 이력 행**: "앱 꺼진 프로젝트의 연결 워크로그"만큼. 적용 프로젝트를 고르지 않은 사이트(기본 전체 수집)는 0. 고른 사이트에서 연결 워크로그가 꺼진 프로젝트에 30% 있다면 이력 +30%(≈+44MB/년, 12개월 정상 상태). 데이터 관리 게이지에 그대로 보인다. 상한은 모든 프로젝트를 켠 것과 같다(worklog-history §9.1 의 ≈148MB/년).
- 1,000명이면 선형 5배(≈47MB/년). 1 GiB 대비 여유.
- `wf_linked` 는 기존 이력 산정(행 ≈290B)에 +2B — 연 150MB 목표 여유(약 1%) 안.

### 9.2 resolver 1회당 Jira 호출·SQL

| resolver | Jira 호출 | SQL |
|---|---|---|
| `listApprovalAudit`(50행) | permissions/check ⌈이슈/100⌉ + bulkfetch ⌈/100⌉ + user/bulk ⌈사람/50⌉ ≈ **3** | 준비 프로브(마커 신뢰 시 0) + 검색 1 + 단계 0~1 = **1~2** |
| 결재 엑셀 10,000행 | 50 페이지 × ≈3 = ≈150(사용자 1회 작업) | ≈100 |
| `listCertificationAudit`(25 묶음) | user/bulk 1 | 묶음 1 + 현재본 1 + 로그 1 = **3** |
| `listCertificationAudit(includeItems, ≤10 묶음·≤2,000건)` | permissions/check·bulkfetch 각 ⌈이슈/100⌉(보통 수십 이슈라 각 1) + user/bulk 1 ≈ **3** | 3 |
| `getCertificationBatchAudit` | permissions/check 1~2 + bulkfetch 1~2 + user/bulk 1 ≈ **3~5** | 3 |
| `listWorklogHistory`(가산) | 무변화(`accountType` 은 같은 응답) | 무변화 |
| 워크로그 이벤트 1건(Recorder) | **+0** | `PROJECT` 모드 +0. 그 외 +KVS 1(`worklogHistoryScope`) + `hasAnyVerifiedInbound` 1(memo) + `verifiedLinkSignals` 1 |
| 이력 스윕 페이지 | **+0** | 페이지당 +2(위와 같음, 페이지 단위 일괄) |

N+1 없음: 가시성·이슈 메타·이름은 일괄 API, 단계·인증 행은 IN·튜플 IN 일괄, 연결 신호는 관측 묶음당 1회.

### 9.3 유휴 SQL (사용자 0명·이벤트 0건, 하루)

| 작업 | 지금 | 이 설계 후 | 이유 |
|---|---|---|---|
| 일일 `approval-sweep` 트리거 | 기존 | **동일** | 새 큐 작업·새 스케줄 없음 |
| 큐 작업 `worklog-history` | 기존(기능 OFF·미준비면 SQL 전 반환 — `idleSqlBudget.test.js` 상한) | **동일** | 범위 판정은 변경이 있을 때만 돈다. 빈 피드면 신호 조회 0 |
| 큐 작업 `workforce` | 기존 | 동일 | 계약·게시 무변경 |
| 감사 조회 3종 | — | **0** | 화면을 열 때만(조회 시점 계산) |
| 마이그레이션 | 마커 신뢰 시 0 | 배포 직후 1회 따라잡기 후 0 | 스키마 마커 |
| **합계 증가** | | **0** | `idleSqlBudget.test.js` 무변경 통과가 완료 조건 |

---

## 10. 미검증

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| A1 | Cloud 감사 로그(`auditing/record`) 전체 범주에 워크로그·이슈 편집이 정말 없는지, 시간 추적 제공자 변경이 잡히는지 | M1 불채택 근거 보강(설계 변경 없음) | dev 사이트(유료 플랜 필요)에서 워크로그 수정·삭제·제공자 변경 후 관리 화면 감사 로그 확인 |
| A2 (=H1) | 워크로그 삭제 이벤트 페이로드에 문서 밖 행위자 필드가 실제로 오는지 | 삭제 "누가" | 기존 H1 방법(트리거 로그의 키 이름) |
| A3 | 이슈 changelog 에 워크로그 항목(`WorklogId`·`timespent`·`WorklogTimeSpent`)과 author 가 남는지(생성·수정·삭제 각각, REST·자동화 경로 포함) | Q117 의 M2 | 워크로그 생성·수정·삭제 후 `GET /rest/api/3/issue/{id}/changelog` 원문 |
| A4 | 워크로그 변경이 `avi:jira:updated:issue` 를 내고 그 `changelog`·`atlassianId` 에 워크로그 항목이 실리는지 | Q117 의 M3(호출 0 보강) | `onIssueChanged` 에 페이로드 키 이름 로그(값 없이)를 임시로 두고 워크로그 삭제 |
| A5 | Jira 자동화 규칙이 워크로그를 쓸 때 `updateAuthor` 가 앱 계정인지, 규칙 행위자 설정에 따라 바뀌는지 | K6 "앱 계정" 배지의 해석 | 자동화 규칙으로 워크로그 추가 → 이력 행 actor 의 `accountType` |
| A6 | 우리 앱의 **asUser** 쓰기로 생긴 워크로그 이벤트의 `selfGenerated` 가 true 인지 | M4·L6 | 우리 화면으로 수정 → 트리거 로그에 `selfGenerated` 값 |
| A7 (=cert U6) | `CREATE INDEX IF NOT EXISTS` 마이그레이션이 Forge SQL(TiDB)에서 멱등·성공하는지 | v054~v058 | v052 와 함께 dev 배포 후 `ensureMigratedOnce` 결과·재실행 무오류. 실패면 `ALTER TABLE … ADD INDEX IF NOT EXISTS` 로 교체 |
| A8 | `e.event_id IN (SELECT … UNION SELECT …)` 하위 질의가 Forge SQL 단일 문장 규칙·TiDB 플래너에서 인덱스를 타는지 | 결재 감사 행위자 필터 성능 | 1만 행 합성 데이터로 응답 시간. 안 되면 actor/delegate 두 질의를 서비스에서 키셋 병합(각 LIMIT n) |
| A9 | `(period_key, author_account) IN ((?,?),…)` 튜플 IN 이 Forge SQL 에서 바인딩·인덱스 사용되는지 | 인증 펼침 SQL 수 | 합성 데이터 조회. 안 되면 `(period_key=? AND author_account=?) OR …` 묶음으로 |
| A10 | `workforce_inbound` 의 `rms.org` 가 워크포스가 게시물을 지운 뒤에도 VERIFIED 로 남는지(sticky) | 연결 판정이 갑자기 꺼지지 않는다는 전제 | 두 앱 dev 에서 org 게시물 삭제 후 본인 접속 → 행 status 확인(Q41 설계대로면 유지) |
| A11 | `user/bulk` 응답의 `accountType` 이 비활성·앱 계정에서도 오는지 | 배지 | 앱 계정 id 로 조회 |

구조적 한계(화면·문서에 적는다):
- **L4 갱신**: 이슈째 삭제된 워크로그는 삭제 이벤트가 오지 않는다(문서로 확정). `worklog/deleted` 피드 포함 여부(H12)에 따라 스윕이 늦게 잡거나 못 잡는다.
- **L7** 결재 감사는 보관 정리로 내보내고 지운 요청을 보여 주지 않는다(엑셀이 원본).
- **L8** 연결 판정은 "기록 당시" 값이다. 나중에 연결된 사람의 과거 변경은 범위 밖이었으면 행이 없다(백필 없음).
- **L9** 인증 감사의 "결과"는 지금 상태로 계산한다 — 과거 시점의 상태 재현은 하지 않는다(`stateChangedAt` 만).

---

## 11. 작업 분해

### 선행 조건

1. **인증 백엔드(worklog-certification-model) 커밋 뒤에 시작한다.** 겹치는 파일: `migrate.js`(v049~v052 뒤에 붙임), `SettingsRepository`·`SettingsService`(정책 키 세 곳), `WorklogHistoryRecorder.js`(관찰 경로 교체 중). 순수 도메인(`src/domain/audit/*`)과 `ApprovalAudit*`(결재 테이블만 읽음)은 먼저 해도 된다.
2. §5.3 인덱스 흡수 여부를 인증 백엔드 리더와 정한다(기본: 흡수 안 함).
3. `CertAudit*` 는 인증 도메인의 `counting.js`·`summary.js` export 이름이 확정된 뒤.

### backend 체크리스트

- [ ] `src/domain/audit/approvalAudit.js`·`certAudit.js` + 테스트 §3.4
- [ ] `worklogHistory.js` 가산(`HistoryScope`·`linkedOf`·`historyScopeDecision`·행 `wfLinked`·`historyItemOf.workforceLinked`) + 테스트
- [ ] DDL `audit.sql.js`(머리 주석 §5.1 근거), `ddl/index.js`, `migrate.js` v053~v058, 마이그레이션 테스트
- [ ] `ApprovalAuditRepository`·`ApprovalAuditService` + 테스트 §4.8
- [ ] `CertAuditRepository`·`CertAuditService`(cert `counting`·`summary` 재사용, 재구현 금지) + 테스트
- [ ] `AuditController`(3) + `PermissionMap`(3, `{admin:true}`, 주석에 범위 근거) + `CONTROLLER_REGISTRARS` → 계약 테스트
- [ ] 감사 읽기 전용 계약 테스트(§4.7)
- [ ] `WorkforceLinkRepository.verifiedLinkSignals` + 테스트
- [ ] `WorklogHistoryRecorder` 범위 판정·`wf_linked`(칼럼 준비 프로브) + 테스트 가산
- [ ] `WorklogHistoryRepository`: `insertHistory` 칼럼(준비 시), `search` 의 `linkedOnly`(`wf_linked = 1`), 행 읽기에 `wf_linked`
- [ ] `WorklogHistoryService.parseSearch` 에 `linkedOnly`, `userMapOf` 에 `accountType`
- [ ] `DirectoryService.normalizeUser` `accountType` 가산(기존 소비처 무영향 확인)
- [ ] 정책 키 `worklogHistoryScope`(세 곳 + normalizer) — `SettingsPolicyKeys.test.js` 통과
- [ ] `idleSqlBudget.test.js` 상한 무변경 통과, `npm test -- --runInBand`, `forge lint`
- [ ] 보고서에 "기본값 `PROJECT_OR_LINKED` 로 수집 범위가 넓어진다" 명시, `QUESTIONS.md` 에 Q112~Q118 등록

### frontend 체크리스트

- [ ] `auditKeys`
- [ ] `features/audit/*`(§7.2) — `AuditPage` 탭(lazy), `auditRangeModel`(기존 모델 re-export), `AuditFilterBar`, `ApprovalAuditTab`, `CertificationAuditTab`, `CertBatchItems`, `exportAuditExcel`, `ActorCell`
- [ ] `settingsNavigation` — `worklogHistory` 항목 제거·`normalizeSetting` 호환·하위 탭 파라미터
- [ ] `WorklogHistoryAuditSettings`·`AuditSettings` 를 탭으로 이동(내용 유지), `linkedOnly` 필터·배지
- [ ] `WorklogHistoryList` 의 `ActorCell`·연결 배지
- [ ] `TimesheetPolicySettings` 수집 범위 RadioGroup + 경고
- [ ] i18n §8(kr/en 동시) → `npm run merge`(차이 0)
- [ ] UI 테스트: 탭 전환·옛 링크 호환·필터 → payload(366일 경계)·hiddenCount/filteredCount 안내·엑셀 상한·대리 표시·앱 계정 배지. `npm run test:ui -- --runInBand`, `npm run build:ui`(settings 청크 — 탭 lazy 확인)

### 순서·의존

도메인 → (인증 백엔드 커밋) → DDL → 결재 감사 → 인증 감사 → 이력 범위·칼럼 → 정책 키 → 등록 → 프론트. 프론트는 §2 계약만으로 병행 가능(가짜 응답).

---

## 출처 (플랫폼 조사, 2026-10-10)

- Forge 이벤트 레퍼런스(Jira) — 워크로그 이벤트 페이로드(`eventType`·`selfGenerated`·`worklog`), 삭제 시 연쇄 이벤트 미발행, 이슈 이벤트 `atlassianId`·`changelog`: https://developer.atlassian.com/platform/forge/events-reference/jira/
- `jira:timeTrackingProvider` 매니페스트 레퍼런스(Preview, 기본 Log work·작업 로그 탭 대체): https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-time-tracking-provider/
- Jira Cloud REST v3 감사 기록(`GET /rest/api/3/auditing/record`, Administer Jira, `manage:jira-configuration`): https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-audit-records/
- Jira Cloud 감사 활동(관리 도움말 — 감사 범주): https://confluence.atlassian.com/adminjiracloud/auditing-in-jira-applications-818578846.html
- Jira 감사 로그 이벤트 카탈로그(서버판 — issue operations 범주): https://confluence.atlassian.com/adminjiraserver/audit-log-events-in-jira-998879036.html
- 감사 로그 API 1,000건 상한 사용자 보고(커뮤니티): https://community.atlassian.com/forums/Jira-questions/Filtering-the-Audit-Log-via-API/qaq-p/2359059

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-10 | 초안 | requirement.md(감사 이력 요구 1~4) |
