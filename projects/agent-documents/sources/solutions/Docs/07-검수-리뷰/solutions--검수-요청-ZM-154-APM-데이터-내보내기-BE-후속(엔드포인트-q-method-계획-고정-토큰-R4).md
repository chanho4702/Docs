# 검수 요청 — ZM-154 APM 데이터 내보내기 BE 후속(엔드포인트 q·method · 계획 고정 토큰 · R4)

- 요청: Claude · 2026-09-28
- 검수 대상: BE `moveseye-be-spring` 워크트리 **`C:\worktrees\zm-154-be-followup`**(브랜치 `ZM-154-followup-be`, master `3f731d5` 기준) — **미커밋 변경**(`git -C C:\worktrees\zm-154-be-followup diff` + 신규 4파일: `ApmExportPlanToken`·`ApmEndpointFilter`와 각 테스트)
- 🔴 FE 무수정. FE 후속(`review_zm-154-fe-followup.md`, F6·AbortController)은 별개 작업이라 대상 아님.
- 이전 검수: [`review_zm-154-apm-data-export.md`](%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-154-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%28CSV-JSONL%29-BE-FE.md) — 이번 건은 그 **BE R1(=FE R2) 잔여(보존 경계 재승격)** · **BE R4** · FE 보고 "계약 차이 #3"(엔드포인트 검색어·메서드 미반영)
- 계약: `_workspace/contract_apm-data-export.md` **§v2** · 작업 보고: `_workspace/reports/zm-154_be-followup.md`

## 범위

| 층 | 변경 |
|---|---|
| 공유 술어 (신규) | `service/red/ApmEndpointFilter` — 트랜잭션 표의 인라인 `q`/`method` 필터를 추출. `ApmSeriesQueryService.endpoints`가 이것으로 교체(동작 불변 주장) |
| 토큰 (신규) | `export/ApmExportPlanToken` — `v1.<payload>.<mac>` HMAC-SHA256, 키 = `HMAC(JWT_SECRET, "moveseye/apm-export/plan-token/v1")`, 요청 지문 = 파라미터 전체 SHA-256(길이 접두), 서버 저장 없음 |
| 요청 | `ApmExportRequest` — 컴포넌트 `method`·`requestedToMs`(자르기 전 `to`)·`pin`(검증된 Claims) 추가, v1 생성자·`parse` 오버로드 유지, `resolution()`(pin 우선, 없으면 기존 `choose`), `method`는 endpoints 전용·≤32자 |
| 조율 | `ApmExportService` — `parse(…, method, …, planToken)`에서 토큰 검증 후 `pinned()` · 계획 응답에 토큰 발급 · 다운로드·계획 모두 `requireSameWindow`(pin의 fromMs/toMs/step과 원천 계획 비교, 본문 전) · 필터 note · JSONL `_meta`에 `q`·`method`·`planPinned` · 감사 로그 |
| 웹 | `ApmExportController` — `method`(두 EP)·`planToken`(다운로드만) · `ApmExportPlanDto` 필드 4개 추가(맨 뒤) · `ApmExportProperties.planTokenTtlSeconds`(기본 1,800) · yml 1줄 |
| 원천 | `ApmEndpointExporter`(필터 적용·`request.resolution()`) · `ApmRedSeriesExporter`(`request.resolution()`) |
| 테스트 | `ApmEndpointFilterTest` 5 · `ApmExportPlanTokenTest` 10 · `ApmExportRequestTest` +2 · `ApmExportIT` +2(필터 모집단·토큰 왕복) + R4 단언 |

## 의도 (선택한 설계 · 버린 대안)
- **SQL이 아니라 술어를 공유**: 트랜잭션 표의 필터는 합산 뒤 자바에서 건다(정렬 키가 히스토그램 계산값이라). 지시의 `windowFilter()` 방식(공유 단위 추출)을 술어에 적용. 버린 대안: 내보내기용 SQL `ilike` 조건 — 표와 모집단이 갈라질 수 있고(`__other__`·method 부분일치 규칙) SQL 복제 금지 지시에도 어긋남.
- **`method`는 타 데이터셋에서 거절**(무시하지 않음) — "걸렀다고 믿은 전량 파일" 방지. `q`의 `red-series` 무시는 v1 거동이라 유지.
- **HMAC 서명 토큰**. 버린 대안: Redis TTL 캐시(다중 노드 공유 필요·계획마다 쓰기·축출 시 오만료).
- **고정 = 창 끝(자르기 후·칸 올림 전) + 해상도만**. 데이터·coverage·보존 판정·exportedAt은 다운로드 시점. 버린 대안: 요청 `nowMs` 전체를 계획 시각으로 동결 — 그 사이 보존 배치가 지운 칸을 DATA 구역으로 오표기할 수 있음.
- **계정 식별자 미포함 · 타 사용자 재사용 허용** — 토큰은 권한을 주지 않음(권한은 매번 재판정), 남의 토큰으로 얻는 건 자기 계획으로도 얻는 정보.
- **새 errorCode 없음** — 형식·서명·만료·불일치 전부 `APM_EXPORT_INVALID`(message로 구분), FE 처리는 재계획 하나.
- `ApmExportProperties`에 보조 생성자를 두지 않음(`@ConfigurationProperties` 레코드 바인딩 생성자 모호성) → 테스트 2곳 4인자로 수정.

## 중점 확인 요청
1. **`ApmSeriesQueryService.endpoints` 동작 불변** — 인라인 필터(`q` trim·lowercase·route/method contains, `method` trim·equalsIgnoreCase, AND)와 `ApmEndpointFilter`가 모든 입력에서 같은가(null route/method 처리 포함). `otherRoutes`가 여전히 필터 **전**에 세지는가.
2. **같은 모집단** — 내보내기는 route×method 그룹 **키**에 필터를 걸고 표는 합산된 **행**에 건다. 두 순서가 결과 집합을 바꾸지 않는가. IT의 4조건(`ORD`·`post`·`cmd`+`GET`·`o`) 비교가 이 주장을 충분히 고정하는가.
3. **토큰이 재승격을 실제로 막는가** — `request.resolution()`을 거치지 않고 `ApmResolution.choose`를 직접 부르는 원천 경로가 남아 있지 않은가(에러 그룹은 H1 고정이라 제외). `ApmExportPlanTokenTest.pinsResolutionAcrossRetentionBoundary`가 운영 원천과 같은 입구로 재현하는가(가짜 원천의 칸 계산이 `ApmExportGrid`와 달라도 판정에 영향이 없는가).
4. **토큰 창 끝의 선택** — Claims `plannedToMs`에 `request.toMs()`(칸 올림 전)를 넣었다. 다운로드가 같은 값으로 `ceil`해 `plan.toMs`와 같아지는지(RED·엔드포인트), 에러 그룹(`ApmTimeRange.between`)에서도 같은지. `requireSameWindow`가 정상 경로에서 거짓 거절을 낼 수 있는 경우가 있는가.
5. **지문 범위** — 파일 내용을 좌우하는 파라미터가 빠짐없이 들어갔는가(`dataset`·`from`·보낸 그대로의 `to`·`step`·`service`·`q`·`method`·`format`·`gzip`·`rawText`). 파일명·Content-Type이 계획과 달라질 수 있는 조합이 지문을 통과하는가. `q`는 trim 후 값인데 표기 차이(`" a"` vs `"a"`)를 같은 요청으로 보는 게 맞는가.
6. **검증 순서** — 토큰 검증이 `parse`(본문 전)에서 끝나고, 만료·서명·불일치가 전부 HTTP 200 + JSON `APM_EXPORT_INVALID`로 나가며 `Content-Disposition`이 없는가. 판정 순서(라이선스 → `apm.view` 403 → 파라미터·토큰 400 → 원문 403 → 429 → 상한)가 정보 노출 없이 성립하는가.
7. **서명 구현** — `MessageDigest.isEqual` 상수 시간 비교, 서명 확인 전 payload 해석 없음, base64url 디코드 실패·필드 수 부족·숫자 파싱 실패·512자 초과가 전부 예외 누수 없이 INVALID인가. 키 파생 라벨의 용도 분리가 JWT(`Algorithm.HMAC256(secret)`)와 충돌하지 않는가.
8. **계정 미포함 판단** — 타 사용자 토큰 재사용이 정말 무해한가(비관리자가 관리자 계획의 `rawText=true` 토큰을 쓰면 원문 판정에서 403인지 — `viewFor`는 토큰과 무관한가).
9. **호환** — 토큰 없는 다운로드·v1 파라미터만 쓰는 요청이 v1과 같은 응답인가(계획 DTO에 필드 4개 추가 외). JSONL `_meta` 키 추가를 `schemaVersion` 1로 유지한 판단이 계약("열을 바꾸면 올린다")과 맞는가.
10. **감사 로그** — 검색어 원문 대신 유무만 남긴 판단, `method`는 원문 기록(짧고 사용자 입력 폭이 작음)이 적절한가.
11. **테스트가 위를 고정하는가** — 특히 1·3·4·6·7.

## 검증 현황
- ✅ 컴파일(main·test) 성공.
- ✅ 대상 단위 67건 통과(fail 0 · skip 0) — `ApmExportPlanTokenTest` 10 · `ApmEndpointFilterTest` 5 · `ApmExportRequestTest` 14 · `ApmExportServiceTest` 15 · `export.source.*` 16 · `service.red.*` 기존 7.
- ✅ 회귀 `premium.apm.*` + `*ArchitectureTest` + `common.export.*` — **179클래스 2,085건 통과, fail 0 · skip 0**(6m 4s). `ApmExportIT` 14건(+2) 실 PostgreSQL(5433) 실행. 실행 전 다른 Gradle 테스트 워커 없음 확인(공유 IT DB 충돌 아님).
- ❌ **런타임(:3000) 실측 없음** — BE 재기동은 사용자 요청 시에만. 토큰 왕복·7일 경계 재승격 차단은 단위(시계 이동)·IT(토큰 왕복)로만 확인.
- ❌ FE 연동 없음 — 현재 FE는 `planToken`·`method`를 보내지 않아 v1 동작 그대로(배포 순서 제약 없음).

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정"으로 표시.
- 마지막에 중점 확인 요청 1~11 각각 판정(충족/불충족/추정) 한 줄씩과 종합 판정(승인 / 수정 후 재검수)을 적는다.

---

## 검수 결과(코덱스 v1)

- 원문: [`review_zm-154-be-followup_codex.md`](%EA%B2%80%EC%88%98-ZM-154-BE-%ED%9B%84%EC%86%8D-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 판정 **수정 후 재검수**(필수 R1~R4, 권장 R5~R7) → **7건 전부 반영**(같은 워크트리, 미커밋)

| 번호 | 심각도 | 요지 | 상태 |
|---|---|---|---|
| R1 | 필수 | `method`가 그대로 감사 로그에 들어가 CR/LF로 위조 행 주입 | [x] 이중 방어 — ① `ApmExportRequest.METHOD_TOKEN`(RFC 9110 tchar — 영숫자와 `!#$%&'*+-.^_~`, 백틱, 파이프, trim 뒤) 위반 = `APM_EXPORT_INVALID` ② 감사 로그 기록 지점의 사용자 입력(`user`·`method`)을 `ApmExportService.logSafe`로 이스케이프(CR·LF·탭 → `\r`·`\n`·`\t`, 그 밖의 C0·DEL·U+2028/2029 → `\uXXXX`). `q`는 원래 유무(boolean)만 기록. ℹ️ 레포에 로그 이스케이프 유틸이 없어 export 패키지 안에 두었다 — `common/`은 소비자가 둘 이상일 때만(CLAUDE.md §0.5 #3), 두 번째 소비자가 생기면 승격. 테스트: 개행·CRLF·공백·탭·NUL·비ASCII·`/` 거절 7종 + `M-SEARCH`/소문자/공백 허용, `logSafe` 단위, **Logback ListAppender로 실제 감사 행이 한 줄**(개행 든 username) |
| R2 | 필수 | 토큰 고정 해상도로 받을 때 보존 삭제 구간이 있으면 CSV가 조용히 빈/부분 파일 | [x] 토큰 유무와 관계없이 항상 — 헤더 `X-Apm-Export-Retention-Clipped: true\|false` + `X-Apm-Export-Retention-Cutoff`(ms, 다운로드 시각 − retentionDays일), Expose-Headers에 추가. CSV는 결손일 때만 파일 끝 `# NOTE: retention-clipped from=… cutoff=… retentionDays=… — …` 한 줄(`TabularWriter.note()` 기본 메서드 신설, CSV만 구현 · JSONL은 no-op). 자리 규칙: 데이터 뒤, `# TRUNCATED:`/`# ERROR:`보다 앞(그 표지가 마지막 줄로 남음) — 실패 경로에서도 NOTE를 먼저 남긴다. JSONL `_meta`에 `retentionCutoffMs` 추가. 테스트: 서비스 3(결손 헤더+NOTE 마지막 줄 / 비결손 false·NOTE 없음·JSONL 메타 / 실패 시 NOTE→ERROR 순서) + CSV 작성기 1 + 실제 두 exporter에서 고정 해상도여도 `retentionClipped=true` 재계산 확인 + IT 토큰 다운로드 헤더 |
| R3 | 필수 | `red-series`에서 무시되는 `q`가 DTO·`_meta`에 "적용한 검색어"로 기록 | [x] `ApmExportService.appliedQuery`(red-series=null)·`appliedMethod`(endpoints만)로 DTO·`_meta`·notes·감사 로그를 적용값으로. 토큰 지문은 원 요청 기준 유지(호환). 테스트: red-series `q=orders` → `dto.q=null`·notes에 없음·`_meta.q=null`·같은 q로만 토큰 통과 / error-groups `q`는 적용값으로 유지 |
| R4 | 필수 | 512자 상한이 trim 뒤라 공백으로 우회 | [x] `ApmExportService.parse`가 `isBlank()`·`trim()`보다 **먼저** 원문 길이 > 512를 `APM_EXPORT_INVALID`로 거절. 테스트: 513자 공백, (513−토큰 길이)자 공백+정상 토큰 → 거절 / 상한 안 앞뒤 공백+토큰 → 통과 / 512자 공백 → "안 보냄" |
| R5 | 권장 | 재승격 회귀 테스트가 실제 exporter를 안 거침 | [x] `ApmRedSeriesExporterTest` +1(pin 있는 요청 → plan M1·stepEscalated=false, `write`가 `store.redSeries(…, M1, …)`로 조회·M5 조회 없음, 대조군 pin 없으면 M5) · `ApmEndpointExporterTest` 신규 2(pin → `routeTable(…, M1, …)`, 대조군 M5 / 필터 술어·`__other__`). 🔴 **변이 확인**: 두 exporter를 `ApmResolution.choose(...)` 직접 호출로 되돌리자 두 R5 테스트가 **실패(2 failed / 11)** → 복구 후 통과 |
| R6 | 권장 | 타 사용자 토큰 재사용 보안 판단 미검증 | [x] 단위(`ApmExportPlanTokenTest`): 관리자 발급 `rawText=true` 토큰은 비관리자 요청에도 **토큰으로선 유효**(계정 미결합) → `download`는 `ForbiddenError`·응답 미커밋·본문 0·첨부 헤더 없음·원천 `plan`/`write` 미호출, `plan` EP도 403. IT(`viewerCannotReuseAdminRawTextToken`): 실제 `apm.view`만 가진 계정(`seedApmViewerAccount`)이 관리자 토큰으로 다운로드 → JSON `code 403 FORBIDDEN`·파일 조각 없음 |
| R7 | 권장 | 같은 모집단 IT가 행 수만 비교 | [x] `endpointFiltersMatchTransactionList`: 이 테스트에서만 `GET __other__` 씨앗 추가, 조건 6종(`ORD`·`post`·`cmd`+`GET`·`o`·`other`·`GET`)마다 목록 `rows`와 파일(JSONL — CSV 수식 방어 접두가 비교를 흐리지 않게)의 **`(route, method)` 집합 동일**, 목록 `otherRoutes`는 어떤 필터에서도 1(필터 전), 파일 `isOther` 행은 필터에 걸릴 때만 1(필터 후) |

### 반영 후 검증
- 단위: export·common.export·service.red·export.source **95건 통과**(fail 0 · skip 0).
- 회귀(IT 포함, R1~R7 반영 상태): `premium.apm.*` + `*ArchitectureTest` + `common.export.*` — **180클래스 2,100건 통과, fail 0 · skip 0**(8m 54s, `ApmExportIT` 15건 실 DB). 실행 전 zm-152-be의 `:test`가 끝나기를 기다렸다(공유 IT DB).

---

## 검수 결과(코덱스 v2)

- 원문: [`review_zm-154-be-followup-v2_codex.md`](%EA%B2%80%EC%88%98-ZM-154-BE-%ED%9B%84%EC%86%8D-v2-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · R2~R7 **닫힘**, R1 **부분** → 새 필수 N1·N2 → **둘 다 반영**(같은 워크트리, 미커밋)

| 번호 | 코덱스 v2 판정 | 요지 | 상태 |
|---|---|---|---|
| R1 | 부분 | tchar 검증·logSafe는 들어갔으나 N1·N2 틈 | [x] N1·N2로 닫음 |
| R2 | 닫힘 | 보존 헤더·CSV NOTE 자리 규칙 | [x] |
| R3 | 닫힘 | 적용값 단일 계산 | [x] |
| R4 | 닫힘 | 원문 길이 먼저 | [x] |
| R5 | 닫힘 | 실제 exporter 해상도 검증 | [x] |
| R6 | 닫힘 | 비관리자 원문 토큰 재사용 403 | [x] |
| R7 | 닫힘 | (route, method) 집합 비교·`__other__` | [x] |
| N1 | 필수 | `method`의 `isBlank()`·`trim()`이 제어 문자 검사보다 먼저라 `"GET\n"`→`"GET"` 통과, `"\t"`→미지정 | [x] `ApmExportRequest.parse`가 **원문**에 `Character.isISOControl` 문자가 하나라도 있으면 먼저 `APM_EXPORT_INVALID`, 그 뒤 **일반 공백(U+0020)만** 다듬고(`stripSpaces`) 비면 미지정, 그 다음 tchar 검증. 테스트: `"GET"+LF`·`TAB+"GET"`·`TAB` 단독·`"GET"+U+0085` 거절, `" GET "`→`GET`, `"   "`→미지정(기존 가운데 제어 문자 7종 유지) |
| N2 | 필수 | `logSafe`가 C1(U+0080~009F, 예 U+0085 NEL)·방향 제어 format 문자를 통과 | [x] code point 단위 — `\n`·`\r`·`\t` 표기 유지, 그 밖은 `Character.isISOControl(cp)`(C0+C1) · `Character.getType(cp) == FORMAT`(Cf: U+202A~202E, U+2066~2069, U+200D 등) · U+2028/2029를 `\uXXXX`(BMP 밖 Cf는 `\u{…}`)로. 이모지 등 일반 보충 문자는 그대로. 테스트: U+0085, U+202E·U+2066·U+200D·U+0080·U+009F, 기존 CR/LF/TAB/NUL/DEL/U+2028 케이스, 이모지 불변 |

### 반영 후 검증(N1·N2)
- 대상 단위(export·export.source·service.red·common.export, IT 제외): **12클래스 95건 통과**, fail 0 · skip 0 — N1·N2 단언은 기존 테스트 메서드 안에 추가(메서드 수 불변).
- export IT: `ApmExportIT` **15건 통과**, skip 0 — 본체 `moveseye-be-spring`의 `:test`(공유 IT DB)가 끝난 뒤 단독 실행.
- 전체 회귀는 N1·N2 전 상태로 2,100건 통과(위). N1·N2는 `ApmExportRequest.parse`의 method 분기와 `logSafe` 내부만 바꿔 다른 경로에 닿지 않는다고 판단해 전체 재실행은 생략(지시: export 관련 IT만 재실행 허용).

## 검수 결과(코덱스 v3) — 2026-09-28

- 대상: v2 잔여 N1·N2. 원문 `review_zm-154-be-followup-v3_codex.md`.
- N1 닫힘(원문 제어 문자 선거절 → U+0020만 trim → tchar) · N2 닫힘(code point 단위 C0·C1·Cf·U+2028/2029 이스케이프, 감사 로그 사용자 입력 전부 적용). 새 결함 0.
- **판정: 승인.** 커밋은 사용자 승인 대기.
