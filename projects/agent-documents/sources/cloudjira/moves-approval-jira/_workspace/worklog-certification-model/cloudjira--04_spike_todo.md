# 04 스파이크 할 일 — worklog-certification-model (배포 후 dev 사이트에서)

전제: `forge deploy` + `forge install --upgrade`(SQL 테이블 추가) 후, 첫 resolver 호출로 v049~v052 적용. 결과는 `forge logs` 보다 DB 상태·화면으로 본다.

| # | 확인 | 방법 | 실패 시 |
|---|---|---|---|
| U6 | v052 `ALTER TABLE worklog_mirror ADD INDEX IF NOT EXISTS` 가 TiDB 에서 성공·멱등 | 배포 직후 아무 resolver 호출 → KVS `schema:version` 이 `v052_index_worklog_mirror_author_started` 인지. 두 번째 실행 무오류 | v052 를 목록에서 빼고(첫 배포 전이라 가능) 매트릭스는 `coverage.mirror:false` 로 동작 |
| U3 | asUser `POST /worklog/list` 가 조회자에게 안 보이는 워크로그를 빼는가 | 팀장 계정으로 열람 불가 이슈의 워크로그 id 를 `certifyWorklogs.items` 에 넣기 → 결과가 `WORKLOG_NOT_FOUND` 여야 | `certifyFor` 에 `filterVisibleIssues(issueIds)` 1회 추가 |
| U7 | JQL `worklogAuthor = "<id>"` 를 팀장이 돌려 팀원 워크로그 이슈가 나오는가(T5 TZ 포함) | 펼침 `items.length` = 미러 그 월 건수(`hiddenCount` 0) | 이슈별 조회를 미러 id 기반 `worklog/list` asUser 로 바꾸는 안 검토 |
| U9 | asUser `issue/bulkfetch fields=project` 응답의 project id | 이력 수집 범위 밖 이슈로 인증 → `worklog_cert.project_id` 채워졌는지 | NULL 허용 — 판정 영향 없음 |
| U1 | 앱이 타 사용자 프로퍼티 `movesApproval.cert.YYYY-MM` PUT | 워크포스 연동(검증 수신 1건 이상) 상태에서 인증 1건 → 다음 일일 동기화 후 `getWorkforceLinkStatus.certPublish.published ≥ 1`, 관리자 REST GET 으로 문서 확인 | 403 이면 `WRITE_DENIED` — 프로젝트 프로퍼티 등 재설계 |
| U2 | 23.5KB 문서 PUT·GET | 합성 1,000건 문서 PUT(시험 계정) | `CERT_LIST_MAX` 하향 |
| U5 | 삭제 이벤트로 `worklog_cert.state` 가 DELETED | 인증한 워크로그를 Jira 기본 UI 로 삭제 → 다음 날 이력 보정 후 또는 이벤트 직후 DB | 삭제 피드(일일)만으로도 메워지는지 |
| U4 | 화면 밖 수정 → MISMATCH 반영 지연 | REST 로 시간 수정 → 펼침을 열면 즉시 MISMATCH(화면 관찰), 열지 않으면 이벤트/일일 보정 | — |
| U8·U10 | 두 앱 dev: 워크포스 org 게시 후 `certPublish.state` OK, 팀장 계정의 `movesRms.org` `leaderKeys` 의미 | 관리자 REST 로 org 문서 GET, `getTimesheetContext.certification.selfCertEligible` 이 기대대로인지 | 상위자 판정 규칙 재정의 |
