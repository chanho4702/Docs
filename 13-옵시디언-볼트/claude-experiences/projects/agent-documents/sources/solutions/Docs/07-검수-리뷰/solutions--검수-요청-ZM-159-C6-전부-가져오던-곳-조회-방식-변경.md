# 검수 요청 — ZM-159 C6 "전부 가져오던 곳" 조회 방식 변경

- 요청: Claude · 2026-09-17 · 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, master = `de64685`까지 병합됨) · **미커밋 22파일 전부가 C6**
- 사용자 지시(09-17): "한 번에 다 가져올 일은 없다 — 과하게 하지 말 것", "A로 하자"(C6 먼저)
- 설계: `_workspace/designs/devdesign_zm-159-scale-call-guard.md` §0.7 C6 행 · 근거 `_workspace/analysis/audit_scale-5000-hosts.md`(T-B, H1·H2, H6, H7, H17)
- 테스트: 엔진 229 통과 · 앱 관련 스위트(아래 표의 테스트) 전부 통과

## 범위
| 대상 | 종전 | 지금 | 파일 |
|---|---|---|---|
| **AWS 매처(T-B)** | 전 호스트에 전 아이템(`selectItems`, LAST_CHECK)을 붙여 신선도 판정 | 호스트는 태그만 받음 → 후보(instanceId 주장 ∪ EC2 주소 색인에 걸린 AGENT 주소)만 → 그 호스트들의 **CPU util 지표 lastclock**을 500대씩 `queryLatest`. 실패 시 빈 맵(신선하지 않음 → CloudWatch 폴백). 색인 갱신 시 캐시 비움 | `aws/Ec2ZabbixMatcher`, `ZabbixBasicItem`(+lastclock), `ZabbixMetricAdapter`(output에 lastclock, `LatestValue.epoch` 채움) |
| **트렌드 조회** | `trend.get` 전 아이템·전 기간 1콜 | 기간이 있으면 `executor.scanWindows`(아이템 청크 × 1일 창, EXCLUSIVE, 예산 = 아이템×시간×2). 끝까지 못 읽으면 `ApiError`. (itemid, 시각) 정렬. 기간 없으면 종전 1콜 | `ZabbixTrendServiceImpl` |
| **리포트·그룹 추이(H1 — 09-17 정정: H2 알람 이력은 미처리)** | 그룹 전 호스트 트렌드를 한 번에 받아 집계 | 호스트 묶음(cpu·mem 200, disk 50, traffic 10)으로 받아 **흘려보내며** 집계(리포트) / 상위 10개만 유지(그룹 추이). disk·traffic은 새 6인자 `queryTrendFamily(..., keep)`로 **트렌드를 받기 전에** 필요한 항목만 선별 | `ResourceTrendQuery`, `ReportService.summarizeMetric`, `HostService.getGroupResourceTrend`, `MetricPort`(default 6인자), `LicenseGuardedMetricPort`, `ZabbixMetricAdapter` |
| **인터페이스 상태 차트(H7)** | 항상 원시 history(10만 행 상한이 오름차순으로 잘려 긴 창의 최근 구간 소실) | 창 > 6시간이면 `queryTrend`의 **max**로 "그 시간의 최악 상태"를 셈(max=1 UP, max=2 DOWN, admin max=2 ADMIN_DOWN). 요약이 비면 원시로 폴백 | `host/hostinterface/InterfaceService`, `AdaptiveSeriesQuery`(주석만) |
| **네트워크 라인차트(H6)** | 인터페이스 × 타입마다 1콜(100개면 수백 콜) | 인터페이스 미지정이면 **현재 트래픽(in+out) 상위 10개**만(발견 순서 유지), 타입마다 인터페이스 10개 묶음으로 `chartSeries` 1회 | `host/network/NetworkService` |
| **자산 동기화(H17 조회 측)** | `host.get`+`selectInventory=extend` 전 호스트 1응답 | hostid만 먼저(그룹 필터 포함) → 상세를 500개씩. upsert는 종전대로 단일 트랜잭션 | `asset/AssetSyncService` |

(아이템·트리거 관리 목록의 무스코프 차단은 `5226c38`로 이미 커밋됨 — 이번 범위 아님)

## 의도·버린 대안
- AWS 신선도: "아무 아이템이나 최근 수집" → "CPU 지표 최근 수집"으로 뜻이 바뀜. 후속 품질 게이트(CloudMetricsService)가 보는 축과 같아서 택함. CPU 아이템이 없는 호스트는 폴백으로 간다(오표시보다 안전).
- `MetricPort` 6인자 default는 **람다를 쓰지 않는다** — `LicenseGuardedPortTest`가 인터페이스 `getDeclaredMethods()`로 전수 호출하는데 람다의 합성 private static 메서드가 걸린다.
- 네트워크 상위 N: FE(`NetworkChartDetail`)는 첫 인터페이스를 자동 선택하지만 그 직전에 필터 없는 요청이 한 번 나간다. 인터페이스 100개 × 4타입 × 48h 원시면 수십만 점이라 상위 10개로 제한. 필터 지정 요청은 그대로 전부(묶음만 나눔).
- 네트워크 묶음 조회에서 trends 폴백 단위가 "메트릭별" → "묶음 전체"로 바뀜(묶음 안 일부만 trends가 비면 그 인터페이스는 빈 차트). 기존 다중 메트릭 소비자와 같은 축이라 수용.
- 응답 상한 16MiB 하향은 **이번에 하지 않음**(대규모 힙 실측 필요 — dev Zabbix는 76대).

## 중점 확인 요청
1. **동작 불변/회귀**: 리포트 집계(그룹 평균·최대·최소, 호스트별 요약)와 그룹 추이 상위 10개가 묶음 경계와 무관하게 종전과 같은가. 동점·NaN·빈 호스트 처리.
2. `ZabbixTrendServiceImpl`: 예산식(아이템×(시간+1)×2)이 정상 요청을 오판해 `ApiError`로 만드는 경우가 있는가(예: 트렌드 버킷이 시간당 1개를 넘는 경우, 창 경계 재조회). `IdAxis.EXCLUSIVE`가 trend.get에 맞는가. 기간 null 경로 호출처.
3. AWS 매처: 후보 계산(콜드 색인·useIp=false·DNS·instanceId 태그)과 캐시 무효화(`indexInstances`에서 `cache.set(null)`)의 경합. `lastclock` 0/누락 처리. 신선도 조회 실패 시 매칭 유지가 맞는가.
4. 인터페이스 상태 차트의 max 규칙이 원시 경로와 모순되지 않는가(원시는 값 그대로 = max). 6시간 이하 창에서 원시가 여전히 10만 행에 잘릴 수 있는 규모(포트 500개 등) — 남겨도 되는가.
5. 네트워크: `MetricRef` 동등성으로 결과를 짝짓는 방식(중복 iface 지정 시), SUM 계산(첫 두 시리즈 index 합 — 기존 X2 결함, 이번엔 손대지 않음)에 새 순서가 영향을 주는가, 상위 N 선정이 요약의 `currentUsage`(구간 데이터가 없으면 0)에 기대는 점.
6. 자산 동기화: 두 단계 사이에 호스트가 생기거나 지워질 때, 그룹 필터가 상세 조회에서 빠진 것(hostid로 이미 좁힘)이 맞는가.
7. 테스트가 위 의도를 실제로 고정하는가(`ZabbixTrendServiceImplTest`, `ZabbixMetricAdapterTest` 신규 3건, `Ec2ZabbixMatcherTest` 신규 7건, `ReportServiceTest.computeChunkedEqualsWhole`, `HostGroupMonitoringTest.chunkedFetchKeepsGlobalTopN`, `InterfaceServiceTest` 신규 2건, `NetworkServiceTest` 신규 2건, `AssetSyncServiceTest.fetchesDetailsInChunks`).

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`.
- 과장 금지 — 확인하지 못한 것은 "추정"으로 표시.

---

## 반영 기록 (2026-09-17, 코덱스 gpt-5.6-sol high → `review_zm-159-c6_codex.md`)
| 번호 | 판정 | 반영 |
|---|---|---|
| R1 필수 | 수용 | `ZabbixTrendServiceImpl`의 요청별 `maxTotalRows` 덮어쓰기(`expectedRows`) 제거 → 전역 `max-total-rows` 유지. 반환 목록에 held 상한을 두지 않는 이유를 주석으로 명시(호출자가 호스트 묶음으로 크기 제한). 테스트: 전역 예산 초과 → ApiError, 재분할이 있어도 예산 안이면 완료 |
| R2 필수 | 수용 | `ZabbixItemServiceImpl.get/getByListKey`가 hostids(없으면 itemids)를 `item.get.max-ids`(기본 50)씩 나눠 부르고 이어 붙임 — 어댑터·AWS·그룹 집계 모든 호출에 적용. 생성자에 `ZabbixCallLimits` 추가. 테스트: 101개 → 50·50·1 |
| R3 필수 | 수용 | `InterfaceService` 원시 경로를 행 예산(8만, 1분 주기 가정) ÷ 창의 분 수 크기로 묶어 호출·즉시 집계. 호출이 20회를 넘을 규모면 창 길이와 무관하게 요약(trend)을 쓰고, 요약도 비면 원시 폴백 없이 경고 로그. 1분보다 촘촘한 아이템의 잔여 절단은 C7(불완전 표시)로 |
| R4 권장 | 수용 | `Ec2ZabbixMatcher`에 색인 세대(`indexGeneration`) — 계산 중 색인이 바뀌면 결과를 캐시에 게시하지 않음. `clearIndex`도 세대 증가+캐시 비움. 테스트: 조회 도중 색인 갱신 → 다음 매칭이 재계산 |

검증: 전체 테스트 앱 3,652(1건 `ApmCollectorLiveRuntimeTest` Windows 임시 파일 잠금 → 단독 재실행 4/4 통과, 변경과 무관) · 엔진 230 통과.
