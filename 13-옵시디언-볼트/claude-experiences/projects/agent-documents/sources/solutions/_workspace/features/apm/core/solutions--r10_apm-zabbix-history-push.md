# R10 실측 — Zabbix 7.0 `history.push` → 트래퍼 아이템 → 트리거 → Problem (2026-08-31)

- 대상: 설계서 `./devdesign_apm.md` §4.5(알람 배달 A안)·§10 R10 · WBS 2.1. 데모 Zabbix `dmove.co.kr` **7.0.6**, API 계정 Admin(roleid 3 = Super admin).
- 결론 한 줄: **A안 성립.** 인터페이스 없는 가상 호스트 + 트래퍼 아이템(키=UUID) + 우리 트리거에 `history.push`로 값을 밀면 **5초 안에 Problem이 뜨고 6초 안에 복구**된다. 드리프트 감지·OURS 복원·삭제 후 재생성도 API로 전부 된다. 폴백(`zabbix_sender` 프로토콜 직접 구현)은 불필요.
- 스크립트: scratchpad `r10/r10.py`(일회성, 생성물은 전부 정리함 — 호스트 10756·그룹 53 삭제 확인). 로그 `r10.log`.

## 1. 시나리오 결과

| # | 단계 | 결과 |
|---|---|---|
| 1 | 호스트 그룹 `MovesEye APM` 생성 → 호스트 `MovesEye APM R10 test` **인터페이스 없이** 생성(태그 `owner:moveseye-apm`·`apm_uid:<uuid>`) | ✅ `host.create`에 interfaces 생략 가능 |
| 2 | 트래퍼 아이템 `apm.error_rate[<uuid>]`(type 2, float, units %) | ✅ itemid 91834 |
| 3 | 트리거 `last(/host/key)>5`, priority 2, manual_close 1, 소유 태그 | ✅ |
| 4 | `history.push [{"itemid":…,"value":1.0}]` **생성 직후** | 🔴 `{"response":"success","data":[{"error":"No permissions to referred object or it does not exist."}]}` — **HTTP·JSON-RPC는 성공인데 항목별 error** |
| 4' | 같은 push 10초 뒤 | ✅ `data:[{"itemid":91834}]` — 서버 **설정 캐시 동기화** 전에는 트래퍼가 새 아이템을 모른다(이 서버는 ~10초, 기본값 `CacheUpdateFrequency`는 10s, 구버전 60s) |
| 5 | `history.push` by `host+key`, `clock`·`ns` 지정, 값 12.5 | ✅ 5초 내 Problem(eventid 196181831, severity 2) |
| 6 | `history.get` | ✅ 두 값 모두 저장(같은 clock) |
| 7 | 값 0.5 push → 복구 | ✅ `event.get`: value=0 복구 이벤트(6초 뒤) + 원 이벤트 `r_eventid` 연결. ⚠️ `problem.get recent:true`는 **최근 해소 건도 돌려주므로** "아직 열림"으로 오판 — 해소 판정은 `event.get`/`r_eventid` 또는 `recent:false`로 |
| 8 | 값 `"not-a-number"` push | ⚠️ push는 **success + itemid** — 거부되지 않는다. 8초 뒤 아이템 `state=1(NOT_SUPPORTED)`, `error: Value of type "string" is not suitable for value type "Numeric (float)"`. 다음 정상 값에서 회복 |
| 9 | 존재하지 않는 키 push | 항목별 `error: No permissions to referred object or it does not exist.` (4와 동일 문구 — **"권한 없음"과 "없음"과 "캐시 미동기"를 같은 문구로 낸다**) |
| 10 | 사용자가 트리거 표현식을 `>50`으로 편집(드리프트) | ✅ `trigger.get expandExpression:true`로 우리 표현식과 대조 → drift=true. 태그 보존됨 |
| 11 | OURS 복원(`trigger.update expression`) | ✅ |
| 12 | 사용자가 트리거 삭제 → 태그(`apm_uid`)로 재탐색 0건 → 재생성 | ✅ 새 triggerid(41513). **매핑은 triggerid가 아니라 태그 `apm_uid`로 찾는다** — id는 바뀐다 |
| 13 | 액션 진단: `action.get selectFilter`에서 조건 `conditiontype 0(호스트 그룹)=우리 그룹`인 액션 | **0 / 17** → 알림 액션 없음 배지가 실제로 필요(설계 §4.5 "액션은 우리가 만들지 않는다") |
| 14 | 정리 `host.delete` → 아이템·트리거 cascade, `hostgroup.delete` | ✅ |

## 2. 구현 계약으로 확정되는 것 (`ZabbixAlertBridge`·`engine-api zabbix/` `history.push` 계약)

1. **응답 판정은 항목 단위**: `result.response == "success"`는 요청 수신일 뿐. `result.data[i].error`가 있으면 그 값은 **버려진 것**. 계약의 반환형은 `List<PushResult(itemid|error)>`이어야 하고, 호출자는 error 항목을 카운트·로그·재시도한다.
2. **프로비저닝 직후 push 금지**: 아이템 생성 → **캐시 동기화 대기**(첫 push가 `does not exist`면 10초 간격 최대 2분 재시도, 성공하면 `synced=true` 기록). 규칙 생성 화면에서 "Zabbix 반영 중" 상태가 필요하다.
3. **값 검증은 우리 쪽에서**: Zabbix는 잘못된 타입을 push 단계에서 거부하지 않고 아이템을 NOT_SUPPORTED로 만든다 → 우리가 float 포맷을 보장하고, 동기화 배치가 `item.get state=1`을 드리프트/장애 배지로 올린다.
4. **복구 판정**: `problem.get recent:true` 금지 — `recent:false`(열린 것만) 또는 `event.get`의 `r_eventid`.
5. **매핑 탐색 키 = 태그 `apm_uid`**(+`owner:moveseye-apm`). `zbx_triggerid`는 캐시일 뿐이며 사용자 삭제·재생성으로 바뀐다.
6. **호스트는 인터페이스 없이** 만든다(에이전트 없는 가상 호스트). 호스트 그룹 `MovesEye APM` 1개, 호스트는 `MovesEye APM`(서비스 수만큼 호스트를 만들지 않는다 — 아이템 키에 UUID가 있어 한 호스트에 전부 들어간다; 호스트당 아이템 상한은 없음).
7. **권한**: push·프로비저닝 모두 Admin(super admin)으로 성공. 제한 계정이면 같은 문구(`No permissions…`)가 나오므로 **진단은 별도 EP**(`host.get`으로 우리 호스트가 보이는지 + `item.get`으로 아이템이 보이는지)로 갈라 표시한다.
8. **액션 진단**: `action.get(eventsource 0, selectFilter)`에서 조건 타입 0(host group)=우리 그룹 id 또는 조건 타입 26(tag `owner`)이 있는 **활성** 액션이 없으면 "알림 액션 없음" 배지 + 가이드 링크.

## 3. 설계서 반영
- §4.5: 위 1~8 추가(v3.2). R10 상태 ✅. 폴백(zabbix_sender) 삭제.
- WBS 2.2 계약 시그니처: `ZabbixHistoryPush.push(List<PushValue(itemid|host+key, value, clock?)>) -> List<PushResult>`.
