## 판정

**반려 — 7차 🔴1~2는 해소됐지만, 구두점이 붙은 경로에서 긴 토큰 원문이 통과합니다.**

검수 대상 파일은 수정하지 않았습니다. `r8.diff`는 줄바꿈 정규화 후 현재 `git diff HEAD`와 일치합니다. 아래 함수 반환값은 실제 소스를 JDK 17 JShell 메모리에서 평가했습니다. 전체 빌드·JUnit·PG IT·뮤테이션 결과는 독립 재검증하지 않았으며 요청서의 주장으로 구분합니다.

## 🔴 필수

1. **긴 토큰에 구두점이 붙으면 민감값 판정 전체가 취소됩니다.**

   **코드 확인:** 디코딩 후 일부 금지 문자를 검사하지만, `longToken()`은 허용 목록 밖 문자를 하나라도 만나면 `false`를 반환합니다. 따라서 `;`·`+`·공백 등이 붙은 긴 토큰은 원래 구간 그대로 반환됩니다. 근거: [금지 문자 검사:229](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:229), [구간 판정:238](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:238), [토큰 검사:279](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:279).

   **함수 재현:** `T = a1B2c3D4e5F6g7H8i9J0k1L2m3`일 때:

   | 입력 | 최초·재적용 결과 |
   |---|---|
   | `/reset/T` | `/reset/{id}` |
   | `/reset/T;v=1` | 입력 그대로 |
   | `/reset/T%3Bv=1` | 입력 그대로 |
   | `/reset/T+` | 입력 그대로 |
   | `/reset/T%20` | 입력 그대로 |
   | `/orders;jsessionid=T` | 입력 그대로 |

   `HTTP GET h.example.com/reset/T;v=1`도 토큰을 그대로 반환합니다.

   **재현 시나리오·영향 추론:** 유효한 `active_requests`의 `p` 또는 HTTP 설명인 `o`에 위 값을 보내면, `keepRawSql=false`에서도 적재 마스킹을 통과합니다. 비관리자 REST와 SSE 역시 같은 함수를 적용하므로 재마스킹으로 제거되지 않습니다. 실제 HTTP 전송은 실행하지 않았습니다. 근거: [적재:157](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:157), [비관리자 응답:35](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:35), [SSE:59](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:59).

   **필요 조치:** 구두점 때문에 이미 존재하는 민감 토큰의 판정이 취소되지 않도록 해야 합니다. 디코딩된 구간 안의 토큰 부분도 검사하거나, 판정 불가 구간 전체를 가리는 방식으로 보완해야 합니다.

## 🟡 권장

- 경로에도 **민감 토큰 + 접두·접미 문자** 조합의 성질 테스트를 추가하세요. 원문·percent-encoding·재적용을 포함하면 금지 문자를 하나씩 추가하는 방식의 누락을 줄일 수 있습니다.
- 이번 반례를 함수 단위뿐 아니라 적재·비관리자 응답·SSE 사본 테스트에도 고정하는 편이 좋습니다.

## 🟢 확인된 것

- **7차 🔴1 해소:** `HTTP SELECT 'kim@example.com'`, `HTTP GET 'kim@example.com'/orders`는 모두 `HTTP ?(unmaskable)`입니다. [HTTP 형식 검사:195](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:195)
- **7차 🔴2 해소:** 긴 토큰에 `%23`·`%2523`을 붙인 경로는 최초·재적용 모두 `{id}`로 바뀝니다.
- **A5 정적 확인:** 고정 cutoff, 묶음별 `REQUIRES_NEW`, 후보 마지막 ID 커서, 통지 `NOWAIT`, 경합 시 롤백 후 진행, 후보 수 기준 종료가 구현돼 있습니다. [보존 배치:564](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)
- **B13 설정 정적 확인:** advisory xact lock 이후 DB 값으로 전이를 판정하고, 같은 값의 쓰기를 생략합니다. [설정 갱신:256](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:256)
- 7차에서 수용한 상한 이하 스택의 프레임 문법 한계는 재반려 근거로 삼지 않았습니다.

## 판단 요청 답

1. **설계 정합성:** A5 묶음 처리와 B13 설정 잠금·동일 값 생략에서 추가 필수 결함은 발견하지 못했습니다. 동시성 판단은 정적 검수이며 PG에서 재실행하지 않았습니다.
2. **우회 경로:** HTTP 형식과 `#` 가드는 기존 반례를 해소했습니다. 다만 위 경로 토큰 우회가 남습니다. DB 중단 방식·`RPC_FORM`에서는 추가 반례를 확인하지 못했습니다.
3. **권한 없이 원문 스위치를 켜는 호출:** 확인한 운영 호출부에서는 발견하지 못했습니다. 권한 생략 overload는 제거됐으며, 토큰 발급에서 설정 생성까지 `rawAllowed`가 전달됩니다.
4. **깨진 JSON 아카이브 폴백:** **수용합니다.** 파싱 실패 후 `MASKED.applyToFreeText()`로 이어져 상한 초과 입력은 `UNMASKABLE`이 됩니다. 정확한 경계는 바이트 기준 16KB가 아니라 **`String.length() > 16,384`**입니다. [폴백:404](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:404), [초과 입력 처리:127](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:127)
