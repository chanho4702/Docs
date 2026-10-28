## 판정

**반려 — 인접·접두·이메일 안전망을 모두 통과하면서 SQL 문자열 안의 토큰 원문이 남는 입력이 있습니다.**

제공된 `r5.diff`는 현재 `git diff HEAD`와 줄바꿈 정규화 후 일치합니다. 파일은 수정하지 않았습니다. 아래 반례는 **실제 클래스를 JDK 17 JShell에서 메모리로 실행하여 확인**했습니다. 전체 빌드·JUnit·PG IT·REST·뮤테이션 결과는 독립 재검증하지 않았으며, 요청서의 주장으로 취급합니다.

## 🔴 필수

1. **따옴표 오판 지점 양쪽에 공백이 있으면 세 안전망을 모두 우회합니다.**

   **코드 확인:** 문자열 처리는 `''`를 이스케이프로 읽습니다. 잘못 찾은 닫는 따옴표 뒤가 공백이면 인접 검사를 통과하고, 이후 작은따옴표 앞도 공백이면 접두 검사를 통과합니다. 중간 토큰은 식별자로 보존되며, 이메일 검사에도 걸리지 않습니다. 근거: [문자열 처리:148](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:148), [인접 검사:159](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:159), [접두 검사:274](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:274).

   **재현 입력과 실제 출력** — 토큰은 검수용 가상 값입니다.

   ```text
   입력: DB bigquery SELECT '''hello' sk_live_a1B2c3D4e5F6g7H8i9J0 'bye'''
   1회: DB bigquery SELECT ? sk_live_a1B2c3D4e5F6g7H8i9J0 ?
   2회: DB bigquery SELECT ? sk_live_a1B2c3D4e5F6g7H8i9J0 ?
   ```

   BigQuery의 작은따옴표 3중 인용은 내부 작은따옴표를 허용하므로, 토큰은 실제로 **문자열 리터럴의 내용**입니다. [Google 공식 문자열 문법](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/lexical#string_and_bytes_literals)

   **영향 추론:** `keepRawSql=false`에서 유효한 `active_requests` 레코드의 `o`에 위 입력을 넣으면, [적재 시 마스킹](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:160)을 통과합니다. 비관리자 REST와 [SSE](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:62)도 같은 함수를 재적용하므로 토큰이 노출될 것으로 판단합니다. 실제 전송 검증은 하지 않았습니다.

   **필요 조치:** 경계를 해석하지 못한 인용 구문은 누적 출력까지 버리고 설명 전체를 `DB ?(unmaskable)`로 처리해야 합니다. 현재 세 안전망만으로 경계의 안전성을 보장할 수 없습니다. 이 반례는 설계 §6.5에서 수용한 **큰따옴표 문자열 한계와 별개**입니다.

## 🟡 권장

- [재적용 테스트:121](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactorTest.java:121)는 `kim@exam` 부재만 검사합니다. 토큰·비밀번호 같은 가상 민감값도 포함하고, 내부 따옴표 앞뒤를 공백·구두점으로 바꾼 경우까지 검사하는 편이 좋습니다.

## 🟢 확인된 것

- 4차 반례에 대응한 `]]` 건너뛰기와 세 안전망은 실제 코드에 구현되어 있습니다. 기존 `'''it's kim@example.com'''` 입력이 재적용 후에도 `DB ?(unmaskable)`인 것은 직접 확인했습니다.
- B12는 초과 자유 텍스트를 `UNMASKABLE`로 바꾸고, 초과 스택은 전체 형식과 길이를 검증한 프레임만 남깁니다. [정책:127](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:127), [프레임 검증:130](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:130)
- 비관리자 REST와 SSE에서 다시 가리는 호출은 존재합니다. 이번 결함은 호출 누락이 아니라 공통 redactor의 경계 해석 문제입니다.

## 판단 요청 답

1. **설계 §5·§6 정합성:** A5와 B13 설정 갱신에서 추가 필수 결함은 발견하지 못했습니다. A5는 고정 cutoff, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 롤백 후 진행을 구현합니다. B13은 advisory xact lock 이후 DB 값으로 판정하고 같은 값의 쓰기를 생략합니다. **정적 확인이며 동시성 재검증은 아닙니다.** [A5:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564), [B13:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)

2. **우회 경로:** 위 작은따옴표 인용 반례가 남습니다. `RPC_FORM`, `FRAME`, 경로 디코딩에서는 추가 필수 결함을 확정하지 못했습니다. 큰따옴표 문자열의 수용된 한계는 신규 지적에서 제외했습니다.

3. **권한 없는 원문 스위치 호출:** 확인한 운영 호출부에서는 추가 우회를 발견하지 못했습니다. 권한 생략 overload는 제거됐고, 컨트롤러의 관리자 판정이 토큰 발급의 `generateForIssue`까지 전달됩니다. [설정 호출:136](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/setting/ApmSettingController.java:136), [발급 전달:255](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:255)

4. **깨진 JSON 아카이브 폴백:** 수용 가능합니다. 파싱 실패가 `MASKED.applyToFreeText`로 연결되어 초과 입력은 `UNMASKABLE`이 됩니다. 경계는 바이트 단위 16KB가 아니라 **`String.length()` 기준 16,384 초과**입니다. [폴백:410](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:410)
