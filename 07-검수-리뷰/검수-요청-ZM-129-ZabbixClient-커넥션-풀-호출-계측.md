# 검수 요청 — ZM-129 ZabbixClient 커넥션 풀 + 호출 계측

- 커밋: `6bf98b7` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브즈아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

자빅스 방향 수도꼭지(callRaw 단일 진입점)에 밸브와 계량기를 단다 — "우리 제품이 자빅스에 줄 수
있는 최대 부하"를 **문서에 적을 수 있는 숫자**로 만드는 작업(책임 경계 ZM-133과 세트).

- **커넥션 풀**: `SimpleClientHttpRequestFactory`(요청마다 새 연결·동시성 무제한) →
  Apache HttpClient5 풀. `zabbix.client.max-connections`(기본 10) = **동시 호출 상한**,
  포화 시 `zabbix.client.pool-wait-ms`(기본 5초) 대기 후 실패(무한 대기로 Tomcat 스레드 잠금 방지).
  connect 10s/response 30s 유지.
- ⚠️ 본문 전송: JDK HttpClient의 chunked 전송이 Zabbix PHP(php://input)를 깨던 역사적 함정 —
  문자열 본문(StringEntity, Content-Length 확정)이라 풀에서도 유지됨(주석 보존).
- **계측**: `ZabbixCallMetrics` — 메서드별 호출 수·avg/max 소요·실패 수를 60초 창으로 누적,
  호출이 있던 창만 INFO 한 줄 요약(`[zabbix-calls] last 60s: 42 calls, ...`). Micrometer 대신
  로그인 이유: 설치본에 메트릭 수집기가 없는 고객이 대부분 — 로그가 실질 소비 통로.

## 불안한 지점

1. HttpClient5 풀의 keep-alive 연결을 Zabbix(아파치/nginx+PHP) 쪽이 조기 종료할 때의 재사용 오류
   (stale connection) — HttpClient5 기본 validate-after-inactivity로 커버되는지.
2. 상한 10이 대시보드 동시 진입 피크에 부족한지 — 계측 실측 후 조정 전제(기본값의 근거는
   "캐시·사본 도입 후 상시 호출이 급감"한 상태 기준).
3. 계측 창 교체(getAndSet) 순간의 미세 유실 — 통계 용도라 수용.
4. httpclient5 의존성 추가가 설치본(오프라인 fat jar)에 주는 영향 — jar 포함으로 문제 없음 판단.

## 검증 / 미검증

- ✅ BE 전체 그린(앱 13m47s + engine). 계측 요약 형식·드레인 테스트 2건.
- ❌ 실서버에서 풀 포화(pool-wait 초과) 동작·keep-alive 재사용은 런타임 실측 대상(병합 후 :3001).

## 검수 결과 및 반영 (2026-09-03, codex exec → 픽스 커밋 `4073808`)

| 심각도 | 결함 | 반영 |
|---|---|---|
| 중간 | record/drain 창 교체(getAndSet) 경쟁으로 기록 영구 유실 | 단일 잠금(synchronized)으로 재작성 — 임계 구역이 맵 갱신뿐이라 호출 빈도 대비 경합 비용 무시 수준 |
| 낮음 | "last 60s" 표기가 실제 구간 미보장(공유 스케줄러 풀 4 지연) | 창 시작 시각 저장 → 실제 경과 초 표기 |
| 낮음 | 풀 전환 통합 테스트 부재(포화·Content-Length·재연결) | **부분 미채택** — 로컬 HTTP 서버 통합 테스트는 플레이크 리스크 대비 가치 판단으로 이월, 런타임 실측 체크리스트(병합 후 :3001)에 포화·chunked 항목 명시 |
