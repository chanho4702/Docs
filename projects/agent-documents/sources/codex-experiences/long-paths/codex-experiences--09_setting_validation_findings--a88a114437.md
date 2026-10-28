# 전사 설정 기능 감사 기록

기준: 2026-08-26

## P1 — 핵심 계산 설정의 서버 유효성 검증이 불완전함

- `updateSettingService()`는 `salaryPolicy`와 `progressThreshold`만 검증하고 `hourRate`, `utilizationUnderBand`, `utilizationOverBand`, `utilizationRedBand`, `scopeTodoAmberRatio`, `scopeTodoRedRatio`, `currency`는 그대로 KVS에 저장한다(`src/resolver/backoffice/setting/SettingService.js:31-80`).
- 화면의 `<input min/max>` 및 `parseFloat()`는 direct invoke와 API 자동화 입력을 방어하지 못한다(`static/ui/src/backoffice/page/setting/EtcSetting.jsx:35-72`, `:124-180`). 예를 들어 `hourRate: 0`, 음수, 문자열 또는 `Infinity`, 그리고 역전된 utilization band를 저장할 수 있다.
- `hourRate`는 자원 분석의 MD 분모로 직접 쓰인다(`src/resolver/resourceAnalysis/ResourceAnalysisService.js:154-195`, `:231-291`). 0 또는 비정상 값은 `Infinity`/`NaN`을 전파해 리포트·비용·엑셀 계산을 무너뜨릴 수 있고, 역전된 band는 가동률 색상 분류를 논리적으로 모순되게 만든다.

권장 수정: 설정 DTO를 단일 validator로 정규화한다. `hourRate`는 유한한 양수와 운영 범위(예: 0.5~24), ratio/band는 유한한 비음수 값, utilization band는 `under < over < red` 순서, currency는 허용 목록으로 서버에서 검증한다. 잘못된 입력은 저장 전 명시적 error code로 거부하고 경계값·직접 호출 회귀 테스트를 추가한다.
