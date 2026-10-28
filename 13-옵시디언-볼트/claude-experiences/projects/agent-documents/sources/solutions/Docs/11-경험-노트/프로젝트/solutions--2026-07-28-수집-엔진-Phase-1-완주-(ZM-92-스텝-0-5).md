---
tags: [moveseye, architecture, multi-datasource, strangler, ports-adapters]
updated: 2026-07-29
---

# 2026-07-23~28 — 수집 엔진 Phase 1 완주 (ZM-92, 스텝 0~5)

[[projects/moveseye/2026-07-22-collector-engine-decision|2026-07-22-collector-engine-decision]]에서 확정한 포트화를 **6일 만에 스텝 0~5까지 완주**했다. Zabbix 단일 소스 가정이 도메인 서비스에서 사라졌고, `app`은 이제 Zabbix 구현을 **컴파일할 수조차 없다**. 스텝 6(Prometheus 실검증)은 사용자 결정으로 보류.

## 결과 구조

| 모듈 | 내용 |
|---|---|
| `engine-api/engine/` | 소스 중립 계약 — `MetricPort` · `InventoryPort` · `AlertPort` + 정규화 모델 |
| `engine-api/zabbix/` | 🟠 Zabbix **전용** 계약 48개(인터페이스 14 + model 31 + spi 3). 추상화 없음 — C군(관리 CRUD)·D군(아이덴티티)의 집 |
| `engine-zabbix` | 구현 28개(Adapter·client·session·metric catalog) |
| `app` | 서비스·REST·JPA. engine-zabbix는 `runtimeOnly` → **컴파일 의존 차단** |

`git log`에서 스텝 하나 = 커밋 하나(총 25+ 커밋). 설계서 `_workspace/devdesign_collector-engine.md`(150KB)가 스텝별 완료 기록·판정 근거를 전부 보유.

## 이 전환을 굴러가게 한 것 — 런타임 동등성 채집

Phase 1의 기준은 **REST 응답 불변(§D7)**. 그래서 매 스텝마다 전환 전/후로 실 API를 긁어 JSON diff를 떴다(`_workspace/_4x_collect.mjs` / `_diff.py`). 이게 정적 검사·단위 테스트가 못 잡는 것을 반복해서 잡아냈다:

- 🔴 **폴백 체인이 응답을 바꾼 첫 사례**(4c-4g): 원본은 메모리 키가 없으면 다른 키로 폴백했는데, 포트 경유 후 `memoryUsage 0 → 11`로 값이 변했다. §D7을 지켜 **폴백 없는 `MEMORY:size.pused`를 신설**해 원본 거동을 복원.
- 🔴 **Zabbix 정렬은 대소문자 구분 코드포인트 순** — 우리 쪽 정렬로 바꾸면 순서가 조용히 달라진다. 런타임 비교로만 드러났다.
- 🔴 **DB에 쓰는 값도 §D7의 대상**(4c-4i): `event_problems`의 `"0"` 문자열 표기를 정규화했더니 저장 값이 달라졌다. 응답만 보면 놓친다.
- 중첩 삼항의 `int`/`Integer` 언박싱 NPE, `Map.of()`의 `get(null)` NPE — 둘 다 컴파일·테스트를 통과하고 런타임에서만 터졌다.
- `trigger.get`의 `time_from`은 Zabbix가 **무시한다**(실측).

최종 570 테스트 green, 런타임 19개 응답 그룹 identical.

## 판단이 갈렸던 지점 (ADR)

- **D9 — 자산 동기화는 추상화 제외**: Zabbix 미러링이므로 포트 뒤로 넣지 않는다. 단 "통째로 싣지 말라"는 뜻이지 **필드 단위 금지는 아니다** — `osName`은 중립 모델에 넣었다(4c-4f).
- **D10 — 포트의 쓰기 계약**: 명령은 서술적, 대상은 **식별자만**(필터로 대상을 고르게 하지 않는다). 첫 쓰기 `AlertAckCommand`에서 확립.
- **D11 — 중립/전용 경계는 "값이 답하는 질문"으로 가른다**: 트리거 상세는 Zabbix 전용이지만 "조치 가능한가"는 중립. 이 기준으로 `manual_close`를 스텝 5에서 되찾았다.
- **D8을 스스로 뒤집음**(스텝 5): 예외 커널을 engine-zabbix에 두기로 했었는데, 그러면 app 30여 파일이 그걸 참조해 **차단 자체가 불가능**했다. `engine-api`에 `spring-web`을 추가(enum 하나)해 계약 변화 0으로 해결. **원칙이 목표를 막으면 원칙의 비용을 재본다.**

## 스텝 5의 두 교훈

- 🟢 **패키지명을 유지하고 모듈만 옮기면 이동은 공짜**다. `com.dmove.moveseye.zabbix.*`를 그대로 둔 채 48파일을 옮겼더니 git이 전부 `rename (100%)`로 인식하고 app은 한 줄도 안 바뀌었다. "어디에 두느냐"와 "뭐라 부르느냐"는 다른 결정이다.
- ✅ **차단은 컴파일 성공이 아니라 "의도한 것이 깨지는지"로 증명한다.** `runtimeOnly`로 내린 뒤 app이 무수정 컴파일된 것에 더해, engine-zabbix 타입을 쓰는 프로브 클래스를 넣어 빌드가 `package does not exist`로 깨지는 것까지 확인하고 제거했다.

## ⏸ 스텝 6 재개 지점 (Prometheus)

설계서 `### ⏸ 스텝 6 착수 가이드`에서 시작. 요점:

- 이 스텝의 목적은 "연결"이 아니라 **"정규화 모델이 Zabbix에 오염됐는지 검증"**. 계약이 깨지면 실패가 아니라 발견이고, 그때 Zabbix 어댑터도 같이 고친다.
- 세 덩어리로 쪼개되 **①어댑터부터**: ① Prometheus 어댑터 → ② 레지스트리 DB화·`/datasources` → ③ FE 소스 선택 UI(Phase 1 내내 FE 무변경이었으므로 여기서 첫 FE 작업).
- 난이도 전망: `MetricPort` 🟢 / `AlertPort` 🟡(Alertmanager는 다른 API, ack↔silence 개념 차) / **`InventoryPort` 🔴 최대 위험**(Prometheus엔 호스트 인벤토리 개념이 없다).
- 선결: proto enum `SYSTEM` 중복(`MetricDomain`=8 vs `CallerRole`=1) — proto3 enum은 패키지 스코프라 codegen 충돌.

관련: [[projects/moveseye/2026-07-22-collector-engine-decision|2026-07-22-collector-engine-decision]], [[projects/moveseye/2026-07-28-be-package-restructure|2026-07-28-be-package-restructure]], [[topics/backend/strangler-port-migration|strangler-port-migration]], [[topics/zabbix/zabbix-api-quirks|zabbix-api-quirks]]
