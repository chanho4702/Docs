## 판정

**반려 — 6차 🔴1~2는 해소됐지만, B13에서 HTTP 설명과 인코딩된 `#`를 통한 원문 통과가 남습니다.**

파일은 수정하지 않았습니다. `r7.diff`는 현재 `git diff HEAD`와 줄바꿈 정규화 후 일치합니다. 아래 함수 반환값은 실제 소스의 메서드를 JDK 17 JShell 메모리에서 평가해 확인했습니다. 전체 빌드·JUnit·PG IT·뮤테이션 결과는 독립 재검증하지 않았으며 요청서의 주장으로 구분합니다.

## 🔴 필수

1. **HTTP 접두만 붙이면 형식이 잘못된 원문도 그대로 통과합니다.**

   **코드 확인:** `op()`는 `HTTP` 접두만 확인합니다. `http()`는 첫 `/` 앞을 그대로 보존하고, `/`가 없으면 쿼리·프래그먼트를 제외한 문자열 전체를 반환합니다. 근거: [HTTP 분기:64](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:64), [http():191](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:191).

   **메서드 재현:** 다음 입력은 한 번·두 번 적용 모두 입력 그대로 반환됩니다.

   ```text
   HTTP SELECT 'kim@example.com'
   HTTP GET 'kim@example.com'/orders
   ```

   **재현 시나리오·영향 추론:** 다른 송신자가 유효한 `active_requests` 본문의 `o`에 위 값을 넣으면, `keepRawSql=false`여도 적재 가림을 통과합니다. 비관리자 REST와 SSE도 같은 함수를 사용하므로 다시 제거되지 않습니다. 실제 REST/SSE 전송은 실행하지 않았습니다. 근거: [적재:160](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:160), [SSE:62](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:62).

   **필요 조치:** HTTP 설명의 형식을 검증하고, 따옴표·임의 본문 등이 포함돼 판정할 수 없는 입력은 `UNMASKABLE`로 처리해야 합니다.

2. **디코딩된 `#`가 긴 토큰 판정을 무력화합니다.**

   **코드 확인:** 디코딩 후 구분자 검사는 `/`·`?`만 포함합니다. `#`가 붙으면 `longToken()`도 거짓이 되어 원래 구간이 반환됩니다. 근거: [구분자 검사:216](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:216), [토큰 문자 검사:260](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:260).

   **메서드 재현:**

   ```text
   /reset/a1B2c3D4e5F6g7H8i9J0k1L2m3       → /reset/{id}
   /reset/a1B2c3D4e5F6g7H8i9J0k1L2m3%23   → 입력 그대로
   /reset/a1B2c3D4e5F6g7H8i9J0k1L2m3%2523 → 입력 그대로
   ```

   두 번 적용해도 같습니다. 비교 대상으로 `%2F`·`%3F`를 붙인 경우는 `{id}`로 바뀝니다.

   **재현 시나리오·영향 추론:** 위 경로를 `p` 또는 HTTP 설명의 경로로 보내면 적재·비관리자 조회·SSE의 공통 가림을 통과합니다.

   **필요 조치:** 설계 §6.4의 인코딩된 구분자 방어에 `#`도 포함해, 디코딩 후 해당 구간 전체를 `{id}`로 처리해야 합니다.

## 🟡 권장

- 요청서 앞부분의 **`framesOnly` 보존**, **2인자 권한 생략 overload 존재** 설명을 현재 구현과 맞추세요. 끝의 수정 이력과 본문 요약이 충돌합니다.
- 위 두 반례는 최초 적용뿐 아니라 **재적용·적재·SSE 사본**까지 회귀 테스트로 고정하는 편이 좋습니다.

## 🟢 확인된 것

- **6차 🔴1 해소:** `%FF`·`%C0%AF`·`%E2%82`·`%ED%A0%80` 입력 4종이 모두 `{id}`로 바뀝니다. [U+FFFD 가드:213](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:213)
- **6차 🔴2 해소:** SQL 문자열 안에 프레임 모양 줄을 넣은 초과 스택이 통째로 `?(unmaskable)`이 됩니다. 재적용도 같습니다. [초과 스택 분기:159](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:159)
- **A5 정적 확인:** 고정 cutoff, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 묶음 롤백 후 진행, 후보 수에 따른 종료가 구현돼 있습니다. 추가 필수 결함은 발견하지 못했습니다. [배치:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 정적 확인:** advisory xact lock 이후 DB 값으로 전이를 판정하고, 같은 값의 쓰기를 생략합니다. 확인한 운영 호출부는 원문 자격을 명시적으로 전달합니다. [설정 판정:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)
- **기록된 상한 이하 스택의 한계는 이번 범위에서 수용합니다.** B12의 초과 입력 우회와 구분하며, 재반려 근거로 삼지 않습니다. 다만 프레임 문법 내부 문자열까지 비밀 제거를 보장하는 구현은 아닙니다.

## 판단 요청 답

1. **설계 정합성:** A5 배치와 B13 설정 잠금·동일 값 생략에서 추가 누락은 발견하지 못했습니다. §7·§8의 후속 변경도 반영돼 있습니다. 동시성 동작은 정적 확인이며 PG에서 재실행하지 않았습니다.
2. **우회 경로:** 위 HTTP 형식 검증과 `%23` 처리 보완이 필요합니다. DB 중단 방식·`RPC_FORM`에서는 이번 검수에서 추가 반례를 확인하지 못했습니다.
3. **권한 없이 원문 스위치를 켜는 호출:** 확인한 운영 호출 경로에서는 발견하지 못했습니다. 권한 생략 overload는 제거됐고, 토큰 발급에서 설정 생성까지 `rawAllowed`가 전달됩니다.
4. **깨진 JSON 아카이브 폴백:** **수용합니다.** 파싱 실패 후 `MASKED.applyToFreeText()`로 이어져 초과 입력은 `UNMASKABLE`이 됩니다. 정확한 경계는 바이트 기준 16KB가 아니라 **`String.length() > 16,384`**입니다. [폴백:410](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:410)
