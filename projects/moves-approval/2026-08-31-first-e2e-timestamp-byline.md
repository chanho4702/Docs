# 2026-08-31 · 첫 E2E 실측 — 승인 요청 생성 실패(TIMESTAMP) + byline 상태 표시 + 진입점 정리

프로젝트: moves-approval (Confluence Cloud Forge, [[confluence-approval-dc]] 의 재작성)
관련: [[forge-sql-no-fk-cascade]] · [[forge-migration-lifecycle]]

## 증상 → 원인
1. **승인 요청 모달 제출 시 `SQL_EXECUTION_ERROR`** (화면엔 `error.SQL_EXECUTION_ERROR` 원문 키 노출)
   - `forge logs` 가 **비어 있었다** — `responseWrapper` 가 예외를 삼키고 응답으로만 돌려줬기 때문.
   - 상위 Confluence 페이지의 `window.fetch` 를 가로채 `invokeExtension` 응답 본문을 읽으니
     `error.cause.context.debug.message` 에 진짜 원인이 있었다:
     `ERROR 1105 (HY000): cannot convert datum from double to type timestamp`
   - 도메인이 쓰는 epoch ms 숫자를 Repository 가 그대로 `TIMESTAMP` 컬럼에 바인딩. MySQL 은 관용적으로
     받지만 **TiDB(Forge SQL)는 숫자→TIMESTAMP 암묵 변환이 없다.** 단위 테스트는 execute 를 목으로 잡아
     이 계열을 영원히 못 본다(배포 후에만 드러나는 U 계열).
2. **byline 에 앱 이름만 보임** — `dynamicProperties` 핸들러가 `payload.context.contentId` 를 읽고
   `{ isHidden: true }` 를 반환했는데 둘 다 규약 밖. 실제 규약: `(payload, context)` 호출, 문서 id 는
   `payload.extension.content.id`, 반환은 `{ title, icon, tooltip }` 뿐(**숨김 불가**).
3. **편집·공유 버튼 사이에 앱 버튼** — Forge 에 그 슬롯을 여는 모듈이 없다(문서 전수 확인).

## 해결
- `rdb/query/SqlTime.js` 경계 신설: 쓰기 `toSqlTimestamp(ms)` → `'YYYY-MM-DD HH:MM:SS'`(UTC),
  읽기 `fromSqlTimestamp(str)` → ms(시간대 표기 없는 문자열은 UTC 로 고정 — `Date.parse` 는 로컬로 읽는다).
  도메인은 여전히 숫자만 본다.
- byline 을 **결재 상태 표시 + 모달 진입점**으로: `resource: main/modal`, `viewportContainer: modal`.
  모달은 intent 미지정 시 결재 유무를 조회해 상세/요청 폼을 자동 선택(••• 메뉴 경로도 같이 개선).
  배너의 `+ 승인 요청` 버튼은 제거(진입점 이원화 방지, 사용자 동의).
- `responseWrapper` 가 LogicalError·PermissionError·ConcurrencyError 외 예외를 `[RESOLVER]` 로 로그.
- 덤으로 잡힌 것: 마감 없는 요청이 배너에 "기한 초과", 미결정 행이 "1970. 1. 1." — `new Date(null)` = epoch 0.
  상세 모달 승인자가 accountId 로 보임 → `resolveUsers` 로 이름·아바타 해석.

## 교훈
- **서버가 예외를 삼키면 `forge logs` 는 아무 말도 안 한다.** 래퍼 단계에서 최소한 이름·코드·DB debug 는 남겨라.
- Forge iframe 은 크로스오리진이라 모달 내부 상태는 못 읽지만, **상위 페이지의 fetch 를 패치하면
  resolver 응답 본문은 읽을 수 있다** — 배포 없이 진단하는 가장 빠른 길.
- 저장 계층을 목으로 잡은 테스트가 통과해도 **DB 타입 변환은 실기동 전용 결함**이다. 새 컬럼 타입을
  쓰면 스파이크 resolver 로 라운드트립 한 번은 실측하라.
- 모듈 규약(dynamicProperties 등)은 문서에서 **호출 시그니처와 반환 키를 먼저 확인**하라. 규약 밖 키는
  오류 없이 무시되어 "안 바뀐다"로만 보인다.
- 사용자 브라우저에서 자동화 중 배율이 바뀌면 좌표 클릭·스크린샷이 전부 흔들린다(렌더러 프리즈 포함).
  라이브 검증은 핵심 경로 1~2개만 하고 나머지는 사용자에게 넘기는 게 낫다.

## 같은 날 이어서 한 것
- **네이티브 알림이 한 번도 나간 적이 없었다** — WIP 의 `CommentNotifier` 는 완성돼 있었지만 `createNotifications` 를 부르는 곳이 없었다. 서비스 경로(생성·결정·회수)에 직접 연결하고 정책 토글 기본값을 켰다. 실측: 요청 생성 시 `@Tom Kim · 결재 요청 · 문서: … · 열기` 코멘트가 페이지에 생김(절대 링크 = v2 pages `_links.base + webui`).
- `ApprovalService.policyLoader` 기본값이 **스텁**(`{rejectionReasonRequired:true}`)이었다 — 설정 화면의 정책이 결재에 전혀 적용되지 않던 상태. `settingsRepository.getPolicy` 로 교체.
- DC 인벤토리([[dc-feature-inventory]])를 뽑아 요청 폼을 재설계. Flow 편집 UI 가 Cloud 설정에 아직 없어 Flow 탭은 데이터가 있을 때만 보인다.
- byline → 모달의 첫 `getContext()` 가 content 없이 오는 경우가 간헐적으로 있어(INVALID_TARGET) 4회 재시도.

## 격차 보강 ①③② (같은 날 후반)
- ① Flow 편집 UI: 요청 폼의 단계 편집기를 `ApprovalLineEditor` 로 뽑아 공유. Confluence 그룹 키를 id→이름으로 바꾼 이유 = Flow 에 저장된 그룹을 사람이 읽어야 한다. Flow 단계 `principal_type` 이 VARCHAR(8) 라 승인 그룹은 `AGROUP`.
- ③ `ExpiryService`: 트리거·스윕은 사용자 컨텍스트가 없어 asApp 필요. 겹침 방지는 `approval_job_state` 조건부 UPDATE 리스(next_run_at ≤ now). 마감 임박 알림은 `요청×마감시각×수신자` 결정적 id → INSERT IGNORE 로 스윕 재실행에 안전. 실측: 페이지 v2→v3 편집 후 byline 이 곧바로 "만료됨". `forge logs` 엔 한참 뒤에도 안 보였다 — 트리거 검증은 로그 말고 결과로.
- ② CC 를 넣다가 **승인/반려/회수 앱 내 알림이 아예 생성되지 않던 것** 발견(생성 경로가 요청 시점뿐). 서비스 경로에 `createNotificationsBestEffort` 연결. 영역 결재 응답 shape 계약 테스트가 `cc`/`events` 누락을 바로 잡아 줬다.

## 피드백 라운드 (같은 날 저녁)
- 사용자 결정: **편집이 요청을 만료시키면 안 된다** → 자동 편집 만료를 걷어내고 "새 버전으로 다시 상신"(SUPERSEDED) + 버전별 이력으로 재설계. DC 규칙을 그대로 옮긴 것이 오히려 불만이었다 — 이식은 규칙이 아니라 의도를 옮겨야 한다.
- 업무함 "처리한 건" 오류의 정체: `SELECT *` 가 BINARY(16) `request_id` 를 Buffer 로 돌려주고, 2차 조회 커서에 그대로 실려 `invalid argument type map[string]interface {}`. **결과가 있는 탭은 전부 실패**했는데 내 차례가 0건이라 안 보였다. `BIN_TO_UUID` 로 내보내고 `UUID_TO_BIN(?)` 로 비교.
- 아바타/스페이스 아이콘: iframe 은 다른 오리진이라 사이트 쿠키가 안 실린다. `requestConfluence` 로 이미지를 프록시하려 했으나 API 게이트웨이가 비-API 경로를 안 통과시킨다(진단 중 브라우저가 계속 멈춰 실측은 못 함). 절대 URL + 이니셜 대체로 결정.
- 서명 기능 v1: SQL 테이블(KVS 값 한도 회피), 캔버스 획 영역만 잘라 저장, 정책 토글. PIN 은 미구현.
- 진단 채널: 페이지 뷰에서는 상위 창 fetch 패치가 통하지만 globalPage(업무함)에서는 안 잡힌다.

## 피드백 라운드 2 (저녁~밤)
- 워크플로 요청은 "상태 추가·전이 조건·다중 워크플로" 였지만 상태 머신을 흔들지 않는 A안(단계 이름=표시 상태 + 결재선 다중)으로 합의. 사용자에게 두 안의 비용을 제시하고 고르게 한 것이 맞았다.
- 승인자 등록제: 명부는 KVS, 앱 접근 게이트는 guard 한 곳(30초 캐시). 다른 사용자의 페이지 권한은 v1 `permission/check`(subject 사용자, operation 문자열) — API 가 답을 못 주면 통과(플랫폼 장애가 결재를 막지 않게), 명시적 false 만 거절.
- 업무함 CSV 는 클라이언트에서 Blob 다운로드 — iframe 에서 되는지는 사용자 확인 대기.
- 스텝퍼·이력 카드·PIN 까지 하루에 넣었다. 컬럼 추가는 매번 스파이크 페이지로 마이그레이션을 먼저 돌려야 한다는 걸 세 번 반복하고서야 CLAUDE.md 에 적었다.
- 로고: 채팅 첨부 이미지는 파일로 못 꺼낸다 — 디스크 경로를 받아야 한다.

## 남은 것
- 결정(승인/반려/회수) 경로의 라이브 검증 — 코드 경로는 같은 `ts()` 를 타지만 브라우저 불안정으로 미클릭.
- Flow·ApprovalGroup·Settings 는 `toISOString()`('Z' 접미) 문자열을 바인딩한다. TiDB 가 받는지 미확인 —
  안 받으면 같은 `SqlTime` 경계로 옮긴다.
- 남은 DC 격차: 일괄 승인, 업무함 필터 URL 보존(부분), 위임/대리, 설정 변경 이력, 독촉(REMINDER), 상세 검색 다이얼로그.
- 사용자 요청(설계 확인 필요): 상태 추가·전이 조건·워크플로 다중 선택 — 도메인 상태 머신과 충돌하는 범위라 '단계 이름 = 표시 상태' 안을 제시함.
