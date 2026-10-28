---
type: topic
tags: [topic, forge, performance, worklog, caching, concurrency]
created: 2026-05-30
updated: 2026-05-30
---

# Forge 워크로그 N+1 / 캐시·병렬화·blast-radius 격리

> Jira 워크로그를 다루는 Forge 앱에서 반복되는 성능 패턴. 다른 Jira API 페치에도 일반화 가능.

## 요약
워크로그 조회의 진짜 병목은 **집계 연산이 아니라 Jira API 페치 + 이슈별 워크로그 N+1 페이지네이션**.
3단 처방: **(1) 조회 단위를 올리고 캐시 → (2) N+1을 병렬화 → (3) 공유 모듈은 건드리지 말고 전용 모듈로 분리.**

## 패턴 / 노하우

### ① 조회 단위 상향 + KVS 캐시 + 프론트 슬라이스
- 인원/페이지 단위로 매번 조회 → **프로젝트·기간 단위 1회 조회**로 변경.
- KVS 캐시 키 예: `ResourceList:{projectId}:{start}:{end}`, `ProjectProgress:{projectId}` (TTL 10분).
- 팀이 이슈를 공유하면 페이지마다 같은 이슈 워크로그를 중복 페치하게 됨 → 상위 단위 1회 조회가 중복 제거.
- 페이지 이동/필터는 캐시된 데이터를 **프론트 메모리에서 슬라이스** → Jira 재조회 0회.
- 쿼리 키에서 슬라이스용 파라미터(`userIds` 등) 제거해야 캐시가 재사용됨.

### ② N+1 직렬 → 병렬 (`Promise.all` + `pLimit`)
- 이슈별 초과 워크로그 페이지 조회를 직렬 루프 → `Promise.all` + 공유 `pLimit(5)` 동시성 제한.
- 페이지 크기 키우고(100), 필요한 필드만(slim) 요청.
- 서로 독립인 페치(settings/holiday/schedule/worklog)는 한 `Promise.all`로 묶어 가장 느린 페치가 다른 조회와 겹치게.

### ③ blast-radius 격리 — 공유 모듈 미수정, 전용 모듈 분리
- 공통 `WorklogService`/`getProjectWorklogService`는 myWork·대시보드·캘린더가 공유 → **직접 수정 금지**.
- 성능 개선은 **전용 페처 모듈**(`ResourceWorklogFetcher.js` 등) 신규 생성으로. 다른 기능 무영향.
- 공유 SQL 쿼리를 고칠 땐 **파라미터 순서 유지**로 다른 호출부 무수정 (예: `UserSchedule.js` BETWEEN → 기간겹침 조건 수정 시).

### 부가 — MD 누적오차 방지
- MD 변환은 이슈별로 round 후 합산하지 말고, **초 단위로 먼저 Σ한 뒤 마지막 1회만 변환**. (`round(a)+round(b) ≠ round(a+b)`)

## 기각된 대안 (검토 후)
- 집계 연산을 프론트로 내리기 → 병목이 연산이 아니라 페치라 효과 없음.
- Forge SQL에 워크로그 적재 → 동기화 비용 대비 이득 부족.
- 캘린더 "분할/인라인 우선 로드" → Jira 워크로그 정렬 특성상 장기 이슈에 불리 → 초과분 병렬화 채택.

## 사례
- [[2026-05-26-resource-perf]] — Resource 리포트·캘린더에 ①②③ 전부 적용.
- [[2026-05-29-progress-page]] — 진척도가 전용 병렬 페처 `getResourceProjectWorklogs` 재사용.

## 관련 노트
- 프로젝트: [[moves-workforce]]
- [[forge-i18n]]
