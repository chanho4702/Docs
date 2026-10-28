# 모니터링 커버리지 런타임 QA

검증일: 2026-08-21 (KST)  
대상: `GET /hosts/manage/coverage`, `/zabbix-management/monitoring-coverage`, AI 분석 전환

## 실행 환경

- Spring BE: `http://localhost:3000` 실행 중 (PID 38720)
- FE Vite: `http://localhost:5173` 실행 중 (PID 28756)
- AI: `http://localhost:3100` 실행 중 (PID 25660)
- 테스트 계정: `admin` (`ADMIN`), visitor ID `qa-monitoring-coverage`

## 결과

| 흐름 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 비인증 API | 접근 거부 | HTTP 401, `{ "code": 401, "message": "INVALID_TOKEN" }` | 통과 |
| 관리자 로그인 | HttpOnly access/refresh cookie 발급 | HTTP 200, ADMIN 사용자 및 두 cookie 수신 | 통과 |
| 기본 커버리지 API | `ApiResult<MonitoringCoverageDto>` 성공 | HTTP 200이지만 body `{ "status":"error", "code":400, "errorCode":"HOST_NOT_FOUND" }` | 실패 |
| `includeDisabled=true` API | 비활성 Host 포함 진단 성공 | 기본 요청과 동일한 `HOST_NOT_FOUND` | 실패 |
| FE 라우트 | SPA 진입 가능 | `/sign-in`, `/zabbix-management/monitoring-coverage` 모두 HTTP 200 | 통과 |
| AI 새 대화 생성 | 새 conversation 생성 | `POST :3100/ai/conversations` HTTP 200 | 통과 |
| AI 분석 메시지 | coverage 문맥을 전달하고 진단 실행 | SSE HTTP 200, `route=/zabbix-management/monitoring-coverage`, `check_monitoring_coverage` 실행 | 통과 |

## 결함 — P1

### `GET /hosts/manage/coverage`가 실제 진단 결과를 반환하지 못함

재현:

```powershell
curl.exe -b _workspace/qa_monitoring_coverage.cookies `
  -H "x-visitor-id: qa-monitoring-coverage" `
  http://localhost:3000/hosts/manage/coverage
```

실제 응답:

```json
{"status":"error","code":400,"errorCode":"HOST_NOT_FOUND","message":"HOST_NOT_FOUND"}
```

동일 사용자 세션에서 AI 서버의 `check_monitoring_coverage`는 실제로 `examined: 74`, `disabledSkipped: 2`와 사각지대 Host 목록을 반환했다. 따라서 Zabbix 데이터/권한 자체의 부재가 아니라 Spring API 호출 경로의 문제로 보인다. 현재 FE 페이지는 해당 실패 envelope를 오류로 처리하므로 KPI·사각지대 목록이 전혀 표시되지 않는다.

관련 구현: `moveseye-be-spring/src/main/java/com/dmove/moveseye/host/coverage/MonitoringCoverageController.java`

## AI 분석 전환 검증

AI 메시지를 실제로 전송했다. SSE에서 다음을 확인했다.

```text
event: tool_call
data: {"name":"check_monitoring_coverage","input":{"groupId":null,"deep":false,"includeDisabled":false,"limit":200}}

event: tool_result
data: {"error":false,"elapsedMs":302,"preview":"{\"examined\":74,\"disabledSkipped\":2,...}"}
```

요청 body에는 화면 문맥 route인 `/zabbix-management/monitoring-coverage`가 포함됐다. 테스트로 만든 conversation은 완료 뒤 DELETE로 정리했다 (`deleted: true`).

## 제한 사항

- 이 환경에는 Playwright가 설치되어 있지 않고, 브라우저 제어 도구도 제공되지 않았다. 따라서 로그인 후 DOM에서 버튼 클릭과 URL 이동을 직접 조작하는 검증은 수행하지 못했다.
- 다만 FE 라우트의 HTTP 200, AI conversation 생성/실제 SSE 메시지 전송 및 route·tool 실행은 런타임으로 확인했다. UI 클릭 핸들러의 최종 DOM 검증은 브라우저 자동화가 가능한 환경에서 재실행이 필요하다.

## 증거 파일

- `_workspace/qa_coverage_unauth.json`
- `_workspace/qa_coverage_default.json`
- `_workspace/qa_coverage_disabled.json`
- `_workspace/qa_ai_stream.sse`
- `_workspace/qa_ai_conversation_detail.json`

## 재검증 — 2026-08-21 14:21 KST

Spring BE를 새 JVM(PID 44268)으로 재기동한 뒤, 새로운 admin 세션(`qa-monitoring-coverage-rerun`)에서 재검증했다. 위의 P1은 이전 JVM의 stale 상태였으며 **해결됨**으로 변경한다.

| 흐름 | 실제 | 판정 |
|---|---|---|
| 기본 coverage | HTTP 200 envelope `code:200`; `totalHosts:76`, `examinedHosts:74`, `disabledSkipped:2`, `findings:49`, `coverageScore:34` | 통과 |
| `includeDisabled=true` | HTTP 200 envelope `code:200`; `examinedHosts:76`, `disabledSkipped:0`, `findings:49`, `coverageScore:36` | 통과 |
| AI coverage tool | SSE HTTP 200에서 `check_monitoring_coverage`의 `tool_result error:false`, `examined:74`, `disabledSkipped:2` 확인 | 통과 |

AI 응답 스트림은 두 번째 tool 결과 이후 TCP reset으로 끝났고, 직후 AI :3100 프로세스가 더 이상 listen하지 않았다. coverage tool 실행과 결과 수신은 완료됐으나, 모델 최종 텍스트/done event 및 테스트 conversation 삭제는 AI 서버 중단으로 재확인하지 못했다. 이는 Spring coverage API 결함과는 별개인 AI 런타임 상태 문제다.

추가 증거:

- `_workspace/qa_coverage_rerun_default.json`
- `_workspace/qa_coverage_rerun_disabled.json`
- `_workspace/qa_ai_rerun_stream.sse`
