# 요구사항 보강 — 워크로그 히트맵 스케일 (2026-08-13, 사용자 추가 요청)

## 사용자 요청 원문

> "우리 히트맵 하루에 8시간은 좀 웃긴데 이거 프로젝트별로 인원 x 1일 근무시간 해서 단계별로 설정 가능한가 왜냐면 사람들이 다들 작성해야하는 워크로그 기준이니까"

## 문제

`components/chart/echart/options/calendarHeatmapOption.js`의 visualMap pieces가 절대값 하드코딩:
`0h / 0~1h / 1~4h / 4~8h / 8h+`. 개인 1명 눈금인데 프로젝트 히트맵은 **팀원 전원 워크로그 합**이라
인원 있는 프로젝트는 매일 "8h+"로 포화 — 색이 정보를 못 준다.

소비처는 `ChartTemplate.js`(프로젝트 대시보드) **단 한 곳** — 다른 화면 회귀 없음 (grep 확인).

## 요구

일일 용량 `capacity = 프로젝트 인원수 × hourRate(설정 1일 근무시간)` 기준의 **비율 단계**로 전환:
- 구간: `0 / >0~25% / 25~50% / 50~75% / 75~100% / 100%+` (경계는 capacity에서 시간으로 환산해 라벨 표시, 예: 5명×8h → "~10h / ~20h / ~30h / ~40h / 40h+")
- 툴팁: 시간 + 용량 대비 % 병기
- 인원수 출처: 대시보드 요약의 투입 인원(total_member_count)과 동일 산정 — 숫자가 요약 타일과 달라지면 안 됨
- hourRate 출처: 설정(간트·insight와 동일 값). **새 설정 항목 만들지 않는다**
- capacity 산출 불가 시(인원 0 등) 기존 절대 구간으로 폴백

## 구현 위치 제안 (설계 재량 허용)

- 백엔드: `getChartDataById`의 worklog(heatmap) 분기 응답에 `capacity: { memberCount, hourRate, dailyCapacityHours }` 동봉 (또는 설계자가 더 나은 경로 판단 시 근거 기록)
- 프론트: `calendarHeatmapOption({ data, year, capacityHours })` — capacityHours 옵션 인자, 없으면 기존 pieces 유지
- i18n: 라벨/툴팁 신규 키 필요 시 kr/en + merge

## 조율

M1 백엔드 완료 후 착수 (같은 도메인 파일 충돌 방지). 모듈 배치는 리더가 M1 후속 또는 M2에 편입.
