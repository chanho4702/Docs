---
tags: [zabbix, api, json-rpc, gotchas]
updated: 2026-08-07
---

# Zabbix JSON-RPC 실전 함정 모음

[[projects/moveseye/zabbix-api-reference|zabbix-api-reference]]가 "무슨 메서드가 있나"라면, 이 노트는 **문서에 없거나 문서와 다르게 동작해서 실제로 당한 것들**이다. 전부 moveseye 개발 중 실측으로 확인.

## 쓰기(write)

- **`host.update`의 `tags`는 전체 교체**다. 태그 하나를 추가하려고 그것만 보내면 나머지가 증발한다 → 읽고→합쳐서→쓰는 round-trip 필수.
- **link/unlink는 전부 host-side로** — `host.massadd`/`host.massremove`를 쓴다. `template.massadd`/`template.massremove`는 거부하거나 200 no-op(성공처럼 보이는데 아무 일도 안 일어남).
- **`trigger.create`는 `hostid`를 받지 않는다** — expression의 `/host/key`가 대상 지정이다. 다른 create들과 모양이 달라서 헷갈린다.
- **부분 수정에서 clearable 필드는 빈 문자열이 "클리어"** — 값을 안 보낸 것과 빈 문자열을 보낸 것을 구분해서 payload를 만들어야 한다(`putIfProvided` 패턴).
- **좌표 등 수치 인벤토리는 지수 표기로 보내지 말 것** — `BigDecimal.toPlainString()`. `inventory_mode`가 disabled(-1)면 manual(0)로 올려야 수동 값이 저장된다.

## 읽기(read)

- 🔴 **offset이 없다.** `limit`은 있지만 skip이 없어 임의 페이지네이션이 안 되는 것처럼 보인다 → **ID-슬라이스 페이징**: ID만 먼저 조회 → 애플리케이션에서 슬라이스 → 그 페이지의 ID만 하이드레이트. 페이지당 0.4~1.3초로 전체 페이징이 성립한다. (`limit`으로 상한을 두는 것은 페이지네이션이 아니라 그냥 상한이다 — 혼동 금지)
- **`user.get`의 `selectRole` 결과는 호출자 권한/대상 사용자에 따라 `role` 객체 대신 빈 배열 `[]`이 올 수 있다.** DTO를 `Map`으로 고정하면 사용자 목록 전체 역직렬화가 실패한다. 역할이 불필요한 호출은 `selectRole` 자체를 보내지 말고, 필요한 호출은 객체/빈 배열을 모두 수용해 빈 배열을 `null`로 정규화한다. (2026-08-07 `event_sync` 장애)
- 🔴 **정렬은 대소문자를 구분하는 코드포인트 순**이다. 애플리케이션에서 대소문자 무시 정렬로 바꾸면 화면 순서가 조용히 달라진다.
- **`trigger.get`의 `time_from`은 무시된다**(실측). 시간 필터를 걸었다고 믿으면 결과가 어긋난다.
- `history.get`은 history 타입 기본값(3=uint)이라 float 아이템을 조회하면 **빈 결과**가 온다. → [[projects/moveseye/zabbix-api-reference|zabbix-api-reference]]
- **불리언스러운 값이 문자열 `"0"`/`"1"`로 온다** — 억제/원인/복구 플래그 등. 정규화해서 저장하면 기존 표기와 달라지므로, 응답뿐 아니라 **DB에 쓰는 값도 기존 표기를 지켜야** 회귀가 안 난다.
- **아이템 키 폴백 체인은 값을 바꾼다** — "A 키가 없으면 B 키로" 식 폴백은 편해 보이지만 화면 숫자가 달라진다(memoryUsage 0→11 사례). 의미가 다른 키면 폴백 대신 **폴백 없는 전용 키**를 쓰는 게 맞다.

## 에러 처리

- **`-32602`(Invalid params)는 create/update에서만 400으로 매핑**할 것. 조회 경로에서 같은 코드를 400으로 만들면 인증 실패(401) 경로와 섞여 오진한다.
- Zabbix가 **성공 응답으로 아무 일도 안 한 경우**가 있다(위 template massadd). 쓰기는 응답 코드가 아니라 **결과 재조회**로 검증할 것.
- **호스트 이름은 두 축이다 — 기술명(`host`)과 표시명(`name`).** `host.create`의 "Host with the same name … already exists"는 **기술명** 중복이고, 표시명 중복은 "same visible name"으로 따로 온다. 네트워크 디스커버리가 만든 호스트는 기술명이 IP(`10.220.0.82`)이고 표시명만 바뀐 경우가 흔해, 목록을 `search {name}`(표시명)으로만 검색하면 "없는 호스트"인데 등록은 거부되는 모순이 생긴다(2026-09-22 실사례). 검색은 `search {host, name}` + `searchByAny`, 등록 전엔 `host.get filter {host}`로 선검사. 🔴 `searchByAny`는 `filter`(status 등)까지 OR로 묶으므로 그 조건은 애플리케이션에서 거른다.
- **원문 오류를 "일반 실패" 문구로 덮지 말 것.** Zabbix 검증 오류(HTTP 200 + code 400 봉투)를 FE가 한 줄로 치환하면 사용자는 원인을 못 보고 같은 요청을 반복한다(위 사례 5회). 전용 코드가 있으면 필드 에러로, 없으면 원인 문장을 같이 보여준다.

## 개념

- `device_type` 같은 분류는 **host group이 아니라 host tag**로 두는 편이 유연했다(그룹은 권한·모니터링 축이라 의미가 겹친다).
- 트리거 expression DSL이 FE까지 노출되는 순간 추상화는 사실상 불가능해진다 — 관리 CRUD 계열은 소스 중립 계약에서 빼는 게 현실적. → [[topics/backend/strangler-port-migration|strangler-port-migration]]

관련: [[projects/moveseye/zabbix-api-reference|zabbix-api-reference]], [[topics/zabbix/zabbix-agent-item-keys|zabbix-agent-item-keys]], [[topics/zabbix/zabbix-api-auth|zabbix-api-auth]], [[projects/moveseye/2026-07-22-zabbix-usability-menus|2026-07-22-zabbix-usability-menus]], [[projects/moveseye/2026-07-28-collector-engine-phase1|2026-07-28-collector-engine-phase1]]
