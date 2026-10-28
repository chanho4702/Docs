---
type: topic
tags: [forge, migration, lifecycle, scheduled-trigger, deployment, gotcha, alter-column]
created: 2026-06-02
updated: 2026-08-04
---

# Forge 스키마 마이그레이션 · 앱 라이프사이클 함정

> Forge SQL 스키마를 언제 어떻게 생성하느냐의 문제. `scheduledTrigger`에만 의존하면 `forge deploy` 직후 테이블이 없는 공백이 생긴다.
> 출처: [[moves-workforce]] 전사 대시보드 구현 → [[2026-06-02-portfolio-implementation]]

## 핵심 함정

**`scheduledTrigger`는 배포 즉시 발화하지 않는다.** 스키마 생성(migration)을 `scheduledTrigger`(예: `init-db`, interval: hour) **하나에만** 걸어두면:

- `forge deploy` 직후 ~ 다음 트리거 발화까지(최대 1시간) **테이블이 없는 공백** 발생.
- 그 사이 새 기능이 새 테이블을 읽으면 런타임 에러.
- `onInstall`이 seed만 돌고 migration은 안 하면, 신규 설치에서도 마찬가지로 테이블 부재.

## 해결 패턴

1. **`onInstall`에서 `runMigration()`을 선행 호출**(멱등하게 작성 — 이미 적용된 버전은 skip).
   - seed 데이터보다 **먼저** migration을 돌려야 seed가 들어갈 테이블이 존재.
2. **manifest trigger에 lifecycle 이벤트 둘 다 구독**:
   ```yaml
   trigger:
     - key: on-install
       function: onInstall
       events:
         - avi:forge:installed:app   # 신규 설치
         - avi:forge:upgraded:app    # 업그레이드 — 이게 빠지면 기존 설치에 새 마이그레이션 안 들어감
   ```
3. `scheduledTrigger`(init-db)는 **보조 안전망**으로 유지(주기적 멱등 재확인).

## 후속(2026-08-04): 컬럼 추가는 위 패턴으로도 안 막힌다 ★

출처: [[2026-08-04-project-subscription]] — 실제로 운영 화면에 SQL 오류가 올라왔다.

`isTableReady()` 같은 방어를 두더라도 **테이블 존재만 확인하고 컬럼은 보지 않는다.**
그래서 `ALTER TABLE ... ADD COLUMN` 마이그레이션은 이 게이트를 그대로 통과해서 터진다.

```
v016  CREATE TABLE  → 먼저 실행됨 → isTableReady = true
v017  ADD COLUMN    → 아직 안 됨
      → 그 컬럼을 읽는 SELECT 가 실행되어 Unknown column 오류
```

**재배포만으로는 복구되지 않는다.** 세 경로가 다 막힌다:

| 경로 | 왜 안 도는가 |
|---|---|
| `init-db` 스케줄 | 시간별 — 최대 1시간 대기 |
| `onInstall` | `forge install --upgrade` 를 해도 **"Site is already at the latest version"** 이면 발동 안 함 |
| `ensureSeed` | `seed_version` 이 이미 최신이면 스킵 |

### 대응

- **읽기 게이트를 컬럼까지 확장**하거나, 신규 컬럼을 SELECT 에 즉시 넣지 않는다
  (한 배포 미뤘다가 다음 배포에서 읽기).
- 급하면 `SEED_VERSION` 을 올려 재배포 → `ensureSeed` 가 `runMigration()` 을 즉시 돌린다.
  단 시드가 함께 재실행되므로 권한 세트 등 부수 효과를 감수해야 한다.
- **컬럼 추가와 그 컬럼을 읽는 코드를 같은 배포에 넣지 않는 것**이 가장 안전하다.

## 검증 / 즉시 적용

- `forge logs`에서 `Applied migrations: v006...` 같은 로그로 실제 적용 확인.
- 배포 직후 lifecycle 이벤트를 강제 발화시키려면 **`forge install --upgrade`**(단순 `forge deploy`는 코드만 갱신, lifecycle 이벤트 미발화).

## 곁다리: seed 멱등 병합

설정(settings) seed에 키를 추가할 때는 기존 사용자 값을 덮지 않도록 **누락 키만 병합**:
```js
// findById는 raw 객체 반환
const merged = { ...defaults, ...existing };  // existing이 우선 → 기존 값 보존, 새 키만 채움
```
+ `SEED_VERSION`을 올려 재실행 게이트.

## 관련
- [[2026-08-04-project-subscription]] — 컬럼 추가 공백을 실제로 겪은 사례.
- [[forge-worklog-performance]] · [[forge-i18n]] — 같은 프로젝트의 다른 Forge 함정 모음.
- [[harness-engineering]] — 구현 단계에서 이런 배포 공백을 잡아낸 사례.
