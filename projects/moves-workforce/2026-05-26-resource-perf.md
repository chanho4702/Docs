---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, performance, worklog, resource, holiday]
date: 2026-05-26
---

# 작업 요약 (2026-05-26) — Resource 성능 / 워크로그 / 가용MD 정정

상위: [[moves-workforce]] · 관련 주제: [[forge-worklog-performance]]

Resource 분석 리포트 / 캘린더 워크로그 로딩 성능 개선 및 가용 MD 계산 정정.

---

## 1. Resource 분석 리포트 성능 개선

**무엇을** — 인원(페이지) 단위로 워크로그를 조회하던 구조를 **프로젝트 단위 1회 조회 + KVS 캐시 + 프론트 메모리 슬라이스**로 변경.
- `ResourceAnalysisService.js` (캐시 키 `ResourceList:projectId:start:end`)
- `ResourceAnalysisPage.jsx` (쿼리 키에서 `userIds` 제거)

**왜** — 병목은 집계 연산이 아니라 **Jira API 페치 + 이슈별 워크로그 N+1 페이지네이션**. 팀원들이 이슈를 공유하는 도메인 특성상 페이지마다 같은 이슈 워크로그를 중복 페치했고, 페이지 이동 시 재조회됨. (연산을 프론트로 내리는 안, Forge SQL 적재 안은 검토 후 기각)

**개선** — 페이지 이동 시 **Jira 재조회 0회**(캐시 1건 재사용), 비싼 N+1을 (프로젝트·기간)당 한 번만 지불.

---

## 2. Resource 전용 병렬 워크로그 페처 분리

**무엇을** — `ResourceWorklogFetcher.js` 신규 생성. 이슈별 초과 워크로그 조회를 **직렬 → 병렬**(`Promise.all` + 공유 `pLimit(5)`, 페이지 크기 100, slim 5필드).

**왜** — N+1의 직렬 루프가 느렸음. 공통 `WorklogService`는 myWork/대시보드 등이 공유하므로 **건드리지 않고 전용 모듈로 분리**(blast radius 차단).

**개선** — 워크로그 많은 이슈에서 총 페치 시간 단축, 다른 기능 영향 없음.

---

## 3. 캘린더 워크로그 로딩 개선

**무엇을** — `ProjectCalendarService.js` + `ProjectCalendarController.js` 신규, `index.js` 등록, `useProjectCalender.js`가 `getProjectCalendarWorklog` 호출하도록 변경. 동일하게 초과분 병렬화(full issue/worklog 형태 유지).

**왜** — 캘린더도 같은 N+1로 초기 로딩이 김. "분할로드" 검토 결과, 인라인 우선 방식은 Jira 워크로그 정렬 특성상 장기 이슈에 불리해 **초과분 병렬화**를 선택. myWork와 공유되는 `getProjectWorklogService`는 미수정.

**개선** — 캘린더 초기 로딩 단축, myWork 경로 무영향.

---

## 4. Resource 코드 리뷰 후 수정

| # | 무엇을 / 왜 | 개선 |
|---|---|---|
| #1 | `UserSchedule.js` 스케줄 쿼리를 `start_date BETWEEN` → **기간 겹침 조건**으로. 경계 걸친 연차가 누락되던 버그 | 휴가 차감 정확. 공유 쿼리라 캘린더도 경계 휴가 정상 표시(파라미터 순서 유지로 호출부 무수정) |
| #3 | 워크로그 페치를 settings/holiday/schedule와 같은 `Promise.all`로 병렬화 | 가장 느린 페치가 다른 조회와 겹쳐 응답 단축 |
| #4 | 프론트 `mmForRange`가 백엔드 `baseMmDays` 우선 사용(SSOT), 로컬은 폴백 | 동일 계산식 이중 구현의 drift 위험 제거 |
| #5 | 프론트가 백엔드 `baseEffective` 사용 | 재계산 중복 제거 |
| #6 | 미사용 `hourRate` 변수 제거 | 데드 코드 정리 |

---

## 5. 주말 공휴일 차감 제외 + 안내문

**무엇을** — `computeHolidayDeduction`/`holidayCount`에서 **토·일 공휴일 제외**(`isWeekend`). 휴일관리 탭에 `SectionMessage` 안내문 추가(주말 제약 / 가용률 의미 / 개인 휴가 반영), `publicHoliday.json` kr·en 번역 추가 후 merge.

**왜** — 기준 작업일(월 MD)이 이미 주말을 빼는데 주말 공휴일을 또 차감하면 과다 차감됨. 또한 가용율·개인휴가 반영 규칙을 사용자가 알 수 있도록 명시.

**개선** — 주말 공휴일 과다 차감 해소, 계산 규칙 투명화.

### 가용 MD 계산 규칙 (정리)

```
effectiveMmDays = baseMmDays − 공휴일차감 − 개인휴가차감
```
- baseMmDays: monthRate 기반(주말 제외), 기간 비례 합산
- 공휴일: workRatio 가중 차감, 단 주말 공휴일은 제외
- 개인 휴가: 연차(work_ratio=0) 1MD/일, 반차(0.5) 0.5MD/일, 기타(1) 차감 없음

> ※ 이 비례식 base는 다음날 [[2026-05-27-mm-redesign]]에서 근무일 직접 카운트로 전면 교체됨.

---

## 리뷰에서 남긴 항목 (제품 결정 대기)

- ~~**#7 MM 분모 정의** — `totalMd ÷ 가용MD(effective)` vs `÷ 표준월MD`. 헤더 툴팁은 표준월 기준으로 설명하나 실제 분모는 가용MD라 불일치. "MM"의 정의 확정 필요.~~ → **해소(2026-05-27)**: [[2026-05-27-mm-redesign]]에서 MM=`÷표준월 근무일(monthMm)`·가동률=`÷가용MD`로 분리 확정. 2026-07-06 코드 실측으로 전 화면(Resource·Portfolio) 통일 확인.
- **#8 `holidayDays` 카운트 vs 가중 차감 라벨** — 반일 공휴일이 카운트는 1, 실제 차감은 0.5. #7과 연동. → **부분 해소(2026-07-06 코드 실측)**: 계산 정합성은 [[2026-05-27-mm-redesign]]으로 해소 — 공휴일 가중치(workRatio)는 `workdayValue`로 base에 정확 반영되고 `holidayDays`(=`countHolidaysInRange`, 개수)는 **계산에 미사용·표시 전용**. 남은 건 표시만: `EffectiveMdCell`이 "공휴일 -{개수}일"로 보여줘 반일 공휴일 존재 시 실제 차감(0.5)과 표기(-1일)가 어긋남. 후속 옵션 = 가중 합 `Σ(1−workRatio)` 표시 or 라벨을 "포함" 뉘앙스로 변경.

---

## 변경 파일

**신규 (3)**
- `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js`
- `src/resolver/projectCalendar/ProjectCalendarService.js`
- `src/resolver/projectCalendar/ProjectCalendarController.js`

**수정**
- `src/resolver/resourceAnalysis/ResourceAnalysisService.js`
- `src/rdb/query/UserSchedule.js`
- `src/index.js`
- `static/ui/src/pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx`
- `static/ui/src/pages/projectDetail/calender/useProjectCalender.js`
- `static/ui/src/backoffice/page/publicHoliday/PublicHolidayPage.jsx`
- `locales/kr/publicHoliday.json`, `locales/en/publicHoliday.json` (+ merge 결과 `ko-KR.json`/`en-US.json`)

---

## 검증

- 모든 변경에 대해 Babel transform + 백엔드 테스트(`npm test`) 통과.
- UI 동작(캘린더 로딩, Resource 리포트, 휴일 안내문)은 코드 정합성만 확인됨 — 터널/배포 후 실제 화면 검증 권장.
