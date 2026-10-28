# 검수 요청 — ZM-131 history.get 상한 + item.get N+1 제거

- 커밋: `29bf466` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브즈아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

- **history.get 안전핀**: `ZabbixHistoryServiceImpl` — 호출자가 limit을 안 주면 기본 상한 100,000을
  강제(getHistoryByItemids·getRange 모두). 상한에 닿으면 warn(조용한 절단 방지 — 이력 모드 12초
  사건의 교훈). 명시 limit은 그대로 존중.
- **getByListKey 1콜화**: search 키마다 개별 item.get(인터페이스 상세 = 9콜) →
  `search.key_` 배열 + `searchByAny:true` 1콜. 🔴 searchByAny 없으면 배열 search가 AND로 읽혀
  결과가 조용히 0이 된다 — 테스트로 고정. 부수: 두 키에 동시에 걸리던 아이템의 중복 수집 소멸
  (소비자는 전부 키 술어 필터라 순서·중복 무의존 — HostService 3곳 확인).

## 불안한 지점

1. 100,000 상한의 적정성 — 9아이템×30일×1분 = 약 39만 행짜리 요청이 잘린다(의도된 동작이지만
   해당 화면은 ZM-130 trends 전환 대상이 아니어서 warn으로만 드러남).
2. searchByAny=true가 filter(key_ 정확일치)와 함께 실릴 때의 상호작용 — 기존 filterKeys 경로는
   search와 병용되지 않음(코드상 배타적 사용) 확인.
3. 원본의 키 순서 연결(per-key concat)에 의존하는 숨은 소비자 여부 — 3곳 전수 확인(전부 술어 필터).

## 검증 / 미검증

- ✅ 신규 테스트 5건(멀티키 1콜+searchByAny·단일키 종전 모양·기본 상한 강제·명시 limit 존중·getRange 상한),
  BE 전체 그린.
- ❌ 실서버 round-trip(9키 → 1콜 응답 동일성) — 병합 후 실측 대상.

## 검수 결과 및 반영 (2026-09-03, codex exec → 픽스 커밋 `922a708`)

| 심각도 | 결함 | 반영 |
|---|---|---|
| 높음 | 100k 상한이 보이지 않는 절단을 만든다(다중 아이템 배치는 계열별 절단 위치 제각각) | 아이템 이력 차트는 48h 이상 창에서 **trends 직행**(원시 미호출 — 절단 자체가 사라짐), 인터페이스 상세는 **DESC+putIfAbsent**(필요한 건 최신값뿐 — 잘려도 최신 구간이 남음). 어댑터 querySeries RAW 배치는 ZM-130 adaptive(48h 문턱)로 이미 창이 묶임. 응답 truncated 플래그는 미채택(계약 확장 대비 실익 — 위 조치로 상한 도달 자체가 비현실화, warn 로그가 잔여 감지선) |
| 높음 | getRange가 무정렬+무경고로 "임의의 10만 조각" 반환 | clock ASC 정렬 + 상한 도달 warn 추가(파라미터 테스트 포함) |
| 낮음 | 파라미터 모양만 검증하는 테스트 | 장기창 trends 직행/단기창 원시 우선 테스트(ItemsServiceLongRangeTest), getRange 정렬 검증 추가. filterInterfaceid 병용·중복 키 심층 회귀는 실서버 round-trip 항목으로 이월 |
