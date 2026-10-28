# 검토 요청: Forge SQL 유휴 컴퓨트 분석과 수정안 (읽기 전용 검토)

역할: 독립 검토자. **코드를 수정하지 말 것.** 리포 `C:\CloudJira\moves-approval-jira` 를 직접 읽고, 아래 분석의 **숫자·원인·수정안이 맞는지 틀렸는지** 근거(파일:줄)와 함께 판정하라. 결과는 한국어, 코드 식별자는 영어. 마지막에 "판정" 절을 두고 각 항목을 맞음/틀림/부분 으로 표기.

## 배경
운영자가 Forge SQL(TiDB) 컴퓨트 사용량이 매우 높다고 보고했다. 앱은 Jira Forge 승인 앱이고, 사용자 트래픽이 거의 없는 상태다. Forge SQL 은 쿼리(요청 단위)마다 과금된다.

## 분석 (검토 대상)

### A. 유휴 상태에서 5분마다 나가는 SQL
`manifest.yml` scheduledTrigger `five-minute-sweep` → `src/trigger/runFiveMinuteSweep.js` 가 세 작업을 병렬 실행:
1. `src/trigger/runTransitionApplySweep.js` — `repository.ready()` + `isTableReady('approval_job_state')` + `JobLease.acquire`(`src/resolver/worklogHistory/JobLease.js`: INSERT IGNORE + UPDATE + SELECT) + `applyCandidates` SELECT + `lease.release` UPDATE ≈ 6 쿼리
2. `src/trigger/runWorkforcePublish.js` → `WorkforcePublisher.tick`(`src/resolver/workforce/WorkforcePublisher.js:325~`) — `repository.ready()` + `acquireLease` + `expandMarkers` + `changeScan` + `drain` + `releaseLease` ≈ 8~10 쿼리
3. `ExpiryService.sweep({continuation:true})`(`src/resolver/approval/ExpiryService.js:390~`) — `primeReadiness`(information_schema.tables 전체 목록) + `tableReady` + 잔여 작업 SELECT ≈ 3 쿼리, 잔여 없으면 반환

추정 합계: 5분당 17~19 쿼리 → 하루 약 5,000 → 월 약 15만(사용자 0명). 설치 사이트·환경마다 곱해진다.

### B. 시간당 스윕 2개
`runTimesheetSweep`·`runWorklogHistorySweep` — 각각 리스 + 커서 + Jira `worklog/updated`·`deleted` 호출 + SQL.

### C. 비싼 요소
- `src/rdb/schema/TableReadiness.js` 의 `primeTableReadiness`/`isTableReady` 가 `information_schema.tables` 를 조회. 캐시는 프로세스 메모리(`readyTables` Set)라 **스케줄 트리거(콜드 스타트)에서는 매번 비어 있음**.
- 리스 획득이 매번 3 쿼리(INSERT IGNORE + UPDATE + SELECT).
- 5분 슬롯 하나에 세 작업을 묶어 유휴 때도 셋이 전부 깨어남.

### D. 수정안
1. "할 일 있음" 플래그를 **KVS** 에 두고 5분 스윕은 먼저 KVS 만 읽어 꺼져 있으면 SQL 0회로 종료. 핫패스(결정·아웃박스 touch·자동 적용 예약)가 플래그를 켠다. 안전망으로 시간당/일일 스윕은 플래그와 무관하게 전체 점검.
2. information_schema 프로브 제거 — 마이그레이션 완료 시 KVS 에 스키마 버전 기록, 트리거 경로는 그것만 읽는다(resolver 경로의 `ensureMigratedOnce` 는 유지).
3. 리스를 조건부 UPDATE 1회로(행은 onInstall/마이그레이션에서 선생성, cursor/watermark 는 UPDATE 의 결과로 읽거나 필요할 때만 SELECT).
4. 시간당 스윕은 기능 꺼짐(`historyEnabled=false`)·워크포스 미연결이면 즉시 반환.

## 검토 질문 (전부 답할 것)
1. A 의 쿼리 수를 코드로 직접 세어 맞는지. 내가 빠뜨린 쿼리(예: `repository.ready()` 내부, `policyLoader` 가 SQL 인지 KVS 인지, `changeScan` 의 반복 SELECT, `cloudIds.learn`, 로그 INSERT)가 있는지.
2. 콜드 스타트 가정이 맞는지 — Forge 스케줄 트리거 컨테이너 재사용 여부에 대해 아는 바와, 코드가 그 가정에 어떻게 의존하는지.
3. information_schema 조회가 일반 SELECT 보다 TiDB(Forge SQL)에서 비용이 큰가. 근거가 없으면 "모름"이라 말할 것.
4. 수정안 1 의 함정: Forge KVS 의 일관성(쓰기 직후 읽기), 플래그 유실 시 작업이 멈추는 경로, 여러 사이트/환경 간 KVS 범위, 핫패스에서 플래그를 켜야 하는 지점의 누락 가능성. 플래그 대신 다른 저렴한 신호(예: scheduledTrigger 간격 변경·`approval_job_state` 단일 SELECT)가 더 나은지.
5. 수정안 2·3 이 기존 불변식(CLAUDE.md 4번 CAS `rev=rev+1`, 리스 겹침 방지)을 깨는지.
6. 5분 간격 자체를 시간당으로 바꾸고 전환 자동 적용을 결정 직후 동기 실행(이미 있는지 `TransitionExecutor` 확인)으로 대체하는 것이 더 단순한지.
7. 내가 보지 못한 다른 유휴 비용원(트리거 `onWorklogChanged`·`onIssueChanged` 가 무관한 이벤트에서도 SQL 을 치는지, `WorklogHistoryRecorder`, 라이선스 KVS 캐시 등).
8. 우선순위: 가장 적은 변경으로 가장 많이 줄이는 순서를 제안.

## 출력 형식
- `## 쿼리 수 실측(코드 기준)` — 작업별 표(파일:줄 근거)
- `## 빠진 비용원`
- `## 수정안 판정` — 1~4 각각 맞음/틀림/부분 + 함정
- `## 권고 순서`
- `## 판정 요약`

## 추가 질문 9 (운영자 제안 — 가장 중요)
운영자 제안: **"스케줄 스윕을 사실상 없애고, 앱이 실제로 실행될 때(사용자가 화면을 열어 resolver 가 호출될 때) 밀린 작업을 처리하고, 안전망으로 하루 1회만 스케줄한다."**
- 이 방식으로 각 작업(전환 자동 적용·워크포스 게시·만료 처리·타임시트 보정·이력 보정)을 옮길 수 있는지 작업별로 판정하라. 특히 **사용자 컨텍스트가 없어야 하는 작업**(asApp 전용: 워크포스 게시 PUT, Jira worklog/updated 보정)을 resolver 호출 안에서 돌려도 되는지, 25초 한도·응답 지연·권한(asUser vs asApp) 관점에서.
- "앱 실행 시 처리"의 구체 형태: resolver 호출 끝에 fire-and-forget 으로 밀린 일을 처리하는 것이 Forge 에서 가능한지(응답 후 실행 보장 여부), 아니면 응답 전에 짧게(≤2초) 처리하고 나머지는 하루 1회 스윕에 넘기는지.
- 하루 1회로 늦어져도 되는 것과 안 되는 것(예: 전환 자동 적용 지연, 마감 만료 알림, 워크포스 원가 반영 지연)을 구분하고, 사용자에게 보이는 영향을 적어라.
- 결론: (a) KVS 플래그 + 5분 유지, (b) 앱 실행 시 처리 + 하루 1회, (c) 시간당 통합 1개 — 셋 중 무엇을 권하는지와 이유.
