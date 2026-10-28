# 05_e2e_report.md — forge tunnel E2E 검증

> 리더 직접 수행 · 2026-06-11 · 환경: **moves-rms** @ tom-chkim-dev.atlassian.net (사용자 지정)

## 방법

1. `forge deploy -e moves-rms` (v4.25.0) → `forge tunnel -e moves-rms` 백그라운드 기동, 터널 로그 실시간 모니터링
2. `ResponseWrapper.js`에 임시 계측 추가 — `getPortfolioDashboard` 응답이 터널을 지날 때 `scopeBands`/`aggregateStatus`/샘플(avgUtilization·actualMm) 로그 (검증 후 `git checkout --`으로 제거 완료)
3. 사용자가 실브라우저(개발자 계정 세션)로 통합 대시보드 진입·새로고침·재집계 CTA 클릭, 리더가 터널 로그로 관찰

## 결과: 통과 (실데이터 증거)

| 항목 | 판정 | 증거 (터널 로그) |
|------|------|------------------|
| scopeBands 신규 필드 E2E | ✅ | 응답 루트 `{"scopeBands":{"amber":0.3,"red":0.6}}` 수신, 프론트 렌더 에러 0 |
| 재집계 CTA → triggerPortfolioAggregation | ✅ | 클릭 → 10초 내 `aggregateStatus: PARTIAL→OK` 전환 |
| P1-1 가동률 경과기간 분모 | ✅ | 동일 입력(29MD)에서 avgUtilization **0.16 → 0.45** (구 산식 스냅샷 → 신 산식 재집계) |
| P1-2 actualMm 동적 분모 | ✅ | actualMm **1.5(÷20 고정) → 1.3**(월평균 근무일) |
| utilizationBands 무손상 | ✅ | `{utilUnder:0.7, utilOver:1.1, utilRed:1.3}` 유지 |
| 배치 asApp 수정 후 집계 | ✅ | 수정 후 CTA 재집계: 에러 0건, OK 유지 (401은 수정 전 4건이 전부) |

### 계측 로그 원문

```
10:54:46 [verify] getPortfolioDashboard E2E: {"scopeBands":{"amber":0.3,"red":0.6},"utilizationBands":{"utilUnder":0.7,"utilOver":1.1,"utilRed":1.3},"aggregateStatus":"PARTIAL","projectCount":2,"sample":{"name":"테스트 프로젝트 2","avgUtilization":0.16,"actualMm":1.5,"actualTotalMd":29}}
10:54:56 [verify] getPortfolioDashboard E2E: {...,"aggregateStatus":"OK","sample":{...,"avgUtilization":0.45,"actualMm":1.3,"actualTotalMd":29}}
11:11:39 [verify] (asApp 수정 후 재집계) {...,"aggregateStatus":"OK","avgUtilization":0.45,"actualMm":1.3}
```

## 🔴 E2E가 노출한 잠복 버그 (기존 코드, 이번 변경과 무관) — 수정 완료

스케줄 트리거 `runPortfolioSnapshot`(일일 배치)이 **401 AUTH_TYPE_UNAVAILABLE로 전 프로젝트 집계 실패** (`aggregateStatus: PARTIAL, projectCount: 0, failedCount: 2`):
- 원인: 집계 체인의 Jira API(`IssueApi.getBulkIssuesByProject`/`getProjectIssuesByFilter`, `WorklogApi`, `UserApi`)가 전부 `as:'user'` — 스케줄 트리거엔 사용자 컨텍스트 없음
- 영향: 일일 자동 배치는 한 번도 성공 불가, 실패 시 aggregateStatus를 PARTIAL로 오염. 수동 CTA(사용자 컨텍스트)만 동작했음
- 수정 (`04_backend_asapp_fix.md`): 공통 API 함수에 옵셔널 `as='user'` 파라미터(기존 호출부 무영향), `PortfolioAggregator` 체인만 `as:'app'` 전달. asApp은 manifest 스코프를 바꾸지 않아 심사 영향 없음(사용자 확인). jest 71/71 통과

## 미검증 (남은 항목)

- 실제 스케줄(일일) 배치의 다음 자동 실행 — 코드·컨텍스트가 CTA 검증과 동일하므로 성공 예상되나, 내일 `aggregateStatus`/`lastAggregatedAt` 확인 권장
- UI 픽셀 육안 확인(TSR red 정렬·▲■● 글리프·"계획 인건비" 라벨·S-curve 음영·CPI 게이지)은 사용자 브라우저에서 확인 — 터널 로그로는 판정 불가
- SettingPage scopeTodo 임계 입력 폼 (후속)

## 정리 상태

- `ResponseWrapper.js` 임시 계측 제거(git clean 확인)
- **moves-rms v4.26.0 최종 배포** (asApp 수정 + 계측 없는 클린 코드)
- development 환경(dmove-sandbox)에는 v3.1.0(asApp 수정 이전)이 배포돼 있음 — 필요 시 `forge deploy -e development` 1회
- tunnel/모니터 종료
