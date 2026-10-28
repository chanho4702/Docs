## 판정

**반려 — 3차의 구체 반례는 차단됐지만, 해석하지 못한 인용 구문을 부분 처리하여 이메일 원문을 남기는 경로 2종이 있습니다.**

제공된 `r4.diff`는 현재 `git diff HEAD`와 줄바꿈 정규화 후 일치합니다. 파일은 수정하지 않았습니다. 프로젝트 빌드·JUnit·DB·REST는 실행하지 않았으며, **테스트 통과·뮤테이션 결과는 요청서의 주장으로 독립 재검증하지 않았습니다.** 아래 출력은 현재 Java 분기를 별도로 모사한 결과입니다.

## 🔴 필수

1. **대괄호 검사에서 이스케이프된 `]]`를 닫는 구분자로 오인합니다.**

   **코드 확인:** 첫 번째 `]`만 찾아 그 앞의 작은따옴표를 검사합니다. 이후 내용은 일반 SQL 토큰으로 처리하므로, 실제 식별자 내부의 작은따옴표가 문자열 시작으로 해석됩니다. 근거: [ApmRuntimeTextRedactor.java:168](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:168), [문자열 처리:136](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:136).

   **재현 입력과 모사 출력:**

   ```text
   입력: DB mssql SELECT [user]]'s], 'kim@example.com' FROM t
   1회: DB mssql SELECT [user]]?kim@example.com?…
   2회: DB mssql SELECT [user]]?kim@example.com?…
   ```

   SQL Server에서 식별자 내부의 `]`는 `]]`로 이스케이프하므로, 해당 컬럼이 존재하면 유효한 쿼리입니다. [Microsoft 공식 식별자 문서](https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers?view=azuresqldb-current)

   **필요 조치:** 실제 대괄호 경계를 입증하지 못하면 설명 전체를 `DB ?(unmaskable)`로 바꿔야 합니다. 현재의 “첫 `]` 앞에 작은따옴표가 없으면 진행” 조건으로는 3차 🔴1을 완전히 해소하지 못합니다.

2. **미지원 작은따옴표 3중 인용을 일반 문자열로 부분 해석합니다.**

   **코드 확인:** 문자열 분기는 `'…'`와 `''`만 처리하며, `'''…'''`를 판정 불가로 전환하는 분기가 없습니다. 내부 작은따옴표에서 문자열을 조기 종료한 뒤 나머지를 식별자·일반 문자로 보존합니다. 근거: [문자열 종료 판정:142](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:142), [식별자 보존:200](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:200).

   **재현 입력과 모사 출력:**

   ```text
   입력: DB bigquery SELECT '''it's kim@example.com'''
   1회: DB bigquery SELECT ?s kim@example.com?…
   2회: DB bigquery SELECT ?s kim@example.com?…
   ```

   BigQuery의 3중 인용 문자열은 내부 따옴표를 이스케이프 없이 허용합니다. [Google 공식 문자열 문법](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/lexical#string_and_bytes_literals)

   **필요 조치:** 지원하지 않는 인용 형식임을 감지하면 누적 출력까지 버리고 설명 전체를 판정 불가로 반환해야 합니다. 이 반례는 **해석할 수 없는 구문을 일반 문자열로 처리해 원문을 남긴다**는 원칙 위반입니다.

**공통 재현 시나리오·영향 추론:** `keepRawSql=false`에서 유효한 `active_requests` 레코드의 `o`에 위 입력을 넣습니다. 적재는 [동일 redactor를 호출](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:160)하고, 비관리자 [REST 사본](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:38)과 [SSE](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:62)도 재적용합니다. 두 모사 출력은 재적용해도 이메일이 남으므로, 이 경로들에서도 원문이 노출될 것으로 판단합니다. 실제 전송 재현은 수행하지 않았습니다.

## 🟡 권장

- [재적용 회귀 테스트](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactorTest.java:78)에 위 두 반례를 추가하고, 판정 불가 구문은 **설명 전체가 대체값인지**도 검사하세요. 수신·과거 저장값의 비관리자 REST·SSE 경로에도 같은 입력을 포함하는 것이 좋습니다.

## 🟢 확인된 것

- **3차의 구체 반례는 차단됩니다.** backtick은 인용 토큰으로 읽고, `[user's]`는 전체 판정 불가로 처리하며, Oracle `q`·`nq` 바로 뒤의 작은따옴표도 차단합니다. [backtick 처리:155](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:155), [Oracle 가드:208](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:208)
- **B12 초과 입력 방어가 구현돼 있습니다.** 자유 텍스트는 `UNMASKABLE`, 초과 스택은 전체 형식·길이를 검증한 프레임만 보존합니다. [ApmSqlPolicy.java:127](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:127), [프레임 검증:130](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:130)
- 기존 반례의 재적용 검사와 깨진 JSON 초과 입력 직접 테스트가 추가돼 있습니다. **테스트 코드의 존재를 확인했으며, 통과 여부는 재실행하지 않았습니다.**

## 판단 요청 답

1. **설계 §5·§6 정합성:** A5와 B13 설정 갱신에서는 추가 필수 결함을 발견하지 못했습니다. A5는 cutoff 고정, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 롤백·다음 후보 진행을 구현합니다. B13은 advisory xact lock 이후 DB 값으로 전이를 판정하고 같은 값의 쓰기를 생략합니다. [A5:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564), [B13:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)

2. **토크나이저·정규식·디코딩 우회:** 위 SQL 인용 경로 2종이 남습니다. `RPC_FORM`, `FRAME`, 경로 디코딩에서는 이번 정적 검수로 추가 필수 결함을 확정하지 못했습니다. 설계 §6.5에서 수용한 큰따옴표 문자열 한계는 이번 신규 지적에서 제외했습니다.

3. **권한 없는 원문 스위치 호출:** 운영 호출부에서 추가 우회를 발견하지 못했습니다. 권한 생략 overload는 제거됐으며, 컨트롤러는 `canViewRawText(currentUser)`를 전달하고 토큰 발급도 이를 `generateForIssue`까지 전달합니다. [설정 호출:136](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/setting/ApmSettingController.java:136), [발급 전달:255](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:255)

4. **깨진 JSON 아카이브 폴백:** 수용 가능합니다. 파싱 실패가 `MASKED.applyToFreeText`로 연결되어 초과 입력은 `UNMASKABLE`이 됩니다. 정확한 경계는 **16KB가 아니라 `String.length()` 기준 16,384 초과**입니다. [폴백:410](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:410), [직접 테스트:60](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSourceTest.java:60)
