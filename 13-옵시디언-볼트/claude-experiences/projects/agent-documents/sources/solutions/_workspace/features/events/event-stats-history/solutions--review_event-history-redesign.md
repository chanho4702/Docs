# 검수 요청: 이벤트/알림 이력 모드 성능 재설계 (2026-08-24)

> 커밋 **`e4039fc`** (BE `moveseye-be-spring`, 브랜치 `ZM-79`, 미푸시) / 티켓 ZM-99
> 배경 문서: `_workspace/features/apm/alerts/wip_event-alert-history.md` (측정표·경위 전부)

## 범위

이력 표시 모드(`GET /event/problems?show=HISTORY`)가 **12초 + 2000건 조용한 절단**이던 것을
"경량 전량 스캔 → 페이지만 상세 하이드레이트" 2단 구조로 재설계. 변경 파일 5개:

| 파일 | 변경 |
|---|---|
| `engine-api/.../alert/AlertHistoryQuery.java` | `lightOutput` 축(13번째 컴포넌트) + 팩토리 `ofWindowForScan`(경량 전량)·`ofNativeIdsForList`(페이지 상세). 기존 12인자 생성자는 오버로드로 보존, `ofNativeIds`는 경량으로 전환 |
| `engine-zabbix/.../ZabbixAlertAdapter.java` | `lightOutput`이면 `output=extend` 대신 `EVENT_LIGHT_FIELDS` 8필드(eventid·clock·severity·name·r_eventid·cause_eventid·suppressed·acknowledged) |
| `src/.../event/EventService.java` | `listHistoryForScreen`을 경량 스캔으로(상한 2000→20,000), 루프에서 이력 호스트/그룹 채움 제거, 페이지 슬라이스 후 `hydrateHistoryPage`(식별자 상세 1콜 + 인벤토리 그룹 맵 1콜)로 호스트·그룹·조치 채움 |
| `src/.../event/dto/EventProblemResDto.java` | `@Builder(toBuilder = true)` — 하이드레이션이 DTO를 재조립 |
| `src/test/.../EventServiceTest.java` | 기존 이력 테스트를 3콜 구조로 갱신 + 경량/하이드레이션 검증 신규 1건 |

## 의도 (선택한 설계와 버린 대안)

- 칩 집계·정확한 total·원인-결과 트리·정렬은 **전량**이 필요하지만, 호스트·그룹·조치 같은 상세는
  **화면에 보이는 페이지(10건)** 만 필요하다 — 이 비대칭이 2단 구조의 근거.
- 버린 대안 ①: 서버측 페이지네이션(event.get limit/offset) — 칩 집계·트리·처리일시 필터(복구 조인)를
  Zabbix가 못 해줘서 총량 정확성이 무너짐.
- 버린 대안 ②: 상한만 상향(extend 유지) — 4800건 extend는 실측 10초+라 근본 해결이 아님.
- `ofNativeIds`(복구 시각 조회)도 경량으로 바꿈 — 원래 javadoc이 "조인·조치 없이 가볍게"라 의도 일치.

## 중점 확인 요청 (불안한 지점)

1. 🔴 **`EVENT_LIGHT_FIELDS`가 `toAlert` 소비 필드를 전부 커버하는가** — 빠진 필드가 있으면 경량 경로의
   Alert가 조용히 null을 들고 다닌다. 특히 `opdata`류를 화면 어디서도 안 쓰는 게 맞는지.
2. 🔴 **하이드레이션이 경량 값을 덮지 않는가** — `withHistoryDetail`은 host/hostGroup/actions만 갈아끼우는데,
   `toBuilder()` 재조립 과정에서 status/resolutionTime/severity가 의도치 않게 바뀔 여지.
3. 🟡 이력 정렬 축 `host`·`totalActions`는 페이지 하이드레이션 후 값이라 전량 정렬 불가 —
   FE가 이 화면 정렬을 노출하지 않아(전 컬럼 sorter:false) 실영향 없다고 판단했는데, 다른 호출자
   (외부 API 사용 등)가 sortBy=host를 보낼 가능성 평가.
4. 🟡 `HISTORY_SCAN_LIMIT` 2000→20,000 — 대형 사이트(사건 수만 건/월)에서 경량이어도 메모리·직렬화
   비용이 괜찮은지. 20,000 근거는 "4800건 0.3초" 실측의 외삽.
5. 🟡 `AlertHistoryQuery`에 컴포넌트 추가 — 다른 `listHistory` 소비자 4곳(리포트 알람 집계·알림추이·
   그룹별 문제 요약·그룹 상세)이 오버로드 경유로 무수정인지(컴파일은 통과).
6. 🟢 페이지에 없는 사건이 상세 조회에서 빠지면(경합 삭제) 경량 값 그대로 노출 — 의도된 폴백.

## 검증 현황

- ✅ 전 모듈 테스트 1102/1102 green (`gradlew test`)
- ✅ dev 실서버(5433 도커 DB·Zabbix dmove.co.kr 76대) 재기동 후 실측:
  - HISTORY 30일 창: 6.2~11.0초 → **0.6~1.0초**, total 2000(절단) → **3913(정확)**
  - 깊은 페이지(offset=190) 0.60초, 페이지 아이템에 host·group 하이드레이션 확인
  - 처리일시 필터(24h): 0.97초, RESOLVED + 실제 시각 정상
  - RECENT 모드 회귀 없음(71건, 0.13초)
- ❌ FE 브라우저 E2E(토글·페이지네이션 실조작) — 미실시
- ❌ 대형 데이터(수만 건) 부하 — dev엔 3913건뿐

## 검수 결과

### 중점 확인 요청

1. 🟢 `EVENT_LIGHT_FIELDS`는 경량 경로에서 실제 소비하는 값에 충분하다. `toAlert`의 입력 중 경량 응답에 없는 `r_clock`/`r_ns`는 처리 일시를 복구 사건 조회로 다시 채우므로 사용되지 않고(`EventService.java:213-225`), `suppression_data`도 응답의 `suppressedUntilMillis` 외에는 이 목록 흐름에서 소비되지 않는다. 반면 목록·필터·트리에 필요한 `eventid`, `clock`, `severity`, `name`, `r_eventid`, `cause_eventid`, `suppressed`는 모두 `EVENT_LIGHT_FIELDS`에 있고(`ZabbixAlertAdapter.java:66-67`), `toAlert`도 이 필드들로 id·발생 시각·등급·이름·해결 여부·원인·억제를 구성한다(`ZabbixAlertAdapter.java:262-280`). `opdata`는 `toAlert`가 읽지 않으므로 누락해도 무방하다.

2. 🟢 페이지 하이드레이션은 경량 스캔의 주요 값을 덮어쓰지 않는다. `withHistoryDetail`은 `toBuilder()`로 host/hostGroup/actionGroups/listAction/totalActions/children만 변경한다(`EventService.java:421-430`); 따라서 status, resolutionTime, severity, occurrenceTime, causeEventId는 원본 DTO 값이 그대로 보존된다. DTO도 `@Builder(toBuilder = true)`로 변경되어 있다(`EventProblemResDto.java:15-16`).

3. 🔴 `sortBy=host` 정렬은 실제 화면에서 잘못된 페이지를 반환한다. 이력 경로는 정렬 전 모든 `host`를 null로 만들고(`EventService.java:329-332`), 이어서 `sortProblems`와 `skip/limit`를 수행한 뒤에만 하이드레이션한다(`EventService.java:375-379`). `sortValue`는 `host` 정렬을 지원한다(`EventService.java:969-975`). 더구나 FE `ProblemList`의 host 컬럼에는 `sorter:false`가 없으며(`ProblemList.tsx:141-145`), 공통 `useTableColumns`는 미지정 컬럼에 sorter를 부여하고(`useTableColumns.ts:52-54`), `DmoveTable`은 이를 `sortBy=host`로 URL/API에 전송한다(`DmoveTable.tsx:128-133`). 따라서 요청서의 “FE가 정렬을 노출하지 않는다”는 전제가 성립하지 않는다. host 정렬을 경량 스캔 단계에서 가능하게 하거나, 이력 모드에서는 해당 컬럼 정렬을 명시적으로 비활성화해야 한다.

4. 🟡 `HISTORY_SCAN_LIMIT=20_000`은 무제한이 아니어서 즉시 메모리 폭주는 막지만, 한 요청에서 Alert → FlatProblem → DTO/트리를 모두 메모리에 전개한다(`EventService.java:302-381`). 4,800건 실측만으로 20,000건의 Zabbix 응답 시간·heap 사용량을 보장할 수는 없다. 운영 데이터가 이 상한에 근접할 수 있다면 20,000건 실데이터(또는 부하 모사)로 응답 시간과 heap을 확인하고, 상한 도달을 관측 가능하게 남길 것을 권고한다.

5. 🟢 `AlertHistoryQuery`의 12인자 호환 생성자는 `lightOutput=false`를 명시해 기존 의미를 보존한다(`AlertHistoryQuery.java:89-96`). 전체 호출 검색 결과 기존 8인자 생성자 사용처는 adapter 테스트와 `HostService`뿐이고, 새 경량 factory는 화면 이력 흐름에서만 사용된다. `ofNativeIds`는 복구 시각 조회에 경량 출력을 사용하고(`AlertHistoryQuery.java:143-146`, `EventService.java:219-220`), 페이지 상세는 별도 `ofNativeIdsForList`로 조인·extend를 요청한다(`AlertHistoryQuery.java:149-152`, `EventService.java:396-400`).

6. 🟢 페이지 하이드레이션 대상은 페이지 루트뿐 아니라 재귀적으로 모든 자식 eventId를 수집한다(`EventService.java:390-393`). 상세 응답이 없는 경합 삭제 건도 경량 DTO를 유지해 페이지 전체를 버리지 않으며(`EventService.java:416-419`), 상세 값은 `byId` 매핑으로 원래 트리 순서에 다시 결합한다(`EventService.java:396-400`). 따라서 상세 누락이 페이지 응답 자체를 깨뜨리지는 않는다.

### 추가 확인

- 🟡 테스트 보강 필요: 추가된 `problemsHistoryLightScanAndPageHydration`은 상세 응답을 빈 목록으로 두므로(`EventServiceTest.java:398-430`), 실제 상세 값 병합과 `sortBy=host` 회귀를 검증하지 않는다. 특히 위 🔴 항목을 막는 HISTORY + host 정렬 + offset 테스트가 필요하다.
- 🟡 이 검수 환경에서는 Gradle wrapper가 배포본 다운로드를 시도했으나 네트워크 정책으로 차단되어 대상 테스트를 재실행하지 못했다. 요청서에 기재된 1102/1102 green은 코드 대조와 별도로 유지하되, 수정 후 로컬/CI에서 재확인이 필요하다.

종합: 수정 필요

## 반영 내역 (Claude, 2026-08-24 — 커밋 e4039fc 후속, 미커밋)

- [x] **🔴 #3 host 정렬** — 양쪽 수정:
  - BE `EventService.getEventProblems`: 이력 모드에서 `sortBy=host|totalActions`는 `occurrenceTime`으로 폴백(직접 API 호출자 안전망).
  - FE `ProblemList.tsx`: 이력 모드에서 host 컬럼 `sorter:false`(정렬 UI 숨김). 요청서의 "전 컬럼 sorter:false" 전제가 틀렸음을 확인 — `useTableColumns`가 미지정 컬럼에 기본 sorter를 부여.
  - 검증 중 부수 발견: 정렬 방향 의미가 원본 이식 때부터 반전된 선재 quirk(`BasePageDto` 기본 ASC + `sortProblems`의 `(bt-at)*direction` 식이 최신순을 냄). 1:1 보존 원칙에 따라 건드리지 않고 테스트 주석으로 문서화.
- [x] **🟡 추가 확인 #1 테스트 보강** — `problemsHistoryLightScanAndPageHydration`이 상세 3콜의 실값 병합(host·group)을 검증하도록 강화 + `problemsHistorySortByHostFallsBackToOccurrenceTime` 신설. EventServiceTest 28/28 green.
- [ ] **🟡 #4 20,000건 부하** — dev에 데이터가 없어 미실시. 상한 도달 관측(로그) 추가는 후속 과제로 남김.
- [ ] **🟡 추가 확인 #2 Codex 환경 테스트 재실행** — Codex 샌드박스 네트워크 제약. 로컬에서 전 모듈 재실행 예정(수정 반영분 포함).

## 재검수 결과 (Codex)

1. ✅ **🔴 #3 host 정렬 및 남는 소비자 구멍** — 닫혔다. `EventService.getEventProblems`는 HISTORY일 때 `sortBy=host`와 `sortBy=totalActions`를 모두 `occurrenceTime`으로 폴백하므로, FE 밖의 직접 API 호출자도 하이드레이션 전 `null` 값으로 잘못 페이지를 자르는 경로가 없다. FE `ProblemList.tsx`는 HISTORY에서 host 컬럼에 `sorter:false`를 명시해 공통 `useTableColumns`의 기본 sorter 부여도 차단한다. `totalActions` 컬럼은 이미 `sorter:false`이고, BE 폴백이 직접 호출까지 방어한다. `getEventProblems`의 유일한 HTTP 소비자는 `EventController`이며 다른 화면용 목록 경로에는 이 변경이 전파되지 않는다.

2. ✅ **보강 테스트 2건의 회귀 포착력** — 충분하다. `problemsHistoryLightScanAndPageHydration`은 경량 스캔의 `lightOutput=true`·엔티티/조치 미포함, 총 30건 대비 10건 페이지, 그리고 하이드레이션 질의의 10개 식별자·상세 엔티티 포함을 함께 확인하므로 전량 상세 조회 또는 화면 필드 미복원의 회귀를 잡는다. `problemsHistorySortByHostFallsBackToOccurrenceTime`은 입력 순서와 다른 발생 시각 순서(`1,3,2`)를 요구하므로 host의 전량 `null` 비교로 되돌아가면 실패한다. 다만 `totalActions` 폴백은 같은 단일 조건문으로 구현되어 있고 직접 API 방어용 보강 범위이지만, 이를 독립적으로 고정하는 테스트는 없다.

3. ✅ **RECENT 및 다른 화면 회귀** — 없음. BE 분기는 `historyMode`일 때만 실행되어 RECENT의 `listActive(...withRule().withActions())`, 기존 host/조치 정렬, 최근 해소 문제 포함 동작은 변경되지 않는다. FE도 `isHistory`일 때만 host sorter를 끄므로 RECENT의 host 정렬 UI는 유지된다. `getEventProblems` 외 화면 전용 메서드에는 수정이 없다.

4. ⚠️ **실행 검증 상태** — `./gradlew.bat test --tests com.dmove.moveseye.event.EventServiceTest`를 시도했으나, 이 검수 sandbox에 Gradle 9.2.1이 없고 wrapper 배포본 다운로드가 네트워크 제한(`Permission denied: getsockopt`)으로 차단되어 재실행하지 못했다. 따라서 위 테스트 판정은 코드·mock 상호작용 정적 대조 기준이며, 작성자가 보고한 `EventServiceTest 28/28 green`은 이 환경에서 독립 재현되지 않았다.

종합: 커밋 가능
