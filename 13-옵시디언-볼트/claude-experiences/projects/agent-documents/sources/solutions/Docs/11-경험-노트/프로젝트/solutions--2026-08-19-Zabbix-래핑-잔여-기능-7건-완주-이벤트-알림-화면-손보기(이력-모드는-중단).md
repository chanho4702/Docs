# 2026-08-19 — Zabbix 래핑 잔여 기능 7건 완주 + 이벤트/알림 화면 손보기(이력 모드는 중단)

관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/2026-07-22-zabbix-usability-menus|2026-07-22-zabbix-usability-menus]] · [[projects/moveseye/zabbix-api-reference|zabbix-api-reference]] · [[projects/moveseye/zabbix-admin-manual-nexen|zabbix-admin-manual-nexen]]

## 한 줄

후순위로 밀어놨던 Zabbix 래핑 구멍(매크로·점검 기간·LLD 프로토타입·사용자 미디어·스크립트 등)을 **전부 실서버 검증까지 끝내 커밋**했고, 이어서 **이벤트/알림 화면**을 통합·정비하다 "해결된 문제가 목록에 아예 안 보인다"는 구조적 문제를 만나 **이력(History) 모드**를 만들었으나 **성능 때문에 커밋 직전에 정지**했다.

## 1. 완료한 래핑 기능 (티켓 ZM-93)

| 기능 | 요지 | 실측으로만 알 수 있었던 것 |
|---|---|---|
| 네트워크 디스커버리 **액션 탭** | 규칙 폼에서 액션 연결/해제 + 표준 액션 빠른 생성 | `action.get` 응답을 그대로 `action.update`에 되돌리면 `-32602` — `conditionid`·`actionid`·`value2`·`eval_formula`·`formulaid`를 벗겨야 한다(`ActionFilterNormalizer`). **규칙 한정 조건(18/19)을 지우면 액션이 전역으로 승격** → BE가 거부 |
| **매크로 관리** | 전역 + 호스트/템플릿 매크로 CRUD, 상속 계산, 비밀값 마스킹 | 상속 순서는 호스트 → 1단 템플릿(templateid 오름차순) → 2단 → 전역. `type=1`(secret)은 응답에 value 키 자체가 없다 |
| **점검 기간(Maintenance)** | 일정 CRUD + 기간 편집기, 알림 관리 탭으로 배치 | timeperiod는 **타입별로 허용 필드가 다르다**(잘못 보내면 "unexpected parameter") → `MaintenanceTimeperiodNormalizer`. 빈 timeperiods 불가, 안 보내면 유지 |
| **LLD 프로토타입 4종** | 아이템·트리거·그래프·호스트 프로토타입 전체 CRUD + 태그·전처리·의존성·인터페이스·매크로·상태 토글·"지금 실행"·생성물 조회 | "지금 실행"은 `task.create [{type:6}]`. 생성물은 `flags=4` + `selectXxxDiscovery.parent_*`로 역추적. `hostprototype.get`에 **다른 객체의 필드를 output으로 주면 400** |
| **사용자 미디어** | 사용자별 알림 매체 설정 | `active`가 **0=사용**(반전). `sendto`는 이메일만 배열 |
| **스크립트(Scripts)** | 스크립트 CRUD + 호스트에서 실행 | `script.getscriptsbyhosts`는 `{hostid:"…"}` **객체**를 받는다. `timeout`은 Webhook(type 5)에서만 수정 가능 |
| 로깅 정리 | `logback-spring.xml` 신설(dev/it/운영 분리), yml에서 `logging.level.*` 제거 | 운영 전용 FILE appender는 `springProfile` 안에 넣어야 "not referenced" 경고가 안 난다 |

> 메뉴마다 툴팁 설명을 달았다 — "이 화면이 Zabbix의 무엇을 감싼 것인지"를 사용자가 알 수 있게. 래핑 제품의 기본 예의에 가깝다.

## 2. 이벤트/알림 — 화면 통합 (커밋 완료, ZM-99)

`Problem`과 `호스트 그룹별` 두 화면을 **하나로 합쳤다**. 그룹별은 목록 위 **접이 패널**로 흡수하고, 숫자를 누르면 아래 목록이 그 그룹·심각도로 필터된다. 구 URL은 리다이렉트, 메뉴는 1개.
발생 일시 기본 범위도 **연초~ → 최근 30일**로 줄였다(연초부터면 Zabbix가 500을 뱉는다).

## 3. 필터를 뜯어보니 5건이 고장나 있었다

사용자의 "이거 필터 좀 검사해봐 이상하다" 한마디에서 시작했다. API로 축을 하나씩 때려보니:

1. **호스트 그룹 필터에 7개만** — 옵션 소스가 Zabbix가 아니라 DMOVE DB `host_group`(동기화된 일부)였다. 같은 화면의 요약 패널은 Zabbix 30개를 보여주는데 필터는 7개인, **축이 갈린 상태**
2. **처리 일시 필터 무동작** — FE는 `resolutionFrom/To`를 보내는데 BE DTO에 필드가 없었다(조용히 버려짐)
3. **상태 열이 영원히 "Problem", 처리 일시가 영원히 "Pending"**
4. **심각도 칩 "전체 84" vs 목록 "76건"** — 칩은 포트를 7번 따로 불러 세고, 비활성 규칙을 안 뺐다
5. 검색창에 호스트명을 넣으면 0건(검색축이 problem **이름**인데 안내가 없었다)

1·4·5는 고쳤다. 4는 덤으로 Zabbix 콜이 **8회 → 1회**가 됐다(목록을 한 번 받아 같은 모집단에서 세면 되는 일이었다).

## 4. 🔴 핵심 발견 — Zabbix는 해결된 문제를 5분만 들고 있다

3번(상태·처리 일시가 죽은 UI)의 원인을 "옵션 하나 켜면 된다"고 추정했다. `problem.get recent=true`. 켜고 **실제로 물어보니 아무것도 달라지지 않았다.**

`settings.get` → **`ok_period = 5m`**. Zabbix는 해결된 문제를 5분만 `problem.get`에 남기고 버린다. 우리가 못 바꾸는 서버 설정이다.
같은 시각 `event.get value=0`으로는 최근 2시간에 해결 사건이 5건 있었다 — **데이터가 없는 게 아니라 창구가 다른 것**이었다.

> 교훈: "옵션을 켜면 된다"는 추정은 **켜고 세어보기 전까지는 추정**이다. 이번엔 유닛테스트도 통과하고 코드도 맞았는데, 제품 가치가 0이었다.

Zabbix 자기 화면에는 이미 답이 있었다 — Problems의 `Show: Recent problems / Problems / History`. 세 번째가 `event.get` 경유다. 사용자에게 A(이력까지 간다)·B(현상 유지+안내)·C(열 제거) 세 안을 내고 **A** 선택.

## 5. 이력 모드 — 만들었고, 동작하고, 커밋 못 했다

- 엔진 계약 `AlertHistoryQuery`에 필터 축 4개 추가(엔티티·등급·이름·식별자). 기존 8인자 생성자는 오버로드로 남겨 호출부 무수정.
- 발생 사건에는 **복구 사건의 식별자만 있고 시각이 없다** → 2단 조회로 되짚어 `Alert.withResolvedAt`으로 주입.
- `event.get`은 그룹을 안 준다 → 호스트→그룹 맵을 인벤토리에서 한 번 받아 채운다.
- 이력 모드에선 "비활성 규칙 제외"를 **적용하지 않는다** — 지난 사건은 지금 규칙 상태와 무관하다.

실서버 검증: 해결된 사건이 처리 일시와 함께 나오고, 그룹·심각도·처리일시 필터 전부 동작. **그런데 12.4초.** 그리고 30일이면 4822건인데 2000에서 잘려 "전체 2000건"으로 표시된다 — **조용한 절단**.

비용을 직접 재봤다:

| 호출 | 건수 | 시간 |
|---|---|---|
| 가벼운 4필드(eventid·clock·severity·r_eventid) | 4822 | **0.32초** |
| `output=extend` | 2000 | **5.5초** |
| extend + selectHosts + selectAcknowledges | 2000 | 5.8초 |
| eventids로 10건만 상세 | 10 | 0.25초 |
| 복구 사건 전체(eventid·clock) | 4764 | 0.15초 |

범인은 `output=extend` 대량 조회고, 그게 두 번 돌고 있었다. **가볍게 전부 받아 메모리에서 계산 → 보이는 페이지 10건만 상세 하이드레이트**로 바꾸면 12초 → 1초 미만, 절단도 사라진다(전체 건수가 정확해지므로). 이 구조는 [[projects/moveseye/2026-07-22-zabbix-usability-menus|2026-07-22-zabbix-usability-menus]]의 "ID 슬라이스 페이징"과 같은 발상이다.

여기서 사용자가 정지시켰다. 재개 지점·미커밋 파일 목록·측정표는 `_workspace/wip_event-alert-history.md`.

## 교훈

- **"옵션 켜면 됨"은 세어보기 전까지 추정**이다(§4). 코드가 맞아도 제품 가치가 0일 수 있다.
- 원본 제품(Zabbix)의 화면 구성은 **답안지**다. `Show: Recent/History` 토글이 이미 있었다는 건, 그 축이 필요하다는 걸 원본이 먼저 겪었다는 뜻이다.
- **같은 화면 안에서 축이 갈리면 반드시 드러난다** — 필터는 DB 그룹 7개, 요약 패널은 Zabbix 30개. 화면을 합치자 즉시 보였다.
- 성능은 **어디가 느린지 재고 나서** 고친다. "2000건이 많아서"가 아니라 "extend가 비싸서"였고, 건수는 15배 늘려도 0.3초였다.
- 조용한 절단은 버그다. 잘렸으면 잘렸다고 말하거나, 안 잘리게 만들어야 한다.
- 병행 세션이 같은 레포를 만지면 **내 i18n 키가 남의 커밋에 실려 간다**(실제로 그렇게 됐다). 공유 파일은 헝크 선택 스테이징, 커밋 직후 생존 확인.
