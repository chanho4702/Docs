# worklog-certification-model — 워크로그 "인증" 모델 전환

작성일: 2026-10-08. 상태: 사용자 결정 확정(아래 §2), 설계 착수.
근거: 2026-10-08 사용자 대화. 메모리 `worklog-certification-model`.

## 1. 사용자 의도 (왜)

- 워크로그 수정은 플랫폼상 **막을 수 없다**(권한에 기간 조건 없음, REST·자동화·모바일 경로, 시간 추적 제공자는 화면만 대체).
- 그래서 "승인"이 아니라 **"인증(certification)"** 으로 간다. 쌓인 워크로그가 **인증된 시간인지**를 판별하는 것이 목적.
- **인증된 시간의 원본은 승인 앱 Forge SQL 의 인증 레코드**다. Jira 워크로그는 "본인 주장". Jira 쪽이 바뀌면 지문 불일치로 그 건은 자동 미인증이 되고 인증 레코드는 그대로 남는다 → "수정은 되지만 인증된 시간은 수정 불가".
- **워크포스 연동은 선택이다.** 인증 모델은 승인 앱 단독으로 완결되어야 하고, 워크포스가 같이 설치되어 있으면 **인증된 시간만** 원가·정산에 쓰도록 넘긴다(계약 변경). 워크포스가 없으면 아무것도 게시하지 않고 인증 자체는 그대로 동작한다.
- 결재선을 타는 타임시트 승인(`timesheet-approval`)은 **선택 기능으로 내려간다**(돈이 걸린 프로젝트만). 제거하지 않는다.
- 결재자(팀장)가 인증 전에 **변경 이력을 보고 판단**할 수 있어야 한다. 지금은 사건 목록만 있고 워크로그 단위 요약·신호가 없다(이전 대화 분석: 결재자 화면 약함).

## 2. 확정 결정 (사용자, 2026-10-08)

| # | 항목 | 결정 |
|---|---|---|
| D1 | 인증 후 Jira 에서 **삭제**된 워크로그의 인증 시간 | **정책 옵션** — 유지(+불일치 표시) / 0 으로 본다. 기본값은 설계가 권고(권고: 유지) |
| D2 | 인증 단위 | **정책 옵션** — 건별 / 사용자×월. **저장은 항상 건별 레코드.** 월 모드는 "이 달 전체 인증" 일괄 흐름 + 월 합계 게시, 건별 모드는 건마다 인증 + 건별 목록 게시. 옵션을 바꿔도 데이터 이전 없음 |
| D3 | 재인증 주체 | **팀장**(타임시트 결재자 축 `{teamLead:true}`, 범위는 `TeamScope`). 최초 인증 주체는 설계가 정한다(본인 서명 허용 여부 포함) |
| D4 | 인증 레코드 위치 | 승인 앱 SQL. 워크로그 프로퍼티(건별 Jira 프로퍼티) 쓰기는 **기각** — 일괄 인증 시 수천 PUT |
| D5 | 워크포스 교환 | 사용자×**월** 프로퍼티(32KB 한도 → 연 단위 문서에 건별 목록을 넣으면 위험). 합계 초 + 인증 워크로그 id·초 목록(짧게) + 서명. 워크포스 DB 무증가 원칙 유지 |
| D6 | 워크포스 선택성 | 미설치·미연결이면 게시 없음, 인증은 단독 동작. 워크포스 소비 코드 변경은 **별도 작업 항목**(워크포스 리포, 별도 승인) |

## 3. 현재 코드 (출발점 — 설계가 재사용·확장할 것)

- 사후 인증: `src/domain/worklogCertification/fingerprint.js`, `src/resolver/worklogCertification/{Service,Repository,Controller}` — 테이블 `worklog_certification_entry`(worklog_id, fingerprint, snapshot_json, certification_state UNVERIFIED/VERIFIED, verified_fingerprint, verified_at, deleted_at, rev), `worklog_certification_request`. resolver `getWorklogCertification`·`createWorklogCertification`(TargetKind `WORKLOG_CERTIFICATION`, 결재선 요청형). 변경 관찰 시 지문 불일치로 무효화.
- 변경 이력: `worklog_history`(+미러), `getTimesheetWorklogHistory`·`getWorklogHistory`·`listWorklogHistory`, 프론트 `features/worklogHistory/`(TimesheetHistorySection 은 타임시트 상세에만 붙음).
- 타임시트: 제출 스냅샷 지문·드리프트(`TimesheetDriftService`)·팀 매트릭스(`TeamMatrixTable`)·일괄 결정·제한선 위반(`domain/timesheet/limits.js`).
- 정책 계층: `src/domain/worklogPolicy/catalog.js`(사이트→프로젝트→이슈, 키 `approvalMode`·`historyEnabled` 등), 워크포스 `rms.policy` 잠금 병합.
- 워크포스 계약: `src/integration/workforce/contract.js`(CONTRACT_VERSION 1, `APPROVAL_DOC_KIND='movesApproval.timesheet'`, 연 단위 문서 `movesApproval.{yyyy}`, PUBLISH_MODE USER), 게시 `src/resolver/workforce/WorkforcePublisher.js`(아웃박스 + 시간당 스윕, 서명 Ed25519). 현재 본문은 기간별 승인 상태 + 묶음 해시 — 워크포스가 Jira 라이브로 재계산해 일치 여부만 본다.
- 라이선스: 모든 resolver·엔트리가 가드를 지난다(2026-10-07). 새 resolver 도 `guardedDefine` 3단계 등록.

## 4. 요구 범위

### 4.1 도메인·저장
- 인증 레코드 = 워크로그 건별 1행(기존 `worklog_certification_entry` 확장 또는 대체 — 설계가 정한다). 인증된 값(일자·초·이슈·작성자)은 **레코드 안에 고정**되어 Jira 변경과 무관하다.
- 상태: 최소 `UNCERTIFIED` / `CERTIFIED` / `MISMATCH`(인증 후 Jira 변경) / `DELETED_AFTER_CERT`(인증 후 삭제, D1 정책 적용). 결정적 전이표를 순수 함수로.
- 인증 시점에 팀장이 본 **판단 요약을 동결**한다(워크로그별 최초값→최종값, 수정 횟수, 마지막 이력 seq, 신호). 이력 테이블은 12개월 보관이고 인증 레코드는 더 오래 남으므로, 근거가 이력 삭제와 함께 사라지면 안 된다. 요약은 작아야 한다(건당 수백 B).
- 정책 옵션 추가: `certificationUnit`(ENTRY/MONTH), `deletedCertifiedHandling`(KEEP/ZERO). 기본값·KVS 키 맵·계약 테스트 동반.
- 용량: 200명 기준 연 24만 건, 건당 150B 안팎 목표. 보관 정책(기존 결재 기록 보관·엑셀 내보내기 흐름 재사용).

### 4.2 인증 흐름
- 팀장 화면: 월 × 팀원 매트릭스 → 사람을 펼치면 워크로그 목록. 각 행에 현재값, 인증값, 상태, 수정 횟수, 신호 배지. 필터 "미인증만"·"불일치만". 월 모드는 "이 달 전체 인증" 한 번, 건별 모드는 체크 선택 인증. 일괄 인증은 시간 예산(≤15초)과 부분 성공 보고.
- 재인증: 불일치·미인증 건을 팀장이 다시 인증(D3). 결재선 없음, 서명/PIN 정책은 기존 서명 체계를 따른다(설계가 결정).
- 본인 화면: 내 워크로그의 인증 상태 표시(작업 로그 탭·내 타임시트). 본인이 최초 인증(자기 서명)을 할 수 있는지는 설계가 정하고 요구사항에 근거를 적는다.
- 신호(판단 보조, 저장 없이 조회 시 계산 → 인증 시 요약에 동결): 지연 입력(작업일 대비 기록 지연 N일), 마감 직전 수정, 시간 증가율, 작성자 외 행위자 수정, 앱 밖 경로(source) 변경. 기준값은 정책(기본값 설계).
- 기존 타임시트 결재 승인은 그대로 두되, 인증 화면과 결재 화면이 같은 "워크로그 단위 요약" 컴포넌트를 공유한다.

### 4.3 워크포스 교환 (승인 앱 쪽)
- 계약 v2: 사용자×월 문서(키 설계), 본문에 `certifiedSeconds`(월 합계), 건별 모드면 `[{worklogId, seconds}]`(또는 짧은 지문 목록), `unit`, `policyRev`, 서명. 32KB 안에서 상한(건수 초과 시 처리 규칙) 명시.
- 발행 트리거: 인증·재인증·불일치 전이 시 아웃박스 touch, 게시는 기존 시간당 스윕. 워크포스 미설치/미연결이면 게시 자체를 건너뛴다(현재 WorkforceLink 상태 판정 재사용).
- v1 문서와의 공존·전환(기존 타임시트 승인 게시는 유지하는가, 통합하는가) 설계.
- **워크포스 리포 작업 항목**(원가·정산이 라이브 재계산 → 수신한 인증 초 사용, 현황 화면 "주장/인증" 배지)은 설계서에 별도 절로 분리해 적는다. 이 하네스에서는 구현하지 않는다.

### 4.4 범위 밖
- 워크로그 수정 자체의 차단(불가능). 워크포스 리포 코드 수정. 워크로그 프로퍼티 건별 쓰기. 설치 전 이력 소급.

## 5. 완료 기준

- 불변식 1~10 유지. 인증 레코드는 CAS(`rev=rev+1`), 결정적 id.
- resolver 3단계 등록 + 계약 테스트. 정책 기본값 ↔ KVS 키 맵 계약 테스트.
- 팀장 범위는 `TeamScope` 로 다시 좁힌다(불변식 7). 본인 건은 SELF.
- 백엔드·UI 테스트·빌드·forge lint 통과. 기존 타임시트 승인·사후 인증 테스트 회귀 없음.
- 설계서에 용량 산정, 32KB 상한 계산, 미검증 목록(W11 사용자 프로퍼티 쓰기 포함).

## 6. 동시 작업 주의

2026-10-08 13:2x~13:3x 에 다른 세션이 `_workspace/review-hardening-2026-10-08` 로 `TimesheetDriftService`·`WorklogCertificationRepository`·`WorklogHistoryRepository`·retention·signature 를 수정 중이다(미커밋). **백엔드 단계는 그 작업이 끝나거나 사용자가 허락한 뒤에만** 시작한다. 설계 단계는 `_workspace/` 문서만 쓴다.

## 7. 추가 결정 (사용자, 2026-10-08 14:10)

| # | 항목 | 결정 |
|---|---|---|
| D7 | 인증 주체 기본 원칙 | **플로우를 탄다.** 팀에 속한 사람의 워크로그는 그 팀장이 인증한다(본인 인증 불가). |
| D8 | 팀장 본인의 워크로그 | **기본은 상위자 인증**(팀장이 다른 팀의 MEMBER 면 그 팀의 팀장). 상위자가 없으면 **본인 인증을 허용**한다. 즉 Q104 는 "인증 불가"가 아니라 "상위자 없으면 본인 서명". 본인 서명임을 레코드·게시 문서·화면에 구분해 남긴다(`selfCertified` 류). |
| D9 | Q109(최초 인증 주체) | 팀원은 팀장만. 본인 인증은 D8 의 경우에만. 재인증도 같은 규칙(D3 유지). |

설계 반영: Q104·Q109 를 D8·D9 로 갱신. `TeamScope` 에는 계층 개념이 없으므로 "상위자 = 그 팀장이 MEMBER 로 속한 다른 팀의 LEAD" 로 정의하고, 두 팀 이상이면 어느 쪽이든 가능(기존 타임시트 결재와 같은 규칙인지 확인). 본인 인증은 `{teamLead:true}` 축이 아니라 SELF 축의 별도 resolver 또는 같은 resolver 의 분기 — 설계가 정하되 권한 범위가 넓어지지 않게.
