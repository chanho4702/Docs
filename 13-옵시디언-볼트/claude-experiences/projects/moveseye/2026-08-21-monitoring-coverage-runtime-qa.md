---
tags: [moveseye, qa, monitoring-coverage, zabbix, ai]
updated: 2026-08-21
---

# 모니터링 커버리지 런타임 QA

[[2026-08-21-monitoring-coverage-api]]의 Spring API와 AI 분석 전환을 실제 서버에서 검증했다.

- 비인증 요청은 `401 INVALID_TOKEN`, admin 로그인은 HttpOnly cookie 발급으로 정상이었다.
- `GET /hosts/manage/coverage`는 인증 후에도 `HTTP 200 + body code:400, HOST_NOT_FOUND`로 실패했다. FE는 이 실패를 오류 상태로 보여 주므로 커버리지 화면의 핵심 KPI와 목록이 표시되지 않는다.
- 같은 사용자 세션에서 moveseye-ai의 `check_monitoring_coverage`는 `examined:74`, `disabledSkipped:2` 및 사각지대 결과를 반환했다. Zabbix 데이터 부재가 아니라 Spring API 경로의 결함으로 분리해 조사해야 한다.
- AI 분석 전환은 실제 SSE에서 route `/zabbix-management/monitoring-coverage`와 tool 실행을 확인했다.

교훈: AI tool과 일반 API를 같은 진단 기준으로 승격할 때는 계약·단위 테스트뿐 아니라 **동일 세션의 실 Zabbix 호출 결과 비교**가 필요하다. `HTTP 200`만으로 성공으로 간주하지 말고 ApiResult envelope의 `status/code`까지 검증한다.

상세 증거: `C:\solutions\_workspace\e2e_monitoring-coverage.md`.
