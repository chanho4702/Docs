## 판정

**반려 — 2차 🔴1~3의 구체 반례는 해소됐지만, 새 토크나이저에서도 SQL 원문이 남는 우회 2종을 발견했습니다.**

제공된 `r3.diff`는 현재 `git diff HEAD`와 일치합니다. 파일 수정·빌드·프로젝트 테스트는 하지 않았습니다. **4,403건 통과와 뮤테이션 결과는 요청서의 주장이며 독립 재검증하지 않았습니다.** 아래 출력은 Java 분기를 Python으로 모사한 결과이며, 실제 Java·DB·REST 실행 결과와 구분합니다.

## 🔴 필수

1. **MySQL backtick·SQL Server 대괄호 식별자 안의 작은따옴표가 뒤쪽 문자열 마스킹을 무너뜨립니다.**

   **코드 확인:** 인용 식별자는 큰따옴표만 처리합니다. backtick과 `[`는 일반 문자로 통과하고, 내부의 `'`가 문자열 시작으로 처리됩니다. 근거: [작은따옴표 분기:135](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:135), [큰따옴표 분기:154](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:154).

   **재현 입력과 모사 출력:**
   ```text
   입력: DB mysql SELECT `user's`, 'kim@example.com' FROM t
   출력: DB mysql SELECT `user?kim@example.com?…

   입력: DB mssql SELECT [user's], 'kim@example.com' FROM t
   출력: DB mssql SELECT [user?kim@example.com?…
   ```

   해당 이름의 컬럼이 있는 테이블에서 유효한 문법입니다. 두 방언 모두 인용 식별자에 작은따옴표를 허용합니다. [MySQL 공식 문서](https://dev.mysql.com/doc/refman/8.0/en/identifiers.html?ff=nopfpls), [SQL Server 공식 문서](https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers?view=sql-server-ver16)

   **필요 조치:** 해당 인용 식별자를 토큰으로 처리하거나, 지원하지 않는 구분자를 만나면 설명 전체를 `UNMASKABLE`로 처리해야 합니다.

2. **Oracle 대체 인용 문자열 `q'…'` 내부의 작은따옴표 이후 원문이 남습니다.**

   **코드 확인:** `q`는 일반 식별자로 보존하고, 이어지는 `'`부터 일반 문자열 규칙을 적용합니다. 대체 인용 구분자를 인식하지 않습니다. 근거: [식별자 분기:187](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:187), [문자열 종료 판정:141](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:141).

   **재현 입력과 모사 출력:**
   ```text
   입력: DB oracle SELECT q'[it's kim@example.com]' FROM dual
   출력: DB oracle SELECT q?s kim@example.com]?…
   ```

   Oracle에서는 `]'`가 문자열 종료이며, `it's`의 `'`는 내용입니다. [Oracle 공식 문서](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Literals.html)

   **필요 조치:** `q`·`nq` 대체 인용을 처리하거나, 해당 형식을 만나면 전체를 `UNMASKABLE`로 처리해야 합니다.

**공통 재현 시나리오·영향 추론:** `keepRawSql=false`에서 유효한 `active_requests` 레코드의 `o`에 위 입력을 넣습니다. 수신과 비관리자 REST·SSE가 같은 redactor를 사용하므로 이메일이 남을 것으로 판단합니다. 모사 출력에는 작은따옴표가 남지 않아 재적용도 이메일을 제거하지 못합니다. 근거: [수신:160](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:160), [REST 사본:38](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:38), [SSE:62](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:62).

## 🟡 권장

- 새 반례를 redactor 단위 테스트와 **수신 → 비관리자 응답·SSE** 경로에 추가하세요. 이미 가린 결과에 다시 적용해도 민감값이 없는지도 확인해야 합니다.
- 요청서 본문의 “권한 생략 overload가 남아 있다”는 설명을 현재 구현과 맞추세요. 끝의 반영 내역과 본문이 상충합니다.

## 🟢 확인된 것

- **2차 🔴1~3의 구체 반례는 코드상 해소됐습니다.** 주석을 별도 토큰으로 제거하고, 비ASCII dollar 태그도 `$` 분기에서 차단하며, 밑줄·2진·8진 숫자를 통째로 가립니다. 해당 테스트도 추가됐습니다. [토크나이저:123](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:123), [회귀 테스트:54](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactorTest.java:54)
- **A5 루프는 설계 §5·§6과 일치합니다.** cutoff 고정, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 이벤트 `SKIP LOCKED`, 통지 `NOWAIT`, 잠금 후 상태 판정, 경합 시 묶음 롤백·다음 후보 진행이 구현돼 있습니다. [ApmRetentionService.java:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 변경은 잠금 후 DB 값으로 판정합니다.** 거부는 저장 전에 발생하며 같은 값은 쓰지 않습니다. [ApmSettingService.java:251](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:251)
- 수신 반례, MVC의 권한 전달·403 envelope, 초과 길이 깨진 JSON 폴백을 확인하는 테스트 코드가 추가됐습니다. **통과 여부는 재실행하지 않았습니다.**

## 판단 요청 답 (요청서의 1~4)

1. **설계 적합성:** A5 묶음 처리와 B13 설정 잠금에서는 추가 필수 결함을 발견하지 못했습니다. B12 초과 입력 정책도 구현됐습니다. B13 DB 설명 가림은 위 두 우회 때문에 보완이 필요합니다.

2. **토크나이저·정규식·디코딩 우회:** 위 인용 식별자와 Oracle 대체 인용에서 새 우회를 확인했습니다. `RPC_FORM`, `FRAME`, 경로 디코딩에서는 이번 정적 검수로 추가 필수 결함을 확정하지 못했습니다.

3. **권한 생략 호출:** 요청서 본문과 달리 해당 overload 5종은 제거돼 있습니다. 검토한 운영 호출부는 권한을 명시적으로 전달하며, 권한 없이 원문 스위치를 켜는 추가 호출 경로는 발견하지 못했습니다.

4. **깨진 JSON 아카이브 폴백:** 수용 가능합니다. 파싱 실패가 `MASKED.applyToFreeText`로 연결되고, 초과 입력은 `UNMASKABLE`이 됩니다. 정확한 경계는 **16KB가 아니라 `String.length()` 기준 16,384 초과**입니다. 직접 테스트도 추가됐습니다. [폴백:404](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:404), [직접 테스트:60](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSourceTest.java:60)
