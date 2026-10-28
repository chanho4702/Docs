# E2E / 런타임 행위 검증 — 트리거 관리

- **검증자**: functional-qa, 2026-07-21.
- **방식**: 실제 기동 후 HTTP API 호출 + DB(감사로그) 어서션. 실 Zabbix(dmove.co.kr) 쓰기 발생 → 생성분 전량 삭제로 원상복구 완료.
- **결과 요약**: BE 런타임 **전 시나리오 PASS**(핵심 recoveryMode 전환 버그 회귀 PASS, 표현식 오류 원문 보존 PASS). 동작 버그 0건. FE 브라우저 렌더/인터랙션은 **브라우저 확장 미연결로 미수행**(정적 QA + 소스 확인으로 갈음, 하단 §미검증 참조).

---

## 기동 환경 (중요 — 스테일 빌드 및 인증 이슈 처리)

| 항목 | 내용 |
|---|---|
| **스테일 빌드 발견** | 세션 시작 시 :3000에 있던 BE(pid 14296)는 **09:03:46 기동** — 트리거 코드 컴파일 시각(11:52)보다 **약 3시간 앞섬**. 트리거 EP가 매핑되지 않아(`NoResourceFoundException`) 스테일 확정. → `gradlew build` 재컴파일 후 재기동. (과거 홈페이지 QA 스테일 사례와 동일 패턴, 주의 유효) |
| **BE 재기동** | 신규 빌드로 :3000 재기동(11:56, pid 24248). 컨트롤러 매핑 경로는 **`/zabbix-manage/...` (루트, `/api/v1` prefix 없음)** — FE도 `VITE_API_URL=http://localhost:3000`(prefix 없음)으로 직결. 초기 `/api/v1/...` 500은 curl 경로 오류였고 BE 버그 아님. |
| **인증 이슈 → dev 프로필 채택** | **실 dev DB(:5432)의 admin 비밀번호가 <마스킹>이 아님**(WRONG_USER_OR_PASSWORD). 해시 변경은 리스크+classifier 차단. → BE를 **dev 프로필**로 재기동(pid 33936, DB=docker `:5433`, Flyway 시드 admin/<마스킹> 동작). **Zabbix super admin 토큰은 env 기반**(ZABBIX_SADMIN_USERNAME=Admin, URL=dmove.co.kr)이라 DB와 무관하게 **실 Zabbix 연동 유지**. 실 dev DB(:5432)는 **무오염**. |
| **로그인** | `POST /auth/login` admin/<마스킹> → 200, userRole=ADMIN, accessToken/refreshToken 쿠키 2종 Set-Cookie. `x-visitor-id` 헤더 필요. |

---

## 시나리오별 결과 (BE 런타임)

### S1 메뉴/진입 — △ 부분(API만)
- 라우트 `/zabbix-management/trigger-management` + SideNav 메뉴(`trigger-management`) 등록 소스 확인. **브라우저 렌더는 미수행**(§미검증).

### S2 목록 + 필터 — ✅ PASS
- `GET /zabbix-manage/triggers?hostid=10084` → total 83(inherited 68 / local 15). expandExpression 적용된 사람 읽기형 표현식(`avg(/AIX by Zabbix agent/system.stat[cpu,wa],5m)>20`), priority/status 문자열, inherited boolean, hosts[] 정상.
- **severity=2** → 15건 전부 priority "2". **search=QA-FUNC** → 정확히 1건(테스트 트리거). **status=1** → 0건(대상 호스트 트리거 전부 활성). 필터 3종 정확 동작.

### S3 생성(해피패스) — ✅ PASS
- `POST` hostId=10084, `expression=last(/Zabbix server/system.cpu.num)=0`, priority=2, manualClose=true, comments/opdata/url 세팅 → 200, triggerid **25264** 발급.
- 응답(생성 직후 재조회 상세): priority="2", manualClose="1", comments/opdata/url 그대로, recoveryMode="0", hosts=[{10084,"Zabbix server","0"}]. **전 필드 값 수준 round-trip 정확.**
- ⚠️(정보) 생성 대상은 hostId가 아니라 **expression 안의 `/Zabbix server/키`**가 결정(계약 §3) — 기술명 "Zabbix server"로 정상 생성 확인.

### S4 표현식 오류(핵심 난제) — ✅ PASS
- `POST expression="bad expression !!!"` → HTTP 200 + body `code:400`.
- `message`=`errorCode`=**`TRIGGER_EXPRESSION_INVALID: Invalid parameter "/1/expression": incorrect expression starting from "bad expression !!!".`**
- 프리픽스 뒤 **자빅스 원문 그대로 보존** → FE `extractTriggerExpressionError`가 프리픽스 제거 후 원문을 Alert에 노출하는 구조와 정합(FE Alert 렌더 자체는 §미검증).

### S5 수정 + recoveryMode 전환(수정 버그 회귀검증) — ✅ PASS (핵심)
- **5a** `PUT recoveryMode=1, recoveryExpression="last(/Zabbix server/system.cpu.num)=99"` → 200, 상세 recoveryMode="1" + recoveryExpression 설정 확인.
- **5b** `PUT recoveryMode=0, recoveryExpression=""` → **200 성공, recoveryExpression 실제로 ""로 비워짐**(GET 재확인). **-32602 없음.**
  - = be-engineer가 고친 MEDIUM 버그(`putIfProvided`로 빈 문자열도 전달)가 **런타임에서 정상 작동**. 수정 전이라면 recovery_mode=0과 잔존 recovery_expression 충돌로 자빅스가 -32602 거부했을 케이스.
- **5c** `PUT comments="", opdata="", url=""` → 200, 세 필드 모두 ""로 클리어 확인. clear 규약(빈 문자열=비우기) 동작.

### S6 상태 토글 — ✅ PASS
- `PATCH /{tid}/status {enabled:false}` → 200, data `{triggerid,status:"1"}`. `{enabled:true}` → 200, status:"0". TriggerStatusResDto shape 정확.

### S7 상속 읽기전용(자빅스 거부) — ✅ PASS
- 상속 트리거 22382(templateid=22368, inherited=true) 대상:
  - **수정** `PUT description` → 400, `TRIGGER_EXPRESSION_INVALID: Cannot update "description" for templated trigger "...".` (**프리픽스 有** — 계약 §4).
  - **삭제** `DELETE` → 400, `Cannot delete templated trigger "...".` (**프리픽스 無** — 계약 §6 대로 create/update와 차별화). 자빅스가 거부하여 실제 변경 없음.
- FE 1차 방어(inherited 행 수정/삭제/토글 disabled + 방어적 재필터)는 소스 확인(§미검증: 실제 disabled 렌더).

### S8 삭제(원상복구) — ✅ PASS
- `DELETE {triggerIds:["25264"]}` → 200, data `{triggerids:["25264"], count:1}` (**응답 소문자 `triggerids`** — 계약 §6 케이싱 정확).
- 목록 재조회 search=QA-FUNC → 0건, `GET /{tid}` → 400 `TRIGGER_NOT_FOUND`. **실 Zabbix에서 완전 제거.**

### S9 감사로그 — ✅ PASS
- `zabbix_change_log`(:5433) entity_type=`TRIGGER`, entity_id=25264: **CREATE·UPDATE×5·DISABLE·ENABLE·DELETE** 순서대로 기록(내 호출과 1:1 일치). 상속 22382 거부건은 자빅스 실패 후 writeLog 미도달이라 로그 없음(정상).

---

## 실 Zabbix 정리 상태 — ✅ 완료
- 생성한 테스트 트리거 **25264 삭제 완료**. 잔존 QA-FUNC 트리거 0건(host 10084 재조회 확인).
- S4 bad-expression 생성은 자빅스가 거부해 애초에 미생성. S7 상속 22382 수정/삭제 시도는 자빅스가 거부해 **untouched**.
- 실 dev DB(:5432) 무오염(전 검증이 dev 프로필 :5433에서 수행). 실 Zabbix 원상복구 완료.

---

## 미검증 (환경 제약)
- **FE 브라우저 렌더/인터랙션(S1 메뉴 노출, S2 뱃지/스위치 DOM, S4 오류 Alert 실제 표시, S7 버튼 disabled)**: **Claude 브라우저 확장 미연결**로 수행 불가. BE 계약 정합은 API로 전건 확인했고, 해당 FE 로직은 integration-qa 정적 PASS + 본 검증자의 소스 확인(TriggerFormDrawer/TriggerManagementPage/TriggerDeleteModal)으로 갈음. 브라우저 가용 시 FE 하프 재검증 권장.

## 서버 정리
- 본 검증자가 기동한 **dev 프로필 BE(:3000, pid 33936) 종료함**. FE dev 서버(:5173)는 세션 이전부터 실행 중이던 것이라 존치.
- ⚠️ **정상 운영 복귀 시**: 실 dev DB(:5432) 기준으로 **신규 빌드 재기동** 필요(현재 build/ 클래스는 최신). 실 dev DB admin 비밀번호가 <마스킹>이 아니므로 로그인 자격은 별도 확인 요망(문서화된 <마스킹>과 불일치 — 환경 노트).

## 재현 명령 (요약)
```
# BE(dev 프로필, :5433 격리 DB + 실 Zabbix): scratchpad/start_be_dev.ps1
# 로그인
curl -s -c ck.txt -H "Content-Type: application/json" -H "x-visitor-id: qa1" \
  -X POST http://localhost:3000/auth/login -d '{"username":"admin","password":"<마스킹>"}'
# 예: recoveryMode 전환(핵심)
curl -s -b ck.txt -H "x-visitor-id: qa1" -H "Content-Type: application/json" \
  -X PUT http://localhost:3000/zabbix-manage/triggers/<TID> -d '{"recoveryMode":0,"recoveryExpression":""}'
```
