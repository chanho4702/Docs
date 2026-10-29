---
name: be-package-structure
description: "moveseye-be-spring 패키지 구조 정리(2026-07-28, P1~P6) — 기능별 수직 분할 규칙 확정, domain/ 해체, engine/model 포트축 분할, app zabbix→zabbixadmin. 규칙·어휘표는 moveseye-be-spring/CLAUDE.md §0.5"
metadata: 
  node_type: memory
  type: project
  originSessionId: 77fb487b-3516-474a-8e17-a0ec26170f1e
  modified: 2026-07-28T07:45:19.005Z
---

2026-07-28 수집 엔진 Phase 1 종료 직후 패키지 대정리(커밋 6개, 586 green 유지). 규칙·어휘 대응표 정본은
`moveseye-be-spring/CLAUDE.md` §0.5, 모듈 가이드는 각 모듈 `CLAUDE.md`.

**한 것**
- P1 `domain/` 44개 해체 → `{기능}/domain/`. **배치는 추측이 아니라 실사용처 집계로**(엔티티별 참조 파일의 최상위 기능 패키지를 세어 최다에 귀속). 44개 중 37개가 60% 이상으로 명확, 분산 7개만 판단.
- P2 `host/event`→`event/host`(🔴 둘 다 `/event` 매핑이라 REST 경로까지 겹쳤었다) · `host/report`→`report` · `host/widgets`→`widget`
- P3 레이어 폴더(`auth/service`·`user/service`) 해체 + **테스트 패키지 미러링**
- P5 `engine/model` 37개 → 포트 축(`metric` 12·`inventory` 9·`alert` 9, 공용 7은 루트)
- P6 app `zabbix/`→`zabbixadmin/` · `admin/`→`user/admin/`

**교훈**
- 🔴 **패키지명을 안 건드리면 모듈 이동이 공짜다** — 스텝 5에서 48파일을 engine-zabbix→engine-api로 옮길 때 패키지명을 유지해 git이 전부 `rename (100%)`로 인식, app 코드 0줄 변경. 반대로 이름을 바꾸면 import가 전부 바뀐다. **"어디에 두느냐"와 "뭐라 부르느냐"는 다른 결정.**
- 🔴 **스텝 5가 split package를 만들었다**(app·engine-api가 `com.dmove.moveseye.zabbix` 공유) → P6에서 app을 `zabbixadmin`으로 분리. 계약을 상위 모듈로 올릴 때 **패키지 네임스페이스 충돌**을 확인할 것.
- 🔴 **같은 패키지였다가 갈라지면 import를 새로 추가해야 한다**(FQN 없이 쓰던 참조). 프로덕션은 컴파일러가 잡지만 **테스트 디렉터리를 안 옮기면 늦게 터진다**(P3에서 실제로 겪음).
- ⚠️ **Gradle 증분 빌드로 테스트 수가 586→552로 보였다**(BUILD SUCCESS인데 34개 누락). `clean test`로 확인하니 실제로는 66클래스 586 전부 통과 — **대량 이동 후에는 `clean test`로 검증할 것.**
- ℹ️ FE는 타입별 분할(`pages`/`components`/`hooks`/`services`), BE는 기능별 수직 분할. **구조를 맞추면 안 되고**(BE에 레이어 분할은 안티패턴) **어휘를 맞춘다** → CLAUDE.md §0.5 대응표.
- 🔴 **가장 혼란스러운 어휘 축은 알람**: `event`(app)/`Alert`(엔진)/`problem`(Zabbix)/`event-alert`(FE) 넷. 엔진이 `Alert` 채택했으나 app rename은 REST 경로+FE 동반이라 별도 과제.

**남은 정리**: `host/` 126파일(`host/dto` 41 평면) · `event`↔`Alert` 어휘 통일.
