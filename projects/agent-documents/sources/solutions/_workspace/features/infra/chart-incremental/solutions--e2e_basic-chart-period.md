# E2E 검증 보고서 — 서버 모니터링 상세 / 기본 차트 탭 · 기간 필터

- 대상 기능: 호스트 상세(서버 모니터링) **기본 차트(Basic Charts) 탭 - 기간 필터**(RangeDatePicker)
- 검증 방식: 런타임 E2E(실제 브라우저 구동, 네트워크/콘솔/URL/화면 관찰)
- 일시: 2026-06-17
- 판정: **PASS (블로킹 이슈 없음)**

## 검증 환경
| 항목 | 값 |
|---|---|
| FE | http://localhost:5173 (Vite, 구동 중) |
| BE | http://localhost:3000 (구동 중) |
| 대상 URL | `/monitoring/server-monitoring/10730?offset=0&limit=10&period=3600` |
| 호스트 | hostId=10730 → 화면 표기 `10.220.0.78` |
| 계정 | admin / Admin@123 (로그인 성공 → /dashboards 리다이렉트) |
| 브라우저 | Playwright + Chromium 1223 (headless) |
| 러너 스크립트 | `_workspace/e2e_period_runner.cjs`, `e2e_period_custom2.cjs` |

차트 데이터 API 키 파라미터: 요청 쿼리스트링의 `from`/`to`(unix, 초). period→`usePeriodTimes`가 `from=now-period, to=now` 산출, 커스텀→입력값 그대로. `useChartOption`의 React Query queryKey에 fromDate/toDate가 포함되어 값 변경 시 각 차트 재조회.

## 시나리오별 결과

| # | 시나리오 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| 1 | 초기 로드(period=3600) | 1H 선택 상태, 차트 렌더 또는 Empty 정상, 콘솔 에러 없음 | Segmented `1 hour` selected=true. CPU/Memory/Network 실데이터 렌더, Disk는 No data(Empty 정상). 차트 4종 from=…8620/to=…2220(=1h 창) 요청. 콘솔 에러 없음 | PASS |
| 2a | 12H 전환 | period=43200, from/to 제거, 새 시간창 재요청 | URL `period=43200`, from/to=null. Segmented `12 hour` selected. 차트 4종 from=…9020/to=…2220 (43200초=12h 폭) 재요청 | PASS |
| 2b | 1D 전환 | period=86400 | URL `period=86400`, from/to=null, `1 day` selected. 차트 from=…5820/to=…2220 (86400초=1d 폭) 재요청 | PASS |
| 2c | 7D 전환 | period=604800, 데이터 범위 확대 | URL `period=604800`, from/to=null, `7 day` selected. 차트 from=…7420/to=…2220 (604800초=7d 폭) 재요청. x축 2026-06-10 시작으로 범위 확대 확인 | PASS |
| 3 | 커스텀 범위 | from/to(unix) 세팅, period 제거, 그 구간 재조회. 미래 날짜 비활성 | 범위 `2026-06-16 10:00 → 2026-06-17 09:00` 입력 → URL `from=1781571600&to=1781654400`, `period=null`. Segmented 전부 해제. 차트 4종이 정확히 동일 from/to로 재요청. CPU/Memory x축이 06-16 10:00 시작으로 재렌더. **내일(2026-06-18) 셀 disabled=true** 확인 | PASS |
| 4 | 회귀/에러 | 콘솔 에러·4xx/5xx·무한로딩 없음 | 전 과정 실패 응답(/api/ 4xx·5xx) 0건. 무한 로딩 없음. 콘솔 에러는 antd `destroyInactiveTabPane` deprecation **경고**만(에러 아님, 동작 영향 없음) | PASS |

### period→차트 시간창 매핑 검증 (시나리오 2, 초 단위 폭 = to-from)
- 1H: to-from = 3,600초 ✅
- 12H: 43,200초 ✅
- 1D: 86,400초 ✅
- 7D: 604,800초 ✅
프리셋 값(초)이 그대로 차트 요청 시간창 폭에 반영됨 — 값 수준 정확.

## 발견 이슈

### (참고/비블로킹) antd Tabs deprecation 경고
- 현상: 콘솔에 `Warning: [antd: Tabs] 'destroyInactiveTabPane' is deprecated. Please use 'destroyOnHidden' instead.`
- 영향: 동작 영향 없음(경고 레벨). 탭 언마운트 동작 자체는 정상.
- 추정 위치: `ServerMonitoringDetail.tsx`의 `<Tabs destroyInactiveTabPane>` 사용부.
- 책임 영역: fe-engineer(유지보수성 개선 항목, QA 블로킹 아님).

### (참고) Disk 카드 No data + summary 엔드포인트
- 현상: 전 기간에서 Disk usage 카드가 "No data"(Empty). 네트워크상 Disk만 `/disk/summary`를, CPU/Memory/Network는 `/{x}/line-charts`를 호출.
- 판단: 기간 변경 시 Disk도 동일하게 from/to가 갱신되어 재요청됨(필터 동작 정상). No data는 해당 호스트의 디스크 수집 데이터 부재로, **기간 필터 동작 버그가 아님**. summary vs line-charts 엔드포인트 차이는 카드별 의도된 호출 구성으로 보임.
- shape(필드/타입) 적정성 판단이 필요하면 integration-qa 영역. (런타임 동작 자체는 이상 없음)

## 스크린샷
- `_workspace/e2e-period-00-login.png` — 로그인 화면
- `_workspace/e2e-period-01-initial.png` — 초기 로드(1H, period=3600)
- `_workspace/e2e-period-02a-12h.png` — 12H 전환
- `_workspace/e2e-period-02b-1d.png` — 1D 전환
- `_workspace/e2e-period-02c-7d.png` — 7D 전환(x축 7일 범위 확대)
- `_workspace/e2e-period-03a-picker-open.png` — RangePicker 오픈(미래 날짜 비활성 확인)
- `_workspace/e2e-period-03b-custom-applied.png` — 커스텀 범위 적용 후(차트 재렌더)

## 종합 판정
**PASS** — 시나리오 1~4 전부 통과. 기간 프리셋(1H/12H/1D/7D) 전환 시 URL `period` 파라미터·차트 시간창이 값 수준에서 정확히 일치하고, 커스텀 범위는 `from`/`to`(unix) 세팅·`period` 제거·정확한 구간 재조회·미래 날짜 비활성이 모두 정상. 실패 네트워크 응답·무한 로딩·콘솔 에러 없음(antd deprecation 경고만, 비블로킹). **블로킹 이슈 없음.**
