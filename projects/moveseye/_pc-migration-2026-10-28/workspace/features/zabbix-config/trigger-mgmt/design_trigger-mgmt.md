# 트리거 관리(Trigger Management) 설계 브리프

**요청:** 자빅스 관리 > "트리거 관리" 메뉴 신설. 자빅스 `trigger.*` API 기반 전체 CRUD(생성·수정·삭제·활성/비활성 토글). 적용 대상 = 호스트 + 템플릿 둘 다(스코프 토글). 아이템·템플릿 관리(`/zabbix-manage/**`) 패턴 그대로.

**실행:** fullstack-feature 하네스. 파이프라인 be → 계약 → fe → integration-qa → functional-qa. 엔지니어링 에이전트 모델 = fable5(트리거 표현식 복잡도).

**확정 결정(사용자):**
- CRUD 범위: 전체 CRUD (생성·수정·삭제·활성/비활성 토글)
- 적용 대상: 호스트 + 템플릿 둘 다 (스코프 토글)
- 메뉴: 단독 메뉴 (자빅스 관리 > 트리거 관리)
- 감사로그 포함

---

## 기준 패턴 (반드시 준수)

기존 **아이템 관리**(`ZabbixItemManageController` / `ZabbixItemManageService`)와 1:1 대응 구조.

- 컨트롤러 `@RequestMapping("/zabbix-manage/triggers")`, `@Tag(name="ZabbixTriggerManage")`, `@VisitorIdCheck`.
- **전 EP 관리자 전용**: 각 메서드 첫 줄 `AdminAccessChecker.requireAdmin(currentUser)`. (roleid 기반 `@RolesGuarded` 쓰지 말 것 — admin roleid NULL 이슈, be-spring CLAUDE.md 주의 #2 참조.)
- 자빅스 호출은 `ZabbixUserService.getSuperAdminToken()` 서비스 계정. **로컬 저장 없음, 자빅스 정본.**
- 감사로그: `ZabbixChangeLog`(domain), `entityType = ENTITY_TRIGGER`(신규 상수 추가), action = CREATE/UPDATE/ENABLE/DISABLE/DELETE 재사용. `writeLog(...)` 헬퍼 동일 패턴. **Flyway 마이그레이션 불필요**(zabbix_change_log 테이블 재사용) — 단, ENTITY_TRIGGER 상수만 추가.
- 응답 래퍼 `ApiResult<...>`, 목록은 `PagedListDto<...>`(items/total/limit/offset). 403은 HTTP 200 body code:403 보존.
- JSON-RPC 본문은 `objectMapper.writeValueAsString()` 문자열(주의 #3).

## 엔드포인트 후보 (be-engineer가 계약으로 확정)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/zabbix-manage/triggers` | 목록. hostid/templateid/search(description)/severity/status 필터 + 페이징. trigger.get(selectHosts, expandExpression 등) |
| GET | `/zabbix-manage/triggers/{triggerid}` | 상세. 표현식/복구표현식/심각도/수동종료/태그/dependencies |
| POST | `/zabbix-manage/triggers` | 생성. trigger.create. hostId 또는 templateId 스코프. description+expression 필수 |
| PUT | `/zabbix-manage/triggers/{triggerid}` | 수정(부분). trigger.update |
| PATCH | `/zabbix-manage/triggers/{triggerid}/status` | 활성(status=0)/비활성(status=1). trigger.update status |
| DELETE | `/zabbix-manage/triggers` | 삭제(단건/다건). triggerIds 배열. trigger.delete |

## 트리거 도메인 필드 (Zabbix trigger.*)

- `triggerid`, `description`(트리거 이름), `expression`(문제 조건식), `recovery_expression`, `recovery_mode`(0=식/1=none/2=recovery expr)
- `priority`(심각도 0~5: not classified/information/warning/average/high/disaster), `status`(0 활성/1 비활성)
- `manual_close`(0/1 수동종료 허용), `comments`, `opdata`, `url`, `type`(0 single/1 multiple)
- `selectHosts` → 어느 호스트/템플릿에 걸렸는지. 템플릿 트리거는 `templateid != 0`이면 상속본(상위 편집).
- 참고 읽기 전용 DTO: `com.dmove.moveseye.event.dto.TriggerDetailResDto` (재사용은 하되 관리용 DTO는 zabbix.manage.dto 하위에 별도 신설).

## 핵심 난제 (특별 지시)

1. **표현식 검증 실패 매핑**: trigger.create/update 시 자빅스가 `-32602`(Invalid params, 표현식 문법 오류)를 자주 반환. 아이템 관리 선례처럼 `-32602` 검증실패는 401(INVALID_TOKEN)이 아니라 **400 + 사람이 읽을 수 있는 표현식 오류 메시지**로 분기해야 함(회귀 주의). 자빅스가 주는 `data` 메시지를 그대로 노출.
2. **표현식 입력 UX(FE)**: 표현식은 freeform 문자열. 최소한 예시 플레이스홀더(`last(/host/key)>threshold`)+멀티라인 입력. 스코프에 맞는 호스트/템플릿 키 힌트(가능하면 아이템 관리의 item-keys 자동완성 재활용). 과도한 파서 구현은 하지 말 것 — 자빅스 검증에 맡기고 에러 메시지를 잘 보여주는 방향.
3. **템플릿 트리거 상속**: 호스트에 상속된 트리거(`templateid != 0`)는 호스트 스코프에서 편집 불가 → FE에서 "템플릿 상속(읽기 전용)" 표시.
4. **심각도 표기**: priority 0~5 → i18n 라벨 + 색상(기존 이벤트/문제 화면 severity 색상 팔레트 재사용).

## FE 연결점 (fe-engineer)

- 메뉴/라우트: `자빅스 관리 > 트리거 관리`. `constants/routes.ts`, 사이드바 메뉴 등록.
- 화면 구조: 아이템·템플릿 관리(`pages/zabbix-management/item-template-management/`) 패턴 참고. 스코프 토글(호스트/템플릿) + 목록 테이블(DmoveTable) + 생성/수정 Drawer + 삭제 모달 + 상태 토글.
- api/type/hook: `services/zabbix-trigger.api.ts`, `types/zabbix-trigger.ts`, `hooks/useZabbixTrigger.ts`. queryKey/routes 상수 등록.
- useDmoveQuery 언랩 깊이 주의(payload 직접 수신). 트래픽/단위 관련 없음.

## 산출물
- `_workspace/features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md` (be-engineer)
- `_workspace/features/zabbix-config/trigger-mgmt/qa_trigger-mgmt.md` (integration-qa)
- `_workspace/features/zabbix-config/trigger-mgmt/e2e_trigger-mgmt.md` (functional-qa)
