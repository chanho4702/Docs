---
name: be-dual-maintenance
description: BE는 Spring(moveseye-be-spring) 단일 채택 확정(2026-06-22) — 앞으로 새 기능은 Spring만, Nest 병행 종료
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1e7209d5-c456-4b42-b787-ad45fdaa1f9b
---

**2026-06-22 결정: 백엔드는 Spring(`moveseye-be-spring`) 단일 채택 확정.** 앞으로 새 BE 기능·수정은 **Spring에만** 반영한다. Nest(`moveseye-be`)는 더 이상 따라가지 않는다(양쪽 병행 종료).

**이력:** 2026-06-16~06-22 동안은 채택 미정이라 새 기능을 Nest+Spring **양쪽 1:1**로 반영해왔다(채택 결정 전까지 변환/동기화 비용 누적 방지 목적). 2026-06-22 사용자가 "이제 스프링만 백엔드 넣으면 된다"며 Spring 채택을 확정 → 양쪽 병행 규칙 종료.

**Why:** 채택이 정해졌으니 두 구현을 평행 유지할 이유가 사라졌다. Spring이 정본이며, Nest를 계속 따라 고치는 건 이중 비용이다.

**How to apply:**
- 새 BE 기능/수정 요청 → `moveseye-be-spring`(Spring Boot)에만 구현. be-engineer·fullstack-feature도 **Spring 단독**으로 진행(더 이상 "Nest와 양쪽 1:1 유지" 지시 불필요).
- **2026-06-23 FE→Spring 런타임 전환 완료.** 사용자 "백엔드는 이제 Nest 안 하고 Spring으로만". FE는 `VITE_API_URL=http://localhost:3000`을 직접 호출(Vite proxy 없음, `axiosInstance.ts:21`)하고 Nest·Spring 둘 다 기본 :3000이라, **:3000에 Spring을 기동하면 FE 코드 변경 0으로 전환**된다. 조치: 기존 :3000 Spring 프로세스 종료 → 최신 코드(트래픽 수정 포함)로 `gradlew bootRun` `PORT=3000`·`SPRING_FLYWAY_ENABLED=false` 재기동(JVM이 구버전 클래스 들고 있어 재기동 필수). 스모크: 로그인/401가드/group2 리포트 200·hostCount40·cpu/memory 정상. 트래픽 수정 반영 확인 = group2 WEEK 스냅샷 삭제 후 재조회 시 `resource.traffic` 값 채워짐.
- ⚠️ **구버전 스냅샷 트래픽 잔존**: `host_group_report`의 기존 저장 스냅샷은 트래픽 수정 전 값(traffic null)이다. lazy 자동 재집계는 `hosts` 컬럼 NULL일 때만 트리거되므로, 이미 hosts가 백필된 스냅샷은 traffic이 null로 남는다 → **모든 그룹에서 트래픽을 보려면 해당 스냅샷을 비워(재집계 유발) 새 매처로 다시 계산해야 한다**(`DELETE FROM host_group_report WHERE ...` 후 조회). DB postgres/<dev-db-pw>@localhost:5432 dmove.
- Nest(`moveseye-be`)는 이제 런타임 미사용(아카이브 대상). Nest엔 트래픽/디스크 매칭 버그가 잔존하나 더 이상 쓰지 않으므로 무관.
- **2026-07-02 하네스 파일 동기화 완료**: 하네스 점검에서 06-22 결정이 `.claude/agents/`·`.claude/skills/` 파일에 미반영(전부 Nest 기준)임을 발견 → be-engineer 재작성, fullstack-feature·api-contract-sync·integration-qa·functional-qa를 Spring 기준으로 갱신. 하네스 파일은 이제 이 메모리와 일치한다.
- Spring 빌드/기동: `JAVA_HOME=C:\Program Files\Java\jdk-17` + `.\gradlew.bat build -x test`. 기동은 `.env` export(CRLF strip) + `SPRING_FLYWAY_ENABLED=false`(baseline된 dev DB 보호) 후 `gradlew bootRun`. 계약 quirk·주의사항은 `moveseye-be-spring\CLAUDE.md` §3, Flyway 스키마 변경은 기적용 파일 수정 금지·새 `V(n+1)__*.sql` 분리 규칙 준수.

관련: [[moveseye-spring-conversion]] (변환 현황·정본), [[hostgroup-report-feature]].
