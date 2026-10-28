# 검수 반영 — ZM-123 에픽 통합 최종 검수(FIX 커밋 7개 + 상호작용)

- 대상: 에픽 전 커밋(cf4c951~922a708) + FIX 커밋 7개의 통합 상태 (master)
- 검수: 2026-09-03 codex exec(통합 diff 전체), 결과 HIGH 2 · MEDIUM 6 = 8건 — **전건 실결함 판정, 전건 반영**
- 작성: 2026-09-07

## 결함과 반영

| # | 심각도 | 결함 | 반영 |
|---|---|---|---|
| 1 | HIGH | 사본 서빙의 권한 재현이 호스트 축뿐 — Zabbix **Problem tag filter**(usergroup tag_filters)가 설정된 설치본에서 태그로 금지된 알람이 목록·벨에 노출 | `ZabbixUserGroupService.hasProblemTagFilters`(usergroup.get selectTagFilters) + `ProblemTagFilterGuard`(5분 Redis 캐시, 실패 시 직전 값) 신설. **활성일 때만** 목록/벨 후보 id를 사용자 토큰 재조회(`ofNativeIds`)로 걸러 태그 축을 복원 — 태그 필터 없는 보통 설치본은 콜 0. 검증 콜 실패는 fail-closed(권한 누출 < 일시적 빈 목록) |
| 2 | HIGH | 동기화 조회의 30일 창 — 30일 전 발생해 **아직 열려 있는 장애**가 사본 밖 → 화면에서 소실. cleanup의 clock 기반 좀비 삭제도 같은 축 | 보정·증분 모두 **시간창 제거**(problem.get은 열린 문제만이라 응답이 원래 작다). 좀비 정리는 clock→**updated_at 기반 2일**(살아 있는 행은 보정이 매번 upsert하므로 updated_at이 항상 신선 — 진짜 장기 장애는 절대 안 지워짐). 1만 건 안전핀은 유지하되 **도달 시 warn**(감지선). 커서 청크 적재는 미채택 — 열린 문제 1만+ 설치본이 나오면 확장 |
| 3 | MEDIUM | 정확히 1시간 창 통계가 trends 전환으로 빈 값(진행 중 버킷 미저장 + 직전 버킷 창 밖) | 이중 반영 — ① stats 문턱을 **초과 판정**으로(정확히 1h 창은 RAW 직행, 콜 1회로 원상), ② statsSeries/chartSeries 모두 **trends 전부 빈 결과면 RAW 폴백**(안전망). 다버킷 창의 마지막 미완결 버킷 보간은 미채택(avg 근사 승인 축과 동일한 수용) |
| 4 | MEDIUM | 48h 미만 창도 아이템 수×밀도에 따라 10만 상한 절단 가능 — 부분 데이터가 정상 응답 | `DEFAULT_HISTORY_LIMIT`을 계약(engine-api)에 공개, ItemsService가 그룹 응답의 **상한 도달을 감지하면 절단 원시를 통째로 폐기** → 그 아이템들은 기존 trend 폴백이 온전한 요약으로 채움(부분 원시 < 빈 결과 + trends) |
| 5 | MEDIUM | trends=0(미보존) 아이템의 긴 창 차트가 빈 응답 — trends 직행이 history를 아예 안 봄 | ItemsService: 긴 창에서 **trends가 빈 아이템만** 원시(상한 내)로 보완 조회. AdaptiveSeriesQuery는 #3의 전부-빈 폴백이 같은 케이스를 커버 |
| 6 | MEDIUM | 다중 호스트 사건이 두 번째 호스트 필터(hostId=B)에서 누락 — 대표 host_id와만 equals | `rowMatchesHost`: host_ids(JSON) 포함 판정, legacy(NULL) 행은 host_id 폴백 |
| 7 | MEDIUM | 조치 시 SSE broadcast가 읽음 저장보다 먼저 — 같은 사용자의 다른 탭이 신호 받고 재조회하면 unread 부활 | `markReadForUser`를 `resyncEventsAndBroadcast` **앞**으로 이동(순서 스왑) |
| 8 | MEDIUM | 동기화 사이에 발생·해소된 초단명 사건이 사본에 영영 미적재(종전 recent:true에선 보였음) | 보정·증분 모두 `includeRecentlyResolved(true)` — 신규+해소분은 표적 재동기화가, **이미 알던 사건의 창 내 해소**는 `fillResolutions`가 복구 시각을 즉석 채움(해소 표시 지연 ≤15초로 오히려 개선). 되짚기(reconcile) 기준은 미해소 부분집합만(해소분을 넣으면 사라진-사건 탐지가 왜곡) |

## 불안한 지점(재검수 시 봐 달라)

1. **#1 검증 콜의 대상 API 가정** — `ofNativeIds` 경로가 event.get(이력 포함)으로 나가며, Zabbix 태그 필터가 event.get에도 적용된다는 공식 문서 축에 의존. 실서버(태그 필터 설정) round-trip 미실측.
2. **#2 cleanup 기한 2일** — 보정(5분)이 멎은 채 2일이 지나면 열린 행도 좀비로 판정된다. 동기화가 죽으면 warnIfCopyStale(15분)이 먼저 우는 구조라 수용했으나, 스케줄러 장기 정지 운영이 있다면 재고.
3. **#8 fillResolutions의 콜 추가** — 창 내 해소가 있는 사이클마다 listHistory 1콜(복구 시각). 해소 없는 사이클은 0콜.
4. **#3 문턱 초과 판정** — 정확히 1h 창의 축이 trends→RAW로 복귀(ZM-130 이전과 동일). 1h 초과~2h 창은 여전히 trends(버킷 1~2개)라 성김.

## 검증 / 미검증

- ✅ 신규 테스트 10건: sync 2(시간창 없음+recent+미해소 되짚기 / 창 내 해소 즉석 채움) · event 4(ack 순서 InOrder / host_ids 필터 / 목록 태그 검증 / 벨 태그 검증+칩) · adaptive 2(차트/통계 전부-빈 RAW 폴백) · items 2(상한 절단 폐기→trends / 긴 창 trends-빈→history 보완) + guard 3 + usergroup 파서 2.
- ✅ 기존 테스트 갱신 3건(질의 시간창 어서션, 3600→3601 문턱, cleanup 시그니처).
- ⚠️ **본체 작업 트리에 APM 세션의 미커밋 진행분이 섞여 있어**(ApmAlertService 등 테스트 컴파일 불가) 검증은 **격리 worktree(922a708 + 이번 변경 16파일)**에서 실행.
- ❌ 런타임 실측(태그 필터 round-trip·초단명 사건 적재) 미실시.

## FIX 커밋 재검수 (2026-09-07, Claude 자체 — codex 사용량 한도로 대체, 사용자 지시)

FIX 2커밋(e0eea42·b96e912) diff를 위험 지점 중심으로 적대적 재검수. **결함 2건 발견 → 반영 커밋 `ff1822a`**:

| 심각도 | 결함 | 반영 |
|---|---|---|
| HIGH | **태그 가드 캐시 인코딩 불일치** — `RedisClientService.set()`은 JSON 직렬화라 `"1"`이 `"\"1\""`로 저장되는데 가드는 `getRaw()`로 읽어 `"1".equals` 비교 → 캐시 히트(5분) 동안 항상 false = **태그 검증이 꺼짐**(#1 픽스 실질 무력화). 유닛 테스트는 getRaw를 모킹해 실제 인코딩을 가렸다 | 읽기를 대칭 쌍 `get(key, String.class)`로 교체 + 테스트 스텁 동기화. 🔴 교훈: 캐시 왕복은 저장·조회를 같은 직렬화 축으로 — 모킹 테스트는 인코딩 결함을 못 잡는다 |
| MEDIUM | **업서트의 해소 역행 창** — recent 포함 후 해소 사건이 보정 upsert에 실리는데, 복구 시각 조회(listHistory)가 부분 누락되면 toRow가 r_clock=0을 싣고 upsert가 확정된 r_clock을 0으로 덮음 → 해소 사건이 열린 것처럼 깜빡임(같은 사이클 reconcile이 치유하나 페이지 상한에 걸리면 지연) | ON CONFLICT에 CASE 가드 — `r_clock>0`(해소 확정) 행의 r_event_id/r_clock은 보존(Zabbix에서 같은 eventid 재개는 없음) |

추가 확인으로 닫은 항목: reconcile 미해소 부분집합의 빈 집합 시맨틱(전부-vanished 판정이 맞음)·fillResolutions WHERE 가드·updated_at NOT NULL DEFAULT(좀비 정리 안전)·검증 콜의 event.get+사용자 토큰 경로(태그 축 적용). 잔여 결함 없음 판단. 표적 테스트(가드·Sync·Event 스위트) 격리 worktree 그린.
