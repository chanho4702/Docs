# E2E 후속 검증: 디스크 게이지 dependent 계열 지원 (템플릿 itemKeyPrefixes OR 추가)

- 일시: 2026-06-25
- 변경 대상: `moveseyee_fe/src/constants/dashboard-templates.ts` server-basic 템플릿
  - `widget_disk_util`(게이지): `["vfs.fs.size[/,pused]", "vfs.fs.dependent.size[/,pused]"]`
  - `widget_disk_usage`(파이): `["vfs.fs.size", "vfs.fs.dependent.size"]`
- 환경: FE Vite :5173 / BE :3000 (기동 인스턴스 재사용, HMR로 변경 반영됨), Playwright(chromium-1223, headless), 실제 브라우저 로그인
- 검증 방식: 실제 앱 기동 후 브라우저로 사용자 흐름 조작 + 네트워크 응답값(collected-info / items-history) 가로채기로 값 수준 실증
- 코드 변경: 없음(검증 전용)

## 결과 요약

| # | 시나리오 | 결과 | 핵심 근거 |
|---|----------|------|----------|
| S1 | **dependent-only zabbix-server(10696)** template → 디스크 게이지·파이 생성·렌더 | **PASS** | Tag에 Disk Utilization·Disk Usage 둘 다 포함, 게이지 **58.96%** 렌더, itemid=65289 key=`vfs.fs.dependent.size[/,pused]` chartable=true |
| S2 | **무회귀** size 계열 10652(10.220.0.70) 디스크 게이지 여전히 정상 | **PASS** | itemid=55052 key=`vfs.fs.size[/,pused]`, 게이지 **48.6%** 유지 (prefix 추가가 기존 매칭 안 깨짐) |
| S3 | (엣지) zabbix-server custom 모드 Gauge + dependent pused 아이템 선택 → 미리보기 | **PASS** | dependent % 아이템 선택지 노출, "FS [/]: Space: Used, in %" 선택 → 게이지 **58.95%** 렌더 |

**종합: 템플릿 itemKeyPrefixes에 dependent 계열 OR 추가 후, dependent-only 호스트(zabbix-server)에서 디스크 게이지/파이가 정상 생성·렌더되며 표시값이 실데이터(58.95%)와 일치한다. 기존 size 계열(48.6%)도 무회귀. 전 시나리오 PASS.**

## 상세

### S1 — zabbix-server(10696) dependent 게이지 (핵심)
- collected-info 가로채기 결과: 디스크 % 아이템 = **itemid 65289 / key `vfs.fs.dependent.size[/,pused]` / chartable=true / name "FS [/]: Space: Used, in %"**. (구형 `vfs.fs.size[/,pused]`는 이 호스트에 없음 — dependent-only 확정)
- 차트추가 모달(template, server-basic): "Charts to create (8)" Tag에 **Disk Usage(파이) + Disk Utilization(게이지) 둘 다 포함**. → 수정 전엔 디스크 아이템 매칭 0건이라 두 위젯 모두 빠졌을 것이나, OR prefix 추가로 정상 매칭됨.
- 생성 실행 → `/host/10696/items/history`(itemid 65289) **HTTP 200**, 60포인트, units=%, **마지막값 58.956564**.
- 게이지 렌더: 반원 게이지 + 바늘 ~59, 중앙 "FS [/]: Space: Used, in %" + 숫자 **58.96** (`e2e-diskgauge-dep-03-gauge-closeup.png`).
- 기대값 58.95% 대비 58.96% — float % 실데이터와 정확히 일치.

### S2 — size 계열 10652 무회귀
- collected-info: itemid **55052 / key `vfs.fs.size[/,pused]` / chartable=true**.
- Tag에 Disk Utilization·Disk Usage 포함 유지. 게이지 history(55052) 200, **마지막값 48.6%**.
- 게이지 렌더 "/: 디스크 사용률" + **48.6** (`e2e-diskgauge-dep-regr-03-gauge-closeup.png`). → OR prefix 추가가 기존 size 계열 매칭/표출을 깨지 않음(무회귀 확인).

### S3 — custom 모드 dependent 아이템
- zabbix-server custom 모드에서 chartType=Gauge + 아이템 검색 시 dependent % 아이템들이 정상 노출:
  - "FS [/]: Space: Used, in %", "FS [/app]: ...", "FS [/boot]: ..." 등 (모두 Enabled/chartable).
- "FS [/]: Space: Used, in %" 선택 → OK 활성화 → 추가 → 게이지 **58.95** 렌더 (`e2e-diskgauge-dep-custom-03-gauge-closeup.png`).
- 참고(엣지 관찰, 버그 아님): 같은 검색에서 dependent **bytes** 아이템("FS [/]: Space: Used (B)", 약 63GB)을 게이지에 넣으면 값이 0~100 스케일을 초과해 바늘이 max에 붙고 숫자가 게이지를 침범함. 이는 사용자가 % 가 아닌 bytes 아이템을 게이지에 잘못 매핑한 경우의 자연스러운 표현이며, 게이지 컴포넌트는 `max:100` 고정(0~100% 가정) 설계라 예상된 동작. (스크린샷 보존: bytes 케이스는 `e2e-diskgauge-dep-custom-03` 직전 실행본에서 관찰)

## 콘솔/네트워크 관측
- **디스크 게이지/파이 관련 5xx: 0건.** collected-info(10696/10652) 200, items/history(65289/55052 등) 모두 200.
- 무관한 잔여 500: `/assets?...` 8건(`{"statusCode":500,"message":"Internal server error"}`). **Asset 관리 기능의 백그라운드 호출**로 본 검증 범위 밖(이전 검증에서도 동일 관측). 책임 주체 be-engineer, 디스크 게이지와 무관한 별건.
- antd 경고: `destroyInactiveTabPane` deprecated(ServerMonitoringDetail.tsx:236) — 무해, 비차단(fe-engineer 정리 권장).

## 결론 (책임 구분)
- 템플릿 매칭(FE `dashboard-templates.ts` / `buildTemplateWidgets`): dependent OR prefix가 **정상 동작**. zabbix-server에서 디스크 위젯이 더 이상 빠지지 않음. → **수정 의도대로 PASS.**
- BE 데이터/chartable: dependent pused 아이템(65289)이 chartable=true로 노출되고 history 값(58.95%)이 정확. → **BE 측 이상 없음.**
- 잔여 이슈: 디스크 게이지 자체엔 없음. `/assets` 500은 무관 별건.

## 재현 명령
```
# BE :3000 / FE :5173 기동 상태에서
cd C:\solutions\_workspace
node e2e_diskgauge_dep_runner.cjs   # S1(zabbix-server 10696) + S2(무회귀 10652)
node e2e_diskgauge_dep_custom.cjs   # S3 custom 모드 dependent pused 게이지
node e2e_diskgauge_500probe.cjs     # 5xx 출처 확인(assets만, 무관)
```

## 산출 스크린샷
- `e2e-diskgauge-dep-01-modal-tags.png` — zabbix-server 모달 "Charts to create(8)" (Disk Usage·Disk Utilization 포함)
- `e2e-diskgauge-dep-02-widgets.png` — zabbix-server 생성 직후 위젯 전체
- `e2e-diskgauge-dep-03-gauge-closeup.png` — **zabbix-server 디스크 게이지 클로즈업 58.96% (dependent)**
- `e2e-diskgauge-dep-regr-01-modal-tags.png` / `-02-widgets.png` — 10652 무회귀 모달/위젯
- `e2e-diskgauge-dep-regr-03-gauge-closeup.png` — **10652 디스크 게이지 48.6% (size, 무회귀)**
- `e2e-diskgauge-dep-custom-01-form.png` — custom 모드 폼
- `e2e-diskgauge-dep-custom-03-gauge-closeup.png` — **custom dependent pused 게이지 58.95%**

## 결과 데이터(JSON)
- `e2e_diskgauge_dep_result.json` — S1/S2 흐름·collected-info·history 값
- `e2e_diskgauge_dep_custom_result.json` — S3 custom 폼/선택 아이템
- `e2e_diskgauge_500probe.json` — 5xx 목록(assets)
