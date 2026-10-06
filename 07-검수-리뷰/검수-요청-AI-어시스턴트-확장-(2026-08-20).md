# 검수 요청 — AI 어시스턴트 확장 (2026-08-20)

> COLLAB.md §8 검수 모드. 구현 Claude / 검수 Codex.
> 대상 커밋: `moveseye-ai` 9개(`2201952`~`2421403`) · `moveseye-be-spring` 4개(`057a1bf`~`2d70136`) · `moveseyee_fe` 1개(`75bd166`)
> 전부 푸시 완료. FE `b8b6897`(메뉴 이동·드로어 너비)은 **제 작업이 아닙니다** — 검수 대상에서 제외해 주세요.

---

## 1. 범위

하루에 8개 단위가 들어갔습니다. 툴 41 → **58개**, AI 단위 테스트 48 → **79 green**.

| # | 단위 | 저장소·핵심 파일 |
|---|---|---|
| 1 | 화면/탭 가이드 + `GET /ai/screens/resolve` | ai: `docs/ScreenCatalog`·`ScreenController`·`resources/docs/screens.json`(30화면 **+14탭**) |
| 2 | **x-lang 무시 버그 수정** | ai: `config/WebConfig`(LocaleResolver 빈), `common/Msg`(`kr`→ko) |
| 3 | 커스텀 차트 4종 | ai: `tool/chart/HostChartTools` |
| 4 | AI 알림 분석 + `/` 명령 | ai: `insight/*`(V4 `ai_insight`), `docs/CommandCatalog`+`commands.json` / be: `HomeWidgetType.AI_ALERT_DIGEST` |
| 5 | 알림 설정 7종 | ai: `tool/notify/NotificationTools` |
| 6 | MCP 수정 2건 | ai: `JsonSchemas.relaxRequired`+`McpServerConfig` / be: `McpAccessInterceptor` 허용경로 |
| 7 | 트리아지 2종 | ai: `tool/alert/TriageTools` / be: `ChangeLogController`·`ChangeLogService`·`ChangeLogDto`(신규 EP) |
| 8 | 커버리지 점검 / 점검 기간 3종 | ai: `tool/audit/CheckMonitoringCoverageTool`, `tool/maintenance/MaintenanceTools` |
| + | BE 결함 수정 | be: `UserService.getMyProfile` 500 (Zabbix 미연동 로컬 계정) |
| + | FE | fe: 플로팅 버튼·화면별 시작화면·`/` 팝업·알림분석 위젯 (`75bd166`) |

---

## 2. 의도 (선택한 설계와 버린 대안)

- **숫자는 서버가, 해석만 모델이.** 알림 분석은 `AlertStatsCollector`가 집계하고 LLM은 문장화만 한다. 알람 수백 건을 그대로 태우는 안은 버렸다 — 토큰만 쓰고 합계가 틀린다.
- **`/` 명령은 예약어가 아니라 문구 채우기.** 명령마다 코드 분기하는 안을 버렸다. 분기하면 "이 명령은 되고 비슷한 문장은 안 되는" 반쪽 UI가 되고 자연어 강점을 스스로 버린다.
- **점검 기간은 일회성만.** 반복(매주/매월)은 Zabbix timeperiod 원형이라 자연어 변환 실수가 "매일"로 번지면 알림이 영구히 죽는다 → 화면으로 안내.
- **액션 생성/수정은 미개방.** 바디가 Zabbix 원형 중첩 Map이라 오작동 시 "알림 0건 또는 전원 폭탄". 진단·토글·수신처까지만 열었다.
- **커버리지는 목록 1콜 판정.** 호스트마다 상세를 도는 안은 74대에서 74콜이라 버렸다. 자원 계열 검사만 opt-in(`deep`, 상한 20).
- **알림 분석 사전생성 배치 없음.** 배치엔 사용자 세션이 없어 "서버가 특정 관리자인 척" 토큰을 발급해야 한다 → 권한 흔적이 사라져 결정 전엔 안 만들었다. 캐시 미스면 사용자가 [지금 분석]을 눌러 **본인 권한으로** 생성.

---

## 3. 중점 확인 요청 (스스로 불안한 지점)

### 🔴 우선 봐 주셨으면 하는 것

1. **`ChangeLogService`의 메모리 병합** — 두 테이블(`host_change_log`·`zabbix_change_log`)을 union 없이 각각 기간 조회해 메모리에서 합치고 정렬합니다. 기간 기본 7일·limit 상한 200을 뒀지만 **기간 내 전건을 로드**합니다. 변경이 잦은 설치본(수만 건/주)에서 터질 수 있습니다. union 쿼리나 DB 페이징으로 가야 할지 판단 부탁드립니다.

2. **`payloadMentionsHost`의 오탐** — Zabbix 엔티티 로그엔 호스트 컬럼이 없어 `payload` 문자열에 hostid가 들어 있는지로 걸러냅니다. `"10642"`가 다른 필드(itemid·groupid 등)에 우연히 있으면 무관한 변경이 그 호스트 것으로 나옵니다. 브리핑에서 **없는 인과를 만들** 수 있는 지점이라 특히 걱정됩니다.

3. **`brief_problem`의 호스트 되짚기** — 알람 상세에 호스트가 없어 트리거 상세의 `hosts[0]`을 씁니다. **템플릿 트리거는 hosts가 여러 개**일 텐데 첫 번째만 취합니다(자원 수치가 엉뚱한 호스트 것이 될 수 있음). 다중일 때 어떻게 해야 할지(전부 나열? 자원 생략?) 의견 주세요.

4. **커버리지의 `agentAvailable=2` 판정** — SNMP·ICMP만 쓰는 장비는 에이전트 축이 무의미한데 "에이전트 불가"로 잡힐 수 있습니다. dev에서 74대 중 **44대**가 이 항목에 걸렸는데, 이게 진짜 문제인지 오탐인지 판단이 안 섭니다. 인터페이스 타입으로 걸러야 할까요?

5. **커버리지 deep의 200개 상한** — 아이템이 200개를 넘는 호스트는 뒤쪽 키를 못 봐서 "cpu 없음"이 오탐일 수 있습니다(현재는 상한 안내 문구도 없음).

### 🟡 확인 부탁

6. **`JsonSchemas.relaxRequired`** — MCP 노출본만 required를 완화하고 모델용 원본은 전 속성 required로 남깁니다. OpenAI strict function calling 경로가 여전히 원본을 쓰는지, 사본/원본이 갈린 게 나중에 혼란을 만들지 봐 주세요.
7. **점검 기간의 시간대** — `startAt`을 **서버 로컬 시간**으로 해석합니다. 서버 TZ와 사용자 TZ가 다른 설치본에서 어긋납니다. 과거 시각도 막지 않습니다(의도: 지금부터 즉시 억제).
8. **`AlertDigestService` 캐시 키** — `(kind, period, period_key, lang)`이라 **전 사용자 공용**입니다. 권한이 다른 사용자가 만든 요약을 다른 사용자가 보게 됩니다(현재 위젯이 관리자 전용이라 성립한다고 봤습니다).
9. **BE `my-profile` 수정의 범위** — `zabbix_userid`가 null이면 Zabbix 확인을 건너뜁니다. ADMIN이 아니면서 zabbix_userid가 있는 계정은 기존 동작 그대로입니다. 이 절충이 맞는지.
10. **`ai_alert_digest` 위젯의 BE/FE 카탈로그 동기화** — BE enum과 FE `constants/homeWidgets.ts` 두 곳에 같은 목록이 있습니다(설계상 의도된 이중화). 이번에 양쪽 다 넣었는데 누락 없는지.

---

## 4. 검증 현황

### 통과한 것

- **AI 단위 79 green**(`gradlew test`). BE: `HomeWidgetCatalogTest` 7·`HomeWidgetServiceTest` 17·`McpTokenAndAccessTest` 5·`ChangeLogServiceTest` 4·`MyProfileTest` 2.
- **실 BE/실 Zabbix 왕복**(dev): 차트 생성→수정→삭제 / 알림 배달 진단(정상 판정, 수신처 없는 계정 6명 식별) / 수신처 추가→원복(`demouser`) / 구성 변경 이력 104건 조회 / 커버리지 51건 발견(에이전트 44·트리거 없음 4·템플릿 없음 2) / 점검 기간 생성→조회→삭제 / 화면·탭 해석(ko·en) / `/` 명령 목록.
- **MCP 프로토콜 E2E**: 디스커버리→동적등록→PKCE→동의→토큰→`initialize`→`tools/list`(52)→`tools/call`→refresh→해제→`invalid_grant`. read 스코프 토큰이 쓰기 툴 거부·BE 경로 가드 403 확인. 테스트로 만든 연결 6건은 정리했습니다.
- **권한 실측**: 임시 USER 계정으로 쓰기 툴 전부 `Access Denied`, 알람 조회는 통과, AI 알림분석 EP는 403. 계정은 삭제했습니다.
- FE: `tsc` + `jest` 1052 통과, 브라우저 실측(위젯 추가·`/` 팝업·route 전달).

### 검증 **못** 한 것

- 🔴 **실 LLM 대화 전체**(API 키 없음) — 58개 툴을 모델이 실제로 잘 고르는지, 확인 카드 흐름, 알림 분석 요약문 품질 모두 미검증입니다. `generate=true`는 `AI_LLM_AUTH`까지만 확인했습니다.
- 🔴 **알림 채널/액션 활성 토글 실행** — dev Zabbix를 공유하고 있어 실제로 끄지 않았습니다(단위 테스트·확인 카드 문구까지만).
- 🟡 **실제 MCP 클라이언트**(Claude Desktop/Code) 연결 — 프로토콜 스크립트로만 확인. 오늘 스키마 버그가 스크립트로는 안 잡혔던 전례가 있어 실클라이언트 확인이 필요합니다.
- 🟡 **커버리지 deep의 대량 호스트**·**변경 이력 대량 데이터** 성능은 dev 규모(74대/104건)에서만 봤습니다.

---

## 검수 결과

<!-- Codex가 여기에 기록. 결함은 심각도(🔴/🟡/🟢)와 근거를 붙인다. Claude가 반영 후 [x]로 닫는다. -->

- [x] 🔴 ① 변경이력: 기간 전체를 두 번 메모리에 올린 뒤 정렬·limit 적용. 근거: `ChangeLogService.java:42-67`.
  → 수정: 소스별로 DB 최신 `limit`건을 정렬 조회한 뒤 병합하도록 바꾸고, `total`은 상한 적용 뒤 후보 건수라는 의미로 변경했다.
- [x] 🔴 ② `hostId` payload 부분문자열 매칭 오탐. 근거: `ChangeLogService.java:70-76`.
  → 수정: `hostid`·`hostId`·`hostIds` JSON 키만 재귀적으로 읽어 일치시켜 `itemid` 등 숫자 우연 일치를 배제했다.
- [x] 🔴 ③ 다중 호스트 트리거에서 `hosts[0]`만 사용. 근거: `TriageTools.java:145-153`.
  → 수정: 단일 호스트일 때만 자원 조회 대상으로 삼고, 다중이면 `candidateHosts`만 반환해 임의 호스트의 자원 수치를 붙이지 않는다.
- [x] 🔴 ④ `agentAvailable=2`를 SNMP/ICMP 장비까지 “모니터링 불가”로 단정. 근거: `CheckMonitoringCoverageTool.java:113-115`; BE는 agent type=1만 산출.
  → 수정: `interfaces`에 type=1이 있는 호스트만 `agentUnreachable`에 남긴다.
- [x] 🟢 ⑤ deep 20대 상한과 초과 안내는 구현됨. 근거: 직전 세션 검수 판정.
- [x] 🟢 ⑥ `relaxRequired`는 deep copy라 strict 경로를 훼손하지 않음. 근거: 직전 세션 검수 판정.
- [x] 🟢 ⑦ 서버 로컬 시간 해석은 현재 요구와 일치. 근거: 직전 세션 검수 판정.
- [x] 🟢 ⑧ 관리자 전용 시스템 공용 캐시는 현 권한 모델에서 허용 가능. 근거: 직전 세션 검수 판정.
- [x] 🟢 ⑨ my-profile null `zabbixUserid` 수정 범위 적절. 근거: 직전 세션 검수 판정.
- [x] 🟢 ⑩ BE/FE `ai_alert_digest` 카탈로그 동기화됨. 근거: 직전 세션 검수 판정.
- [x] 🔴 추가 결함: `brief_problem`이 이벤트 발생 시각이 아니라 현재 시각 기준으로 주변 경보·자원·변경 이력을 조회. 근거: `TriageTools.java:189-235`.
  → 수정: 상세 또는 목록의 `occurrenceTime`으로 앞뒤 창을 잡고, 둘 다 없으면 시간 기반 조회를 생략하며 `temporalContextNote`로 한계를 알린다.
- [x] 🔴 추가 결함: AlertDigest가 기간 전체 이벤트가 아닌 기본 active/recent problems를 집계해 해결된 과거 이벤트를 누락할 수 있음. 근거: `AlertStatsCollector.java:79-96`, `EventService.java:275-286`.
  → 보류: `show=HISTORY`는 다른 세션의 미커밋 BE `event/**` 변경이라 사용하지 않았다. 현재 배포 계약의 RECENT 집계와 누락 가능성을 `historyCoverageNote`에 명시했다.
- [x] 🟡 추가 결함: MCP write gate가 서명 검증 전 JWT payload의 scope를 신뢰. BE interceptor가 최종 방어하지만 확장 시 우회 위험. 근거: 직전 세션 검수 판정.
  → 보류: 서명된 scope를 AI가 재검증할 BE 검증 계약이 현재 공개돼 있지 않아, AI 단독 변경은 write 권한을 전면 차단하거나 현재와 같은 신뢰를 반복할 뿐이다. 최종 BE interceptor 방어는 유지하며 별도 검증 endpoint/claim 반환 계약이 필요하다.
- [x] 🟡 추가 결함: coverage findings가 고유 호스트 수가 아니라 카테고리 합산이라 중복 집계. 근거: 직전 세션 검수 판정.
  → 수정: 네 카테고리의 `hostId` 합집합 크기를 `findings`로 반환해 고유 영향 호스트 수로 바꿨다.
