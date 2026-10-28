# MovesEye 로직 검수 — 2026-09-07

- 검수자: Codex
- 기준: BE `922a708`, FE `ef951b0`. 시작 시 두 작업 트리 모두 clean.
- 범위: 최근 ZM-124~131의 알람 사본 조회·전체/증분 동기화·복구 보정·읽음 처리·SSE와 RAW/trends 조회 경로. 제품 전체 전수 검수는 아니다.
- 역할: `COLLAB.md`의 `STATUS: SOLO-CLAUDE`, §8에 따라 검수만 수행. 제품 코드·설정·DB 변경 없음.
- 결과: P1 3건, P2 4건. 아래 체크박스는 구현 반영 여부이며 모두 미해결이다.

## 검수 결과

### [ ] R1 — P1: 동기화 사이에 발생하고 해소된 알람이 RECENT 목록에서 누락된다

**위치:** `moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:120`, `:206`, `:288`.

전체/증분 모두 4인자 `AlertQuery`를 생성하며 `includeRecentlyResolved=false`다. 전체 조회에 붙이는 `withRule().withActions().withLimit(10000)`도 이 값을 보존한다. 어댑터는 이 플래그가 true인 경우에만 `recent:true`를 전송한다.

**조건:** t=0 동기화 → t=2 장애 발생 → t=8 해소 → t=15 다음 동기화. 어느 시점의 활성 스냅샷에도 이 사건이 없으므로 `event_problems`에 들어가지 않는다. 복구 보정도 이미 DB에 있는 사건 ID만 되짚어 누락 사건을 발견할 수 없다. 시작 시점에 이미 해소된 사건과 서버 중단 중 발생·해소된 사건도 같다.

**영향:** `EventService.java:343`의 RECENT 분기는 사본만 읽으므로 최근 해소 알람이 누락된다. 별도 HISTORY 모드의 실시간 이력 조회에는 존재할 수 있다. Zabbix 자체 이력이 삭제된다는 뜻은 아니다.

**근거:** 로컬 `AlertQuery.java`의 기본 생성자와 `ZabbixAlertAdapter.java:781`의 파라미터 변환, [Zabbix 7.0 problem.get 문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/problem/get)의 기본 미해소 조회 계약을 대조했다.

**수정 방향:** 최근 해소분을 포함해 수집하고, 마지막 성공 커서 이후의 발생 이력을 overlap을 두어 멱등 적재한다. 장애 복구 후의 긴 공백은 `event.get`으로 보충해야 한다. 단순히 폴링 간격만 줄여서는 공백이 없어지지 않는다.

**필수 검증:** 두 동기화 사이에 발생·해소된 사건이 사본과 RECENT 목록에 나타나는지, 첫 부팅·수집 중단 후에도 보충되는지.

### [ ] R2 — P1: 복구 불가능한 앞 500건이 뒤 사건들의 해소 처리를 막는다

**위치:** `moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:290`, `:303`; `event/repository/EventProblemRepository.java:51`.

후보는 `rClock=0/null AND eventId NOT IN openIds ORDER BY clock ASC`이며 매번 `PageRequest.of(0, 500)`이다. 원본이 삭제돼 복구 사건을 찾지 못하면 UPDATE 없이 반환하고, 재시도 시각·커서·실패 격리 상태도 남기지 않는다.

**조건:** 가장 오래된 미해소 사본 500건의 Zabbix 원본이 삭제되고, 그 뒤에 실제로 해소된 501번째 사건이 있다. 매 주기 같은 앞 500건만 재조회하므로 501번째는 순서가 오지 않는다. 발생 시각이 30일 조회창 밖인 장기 미해소 사건도 후보를 점유할 수 있다.

**영향:** 뒤 사건은 실제로 해결됐어도 목록과 벨에서 계속 미해소로 남는다. 90일 정리 이전까지 장기간 지속할 수 있다.

**재현:** 실제 repository JPQL 조건·정렬을 추출한 메모리 SQLite 검증에서 3회 모두 같은 500건이 선택되고 `resolved-later`는 한 번도 선택되지 않았다. 실제 PostgreSQL 통합 검증은 아니다.

**수정 방향:** 마지막 검사 시각/재시도 예정 시각 또는 keyset cursor를 저장해 실패 후보도 뒤로 보내고, 신규 해소 후보가 계속 진행되게 한다. 실패한 사건을 곧바로 해소 처리해서는 안 된다.

### [ ] R3 — P1: 10,000건 상한이 사본을 불완전하게 만들어 활성 알람을 숨긴다

**위치:** `moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:122`, `:207`.

전체·증분 모두 동일한 `limit=10000`만 사용하며 다음 페이지/커서/분할 조회가 없다. 이 상한에 닿았다는 별도 감지나 사본 불완전 표시도 없다.

**조건:** 조회창 내 활성 알람 10,001건 중 동일한 10,000건이 계속 반환되는 상황. 남은 사건은 새로 발견되지 않으며, 전체 보정도 똑같이 잘리므로 복구하지 못한다. 이미 사본에 있던 잘린 사건은 오히려 사라진 후보로 분류돼 R2의 큐를 점유한다.

**영향:** ZM-125 이후 사본이 목록·벨의 조회 원천이므로 배치 부하 제한이 사용자에게 보이는 알람 누락으로 바뀐다. 심각도 카운트는 다른 실시간 경로를 타서 목록과 숫자가 어긋날 수도 있다.

**근거:** 두 수집 경로와 신규 판정 및 사본 소비 경로 정적 추적. 실제 10,001건 Zabbix 부하 시험은 미실시.

**수정 방향:** 안전 상한은 요청 단위로 유지하되 ID 커서 또는 범위를 분할해 전체 집합을 확보한다. 스냅샷이 완전하지 않을 때에는 누락 집합을 확정하거나 정상 동기화로 표시하지 않는다.

### [ ] R4 — P2: 읽음 상태의 사용자 ID가 서로 다른 식별자 체계를 사용한다

**위치:** `moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:150`; `EventService.java:761`, `:823`.

동기화는 Zabbix `user.userid()`를 `event_read_status.user_id`에 저장한다. 벨 조회와 사용자의 직접 읽음 처리는 `currentUser.getId()`를 사용한다. `AuthService.java:118`에서 이 값은 내부 `User.id`이며, Zabbix ID는 별도 `userid`에 담긴다. 내부 ID는 `BaseEntity.java:29`의 독립적인 IDENTITY 값이다.

**조건:** 사용자 A의 내부 ID=42, Zabbix ID=7. 동기화가 A의 조치에 따른 읽음을 `(event,7)`에 쓰지만 A의 벨은 `(event,42)`를 읽는다. 내부 ID=7인 다른 사용자가 해당 사건을 볼 수 있다면 A의 읽음 상태가 그 사용자에게 적용될 수 있다.

**영향:** 조치한 사람에게 미읽음이 남거나 다른 사람의 미읽음 알림이 사라진다. 사건 본문 권한을 우회한다는 주장은 아니다. R5와 별개로, 행을 처음 생성하는 경로에서도 발생한다.

**근거:** 생성·저장·조회 경로 정적 대조. 운영 계정 ID 매핑은 조회하지 않았다.

**수정 방향:** 저장 식별자를 내부 User.id로 통일하고, Zabbix 조치자는 `zabbix_userid → User.id`로 변환한다. 기존 혼재 행의 이행 정책도 필요하다. 미연동 로컬 계정을 지원하므로 읽기 쪽만 Zabbix ID로 바꾸면 안 된다.

### [ ] R5 — P2: 기존 미읽음 행은 조치 후 전체 보정이 돌아도 읽음으로 바뀌지 않는다

**위치:** `moveseye-be-spring/src/main/java/com/dmove/moveseye/event/EventSyncService.java:470`.

상위 로직은 외부 조치를 발견하면 `isRead=true`로 계산하지만, `ON CONFLICT (event_id,user_id) DO UPDATE`는 `read_at`과 `updated_at`만 갱신한다. `is_read`는 누락돼 있다.

**조건:** 기존 행의 `is_read=false` → 사용자가 Zabbix에서 확인 조치 → 전체 보정. 읽은 시각만 생기고 플래그는 false로 남는다. ID가 우연히 일치하거나 R4를 고친 뒤에도 발생한다. 앱 내 직접 읽음 처리 경로 전체가 실패한다는 의미는 아니다.

**재현:** 실제 Java 문자열에서 SQL을 그대로 조립해 메모리 SQLite에서 실행했다. false 행에 true를 UPSERT한 결과 `is_read=false`, `read_at=2026-09-07 00:00:01`.

**수정 방향:** conflict UPDATE에 읽음 상태 반영을 추가하되, 동기화가 사용자의 동시 읽음을 되돌리지 않도록 OR 병합 등 읽음 정책을 명시한다. 기존 테스트 `actorBecomesRead`는 삽입 파라미터만 확인하므로 UPDATE 누락을 잡지 못한다.

### [ ] R6 — P2: SSE 2초 스로틀이 마지막 변경 신호를 버린다

**위치:** `moveseyee_fe/src/hooks/useEventStream.ts:72`.

첫 신호는 즉시 재조회하지만 2초 안에 도착한 신호는 `return`으로 버린다. 마지막 신호를 위한 예약 실행이 없다. BE의 사이클 끝 단일 push는 같은 사이클의 중복만 줄이며, 조치·접속·별도 동기화 사이의 충돌은 남는다.

**조건:** t=0 신호의 재조회가 완료 → t=1 다른 사용자의 조치가 DB에 반영되고 두 번째 신호 도착 → 두 번째 신호 폐기. 이후 변화가 없으면 주기적인 보정 push까지 화면이 옛 상태다.

**영향:** 단일 인스턴스에서도 실시간 갱신 보장이 깨지고 정상 보정 주기 기준 최대 약 5분 늦을 수 있다. 다중 인스턴스 제약과는 다른 문제다.

**재현:** 실제 `useEventStream.ts`를 TypeScript로 transpile하고 React/QueryClient/EventSource만 격리했다. 1초 간격 신호 2개, 3초 경과 후에도 무효화는 1회이고 예약 작업은 0개였다. 브라우저 E2E는 아니다.

**수정 방향:** trailing 실행을 보장하는 throttle로 바꾸고 cleanup에서 timer를 취소한다. 기존 테스트는 두 번째 신호가 즉시 실행되지 않는지만 확인한다.

### [ ] R7 — P2: 48시간 미만 RAW 차트도 100,000건 상한에 잘릴 수 있다

**위치:** `moveseye-be-spring/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:46`; `src/main/java/com/dmove/moveseye/common/metric/AdaptiveSeriesQuery.java:58`.

trends 전환은 기간만 보고 차트=48시간, 통계=1시간으로 결정한다. 원시 포인트 수는 수집 간격과 배치 아이템 수도 좌우하므로 이 문턱이 상한 미도달을 보장하지 않는다.

**조건:** 1초 간격 아이템의 36시간 차트는 약 129,600포인트지만 RAW로 조회된다. 상한 100,000개가 `clock ASC`로 잘려 끝부분 약 8시간 13분이 누락된다. 30분 통계에 같은 타입 100개 아이템을 1초 간격으로 묶으면 180,000개라 통계 경로도 가능하다.

**영향:** 최근 차트 구간이나 통계에 포함돼야 하는 값이 빠져도 응답에는 불완전 표시가 없고 경고는 서버 로그에만 남는다. 48시간 이상 trends 직행 수정으로 이 경우까지 해결된 것은 아니다.

**근거:** 실제 분기·배치·상한 파라미터의 정적 추적과 표본 수 계산. 대량 history.get 실서버 시험은 미실시.

**수정 방향:** 상한 도달 시 창/아이템별 분할 조회 또는 적절한 집계 경로로 재조회하고, 완전한 데이터를 확보하지 못하면 명시적으로 알린다. 단순 상한 확대는 재발 문턱만 옮긴다.

## 수행한 검증

| 검증 | 결과 |
|---|---|
| BE `EventSyncServiceTest` | 14/14 통과 |
| BE `EventStreamHubTest` | 5/5 통과 |
| BE `AdaptiveSeriesQueryTest` | 4/4 통과 |
| FE `useEventStream.test.tsx` | 6/6 통과 |
| 실제 FE 훅 격리 실행 | R6 재현 |
| 실제 SQL/JPQL 추출 후 SQLite 격리 실행 | R2·R5 재현 |

재현 파일은 [probe.cjs](file:///C:/solutions/_workspace/_archive/features/events/zabbix-load-relief/logic-review-2026-09-07/probe.cjs), [probe.py](file:///C:/solutions/_workspace/_archive/features/events/zabbix-load-relief/logic-review-2026-09-07/probe.py). 실행 명령:

```powershell
node C:/solutions/_workspace/_archive/features/events/zabbix-load-relief/logic-review-2026-09-07/probe.cjs
python C:/solutions/_workspace/_archive/features/events/zabbix-load-relief/logic-review-2026-09-07/probe.py
```

이 스크립트는 결함이 관찰되면 성공 종료하도록 만든 재현 도구다. 수정 후 정상 동작을 보장하는 회귀 테스트를 제품 테스트에 별도로 추가해야 한다.

전체 테스트, 운영 DB, 실 Zabbix 데이터 생성, 브라우저 종단 시험은 수행하지 않았다. 기존에 명시적으로 유예한 시간버킷 비가중 평균과 인스턴스 로컬 SSE 자체는 신규 결함 수에 포함하지 않았다.

## 2026-09-07 재확인 — ZM-123 후속 커밋 반영 상태

사용자 요청으로 BE `1498082`(ZM-123 후속 `e0eea42`, `b96e912`, `ff1822a` 포함), FE `8da4251` 기준으로 다시 대조했다. APM 관련 미커밋 작업은 검수 대상에서 제외했다. 이번 확인은 커밋·현재 코드 정적 대조이며 테스트/운영 부하 시험을 다시 실행하지 않았다. 위 최초 검수의 체크박스와 재현 기록은 당시 기준으로 보존한다.

| 항목 | 현재 판정 | 근거 및 남은 일 |
|---|---|---|
| R1 | 부분 보완 | 전체/증분 모두 recent=true이고 복구 시각 즉시 보충이 추가돼 정상 수집 주기 사이의 발생·해소 누락은 보완됐다. 최근 해소 보존창보다 긴 수집 중단 뒤 발생 이력을 커서로 보충하는 경로는 없어 공백 복구까지 완료한 것은 아니다. |
| R2 | 미해결 | reconcileResolved가 여전히 PageRequest.of(0,500), 후보 정렬도 clock ASC다. 복구 불가능한 후보를 뒤로 보내는 커서·재시도 시각이 없어 후속 처리를 막을 수 있다. 시간창 제거·recent 해소 즉시 갱신은 일부 원인을 완화하지만 이 경로 자체는 남는다. |
| R3 | 경고만 보완, 누락 미해결 | warnIfLimitReached가 전체/증분 10,000건 도달 경고를 남긴다. 페이지/범위 분할 수집은 없으므로 상한 밖 알람의 사본 누락은 남는다. |
| R4 | 미해결 | 전체 동기화는 parseLong(user.userid())를 저장하고, 목록/벨·읽음은 내부 currentUser.getId()를 쓴다. ID 매핑 통일이 없다. |
| R5 | 미해결 | batchUpsertReadStatuses의 ON CONFLICT UPDATE가 read_at·updated_at만 갱신한다. is_read 반영이 여전히 없다. 조치 읽음을 SSE 앞에 두는 수정은 앱 조치 경로 보정이며 이 결함과 다르다. |
| R6 | 미해결 | useEventStream은 2초 이내 신호를 return으로 버리고 trailing timer를 예약하지 않는다. |
| R7 | 일부 경로 보완 | ItemsService는 100,000건 도달 그룹을 폐기 후 trends로 보충한다. ZabbixMetricAdapter의 RAW 배치는 여전히 상한 응답을 그대로 소비하며 AdaptiveSeriesQuery의 RAW 경로도 이를 사용한다. trends가 전부 없을 때 장기 RAW 폴백도 추가돼 전체 경로에서 조회 예산·불완전 결과 처리가 필요하다. |

### 현재 우선순위

1. 정확성: R2 후보 순환, R4/R5 읽음 식별자·UPSERT, R6 마지막 SSE 신호 반영을 우선 보완한다. R3/R7은 대량/고빈도 데이터 환경에서 누락이므로 적용 환경 규모 확인과 함께 요청 단위 상한을 유지한 분할 수집·불완전 표시를 설계한다.
2. 부하 후속: 목록 캐시 미스 single-flight, 상세 메트릭/메타데이터 캐시·배치, 알람 조치 상세 및 과거 이력 직접 조회 최적화.
3. 다중 BE 시: 인스턴스별 10콜 상한을 전체 호출 예산으로 보완하고 인스턴스 로컬 SSE는 Redis pub/sub로 확장한다.

ZM-123으로 기존 반복 조회·전체 동기화·장기 RAW 부하는 개선됐지만, 이 문서의 모든 정확성 문제가 해결됐다는 판정은 아니다. 실제 감소율과 운영 적용 여부는 별도 검증이 필요하다.
