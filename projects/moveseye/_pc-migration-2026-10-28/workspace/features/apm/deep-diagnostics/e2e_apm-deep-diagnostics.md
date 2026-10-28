# APM 심층 진단 런타임·E2E 검증

2026-10-28 · 담당: Codex functional-qa · 제품 코드 수정 없음. 독립 worktree와 본 작업 전용 실행 자원만 사용했다.

## 검증 환경

- BE: `C:/worktrees/apm-deep-be/build/libs/moveseye-be-0.0.1.jar`, SHA256 `81CB1F1CE00E1AF6C2B4D01ECA5EAAFF049F137FC1B59650D0D95894D6298515`.
- BE `127.0.0.1:3301`, FE `127.0.0.1:5271`(`strictPort`, `VITE_API_URL=http://127.0.0.1:3301`). Chromium은 설치된 Chrome을 headless로 띄우고 매 테스트 독립 context를 사용했다.
- PostgreSQL 컨테이너 `codex-apm-deep-pg-20261028`, 포트5435, **`apm_diag_dev`만 사용**. IT DB `moveseye_it` 및 공유 DB·서버에는 접근/변경하지 않았다.
- Redis6387. Zabbix는 실제 서버 대신 localhost13302 인증 전용 fixture를 사용했다. 지원하지 않는 동기화 RPC의 로그 오류는 APM 검증 경로와 구분했다.
- 일회성 공개키를 별도 `PropertiesLauncher` classpath에 넣은 로컬 테스트 라이선스를 `/settings/license`로 실제 등록했다. 제품 JAR/기본 공개키 변경 없음.
- 공유3000·5173·5433·5434·5436·4317·4318 및 타 worktree/OTel 프로세스 변경·종료 없음.

## 입력 경계와 대체 범위

1. `admin/<dev-pw>` 실제 로그인 → HttpOnly 쿠키 → 라이선스 등록 → `/apm/receive-tokens` 실제 발급 → `/apm/otlp/v1/traces`, `/apm/otlp/v1/metrics` HTTP 수신 → 독립 DB → 진단 API → 실제 FE DOM을 검증했다. 가짜 화면/API 응답은 사용하지 않았다.
2. 합성 OTLP fixture는 complete/missing/zero/partial/multi/restart 요청과 instance A/B 메트릭을 만든다. `apm_service` 기본 AUTO 등록을 사용해 승인대기 목록은 비어 있었다. **서비스/trace/metric을 DB에 직접 seed하지 않았다.**
3. 권한 거부 계정만 `runtime/permission_fixture.sql`로 독립 DB에 넣었다. 사용자/역할 생성 기능은 이 검증 범위에서 대체했으며, 생성 후 로그인·권한 판정·FE 라우트는 실제 제품 경로를 통과했다.
4. 실제 OTel R0 산출물 `C:/worktrees/apm-deep-otel/build/diagnostics-r0/on-active-20261028-153754/{traces,metrics}.jsonl`을 읽어 전용 토큰으로 replay했다. **원래 timestamp/traceId/spanId/resource를 변경하지 않았다.** traces5배치·metrics40배치이며 원본 SHA256은 `runtime/otel-r0-replay-evidence.json`에 보존했다. 실행 중 Collector를 변경한 것은 아니므로, live Collector→이번 BE 연결을 별도로 실증했다고 주장하지 않는다.

## 결과

| 흐름 | 기대 | 실제·증거 | 판정 |
|---|---|---|---|
| 무인증/visitor | 보호 API 차단 | 무인증 HTTP401, 쿠키만 있고 visitor 없는 요청 거부. `runtime/api-assertions.json` | PASS |
| 실제 로그인·라이선스 | 미등록 차단 후 등록 즉시 허용 | 로그인200, 미등록 HTTP200/body403 `LICENSE_REQUIRED`, 등록 후 capabilities200/queryEnabled=true. `runtime/api-setup-evidence.json` | PASS |
| 실제 수신→저장→진단 | 정형 진단과 일반 span 분리 | 수신 HTTP200, 진단1회·union400ms·SQL200ms/HTTP300ms. 일반 상세 UI 3 / 5 stored. `runtime/diagnostics-responses-final.json` | PASS |
| summary 미수신≠0 | null을 0으로 표시하지 않음 | API attempts/union=null, NOT_RECEIVED/SUMMARY_MISSING; DOM `-`. 유효0회는 AVAILABLE·0ms. `runtime/api-assertions.json`, `runtime/browser-e2e-evidence.json` | PASS |
| partial | 사유·하한 독립 표시 | attempts19, 수신1/예정16, BELOW_THRESHOLD·DETAIL_LIMIT·TRANSPORT_GAP·UNFINISHED_OPERATION, union400ms lowerBound=true; DOM 하한 안내 | PASS |
| GC 0/미관측 | 0과 null gap 구분 | 최종 JAR에서 GC histogram count0/sum0 → gcDurationMs=0, 인접 미수신 bucket=null. `runtime/api-assertions.json` | PASS |
| 인스턴스·재시작 | instance 분리, process 추정 금지 | A=42%, B=99% 입력에서 A만42%. 다른 runId 요청도 processScope=UNVERIFIED, DOM 재시작 분리 불가 안내 | PASS |
| 다중 SERVER | 자동 오선택 없이 명시 선택 | selectionRequired=true/후보2. 선택 후 후보 유지, 다른 SERVER 전환·reload·browser back 시 URL diagnosticSpan/attempts 복원 | PASS |
| SQL/HTTP 워터폴 | 선택한 실제 일반 span으로 이동 | HTTP444…/SQL333… `tab=waterfall&span=...`, 뒤로가기 진단 복귀. `runtime/browser-e2e-evidence.json` | PASS |
| HTTP200 오류 envelope | 성공/빈 화면으로 오인하지 않음 | 잘못된 SERVER → APM_DIAG_INVALID_TARGET, DOM 대상 재선택 안내와 reset 버튼 | PASS |
| apm.view 없음 | 권한 거부 | 두 API HTTP200/body403 FORBIDDEN. 실제 일반 사용자 로그인 후 FE `/errors/404`로 차단 | PASS |
| 실제 OTel 생산자 자료 | summary 카운터 보존 | 12 SERVER 전부 attempts 일치: normal0, fast3, overload1, slow40, error1, timeout2, async2, unfinished2 등. `runtime/otel-r0-replay-evidence.json` | PASS |
| 실제 OTel 자료→화면 | 실제 생산자 수치 표시 | slow 요청40회, Partial data, 실제 instance/runId 표시. `runtime/otel-r0-dom.txt` | PASS |
| query OFF | 기능 안내와 권한 오류 분리 | 실제 BE queryEnabled=false 재기동 후 열린 화면 Retry → 비활성화 안내(권한 오류 없음). API capabilities=false, 진단 APM_DIAG_DISABLED. reload 시 Diagnostics 숨김/Waterfall 선택. `runtime/off-permission-evidence.json`, `runtime/query-off-dom.txt` | PASS |

API 행위 assertion17개, 브라우저 주 흐름10개, 실제 OTel 요청12개, 권한·실제 OTel DOM·OFF 추가 흐름5개가 모두 PASS다. 브라우저 주 흐름 `pageerror` 0개. 스크린샷을 남기지 않고 실제 HTTP 본문·DOM 텍스트·assertion 결과를 보존했다. DB 실물 조회는 `runtime/db-evidence.txt`에 보존했다. 이번 E2E에서 재현한 미해결 제품 결함은 없다.

## 재현

```powershell
# 전용 컨테이너/테스트 라이선스가 준비된 로컬 환경에서만 실행
powershell -NoProfile -File .\run_be_isolated.ps1
powershell -NoProfile -File .\runtime\run_fe_isolated.ps1
python .\runtime\api_setup.py
python .\runtime\ingest_fixture.py
python .\runtime\validate_api.py
python .\runtime\browser_e2e.py
python .\runtime\replay_otel_r0.py
```

`browser_off_permissions.py`는 3301 listener PID를 읽은 뒤 전용 worktree JAR 명령줄·3301 소유를 `restart_owned_be.ps1`에서 다시 검사하고 query OFF로 재기동하는 이번 실행 전용 스크립트다. 초기 ready 상태도 HTTP401로 폴링한다. 전체 java/node 종료나 `gradlew --stop`은 사용하지 않는다. `cleanup_owned_servers.ps1`은 종료 전 BE·FE의 명령줄과 launcher 부모까지 검사한다.

## 시행착오와 한계

- 처음 synthetic partial summary는 retained2+detailDropped1이라 생산자 계약(상세 생략 시 retained16)에 맞지 않았다. fixture를 retained16으로 수정한 뒤 새 traceId로 수신하고 동일 검증을 통과했다. 제품 결함으로 판정하지 않았다.
- 최초 API cookie는 시간이 지나 만료되어401을 반환했다. 최종 assertion은 실제 재로그인 후 실행했다. 브라우저도 독립 context에서 실제 로그인한다.
- Playwright의 readonly Ant Select 내부 input은 선택 label에 가려지므로 실제 클릭 영역인 `.ant-select-selector`를 사용했다. null 표시 기호는 제품의 `-`로 확인 후 assertion을 맞췄다. 제품 변경은 하지 않았다.
- Windows에서 Python `subprocess.run(capture_output=True)` 안에 background `Start-Process`를 두면 자식이 pipe 핸들을 유지해 TimeoutExpired 뒤에도 대기했다. 재기동 런처의 출력을 파일로 직접 redirect하고 stdin을 DEVNULL로 바꿨다. 추가로 서버 ready 폴링을 넣은 뒤 OFF 흐름을 재실행해 전부 통과했다. 이 실패는 검증 런처 문제이며 제품 실패로 세지 않았다.
- 보존 만료·archive-only·동시성 BUSY·수집량 상한·서비스100개 이상의 부하·장시간 안정성은 이 E2E에서 실측하지 않았다. 별도 단위/IT·OTel R0 보고서의 범위와 구분한다.
- 실제 고객 Zabbix 연결, live Collector→본 BE 지속 전송, 운영 부하/HA/배포 환경 검증은 미실행이다.

## 프로세스 정리

최초 BE20016(launcher40100)은 명령줄·3301 소유 확인 후 종료. 최종 JAR BE31444(launcher54156)는 127.0.0.1 bind와 기동 완료 로그를 확인했다. OFF 시험/런처 수정에 사용한 BE27064→37852→24600도 모두 같은 JAR·3301 전용이며 각 종료 전 신원을 검사했다. 최종 BE24600(launcher55664), FE13720(launcher39052)을 종료하고 **3301·5271 listener 없음**을 확인했다. 종료 명령줄·시각은 `runtime/processes.json`, 이전 재기동은 `runtime/stopped-be-*.json`에 보존했다. 브라우저는 각 스크립트 finally에서 close했다. root 생성 Zabbix fixture52100·PG/Redis 컨테이너는 건드리지 않고 root에 정리 이관했다.
