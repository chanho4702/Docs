## 판정

**반려 — 8차의 영숫자 토큰 반례는 해소됐지만, 내부에 `.`·`~`·`=`가 있는 토큰은 같은 방식으로 원문이 통과합니다.**

파일은 수정하지 않았습니다. r9 diff는 줄바꿈 정규화 후 현재 `git diff HEAD`와 일치합니다. 아래 함수 결과는 현재 소스를 JDK 17 JShell 메모리에서 평가했습니다. 빌드·JUnit·PG IT·뮤테이션 통과 보고는 독립 재검증하지 않았으며 요청서의 주장입니다.

## 🔴 필수

1. **토큰 검사와 조각 분리의 문자 집합이 달라, 기존에 가리던 토큰도 접미 문자 하나로 우회합니다.**

   **코드 확인:** `longToken()`은 내부의 `.`·`=`·`~`를 허용합니다. 하지만 새 조각 판정은 이 문자에서도 분리합니다. 끝에 `+`가 붙으면 전체 토큰 검사는 실패하고, 분리된 조각들은 각각 24자 미만이라 통과합니다. 근거: [전체 판정:238](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:238), [조각 분리:247](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:247), [토큰 허용 문자:298](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:298).

   **함수 실측:** `T = Zq7Xw3Rt9Kp2.Lm5Nb8Vc4Hj6`으로 두면 다음과 같습니다.

   | 입력 | 결과 |
   |---|---|
   | `/reset/T` | `/reset/{id}` |
   | `/reset/T+` | 입력 그대로 |
   | `/reset/T%2B` | 입력 그대로 |
   | `/reset/T;v=x` | 입력 그대로 |

   내부 `.`를 `~` 또는 `=`로 바꿔도 동일합니다. `/reset/T+`는 **재적용 후에도 그대로**이며, `HTTP GET h.example.com/reset/T+`도 토큰을 보존합니다.

   **재현 시나리오·영향 추론:** 유효한 `active_requests`의 `p` 또는 HTTP 설명 `o`에 위 값을 보내면 `keepRawSql=false` 적재를 통과합니다. 비관리자 REST·SSE도 같은 함수를 사용하므로 제거되지 않습니다. 실제 HTTP 전송은 실행하지 않았습니다. 근거: [적재:157](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:157), [비관리자 응답:37](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:37), [SSE:59](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:59).

   **필요 조치:** 이미 민감 토큰으로 판정되는 문자열에 외부 구두점이 붙어도 그 판정이 유지되도록 보완해야 합니다. 토큰 내부 허용 문자를 분리하면서 길이 정보가 사라지는 문제가 남아 있습니다.

## 🟡 권장

- 성질 테스트의 토큰 자체도 다양하게 생성하세요. 현재는 고정 영숫자 토큰의 **앞뒤만** 변형하므로 내부 구두점 반례를 놓칩니다. [테스트:85](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactorTest.java:85)
- 위 반례를 적재·비관리자 응답·SSE 테스트에도 고정하는 편이 좋습니다.

## 🟢 확인된 것

- **8차 반례의 부분 해소:** 영숫자 토큰에 `+`·`%2B`·`;v=x`를 붙인 경우는 `{id}`로 바뀌는 것을 실측했습니다. 다만 토큰 문자 집합 전체에 대한 해소는 아닙니다.
- **A5 정적 확인:** 고정 cutoff, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 롤백 후 진행, 후보 수 기준 종료가 구현돼 있습니다. [보존 처리:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 정적 확인:** advisory xact lock 이후 DB 값으로 전이를 판정하고, 같은 값의 쓰기를 생략합니다. [설정 갱신:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)
- B12 초과 자유 텍스트·스택은 `UNMASKABLE`로 처리합니다. 7차에서 수용한 상한 이하 스택의 프레임 문법 한계는 재반려 근거로 삼지 않았습니다.

## 판단 요청 답

1. **설계 정합성:** A5 묶음 처리와 B13 설정 잠금·동일 값 생략에서 추가 필수 결함은 발견하지 못했습니다. 동시성 판단은 정적 검수이며 PG 재실행 결과는 아닙니다.
2. **우회 경로:** 위 경로 토큰 우회가 남습니다. DB 중단 방식·`RPC_FORM`에서는 추가 반례를 확인하지 못했습니다. `STRING_LITERAL`·`NUMBER_LITERAL`·`FRAME`은 현재 별도 `ApmSqlMasker`의 규칙입니다.
3. **권한 없이 원문 스위치를 켜는 호출:** 확인한 운영 호출부에서는 발견하지 못했습니다. 권한 생략 overload는 제거됐고, 토큰 발급부터 설정 생성까지 `rawAllowed`가 전달됩니다.
4. **깨진 JSON 아카이브 폴백:** **수용합니다.** 파싱 실패 후 `MASKED.applyToFreeText()`로 이어져 초과 입력은 `UNMASKABLE`이 됩니다. 정확한 경계는 16KB가 아니라 **`String.length() > 16,384`**입니다. [폴백:404](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:404), [상한 처리:127](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:127)
