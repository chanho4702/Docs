---
name: feature-design
description: "moves-approval-jira 기능 설계서 작성법 — 경계면 계약 표, 도메인 순수 경계, Forge SQL 스키마·마이그레이션, Jira 모듈·scope, 용량·호출량 산정, 플랫폼 미검증 목록. feature-architect 가 설계·이식 계획·기능 기획을 할 때 반드시 사용. 설계 수정·재설계·계약 변경 요청에도 사용."
---

# Feature Design — 설계서 작성

## 먼저 읽을 것

1. `CLAUDE.md` — 불변식 1~10, 플랫폼 함정(실측/문서확인/미검증 구분)
2. `docs/DESIGN.md` — 제품 결정. 특히 §2.0 입력 통제 3층, §4 워크포스 계약, §8 용량
3. 가장 가까운 기존 도메인. 승인 흐름이면 `src/resolver/approval/ApprovalService.js` 와 `src/domain/approval/transitions.js`

## 설계 순서

1. **대상과 scopeKey** — 무엇에 대한 승인인가, 열린 요청 하나의 단위는 무엇인가. scopeKey 문자열을 확정한다.
2. **도메인 경계** — 순수 함수 목록(입력·출력). 시각·타임존·정책은 인자. 부작용(SQL·Jira 호출)은 Service.
3. **경계면 계약** — resolver 마다 이름 / 권한 축 / 입력 / 응답 shape / 에러 코드 / 소비 화면.
4. **스키마** — 테이블·컬럼·인덱스·UNIQUE. 새 테이블은 `vNNN_create_*`, 컬럼 추가는 `vNNN_alter_*`. 첫 프로덕션 배포 전에는 Confluence 판에서 온 마이그레이션을 재정리해도 된다(그 뒤로는 이름 변경 금지).
5. **Jira 연결** — 모듈(manifest), scope, 호출하는 REST 와 asUser/asApp 구분 + asApp 이면 `AGENTS.md` 허용 목록에 해당하는지.
6. **용량·호출량** — 200명 기준 연 행 수·바이트, resolver 1회당 Jira 호출 수. 일괄 API 로 N+1 을 없앤다.
   **그리고 유휴 SQL** — 사용자 0명·이벤트 0건일 때 하루 SQL 요청 수를 작업별로 센다. 새 스케줄 트리거는 두지 않는다 — 배치는 일일 `approval-sweep` 의 큐 fan-out 에 작업을 **추가**하는 형태로 설계하고, 빈 상태 쿼리 수 상한을 적는다(2026-10-10: 5분 스윕 3개가 월 30만 요청을 만들었다).
7. **미검증 목록** — 기대고 있는 플랫폼 동작 중 `CLAUDE.md` 에 근거가 없는 것. 확인 방법(배포 후 무엇을 보면 되는가)까지 적는다.

## 설계서 구조 (`_workspace/<slug>/01_architect_design.md`)

```markdown
# {기능} 설계서
## 열린 질문            (없으면 생략)
## 1. 개요·영향 범위     도메인 / resolver / 스키마 / manifest / 엔트리 / i18n / 워크포스 연동
## 2. 경계면 계약
| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
## 3. 도메인 (순수 함수 시그니처 + 테스트 케이스 목록)
## 4. 백엔드 (Controller/Service/Repository, CAS 지점, 트리거·스윕)
## 5. 스키마·마이그레이션
## 6. Jira 연결 (모듈·scope·REST·asApp 사유)
## 7. 프론트 (엔트리·화면 트리·쿼리키·재사용 컴포넌트)
## 8. i18n 키 (kr/en 네임스페이스.키 → 값)
## 9. 용량·호출량
## 10. 미검증 (항목 / 영향 / 확인 방법)
## 11. 작업 분해 (backend 체크리스트 / frontend 체크리스트)
```

## 판단 기준

- **엔진을 고치지 말고 어댑터를 붙인다.** `ResourceType` 추가와 `scopeKey` 분기로 끝나는지 먼저 본다. 상태 머신을 바꿔야 한다면 이유와 영향받는 기존 테스트를 적는다.
- **엔티티 프로퍼티는 표시용**(불변식 9). 판정에 쓰는 설계는 반려한다.
- **팀장 범위**: 결재자는 자기 팀원 대상만 결정·조회. 권한 축 `{teamLead:true}` 는 "부를 수 있나"만 보고, 대상 범위는 Service 가 좁힌다(불변식 7).
- **Confluence 전용 개념은 옮기지 않는다** — 페이지 버전, 영역 매크로, byline, 결재란 매크로, 스페이스. Jira 대응물(프로젝트·이슈·워크로그)로 바꾼다.
