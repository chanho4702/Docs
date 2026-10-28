## 판정

**반려 — A5와 B13 권한 전달은 설계와 대체로 일치하지만, 새 `currentOp` 마스킹에 원문 리터럴이 통과하는 경로 3종이 남았습니다.**

제공된 diff 34파일은 현재 `git diff HEAD`와 일치합니다. 파일 수정·빌드·테스트 실행은 하지 않았습니다. 테스트 4,398건 통과와 뮤테이션 결과는 **요청서의 주장이며 독립 재검증하지 않았습니다.**

아래 **확인**은 소스 사실, **예상 결과**는 정적 분석에 따른 추론입니다.

## 🔴 필수

1. **숫자가 포함된 dollar-quote 태그가 마스킹을 우회합니다.**

   **확인:** `DOLLAR_QUOTE`가 `\$[A-Za-z_]*\$`여서 PostgreSQL의 `$tag1$` 같은 태그를 인식하지 못합니다. 이후 처리도 dollar-quoted 문자열을 가리지 않습니다. 설계 §6.5의 “dollar-quoted는 통째로 판정 불가”와 다릅니다.  
   근거: [ApmRuntimeTextRedactor.java:42](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:42), [sql 처리:105](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:105).

   **재현 입력:** `DB postgresql SELECT $tag1$kim@example.com$tag1$`  
   **예상 결과:** 입력이 그대로 반환되어 이메일이 남습니다.

   숫자를 포함한 태그도 검출하고, 경계를 해석하지 못하는 경우 `UNMASKABLE`로 처리해야 합니다.

2. **backslash로 이스케이프한 작은따옴표 뒤의 문자열이 노출됩니다.**

   **확인:** `STRING_LITERAL`은 `''`만 이스케이프로 취급합니다. PostgreSQL의 `E'…'`에서 `\'`를 문자열 종료로 오인한 뒤, 마지막에 남은 따옴표부터만 제거합니다.  
   근거: [ApmRuntimeTextRedactor.java:40](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:40), [미닫힘 처리:109](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:109).

   **재현 입력:** `DB postgresql SELECT E'it\'s kim@example.com'`  
   **예상 결과:** `DB postgresql SELECT E?s kim@example.com?…`가 되어 이메일이 남습니다.

   지원하는 이스케이프 문법을 처리하거나, 해당 문법을 만나면 설명 전체를 `UNMASKABLE`로 바꿔야 합니다.

3. **지수형 숫자 리터럴이 그대로 통과합니다.**

   **확인:** `NUMBER_LITERAL`은 정수·일반 소수만 처리하며, 숫자 뒤의 `e`를 단어 문자로 판단해 지수형 전체를 매칭하지 않습니다.  
   근거: [ApmRuntimeTextRedactor.java:41](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/security/ApmRuntimeTextRedactor.java:41).

   **재현 입력:** `DB postgresql SELECT 123456789e0`  
   **예상 결과:** 숫자 리터럴이 그대로 반환됩니다.

   지수형을 포함해 지원할 숫자 문법을 정의하고 가려야 합니다.

**공통 영향:** 위 입력을 `active_requests`의 `o`로 보내면 `keepRawSql=false`에서도 같은 redactor를 거칩니다. 비관리자 REST와 SSE도 같은 함수를 재사용하므로 재마스킹으로 해결되지 않습니다. 근거: [수신 처리:157](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ActiveRequestListIngestor.java:157), [REST 사본:35](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveActiveRequestsDto.java:35), [SSE 처리:59](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:59).

## 🟡 권장

- **권한 생략 overload를 제거하거나 접근을 제한하세요.** 현재 외부 우회 호출은 발견하지 못했지만, 권한 인자를 생략하면 `true`가 되는 API는 후속 구현에서 실수하기 쉽습니다. 근거: [update:238](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:238), [generate:57](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigService.java:57), [issue:217](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:217).

- **A5 경합 테스트를 다중 통지·다음 묶음 진행까지 보강하세요.** 현재 경합 테스트는 통지 한 행을 잠급니다. 앞 통지를 이미 잠근 뒤 다음 통지에서 실패했을 때 전체 롤백되는지, 뒤 후보까지 진행하는지를 함께 확인하면 좋습니다. [ApmAlertEventRetentionIT.java:142](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmAlertEventRetentionIT.java:142)

- **B13 전용 MVC·발급 롤백 검증을 추가하세요.** 현재 MVC 변경은 `issue`의 3인자 mock 대응입니다. 편집 권한이 있는 비관리자의 요청에서 `APM_RAW_SQL_ADMIN_ONLY` envelope와 토큰 행 롤백을 직접 확인하는 보강이 필요합니다. [ApmAdminAccessMvcTest.java:95](C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/ApmAdminAccessMvcTest.java:95)

## 🟢 확인된 것

- **A5 루프:** cutoff 고정, 묶음별 `REQUIRES_NEW`, 이벤트 `SKIP LOCKED`, 통지 `NOWAIT`, 잠금 후 상태 판정이 구현됐습니다. 커서는 조회 후보의 마지막 ID이며, 종료는 삭제 건수가 아닌 후보 수를 기준으로 합니다. 55P03 경합 시 커서를 유지하고 해당 묶음을 건너뜁니다. [ApmRetentionService.java:564](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:564)

- **설정 원자성:** 트랜잭션 안에서 advisory lock을 취득한 뒤 DB 값을 읽어 권한을 판정하고, 같은 값의 쓰기를 생략합니다. 거부 판정은 다른 필드 저장보다 앞에 있습니다. [ApmSettingService.java:257](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/setting/ApmSettingService.java:257)

- **B12:** 16,384자 초과 자유 텍스트는 `UNMASKABLE`, 초과 스택은 검증된 프레임만 보존합니다. 프레임 판정에는 전체 문법과 512자 상한이 적용됩니다. [ApmSqlPolicy.java:120](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlPolicy.java:120), [ApmSqlMasker.java:130](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSqlMasker.java:130)

- **경로·SSE:** 최대 3겹 percent-decoding 후 민감 구간을 판정하며, SSE는 공유 버퍼를 변경하지 않고 가린 사본을 만듭니다. 다만 실제 가림의 완전성에는 위 필수 결함이 남습니다.

## 판단 요청 답 (요청서의 1~4)

1. **설계 적합성:** A5 루프와 B13 설정 잠금에서 추가 필수 결함은 발견하지 못했습니다. dollar-quote 처리는 §6.5를 충족하지 못합니다. 동시성 동작은 코드상 타당하다는 판단이며 PG 실행으로 검증하지 않았습니다.

2. **정규식·디코딩 우회:** `STRING_LITERAL`·`NUMBER_LITERAL`·dollar-quote 검출에서 위 3종을 발견했습니다. `RPC_FORM`, `FRAME`, 경로 디코딩에서는 이번 검수로 추가 필수 결함을 특정하지 못했습니다. 큰따옴표 문자열 보존은 설계에 명시된 한계로 구분했습니다.

3. **권한 생략 호출:** 현재 운영 소스에서 외부 입력이 권한 생략 overload로 연결되는 경로는 발견하지 못했습니다. 컨트롤러들은 실제 원문 권한을 전달하고, 토큰 발급도 이를 `generateForIssue`까지 전달합니다. `list`의 생략 overload는 원문 **조회**를 허용하는 형태이므로 같은 유지보수 위험은 남습니다.

4. **깨진 JSON 아카이브 폴백:** **수용 가능합니다.** 마스킹이 요구된 내보내기에서 파싱하지 못한 원문을 포기하는 방향입니다. 기준은 16KB 바이트가 아니라 **16,384자**입니다. JSONL 작성기도 대체값을 문자열로 처리할 수 있습니다. 근거: [ApmArchiveSource.java:404](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:404), [JsonlTabularWriter.java:122](C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/common/export/JsonlTabularWriter.java:122). 다만 초과 길이 폴백의 직접 테스트는 추가하는 편이 좋습니다.
