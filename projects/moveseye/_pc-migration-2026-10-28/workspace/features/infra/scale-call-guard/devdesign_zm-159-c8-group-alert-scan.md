# ZM-159 C8 — 그룹 알람·문제 조회 흘려보내기 (H2·H3·H4) · 설계 v1

- 작성 2026-09-17 · 상위 설계: [`devdesign_zm-159-scale-call-guard.md`](devdesign_zm-159-scale-call-guard.md) §0.7 C8 · 근거: 감사 H2·H3·H4
- 사용자 지시(09-17): "다른 세션이랑 안 겹치게, 코덱스 시켜가면서" → BE 워크트리 `C:/worktrees/zm-159-be`(브랜치 ZM-159, HEAD `8fa5ec2` = master)
- 원칙(사용자 09-17): "한 번에 다 가져올 일은 없다 — 과하게 하지 말 것, OOM은 막을 것"

## 0. v1 결정 (코덱스 설계 검토 `_archive/features/infra/scale-call-guard/review_zm-159-c8-design_codex.md` R1~R13 반영) — 🔴 아래 §2와 충돌하면 여기를 따른다
| 대상 | v1 결정 |
|---|---|
| 포트 | `AlertPort.countHistory(src, ctx, AlertHistoryQuery)`(event.get `countOutput`, 행 없음) + `scanHistory(..., Consumer<List<Alert>>)` → `AlertScanOutcome(complete, stopReason, deliveredAlerts, calls)`. **둘 다 abstract**(default 없음, R8). `scanHistory`는 `includeActions`·`beforeNativeId`·`limit>0`이면 `BAD_QUERY`로 거부(R8). `deliveredAlerts`는 소비자에 실제 전달한 수(R9). LicenseGuarded 위임 |
| 스캔 예산 | 흘려보내기 전용 `zabbix.call.max-scan-rows`(기본 200만) — 페이지 1만 × 200회 < max-calls 2000. 시간 120초 공통. H2-a·H4는 count 경로라 스캔 안 함(R1) |
| **H2-a** 알림 추이 | 행 스캔 제거 → **버킷별 총계 count**(버킷 ≤ 1일이면 시간, 아니면 일) 후 **0이 아닌 버킷만 등급별 count 5회**(6번째는 총계−합). 하단 최근 N건 목록은 그대로(R1·R2) |
| **H2-b** 리포트 | `scanHistory(경량 + 엔티티, 발생만)` — 순서 eventid 오름차순 = 원본 NestJS `event.get` 기본 순서(정렬 미지정 ≈ eventid 오름차순)와 같은 축이라 동점 Top 호스트 규칙은 "먼저 발생한 호스트 우선" 그대로. 명시적 동점 키는 추가하지 않고 계약 주석에 남김(R11) |
| **H3** 그룹별 문제 요약 | `scanHistory(경량 + 엔티티, 발생만)` + **알람마다 대상 그룹 distinct 후 1회 누적**(R10). **완전한 결과만** Redis 캐시(키 = principal + 분 단위로 내림한 from/to, TTL 60초 — 홈이 60초마다 재조회, R3). 불완전 → 오류, 캐시 안 함 |
| **H4** 그룹 문제 상세 | FE 사용 필드는 `name`·`statusCounts`뿐(R4·R12). → 이벤트 원시 조회·trigger.get·복구 조회 **제거**, 등급별 `countHistory` 6회로 `statusCounts`·`alerts`·`safetyPercentage` 계산(정확). 호스트 조회는 `output=[hostid]` + `selectTags=[tag,value]`만(카테고리·totalHosts 유지, interfaces 제거). **폐기 필드**: `recentEvents`=[] · `statusFilter`=`statusCounts`와 동일(keyword/status 필터는 목록이 없어 무의미) — DTO·Swagger에 `@Deprecated`와 설명(R12). 원시 경로 제거(결정 3) |
| 쿼리 팩토리 | `AlertHistoryQuery.ofGroupWindowForScan(groupId, range, includeEntities)`(lightOutput=true, onsetOnly) 신설 — 캡처 테스트로 경량 고정(R7) |
| 테스트(R13) | 커서 전진·페이지 경계(정확히 1만)·예산 초과 시 미전달 페이지 제외·소비자 처리 중 기한 초과·같은 그룹 다중 호스트 중복·H2-a 0 버킷 건너뛰기·H4 count 6회·캐시(완전만). 실설치 `eventid_from` 회귀는 런타임 실측 항목으로 남김 |

## 1. 현상
| | 위치 | 지금 | 규모 |
|---|---|---|---|
| **H3** 그룹별 문제 요약 `/hosts/hostgroup-problems` | `HostService.getProblemsByHostGroup:377` | 기간 내 발생 알람을 **상한 없이 전부** `listHistory`(경량+selectHosts)로 받아 그룹×등급 집계 | 실측 2.3만 건=6MB → 30일 약 8GB. 지금은 응답 64MiB 상한에 걸려 오류 |
| **H2-a** 그룹 알림 추이 `getGroupAlertTrend:1147` | `HostService` | 버킷 집계용 이벤트 전부(`ofGroupWindow`, 조인 없음, **extend**) | 30일 3천만 건 |
| **H2-b** 리포트 알람 집계 `summarizeAlerts:199` | `ReportService` | 그룹 × 주/월 발생 알람 전부(extend + selectHosts) | 월간 수백만 |
| **H4** 그룹 문제 상세 `/hosts/hostgroup/problems/{id}` | `HostService:518` | `event.get` extend + acknowledges + tags **무제한**, `trigger.get`에 **중복 제거 없는** triggerids, 복구 사건 조회 무제한, 결과 목록 전체를 응답 | 수백만 × 3콜 |

FE 사용 확인(09-17): H4 응답에서 FE가 쓰는 것은 **`statusCounts`(헤더 건수)뿐**(`hooks/header-detail-info/useTemplateInfo.ts`). `recentEvents`·`statusFilter`·`safetyPercentage`는 이 응답에서 쓰지 않음(카드의 safetyPercentage는 다른 API). AI 서버는 이 API를 부르지 않음.

## 2. 방향 — 받은 행을 쌓지 않고 흘려보내며 집계
### 2.1 engine-api: `AlertPort.scanHistory` 신설 (C5 완전성 계약의 첫 조각)
```java
/** 이력을 페이지 단위로 흘려보낸다 — 결과를 쌓지 않는 집계 소비자용. 순서: 알람 id(≈발생 시각) 오름차순. */
default AlertScanOutcome scanHistory(SourceRef src, CallerContext ctx, AlertHistoryQuery query,
        Consumer<List<Alert>> pageConsumer)   // default = listHistory 1페이지(완전), 람다 금지(LicenseGuardedPortTest)
record AlertScanOutcome(boolean complete, String stopReason, long alertsSeen, int calls)
```
- 제약: `includeActions` 불가(조치 파싱은 무겁고 페이지마다 사용자 조회가 붙음), `limit` 무시(스캔은 끝까지), `beforeNativeId` 불가.
- `LicenseGuardedAlertPort`: 가드 후 위임(기존 listHistory와 동일 규칙).

### 2.2 engine-zabbix: 어댑터 구현
- `ZabbixQueryExecutor.scanByCursor(EVENT_GET, cursorField="eventid", cursorParam="eventid_from", pageSize = event.get policy max-rows(1만))`.
- 요청 파라미터는 listHistory와 같은 조립(공통 메서드로 분리), `sortfield/sortorder/limit`는 실행기가 소유.
- 페이지마다 `toAlert` 변환 → 소비자 호출 → 페이지 버림.
- **받은 행 예산**: 흘려보내기는 행을 쌓지 않으므로 전역 `max-total-rows`(50만)를 그대로 쓰면 30일 수백만 건 집계가 항상 불완전이 된다. → 🔸 **검토 요청**: (a) 스캔 전용 설정 `zabbix.call.max-scan-rows`(기본 500만) 신설, (b) 전역 50만 유지하고 불완전 처리, (c) 시간 예산(120초)만으로 제한. 초안은 (a) — 메모리는 페이지 1개(1만 행)로 묶이고, 자빅스 부하는 호출 수·시간 예산으로 묶인다.
- 불완전(예산·시간·전진 불가)은 `AlertScanOutcome.complete=false`로 돌려준다(예외 아님).

### 2.3 소비자
| | 변경 | 불완전일 때 |
|---|---|---|
| **H3** | `scanHistory(경량 + 엔티티, onsetOnly)`로 흘려보내며 그룹×등급 누적. 그룹 목록·호스트 매핑은 종전 그대로 | 🔸 `ApiError(ZABBIX_API_ERROR)` — 부분 합계를 정답처럼 내지 않음(C6과 같은 규칙). C7에서 "일부" 표시로 완화 |
| **H2-a** | 버킷 집계를 `scanHistory(**경량**, 조인 없음)`로 흘려보내기. 하단 목록(최근 N건 + 엔티티)은 종전 그대로 | 오류(캐시하지 않음) |
| **H2-b** | `scanHistory(경량 + 엔티티)` — 순서가 오름차순이 되므로 **종전의 "뒤에서부터 순회"(발생 오름차순 복원)가 자연히 충족**. 동점 Top 호스트 순서 불변 | 오류 → 리포트 배치는 해당 기간 실패로 남고 다음 회차 재시도(기존 실패 경로) |
| **H4** | ① 건수(`statusCounts`·`alerts`/safetyPercentage)는 `scanHistory(경량)`로 흘려보내며 등급별 누적. ② **목록은 최신 {@value N=1000}건만** `listHistory(limit N, 발생만, extend+acks+tags 상당)`으로 받고, `trigger.get`은 **중복 제거한** objectid로, 복구 사건 조회도 그 N건분만. ③ keyword/status 필터·`statusFilter`는 그 N건 기준 | 오류 |

- H4 ③은 **의미 변화**다(종전: 전체 기준). FE가 쓰지 않는 필드라 수용 제안 — 🔸 검토 요청. 대안: keyword가 있으면 스캔 중 페이지마다 새 objectid만 `trigger.get`으로 이름을 받아(캐시) 전체 기준으로 필터·집계하고 상위 N건만 보관.
- H4는 현재 `ZabbixHostService.getEventsRaw`(포트 우회, 원시 맵)를 쓴다. 이번에 포트(`AlertPort`)로 옮길지 — 🔸 초안: **옮기지 않고** 원시 경로에서 `limit`+distinct만 적용하고, 건수만 포트 스캔 사용(변경 최소). acks·tags의 원시 필드 형태를 포트 모델이 다 담지 못함.

## 3. 테스트 계획
- 어댑터: 커서 분할(eventid_from 전진·중복 없음), 페이지 버림(보유 안 함), 예산 초과 → complete=false, includeActions 거부.
- 포트 default: 1페이지 완전. LicenseGuarded: 가드 후 위임(리플렉션 전수 테스트 통과).
- H3·H2-a·H2-b: 여러 페이지 합산 = 한 번에 받은 결과(동등성), 불완전 → 오류, H2-b 동점 Top 호스트 순서 유지.
- H4: 목록 N 상한, trigger.get distinct, 건수는 전체 스캔 기준, 복구 조회는 N건분만.

## 4. 범위 밖
- C7(불완전을 화면에 표시) — 이번엔 오류로 처리.
- T-A A-2(problem.get 커서) — 같은 실행기 경로라 이 작업 뒤에 이어서.
- H5(네트워크 맵).
