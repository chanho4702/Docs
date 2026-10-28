# 보고 — ZM-154 APM 데이터 내보내기 BE 후속 3건 (2026-09-28)

- 작업: Claude(be-engineer) · 워크트리 `C:\worktrees\zm-154-be-followup` · 브랜치 `ZM-154-followup-be`(master `3f731d5`에서 분기)
- 상태: ✅ 구현·테스트 완료 · **미커밋**(사용자 승인 대기) · 본체 `moveseye-be-spring`은 건드리지 않음(IntelliJ :3000 무영향)
- 계약: [`contract_apm-data-export.md`](../06-API-%EA%B3%84%EC%95%BD/%EA%B3%84%EC%95%BD-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-%28ZM-154%29.md) **§v2** · 검수 인계: [`reviews/review_zm-154-be-followup.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-154-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0-BE-%ED%9B%84%EC%86%8D%28%EC%97%94%EB%93%9C%ED%8F%AC%EC%9D%B8%ED%8A%B8-q-method-%EA%B3%84%ED%9A%8D-%EA%B3%A0%EC%A0%95-%ED%86%A0%ED%81%B0-R4%29.md)
- 출처: 검수 [`review_zm-154-apm-data-export.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-154-APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EA%B8%B0%EA%B0%84-%EC%A7%80%EC%A0%95-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0%28CSV-JSONL%29-BE-FE.md) BE R1(=FE R2) 잔여 · BE R4 · FE 보고 §"계약 차이" #3

## 1. 3건 상태

| # | 항목 | 상태 |
|---|---|---|
| 1 | 엔드포인트 내보내기 `q`·`method` 필터(계획·다운로드 EP 공통, 트랜잭션 표와 같은 모집단) | ✅ |
| 2 | 계획 고정 토큰 `planToken`(보존 경계 재승격·미래 `to` 재자르기 방지) | ✅ |
| 3 | R4 — 계획 EP 형식 오류 테스트에 `Content-Type`·`Content-Disposition` 단언 | ✅ |

## 2. 바꾼 파일 (최초 17개 — 수정 13 · 신규 4. 코덱스 반영 후 **21개**(수정 16 · 신규 5) — §6)

### 프로덕션 (11)
| 파일 | 변경 |
|---|---|
| `premium/apm/service/red/ApmEndpointFilter.java` 🆕 | 검색어·메서드 술어 — 트랜잭션 표와 내보내기가 공유하는 **유일한 정의** |
| `premium/apm/service/red/ApmSeriesQueryService.java` | 인라인 `q`/`method` 필터 → `ApmEndpointFilter`(동작 불변, 미사용 `Locale` import 제거) |
| `premium/apm/export/ApmExportPlanToken.java` 🆕 | HMAC-SHA256 서명 토큰 발급·검증, 요청 지문 |
| `premium/apm/export/ApmExportRequest.java` | 컴포넌트 3개 추가(`method`·`requestedToMs`·`pin`) + v1 모양 보조 생성자·`parse` 오버로드 유지 · `resolution()`(고정 우선) · `pinned()` · `method` 검증 |
| `premium/apm/export/ApmExportService.java` | `parse(…, method, …, planToken)` · 토큰 발급(계획)·검증(다운로드) · `requireSameWindow` · 필터 안내 note · JSONL `_meta`에 `q`·`method`·`planPinned` · 감사 로그에 `q`(유무)·`method`·`pinned` |
| `premium/apm/export/ApmExportController.java` | `method`(두 EP) · `planToken`(다운로드) 파라미터 + `@Parameter` 설명 |
| `premium/apm/export/ApmExportPlanDto.java` | `q`·`method`·`planToken`·`planTokenExpiresAtMs` 필드(맨 뒤) |
| `premium/apm/export/ApmExportProperties.java` | `planTokenTtlSeconds`(기본 1,800, 60~86,400) |
| `premium/apm/export/source/ApmEndpointExporter.java` | `ApmEndpointFilter` 적용 · 해상도 `request.resolution()` |
| `premium/apm/export/source/ApmRedSeriesExporter.java` | 해상도 `request.resolution()` |
| `src/main/resources/application.yml` | `app.apm.export.plan-token-ttl-seconds: 1800`(env 자리표시자 없음 — 새 env 금지 지시) |

### 테스트 (6)
| 파일 | 변경 |
|---|---|
| `premium/apm/service/red/ApmEndpointFilterTest.java` 🆕 | 5건 — 빈 값·q 부분일치(route·method)·method 정확 일치·AND·null 안전 |
| `premium/apm/export/ApmExportPlanTokenTest.java` 🆕 | 10건 — 🔴 보존 경계 재승격(토큰 없음 300 / 있음 60)·미래 `to` 고정·TTL·계정 식별자 없음+타 사용자 재사용·불일치 7종·만료·변조/타 키/깨진 형식/길이·빈 토큰·원천 창 불일치(미커밋·원천 write 미호출)·지문 경계 |
| `premium/apm/export/ApmExportRequestTest.java` | +2 — `method`는 endpoints 전용·길이, `requestedToMs` 보존 |
| `premium/apm/export/ApmExportIT.java` | +2 + R4 — 필터 4조건 **목록 total = 파일 행 수**·계획 `q`/`method`/`rows`·JSONL 메타·타 데이터셋 method 거절 / 토큰 왕복(헤더 From·To·Step·Rows·파일명 = 계획)·불일치 JSON 오류(첨부 헤더 없음)·깨진 토큰 / R4 단언 |
| `premium/apm/export/ApmExportServiceTest.java` | 생성자에 토큰 인자(동작 테스트 불변) |
| `premium/apm/export/source/ApmRedSeriesExporterTest.java` | `ApmExportProperties` 4인자 |

## 3. 설계 결정

### 3.1 필터 재사용 — SQL이 아니라 술어를 공유
지시는 "`windowFilter()` 추출 방식 참고, SQL 복제 금지"였다. 확인해 보니 트랜잭션 표의 `q`·`method`는 **SQL 필터가 아니다** — `store.routeTable()` 합산 뒤 자바가 route×method 행에 건다(정렬 키 `p95Ms`가 히스토그램 계산값이라 정렬·페이지가 자바이기 때문). 그래서 같은 방식(공유 가능한 단위로 추출)을 **술어**에 적용했다: `ApmEndpointFilter`를 `service/red/`(표의 주인 메뉴)에 두고 표와 내보내기가 import한다. 내보내기 쪽은 그룹 키에 필터를 걸어 v1과 같은 합산 경로를 탄다.
- `method`는 `endpoints` 외 데이터셋이면 **거절**(조용히 무시하면 "걸렀다고 믿은 전량 파일"). `q`의 `red-series` 무시는 v1 거동이라 유지.

### 3.2 계획 고정 토큰 — HMAC 서명(상태 없음)
| 선택 | 이유 |
|---|---|
| **HMAC 서명** (버린 것: Redis 짧은 TTL) | 다중 노드에서 저장소 공유 없이 검증(노드들은 인증 때문에 이미 `JWT_SECRET` 공유) · 계획마다 Redis 쓰기 없음 · Redis 재기동·축출로 멀쩡한 계획이 "만료"되지 않음 |
| **키 = `HMAC-SHA256(JWT_SECRET, "moveseye/apm-export/plan-token/v1")`** | 새 env 없음(지시). 원본 키로 직접 서명하지 않고 용도 분리 파생(ZM-157 A3 용도 혼용 교훈). `JWT_SECRET` 교체 시 토큰 전부 무효 → 계획 재조회 |
| **TTL 30분**(`app.apm.export.plan-token-ttl-seconds`, 60~86,400) | 사람이 계획을 읽고 누르는 여유. 길어도 권한이 넓어지지 않는다(고정은 창·해상도뿐, 권한은 매번 재판정) |
| **고정하는 것 = 창 끝(자른 뒤·칸 올림 전) + 해상도** | 원천은 같은 입력으로 칸 경계를 결정적으로 다시 계산한다. 칸 올림 **후** 값(`plan.toMs`)을 넣으면 한 칸 더 밀릴 수 있어 올림 전 값을 넣었다. 계획 응답의 `fromMs`·`toMs`·`stepSeconds`도 토큰에 넣고 다운로드가 같은지 **본문 전에** 검증(`requireSameWindow`) — 원천 코드가 바뀐 날의 방어 |
| **고정하지 않는 것 = 데이터·coverage·보존 판정·exportedAt** | 파일은 다운로드 시점 데이터를 읽는다. "지금"을 통째로 얼리는 안(요청의 `nowMs` 고정)은 버렸다 — 그 사이 보존 배치가 지운 칸을 DATA 구역으로 오표기할 수 있다 |
| **지문 = 파라미터 전체의 SHA-256(필드 길이 접두)** | `to`는 **보낸 그대로**(`requestedToMs`) — 자른 값은 두 요청에서 다르다. 검색어 원문을 URL·로그에 싣지 않으려고 지문만. 구분자 연결이면 `q="aG",method="ET"`와 `q="a",method="GET"`이 충돌 → 길이 접두(테스트로 고정) |
| **계정 식별자 없음 · 타 사용자 재사용 허용** | 토큰은 권한을 주지 않는다(`apm.view`·원문 관리자 판정은 매번). 남의 토큰으로 얻는 건 자기 계획으로도 얻는 정보. 계정을 묶으면 이득 없이 재로그인·공유 시 오작동만 늘어난다 → 계약 §v2.4 #4 |
| **오류 코드 신설 없음** | 형식·서명·만료·불일치 전부 `APM_EXPORT_INVALID`(한국어 message로 구분). FE 처리는 "계획 재조회" 하나 |

### 3.3 호환
- 토큰 없는 다운로드 = v1과 같은 경로(`request.resolution()`이 `pin == null`이면 기존 `ApmResolution.choose` 그대로).
- 파일 열 불변 → `X-Apm-Export-Schema-Version` 1 유지. JSONL `_meta`에 키 3개 추가(추가형).
- `ApmExportRequest`의 v1 생성자·`parse` 두 오버로드를 남겨 기존 호출처·테스트 무수정.
- 🔴 `ApmExportProperties`에는 보조 생성자를 **두지 않았다** — `@ConfigurationProperties` 레코드는 생성자가 둘이면 바인딩 생성자가 모호해진다. 대신 테스트 2곳을 4인자로 고쳤다.

## 4. 테스트 결과 (실행 출력 요약)

| 실행 | 명령 | 결과 |
|---|---|---|
| 컴파일 | `.\gradlew.bat :compileJava :compileTestJava` | 성공(경고는 기존 `When.MAYBE`·HostService deprecation) |
| 대상 단위 | `:test --tests export.ApmExportPlanTokenTest/RequestTest/ServiceTest · service.red.* · export.source.*` | **67건 통과**(9클래스, fail 0 · skip 0) — 신규 PlanToken 10 · EndpointFilter 5 · Request 14(+2) |
| 회귀(IT 포함) | `:test --tests "com.dmove.moveseye.premium.apm.*" --tests "*ArchitectureTest" --tests "com.dmove.moveseye.common.export.*"` | **BUILD SUCCESSFUL 6m 4s · 179클래스 2,085건 통과 · fail 0 · skip 0** — `ApmExportIT` 14건(+2) 실행(도커 5433 연결, skip 아님), `ApmSchemaIT` 20건 포함 |

- IT 전 확인: `Win32_Process` java 3개 = Gradle 데몬 2 + IntelliJ BE 1, **테스트 워커 없음**(zm-152-be와 공유 `moveseye_it` 동시 실행 아님).
- 로그의 `EventSyncService … ZABBIX_API_ERROR`는 IT 컨텍스트 스케줄러 소음(기존) — 결과 무관.

## 5. 미해결 · 주의

1. **런타임(:3000) 실측 없음** — BE 재기동은 사용자 요청 시에만. 실 브라우저/curl로 볼 것: 토큰 왕복, 7일 경계 부근 창의 재승격 차단(실시간으로는 재현이 어렵다 — 단위 테스트가 시계를 움직여 고정), 교차 오리진에서 긴 쿼리(토큰 ~150자) 문제 없음.
2. **FE 연동 미착수** — 계약 §v2 "🔄 FE 요청사항" 3건(트랜잭션 탭 `q`·`method` 전달, `planToken` 전달, `APM_EXPORT_INVALID` 시 재계획). 현재 FE는 토큰을 보내지 않으므로 **v1 동작 그대로** — 배포 순서 제약 없음.
3. 토큰 고정 후에도 `rows`는 에러 그룹·전 서비스 RED에서 계획과 조금 다를 수 있다(데이터가 다운로드 시점 것이므로) — v1과 같은 성질, 계약에 명시.
4. `JWT_SECRET` 교체 시 발급된 토큰 무효(30분 이내 영향) — 의도된 동작.
5. 커밋 제안(승인 필요, `git add -A` 금지 — 파일 21개 명시 추가, §6 표 참조):
   `#ZM-154 [FEAT] APM 내보내기 후속 — 엔드포인트 q·method 필터(트랜잭션 표와 같은 ApmEndpointFilter), 계획 고정 토큰 planToken(HMAC·JWT_SECRET 파생·30분, 보존 경계 재승격 차단), 계획 EP 형식 오류 헤더 단언(R4) -2026-09-28`

## 6. 코덱스 반영

### 6.1 코덱스 v1(`review_zm-154-be-followup_codex.md`, 수정 후 재검수) — 7건 전부 반영

| # | 심각도 | 반영 |
|---|---|---|
| R1 | 필수 | `method` = RFC 9110 token(`ApmExportRequest.METHOD_TOKEN`) 아니면 `APM_EXPORT_INVALID` + 감사 로그 사용자 입력(`user`·`method`)을 `ApmExportService.logSafe`로 이스케이프(`q`는 원래 유무만). 로그 유틸이 레포에 없어 export 패키지 안에 둠(`common/`은 소비자 둘 이상일 때 — CLAUDE.md §0.5 #3) |
| R2 | 필수 | 헤더 `X-Apm-Export-Retention-Clipped`·`-Retention-Cutoff`(토큰 무관 항상, Expose 포함) + CSV 결손 시 파일 끝 `# NOTE: retention-clipped …`(`TabularWriter.note()` 신설, 데이터 뒤·`# ERROR:`/`# TRUNCATED:` 앞) + JSONL `_meta.retentionCutoffMs` |
| R3 | 필수 | `appliedQuery`(red-series=null)·`appliedMethod`로 DTO·`_meta`·notes·감사 로그를 적용값으로. 토큰 지문은 원 요청 기준 |
| R4 | 필수 | 원문 `planToken.length() > 512`를 `isBlank()`·`trim()`보다 먼저 거절 |
| R5 | 권장 | 실제 `ApmRedSeriesExporter`·`ApmEndpointExporter`(신규 테스트)에 pin 요청 → 조회 해상도 M1·plan step 단언. **변이 확인: 두 exporter를 `ApmResolution.choose()` 직접 호출로 되돌리면 R5 테스트 2건 실패(11건 중) → 복구 후 통과** |
| R6 | 권장 | 단위(관리자 `rawText=true` 토큰 + 비관리자 → `ForbiddenError`·미커밋·원천 미호출, 계획 EP도 403) + IT(실제 `apm.view` 계정 → JSON 403·파일 조각 없음) |
| R7 | 권장 | IT에 `GET __other__` 씨앗(이 테스트 한정), 6조건마다 목록·JSONL `(route, method)` 집합 동일, `otherRoutes`=필터 전(항상 1), 파일 `isOther`=필터 후 |

### 6.2 코덱스 v2(`review_zm-154-be-followup-v2_codex.md`) — R2~R7 닫힘, R1 부분 → N1·N2 반영

| # | 반영 |
|---|---|
| N1 | `method` **원문**에 `Character.isISOControl` 문자가 있으면 먼저 거절 → 일반 공백(U+0020)만 다듬음 → tchar. `"GET\n"`·`"\tGET"`·`"\t"`·`"GET"+U+0085` 거절, `" GET "` 통과 |
| N2 | `logSafe`를 code point 단위로 — C0+C1(`isISOControl`)·Cf(`FORMAT`, U+202E·U+2066·U+200D 등)·U+2028/2029를 `\uXXXX`로(`\n`·`\r`·`\t` 표기 유지). 이모지 불변 |

### 6.3 추가·변경 파일(코덱스 반영분)
- 프로덕션: `common/export/TabularWriter.java`(`note()` 기본 메서드) · `common/export/CsvTabularWriter.java`(`# NOTE:` 줄) · `ApmExportService.java`·`ApmExportRequest.java`(위 R1~R4·N1·N2)
- 테스트: `export/source/ApmEndpointExporterTest.java` 🆕(2) · `common/export/CsvTabularWriterTest.java`(+1) · `ApmExportServiceTest`(+6) · `ApmExportPlanTokenTest`(+3) · `ApmExportRequestTest`(+1) · `ApmRedSeriesExporterTest`(+1) · `ApmExportIT`(+1, R7 재작성·R2 헤더 단언)

### 6.4 테스트 수치

| 실행 | 결과 |
|---|---|
| v1 반영 직후 대상 단위(export·export.source·service.red·common.export) | 12클래스 **95건 통과** |
| v1 반영 상태 회귀(IT 포함) `premium.apm.*`+`*ArchitectureTest`+`common.export.*` | **180클래스 2,100건 통과, fail 0 · skip 0**(8m 54s, `ApmExportIT` 15) — zm-152-be `:test` 종료 후 실행 |
| N1·N2 반영 후 대상 단위 | 12클래스 **95건 통과**(N1·N2 단언은 기존 메서드 안) |
| N1·N2 반영 후 export IT | `ApmExportIT` **15건 통과**, skip 0 — 본체 레포의 `:test` 종료 후 단독 실행 |

ℹ️ 변이 확인 중 exporter 원본은 scratchpad에 백업 후 복구했다(`request.resolution()` 사용 확인).
