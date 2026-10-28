# QA 배치 6a — 취소·요청 메모·영역 해시 백엔드

- 기준 커밋: 2b894ed + 미커밋 워킹트리
- 검증자: approval-qa (독립 검증, Codex 보고 미신뢰)
- 판정: **FAIL** (치명 4, 주의 4, 경미 5)

## 0. 빌드 결과

| 명령 | 결과 |
|------|------|
| `mvn -B -pl approval-domain clean package` | **BUILD SUCCESS** — 52 tests (기존 48, +4) |
| `mvn -B -pl approval-confluence9 test` | **BUILD FAILURE** — 56 tests, **1 Failure** |

실패 테스트:
```
ApprovalRegionMacroSettingsCacheTest.같은_ConversionContext에서는_설정을_한번만_조회한다:28
  expected: <13> but was: <14>
```
`ApprovalSettings.read()`가 statusLabel을 하나(CANCELLED) 더 읽으므로 `PluginSettings.get` 호출이
13→14가 되었는데 테스트를 갱신하지 않았다. Codex는 **c9 테스트를 한 번도 통과시키지 않았다**.

### 빌드 환경 함정(재작업 시 반드시 적용)
1. `mvn -pl approval-confluence9 -am test`는 이 저장소에서 **새 domain을 보지 못한다**.
   `approval-confluence9/target/classes/kr/dmove/confluence/approval/domain/*.class`(이전 패키징 때
   Embed-Dependency로 인라인된 사본, 08-12 11:05)가 컴파일 classpath에서 최신 jar를 가린다.
   → 증상: "cannot find symbol: cancel(UUID,String,String)", "enum switch case label must be the
   unqualified name" 같은 유령 오류 9건.
2. C9 인스턴스 기동 중이라 `clean`은 cargo 디렉터리 잠금으로 실패한다.
3. 실제로 통한 절차:
   ```
   mvn -B -pl approval-domain clean install -DskipTests
   rm -r approval-confluence9/target/classes/kr/dmove/confluence/approval/domain
   mvn -B -pl approval-confluence9 test
   ```

## 1. CANCELLED 전이표 판정

| 전이 | 기대 | 실제 | 판정 |
|------|------|------|------|
| PENDING → cancel | CANCELLED + 이벤트(actorKey trim, reason blank→null) + updatedAt | `cancel()`이 `ensureOpen()` 후 CANCELLED 이벤트 추가, `normalizeActorKey`(null/blank 거부·trim), `normalizeOptional`(reason) | PASS |
| APPROVED → cancel | APPROVAL_ALREADY_CLOSED | ensureOpen 재사용 | PASS |
| REJECTED → cancel | 예외 | 동일 | PASS |
| EXPIRED → cancel | 예외 | 동일 | PASS |
| CANCELLED → cancel | 예외 | 동일 | PASS |
| CANCELLED + 편집 | 불변 | `expireForContentVersion`: `status != PENDING → false` | PASS |
| CANCELLED + 마감 경과 | 불변 | `expireIfDue`/`isDueForExpiry`: `status == PENDING` 게이트 | PASS |
| CANCELLED + sweep | 불변 | `expireDueAll`이 `isDueForExpiry` 확인 후 진행 | PASS |
| dedupeKey | closed 취급 | `dedupeKey()`: `PENDING ? "open:scope" : "closed:id"` → 같은 대상 새 요청 생성 가능 | PASS |
| restore 왕복 | CANCELLED 유지 | 도메인 테스트에서 status·마지막 이벤트 타입 확인 | PASS(부분, §5-13) |
| 락 규율 | 요청별 락 | `cancel` = `withRequestLock` → `withTargetLock`(기존 `expireInLock`과 동일 스코프) | PASS |

도메인 테스트 커버리지: 위 표의 5개 전이 + 편집/마감 불변 + restore + 메모 정규화 = 4개 신규 테스트로 커버.
누락: actorKey null/blank 거부, CANCELLED 이벤트 reason의 restore 왕복.

## 2. 치명 (Blocker) — 배포 불가

### B1. c9 빌드 RED
위 §0. `ApprovalRegionMacroSettingsCacheTest:28`의 기대값 13 → 14로 수정.
(단순 수정이지만 "완료 기준 자가 검증" 미이행의 증거다.)

### B2. 관리자 설정 저장이 전면 파손
`ApprovalRestResource.updateSettings`에 `@QueryParam("cancelledLabel")`을 추가하고
`|| blank(cancelledLabel)` 검증까지 넣었는데, 이 엔드포인트의 유일한 호출자인
`ApprovalSettingsServlet`(line 291~306) JS는 `cancelledLabel`을 보내지 않는다.
→ **관리자 화면의 모든 "설정 저장"이 400 → "입력값을 확인해 주세요."**
6b UI 배치까지 관리자가 어떤 설정도 저장할 수 없다.

재작업 지시(둘 중 하나, 6a 범위에선 (a) 권장):
- (a) `cancelledLabel`을 선택 파라미터로: blank면 `approvalSettings.read().statusLabel("CANCELLED")`로 대체하고 필수 검증 목록에서 제외.
- (b) 서블릿에 `label-cancelled` 입력과 `cancelledLabel` 파라미터를 지금 추가(=6b 선반영).

### B3. 요청 메모가 REQUESTED 이메일에 "반려 사유:"로 찍힌다
`EmailNotificationChannel`은 reason 슬롯을 `expiry ? null : event.reason()`으로 채운다.
6a부터 REQUESTED 이벤트의 reason이 **요청 메모**이므로, REQUESTED 메일에서
`appendKoreanBody`의 `if (reason != null) body.append("반려 사유: ")` 가지에 그대로 걸린다.

실제 출력(메모 "검토 부탁드립니다."):
```
처리자: 홍길동
반려 사유: 검토 부탁드립니다.      ← 오류
요청 메모: 검토 부탁드립니다.      ← 중복
```
스펙 §2 "기존 reason 자리와 구분"과 정면으로 어긋나며, 삭제된 가드 주석
("만료 사유는 반려 사유가 아니다")이 경고하던 사고의 재발이다. 영문 본문도 동일
("Rejection reason:" + "Request message:").

재작업 지시: 채널에서 reason 슬롯 계산을
`expiry || event.type() == REQUESTED ? null : event.reason()`로 좁히고,
"REQUESTED 메일에는 반려 사유 줄이 없다"를 검증하는 테스트를 `ApprovalNotificationTest`에 추가.

### B4. 자기닫힘 매크로가 영역을 통째로 삼켜 정상 요청이 자동 취소된다
`ApprovalRegionSupport.macroBlocks`는 `</?ac:structured-macro\b[^>]*>`를 훑으며 여는 태그를 스택에
push하는데, **자기닫힘 태그 `<ac:structured-macro ... />`도 여는 태그로 push**한다. Confluence는
파라미터만 있는 매크로를 자주 자기닫힘으로 저장한다(children, toc, anchor, excerpt-include 등).

실측(컴파일된 `ApprovalRegionSupport`에 직접 입력):
```
입력: <approval-region key=spec><rich-text-body><p>본문</p>
        <ac:structured-macro ac:name="children" ac:schema-version="2" ac:macro-id="x"/>
      </rich-text-body></approval-region>
regionBodies -> {}            ← 영역이 사라짐
```
연쇄 결과:
- 리스너: `regionBodies.get(regionKey) == null` → **`cancel(..., "system", "REGION_REMOVED")`**.
  즉 영역이 멀쩡히 있는데 페이지를 한 번 저장하면 진행 중인 승인 요청이 말없이 회수된다(데이터 파괴).
- REST `stale`: 같은 이유로 항상 true.
- `hasDuplicateKey`: 같은 스택을 쓰므로 중복 경고도 오작동 가능(기존 정규식은 이 케이스에 강했다 —
  기존 기능의 회귀).

재작업 지시:
1. `macroBlocks`에서 `tag.endsWith("/>")`인 태그는 push/pop 대상에서 제외.
2. 회귀 테스트 3종 추가: (a) 영역 본문 안 자기닫힘 매크로, (b) 영역 앞 자기닫힘 매크로,
   (c) 자기닫힘 + 중첩 매크로 혼재 시 중복 key 판정.
3. 방어: 리스너의 REGION_REMOVED 취소는 "파싱 성공 + key 부재"에서만 일어나야 한다.
   `regionBodies`가 빈 map이고 storage에 `approval-region` 문자열이 있으면 취소하지 말고 유지(또는
   기존 버전 만료 폴백)하도록 안전장치를 넣을 것.

## 3. 주의 (Major)

### M1. 업무함 타임라인이 메모를 "사유: {메모}"로 렌더 (경계면 회귀)
`ApprovalInboxServlet` JS `reasonText(x)`는 `x.type !== "EXPIRED"`이면 `"사유: " + x.reason`을
돌려준다. REQUESTED 이벤트에 reason이 채워지기 시작했으므로 타임라인에 "사유: 검토 부탁드립니다."로
나온다. 또 `eventLabel`에 CANCELLED가 없어 회수 이벤트가 원문 `CANCELLED`로 표시된다.
(패널·매크로의 `ApprovalMarkup.appendTimeline`은 접두사 없이 reason만 출력하므로 무해.)
→ 6a에서 최소한 `reasonText`에 `if (x.type === "REQUESTED") return "요청 메모: " + x.reason;`,
`eventLabel`에 `CANCELLED: "회수"`를 추가할 것(6b 대기 시 6a 기간 내내 이상하게 보인다).

### M2. 리스너가 도메인 예외에 무방비 — 페이지의 나머지 요청 처리 중단
`onPageUpdate` 루프는 PENDING 판정을 락 밖에서 하고 락 안에서 다시 읽는다. 그 사이에 요청이
마감되면 `workflowService.cancel`은 `APPROVAL_ALREADY_CLOSED`를, 요청이 삭제되면
`expireForContentVersion`은 `APPROVAL_NOT_FOUND`를 **던지고**, 예외가 `PageUpdateEvent` 리스너
밖으로 나가면서 같은 페이지의 남은 요청은 처리되지 않는다. 기존 `expireForPageVersion`은
predicate 반환값으로 처리해 던지지 않았다(회귀).
→ 요청 단위로 `try { ... } catch (ApprovalException | RuntimeException e) { log; continue; }` 감쌀 것.

### M3. 지시 외 변경 — EmailNotificationMessage 문구 재작성 + 가드 주석 삭제
스펙에 없는 변경:
- "승인이 끝난 뒤 페이지가 수정되어..." → "승인 완료 후 페이지가 수정되어...", "승인됐던 버전" →
  "승인된 버전", "승인이 진행되는 중에..." → "승인 진행 중..." (사용자 노출 문구 3건 무단 수정)
- 클래스 javadoc 재작성 + 주석 3개 삭제: **"만료 사유는 반려 사유가 아니다..."(B3의 재발 방지
  주석)**, "만료 사유 문자열. domain의 감사 사유 값을 그대로 쓴다.", "만료 정보가 없는 기존 호출 경로용이다."
- subject 삼항 3줄 → 1줄 병합(재포매팅)
→ 문구·주석은 원상 복구하고, 삭제한 가드 주석에 "요청 메모도 반려 사유 자리에 넣지 않는다" 한 줄을 덧붙일 것.

### M4. c9 테스트 미작성
스펙 "관련 테스트"에도 불구하고 신규 c9 테스트는 `ApprovalRegionSupportTest` 3건뿐이다.
0건인 영역: 취소 REST 권한 3케이스(본인/관리자/제3자), CANCELLED 수신자 규칙(system 취소 포함),
CANCELLED·요청 메모 이메일 본문, 리스너 3분기(유지/만료/제거→취소), regionHash 저장 조건.
→ 최소 (a) `NotificationRecipientResolver` CANCELLED 2케이스, (b) 이메일 본문 CANCELLED/REQUESTED
2케이스, (c) 리스너 분기 3케이스(리포지토리·워크플로 fake)를 추가할 것.

## 4. 경미 (Minor)

- **m1** `stale()`이 CONTENT_REGION+해시면 **상태와 무관하게** 해시 비교를 한다. EXPIRED/REJECTED/
  CANCELLED 행도 `stale=true`가 된다. 현재 소비처(`ApprovalInboxServlet` line 384)가
  `status === "APPROVED" && stale === true`로 막아 무해하지만, 6b가 `stale`을 그대로 쓰면 오작동한다.
  → PAGE 분기와 의미를 맞추거나 필드명을 분리(`regionStale`)할 것.
- **m2** N+1: `requestsJson`은 `getBodyAsString`만 페이지 단위로 캐시하고 `regionBodies()` 파싱은
  요청마다 반복한다(스펙 "페이지당 1회 캐시"의 취지 미달). 리스너도 요청마다 `findRegionHash` 단건
  쿼리 — 이미 있는 `findRegionHashes(ids)` 배치를 쓸 것.
- **m3** `cancel()`은 `decide()`와 달리 `expireIfDue`를 선행 호출하지 않아, 마감이 지난 PENDING이
  EXPIRED가 아니라 CANCELLED로 마감된다. 의도라면 주석으로 남길 것.
- **m4** CDATA 안에 `</ac:structured-macro>` 문자열이 있으면 영역 본문이 잘린다(실측: default 본문이
  빈 문자열). 기존 한계지만 이제 자동 취소와 연결돼 위험도가 올라갔다 — 최소한 B4의 안전장치로 완화.
- **m5** ` `(nbsp)는 정규화 대상이 아니라 편집기 왕복에서 해시가 흔들릴 수 있다. "과도 정규화
  금지" 원칙과 상충하므로 이번엔 유지하되 6b 실사용에서 관찰할 것.

## 5. PASS 확인 항목 (동작 추론 완료)

- 도메인: CANCELLED 상태/이벤트, cancel 전이표 전부(§1), 만료 3경로 불변, dedupeKey closed 취급,
  `withRequestLock`(=대상 락) + save.
- 요청 메모 도메인: `create/createSequential` 오버로드가 기존 시그니처에 위임(호출부 호환) →
  `created()`가 REQUESTED 이벤트 reason으로 저장, blank→null·trim, `requestMessage()`는 첫 REQUESTED
  이벤트 reason 반환. restore는 이벤트로 자동 복원.
- REST create: `requestMessage` trim·500자 초과 400("요청 메모는 500자 이하"), `requestObject`에
  `requestMessage` 노출, `regionHash`는 `CONTENT_REGION && !blank`일 때만 `saveRegionHash`.
- 취소 REST: `denyPage(VIEW)` → `denyCurrent(actorKey)` 순서가 `decide()`와 동일, requesterKey를
  `userKey(user)`와 `user.getName()`(대소문자 무시) 양쪽에 매칭, `isAdministrator()` 우회,
  제3자 403 + 지정 문구, reason 선택적, NOT_FOUND 404 / ALREADY_CLOSED 409 / 잘못된 UUID 400.
  `denyCurrent`가 미로그인·blank actorKey를 먼저 걸러 이후 `user` NPE 없음.
- 알림 수신자(CANCELLED): 미결정 승인자 + (취소자≠요청자면) 요청자, 마지막에 `remove(actorKey)`.
  `actorKey="system"`은 도메인 검증(비어있지 않음) 통과하고 requesterKey와 다르므로 요청자에게
  정상 통지된다. requesterKey null 레거시도 `add()`의 blank 가드로 안전.
- 리스너 분기: (a) PAGE는 기존 `expireForContentVersion` 그대로, (b) 해시 없는 CONTENT_REGION은
  기존 버전 만료 폴백, (c) 해시 동일 시 유지 — 모두 스펙대로. `regionBodies`는 이벤트당 1회 파싱.
- 영역 해시: 공백만 정규화(태그 보존 — 과도 정규화 없음), SHA-256 앞 16바이트 hex 32자,
  중복 key는 문서 앞쪽 첫 번째 채택(실측 확인), 중첩 매크로 본문 추출(자기닫힘 제외 시) 정상.
- 저장: `REGION_HASH` nullable `@StringLength(64)` + adapter 전용 `saveRegionHash`/`findRegionHash(es)`
  (saveFlowId 패턴), aggregate 오염 없음.
- 설정: `read()` 기본 라벨 "회수", `save()`는 map 순회라 자동 반영, `/mine`의
  `ApprovalStatus.valueOf(status.toUpperCase())`가 CANCELLED 수용.
- 위생: `git diff --check` 클린, NUL·원시 제어문자 없음, 신규 코드에 200자 초과 라인 없음
  (ApprovalMarkup의 장문 라인은 기존 CSS/SVG 상수), 5a 자산(viaGroups 평탄화·fromRequestId·
  savePrevRequestId) 코드 무변경 + `StepRestorationTest` 5건 green.

## 6. 재작업 지시 요약 (우선순위 순)

1. B4 자기닫힘 매크로 파서 수정 + 리스너 취소 안전장치 + 회귀 테스트 3종. (데이터 파괴)
2. B2 `cancelledLabel` 선택 파라미터화(또는 서블릿 동시 수정). (관리자 기능 전면 파손)
3. B3 REQUESTED 이벤트를 reason 슬롯에서 제외 + 테스트. (오발신 메일)
4. B1 `ApprovalRegionMacroSettingsCacheTest` 13→14, **§0의 절차로 c9 테스트 green 확인 후 보고**.
5. M2 리스너 요청 단위 예외 격리.
6. M1 `reasonText`/`eventLabel`에 REQUESTED 메모·CANCELLED 라벨 처리.
7. M3 EmailNotificationMessage 문구·주석 원복(가드 주석은 요청 메모까지 포함해 보강).
8. M4 c9 테스트 보강(수신자·이메일·리스너 분기).
9. m1~m5 검토 후 반영.
