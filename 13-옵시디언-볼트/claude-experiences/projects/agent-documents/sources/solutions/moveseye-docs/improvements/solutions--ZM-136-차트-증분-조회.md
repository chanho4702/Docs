---
title: 차트 증분 조회 (knownThrough 커서·overlap 병합·backfill)
doc_type: feature
issue: [ZM-136, ZM-137, ZM-138, ZM-139, ZM-140, ZM-141, ZM-142, ZM-143, ZM-144, ZM-148]
audience: [개발, 운영]
status: current
owner: MovesEye 팀
baseline: 2026-09-14
source_of_truth: moveseye-be-spring `common/response/IncrementalChartQuery`·`common/concurrent/SingleFlightExecutor`·host cpu/memory/network Service, moveseyee_fe `hooks/chart/useIncrementalChartData`·`hooks/useMonitoringChartRefresh`, 계약 `_workspace/features/infra/chart-incremental/contract_monitoring_chart_incremental.md`, 진행 기록 `_workspace/features/infra/chart-incremental/report_zm-136_monitoring-chart-epic.md`
reviewed_at: 2026-09-14
review_cycle: event-driven
---

# 차트 증분 조회 (`ZM-136` 에픽)

## 0. 한눈에

| | |
|---|---|
| **왜** | 상대 기간 차트가 3분마다 **선택한 창 전체**를 다시 조회했다 — 1시간 차트면 매번 1시간치, 새로 생긴 건 3분치뿐인데 |
| **뭐를** | 차트 갱신이 조회하는 **구간**을 바꿨다(전체 → 마지막 확보 지점 이후만) |
| **어떻게** | `knownThrough` 커서 + 120초 overlap 보정 + 30분 backfill 조각 + FE 병합, 동시 중복은 single-flight로 합침 |
| **결과** | 갱신당 조회량이 "창 전체" → "새로 생긴 몇 점"(1h 창 기준 약 1/20), 사용자가 갱신 주기도 선택(끔/30초/1분/3분) |

## 1. 문제 — 어디서, 무엇이

**발생 지점: 호스트 상세의 CPU·메모리·네트워크 차트 자동 갱신(FE `useChartOption` 폴링).**
상대 기간(period) 차트는 3분마다 from/to를 다시 계산해 **창 전체를 다시 요청**했다 —
10:00에 09:00~10:00을, 10:03에 09:03~10:03을. 새 데이터는 3분치인데 조회는 매번 1시간치다.

- [차트 다이어트](solutions--ZM-130-131-%EC%B0%A8%ED%8A%B8-%EC%A1%B0%ED%9A%8C-%EB%8B%A4%EC%9D%B4%EC%96%B4%ED%8A%B8.md)가 "한 번 부를 때 싸게"(요약본·상한)를
  해결했지만, **"매번 전체를 다시 부른다"**는 축은 남아 있었다.
- 갱신 주기도 전 사용자 고정 3분 — 끄거나 바꿀 수 없었다.
- 여러 탭·운영자가 같은 호스트를 보면 같은 조회가 동시에 중복으로 나갔다.

## 2. 어떻게 처리했나

### 2.0 AS-IS → TO-BE (API 단위)

| API | AS-IS (원래) | TO-BE (변경 후) |
|---|---|---|
| `GET /host/{id}/cpu·memory·network/line-charts` | 3분마다 창 전체 재조회 | **불변**(첫 진입·비표준 차트용으로 유지) — 기존 소비자 무영향 |
| `GET .../line-charts/incremental` | **없었음** | 신설 — `knownThrough` 커서로 "마지막 확보 지점 이후"만 조회. 응답: `requested`/`covered`/`coverage`/`hasMore`/`nextKnownThrough`/`series` |
| FE 자동 갱신 | 전 사용자 고정 3분, 끌 수 없음 | **끔/30초/1분/3분** 선택(기본 1분, 사용자별 localStorage). 절대 기간(from/to 고정) 차트는 종전대로 무갱신 |
| 동일 요청 동시 중복 | 각자 Zabbix로 | **single-flight** — 동일 (사용자·호스트·선택자·covered) 요청은 1회 실행에 합류 |

### 2.1 커서 계약 — 요청 구간이 정해지는 규칙 (`IncrementalChartQuery`)

```
FE가 knownThrough(마지막으로 완전히 확보한 구간 끝)를 보냄
 ① knownThrough 없음/from보다 과거 → 창 전체 조회(첫 진입)
 ② 있음 → coveredFrom = max(from, knownThrough − 120초)
    · 120초 overlap: Zabbix에 늦게 도착·정정된 값을 다시 읽어 보정 —
      겹치는 point는 FE가 새 값으로 덮어씀
 ③ coveredTo = min(to, knownThrough + 30분)
    · 탭을 오래 비웠다 돌아오면 한 번에 다 당기지 않고 30분 조각씩 —
      남으면 hasMore=true + nextKnownThrough로 다음 조각을 이어받음
```

### 2.2 FE 병합 규칙 (`useIncrementalChartData` + `incrementalChartData`)

```
 ① 커서·병합 series는 탭 메모리에만(Redis에 사용자별 차트 저장 안 함 — 계약)
 ② coverage=COMPLETE일 때만 병합·커서 전진 — PARTIAL이면 커서를 안 움직여
    잘린 데이터 위에 커서가 넘어가는 일이 없다
 ③ 같은 type+timestamp point는 새 응답 값으로 덮어씀(overlap 보정)
 ④ 현재 창(from)보다 오래된 point 제거 + from/to를 x축 양 끝으로 고정
    (점 개수에 따라 시간축이 줄어드는 것 방지)
 ⑤ host·차트 종류·선택자·기간이 바뀌면 커서·병합 상태를 버리고 전체 조회부터
 ⑥ hasMore=true면 다음 조각을 한 번에 하나씩 순차 요청, 탭 복귀(visibilitychange)·
    네트워크 복구(online) 시 즉시 1회 갱신 — 진행 중 요청과 중복되지 않게 보호
```

### 2.3 single-flight (`SingleFlightExecutor`)

동일 키의 동시 실행을 첫 실행에 합류시켜 Zabbix 조회를 1회로 — **캐시가 아니다**(진행 중
합류만, 종료 즉시 키 정리라 낡은 결과가 없다). 🔴 **키에 principal(사용자) 필수** — 빼면
다른 사용자의 권한으로 조회된 결과를 공유받는 권한 우회가 된다.

## 3. 적용 범위

| 경로 | 적용 |
|---|---|
| 호스트 상세 CPU·메모리·네트워크 표준 차트 | ✅ 증분 경로 |
| Disk·Interface·응답시간·사용자 지정 아이템 차트 | ❌ 기존 배열형 EP 유지(초기 대상 아님) |
| 절대 기간(from/to 고정) 차트 | ❌ 자동 갱신 자체가 없음(종전대로) |
| 갱신 주기 설정 | `useChartOption`을 지나는 상대 기간 차트만 |

## 4. 해결된 것 (dev 실측 2026-09-14, `zm148_verify.py`)

- 계약 동작 전건 통과: 전체 창(covered=requested·COMPLETE) → 증분(overlap 120초) →
  2시간 공백(30분 조각·hasMore 순차 이어받기).
- **정확성 동등성**: "전체 1회 조회" vs "앞 30분+증분 병합"의 포인트 집합 **완전 일치(60점=60점, 차이 0)**.
- 갱신당 조회량: 1시간 창 기준 60점 전체 → **증분 ~3점 구간**(overlap 포함 3분 창).

## 5. 트레이드오프와 우려점

**트레이드오프(의도한 대가):**

- **커서·병합 상태가 탭 메모리** — 새로고침하면 전체 조회부터 다시(서버 저장 안 함의 대가.
  Redis에 사용자별 차트 배열을 쌓지 않는다는 계약 준수).
- **COMPLETE의 의미 제한** — 현재 COMPLETE는 "조회 호출 성공"이지 RAW가 상한에 안 잘렸다는
  보증이 아니다. 엄밀한 PARTIAL 표기는 engine port의 truncated 메타 도입이 선행돼야 한다
  (ZM-139 기록 제약 — 후속).
- **overlap 120초의 중복 조회** — 매 증분마다 2분치를 다시 읽는 보정 비용(지연 도착 값의
  정확성과 교환).
- **single-flight의 효과 범위** — 탭마다 커서가 다르면 covered가 달라 합쳐지지 않는다.
  첫 로드·창 정렬 시에만 dedup(그 이상은 148 실측 후 판단).

**우려점(지켜봐야 할 것):**

- **FE 브라우저 E2E 미실시** — 병합 렌더·탭 복귀 동작은 단위 테스트 기준. 실브라우저 확인 잔여.
- **복귀·재연결이 현재 시각까지 안 따라감(이월)** — 기존 from/to로만 보충. 자동 갱신(기본
  1분)이 다음 주기에 따라잡아 실피해는 "갱신 끔" 사용자 한정 — range 재계산 구조와 얽혀 이월.
- 실제 Zabbix delay 분포 기반의 기본 주기(1분) 적정성 검증 잔여(ZM-148 잔여 항목).
- ZM-144(호출 예산 분리)는 실측 데이터 없이 수치를 정할 수 없어 **대기** — 자의적 숫자는
  커넥션 풀 상한(ZM-129)과 이중 규제가 된다.

## 6. 함정

- **`knownThrough`는 "마지막 데이터 point"가 아니다** — "마지막으로 **완전히 확보한 구간
  끝**"이다. point 기준으로 보내면 수집 지연 구간이 영영 안 메워진다.
- **PARTIAL에서 커서를 전진시키면 안 된다** — 잘린 구간 위로 커서가 넘어가면 그 공백은
  영영 안 채워진다(계약의 핵심 불변식).
- **queryEnabled의 `boolean | undefined`** — `params && ...` 식이 undefined를 품은 채 증분
  훅의 strict boolean 계약에 흘러들어 tsc가 잡았다(인수 시 발견·수정). optional 조합 식은
  경계에서 `!!`로 확정할 것.
- **single-flight 키의 권한 축** — 결과를 공유하는 모든 dedup 장치는 키에 사용자를 넣지
  않으면 권한 우회가 된다. 그리고 **키는 응답에 실리는 모든 축을 포함해야** 한다 — covered만
  키로 쓰면 requested가 다른 요청이 합쳐져 메타(requested·hasMore)가 오염된다(검수 지적).
- **React Query 캐시는 "내 요청"이 아닐 수 있다** — 재마운트·identity 전환기에 캐시/늦은
  응답이 새 상태에 병합되면 커서가 오염된다. 증분류 훅은 "이 응답을 이 인스턴스가, 이
  identity로 요청했나"를 대조하고, 아니면 버리고 전체 조회로 복구할 것(검수 HIGH 2건).
- **커서는 정렬 축 전체를 담아야** — clock 단독 커서는 같은 clock 다건의 배치 경계에서
  영구 누락을 만든다. (clock, eventId) 복합 커서 + 동일 정렬(검수 지적).
- **effect 재실행 ≠ 새 응답** — deps 재생성으로 effect가 다시 돌 때 이전 hasMore 응답이
  backfill을 재예약해 실패 시 무한 재요청이 됐다. "응답 객체당 1회 처리"를 가드로.

## 7. 이슈별 정리 (에픽 12건)

상세 경과·검증 명령은 [에픽 보고서](../../_workspace/features/infra/chart-incremental/solutions--report_zm-136_monitoring-chart-epic.md)의 각 절이 정본이다. 여기는 "각 이슈가 무엇이고 어디에 반영됐나"의 지도.

| 이슈 | 무엇 | 상태 | 반영·기록 |
|---|---|---|---|
| `ZM-137` [분석] | 현행 갱신·수집 주기 조사 — "1h 차트가 3분마다 1h 전체 재조회" 실증 | ✅ | `_workspace/analysis/analysis_zm-137_…` |
| `ZM-138` [설계] | 증분 API 계약 — knownThrough·overlap 120s·30분 조각·PARTIAL 불변식 | ✅ | `_workspace/features/infra/chart-incremental/contract_monitoring_chart_incremental.md` (§2.1이 요약) |
| `ZM-139` [BE] | CPU·Memory·Network `/line-charts/incremental` 신설 | ✅ 커밋 | BE `632be49`. 잔여: PARTIAL 엄밀 표기는 engine truncated 메타 후속 |
| `ZM-140` [FE] | 자동 갱신 주기 설정(끔/30초/1분/3분, 사용자별 localStorage) | ✅ 커밋 | FE `5ffa1d7`. 🔴 검수: 분 내림 탓 30초가 실제 1분 → 30초 격자 수정 |
| `ZM-141` [FE] | 증분 병합·고정 시간축(COMPLETE만 병합·overlap 덮어쓰기) | ✅ 커밋 | FE `5ffa1d7`. 🔴 검수: identity 전환기 응답·재마운트 캐시 잔재가 커서 오염 → 요청-응답 메타 대조로 수정 |
| `ZM-142` [FE·BE] | 탭 복귀·재연결 backfill(hasMore 순차·중복 방지) — BE 몫(조각·hasMore)은 139에 포함 | ✅ 커밋 | FE `5ffa1d7`. 🔴 검수: 실패 시 무한 재요청 → 응답당 1회 처리. ⏭ 이월: 복귀 시 현재 시각까지 재계산(갱신 끔 사용자만 영향) |
| `ZM-143` [BE] | 동일 요청 single-flight | ✅ 커밋 | BE `723497b`. 🔴 검수: 키를 covered→requested 축, Error도 실패 완료 |
| `ZM-144` [BE] | 실시간·집계 호출 예산 분리 | ⏸ **대기** | 예산 수치는 148 장기 관측 없이 정하면 ZM-129 풀 상한과 이중 규제 — 실측 선행 조건으로 보류(보고서 §ZM-144) |
| `ZM-145` [BUG] | 알람 되짚기 후보 500건 정체 | ✅ 커밋 | BE `4dc19e1`. 🔴 검수: (clock,eventId) 복합 커서로 보강. 상세는 [ZM-127 문서](solutions--ZM-127-%EB%8F%99%EA%B8%B0%ED%99%94-%EC%9D%B4%EC%9B%90%ED%99%94%EC%99%80-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%B2%AD%EC%86%8C.md) 함정 절 |
| `ZM-146` [BUG] | 읽음 상태 내부 id 통일·UPSERT | ✅ 커밋 | BE `4dc19e1`. 🔴 검수: 잔재 행 정리 배치 추가(값 겹침 행은 판별 불가 — 한계 명시). 상세는 ZM-127 문서 |
| `ZM-147` [BUG] | SSE trailing 갱신 보장 | ✅ 커밋 | FE `c0630ed`. 🔴 검수: leading 실행 시 trailing 예약 취소. 상세는 [ZM-128 문서](solutions--ZM-128-SSE-%EC%95%8C%EB%9E%8C-%ED%91%B8%EC%8B%9C.md) 함정 절 |
| `ZM-148` [QA] | 정확성·부하 검증 | 🟡 부분 | **정확성 실측 통과**(계약 전건 + 전체 vs 증분 병합 완전 일치, dev). 잔여: 부하 전후 호출량 비교·후보 감소 관측·delay 분포 기반 주기 검증·FE 브라우저 E2E |

이후 코덱스 통합 검수(10건, HIGH 5)가 위 이슈들 위에 한 라운드 더 얹혔다 — 반영 내역은 §6 함정과 보고서 검수 절 참조.
