---
type: project
tags: [moveseye, zabbix, web-scenario, httptest, premium, license, codex, zm-175]
created: 2026-10-27
updated: 2026-10-28
status: done
---

# 2026-10-27 — ZM-175 Zabbix Web 시나리오 관리(유료 WEB_SCENARIO), APM 합성 감시와 분리

- 프로젝트: [[moveseye]] · 기능 지도 [[Zabbix-구성-관리]] · 래핑 범위 [[2026-08-19-zabbix-wrapping-and-event-alert]]
- 상태: **푸시 완료** BE `21358d8` · FE `edf667c` · 발급기 `44bb3e0` · AI 화면 카탈로그 `f9aa53d`(64화면). 런타임 실측 통과(10-27).
- 정본: 계약 [contract_web-scenario](file:///C:/solutions/_workspace/features/zabbix-config/web-scenario/contract_web-scenario.md)
- 같은 날 별건: 요청 걸림 장부 IT 간헐 실패 수정 `c1ebf58`(#ZM-122) — 테스트 컨텍스트 여럿이 같은 IT DB를 보며 다른 컨텍스트의 1초 감시기가 테스트가 연 STUCK 이벤트를 닫아 버림 → IT 프로필에서 감시기 주기 실행만 끔.

## 결정 (사용자)
- **APM은 나중에 별도 제품으로 뺀다** → Web 시나리오는 APM 합성 감시(`/apm/synthetics`)와 코드를 나누지 않고 **Zabbix가 주는 것만** 보여 주는 별도 화면. `zabbixadmin/`에 두고 `premium.apm..` import 금지.
- **유료** — 새 Feature `WEB_SCENARIO`(PREMIUM 기본 포함). 🔴 BE·발급기 `Feature`/`Edition` 동일 사본(`LicenseContractTest`가 잡는다). 구버전 제품은 모르는 기능을 무시하므로 키 재발급 불필요.
- 이슈는 래핑 티켓(ZM-93)과 분리해 **ZM-175**(사용자 지정).
- 대상 필터는 선택 상자 **하나**(호스트·템플릿·그룹 묶음) — 공용 `DmoveTableFilter`의 Select가 `defaultValue`라 URL만 지우면 지운 필터가 화면에 남았다.

## 핵심 규칙
| 항목 | 규칙 | 이유 |
|---|---|---|
| 단계 id | 수정 때 `httpstepid` 유지, 빠지면 이름으로 되붙이고 짝 없으면 `is_new` 필수 | id를 빼면 Zabbix가 단계를 지우고 새로 만들어 응답 시간 이력이 **오류 없이** 끊긴다 |
| 비밀값 | 상세에 비밀번호 없음(`…Set`만), 비우면 유지·`clear_*` | ZM-100 규약 |
| 변경 이력 | 값 미기록 — 이름·스칼라만, 프록시 `user:pass@`·URL 쿼리 가림, 소속은 `hostid` 키 | 이력은 시나리오 삭제 뒤에도 남는다 |
| 최근 결과 | `web.test.fail`(실패 단계 **번호**, 불리언 아님)·`web.test.error`, 키 인용은 Zabbix `quoteItemKeyParam`과 같게 | 정확한 키로만 찾는다 |
| 폼 채움 | 열 때 한 번만 | 상세 재조회가 편집 중 값을 덮던 반려 |

## 검수 경과
BE 반려 → 조건부 승인. FE 반려 → 반려(2회 연속, "같은 기능 2회 연속 반려면 멈추고 묻기" 규칙(메모리 `review-loop-stop-rule`)으로 사용자에게 물음 → 선택 상자 하나로 결정) → 승인.

## 실측 (dev Zabbix 7.0.6)
호스트 시나리오 22건(OK 1·FAIL 13·UNKNOWN 8), 생성·수정·단계 id 유지·거부 코드·템플릿·이력 비밀값 0건·정리. ⚠️ zabbix-server 호스트의 시나리오는 결과가 안 들어옴(기존 8건도 UNKNOWN — 환경 쪽).

## 교훈
- "APM을 떼어 낼 수 있게"는 **코드 공유 금지**로 번역해야 지켜진다 — 같은 httptest를 두 화면이 쓰더라도.
- 공용 필터 컴포넌트가 비제어(`defaultValue`)면 URL만 지워서는 화면이 안 지워진다 — 필터 여러 개를 배타로 만들 때 함정.
