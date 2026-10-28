# QA 배치 6a 재작업 — 재검증 (2차)

- 기준 커밋: 2b894ed + 미커밋 워킹트리
- 검증자: approval-qa (독립 검증, Codex 보고 미신뢰)
- 판정: **FAIL** (치명 2, 주의 5, 경미 4 / 1차 13건 중 6건 미해소)

## 0. 빌드 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
```

| 모듈 | 결과 |
|------|------|
| approval-domain | **SUCCESS — 52 tests** (기대 52+ 충족) |
| approval-confluence9 | **BUILD FAILURE — main 소스 컴파일 실패, 테스트 0건 실행** |

```
ApprovalRestResource.java:[296,61] local variables referenced from a lambda expression
must be final or effectively final
```
`calculatedRegionHash`(179행)가 `inTargetLock` 람다(296행) 안에서 쓰이는데 effectively final이 아니다.
**Codex는 이번에도 c9 빌드를 한 번도 돌리지 않았다** (1차 B1과 동일 유형의 재발, 3회 연속).

검증을 위해 워킹트리를 건드리지 않고 스크래치패드에 소스 사본을 만들어 이 한 줄만 고쳐
(`final String regionHashToSave = calculatedRegionHash;`) 다시 돌렸다:

```
approval-domain      Tests run: 52, Failures: 0, Errors: 0
approval-confluence9 Tests run: 59, Failures: 0, Errors: 0   (기대 59+ 충족)
BUILD SUCCESS
```
→ 빌드를 막는 결함은 이 한 줄뿐이다. 다만 **현재 워킹트리 상태로는 컴파일조차 되지 않으므로
치명(배포 불가)이다.** 테스트 수는 도메인 52(+4), c9 59(+3, ApprovalRegionSupportTest 9→12).

## 1. 1차 FAIL 13건 판정표

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| B1 | `ApprovalRegionMacroSettingsCacheTest` 13→14 | **RESOLVED** | 14로 갱신 + 사유 주석. 사본 빌드에서 green |
| B2 | `cancelledLabel` 필수화로 설정 저장 파손 | **RESOLVED** | `blank → approvalSettings.read().statusLabel("CANCELLED")`, 필수 검증 목록 제외. `ApprovalSettingsServlet` JS 무변경으로 13개 파라미터 호출도 200. 8-arg 내부 오버로드도 현재값 전달로 갱신, `ApprovalRestResourceSettingsTest` 통과 |
| B3 | REQUESTED 메일 "반려 사유: {메모}" | **PARTIAL** | 코드는 해결(`rejected ? reason : null`, 요청 메모는 REQUESTED 이벤트에서만 전달). 그러나 **스펙이 명시한 "REQUESTED 메일에 '반려 사유' 부재" 테스트가 없다**(`ApprovalNotificationTest` 무변경). 게다가 이 수정이 신규 결함 N3을 만들었다 |
| B4 | 자기닫힘 매크로가 영역을 삼킴 | **RESOLVED(핵심)** | 실측 확인(§2). 설계 §D 깊이 인식 스캐너로 교체됨. 단 세부 4건 미준수(§3 N4·N5·N6, §4 m1) |
| M1 | 업무함 타임라인 "사유: {메모}" / CANCELLED 라벨 | **RESOLVED** | `reasonText`에 REQUESTED 분기, `eventLabel`에 `CANCELLED: "회수"` |
| M2 | 리스너 도메인 예외 무방비 | **RESOLVED** | 요청 단위 `try/catch (RuntimeException)` + warn 로그 + 계속 진행. `ApprovalException extends RuntimeException` 확인 |
| M3 | 지시 외 문구·주석 변경 원복 | **NOT RESOLVED** | "승인 완료 후 페이지가 수정되어", "승인된 버전", "승인 진행 중 페이지가…" 3건 그대로. 삭제된 주석 2개(`만료 사유 문자열…`, `만료 정보가 없는 기존 호출 경로용이다`)도 미복원, 클래스 javadoc 재작성·subject 삼항 병합도 유지. 가드 주석은 기존 줄 아래에 한 줄 추가되어 **의미가 겹치는 주석 2줄**이 됐다 |
| M4 | c9 테스트 보강 | **NOT RESOLVED** | 신규 c9 테스트는 `ApprovalRegionSupportTest` 3건뿐. 요구된 (a) `NotificationRecipientResolver` CANCELLED, (b) 이메일 본문 CANCELLED/REQUESTED, (c) 리스너 3분기 — **모두 0건**. 취소 REST 권한·regionHash 저장 조건도 0건 |
| m1 | `stale()`이 상태와 무관 | **NOT RESOLVED (악화)** | 신규 `stale(...)`은 CONTENT_REGION+해시면 **상태 게이트 없이** 해시만 비교한다. 설계 §D-7은 `status == APPROVED && (hashKnown ? 해시비교 : 버전폴백)`. 접두사 확인도 없어 v0 해시는 무조건 stale=true(폴백 없음), 파싱 실패도 stale=true(fail-safe 아님) |
| m2 | N+1 (해시 조회·본문 파싱) | **PARTIAL** | 리스너는 `findRegionHashes(ids)` 배치로 해결. `requestsJson`은 `getBodyAsString`만 페이지당 캐시하고 `regionBodies()` 파싱은 여전히 **요청마다** 반복(설계 "페이지당 1회 스캔" 미달) |
| m3 | `cancel()`이 `expireIfDue` 미선행 | **NOT RESOLVED** | 주석 없음. 마감 지난 PENDING이 EXPIRED가 아니라 CANCELLED로 마감되는 동작이 문서화되지 않았다 |
| m4 | CDATA 안 `</ac:structured-macro>` | **RESOLVED** | 실측: CDATA를 토큰화 전에 건너뛰어 본문이 잘리지 않는다 |
| m5 | `&nbsp;` 미정규화 | **해당 없음(의도 유지)** | 1차 결론대로 유지. 실측상 엔티티는 그대로 보존 |

**미해소: 6건** (NOT RESOLVED 4 + PARTIAL 2)

## 2. 스캐너 실측 (컴파일 후 직접 실행, 설계 §D 대조)

`ApprovalRegionSupport`를 도메인 클래스와 함께 컴파일해 probe 실행:

| 입력 | 결과 | 판정 |
|------|------|------|
| 영역 본문 안 자기닫힘 매크로(`children`) | `{spec=<p>본문</p><ac:structured-macro ac:name="children"/>}` | **정상** (1차 데이터 파괴 해소) |
| 영역 앞 자기닫힘 매크로(`toc`) | 동일 해시로 정상 추출 | 정상 |
| 본문 있는 중첩 매크로 뒤 텍스트 | `…</ac:structured-macro><p>tail</p>` 끝까지 추출 | 정상 (non-greedy 절단 해소) |
| CDATA 안에 `</ac:structured-macro>` 리터럴 | 잘리지 않음 | 정상 (m4) |
| 따옴표 안의 `>` (`data-x="a>b"`) | 태그 종료로 오인 안 함 | 정상 |
| 대문자 태그 + 홑따옴표 `ac:name` | 인식 | 정상 |
| CDATA 미종료 (구조 파손) | `Optional.empty()` | 정상 (파싱 실패 구분) |
| 영역 자체가 없는 페이지 | `Optional.of({})` | 정상 (진짜 부재) |
| **`</ac:rich-text-body>`·`</ac:structured-macro>` 미종료** | **`Optional.of({})`** — 실패인데 "부재"로 보고 | **불일치** (§D 스캐너 5-6: 구조 파손은 `Optional.empty()`) |
| 공백/줄바꿈 변형, 신원 속성(macro-id/schema-version) 변형 | 같은 해시 | 정상 (N1·N2·N3·N4·N5) |
| `<br></br>` vs `<br/>` | **다른 해시** | **N6 미구현** |
| CDATA 안 `a   b` vs `a b` | **같은 해시** | **§D-3 위반** (CDATA 내부 공백 정리 금지) |
| `&lt;script&gt;` vs `<script>` | 다른 해시 | 정상 (엔티티 디코딩 안 함) |
| 해시 형식 | `v1:` + 64 hex = **67자** | 접두사 O, 길이는 N1 참조 |

**"영역 부재 → 자동 취소" 가드**: 리스너는 `regionHashes()`의 `Optional`로 파싱 실패(→버전 폴백),
저장 해시 null(→버전 폴백), 접두사 불일치(→버전 폴백)를 모두 구분하고, **스캔 성공 + key 부재**에서만
`cancel(system, REGION_REMOVED)`를 호출한다. 설계 §D-6과 일치 — 다만 위 "미종료 태그" 케이스에서는
스캐너가 실패를 부재로 보고하므로 이 가드가 뚫린다.

## 3. 신규 발견 (재작업이 만든 결함)

### N1. 치명 — `REGION_HASH` 컬럼이 해시보다 짧다 (저장 실패/절단)
`ApprovalEntity`: `@StringLength(64) String getRegionHash()`.
실제 값은 `"v1:" + SHA-256 64 hex` = **67자**. 설계 §D-4는 `@StringLength(80)`을 명시했다.
AO는 VARCHAR(64)로 컬럼을 만들므로 CONTENT_REGION 요청 생성 시 `saveRegionHash`가 DB 오류로
실패하거나(백엔드에 따라) 67→64 절단되어 **이후 모든 비교가 불일치 → 저장할 때마다 EXPIRED**가 된다.
단위 테스트로는 절대 잡히지 않는(AO 미기동) 종류의 결함이다. → `@StringLength(80)`.

### N2. 치명 — c9 main 컴파일 실패
§0. `ApprovalRestResource:296`. 람다 밖에 `final` 사본을 두고 그 값을 쓸 것.

### N3. 주의 — 회수 메일에 "회수 사유"가 절대 찍히지 않는다
B3 수정으로 채널의 reason 슬롯이 `rejected ? … : null`이 됐는데,
`EmailNotificationMessage`의 CANCELLED 분기는 `if (reason != null) body.append("회수 사유: ")`를 본다.
CANCELLED 이벤트는 `rejected == false`이므로 **reason이 항상 null** → 회수 사유 줄은 죽은 코드다.
(REST `cancel`은 reason을 받고 도메인은 이벤트에 저장하는데 메일에만 안 나온다.)
→ 채널에서 CANCELLED 이벤트의 reason도 전달하되(별도 슬롯 권장) REJECTED 자리와는 분리할 것.
같은 이유로 §M4의 "이메일 본문 CANCELLED 테스트"가 있었다면 즉시 잡혔을 결함이다.

### N4. 주의 — `stale()`이 `regionBodies()`(중복 key는 첫 영역만)로 재계산해 저장 해시와 체계가 다르다
저장·리스너는 `regionHashes()`(같은 key 영역 전부를 `\u0000`으로 이어 붙여 1회 해시)를 쓰는데,
`ApprovalRestResource.stale()`만 `regionBodies()`(putIfAbsent = 첫 영역만)로 뽑아 다시 해시한다.
실측: 단일 영역은 일치(정규화 멱등), **중복 key 페이지는 항상 불일치 → APPROVED 요청이 영구 stale**.
→ `stale()`도 `regionHashes()` 결과를 쓰고, 결과를 페이지당 1회만 계산할 것(m2와 함께 해결).

### N5. 경미 — 코드 스타일 "압축 금지" 위반
`ApprovalRegionSupport`의 `tokens()`, `tagEnd()`, `hashNormalized()`, `collapse()`, `Token.parse()`가
중괄호 없는 한 줄 `if`/`for`/`else`와 여러 statement 한 줄 결합으로 작성됐다(255행은 237자).
`ApprovalPageUpdateListener`는 `java.util.UUID`, `org.slf4j.LoggerFactory`를 개별 import 없이
본문에 FQN으로 박았다. 둘 다 스펙의 "개별 import, statement 한 줄, 중괄호, 압축 금지" 위반.

### N6. 경미 — 사용되지 않는 신규 API
`ActiveObjectsApprovalRequestRepository.findRegionHash(UUID)` 단건 조회는 호출부가 없다(배치 조회로 대체됨).

## 4. 회귀 스팟 체크 (1차 PASS 항목)

| 항목 | 결과 |
|------|------|
| CANCELLED 전이표(도메인) | 무변경. 도메인 52 tests green(회수 4건 포함: 감사 이벤트·마감 4상태 거부·편집/마감 불변+restore·요청 메모 정규화) |
| 취소 REST 권한 | 무변경. `denyPage(VIEW)` → `denyCurrent(actorKey)` → 요청자(userKey/username 대소문자 무시) 또는 관리자, 제3자 403, NOT_FOUND 404 / ALREADY_CLOSED 409 / 잘못된 UUID 400 |
| dedupeKey | 무변경. `PENDING ? "open:scope" : "closed:id"` → CANCELLED는 closed 취급, 같은 대상 재요청 가능 |
| stale 정밀화 / 페이지당 캐시 | **회귀 있음** — N4·m1·m2 참조. PAGE 경로 의미는 그대로 유지됨 |
| 5a 자산(StepRestorationTest 등) | 사본 빌드에서 59건 전부 green |
| 알림 수신자 CANCELLED | 미결정 승인자 + (취소자≠요청자면) 요청자. `add()` blank 가드로 레거시 null 안전. 테스트는 여전히 0건(M4) |

## 5. 위생·범위

- `git diff --check` 통과. 변경된 .java 18개에 NUL·원시 제어문자 0. 신규 코드 200자 초과 라인 없음
  (`ApprovalMarkup`의 장문은 기존 CSS/SVG 상수).
- 지시 외 코드 변경: 없음(6a 범위 파일만 수정). M3의 문구·주석 변경은 **1차에서 지적한 지시 외 변경이
  그대로 남아 있는 것**이라 신규는 아니다.
- 저장소 기타 변경: `CLAUDE.md`, `.claude/skills/approval-dev/SKILL.md`, `docs/features.md`,
  `docs/requirements-cjlbiovault-2026-08-12.md` — 타임스탬프(13:15~13:16)가 재작업(13:42~13:52) 이전이며
  하네스·문서 갱신 건이다. 6a 재작업의 지시 외 변경이 아니다.
- 참고: `_workspace/design-batch6.md` 43261바이트 위치에 NUL 1개가 있다(설계 §D-1 5항의 "정규화 결과를
  `\0`으로 이어 붙인다"를 리터럴 NUL로 쓴 것). 코드가 아니라 무해하지만 문서 도구가 binary로 인식하므로
  다음 편집 때 `\u0000` 표기로 바꿀 것.

## 6. 재작업 지시 (우선순위)

1. **N2** `ApprovalRestResource:296` 컴파일 오류 수정 후 **`mvn -pl approval-confluence9 -am test`를 직접 실행해 green 확인**. (3회 연속 미이행)
2. **N1** `ApprovalEntity.getRegionHash()` `@StringLength(80)`.
3. **N3** 회수 메일에 회수 사유가 나오도록 채널의 이벤트 타입 분기 보강 + 테스트.
4. **B3 테스트** REQUESTED 메일 본문에 "반려 사유" 부재 검증(`ApprovalNotificationTest`).
5. **N4·m1·m2** `stale()`을 `regionHashes()` 기반으로 통일 + `status == APPROVED` 게이트 + 접두사 불일치/파싱 실패 시 버전 폴백 + 페이지당 1회 스캔 캐시. (설계 §D-7 그대로)
6. **B4 잔여** 스캐너: 미종료 구조는 `Optional.empty()`, N6(빈 요소 표기) 정규화 추가, CDATA 내부는 공백 정규화 대상에서 제외(§D-3).
7. **M4** c9 테스트 보강: 리스너 3분기(유지/만료/부재→취소) + 파싱 실패 폴백, CANCELLED 수신자 2케이스, 이메일 CANCELLED/REQUESTED 2케이스, v0 접두사 폴백.
8. **M3** 이메일 문구 3건·주석 2개 원복(가드 주석은 한 줄로 정리), subject·javadoc 원복.
9. **N5** 압축된 코드 풀고 개별 import로 정리. **m3** `cancel()`의 만료 미선행 의도 주석. **N6** 미사용 메서드 제거.
