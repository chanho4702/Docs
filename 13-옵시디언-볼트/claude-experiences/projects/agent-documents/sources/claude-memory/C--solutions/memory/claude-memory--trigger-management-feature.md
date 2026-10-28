---
name: trigger-management-feature
description: "2026-07-21 자빅스 관리>트리거 관리 메뉴 신설(trigger.* 전체 CRUD) 풀스택+QA 완료(미커밋). BE /zabbix-manage/triggers 6EP, ENTITY_TRIGGER 감사(마이그레이션 없음 V12 유지). 교훈: trigger.create는 hostid 안 넘김(expression의 /host/key가 대상 결정), -32602 표현식오류는 create/update만 400 매핑, 부분수정 clearable 필드는 빈문자열=클리어"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5f188f-27ea-4a1a-aee6-b9f557b1edd0
  modified: 2026-07-21T03:10:12.703Z
---

2026-07-21 자빅스 관리 > **트리거 관리** 메뉴 신설. 자빅스 `trigger.*` 전체 CRUD(생성·수정·삭제·활성토글). 호스트+템플릿 스코프 토글. 아이템·템플릿 관리(`/zabbix-manage/**`) 패턴 그대로. fullstack-feature 하네스+fable5로 구현. **미커밋.**

## BE (moveseye-be-spring)
- `zabbix/manage/ZabbixTriggerManageController.java` — `/zabbix-manage/triggers` 6EP(GET목록/GET상세/POST/PUT/PATCH status/DELETE). 전 EP `AdminAccessChecker.requireAdmin`(userRole 기준, roleid `@RolesGuarded` 아님 — admin roleid NULL 이슈 회피). 거부=HTTP200 body code:403.
- `zabbix/ZabbixTriggerService`+`impl/ZabbixTriggerServiceImpl` — trigger.get/create/update/delete 저수준(기존 `ZabbixHostService.getTriggersRaw`는 event용이라 안 건드림, 쓰기용 별도 분리). ZabbixClient 문자열 본문.
- `ZabbixTriggerManageService` — 자빅스 정본·로컬 저장 없음·감사로그만·`getSuperAdminToken()`.
- DTO 11종(zabbix/manage/dto), ErrorCode `TRIGGER_TARGET_REQUIRED/CREATE_FAILED/IDS_REQUIRED/EXPRESSION_INVALID`, `ZabbixChangeLog.ENTITY_TRIGGER` 상수 추가. **Flyway 마이그레이션 없음**(zabbix_change_log 재사용, V12 유지).

## 핵심 교훈
- **trigger.create는 hostid를 자빅스에 안 넘긴다** — expression의 `/host/key`가 대상 호스트를 결정. hostId/templateId 요청 필드는 스코프 검증·감사·응답 필터용일 뿐. (아이템 item.create가 hostid 직접 받는 것과 다름 — 주의)
- **-32602(Invalid params, 표현식 문법오류) 매핑**: create/update **쓰기 경로에서만** ApiError를 잡아 `TRIGGER_EXPRESSION_INVALID: <자빅스 원문>`으로 400 재던짐. UnauthorizedError(401)는 미포획이라 인증 오류와 혼동 없음. delete/status의 -32602(상속 거부 등)는 프리픽스 없이 원문 그대로 → FE가 프리픽스 유무로 표현식오류/일반거부 구분.
- **부분수정 빈문자열=클리어**: recovery_expression/comments/opdata/url은 `putIfProvided`(null만 무시, ""는 전달). recoveryMode 1→0 전환 시 recoveryExpression:"" 동반 안 하면 자빅스가 recovery_mode/expression 정합 위반으로 -32602 거부. (`putIfPresent`는 ""→null 드롭이라 name/key 필수필드용, clearable 필드에 쓰면 안 됨) — integration-qa가 잡은 MEDIUM 버그.
- **상속 트리거**: `templateid != "0"`이면 `inherited:true`(BE 계산). FE 읽기전용 뱃지. 수정/삭제는 자빅스가 거부(원문 노출).
- priority 0~5 원시 문자열 보존(enum 미도입). 삭제 응답 필드 소문자 `triggerids`(요청은 `triggerIds`).

## FE (moveseyee_fe)
- `pages/zabbix-management/trigger-management/`(Page/FormDrawer/DeleteModal), `types/zabbix-trigger.ts`, `services/zabbix-trigger.api.ts`, `hooks/useZabbixTrigger.ts`, `constants/zabbix-trigger.ts`(severity 팔레트=네트워크맵/지리맵과 동일 #97AAB3~#E45959).
- 표현식 오류는 폼 Alert에 자빅스 원문 그대로. 키 자동완성은 `/zabbix-manage/items/keys` 재활용(`last(/기술명/키)` 스니펫). scope/target은 URL query state([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-page-remount-on-navigate|fe-page-remount-on-navigate]]).

## QA
- integration-qa 정적: HIGH 0, MEDIUM 1(빈문자열 clear — be 수정 완료), 재검증 PASS.
- functional-qa 런타임(dev 프로필 :5433 DB, 실 Zabbix): BE 전 시나리오 PASS, 버그 0. recoveryMode 전환·표현식오류·상속거부·삭제 정리 전부 확인. 테스트 트리거 생성→삭제 원상복구.
- **잔여: FE 브라우저 렌더/인터랙션 미검증**(Chrome 확장 미연결). 브라우저 가용 시 FE 하프 재검증 권장.
- ⚠️ 스테일 빌드 재발(:3000 BE가 트리거 코드보다 앞서 기동 → EP 미매핑). QA 시 프로세스 시작시각 vs 클래스 컴파일시각 대조 필요. 실 dev DB(:5432) admin 비번이 문서화된 qwe123과 불일치 → dev 프로필 docker DB로 우회.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--item-template-management-feature|item-template-management-feature]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--host-classification-tags-feature|host-classification-tags-feature]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--no-coauthored-by-trailer|no-coauthored-by-trailer]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

트리거 관리 — 2026-07-21 자빅스 관리>트리거 관리 신설(trigger.* 전체 CRUD) 풀스택+QA 완료(미커밋). BE /zabbix-manage/triggers 6EP, ENTITY_TRIGGER 감사(마이그레이션 없음 V12). 교훈: trigger.create는 hostid 안 넘김(expression /host/key가 대상), -32602는 create/update만 400 매핑, 부분수정 clearable 필드 빈문자열=클리어(putIfProvided). ⚠️메뉴는 후속 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-config-drilldown-restructure|zabbix-config-drilldown-restructure]]로 드릴다운 편입됨(단독메뉴 폐기). 잔여: FE 브라우저 렌더 미검증(Chrome 미연결)
