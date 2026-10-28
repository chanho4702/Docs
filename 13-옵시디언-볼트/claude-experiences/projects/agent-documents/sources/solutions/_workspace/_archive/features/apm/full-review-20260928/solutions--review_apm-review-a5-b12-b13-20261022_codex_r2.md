## 판정

**반려 — 1차의 구체 반례 3종은 해소됐지만, `currentOp`에서 SQL 리터럴이 남는 새 우회 3종을 발견했습니다.**

제공된 `r2.diff`는 현재 `git diff HEAD`와 일치합니다. 파일 수정·빌드·프로젝트 테스트 실행은 하지 않았습니다. **4,399건 통과·뮤테이션 15종 결과는 요청서의 주장이며 독립 재검증하지 않았습니다.**

아래 **확인**은 소스 사실, **예상**은 정적 분석입니다. 반례의 정규식 처리는 Python으로 별도 모사했으며, Java·PostgreSQL 실행 검증은 아닙니다.

## 🔴 필수

1. **SQL 주석 안의 작은따옴표가 뒤의 실제 문자열 마스킹을 무너뜨립니다.**

   **확인:** `STRING_LITERAL`은 주석을 구분하지 않고 따옴표를 짝짓습니다. 이후 미닫힘 처리는 마지막에 남은 따옴표 뒤만 제거합니다.  
   근거: [ApmRuntimeTextRedactor.java:40](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:40), [치환·미닫힘 처리:117](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:117).

   **재현 입력:**
   ```text
   DB postgresql SELECT /* user's */ 'kim@example.com'
   ```

   **예상 결과:**
   ```text
   DB postgresql SELECT /* user?kim@example.com?…
   ```

   주석의 `'`부터 실제 문자열의 여는 `'`까지 치환되어 이메일이 남습니다. 주석·인용 식별자와 문자열의 경계를 구분하거나, 해석하지 못하는 문법은 설명 전체를 `UNMASKABLE`로 처리해야 합니다.

2. **비ASCII dollar-quote 태그는 여전히 통과합니다.**

   **확인:** 수정된 `DOLLAR_QUOTE`도 태그를 `[A-Za-z_][A-Za-z_0-9]*`로 제한합니다. PostgreSQL의 dollar-quote 태그는 비ASCII 문자를 허용하는 unquoted identifier 규칙을 따릅니다. [PostgreSQL 공식 문서](https://www.postgresql.org/docs/16/sql-syntax-lexical.html#SQL-SYNTAX-DOLLAR-QUOTING)  
   근거: [ApmRuntimeTextRedactor.java:48](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:48), [검출 분기:114](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:114).

   **재현 입력:**
   ```text
   DB postgresql SELECT $태그$kim@example.com$태그$
   ```

   **예상:** 입력이 그대로 반환됩니다. 설계 §6.5의 “dollar-quoted는 통째로 판정 불가”를 충족하려면 이 태그도 검출해야 합니다.

3. **밑줄을 포함한 숫자와 2진·8진 리터럴이 그대로 남습니다.**

   **확인:** `NUMBER_LITERAL`은 밑줄을 허용하지 않으며, 비10진 접두는 `0x`만 지원합니다. 경계 조건의 `\w` 때문에 해당 숫자의 일부도 치환되지 않습니다.  
   근거: [ApmRuntimeTextRedactor.java:45](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:45).

   **재현 입력:**
   ```text
   DB postgresql SELECT 123_456_789, 0b101010, 0o755
   ```

   **예상:** 세 리터럴 모두 그대로 반환됩니다. 이들은 PostgreSQL 16에서 유효한 숫자 표기입니다. [PostgreSQL 공식 문서](https://www.postgresql.org/docs/16/sql-syntax-lexical.html#SQL-SYNTAX-CONSTANTS-NUMERIC)

   숫자 마스킹 범위를 보완하거나, 지원하지 않는 표기는 `UNMASKABLE`로 처리해야 합니다.

**공통 재현 시나리오:** `keepRawSql=false`에서 유효한 `active_requests` 레코드의 `o`에 위 입력을 넣습니다. 수신은 같은 redactor를 사용하며, 비관리자 REST·SSE도 이를 재사용합니다. 위 예상 출력은 재적용해도 민감값이 남습니다. 근거: [수신:160](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:160), [REST:35](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:35), [SSE:59](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:59).

## 🟡 권장

- 새 반례는 단위 테스트와 함께 **수신 → 비관리자 응답** 경로에서도 확인하세요. 같은 함수를 여러 번 적용하는 것만으로 가림이 강화되지는 않습니다.
- B13 발급 롤백 테스트는 추가됐습니다. 편집 권한을 가진 비관리자의 실제 MVC 요청에서 **HTTP 200 + body `code:403`·`APM_RAW_SQL_ADMIN_ONLY`**까지 확인하는 보강은 남습니다.
- 아카이브의 초과 길이·깨진 JSON은 `maskJson` 직접 테스트를 권장합니다. 정책 단위 테스트만으로는 해당 연결 경로의 회귀를 잡지 못합니다.

## 🟢 확인된 것

- **1차 🔴1~3의 구체 입력은 소스상 해소됐습니다.** `$tag1$` 검출, 백슬래시 포함 DB 설명 전체 차단, 지수형 숫자 처리가 추가됐습니다.
- **A5 루프는 설계와 일치합니다.** cutoff 고정, 묶음별 `REQUIRES_NEW`, 이벤트 `SKIP LOCKED`, 통지 `NOWAIT`, 잠금 후 상태 판정, 후보 마지막 ID 커서, 후보 수 기준 종료가 구현됐습니다. 55P03이면 묶음을 롤백하고 다음 후보로 진행합니다. [ApmRetentionService.java:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 변경은 잠금 뒤 DB 값으로 판정합니다.** 거부는 저장 전에 발생하며, 같은 값은 쓰지 않습니다. [ApmSettingService.java:251](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:251)
- **권한 생략 overload 5종은 제거됐습니다.** 토큰 발급에서 `generateForIssue`까지 권한 인자가 전달됩니다.
- **B12 초과 입력 처리와 프레임 검증이 반영됐습니다.** 자유 텍스트는 `UNMASKABLE`, 초과 스택은 전체 문법·512자 상한을 만족하는 프레임만 보존합니다. [ApmSqlPolicy.java:120](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:120), [ApmSqlMasker.java:130](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:130)
- 다중 통지 경합 후 다음 묶음 진행과 토큰 발급 롤백을 확인하는 테스트 코드가 추가됐습니다. **통과 여부는 재실행하지 않았습니다.**

## 판단 요청 답 (요청서의 1~4)

1. **설계 적합성:** A5 묶음 루프와 B13 설정 잠금에서는 추가 필수 결함을 발견하지 못했습니다. SQL 가림은 위 세 경로에서 설계의 문자열·숫자 마스킹 및 dollar-quote 차단을 충족하지 못합니다. 동시성 판단은 정적 검토입니다.

2. **정규식·디코딩 우회:** `STRING_LITERAL`, `DOLLAR_QUOTE`, `NUMBER_LITERAL`에서 위 반례를 발견했습니다. `RPC_FORM`, `FRAME`, 경로 디코딩에서는 이번 검수로 추가 필수 결함을 특정하지 못했습니다.

3. **권한 생략 호출:** 요청서 본문의 설명과 달리 현재 구현에서는 해당 overload가 제거됐습니다. 운영 호출부에서 권한 없이 원문 스위치를 켜거나 원문 조회를 허용하는 추가 경로는 발견하지 못했습니다.

4. **깨진 JSON 아카이브 폴백:** **수용 가능합니다.** 마스킹이 필요한 경로에서 해석하지 못한 초과 원문을 포기하는 정책입니다. 기준은 16KB 바이트가 아니라 **`String.length()` 기준 16,384 초과**입니다. `maskJson`은 해당 정책으로 연결되고, JSONL 작성기는 대체값을 문자열로 처리할 수 있습니다. [ApmArchiveSource.java:404](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:404), [JsonlTabularWriter.java:122](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/export/JsonlTabularWriter.java:122)
