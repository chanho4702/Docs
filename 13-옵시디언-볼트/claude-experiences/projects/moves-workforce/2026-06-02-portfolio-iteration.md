---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, portfolio-dashboard, tsr, gantt, migration-lifecycle, datamodel, echarts]
date: 2026-06-02
status: code-complete-deploy-pending
---

# 2026-06-02 (세션2) — 전사 대시보드 T/S/R 복구 + 위젯 보강 + 데이터모델 변경

상위: [[moves-workforce]] · 선행: [[2026-06-02-portfolio-implementation]] · 관련: [[forge-migration-lifecycle]] · [[forge-i18n]] · [[2026-05-29-progress-page]]

> 단일 진실: `_workspace/portfolio-dashboard/04_redesign_tsr.md`(IA) + `02_backend_report.md`(데이터 계약).
> **백엔드 스키마/계약을 일부 변경**(주간 공수·가동률 band). 코드/테스트 완료, `forge deploy`·E2E 미수행.

## 1. 무엇을 했나 (한 세션, 7건 연속 반복)

직전 세션에서 frontend-engineer 에이전트가 T/S/R 재설계를 끝냈으나 **오케스트레이터가 API 529로 중단**된 상태에서 시작. 이후 사용자 피드백을 따라 위젯을 연속 보강했다.

1. **529 크래시 복구** — 에이전트 산출물은 디스크에 남아 있으므로, 새 세션에서 **디스크 상태 ↔ 에이전트 리포트 재검증**(파일 존재·잔존참조 grep·jest·build)으로 완료 확인. 작업 손실 0.
2. **신호등 resource band 백엔드 연결** — T/S/R 신호등의 자원축 색이 하드코딩 상수(0.7/1.1/1.3)였음 → 응답 `utilizationBands`로 내려 단일 진실을 백엔드로 이동.
3. **red band 설정 항목화** — 설정 UI(EtcSetting)에 과소/과부하/심한과부하 3필드. 설명 문구(`usage`) 추가로 "이 기준이 분포 차트 + 신호등에 함께 쓰인다" 명시.
4. **공수 추이 월⇄주 토글** — ★데이터모델 변경(아래 §2).
5. **Scope 계획 대비 실적** — `PortfolioPlannedActual`(plannedTotalMd vs actualTotalMd). 기존 필드라 백엔드 0건.
6. **Time 일정 간트** — `PortfolioScheduleGantt`(ECharts custom series). 경과 채움을 처음엔 scheduleRate(워크데이)로 했다가, 사용자 요청으로 **캘린더 경과**(오늘 `api.coord` 픽셀)로 변경 → 채움 경계가 '오늘' 점선과 정확히 일치.
7. **문제이슈 버블 Time→Scope 이동** — 범위 잔여·미완 관점이라 Scope가 맞음.

## 2. ★데이터모델·경계면 계약 변경 (배포 시 주의)

이번 세션의 핵심. "월 단위로 이미 뭉쳐 저장된" 데이터는 프론트에서 주간으로 못 쪼갠다 — **세분 단위는 집계 시점(배치)에 결정되며, 한 번 롤업되면 프론트 재집계로 복원 불가**. [[2026-06-02-portfolio-implementation]]의 가동률 분모 이중계상과 같은 교훈의 반복.

- **DB 스키마**: `portfolio_project_snapshot.weekly_effort_json` JSON 컬럼 신설.
  - DDL `CREATE`(신규 설치) + migrate `v007_portfolio_snapshot_add_weekly_effort` = **`ALTER TABLE ADD COLUMN`**(기존 설치 백필, migrationRunner가 1회만).
  - aggregator: `weekStartOf(date)`(그 주 월요일 YYYY-MM-DD) 헬퍼로 `weekSecMap` 집계 → `weeklyEffort[]{week,md}`.
  - ⚠️ **배포 후 migration 적용 + 재집계 1회** 해야 주간 차트가 채워짐(기존 스냅샷은 빈 배열).
- **KVS settings**: `utilizationRedBand`(1.3) 키 신설. SeedData가 `{...settings,...exists}` 스프레드로 기존 설치 백필.
- **응답 계약**(`getPortfolioDashboard`): 루트 `utilizationBands{utilUnder,utilOver,utilRed}` + `projects[].weeklyEffort[]` 추가. `emptyShape`에도 band 기본값 포함(필수).

## 3. 교훈

- **에이전트가 529로 끊겨도 작업물은 디스크에 있다** → 재시작 시 "처음부터"가 아니라 **디스크 재검증부터**. 리포트의 완료 주장과 실제 파일을 대조하는 게 가장 빠른 복구.
- **세분 단위(주/일)는 배치 집계 설계 때 미리 결정**하라. 사후 요구가 오면 스키마+migration+재집계가 따라온다(프론트 토글만으론 불가). 월만 저장한 게 비용을 낳았다.
- **임계값/밴드는 응답으로 내려 단일 진실화**. 프론트 상수는 폴백으로만(`data.x ?? CONST`). 설정 UI가 있으면 분포·신호등이 같은 기준을 쓰게 됨.
- ECharts에서 **간트는 `custom` series + `renderItem`**가 표준. 막대 시작이 0이 아니므로 일반 bar로는 안 됨. 경과 채움은 `api.coord(today)` 픽셀로 그려야 markLine과 정확히 맞는다.

## 4. 가동률 종합/프로젝트별 분리 (2026-06-04 추가)

"가동률 분포 도넛은 인원수만 보여 누가 과부하인지 모른다"는 요구. **가동률은 두 종류**라는 게 핵심:
- **종합(글로벌)**: 인원의 [전 프로젝트 기간 **합집합**] 분모 → "전사적으로 과부하인가". 한 사람=1값이라 특정 프로젝트 귀속 불가(= 필터 무관인 근본 이유).
- **프로젝트별**: 프로젝트 내 분모 → "이 프로젝트에서 누가". 이중계상 무관.

구현: ① aggregator가 이미 계산하던 멤버별 프로젝트내 가동률(`projUtil`)을 **버리지 않고** `members[].utilization`으로 주입. ② `computeGlobalUtilization` 반환형을 익명 숫자[]→`[{accountId,util}]`로 바꿔 인원 식별 복원 + rollup meta `utilizationPeople`. ③ 서비스가 members 사전으로 displayName 붙여 `utilization.people`. 프론트 위젯에 종합⇄프로젝트별 토글(종합=도넛+과부하TOP, 프로젝트별=멤버막대+band강조). 검증 BE 25/25·FE 27/27·build.

> 교훈: **집계 단계에서 이미 계산해 놓고 평균만 남기고 버리는 중간값**(projUtil)이 있으면, 나중에 "디테일 보여달라"가 왔을 때 그걸 응답에 실어주는 게 가장 싸다. 처음부터 멤버별로 내릴 걸 그랬다.

## 5. 미해결 / 다음

- `forge deploy` + migration v007 + **재집계 1회** 필요(주간 데이터·members.utilization·utilizationPeople 전부 배치 산출이라 재집계 전엔 빈 값).

> 후속 레퍼런스: 종합개요 T/S/R 신호등 색 임계(0.3/0.6·±5%p·band) 정리는 [[2026-06-05-portfolio-signal-thresholds]].
