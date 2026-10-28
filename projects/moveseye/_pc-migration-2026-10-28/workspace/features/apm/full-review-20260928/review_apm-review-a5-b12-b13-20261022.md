# 검수 요청 — APM 전체 검토 잔여 A5·B12·B13 구현 · 2026-10-22

> ⚠️ 아래 "변경"·"테스트" 표는 **1차 요청 기준**이다. 이후 차수의 변경(권한 생략 오버로드 제거, `framesOnly` 삭제·초과 스택 통째로 판정 불가, DB 가림을 첫 인용에서 멈추는 방식으로 재설계 등)은 문서 끝의 "N차 결과" 절이 정본이다.

- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-review-security-retention`(master `1a36632` 위 미커밋). FE `C:\solutions\moveseyee_fe` 브랜치 `apm-review-security-retention`(타입·픽스처 1필드).
- 설계: `devdesign_apm-review-a5-b12-b13-20261022.md` — §5(v2)·§6(v3, 구현본). 설계 검수 1차·2차 모두 조건부 진행 → 지적 전부 반영.
- diff: `C:/Users/DMOVE/AppData/Local/Temp/claude/C--solutions/eee4683d-0280-4673-9a67-5cecb7771b95/scratchpad/a5b12b13.diff`(34파일)

## 변경
| 항목 | 파일 | 내용 |
|---|---|---|
| A5 | `ApmRetentionDays`·`ApmRetentionDto`·`ApmRetentionJob` | `alertEventDays`(옵션 키, 기본 400), 잡 단계 `alertEvents` |
| A5 | `ApmRetentionService.deleteOldAlertEvents` | 회차 cutoff 고정, 묶음(5000)마다 REQUIRES_NEW. 이벤트 `for update skip locked`(해소 ∧ resolved<cut ∧ fired<cut ∧ id>커서) → 통지 `for update nowait` 후 상태 재읽기 → PENDING·PROCESSING 걸린 이벤트 제외 → 삭제(끝난 통지 CASCADE). 55P03이면 묶음 롤백·건너뜀(SQLSTATE 판정). 종료 = 후보 < 묶음 |
| B12 | `ApmSqlPolicy`·`ApmSqlMasker` | 초과 자유 텍스트 → `UNMASKABLE`, 초과 스택 → `framesOnly`(문법 맞는 프레임 줄만, 비프레임 연속은 UNMASKABLE 한 줄). 프레임 판정 = 줄 전체 정규식 + 512자(상한 이하 경로도) |
| B13 | `ApmSettingService.update(req, actor, rawAllowed)`·`ApmSettingRepository.lockForUpdate` | advisory xact lock → DB 값으로 켜는 방향 판정 → 비관리자면 `ForbiddenError(APM_RAW_SQL_ADMIN_ONLY)`. 같은 값 키는 쓰지 않음. 2인자는 내부·테스트용(rawAllowed=true) |
| B13 | `ApmCollectorConfigService`·`ApmReceiveTokenService.issue`·컨트롤러 2 | 요청이 명시한 `keepRawSql=true`·`maskingReduced`는 관리자만(같은 403, 발급 롤백). 상속 허용 |
| B13 | `core/security/ApmRuntimeTextRedactor`(새) | `op`: DB 무조건 리터럴 마스킹·미닫힘 `?…`·dollar-quote 판정 불가 / HTTP 쿼리 제거+경로 / RPC 형식 검증 / 그 밖 판정 불가. `path`: 쿼리·프래그먼트 제거, 구간 3겹 디코딩 뒤 숫자·hex16·UUID·@·글자숫자 24자 토큰·깨진 인코딩·인코딩 구분자 → `{id}` |
| B13 | `ActiveRequestListIngestor` | 경로 항상, op는 keepRawSql 꺼졌을 때 가림(가린 뒤 자르기) |
| B13 | `ApmStuckRequestQueryService`·`ApmStuckRequestDto.redacted`·`ApmLiveActiveRequestsDto.redacted`·컨트롤러 2 | 비관리자 조회는 다시 가림 |
| B13 | `LiveSpanRuntimePayload` | SSE `activeList`는 언제나 가린 사본(버퍼 원본 불변) |
| 공통 | `ErrorCode.APM_RAW_SQL_ADMIN_ONLY` · FE `alertEventDays?` · 계약 3문서 | |

## 테스트(격리 DB 5434, 클래스별)
- 새: `ApmAlertEventRetentionIT` 6(해소 기준·열린 행·배달 중 통지 보호·묶음 진행·통지 잠금 경합 nowait 건너뜀·재조정 key share 건너뜀·보존 잠금 중 재조정 즉시 실패) · `ApmRawSqlSwitchIT` 6(비관리자 켜기/마스킹 끄기 403·부분 저장 없음·관리자 켜기/편집자 끄기·캐시 아닌 DB 판정·같은 값 updated_by 보존·행 없음 기본값) · `ApmRuntimeTextRedactorTest` 7.
- 보강: `ApmSqlPolicyTest` +4(초과 자유 텍스트 반례 2·초과 스택 프레임만·프레임 위장·허용 목록 경로) · `ApmCollectorConfigServiceTest` +2 · `ActiveRequestListIngestorTest` +1 · `LiveSpanRuntimeStreamTest`(SSE 가림) · 보존 테스트 4종 필드 추가 · `ApmAdminAccessMvcTest`(3인자 issue).
- 회귀: 레포 전체 단위 테스트 4,398 통과(skip 4) · `ApmRetentionJobIT` 12 · `ApmSettingRollbackIT` 2 · `ApmRegistrarIT` 6 · FE tsc·계약 픽스처 검사 통과.
- **뮤테이션 12종 전부 실패 확인**: 초과 자유 텍스트 원문 반환 · 프레임 접두 판정 · 배달 중 필터 제거 · nowait 제거 · 설정 관리자 검사 제거 · 설정 캐시 판정 · 같은 값 재기록 · RPC/모르는 형식 통과 · 경로 디코딩 제거 · SSE 원문 · 수신 경로 원문 · yaml 가드 제거.
- 구현 중 발견: PG 55P03은 Spring에서 `PessimisticLockingFailureException`이 아니라 `UncategorizedSQLException`이다(IT) → SQLSTATE 판정으로 고침(재조정 코드 `isLockConflict`도 같은 방식).

## 판단 요청
1. 설계 §5·§6 대비 누락·왜곡. 특히 A5 묶음 루프(커서·종료·nowait 실패 처리)와 B13 설정 잠금(advisory xact lock + DB 값 + 같은 값 생략).
2. `ApmRuntimeTextRedactor`의 우회 경로 — 정규식(`STRING_LITERAL`·`NUMBER_LITERAL`·`RPC_FORM`·`FRAME`)과 디코딩 규칙.
3. (1차 기준 질문 — 이후 권한 생략 오버로드는 **제거**됐다) 컨트롤러 외 호출처가 권한 없이 원문 스위치를 켤 수 있는 경로가 있는가.
4. 깨진 JSON 아카이브 경로(`ApmArchiveSource.maskJson` 폴백)가 16KB 초과면 이제 `UNMASKABLE`이 된다 — 수용 가능한가.

## 1차 결과: 반려 (`_archive/features/apm/full-review-20260928/review_apm-review-a5-b12-b13-20261022_codex.md`) → 반영(2차 요청)
- 🔴1 숫자 든 dollar 태그(`$tag1$`) → `DOLLAR_QUOTE = \$(?:[A-Za-z_][A-Za-z_0-9]*)?\$`(위치 매개변수 `$1`은 해당 없음 — 숫자 규칙 lookbehind에 `$` 추가).
- 🔴2 백슬래시 이스케이프(`E'it\'s …'`·MySQL `'\'`) → `DB` 설명에 백슬래시가 있으면 통째로 `?(unmaskable)`.
- 🔴3 지수형 숫자 → `NUMBER_LITERAL`이 정수·소수·`.5`·지수형(`1e9`·`1.5E-3`)·16진(`0xFF`)까지.
- 🟡 권한 생략 오버로드 **제거**: `ApmSettingService.update(req, actor)`·`ApmCollectorConfigService.generate(req, actor)`·`generateForIssue(…5인자)`·`ApmReceiveTokenService.issue(req, by)`·`ApmStuckRequestQueryService.list(…6인자)`. 테스트 호출부는 권한을 명시(`true`)하도록 고쳤다.
- 🟡 A5 다중 통지 경합: `partialNotificationLockRollsBackBatchAndContinues`(뒤 통지만 잠겨 있으면 앞 통지 잠금까지 묶음 롤백, 다음 묶음 이벤트는 삭제).
- 🟡 B13 발급 롤백: `ApmRawSqlSwitchIT.issueWithRawConfigRollsBackToken`(비관리자 withConfig keepRawSql=true → 403, 토큰 행 0건 / 관리자는 발급).
- 🟡 아카이브 폴백 직접 테스트는 정책 단위 테스트(`oversizedFreeTextIsNeverRaw`)로 갈음.
- 결과: `ApmRuntimeTextRedactorTest` 8 · `ApmAlertEventRetentionIT` 7 · `ApmRawSqlSwitchIT` 7 · `ApmRegistrarIT` 6 · `ApmSettingRollbackIT` 2 · `ApmRawTextPolicyIT` 3 · `LiveMetadataCacheIT` 14 통과, 레포 전체 단위 4,399 통과(skip 4). 뮤테이션 추가 3종(dollar 태그 숫자·백슬래시 가드·지수형) 전부 실패 확인 — 누적 15종.

## 2차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r2.md`) → 반영(3차 요청)
- 🔴1~3(주석 안 따옴표·비ASCII dollar 태그·밑줄/2진/8진 숫자) — 정규식 덧대기를 그만두고 **`sql()`을 한 글자씩 읽는 토크나이저로 교체**했다. 규칙: 백슬래시가 어디든 있으면 통째로 판정 불가(문자열이 먼저 삼키지 않게 맨 앞에서 본다) · 문자열 `'…'`(`''` 이스케이프) → `?`, 닫히지 않으면 `?…`로 끝 · 주석 `--`·`#`(줄 끝까지)·`/* */`(중첩) → `/*?*/`, 닫히지 않으면 끝 · 큰따옴표 식별자는 그대로(안의 `'`가 문자열 판정을 흔들지 않는다) · 식별자(유니코드 글자·숫자·`_`·`$`) 그대로 · 식별자 밖에서 숫자(또는 `.숫자`)로 시작하는 토큰 전체(밑줄·접두·지수 부호 포함) → `?` · 위치 매개변수 `$숫자`는 그대로, 그 밖의 `$`는 통째로 판정 불가.
- 🟡 수신 경로 반례: `ActiveRequestListIngestorTest.redactsAtIngest` 입력을 주석 안 따옴표 반례로 바꿈. 🟡 MVC: `ApmAdminAccessMvcTest.editorRawSqlSwitchIsForbiddenEnvelope`(편집 권한 일반 사용자 → 서비스에 rawAllowed=false 전달, HTTP 200 + body code 403 + errorCode). 🟡 아카이브: `ApmArchiveSourceTest.oversizedBrokenJsonIsUnmaskable`.
- 결과: `ApmRuntimeTextRedactorTest` 10 · `ActiveRequestListIngestorTest` 4 · `ApmArchiveSourceTest` 6 · `ApmAdminAccessMvcTest` 10 통과, 레포 전체 단위 4,403(skip 4). 토크나이저 뮤테이션 6종(백슬래시 가드·dollar를 식별자로·블록 주석 미처리·줄 주석 유지·숫자를 숫자만·닫히지 않은 문자열 유지) 전부 실패 확인.

## 3차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r3.md`) → 반영(4차 요청)
- 🔴1 인용 식별자 안 따옴표: 백틱은 큰따옴표처럼 인용 식별자로 통째로 둔다. 대괄호는 배열 첨자·`ARRAY['x']`와 SQL Server 식별자(`[user's]`)를 구분할 수 없어, 닫는 `]` 전에 작은따옴표가 있으면 통째로 판정 불가(없으면 평소처럼 읽어 첨자 숫자도 `?`).
- 🔴2 Oracle 대체 인용: 식별자 `q`·`nq`(대소문자 무관) 바로 뒤 `'`이면 통째로 판정 불가.
- 🟡 지금까지 반례 12종 전부를 **한 번 가린 결과에 다시 적용**해도 이메일이 없는지 확인하는 `allBypassesStayRedactedWhenReapplied`(수신 → 비관리자 조회·SSE의 재적용 모양). 본문 판단 요청 3을 현재 구현(오버로드 제거)에 맞춤.
- 결과: `ApmRuntimeTextRedactorTest` 12 통과. 뮤테이션 3종(백틱 식별자·대괄호 가드·q 인용 가드) 전부 실패 확인.

## 4차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r4.md`) → 반영(5차 요청)
방언별 반례(SQL Server `]]`·BigQuery `'''…'''`)를 쫓는 대신, 토크나이저가 **경계를 잘못 읽었을 때 남는 흔적**을 일반 규칙 셋으로 막는다 — 걸리면 설명 전체가 `DB ?(unmaskable)`.
1. **닫는 따옴표 바로 뒤가 글자·숫자·따옴표**면 경계를 잘못 읽었다(인접 안전망).
2. **여는 따옴표 바로 앞에 식별자**가 붙어 있으면 아는 접두(N·E·B·X·`_charset`·`U&`)만 허용(접두 안전망) — Oracle `q'`·BigQuery `r'` 등 모르는 접두는 판정 불가. 3차의 `q`/`nq` 전용 가드는 이것으로 대체(뮤테이션에서 중복으로 드러나 제거).
3. **가린 결과에 이메일 모양(`글자@글자`)**이 남으면 판정 불가(SQL Server `@p1` 변수는 해당 없음).
- 대괄호는 닫는 `]`를 찾을 때 이스케이프된 `]]`를 건너뛴다.
- 테스트: `boundarySafetyNets`(안전망마다 이메일 없이 그 규칙 하나만 막는 반례 포함), 재적용 반례 16종. 뮤테이션 14종(가리기 전체) 전부 실패 확인.

## 5차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r5.md`) → 재설계(6차 요청)
- 🔴1 공백 낀 BigQuery 3중 인용(`'''hello' 토큰 'bye'''`)이 세 안전망을 모두 통과. → 경계 해석을 포기하고 **첫 인용·주석·숫자 아닌 `$`·모르는 문자에서 멈추고 뒤를 버리는** 방식으로 재설계(설계 §7). 인접·접두 안전망은 불필요해져 삭제, 백슬래시 가드·이메일 모양 그물은 유지.
- 🟡 재적용 테스트를 토큰·숫자 비밀까지 넓힘(`allReviewBypasses` 18종, 1회·2회 결과 모두). **무작위 성질 테스트**(`nothingAfterAnyQuoteEverLeaks`, 2만 개)가 식별자 안 `$`(`q$t$…`) 반례를 찾아 `$`를 식별자 글자에서 뺐다.
- 결과: `ApmRuntimeTextRedactorTest` 8 · `ActiveRequestListIngestorTest` 4 · `LiveSpanRuntimeStreamTest` 7 통과. 뮤테이션 11종(백슬래시 가드·인용을 구두점으로·식별자에 `$`·멈추지 않고 건너뛰기·주석 허용·숫자 유지·이메일 그물·RPC·디코딩·SSE·수신 경로) 전부 실패 확인.

## 6차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r6.md`) → 반영(7차 요청)
- DB `currentOp` 중단 방식은 새 우회 없음(코덱스 무작위 10만 건 확인).
- 🔴1 경로: `URLDecoder`가 잘못된 UTF-8(`%FF`·overlong `%C0%AF`·서러게이트 `%ED%A0%80`)을 예외 없이 U+FFFD로 바꿔 토큰 판정을 피함 → 디코딩 결과에 U+FFFD가 있으면 깨진 인코딩으로 보고 `{id}`.
- 🔴2 B12: 상한 초과 스택에서 SQL 문자열 안의 프레임 모양 줄이 남음(줄의 출처를 구분할 수 없음) → **상한 초과 스택은 통째로 `?(unmaskable)`**(프레임 보존 포기, `framesOnly` 삭제). 우리 Collector는 4,096자로 먼저 잘라 정상 경로는 해당 없음.
- 🟡 클래스 주석의 큰따옴표 한계 문구를 현재 동작(첫 인용에서 멈춤)으로 정정.
- 결과: `ApmSqlPolicyTest` 15 · `ApmRuntimeTextRedactorTest` 8 · `ApmArchiveSourceTest` 6 통과. 뮤테이션 4종(U+FFFD 가드·스택 초과 원문·프레임 접두 판정·자유 텍스트 초과 원문) 전부 실패 확인.
- 남는 한계(기록): 상한 **이하** 스택에서 SQL 리터럴 안에 프레임 문법과 정확히 같은 줄이 있으면 그 줄은 프레임으로 남는다 — 클래스·메서드 이름 자리에 비밀을 넣은 경우만 해당.

## 7차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r7.md`) → 반영(8차 요청)
- 6차 🔴1~2 해소 확인, 상한 이하 스택의 프레임 모양 줄 한계는 **이번 범위에서 수용**(코덱스 판단).
- 🔴1 `HTTP` 설명 형식 검증: 경로 앞(메서드·호스트)이 `(?: [A-Z]{1,16})?(?: 호스트 글자{1,255})? ?`에 맞지 않으면 `HTTP ?(unmaskable)`.
- 🔴2 디코딩된 `#`(및 따옴표·백틱·꺾쇠·제어 문자)가 든 경로 구간은 `{id}`.
- 🟡 이 문서 머리에 "본문 표는 1차 기준" 안내 추가. 반례를 재적용 테스트(`allReviewBypasses`)에도 추가.
- 결과: `ApmRuntimeTextRedactorTest` 8 · `ActiveRequestListIngestorTest` 4 · `LiveSpanRuntimeStreamTest` 7 통과. 뮤테이션 2종(HTTP 형식 검사·`#` 가드) 실패 확인.

## 8차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r8.md`) → 반영(9차 요청)
- 7차 🔴1~2 해소 확인.
- 🔴1 구두점이 붙은 긴 토큰(`T;v=1`·`T%3Bv=1`·`T+`·`T%20`·`jsessionid=T`)이 구간 전체 판정을 거짓으로 만들어 통과 → **디코딩된 구간을 글자·숫자·`-`·`_` 아닌 글자로 쪼갠 조각 하나라도 ID·토큰 모양이면 구간 전체를 `{id}`**. 금지 문자를 덧붙이는 방식을 그만두고 조각 판정으로 일반화.
- 🟡 **경로 성질 테스트**(`pathTokenNeverLeaksWithAffixes`, 무작위 2만 개): 토큰 앞뒤에 구두점·percent-encoding(1·2겹)·잘못된 UTF-8을 붙여도 1회·재적용·HTTP 설명 모두 토큰이 나오지 않는다. 라우트 이름·날짜(`/api-v2/report/2026-10-22/file.json`)는 그대로.
- 결과: `ApmRuntimeTextRedactorTest` 9 · `ActiveRequestListIngestorTest` 4 · `LiveSpanRuntimeStreamTest` 7 통과. 뮤테이션: 조각 판정·U+FFFD 가드·디코딩 제거는 실패 확인, `#` 가드 제거는 조각 판정이 같은 경우를 막아 살아남음(7차 반례를 명시적으로 막는 중복 방어로 유지).

## 9차 결과: 반려 (`_archive/…/review_apm-review-a5-b12-b13-20261022_codex_r9.md`) → 반영
- 8차 영숫자 토큰 반례 해소 확인.
- 🔴1 내부에 `.`·`~`·`=`가 든 토큰 + 접미 구두점 → 조각 분리 기준을 토큰 판정과 **같은 글자 집합**(글자·숫자·`_`·`-`·`.`·`=`·`~`)으로 맞추고, 그 조각을 `.`·`=`·`~`로 한 번 더 자른 작은 조각도 판정.
- 🟡 경로 성질 테스트의 토큰을 무작위 생성(내부 구두점 포함, 2만 개 중 절반).
- 결과: `ApmRuntimeTextRedactorTest` 9 · `ActiveRequestListIngestorTest` 4 · `LiveSpanRuntimeStreamTest` 7 통과. 뮤테이션(분리 기준 불일치·조각 판정 제거) 실패 확인.

## 결정(2026-10-22): B13-② 보류 — 커밋 범위는 A5·B12·B13-①
- 처리 중 요청 재가림(`ApmRuntimeTextRedactor`·수신/조회/SSE 배선)은 걷어 내고 아카이브(`_archive/features/apm/full-review-20260928/b13-2_*`)로 옮겼다. 이 부분의 1~9차 반례는 재개 때 참고한다.
- 걷어 낸 뒤: 관련 단위 9클래스 통과(`ApmSqlPolicyTest` 15 · `ApmArchiveSourceTest` 6 · `ApmCollectorConfigServiceTest` 7 · `ApmReceiveTokenServiceTest` 18 · `ApmAdminAccessMvcTest` 10 · `ApmSettingServiceTest` 13 · `ActiveRequestListIngestorTest` 3 · `LiveSpanRuntimeStreamTest` 7 · `ApmStuckRequestQueryServiceTest` 2).

## 커밋·병합·런타임 확인 (2026-10-22)
- BE `ce9e662`(30파일)·FE `a06d1f8`(2파일) — 둘 다 master ff 병합(미푸시).
- 런타임: dev BE(:3000, 5433) 재기동 → 500일 전 해소된 합성 이벤트 1건 삽입 → `POST /settings/schedulers/apm_retention/run` → 요약 `alertEvents=1`, 합성 이벤트만 삭제·기존 16건 유지.
