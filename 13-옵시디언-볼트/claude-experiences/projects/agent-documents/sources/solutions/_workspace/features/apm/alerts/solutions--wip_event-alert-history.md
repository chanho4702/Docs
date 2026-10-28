# WIP — 이벤트/알림 이력(History) 모드 · 재개 노트

> **2026-08-24 갱신: §5(a) 재설계 적용됨(미커밋).** 경위: 기능은 08-20에 커밋됐으나(bf66f9f/ed5f894)
> 성능 재설계는 미적용 상태로 남아 있었고, 08-24 실측으로 6~11초·2000 절단 재확인 후 적용.
> - 계약: `AlertHistoryQuery.lightOutput` 축 + `ofWindowForScan`/`ofNativeIdsForList` 팩토리
> - 어댑터: `EVENT_LIGHT_FIELDS` 8필드 출력(경량일 때 extend 대체)
> - `EventService`: 경량 전량 스캔(상한 2000→20000) → 칩/필터/트리/정렬/슬라이스 → **페이지만** 상세
>   하이드레이트(`hydrateHistoryPage`, 엔티티·조치·그룹). `EventProblemResDto`에 `toBuilder`.
> - 테스트: EventServiceTest 27 green(경량/하이드레이션 검증 신규 1건 포함)
> - ⚠️ 이력 모드 정렬 축 중 host·totalActions는 하이드레이션 후 페이지 값이라 전량 정렬 불가 —
>   FE는 이 화면 정렬을 노출하지 않아(전 컬럼 sorter:false) 실사용 영향 없음. 문서화만.
> - 잔여: 실서버 재측정(아래 §4 비교), (b) hostgroup-problems 경량화는 별도, 커밋 승인


> 작성 2026-08-19(작업 중단 시점) / 티켓 **ZM-99** / 브랜치 FE `master`, BE `ZM-79`
> **상태: 미커밋.** 동작은 하지만 성능·절단 이슈 2건이 남아 있어 커밋 전 마무리 필요.

---

## 1. 배경 — 왜 손댔나

이벤트/알림 화면 통합(커밋 `a04fac7`) 후 필터를 점검하다 결함 5건을 찾았다.

| # | 증상 | 원인 | 처리 |
|---|------|------|------|
| 1 | 호스트 그룹 필터에 7개만 (Zabbix엔 30개) | 옵션 소스가 DMOVE DB `host_group`(동기화된 일부)였다 | ✅ `GET /hosts/hostgroups`(Zabbix hostgroup.get)로 교체 |
| 2 | "처리 일시" 필터가 무동작 | FE가 `resolutionFrom/To`를 보내는데 BE DTO에 필드가 없었다 | ✅ `EventListReqDto`에 추가 + 서비스에서 필터 |
| 3 | 상태 열 항상 "Problem", 처리 일시 항상 "Pending" | `problem.get`은 열린 문제만 준다 | ⚠️ 아래 §2 참조 — 이력 모드로 해결(마무리 필요) |
| 4 | 심각도 칩 "전체 84" vs 목록 "76건" | 칩은 포트 7콜로 따로 세고 비활성 규칙을 안 뺐다 | ✅ 목록과 같은 모집단에서 집계(콜 8→1) |
| 5 | 검색창에 호스트명 넣으면 0건 | 검색축이 problem **이름**(problem.get search.name) | ✅ placeholder를 "problem 이름으로 검색"으로 |

## 2. 핵심 실측 — Zabbix는 해결된 문제를 5분만 들고 있다

`settings.get` → **`ok_period = 5m`**. 그래서 `problem.get recent=true`를 켜도 의미가 없다
(dev 실측: recent=false 89건 / recent=true 89건, 그중 해결분 **0건**. 같은 시간 `event.get value=0`으로는 최근 2시간 해결 사건 5건 존재).

→ 해결 이력을 보려면 **다른 질의**(`event.get`)가 필요하다. Zabbix Problems 화면의 `Show: Recent problems / History`와 같은 축.
사용자 결정(2026-08-19): **A안 = History 모드까지 간다.**

## 3. 지금까지 넣은 변경 (전부 미커밋)

### BE `moveseye-be-spring`
- `engine-api/.../alert/AlertHistoryQuery.java` — 필터 축 4개 추가: `entities`(hostids) · `severities` · `nameContains`(search.name) · `nativeIds`(eventids).
  - 기존 8인자 생성자는 편의 오버로드로 남겨 호출부 무수정.
  - 팩토리 2개 신설: `ofWindowForList(...)`, `ofNativeIds(...)`.
  - 가드 완화: rule / range / **nativeIds** 중 하나만 있으면 통과(무제한 스캔은 여전히 차단).
- `engine-api/.../alert/Alert.java` — `withResolvedAt(Long)` 추가(2단 조회로 되짚은 복구 시각 주입용).
- `engine-zabbix/.../ZabbixAlertAdapter.java` — `listHistory`에서 새 축 4개를 event.get 파라미터로 매핑.
- `event/dto/EventShowMode.java` **(신규)** — `RECENT` | `HISTORY`.
- `event/dto/EventListReqDto.java` — `resolutionFrom`, `resolutionTo`, `show`.
- `event/EventService.java`
  - `getEventProblems`가 `show`에 따라 소스 분기(`listActive` ↔ `listHistoryForScreen`).
  - `listHistoryForScreen` — 발생 사건 1콜 + **복구 사건 2단 조회**(발생 사건엔 복구 *식별자*만 있고 시각이 없다) + `hostGroupsByHostId`(인벤토리 1콜, event.get은 그룹을 안 준다).
  - 이력 모드에선 "비활성 규칙 제외"를 적용하지 않는다 — 지난 사건은 지금 규칙 상태와 무관.
  - 칩 집계를 `countBySeverity(population)`로 통일.
- `test/.../EventServiceTest.java` — 5건 추가(recent 플래그 · 처리일시 범위 · 칩 모집단 · 이력 모드 매핑 · 이력 모드 규칙없음 허용). **전건 green.**

### FE `moveseyee_fe`
- `enums/event-alert-show.ts` **(신규)** — `EProblemShowMode`.
- `enums/common.ts` — `QueryParamKeys.SHOW = "show"`.
- `pages/event-alert/problem/ProblemList.tsx` — 표시 모드 Segmented(최근 문제 / 이력), 처리 일시 필터는 **이력 모드에서만** 노출, 그룹 필터 소스 교체(`selectedId`로 라벨 되짚기), 모드 전환 시 offset 초기화·처리일시 조건 정리.
- i18n 키(`problem_show_*`)는 다른 세션 커밋에 딸려 들어가 **이미 HEAD에 있음**.

## 4. 실서버 검증 결과 (:3001 임시 인스턴스, dev Zabbix 7.0.6)

```
recent    total 82  · 해결분 0
history   total 2000(절단) · 해결분 다수 · 12.4초
hist+sev  DISASTER 7건, 처리 일시 실제 값 · 11.2초
hist+grp  Windows servers 682건 · 2.9초
hist+res  처리일시 최근 24h → 156건 · 8.5초
```
→ **기능은 맞다. 성능과 절단이 문제.**

## 5. 🔴 남은 작업 — 이걸 해야 커밋 가능

### (a) 이력 모드 성능·절단 재설계
현재는 `output=extend`로 최대 2000건을 통째로 받고 그걸 두 번 돈다. 비용 측정(직접 event.get):

| 호출 | 건수 | 시간 |
|---|---|---|
| `countOutput` | — | 0.11초 |
| **가벼운 4필드**(eventid, clock, severity, r_eventid) | 4822 | **0.32초** |
| `output=extend` (limit 2000) | 2000 | 5.5초 |
| extend + selectHosts | 2000 | 6.1초 |
| extend + selectHosts + selectAcknowledges | 2000 | 5.8초 |
| **eventids로 10건만 상세** | 10 | **0.25초** |
| 복구 사건 전체(eventid, clock) | 4764 | 0.15초 |
| `search{name}` 필터 | 3062 | 0.15초 |

→ 설계: **가볍게 전부 받아(0.3초) 메모리에서 필터·정렬·집계·슬라이스 → 현재 페이지 10건만 상세 하이드레이트(0.25초)**.
복구 시각도 가벼운 전체 조회(0.15초) 한 번으로 맵을 만들면 처리일시 필터·열 양쪽에 쓸 수 있다.
예상: **12초 → 1초 미만, 절단 소멸(전체 건수도 정확)**.
- 포트 계약에 "가벼운 출력" 옵션이 필요할지 검토(현재 어댑터는 항상 `output=extend`).
- `HISTORY_SCAN_LIMIT = 2000`(EventService)은 이 재설계 후 제거 또는 대폭 상향.

### (b) 그룹별 현황 패널 500 (같은 뿌리)
`GET /hosts/hostgroup-problems`가 기간이 길면 Zabbix 500(`HostService.getProblemsByHostGroup` → `listHistory` 무거운 조회).
지금은 FE에 "기간이 너무 길어 집계 실패" 경고만 붙여둔 상태. (a)와 같은 가벼운 조회로 같이 해소 가능.

### (c) 브라우저 E2E
표시 토글 실제 동작·처리 일시 필터 노출/숨김·페이지네이션 확인 — **미실시**.

### (d) 커밋 (승인 필요)
```
BE: #ZM-99 [FEATURE] 이벤트/알림 — 표시 모드(최근 문제/이력) 신설·처리 일시 필터 구현·심각도 칩 모집단 통일 -2026-08-XX
FE: #ZM-99 [FEATURE] 이벤트/알림 — 표시 모드 토글·그룹 필터를 Zabbix 그룹 전체로 교체 -2026-08-XX
```
🔴 병행 세션(AI/MCP 작업)이 같은 레포를 만지므로 **공유 파일은 헝크 선택 스테이징**, 커밋 직후 `git ls-tree HEAD`로 내 파일 생존 확인.

## 6. 정리 필요
- 임시 BE 인스턴스 **:3001**이 떠 있다(내가 띄움). :3000(원본)은 별개로 정상. 작업 재개 안 하면 내릴 것.
