요약: A1·A2·A4·A5와 토큰 scope/kind 검증은 코드상 닫혔습니다.  
다만 알람 다건 상태 변경의 부분 실패 재시도, `keep_raw_sql`의 FE 결선, 토큰 원문의 mutation cache 잔존은 커밋 전 수정이 필요합니다.  
테스트는 실행하지 않았으며, `ApmRollupWatermarkTest`의 Mockito varargs 스텁은 호출 시그니처상 빗나가지 않습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `moveseyee_fe/src/hooks/useApmCollectors.ts:141-147` | 발급 응답(`token`, `configYaml`)을 `useMutation`의 성공 `data`로 저장한다. 로컬 `issued` state만 쓴다는 주석은 사실과 다르다. | TanStack Query mutation cache와 활성 MutationObserver에 원문 토큰이 남아 Devtools 등에서 노출될 수 있다. 모달을 닫아도 mutation data는 비워지지 않는다. | 토큰 발급만은 React Query mutation을 우회해 일반 async 호출로 처리하거나, 성공 즉시 mutation state를 reset하고 cache 보존이 없도록 구조를 바꾸며 이를 검증하는 테스트를 추가한다. |
| 2 | 🔴 | `moveseyee_fe/src/pages/application-monitoring/components/ApmTokenIssueDrawer.tsx:82,92`, `tabs/ApmCollectorTokensTab.tsx:126,281-287` | FE가 `keepRawSql: false`를 항상 전송한다. | BE의 새 기본값 결선은 “요청에서 생략했을 때 설정값 사용”인데, 발급·재생성 화면 모두 명시적 `false`로 덮어쓴다. 관리자가 전역 `keep_raw_sql=true`로 설정해도 새 YAML은 마스킹된 상태가 된다. | 폼에서 사용자가 바꾸지 않은 `keepRawSql`은 요청 payload에서 생략한다. 전역 설정값을 초기 표시값으로 읽어 오거나, “전역 기본값 사용” 삼중 상태를 제공한다. |
| 3 | 🔴 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/ZabbixAlertBridge.java:563-579`, `ApmAlertService.java:253-282` | 규칙 비활성화/재활성화 중 여러 binding의 Zabbix `status` 갱신이 하나 실패하면 루프가 중단되고, 이후 binding은 갱신되지 않는다. | DB의 `enabled`는 이미 바뀌고 열린 이벤트도 닫힌다. 그러나 아직 활성인 나머지 Zabbix 트리거는 계속 Problem/알림을 낼 수 있다. 다음 배치·resync에는 `setTriggersEnabled` 재시도 경로가 없어 불일치가 지속된다. | binding별 실패를 수집해 끝까지 시도하고, 미완료 상태를 DB에 남겨 sync 배치 또는 명시적 재시도가 반복 보정하도록 한다. 부분 실패 테스트도 추가한다. |
| 4 | 🟡 | `moveseyee_fe/src/pages/application-monitoring/components/ApmLicenseExpiryNotice.tsx:66-78` | 일괄 회수에서 일부 실패하면 첫 오류 toast만 띄운 뒤 모달을 닫는다. | 사용자는 몇 개가 실패했고 어떤 token이 살아 있는지 알 수 없다. 만료 직전의 “Collector 중지” 흐름에서는 잔존 토큰이 특히 중요하다. | 성공·실패 개수와 실패 token label/id를 결과 화면에 남기고, 실패분만 재시도할 수 있게 한다. |
| 5 | 🟡 | `_workspace/analysis/apm-p1-logic-analysis.md:970` | §12 A20이 “FE 수집기·토큰 화면 미구현(자리표시)”이라고 여전히 적고 있다. | 이번 증분으로 실제 수집기 4탭·토큰 발급/회수·설정 생성 화면이 구현되어 코드와 분석 문서가 다르다. | A20에서 해당 문장을 제거하거나, 남은 항목만 분리해 갱신한다. |
| 6 | 🟢 | `moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/core/batch/ApmRollupWatermarkTest.java:45,53,67,81` | Mockito varargs 스텁 검토 결과 `any(Object[].class)`가 `JdbcTemplate.update(String, Object...)` 및 `queryForObject(..., Object...)` 호출과 맞는다. | 요청된 “조용히 빗나가 green이 되는가” 우려는 이 테스트에서는 해당하지 않는다. 다만 JDBC와 시간을 모두 목으로 두므로 SQL/실DB 경계는 별도 IT가 맡아야 한다. | 현 스텁은 유지 가능. 다만 새 알람 부분 실패와 FE `keep_raw_sql` 기본값 연결 테스트를 추가한다. |

### 요청서 §3 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| A1 캐시 유예 만료 | 닫힘 | `markProvisioned`가 ID 변경 또는 `enforce`일 때만 실행되어 평가 배치가 `syncedAt`을 매번 갱신하지 않는다. |
| A2 sync 배지 리셋 | 닫힘 | push 성공은 push 오류만, sync는 `NOT_SUPPORTED` 오류만 해제하도록 출처를 분리했다. |
| A3 비활성화/재활성화 | 미흡 | DB 선행 해소와 재활성화 시 정의 재적용 후 `status=0` 순서는 맞지만, 다건 Zabbix 갱신의 부분 실패가 영구 불일치로 남을 수 있다. |
| A4 THEIRS 검증 | 닫힘 | STALE의 THEIRS를 거부하고 채택 값도 `validThreshold`를 통과시킨다. |
| A5 롤업 워터마크·라이선스 | 닫힘 | 0행 live edge만 보류하고 `maxBuckets` 절단·보존 경계에서는 전진한다. DB 내부 파생 작업이라 `requiresActiveLicense=false`는 P10의 외부 수집 중단과 충돌하지 않는다. |
| 토큰 scope/kind | 닫힘 | `COLLECTOR` 및 `ingest` scope를 강제하며 빈 scopes도 403 처리한다. 기존 발급 경로가 `ingest`를 넣는다는 전제도 일관적이다. |
| `keep_raw_sql` 기본값 | 미흡 | BE 서비스 결선은 맞지만 FE가 항상 명시적 `false`를 보내므로 실사용 흐름에서는 전역 기본값이 적용되지 않는다. |
| `PENDING_APPROVAL`, APM 403 / AI 503 | 닫힘 | PENDING은 예약 상태임을 명시했고, 두 OTLP 수신기의 만료 코드 차이도 의도된 정책으로 문서화했다. |

커밋 전 반드시 고쳐야 할 것:

- [ ] 토큰 원문과 `configYaml`이 React Query mutation cache에 남지 않게 한다.
- [ ] 발급·재생성 FE에서 미지정 `keepRawSql`을 생략해 BE 전역 기본값이 실제 적용되게 한다.
- [ ] Zabbix 트리거 다건 상태 변경의 부분 실패를 끝까지 처리하고 재시도 가능 상태로 남긴다.
- [ ] `_workspace/analysis/apm-p1-logic-analysis.md` §12 A20을 현재 구현에 맞게 갱신한다.
