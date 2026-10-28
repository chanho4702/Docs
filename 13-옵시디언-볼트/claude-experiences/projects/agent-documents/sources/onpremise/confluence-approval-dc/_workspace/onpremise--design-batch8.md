# 배치 8 설계 — 전자서명 옵션 + CC 참조자 (2026-08-13)

근거: `docs/backlog.md` 배치 8 항목 + 코드 실측 (설정/결정 REST/AO/렌더/알림/승인자 모델/업무함 뷰/도메인,
파일:줄 인용은 아래 각 결정에 표기). 원칙: **행동을 바꾸는 기능은 전부 관리자 옵션, 기본값 off = 현행 동일.**

## 결정

### D1. 설정 2키 — `signatureEnabled`, `signaturePinRequired` (기본 둘 다 false)
- 저장: SAL PluginSettings (`ApprovalSettings.java:10-21` 키 상수, `Values` record `:124-139`).
  `bool(key, fallback)` 헬퍼 기존재 — 기계적 확장.
- 수정 파일(실측 목록): ApprovalSettings.java(키·Values·read/save),
  ApprovalRestResource.java `:689-774` POST(QueryParam 2·validBoolean·Values 인자),
  `:776-801` 테스트용 축약 오버로드(인자 확장), `:1561-1582` settingsObject(put 2줄),
  ApprovalSettingsServlet.java(체크박스 2·loadSettings·onsubmit), 테스트 2종.
- 의미 계층: `signaturePinRequired`는 `signatureEnabled=true`일 때만 유효. off→모든 화면 현행 동일.
- ApprovalRegionMacro의 settings 캐시가 새 키를 함께 캐시하는지 확인(기존 캐시 구조 그대로면 무수정).

### D2. 자동 도장 (1단계) — 저장물 없음
- `signatureEnabled=on`일 때 **승인(APPROVE) 결정 옆에만** 도장 렌더. 반려·미결정은 현행 텍스트 유지
  (결재 도장 관행: 도장=승인 인증. 반려에 도장을 찍는 조직 관행은 없음).
- 등록 서명이 있으면 그 이미지(D3), 없으면 이름 기반 CSS 도장: 원형 1.5px 테두리 + 이름 축약
  (2~3자, `displayName` 뒤 2자 우선 — 한국 이름 관행) + `--approved` 색. 새 색 금지, 토큰 재사용.
- 렌더 지점: `ApprovalMarkup.appendSteps` `:424-428`의 decision 라벨 옆. 타임라인(`appendTimeline`)은
  텍스트 유지(과밀 방지). 서버 렌더 호출부 2곳(panel `:145-159`, region macro)에 서명 리졸버 전달.
- `nameResolver`(UnaryOperator<String>)만으로는 부족 → `detailDialog`에 **signatureResolver
  `Function<String, SignatureRef>` 파라미터 추가** (null 허용 = 기능 off). SignatureRef = record(имя
  방식: AUTO | IMAGE, imageUrl). 호출부 2곳 + 테스트 수정.
- 업무함 상세: `decisions[]` JSON(`ApprovalRestResource.java:1419-1435`)에
  `signature: {"type":"auto"|"image","imageUrl":...}` (signatureEnabled=off면 필드 없음) →
  `ApprovalInboxServlet detail()` `:499-507`에서 렌더.

### D3. 등록 서명 (2단계) — AO `APR_SIGN`, 사용자당 1행
- 컬럼: `USER_KEY` @Unique @Indexed @StringLength(255) (**create 시 DBParam** — AO unique 함정
  `ActiveObjectsApprovalRequestRepository.java:470-476` 주석), `MIME_TYPE` @StringLength(64),
  `DATA` CLOB(base64, 인덱스 불필요), `UPDATED_AT`. `atlassian-plugin.xml:13-21` `<ao>`에 entity 추가.
- 검증(서버): 원본 ≤50KB, MIME은 **image/png·image/jpeg만** (SVG는 스크립트 삽입 벡터라 금지),
  base64 형식 정규식 검증(렌더 시 data URI 주입 안전성).
- 키 정규화: **userKey 단일로 저장** (`userKey(user)` 기준). 조회도 userKey만 — 승인자 키의
  username 혼재(`ApprovalRestResource.java:352-355`)와 달리 신규 테이블은 혼재를 만들지 않는다.
  단, 서명 리졸브 입력이 username형 actorKey일 수 있으므로 리졸브 시 key→user→userKey 정규화 후 조회.
- REST: `GET /approvals/signature`(본인 것 조회, 메타만), `POST /approvals/signature`
  (**@FormParam data,mime** — 50KB base64는 URL 한계 초과 + 민감 데이터 URL 금지. body 사용은
  "query만" 관례의 명시적 예외로 기록), `POST /approvals/signature/delete`.
- 이미지 서빙: `GET /approvals/{id}/signature-image?actorKey=` — **요청 canView + actorKey가 해당
  요청의 결정자일 때만** 반환(개인 서명의 무권한 열람 차단). `Cache-Control: private, max-age=300`.
  상세 모달(서버 렌더)도 같은 URL을 <img src>로 사용해 JSON 비대를 피한다.

### D4. 서명 PIN (3단계) — AO `APR_PIN`, PBKDF2, 절대 Confluence 비밀번호 아님
- 컬럼: `USER_KEY` @Unique(255, DBParam), `PIN_HASH`(255), `SALT`(255), `ITERATIONS`(int),
  `FAILED_COUNT`(int), `LOCKED_UNTIL`, `UPDATED_AT`.
- 해시: PBKDF2WithHmacSHA256, salt 16B SecureRandom, 210,000회(OWASP 권고), 상수시간 비교
  (`MessageDigest.isEqual`). 원문 미보관·로그 금지. PIN 형식: 4~12자 (숫자 강제 안 함).
- 실패 제한: 5회 연속 실패 → 15분 잠금(LOCKED_UNTIL). 성공 시 카운터 리셋. 잠금 중 검증 시도는
  카운터를 늘리지 않고 423-유사 메시지(409 + 코드 PIN_LOCKED — 기존 오류 매핑 관례 유지).
- **PIN은 절대 query string에 넣지 않는다** (Tomcat access log에 평문 잔존). `approve`/`reject`에
  `@FormParam("pin")` 추가 — actorKey·reason은 기존 query 유지, pin만 POST body. JS는
  `body: new URLSearchParams(...)` + `Content-Type: application/x-www-form-urlencoded`.
  이 예외는 코드 주석 + README에 관례 예외로 명시.
- 검증 지점: `ApprovalRestResource.decide()` `:1015-1052`의 denyCurrent(`:1028`)와
  workflowService 호출(`:1029`) 사이. **도메인은 PIN을 모른다** (approval-domain 순수성 유지).
- 정책: `signatureEnabled && signaturePinRequired`일 때만 검증. PIN 미등록 사용자의 결정은
  403 + 코드 PIN_NOT_SET("업무함 > 내 서명에서 PIN을 등록하세요") — 조용한 실패 금지.
- 등록/변경 REST: `POST /approvals/pin` @FormParam(pin, currentPin — 변경 시 기존 확인).
  관리자용 초기화: `POST /approvals/pin/reset?userKey=` (isAdministrator, 사용자가 PIN 분실 시).

### D5. CC 참조자 — 별도 AO `APR_CC` (승인자 테이블 role 방식 기각)
- 기각 근거(실측): APR_APV에 role을 넣으면 `findByApproverKey`(`:200-210`)·`toRequest`(`:78-115`,
  무조건 eligible.add)·`hydrate/assemble`·`saveApprovers`(`:515-559`, **retained에 없는 행 삭제 →
  저장할 때마다 CC 행 소멸**)·viaGroups 3종·decisions[] JSON까지 8개 지점이 오염된다.
  별도 테이블이면 기존 쿼리·도메인 계약 무변경.
- 컬럼: `REQUEST_ID` @Indexed @StringLength(64), `RECIPIENT_KEY` @Indexed @StringLength(255),
  `CREATED_AT`. 중복 방지는 createIfAbsent 패턴(요청 생성 시 1회 쓰기라 경쟁 미미).
- **도메인 밖** (aggregate 비포함): 도메인 스냅샷 소비자 6곳 중 resolver만 CC가 필요하고, 나머지는
  포함 시 eligible/steps 오염 방어 코드가 역으로 필요해진다. `ApprovalRequestRepository` 포트 무변경.
- create REST(`:141-156`)에 `ccKeys`·`ccGroups` QueryParam 추가(CSV). 그룹은 요청 시점 구성원으로
  스냅샷 확장(결재선 그룹과 동일 규칙, 등록 그룹만). **요청자·승인자(eligible)와 중복되는 키는 제거**
  (승인자는 이미 당사자 알림을 받는다). CC는 canDecideNow에 안 잡히므로 결재 권한 자동 차단.
- 회수/재승인(fromRequestId) 시 CC 승계는 하지 않음(단순성) — 재요청 모달에서 다시 지정.

### D6. CC 알림 — resolver 시그니처 확장
- `NotificationRecipientResolver.resolve(request, event)` `:11-45` → `resolve(request, event,
  Set<String> ccKeys)` 3-인자로 확장. `REQUESTED` + 최종 결정(`APPROVED`/`REJECTED`/`EXPIRED`/
  `CANCELLED`)에 ccKeys 합류, 중간 단계 통과는 제외. 본인 제외 규칙(`:42`) 유지.
- ccKeys 조회는 `ApprovalNotificationService.enqueueFor` `:53-66`에서 CC 저장소 1회 조회 후 전달
  (resolver의 "스냅샷+이벤트만" 순수성 유지, 저장소 의존 주입 불필요).
- 이메일: 기존 게이트(emailNotificationsEnabled + EmailRecipientEligibility) 그대로 통과. 본문
  문구 분기(참조 표시)는 이번 배치 제외 — 잔여로 기록.
- in-app 알림 목록(`:600-672`)은 canView 필터만이라 CC 자동 표시. **단 CC의 canView**: CC로 지정됐어도
  페이지 VIEW 권한이 없으면 목록에서 걸러진다 — 의도된 동작(권한 우회 금지), 설계 노트로 기록.

### D7. 업무함 "참조" 뷰
- 서버: `GET /mine/cc` 신설 — `/mine/requested`(`:363-385`) 패턴 복제. 소스는 CC 저장소
  `findRequestIdsByRecipient(userKey)`(+username 정규화 아님 — 신규 테이블은 userKey 단일) →
  `findAllByIds` 배치 하이드레이션 → 공통 `mineResponse(...)` 재사용. badges는 `{"cc": PENDING 건수}`
  분기(`:1211-1222`).
- 클라이언트(`ApprovalInboxServlet.java`): TABS에 `cc:{}`(`:721-730`), endpoint 분기(`:823`),
  badge 키 맵에 `cc:"cc"`(`:851`), 부팅 배지 로드 규칙은 requested와 동일 처리(hasOwnProperty 가드).
- 사이드바: `NavMarkup.java:191-196`에 "참조" 항목 + ICON_CC (`appendInboxItem` 재사용).
- 상세 모달·업무함 detail에 "참조자" 섹션: 서버 렌더(detailDialog)와 JSON `cc[]`
  ({key, displayName}) 각각 추가. 비어 있으면 섹션 생략.

### D8. 요청 모달 CC 피커
- `ApprovalMarkup.appendRequestForm` `:292-342`의 요청 메모 필드 앞에 "참조자 추가(선택)" 필드:
  기존 사용자/그룹 검색 UI(`:310-325`) 패턴 재사용, 순서 개념 없음(칩 나열 + 제거 버튼).
  hidden input `ccKeys`/`ccGroups` → approval.js 제출 조립에 합류. Flow 탭에서도 CC는 공통 필드.
- 도달성: 추가 검색 입력은 결재선 검색과 `data-approval-cc-scope`로 구분(이벤트 위임 충돌 방지).

### D9. 서명·PIN 등록 화면 — 업무함 내부 뷰 `?view=signature` ("내 서명")
- 위치: 업무함 사이드바 "알림과 설정" 그룹(알림 아래, 승인 설정 위)에 "내 서명" 추가. 별도 서블릿
  대신 기존 업무함 서블릿 뷰 확장(데코레이터·nav 재사용, 최소 비용).
- 구성: ① 현재 서명 미리보기(<img data URI>, 없으면 자동 도장 미리보기) ② 등록: 캔버스 그리기
  (vanilla pointer events, 320×160, 검정 펜, 지우기) 또는 PNG/JPEG 업로드(≤50KB 클라 사전 검증)
  ③ 삭제 ④ PIN 설정/변경(현재 PIN → 새 PIN 2회 입력, `signaturePinRequired` on일 때 안내 배너).
  전부 `signatureEnabled=off`면 뷰 진입 시 "관리자가 서명 기능을 켜면 사용할 수 있습니다" 안내.
- 캔버스 → `toDataURL("image/png")` → base64 추출 → POST FormParam. AUI 버튼·기존 토큰만 사용.

### D10. 결정 모달 PIN 입력 스텝
- `signatureEnabled && signaturePinRequired`일 때 승인/반려 확정 직전에 **인라인 PIN 스텝**
  (반려 인라인 스텝과 동일 패턴 `data-approval-*` + 상호 배타·ESC 우선순위 규칙 준수):
  `<input type="password" inputmode="numeric" autocomplete="off">` + 확인/돌아가기.
  반려 흐름에서는 반려 사유 스텝의 "반려 확정"이 PIN 입력을 겸함(사유 textarea 아래 PIN 필드 노출) —
  스텝 2중첩을 피한다. detailDialog에 `data-approval-pin-required` 데이터 속성 주입.
- 오류 코드 매핑: PIN_NOT_SET(403)·PIN_INVALID(403, 남은 시도 표기)·PIN_LOCKED(409) → 인라인 메시지.

## 배치 분할 (파일 집합 기준, 순차)

| 배치 | 내용 | 주요 파일 |
|------|------|----------|
| 8a | 서명·PIN 백엔드: D1 설정, APR_SIGN/APR_PIN + 저장소, PinService(PBKDF2·잠금), decide() PIN 검증, 서명 REST(등록/삭제/이미지 서빙), decisions[] signature 필드, SignatureRef 리졸버(마크업 파라미터만 추가, 렌더는 8c) | ApprovalSettings, atlassian-plugin.xml, storage/ 신규 2, ApprovalRestResource, ApprovalMarkup(시그니처), 테스트 |
| 8b | CC 백엔드: APR_CC + 저장소, create ccKeys/ccGroups, resolver 3-인자 + enqueueFor, /mine/cc + badges.cc, JSON cc[] | atlassian-plugin.xml, storage/ 신규 1, ApprovalRestResource, notification/ 2, 테스트 |
| 8c | 서명·PIN UI: 설정 화면 체크박스, appendSteps 도장/이미지 렌더, PIN 인라인 스텝, 내 서명 화면(캔버스·업로드·PIN), 업무함 detail 서명 표시 | ApprovalSettingsServlet, ApprovalMarkup, ApprovalInboxServlet, NavMarkup, approval.js, approval.css |
| 8d | CC UI: 요청 모달 CC 피커, 상세 모달·업무함 참조자 섹션, 업무함 "참조" 탭·배지 | ApprovalMarkup, ApprovalInboxServlet, NavMarkup, approval.js, approval.css |

8a·8b가 같은 파일(ApprovalRestResource, atlassian-plugin.xml)을 건드리지만 순차 실행이므로 충돌
없음 — 결합 시 배치가 과대해져(7a 부분 완료 전례) 분리가 낫다.

## QA 게이트 (배치 공통)
- `mvn -pl approval-confluence9 -am test` 그린 + `mvn -pl approval-confluence10 compile` SUCCESS.
- `signatureEnabled=false`(기본)에서 모든 화면·REST 응답이 배치 전과 동일(옵션 off 무영향 증명).
- PIN이 URL/로그에 나타나지 않음(access log 관례 위반 grep + 코드 검토).
- AO 신규 엔티티 3종: unique 컬럼 DBParam 생성 준수, `<ao>` 등록 누락 없음.
- CC가 decisions[]·eligible·업무함 내차례/진행중에 절대 나타나지 않음(별도 테이블 격리 증명).
- 기존 데이터 위 마이그레이션: 신규 테이블 3종 추가뿐(기존 테이블 무변경) — QuickReload 재설치 확인.

## ~~사전 절차 (Codex 실행 전 필수)~~ — 2026-08-13 폐기, 절대 실행 금지
- ~~`target/classes/.../domain` 삭제~~ — **이 디렉토리는 `<Embed-Dependency>` 패키징 재료다.**
  삭제 후 clean 없는 증분 verify는 domain이 빠진 jar를 만들어 REST·패널·매크로가 전부
  NoClassDefFoundError로 죽는다(8a 배포 사고로 실증). approval-dev 스킬 "빌드·배포 철칙" 3조 참조.
