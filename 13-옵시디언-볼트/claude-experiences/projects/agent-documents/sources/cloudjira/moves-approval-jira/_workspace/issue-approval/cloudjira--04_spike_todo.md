# issue-approval 플랫폼 실측 목록 (미검증)

> 작성: backend-engineer · 2026-10-04 (Phase 3). 설계서 `01_architect_design.md` §10 의 I1~I10 을 옮기고, 구현 중 생긴 항목을 I11~ 로 잇는다. 프론트가 생기는 항목은 I15~ 로 잇는다. 배포 회차에 리더가 확인하고 `결과` 칸을 채운다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값(`getIssueApproval` / `getApprovalDetail` 의 `approval.changeSinceRequest`, `canRequest`, `notAvailableReason`)과 DB 상태로 본다. `forge logs` 는 늦다.
> 배포 전제: 스키마·scope·모듈 수 무변경 → `forge deploy` + (manifest title 변경 반영 확인용) `forge install --upgrade`. 마이그레이션 없음(v032 유지).
> 진단 팁: changelog 호출 여부는 응답에서 간접 확인한다 — `changeSinceRequest.checked:true` 이고 `changed:false` 인데 `updated` 가 기준 이후였는지는 응답만으로 구분되지 않는다. I1 확인이 필요하면 1회용 진단 필드(예: `changeSinceRequest._fetched`)를 스파이크 빌드에만 넣고 확인 후 제거.

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **I1** | 이슈 `fields.updated` 가 어떤 변경에 갱신되나(필드 편집·코멘트·워크로그·전환·프로퍼티·첨부·링크) | 사전 거름의 효과(비용만, 정확도 무관) | 요청 후 코멘트만 달기 → `getIssueApproval` 에서 changelog 호출 여부(스파이크 진단 필드 또는 로그 `[ISSUE-CHANGE] fetched`) | 거름이 너무 자주 통과하면 compact(issueContext)에서는 changelog 를 생략하고 패널·상세에서만 판정 | |
| **I2** | `GET issue/{id}/changelog` 정렬(오래된 것부터?)·`total` 제공·maxResults 상한 100·asUser 접근 | 끝 페이지 선택(`IssueChangeReader.load`) | 100건 넘는 이슈에서 응답 순서·total 확인 | 정렬이 최신부터면 첫 페이지만 읽도록 `load` 1줄 수정. 대안: `POST /rest/api/3/changelog/bulkfetch`(fieldIds 필터) | |
| **I3** | changelog 에 남지 않는 수정(코멘트·이슈 프로퍼티·원격 링크) 범위, 첨부·이슈 링크·부모 변경의 항목 형태 | Q81 의 실제 범위 | 각 수정 후 changelog 항목 확인 | 문서화(가이드)만. 코멘트를 세야 하면 Q81 재논의 | |
| I4 | Forge 런타임 `Date.now()` 와 Jira `created`/`updated` 시계 차이 | 요청 직후 수정의 오탐·누락 | 요청 직후 1초 안에 요약 수정 → "수정됨" 표시 여부 | 차이가 크면 요청 시점 `updated` 를 기준으로 저장(`v033_alter_*`, 설계 §5) | |
| I5 | issueAction title 변경 후 기존 설치에서 ••• 메뉴 이름 갱신(`forge deploy` 만으로?) | Q85 | 배포 후 ••• 메뉴 문구 | `forge install --upgrade` 필요 여부 기록 | |
| I6 | X28(moduleKey 위치)·X11 — 종류 선택 화면(overview) 진입 판정 | ••• 진입이 overview 로 가는지 | ••• > Request approval → 종류 선택 화면 | moduleKey 를 못 받으면 issueAction + main/modal = overview 로 고정 | |
| I7 | issueContext 높이 — 두 칸이 된 compact 의 iframe 자동 높이 | 우측 요약 잘림 | 일반 PENDING + 전환 규칙 2개 이슈에서 스크롤 없이 보이는지 | compact 에서 전환 칸을 한 줄 요약으로 접기 | |
| I8 | changelog `items[].fieldId` 가 사용자 정의 필드(Rank·Sprint)·team-managed 에서 어떤 값인지, `field` 이름이 사용자 locale 로 번역되는지 | 무시 필드 판정(Q81) — 지금은 이름 `rank`·`sprint` 로 거른다 | 보드에서 순위 변경·스프린트 이동 후 changelog | 이름 비교 대신 `fieldId` 로 사이트별 Rank/Sprint id 를 `GET /rest/api/3/field` 로 한 번 찾아 캐시 | |
| I9 | 이슈 화면 로드당 4~6콜의 요율 한도 영향 | 대형 사이트 성능 | 배포 후 이슈 화면 연속 열람 시 429 여부 | 두 칸을 합친 조회 resolver(가드 1회 공유) 신설 | |
| I10 | 우리 시간 추적 화면(asUser)이 남기는 워크로그 changelog 항목 이름(`timespent`·`WorklogId`) | 워크로그 기록이 "수정됨" 오탐 | 작업 로그 기록 후 changelog | 무시 목록(`IGNORED_FIELD_IDS`/`NAMES`)에 실측 이름 추가 | |
| I11 | changelog `created` 형식 — `2026-10-04T10:00:00.000+0900`(오프셋 콜론 없음) 가정, 밀리초 유무 | `parseJiraTime` 실패 시 그 항목을 버린다 → 수정 누락 | 실제 응답 한 건의 `created` 원문 확인 | 형식이 다르면 `parseJiraTime` 정규식 보강(도메인 1줄 + 테스트) | |
| I12 | Forge 런타임에서 `IssueChangeReader` 3초 상한(`setTimeout` + `Promise.race`)과 invocation memo(AsyncLocalStorage, T10) | 느린 changelog 가 조회 전체를 늦추지 않는지, 같은 호출 안 중복 조회 | 100건 초과 이슈에서 `getIssueApproval` 응답 시간, `checked:false` 빈도 | 3초가 자주 넘으면 상한을 2초로 줄이거나 compact 에서 생략(I1 대안과 같음) | |
| I13 | 필드 보안·이슈 보안 수준·권한에 따라 changelog 항목이 사용자마다 다르게 보이는지(asUser) | 같은 요청이 사람마다 "수정됨"이 달라질 수 있음(요청자는 수정됨, 결재자는 아님 등) | 필드 수준 제한이 있는 사이트·계정 두 개로 같은 요청 상세 비교 | 차이가 의미 있으면 판정만 asApp 으로 하는 안(AGENTS asApp 목록 확장 — 사람 결정)을 질문으로 | |
| I14 | `avi:jira:deleted:issue` 에서 두 서비스(전환·일반 승인)가 같은 이슈의 ISSUE·TRANSITION 요청을 각각 1건씩 만료시키는지(X10 의 `issue.id` 재사용) | 삭제 만료 | 일반 PENDING + 전환 PENDING 이 함께 있는 이슈 삭제 → 업무함에서 두 건 모두 `EXPIRED`, 알림 템플릿 `issueDeleted` / `transitionIssueDeleted` | payload 에 id 가 없으면 삭제 만료는 열람 거부·마감 만료로만 정리(설계 §4.6 "놓친 삭제 이벤트") | |
| I15 | ••• 메뉴 모달(`viewportSize: medium`) 안에서 종류 선택 → 일반 승인 요청 폼·상세가 그대로 열린다. 이슈 엔트리에서 열 때는 `large` | 요청 폼(결재선 편집기·Flow 탭·날짜 선택)이 medium 폭에서 잘리거나 가로 스크롤 | ••• > Request approval > 일반 승인 [승인 요청] → 폼 전 항목·하단 버튼이 보이는지 | manifest `viewportSize: large` 로 올림(모듈 속성만, 엔트리 무변경) | |
| I16 | issueContext compact 에 두 칸(일반 한 줄 + 전환 목록) + 섹션 라벨 2개 — iframe 자동 높이(I7 확장). issue 엔트리 고유 JS 6.3KB gz(X30) → **7.7KB gz** | 우측 요약 잘림·첫 표시 지연 | 일반 PENDING(수정됨) + 전환 규칙 2개 이슈에서 스크롤 없이 보이는지, 첫 표시 시간 | compact 에서 섹션 라벨 생략 또는 전환 칸 한 줄 요약 | |
| I17 | ••• 메뉴 모달(Jira 가 연 모달)에서 요청·재상신한 뒤 이슈 우측 요약·패널 갱신 — 우리 엔트리가 연 모달이 아니라 `onClose` 무효화가 없다. 지금은 react-query `refetchOnWindowFocus` 에 기댄다 | 요청 직후 요약이 옛 상태("진행 중인 결재가 없습니다")로 남음 | ••• > 일반 승인 요청 제출 → 모달 닫힘 → 우측 요약이 PENDING 으로 바뀌는지(포커스 이동 없이) | `@forge/bridge` `events` 로 모달→이슈 엔트리 갱신 신호, 또는 이슈 엔트리 주기 재조회(짧은 staleTime) | |
| I18 | 화면이 `changeSinceRequest.fields[].name`(Jira changelog `field` 원문)을 그대로 보여 준다 — I8 의 locale 번역 여부에 따라 한국어 화면에 영문 필드명이 섞일 수 있음 | 표시 품질(판정 무관) | 한국어 사용자 계정으로 요약·설명 수정 후 패널의 "바뀐 항목" 문구 | 서버가 `GET /rest/api/3/field` 이름으로 바꿔 주거나(백엔드 요청) 그대로 수용 | |

기존 항목 재사용: X10(`deleted:issue` payload 의 issue.id) — I14·§4.6 삭제 만료가 기댄다. X29(Modal onClose) — 두 칸 무효화가 기댄다.
