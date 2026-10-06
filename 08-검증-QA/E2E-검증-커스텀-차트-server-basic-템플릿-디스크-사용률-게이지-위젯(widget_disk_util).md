# E2E 검증: 커스텀 차트 server-basic 템플릿 — 디스크 사용률 게이지 위젯(widget_disk_util)

- 일시: 2026-06-25
- 대상 호스트: 10652 (= 10.220.0.70), 실데이터 디스크 사용률 `vfs.fs.size[/,pused]` ≈ 48.5% (probe 기준)
- 환경: FE Vite :5173 / BE :3000 (이미 기동된 인스턴스 재사용), Playwright(chromium-1223, headless), 실제 브라우저 로그인(admin/<마스킹>)
- 검증 방식: **정적 타입 대조 아님 — 실제 앱 기동 후 사용자 흐름을 브라우저로 조작하고 스크린샷·네트워크 응답값으로 실증**
- 코드 변경: 없음(검증 전용)

## 결과 요약

| # | 시나리오 | 결과 | 근거 |
|---|----------|------|------|
| S1 | 로그인 → 서버 모니터링 상세(10652) 진입 | **PASS** | `e2e-diskgauge-01-detail-basic.png`, url=`/monitoring/server-monitoring/10652` |
| S2 | 차트추가 모달 → template → server-basic → "생성될 차트"에 디스크 게이지 위젯 포함 | **PASS** | `e2e-diskgauge-03-modal-tags.png` — "Charts to create (8)" Tag에 **Disk Utilization** 포함 |
| S3 | 생성 실행 → 디스크 게이지가 게이지 형태 + 현재값 렌더, 실데이터 일치 | **PASS** | `e2e-diskgauge-04-widgets-rendered.png`(전체), `e2e-diskgauge-06-disk-gauge-closeup.png`(클로즈업, **48.6%**) |
| S4 | (엣지) custom 모드 Gauge + 디스크 pused 아이템 → 게이지 위젯 렌더 | **PASS** | `e2e-diskgauge-10-custom-gauge-closeup.png` — "Disk Gauge Test" 게이지 48.6 |
| S5 | (엣지) 디스크 아이템 없는 위젯의 graceful 제외 | **PASS(간접 실증)** | 템플릿 정의 9개 중 매칭 0건인 **Disk I/O**(vfs.dev.read/write 미보유)가 위젯/Tag에서 제외 → 9→8. `buildTemplateWidgets`의 `matched.length===0 → null` 동작 확인 |

**종합: 디스크 사용률 게이지 위젯(widget_disk_util)은 템플릿 생성·custom 생성 모두에서 정상 생성·렌더되며, 표시값이 실데이터와 일치한다. 전 시나리오 PASS.**

## 상세

### S2 — 템플릿 매칭에 게이지 포함
- 모달 Template 모드, "Server Basic Monitoring / 9 charts" 카드 선택.
- "Charts to create (8)" Tag: CPU Usage, Load Average, Memory Usage, Memory Utilization, Swap, Network Traffic, Disk Usage, **Disk Utilization**.
- 디스크 게이지(widget_disk_util)는 매칭에서 빠지지 않음. (매칭 로직: `item.chartable && key.startsWith("vfs.fs.size[/,pused]")` — itemid 55052가 매칭)
- 참고: 템플릿 정의는 9개인데 8개 생성 — 빠진 것은 **Disk I/O**(이 호스트에 vfs.dev.read/write chartable 아이템 없음). 디스크 게이지와 무관하며 정상 동작.

### S3 — 게이지 렌더 + 값 정합
- 디스크 게이지 사용 itemid = **55052** (collected-info 가로채 확정: key=`vfs.fs.size[/,pused]`, chartable=true, name="/: 디스크 사용률").
- `/host/10652/items/history` (itemids=55052) **HTTP 200**, 60 포인트, units=%, **마지막값 48.6**.
- 게이지 렌더(`CustomItemChartPreview.buildSnapshotOption` gauge 분기, max 100, `lastValue(data[0])`): 반원 게이지 + 바늘 ~48.6 위치, progress arc, 중앙 "/: 디스크 사용률" + 숫자 **48.6** (`e2e-diskgauge-06`).
- probe 예상 48.5% 대비 48.6% — 실시간 변동 범위 내 **합리적 일치**.
- 메모리 게이지(itemid 54463, vm.memory.utilization, 71.3%)도 정상 — 디스크와 별개 아이템으로 올바르게 분리됨.

### S4 — custom 모드
- Segmented "Custom" → 제목 "Disk Gauge Test" + chartType "Gauge" + "/: 디스크 사용률(%)" 아이템 선택.
- 폼 상태: titleValue 채워짐, 아이템 선택됨, **OK(Add) 활성화**(okDisabled=false). 추가 성공.
- 생성된 위젯: 반원 게이지 + 48.6 (`e2e-diskgauge-10`). custom 경로에서도 동일하게 게이지 렌더.
- 참고: AddChartModal에는 별도 미리보기 패널이 없음(코드상 preview 미존재) — "미리보기"는 위젯 생성 직후 `CustomItemChartPreview` 렌더로 확인됨.

### 콘솔/네트워크 관측
- **게이지/커스텀 차트 관련 5xx: 0건.** items/history(8건) 모두 200, collected-info 200, widgets 정상(1건 ERR_ABORTED은 axios 중복요청 자동취소 — 정상 동작).
- 무관한 잔여 500: `/assets?...` 8건(`{"statusCode":500,"message":"Internal server error"}`). **Asset 관리 기능의 백그라운드 호출**로, 본 검증(디스크 게이지) 범위 밖. 책임 주체는 be-engineer(Asset/assets 엔드포인트) — 본 기능과 무관하므로 별건.
- antd 경고 1건: `destroyInactiveTabPane` deprecated(ServerMonitoringDetail.tsx:236) — 동작 무해, 정리 권장(fe-engineer, 비차단).

## 발견 이슈 / 책임 주체
- 디스크 게이지 자체: **이슈 없음(PASS).**
- (무관·별건) `/assets` 500 — be-engineer. 게이지 검증 결과에 영향 없음.
- (경미·비차단) `destroyInactiveTabPane` deprecated 경고 — fe-engineer.

## 재현 명령
```
# BE :3000 / FE :5173 기동 상태에서
cd C:\solutions\_workspace
node e2e_diskgauge_runner.cjs      # S1~S3 (템플릿 생성·렌더)
node e2e_diskgauge_verify2.cjs     # 디스크 itemid 확정 + 게이지 클로즈업 + 값 정합
node e2e_diskgauge_custom.cjs      # S4 custom 모드 게이지
node e2e_diskgauge_500probe.cjs    # 5xx 출처 확인
```

## 산출 스크린샷
- `e2e-diskgauge-01-detail-basic.png` — 상세 진입(기본 탭)
- `e2e-diskgauge-02-modal-template.png` — 차트추가 모달(template)
- `e2e-diskgauge-03-modal-tags.png` — "생성될 차트(8)" Tag에 Disk Utilization 포함
- `e2e-diskgauge-04-widgets-rendered.png` — 템플릿 생성 직후 8위젯 전체 렌더(게이지 2개 포함)
- `e2e-diskgauge-06-disk-gauge-closeup.png` — **템플릿 디스크 게이지 클로즈업(48.6%)**
- `e2e-diskgauge-07-grid-after.png` — 그리드 전체
- `e2e-diskgauge-08-custom-gauge-form.png` — custom 폼/전체 그리드
- `e2e-diskgauge-10-custom-gauge-closeup.png` — **custom 디스크 게이지 클로즈업(48.6%)**

## 결과 데이터(JSON)
- `e2e_diskgauge_result.json` — S1~S3 흐름·네트워크·콘솔
- `e2e_diskgauge_verify2_result.json` — itemid 확정·history 값
- `e2e_diskgauge_custom_result.json` — custom 폼 상태
- `e2e_diskgauge_500probe.json` — 5xx 목록
