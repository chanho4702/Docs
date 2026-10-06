---
tags: [moveseye, backend, refactor, package-structure, spring]
updated: 2026-07-29
---

# 2026-07-28 — BE 패키지 구조 정리 P1~P6 + 배포 빌드 복구

멀티모듈화([[2026-07-28-collector-engine-phase1]])가 만든 구조적 잔해를 하루에 정리했다. 커밋 6개(`705f0cb`~`d0c9057`) + Dockerfile 픽스(`3a36194`).

| 단계 | 내용 |
|---|---|
| P1 | 전역 `domain/` 평면 패키지 해체 — 엔티티를 각 기능 안으로(`asset/domain/Asset`) |
| P2 | `host/` 하위 3개 재배치 — 경로 충돌·소속 오류 해소 |
| P3 | 레이어 폴더(`service/`) 해체 + **테스트 패키지 미러링** |
| P4 | `engine/model` 37개를 **포트 축**으로 분할(Metric/Inventory/Alert) |
| P5 | app의 zabbix 패키지 분리 + `admin`을 `user` 하위로 |
| P6 | 문서화 — 패키지 규칙 + FE/BE/엔진/Zabbix **어휘 대응표** (`moveseye-be-spring/CLAUDE.md §0.5`) |

## 확정된 규칙 (정본은 BE `CLAUDE.md §0.5`)

1. **기능별 수직 분할이 기본** — 기능 하나에 controller·service·dto·repository·domain을 다 넣는다. 레이어 폴더 금지.
2. 엔티티는 기능 안에. 전역 `domain/` 없음.
3. `common/`에 넣기 전에 한 번 더 생각 — 2개 이상 기능이 공유하고 도메인 색이 없을 때만.
4. **테스트 패키지는 프로덕션과 미러링**.
5. `com.dmove.moveseye.zabbix.*` = engine-api(계약) 전용. app의 Zabbix 관리 화면은 `zabbixadmin/` (FQN만 보고 계약인지 화면인지 구분되도록).

## 교훈

- 🔴 **패키지명을 안 바꾸면 모듈 이동이 공짜다** — git이 전부 `rename (100%)`로 인식해 diff에 실제 변경만 남는다. 스텝 5에서 얻은 교훈을 P1~P5 내내 적용했다.
- **스텝 5가 만든 split package를 P6에서 해소**했다 — 같은 패키지명이 두 모듈에 걸치면 당장은 컴파일되지만 계약/구현 경계가 이름으로 안 보인다.
- 🔴 **대량 파일 이동 뒤에는 `clean test`가 필수**. 증분 빌드가 586개였던 테스트를 552개로 보여줬다(사라진 게 아니라 안 돈 것).
- **테스트 미러링을 어기면 "같은 패키지라 import 없이 쓰던" 코드가 나중에 깨진다** — P3에서 실제로 겪음.
- ⚠️ **모듈화는 배포 스크립트를 조용히 깨뜨린다** — Dockerfile이 단일 모듈 가정으로 짜여 있어 빌드가 실패했다(`3a36194`로 복구). 구조 변경의 영향 범위에 CI/이미지 빌드를 항상 포함할 것.

## 🔤 어휘 문제 (FE와 맞출 것은 구조가 아니라 어휘)

같은 것을 층마다 다르게 부른다. 가장 심한 축은 **알람**: `event`(app) / `Alert`(엔진 계약) / `problem`(Zabbix) / `event-alert`(FE). 수집 엔진이 `Alert`를 채택했으므로 장기 방향은 그쪽이지만, app의 `event/` rename은 REST 경로(`/event`)와 FE까지 걸리는 **별도 과제**로 남겼다. 새 코드는 지금 있는 층의 어휘를 따른다.

관련: [[2026-07-28-collector-engine-phase1]], [[2026-06-10-spring-conversion]], [[strangler-port-migration]]
