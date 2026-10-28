## 판정

**반려 — DB 인용 중단 방식의 새 우회는 발견하지 못했지만, B13 경로 디코딩과 B12 긴 스택 처리에서 원문 토큰이 남는 반례를 확인했습니다.**

파일은 수정하지 않았습니다. 제공된 `r6.diff`는 현재 `git diff HEAD`와 줄바꿈 정규화 후 일치합니다. 아래 반례는 실제 소스의 순수 함수 본문을 JDK 17 JShell 메모리에서 실행해 확인했습니다. 전체 빌드·JUnit·PG IT·REST·뮤테이션 결과는 독립 재검증하지 않았으며 요청서의 주장으로 취급합니다.

## 🔴 필수

1. **B13: 잘못된 UTF-8 percent-encoding이 긴 토큰 가림을 우회합니다.**

   **코드 확인:** `URLDecoder.decode()`는 `%FF` 같은 잘못된 UTF-8 바이트를 예외 대신 대체 문자로 바꿉니다. 따라서 `IllegalArgumentException` 분기에 걸리지 않고, 대체 문자가 섞인 구간은 `longToken()`에서도 거짓이 됩니다. 최종 출력에는 원래 구간을 사용합니다. 근거: [디코딩:206](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:206), [민감값 판정:214](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:214), [토큰 문자 검사:255](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:255).

   **직접 재현:**

   ```text
   입력: /reset/a1B2c3D4e5F6g7H8i9J0k1L2m3
   출력: /reset/{id}

   입력: /reset/%FFa1B2c3D4e5F6g7H8i9J0k1L2m3
   출력: /reset/%FFa1B2c3D4e5F6g7H8i9J0k1L2m3
   ```

   `%C0%AF`, `%E2%82`, `%ED%A0%80`에서도 확인했습니다. 다시 적용해도 그대로이며, `HTTP GET api.example.com/reset/%FF…`도 토큰을 보존합니다.

   **영향 추론:** 유효한 `active_requests` JSON의 `p` 또는 HTTP `o`에 넣으면 적재·비관리자 REST·SSE의 동일 함수 재적용으로도 제거되지 않습니다. 실제 전송은 검증하지 않았습니다.

   **필요 조치:** percent-encoding의 UTF-8 바이트를 엄격하게 검증하고, 잘못된 시퀀스는 구간 전체를 `{id}`로 처리해야 합니다. 설계 §6.4의 “깨진 인코딩은 가림”이 현재 충족되지 않습니다.

2. **B12: SQL 문자열 안에 프레임 문법과 정확히 같은 줄이 있으면, 긴 스택에서도 그 원문을 보존합니다.**

   **코드 확인:** `framesOnly()`는 앞뒤 문맥과 무관하게 `FRAME`에 맞는 줄을 그대로 복사합니다. 전체 줄 문법 검증은 SQL 리터럴의 내용인지까지 구분하지 못합니다. 근거: [초과 스택 분기:157](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:157), [프레임 복사:114](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:114), [FRAME:139](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:139).

   **직접 재현한 입력 구성:**

   ```java
   String frame =
       "    at com.x.sk_live_a1B2c3D4e5F6g7H8i9J0.run(Source.java:42)";
   String input =
       "java.sql.SQLException: INSERT INTO error_log(payload) VALUES ('begin\n"
       + frame + "\n" + "x".repeat(17000) + "');";
   ```

   `MASKED.applyToStackTrace(input)`의 실제 출력:

   ```text
   ?(unmaskable)
       at com.x.sk_live_a1B2c3D4e5F6g7H8i9J0.run(Source.java:42)
   ?(unmaskable)
   ```

   토큰은 입력 SQL의 문자열 리터럴 **안**에 있습니다. 정책을 다시 적용해도 남습니다.

   **영향 추론:** 적재 경로는 정책 적용 후 절단하므로 짧아진 결과 전체가 저장될 수 있습니다. 비관리자 조회도 같은 정책을 사용합니다. 근거: [적재:318](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanAttrAllowlist.java:318), [조회:33](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmRawTextView.java:33).

   **필요 조치:** 설계 §5.1의 “프레임 줄에는 원문이 섞이지 않는다”는 전제를 보완해야 합니다. 출처를 구분할 수 없는 초과 스택은 전체 `UNMASKABLE`로 처리하거나, 신뢰할 수 있는 구조화된 프레임만 별도로 보존해야 합니다.

## 🟡 권장

- [클래스 Javadoc:24](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:24)의 “큰따옴표 문자열은 그대로 둔다”는 설명은 현재 구현·설계 §7과 충돌합니다.
- 위 두 반례를 회귀 테스트에 추가하세요. 기존 `%zz` 테스트는 잘못된 UTF-8 바이트를, 기존 프레임 위장 테스트는 프레임 문법 자체에 들어맞는 SQL 문자열 내용을 검사하지 않습니다.

## 🟢 확인된 것

- **DB 중단 규칙:** 식별자·숫자 소비 루프가 인용·주석 시작 문자를 삼키지 않고, 중단 분기에서 즉시 반환합니다. 별도 무작위 입력 **100,000건**에서 삽입한 비밀값이 1회·2회 적용 결과에 남는 사례는 없었습니다. 유한 표본 검증이며 모든 입력에 대한 증명은 아닙니다.
- **5차 반례:** 현재 출력은 `DB bigquery SELECT ?…`, 재적용 출력은 `DB bigquery SELECT ??…`이며 토큰은 제거됩니다.
- **A5 정적 확인:** 고정 cutoff, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 묶음 롤백 후 진행이 구현되어 있습니다. [ApmRetentionService.java:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 정적 확인:** advisory xact lock 이후 DB 값으로 전이를 판정하고, 같은 값의 쓰기를 생략합니다. [ApmSettingService.java:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)
- 비관리자 REST 재가림과 SSE 사본 가림 호출이 존재합니다. 이번 두 결함은 호출 누락이 아닌 공통 처리 함수의 문제입니다.

## 판단 요청 답

1. **설계 정합성:** A5 묶음 루프와 B13 설정 잠금에서 추가 필수 결함은 발견하지 못했습니다. B13 경로는 깨진 인코딩 처리에 누락이 있고, B12는 설계의 프레임 안전성 전제 자체를 보완해야 합니다. 동시성 동작은 정적 확인입니다.
2. **우회 경로:** DB 인용 중단 방식에서는 새 우회를 발견하지 못했습니다. 경로 디코딩과 `FRAME`에는 위 반례가 있습니다. `RPC_FORM`에서는 추가 결함을 확정하지 못했습니다.
3. **권한 없는 원문 스위치 호출:** 확인한 운영 호출부에서는 추가 우회를 발견하지 못했습니다. 권한 생략 overload가 제거됐고, 관리자 판정이 `generateForIssue()`까지 전달됩니다.
4. **깨진 JSON 아카이브 폴백:** 수용 가능합니다. 파싱 실패가 `MASKED.applyToFreeText()`로 연결되므로 초과 입력은 `UNMASKABLE`이 됩니다. 경계는 바이트 단위 16KB가 아닌 **`String.length()` 기준 16,384 초과**입니다. [ApmArchiveSource.java:410](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:410)
