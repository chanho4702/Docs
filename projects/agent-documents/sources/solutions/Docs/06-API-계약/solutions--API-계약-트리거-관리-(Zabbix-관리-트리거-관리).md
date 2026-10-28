# API 계약 — 트리거 관리 (Zabbix 관리 > 트리거 관리)

- **작성**: be-engineer, 2026-07-21. BE 구현 완료(빌드+테스트 그린, 미커밋).
- **BE 소스**: `moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbix/manage/ZabbixTriggerManageController.java` / `ZabbixTriggerManageService.java`, DTO는 `zabbix/manage/dto/*Trigger*.java`, 저수준 어댑터 `zabbix/ZabbixTriggerService.java`(+impl).
- **베이스 경로**: `/zabbix-manage/triggers` (Swagger 태그 `ZabbixTriggerManage`)
- **권한**: **전 EP 관리자 전용** — `AdminAccessChecker.requireAdmin`(userRole=ADMIN/SUPER_ADMIN). 거부 시 **HTTP 200 + body `{status:"error", code:403, message:"Access Denied"}`** (403 상태코드 아님 — 전역 계약 보존). 미인증은 HTTP 401.
- **저장 모델**: 자빅스가 정본(로컬 저장 없음). 감사로그만 `zabbix_change_log`(entityType=`TRIGGER`)에 기록. **Flyway 마이그레이션 없음**(테이블 재사용).

## 공통 래퍼 (아이템 관리와 동일)

성공: HTTP 200
```json
{ "status": "success", "code": 200, "data": <payload>, "syncTime": null }
```
- FE `useDmoveQuery`/axios 인터셉터 언랩 후 소비자는 `<payload>`를 직접 받는다(2겹 언랩 주의 — `data.data` 접근 금지).

에러: HTTP 200 (401 제외)
```json
{ "status": "error", "code": <400|403|...>, "errorCode": "<message와 동일>", "message": "<메시지>" }
```

## 공통 타입

### TriggerHostRefDto — 트리거가 걸린 호스트/템플릿 참조
| 필드 | 타입 | 설명 |
|---|---|---|
| hostid | string | Zabbix 호스트/템플릿 ID |
| name | string | 표시명 |
| status | string | 호스트 status(`"0"`=모니터링, `"1"`=미모니터링, `"3"`=템플릿). 템플릿 트리거의 hosts에는 템플릿이 들어옴(status="3") |

### TriggerTagDto
| 필드 | 타입 | 설명 |
|---|---|---|
| tag | string | 태그 키 |
| value | string \| null | 태그 값 |

### 값 규약 (Zabbix 원시 문자열 보존 — FE가 라벨/색 매핑)
- `priority`(심각도): `"0"`~`"5"` 문자열 (0=not classified, 1=information, 2=warning, 3=average, 4=high, 5=disaster). 기존 이벤트 화면 severity 팔레트 재사용.
- `status`: `"0"`=활성, `"1"`=비활성.
- `recoveryMode`: `"0"`=expression 재사용(기본), `"1"`=recovery expression 사용, `"2"`=none.
- `manualClose`: `"0"`=불가, `"1"`=허용.
- `type`(이벤트 생성): `"0"`=single, `"1"`=multiple.
- `inherited`: **boolean** (`templateid != "0"` 판정을 BE가 계산). true면 템플릿 상속본 → FE는 **읽기전용 표시**(수정/삭제/토글 시 자빅스가 거부).
- `templateid`: 상속 **부모 트리거** ID 문자열(`"0"`=로컬).

---

## 1) GET `/zabbix-manage/triggers` — 목록

쿼리 파라미터 (전부 옵셔널):
| 파라미터 | 타입 | 설명 |
|---|---|---|
| hostid | string | 이 호스트의 트리거만. templateid와 동시 지정 시 hostid 우선 |
| templateid | string | 이 템플릿의 트리거만 |
| search | string | 트리거명(description) 부분일치 |
| severity | number | priority 0~5 정확일치 필터 |
| status | number | 0=활성, 1=비활성 |
| limit | number | 기본 20, 1~200 클램프 |
| offset | number | 기본 0 |

응답 `data`: **`PagedListDto<ManagedTriggerDto>`**
```json
{ "items": [ManagedTriggerDto...], "total": 42, "limit": 20, "offset": 0 }
```
(total = 필터 적용 후 전체 건수. 페이징은 BE 인메모리 skip/limit — 아이템 관리와 동일.)

### ManagedTriggerDto (목록 항목)
| 필드 | 타입 | 설명 |
|---|---|---|
| triggerid | string | |
| description | string | 트리거명 |
| expression | string | 문제 조건식 — **expandExpression 적용**(사람이 읽는 형태, 예: `avg(/web-01/system.cpu.util,5m)>90`) |
| priority | string | "0"~"5" |
| status | string | "0"/"1" |
| templateid | string | 부모 트리거 ID("0"=로컬) |
| inherited | boolean | 상속 여부(읽기전용 판단용) |
| hosts | TriggerHostRefDto[] | 걸린 호스트/템플릿 |

정렬: description 오름차순(sortfield 고정, 파라미터 없음).

---

## 2) GET `/zabbix-manage/triggers/{triggerid}` — 상세

응답 `data`: **`ManagedTriggerDetailDto`**
| 필드 | 타입 | 설명 |
|---|---|---|
| triggerid | string | |
| description | string | |
| expression | string | expandExpression 적용 |
| recoveryMode | string | "0"/"1"/"2" |
| recoveryExpression | string \| null | 빈 문자열로 올 수 있음(Zabbix 원값) |
| priority | string | "0"~"5" |
| status | string | "0"/"1" |
| manualClose | string | "0"/"1" |
| comments | string \| null | 설명 |
| opdata | string \| null | 운영 데이터 |
| url | string \| null | |
| type | string | "0"/"1" |
| templateid | string | |
| inherited | boolean | |
| tags | TriggerTagDto[] | |
| hosts | TriggerHostRefDto[] | |

에러: 없는 triggerid → code:400, message `TRIGGER_NOT_FOUND`.

---

## 3) POST `/zabbix-manage/triggers` — 생성

요청 body (`TriggerCreateReqDto`):
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| hostId | string | 조건부 | 스코프 호스트 ID. **hostId 또는 templateId 중 하나 필수**(동시 지정 시 hostId 우선) |
| templateId | string | 조건부 | 스코프 템플릿 ID |
| description | string | **필수** | 트리거명 (blank → code:400 "description is required") |
| expression | string | **필수** | 문제 조건식 (blank → code:400 "expression is required") |
| priority | number | - | 0~5. 미지정 시 Zabbix 기본 0 |
| recoveryMode | number | - | 0/1/2. 미지정 시 0 |
| recoveryExpression | string | - | recoveryMode=1일 때 필수(자빅스가 검증) |
| manualClose | boolean | - | 미지정 시 false |
| comments | string | - | |
| opdata | string | - | |
| url | string | - | |
| status | number | - | 0/1. 미지정 시 0(활성) |

⚠️ **핵심 유의**: Zabbix `trigger.create`는 대상 파라미터(hostid)를 받지 않는다 — **실제 생성 대상은 `expression` 안의 `/호스트기술명/아이템키` 참조로 결정**된다. `hostId`/`templateId`는 스코프 검증·감사로그·화면 유지용이며 자빅스에는 전달되지 않는다. expression의 호스트가 스코프와 달라도 expression이 이긴다. **FE는 expression 플레이스홀더에 현재 스코프 호스트의 기술명(technical name)을 안내할 것.** 참고: expression에 쓰는 이름은 표시명(name)이 아니라 **기술명(host)** 이다.

응답 `data`: **`ManagedTriggerDetailDto`** (생성 직후 재조회 결과)

에러:
| 케이스 | HTTP | body |
|---|---|---|
| hostId/templateId 둘 다 없음 | 200 | code:400, message `TRIGGER_TARGET_REQUIRED` |
| description/expression blank | 200 | code:400, message `"description is required"` 등(검증 메시지 `\n` join) |
| **표현식 문법오류 등 자빅스 -32602 검증실패** | 200 | code:400, message **`TRIGGER_EXPRESSION_INVALID: <자빅스 원문>`** (예: `TRIGGER_EXPRESSION_INVALID: Incorrect trigger expression. Check expression part starting from "...".`) — errorCode 필드도 동일 문자열. **FE는 `TRIGGER_EXPRESSION_INVALID` 프리픽스 매칭 후 `: ` 뒤 원문을 그대로 노출** |
| 생성 응답에 triggerid 없음(이례) | 200 | code:400, message `TRIGGER_CREATE_FAILED` |
| 자빅스 세션/권한성 오류 | **401** | INVALID_TOKEN (FE 공통 refresh 흐름) |

---

## 4) PUT `/zabbix-manage/triggers/{triggerid}` — 부분 수정

요청 body (`TriggerUpdateReqDto`) — **전 필드 옵셔널, null/미포함 필드는 무시**(부분 수정):
| 필드 | 타입 |
|---|---|
| description | string |
| expression | string |
| priority | number (0~5) |
| recoveryMode | number (0/1/2) |
| recoveryExpression | string |
| manualClose | boolean |
| comments | string |
| opdata | string |
| url | string |

(status 변경은 이 EP가 아니라 5) PATCH status 사용. hostId/templateId는 받지 않음.)

**클리어 규약**: `recoveryExpression`/`comments`/`opdata`/`url` 4개 필드는 **빈 문자열(`""`)=값 비우기(클리어), null/미포함=무시(기존 값 유지)**. 특히 recoveryMode를 1→0/2로 되돌릴 때 FE는 `recoveryExpression: ""`를 함께 보내야 자빅스 정합(-32602 방지)이 맞는다. `description`/`expression`은 필수 성격이라 빈 문자열도 무시된다(빈 값 방지).

응답 `data`: **`ManagedTriggerDetailDto`** (수정 후 재조회)

에러:
- 없는 triggerid → code:400 `TRIGGER_NOT_FOUND` (자빅스 update 호출 전 선검증).
- 자빅스 -32602(표현식 오류 / **상속 트리거 수정 거부** 포함) → code:400, message `TRIGGER_EXPRESSION_INVALID: <자빅스 원문>`. 상속 거부 원문 예: `Cannot update a templated trigger.` — inherited=true인 항목은 FE에서 수정 UI 자체를 막는 것이 1차 방어.

---

## 5) PATCH `/zabbix-manage/triggers/{triggerid}/status` — 활성/비활성

요청 body (`TriggerStatusReqDto`):
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| enabled | boolean | **필수** | true=활성(status 0), false=비활성(status 1) |

응답 `data`: **`TriggerStatusResDto`**
| 필드 | 타입 | 설명 |
|---|---|---|
| triggerid | string | |
| status | string | 변경 후 상태 "0"/"1" |

에러: 없는 triggerid → code:400 `TRIGGER_NOT_FOUND`. 자빅스 거부(-32602) → code:400 + **자빅스 원문 그대로**(프리픽스 없음 — create/update와 다름).

---

## 6) DELETE `/zabbix-manage/triggers` — 삭제(단건/다건)

요청 body (`TriggerDeleteReqDto`):
| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| triggerIds | string[] | **필수(비어있으면 안 됨)** | 단건은 원소 1개 배열 |

응답 `data`: **`TriggerDeleteResDto`**
| 필드 | 타입 | 설명 |
|---|---|---|
| triggerids | string[] | 삭제된 트리거 ID 목록 (⚠️ 소문자 `triggerids` — 요청의 `triggerIds`와 케이싱 다름, 아이템 관리 `itemids` 관례) |
| count | number | 삭제 건수 |

에러: 빈/전부 blank 배열 → code:400 `TRIGGER_IDS_REQUIRED` (바인딩 검증은 `"triggerIds is required"`). **상속 트리거가 하나라도 포함되면 자빅스가 전체를 -32602로 거부** → code:400 + 자빅스 원문(프리픽스 없음). FE는 inherited=true 항목의 삭제 선택을 막을 것.

---

## 감사로그 (참고 — FE 소비 대상 아님)

`zabbix_change_log`에 entityType=`TRIGGER`, action=`CREATE`/`UPDATE`/`ENABLE`/`DISABLE`/`DELETE`로 기록. 자빅스 쓰기 성공 후 insert, insert 실패는 기능에 영향 없음(warn만).

## FE 구현 힌트 (설계 브리프 반영)

- 스코프 토글(호스트/템플릿)에 따라 `hostid` 또는 `templateid` 쿼리로 목록 조회. 아이템·템플릿 관리 화면 패턴.
- 생성 폼: expression은 freeform 멀티라인 + 플레이스홀더 `last(/호스트기술명/키)>임계값`. 키 힌트는 기존 `GET /zabbix-manage/items/keys?hostid=|templateid=` 자동완성 재활용 가능(아이템 관리 계약 참조).
- `inherited=true` 행: "템플릿 상속(읽기 전용)" 뱃지, 수정/삭제/토글 비활성화.
- 에러 토스트: message가 `TRIGGER_EXPRESSION_INVALID: ` 프리픽스면 뒤 원문을 표현식 오류로 표시.
