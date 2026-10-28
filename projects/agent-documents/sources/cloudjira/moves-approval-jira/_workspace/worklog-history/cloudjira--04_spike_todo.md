# worklog-history 플랫폼 실측 목록 (미검증) — 초안

> 작성: feature-architect · 2026-10-04 (설계 단계). backend/frontend 가 구현하며 항목을 보태고, 배포 회차에 리더가 확인한다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값·DB 상태로 본다. `forge logs` 는 늦다.
> 배포 회차 전제: `forge deploy` + `forge install --upgrade`(scheduledTrigger 추가). scope 추가 없음.
> 이 기능이 기대는 기존 항목: T1(워크로그 이벤트 페이로드), T3(`worklog/updated`·`deleted` 형태), T12(실행 한도), P12(`updated` 형식), P22(POST/PUT 응답 본문), P8(PUT 의 visibility 보존), U3(bulkfetch 누락 처리).

| # | 항목 | 설계 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| H1 | 삭제 이벤트(`avi:jira:deleted:worklog`) 페이로드에 행위자(`atlassianId`·`user.accountId`·`worklog.updateAuthor`)와 `worklog.issueId` 가 오는가 | `parseWorklogEvent` §3.1 | JIRA 삭제 행의 "누가" | Jira 화면에서 워크로그 삭제 → `[TIMESHEET][trigger] payload keys` 로그(키 이름만 남는다) + `worklog_history.actor_account` | 없으면 actor null("알 수 없음") 그대로. 키 이름이 다르면 후보 목록에 추가 |
| H2 | asApp `POST /rest/api/3/worklog/list` 응답에 `comment`(ADF)·`updateAuthor.accountId`·`visibility`·`created`·`updated` 가 오는가 | `WorklogCollector.currentOf` §4.6 | 설명 지문·행위자·제한 판정 | REST 로 설명·공개 범위 있는 워크로그 수정 → 이력 행의 `after_comment_fp`·`actor_account`·`restricted` | `comment` 가 없으면 설명 칸은 기록 불가(지문 null — diff 에서 제외하도록 도메인 분기 추가). `updateAuthor` 가 없으면 actor null |
| H3 | asApp `POST /rest/api/3/issue/bulkfetch`(`fields:['project']`)가 이슈 보안 수준이 걸린 이슈의 프로젝트도 주는가, `read:jira-work` scope 로 되는가 | 수집 범위 §4.4 | 처음 보는 워크로그의 수집 여부 | 보안 수준 걸린 이슈에 REST 로 워크로그 생성 → `worklog_mirror.project_id` 채워짐 | 못 받으면 `outOfScope`(수집 안 함). 대안: `GET /rest/api/3/issue/{id}?fields=project` asApp 단건 |
| H4 | **같은 워크로그 상태를 asUser POST/PUT 응답과 asApp list 로 읽었을 때 정규화 값이 같은가** — `started` ms(타임존 표기 차이), `timeSpentSeconds`(분 반올림 P23), 설명 ADF→평문, `visibility` | APP 기록 → 트리거 차이 0 §4.3 | 다르면 **우리 화면 쓰기마다 가짜 UPDATED(JIRA) 행**이 하나씩 붙는다 | 우리 대화상자로 생성·수정 1건씩 → `worklog_history` 에 APP 행만 있고 JIRA 행이 없는지(트리거 처리 1분 뒤) | 원인 필드를 정규화에 추가(예: 초를 60 배수로 내림, 설명 끝 공백·하드브레이크 정규화). 응답이 빈약하면(P22) APP 경로에서 `getWorklog` 1회 재조회한 값을 after 로 |
| H5 | 트리거 도착 지연 — APP 기록(같은 invocation 안, 수십 ms)보다 트리거 처리가 늦는가 | 한계 L6 | 출처 표시 | 우리 화면 쓰기 20건 → 출처가 APP 인 비율 | 대부분 JIRA 면 APP 기록을 Jira 쓰기 **전에** 의도 행으로 남기는 방식 검토(설계 변경) |
| H6 | 실제 행 크기 — TiDB `information_schema.tables` 의 `data_length + index_length` / `table_rows` | 용량 §9.1 | 연 150MB 목표 | 개발 사이트에서 스크립트로 1천 건 생성·수정 → 데이터 관리 화면 사용량(`getStorageUsage`)의 두 테이블 바이트 ÷ 행 수 | 행당 400B 넘으면: 보관 기본 6개월 제안, `ix_wlh_author_changed` 축소, 클러스터드 PK 명시(`/*T![clustered_index] CLUSTERED */`) 검토 |
| H7 | `INSERT IGNORE` 가 복합 PK `(worklog_id, seq)` 중복에서 오류 없이 `rowsAffected 0` 을 주는가(Forge SQL) | 중복 방지 §4.3 | 경합·재시도 멱등 | 같은 이벤트를 두 번 처리하게 만든다(트리거 + 스윕 동시) → 행 1, 오류 로그 없음 | 오류면 PK 중복 오류 코드만 흡수하는 래퍼(TableReadiness 처럼 시그니처만) |
| H8 | `DELETE FROM worklog_mirror WHERE … AND worklog_id NOT IN (SELECT worklog_id FROM worklog_history WHERE …) LIMIT n` 가 Forge SQL(TiDB)에서 되는가 | `purgeMirrorBatch` §4.2 | 미러 정리 | 보관 기간 3개월로 바꾸고 오래된 테스트 데이터로 삭제 실행 | 안 되면 두 단계: 후보 id SELECT(LIMIT n) → 그중 이력 없는 id 만 `DELETE … WHERE worklog_id IN (…)` |
| H9 | `GET /rest/api/3/worklog/updated?since=` 가 **생성**된 워크로그도 포함하는가 | 스윕 결정 표 9 §3.2 | 트리거를 놓친 생성의 보정 | 트리거를 일시적으로 실패하게 할 수 없으므로: 생성 직후 피드 1페이지를 개발 도구(스파이크 resolver)로 조회 | 포함 안 되면 놓친 생성은 다음 수정 때 BASELINE 으로만 잡힌다(문서화) |
| H10 | scheduledTrigger 를 하나 더(시간당 2개째) 추가해도 되는가, 실행 한도(T12)·manifest major 버전 여부 | manifest §6.1 | 배포 | `forge lint` + `forge deploy` 출력의 버전 변경 종류 | major 면 `--approve MAJOR_VERSION_RULE`. 트리거 수 제한이면 `timesheet-sweep` 와 번갈아 도는 방식(짝수 시·홀수 시) |
| H11 | 값 변화 없는 PUT(같은 started·초·설명)이 `updated` 를 올리고 이벤트를 내는가 | 결정 표 12 | 행 0 이어야 정상 | 우리 대화상자에서 아무것도 안 바꾸고 저장 → 이력 행 수 무변화 | 행이 생기면 정규화 결함(H4 와 같은 원인) |
| H12 | 이슈를 삭제하면 그 워크로그의 삭제 이벤트·`worklog/deleted` 피드 항목이 생기는가 | 한계 L4 | 이슈째 삭제의 기록 | 워크로그 2건 있는 테스트 이슈 삭제 → DELETED 행 수 | 안 생기면 L4 로 문서화(이슈 삭제 이벤트로 보완하는 것은 범위 밖) |
| H13 | `user/bulk` 가 비활성·삭제 계정을 어떻게 돌려주는가 | `loadUsers` | 표시 이름만 | 비활성 계정의 이력 조회 | 이름 없음 → accountId 앞부분 + 이니셜 아바타 |
| H14 | 제한 공개 워크로그가 그룹 밖 사용자의 asUser 이슈 워크로그 목록에서 빠지는가 | Q71 근거, 탭 카운트 | 탭에서 가림이 필요한가 | 그룹 제한 워크로그 → 그룹 밖 계정으로 탭 열기 | 빠지지 않으면 탭도 `maskForViewer` 를 그대로 쓰므로 영향 없음(설계는 이미 모든 경로 같은 규칙) |
| H15 | (backend 추가) Jira 가 설명 없는 워크로그의 `comment` 칸을 **생략**하는가 — 구현은 "없음 = 빈 설명"으로 본다 | `worklogStateOf`·`WorklogCollector.detailOf` | asApp list 가 설명을 아예 안 주는 경우(H2)와 구분 못 함 → 모든 워크로그가 빈 설명으로 기록되고, 설명 있는 워크로그의 APP 기록 직후 트리거가 가짜 COMMENT 변경을 만든다 | 설명 있는 워크로그를 우리 대화상자로 수정 → `worklog_history` 에 APP 행 하나만, `after_comment_fp` 가 비어 있지 않은지 | H2 실패와 같은 대안: 칸 부재를 "모름"(fp null)으로 돌리고 diffMask 가 설명 비교를 건너뛰게(도메인은 이미 null 지문을 비교에서 뺀다) |
| H16 | (backend 추가) TIMESTAMP 초 정밀도 — 미러 `last_changed_at` 은 관측 시각(ms→초 절삭)이고 `staleBefore`(다시 켠 시각)는 ms | `planObservation` 규칙 13 | 다시 켠 같은 초 안의 관측이 보정 감지로 한 번 더 표시될 수 있다(기록 누락은 없음) | 전역 스위치 끄고 켠 직후 1초 안에 워크로그 수정 → 출처 | 영향이 표시뿐이라 허용. 필요하면 staleBefore 를 초 단위로 내림 |
| H17 | (backend 추가) `purgeMirrorBatch` 의 `NOT IN (SELECT worklog_id FROM worklog_history)` 가 36만 행에서 20초 예산 안에 도는가(H8 과 함께) | `WorklogHistoryRepository.purgeMirrorBatch` | 보관 정리 시간 초과 | 개발 사이트에 1만 행 넣고 보관 3개월로 삭제 → 응답 시간 | 두 단계(후보 SELECT LIMIT n → 이력 존재 id 제외 → `DELETE … IN`)로 바꾼다 |
| H18 | (backend 추가) asApp `issue/bulkfetch` 가 403/400 이면 그 묶음은 수집하지 않는다(`allowStatuses`) — 응답 shape `issues[].fields.project.id` | `WorklogCollector.fetchIssueProjectsAsApp` | 처음 보는 워크로그 수집 여부(H3 과 같은 축) | H3 과 같다 | H3 대안과 같다 |
| H19 | (backend 추가) 프로젝트 `approval_project_config.updated_at` 은 정책 덮어쓰기 저장(`saveProjectPolicy`)에도 바뀐다 | `staleBefore` 계산 | 프로젝트 정책만 저장해도 그 프로젝트의 다음 변경 1건씩이 "보정 감지"로 표시된다(기록은 정상) | 프로젝트 정책 저장 뒤 워크로그 수정 → 출처 | 표시 문제가 크면 사용 여부 전용 시각 칼럼(ALTER) 또는 KVS 기록 |
| H20 | (frontend 추가) `jira:issueActivity` 탭 iframe 이 이력 펼침(표 아래 패널)만큼 높이를 따라 늘어나는가 | `WorklogTab` + `WorklogHistoryPanel` | 펼친 이력이 잘려 보이거나 이중 스크롤 | 수정 5회 이상인 워크로그의 "수정 N회"를 눌러 패널 끝까지 보이는지 | 패널을 최대 높이 + 내부 스크롤(100vh 아님, 고정 px)로 바꾸거나 Modal(`main/worklog` 엔트리의 이력 모드)로 연다 |
| H21 | (frontend 추가) 설정 탭이 11개(워크로그 이력 추가)가 되어 업무함 사이드바 안 `SettingsPanel` Tabs 가 넘치는가 | `SettingsPage.jsx` | 탭 줄바꿈·가로 스크롤 | 업무함 > 설정, 좁은 폭(1280px)에서 탭 줄 확인 | 감사 성격 탭(변경 이력·워크로그 이력)을 한 탭의 하위 전환으로 묶는다 |
| H22 | (verify 추가) getIssueWorklogs 에 이력 카운트가 붙어 탭 첫 응답이 느려지는가(KVS 2 + isTableReady 2 + leadScope + 관리자 판정 + GROUP BY 1) | WorklogService.historyCounts | 작업 로그 탭 표시 지연 | 워크로그 50건 이슈를 팀장 계정으로 열어 응답 시간 비교(이력 끔/켬) | 카운트를 별도 지연 조회로 분리하거나 collectionInfo 캐시 |

## 설계 단계 판단(실측으로 뒤집힐 수 있는 것)

- 중복 방지(같은 이벤트 2회, 이벤트+스윕)는 플랫폼과 무관하게 **미러 CAS + PK** 로 보장한다. H7 은 그 장치가 Forge SQL 에서 오류 없이 도는지만 본다.
- 가장 위험한 것은 H4 — 두 읽기 경로의 값 표현이 다르면 우리 화면 쓰기마다 가짜 행이 생긴다. 배포 회차 첫 확인 항목으로 둔다.
- 용량(H6)은 칼럼 다이어트 전제 위에서 목표를 겨우 맞춘다(약 148MB). 실측이 크면 보관 기간 기본값을 낮추는 것이 첫 조치다.
