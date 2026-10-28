---
type: project
tags: [moveseye, zabbix, proxy, proxygroup, tls, psk, codex, wrapper]
created: 2026-10-28
updated: 2026-10-28
status: active
---

# 2026-10-28 — Zabbix 프록시·프록시 그룹 관리(기본 기능)

- 프로젝트: [[moveseye]] · 기능 지도 [[Zabbix-운영-관리]] · 래핑 공백 목록에서 남은 것(Proxy CRUD → SLA·인증·API 토큰·General)
- 상태: **구현·검수 진행 중, 미커밋** — 워크트리 BE `C:\worktrees\zbx-proxy-be` · FE `C:\worktrees\zbx-proxy-fe`(브랜치 `zabbix-proxy`). 티켓 번호 미정. BE 검수 2차 승인 · FE 1차 반려 반영 완료, 2차 검수는 메모리 부족으로 중단돼 재실행 대기 · 런타임 실측 대기(BE를 작업 브랜치로 재기동해야 함, 스크립트 준비됨).
- 정본: 계약 [contract_proxy](../agent-documents/sources/solutions/_workspace/features/zabbix-config/proxy/solutions--contract_proxy.md)(§0 실측표) · 검수 [review_proxy-be](../agent-documents/sources/solutions/_workspace/features/zabbix-config/proxy/solutions--review_proxy-be.md) · [review_proxy-fe](../agent-documents/sources/solutions/_workspace/features/zabbix-config/proxy/solutions--review_proxy-fe.md)

## 결정 (사용자)
- **기본 기능**(라이선스 게이트 없음 — 호스트·매크로·점검 기간과 같은 급).
- **프록시 + 프록시 그룹**(Zabbix 7.0 신설) 둘 다.
- **감시 호스트 배정은 보기만** — 배정은 호스트 관리의 `monitored_by`. 상세에 직접 배정·그룹 경유 호스트·디스커버리 규칙을 읽기 전용으로.

## 만든 것
- 엔진: `ZabbixProxyService`에 getRaw·create·update·delete, `ZabbixProxyGroupService`·`ZabbixSettingsService`(settings.get 읽기) 신규, `ZabbixHostService.countRaw`, `ZabbixMethod` 8개 + 조사표 json(공식 문서 확인).
- 앱: `/zabbix-manage/proxies`(목록·옵션·상세·생성·수정·삭제), `/zabbix-manage/proxy-groups`. 변경 이력 `PROXY`·`PROXY_GROUP`(PSK는 `***`). 테스트 30건.
- FE: `/zabbix-management/proxy-management`(프록시 / 프록시 그룹 탭, 화면 거름 필터), 편집 패널 4탭(기본·암호화·타임아웃·사용처). 테스트 20건.

## Zabbix 7.0.6 실측 함정 (시험 프록시로 직접 JSON-RPC)
| 항목 | 동작 |
|---|---|
| PSK | `tls_psk_identity`·`tls_psk`는 **쓰기 전용**(get output에 넣으면 -32602) |
| PSK 유지 | 결과 TLS가 계속 PSK면 유지 — **모드를 바꿔도** 한 요청에서 새 모드의 PSK를 켜면 유지. 결과에서 PSK가 빠지면 **Zabbix가 지운다** |
| 모드별 TLS | 액티브는 `tls_connect=1`만, 패시브는 `tls_accept=1`만. 새 모드의 TLS를 안 보내면 "없음" |
| 인증서 | 인증서를 안 쓰는데 issuer·subject가 비어 있지 않으면 거부, 안 보내면 Zabbix가 비움 |
| 타임아웃 | `custom_timeouts=1`이면 10개 **전부** 필수(1~600초) |
| 그룹 | 소속이면 `local_address` 필수, `proxygroup.create`에 `proxies` 인자 없음, 프록시·배정 호스트가 있으면 삭제 거부 |
| 삭제 | 직접 감시 호스트·디스커버리 규칙·액션의 프록시 조건(conditiontype 20)이 있으면 거부 |

🔴 dev Zabbix의 `ZabbixProxyDemo`(proxyid 1)는 호스트 수십 대를 실제로 감시 중 — 시험 객체만 만들고 지운다.

## 검수 경과 (Codex gpt-6.1-sol high)
- **BE 1차 반려**: 🔴 암호화를 쓰던 프록시의 모드만 바꾸면 "없음"으로 저장돼 **암호화가 조용히 꺼짐** · 🔴 인증서를 끌 때 issuer가 남으면 저장 실패 · custom_timeouts 2가 0으로 바뀜 · 삭제 사전 검사에 액션 조건 누락 · 수정에서 보낸 빈 값을 조용히 "유지". → `PROXY_TLS_REQUIRED` 신설 등 전부 반영 → **2차 승인**.
- 🔴 1차에서 Codex가 **내 실측 해석의 오류**를 공식 Zabbix 소스로 잡았다: 나는 "모드를 바꾸면 PSK 삭제"라고 계약에 적었지만, 실제로는 "결과에서 PSK가 빠지면 삭제"였다(내 실측은 모드만 보내 결과가 "없음"이 된 경우였다). 재실측으로 확인하고 정정.
- **FE 1차 반려**: 🔴 다시 열 때 1분 캐시로 채우고 최신 상세를 무시 → 옛 암호화로 되돌려 저장 가능 · 🔴 생성 화면에 이전 PSK·설명이 남음(폼 인스턴스는 닫아도 산다) · 수정에서 비운 포트가 빠짐 · 모드 왕복 시 다중 선택 손실. → 상세 `staleTime 0`+받는 중 채움·저장 금지, 채우기 전 항상 `resetFields`, 수정은 빈 값 그대로, 모드별 마지막 선택 기억. 2차 검수 대기.

## 교훈
- **실측 한 번을 "규칙"으로 일반화하지 말 것** — 어떤 입력으로 그 결과가 나왔는지(모드만 보냈다)를 함께 적어야 해석이 틀리지 않는다.
- "비우면 유지"는 화면·BE 양쪽에서 **생성과 수정을 다르게** 직렬화해야 한다(생성은 생략=기본값, 수정은 빈 값 전달=거부).
- "열 때 한 번만 채운다"는 규칙은 **무엇으로 채우는가**(옛 캐시 vs 이번에 받은 값)와 짝이다 — Web 시나리오 교훈의 반쪽만 옮기면 새 결함이 된다.
