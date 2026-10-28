# 검수 요청 — ZM-130 긴 기간 조회 trends 전환 전 메트릭 확산

- 커밋: `24fecff` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브즈아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

CpuService에만 있던 "긴 기간이면 원시(history) 대신 시간당 요약(trends)" 분기를 공용 부품
`AdaptiveSeriesQuery`로 일반화해 확산.

- **문턱 둘**: 차트 48시간(시간당 1버킷이라 그보다 짧으면 점이 성겨짐) / 통계(min/max/avg) 1시간(CPU 선례).
- **TrendSeries에 nativeId(itemid) 추가**(3-인자 호환 생성자 유지, 어댑터 2곳 채움) —
  차트 소비자(Network/Disk)의 "아이템 미해석(nativeId=null)" 분기가 트렌드 경로에서 전부 참이 되어
  긴 기간 차트가 조용히 비는 것을 막는 축.
- 적용: CPU/메모리/네트워크/디스크 라인차트 + 세션 히스토리 차트(chartSeries) ·
  메모리/스왑 요약·트래픽 iface 요약·세션 요약(statsSeries — RAW는 퇴화 버킷으로 접어 소비자 계산 한 벌).
- **의도적 제외**: InterfaceService의 UP/DOWN 상태 카운트 — 이산값 등장 횟수 집계라 평균이 의미 파괴.
  CpuService.getSummary의 기존 1h 분기는 그대로(동작 검증된 코드 불변).

## 불안한 지점

1. 차트 트렌드 경로의 점 값 = 버킷 avg — 스파이크가 뭉개진다(Zabbix 자체 UI도 동일 방식이지만
   원시 대비 시각 차이는 있다). 48h 문턱이 적정한지.
2. Disk FREE_SPACE = total−used의 인덱스 짝맞춤이 트렌드 버킷 그리드에서도 성립하는지
   (양쪽 계열의 버킷 시각이 대체로 정렬되지만 결측 버킷 시 어긋남 — 기존 RAW 경로도 같은 약점).
3. 트래픽 요약 avg가 "원시값 평균" → "시간버킷 avg의 평균"으로 바뀜(버킷별 표본 수 가중 없음) —
   CPU 선례와 같은 수용이지만 명시.
4. 메모리 summary의 avg도 동일 축 변화.

## 검증 / 미검증

- ✅ BE 전체 그린(15m37s). AdaptiveSeriesQueryTest 4건(문턱 양방향·avg 매핑·nativeId 보존·퇴화 버킷),
  기존 서비스 스위트는 RAW 경로(1h/48h 미만 픽스처)로 종전 시맨틱 고정.
- ❌ 실서버에서 48h+ 차트의 trends 응답 모양(FE 렌더) 미실측 — 병합 후 체크리스트에 포함.

## 검수 결과 및 반영 (2026-09-03, codex exec → 픽스 커밋 `3b8ef5e`)

| 심각도 | 결함 | 반영 |
|---|---|---|
| 중간 | 구간 avg가 원시 평균과 비동등(버킷 표본 수 비가중) | **명시 승인 경로** — CPU getSummary 도입 시점부터의 동일 축(제품 내 일관성), min/max는 극값 정확 보존. AdaptiveSeriesQuery javadoc에 승인 근사임과 num 가중 확장 지점을 명문화 |
| 낮음 | 소비자 레벨 트렌드 경로 테스트 부재 | 메모리 요약(min/max 극값+MB 변환+querySeries 미호출)·네트워크 차트(KB 변환·avg·원시 미접근) 테스트 추가 |
