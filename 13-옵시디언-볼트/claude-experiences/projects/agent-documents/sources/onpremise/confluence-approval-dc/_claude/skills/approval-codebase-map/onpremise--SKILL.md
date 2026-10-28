---
name: approval-codebase-map
description: >-
  confluence-approval-dc 코드베이스의 구조·핵심 파일·알려진 함정 지도. 이 저장소의 코드를
  수정하거나 스펙을 쓰기 전에 반드시 읽을 것. 모듈 구조, REST-JS 경계, AO 저장소 규칙,
  Spring Scanner/QuickReload 함정을 모른 채 수정하면 회귀가 난다.
---

# 코드베이스 지도

## 모듈
- `approval-domain/` — 순수 Java 17 상태 머신. Confluence 의존 없음. 핵심: `ApprovalRequest`(aggregate, 단계·멱등·만료 사유), `ApprovalWorkflowService`(대상 단위 락 직렬화), `ApprovalLockNames`(락 이름 = dedupe key 출처 단일화).
- `approval-confluence9/` — 운영 대상 어댑터 (javax, Confluence 9.2). **모든 기능 변경의 기준 모듈.**
- `approval-confluence10/` — jakarta 어댑터. 순차 승인 이전 상태로 이식 대기 중. C9 변경을 자동으로 따라가지 않는다 — 이식 백로그에 기록만 남길 것.

## C9 핵심 파일
| 파일 | 역할 |
|------|------|
| `rest/ApprovalRestResource.java` | 전 REST 엔드포인트 + JSON 직렬화(requestObject). 승인/반려는 `decide()` 한 곳 |
| `storage/ActiveObjectsApprovalRequestRepository.java` | AO 저장. `dedupeKey`(열린 요청 1개 보장), `saveApprovers` 변경분 반영, 이벤트 append-only |
| `panel/ApprovalPagePanel.java` | 페이지 헤더 배너 (StringBuilder HTML, escape() 필수) |
| `servlet/ApprovalInboxServlet.java` / `ApprovalSettingsServlet.java` | text block TEMPLATE + `__TOKEN__` 정규식 치환 (String.format 금지 — CSS % 충돌) |
| `resources/js/approval.js` | 패널·매크로 인터랙션. document 레벨 이벤트 위임 + closest 패턴 |
| `resources/css/approval.css` | 패널·매크로·모달 스타일 |
| `notification/*` | outbox 패턴: enqueue(멱등, eventId+recipient+channel) → drain 스케줄러. 채널 IN_APP/EMAIL |
| `listener/ApprovalPageUpdateListener.java` | 편집 → 버전 만료. `@ExportAsService` 없으면 인스턴스가 안 만들어짐 |

## 절대 깨면 안 되는 불변식
1. **열린 요청은 대상당 하나** — `dedupeKey`("open:"+scopeKey) unique 제약 + `inTargetLock` 이중 방어. 둘 다 `ApprovalLockNames.scopeKey` 한 곳에서 나온다.
2. **AO unique 컬럼은 create 시 DBParam으로** — AO는 빈 행 INSERT 후 setter라서, unique 값을 나중에 넣으면 제약 위반.
3. **이벤트는 append-only**, 승인자 행은 삭제-재삽입 금지(변경분 반영 — 동시 저장 시 결정 유실 방지).
4. **legacy minimum 행 구분** — 단계 1개 + requiredApprovals>1 요청은 STEP_ORDER=0으로 저장(isLegacyMinimum). 없애면 기존 요청 통과 조건이 느슨해진다.
5. **락 재진입** — ClusterApprovalLockService의 ThreadLocal HELD. 락 안에서 도메인 전이 메서드 호출이 전제.
6. **모든 사용자 문자열은 escape()** — 패널/매크로/서블릿 각자의 escape 헬퍼 사용. JSON은 ApprovalJson.write만.
7. 승인자 키는 userKey가 원칙이나 username이 섞일 수 있다 — 조회는 항상 key→name 순 이중 조회(패널 resolveActorKey, displayName 참조).

## 운영 함정
- **QuickReload 교차 설치**: C9 인스턴스 실행 중 C10 빌드 금지 (plugin key 공유 → 전체 비활성화). 반대도 동일.
- Spring Scanner 컴포넌트는 lazy — 주입받는 곳 없는 리스너/스케줄러는 `@ExportAsService` 필수.
- 빌드: `powershell.exe -File scripts/build.ps1 -Target {domain|confluence9|confluence10|all}` (JDK 21 toolchain 자동 선택, 시스템 JAVA_HOME 사용 안 함. `pwsh`는 이 머신에 없음). C9 인스턴스 실행 중이면 domain jar 잠금으로 clean 실패 — `mvn -pl approval-confluence9 -am test`로 우회.
- 서블릿 템플릿에 하드코딩 컨텍스트 패스 금지 — `req.getContextPath()`를 `__CONTEXT_PATH__` 토큰으로 주입.
- REST는 query/path 파라미터만 사용(요청 body 없음) — 새 엔드포인트도 이 관례 유지.
