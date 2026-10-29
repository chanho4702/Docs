---
name: apm-install-paths
description: "설치 가이드 경로 입력(installDir·configDir·queueDir·agentDir → BE가 명령 재조립, 계약 §8.10) + 카드 접기(출처 기본 접힘) — 09-15 BE·FE 미커밋(ZM-122). BE :3000 재기동 절차는 _tools/run_be_3000_dev.ps1"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-15T02:45:29.683Z
---

2026-09-15 사용자 요청 — "설치 경로 입력하면 명령이 바뀌게" + "카드 접고 펼치기, 출처는 접힌 채". BE `e7aae83`·FE `99394f5` #ZM-122 커밋(미푸시).

**How to apply:**
- BE `ApmInstallPaths`(record) 한 벌이 정본: `defaults(os, props)`·`resolve(os, props, 4개)`·파생 `binPath/configPath/agentJar`. 가이드 서비스는 상수 대신 `paths.*`를 쓴다(상수는 `ApmInstallPaths.DEFAULT_*`를 가리키는 별칭으로 남김). `GET /apm/install-guide?installDir&configDir&queueDir&agentDir`, 응답 `paths`(실효값). 검증: 유닉스 공백 불가(따옴표 없이 명령에 박힘)·윈도우는 공백 가능(전부 큰따옴표)·`..`·상대경로 400.
- 🔴 FE는 문자열 치환으로 흉내 내지 않는다 — systemd ExecStart·plist·New-Service까지 파생 경로가 있어 놓친다. FE는 로컬 상태 + 500ms 디바운스로 재조회(URL에 안 실음: 타이핑마다 navigate → 리마운트), OS 바뀌면 경로 초기화, `queueDir` 바꾸면 설정 재생성 폼에도 같은 값 안내.
- 카드 접기: `CollapsibleCard`(본문 DOM 유지·display:none, 상태 `dmove:apm-install:open` localStorage), 출처만 기본 접힘. 목차 클릭은 접힌 카드를 먼저 편다. 테스트는 describe beforeEach에서 `localStorage.clear()` 필수.
- 🔴 BE :3000 재기동은 `_tools/run_be_3000_dev.ps1`(moveseye-be-spring/.env 로드·JDK17·dev 프로필·bootRun -x test)을 `Start-Process`로. 기존 프로세스는 java.exe 중 CommandLine에 `bootRun` 또는 `spring.profiles.active=dev`가 있는 것 둘(gradlew 래퍼+앱)을 죽인다. 로그는 scratchpad `be3000.log`. 기동 후 재로그인 필요(쿠키 만료).
- 실측(재기동 후): macOS 가이드 7단계·경로 치환·잘못된 경로 400·config-defaults.processors 7/3/8·collector-config 프로세서 옵션 yaml(경고 헤더 `raw-sql, masking-reduced`) 전부 확인. 관련 [[apm-collector-config-processors]] · [[apm-install-macos]].

**문구 정리(09-15 추가, 같은 커밋 e7aae83):** 사용자 지적 "우리가 검증한 버전은 2.31.1입니다(R1 실측) 이런 거 있으면 안 될 것" + "AI스러운 문구 빼라". 고객이 읽는 문자열(가이드 note·notice·env 설명·생성 yaml 헤더·템플릿 주석)에서 `(R1 실측)`·`(R1 §2.3)`·`(설계 §3.1)`·`(실측)`·`_workspace/…` 경로·`<b>구제</b>`(React가 태그를 그대로 찍음)·"tail 샘플링/loadbalancing exporter 2계층/시맨틱 규약/정본/별칭은 구제" 같은 내부 용어를 걷어냈다. 🔴 Swagger `@Schema` 설명은 개발자용이라 손대지 않음. 🔴 새 문구를 쓸 때 규칙: 내부 검수 번호·설계서 절 번호·실측 표식·HTML 태그 금지, 관리자가 아는 말(옛 이름·임시 호환·구간 증분)로. 테스트 2건의 기대 문구(`/apm/ingest/recent`→`수신 확인`, `tail 샘플링`→`샘플링`)도 같이 바꿈.

**APM 차트 카드 높이 정렬(09-15, 미커밋):** 사용자 "차트 높이 들쭉날쭉, 좌우는 맞아야". 원인은 카드가 Col을 안 채움(빈 상태 85px vs 알림 237px vs 도넛 291px). 해결: `DashboardLayout contentClassName="apm-pages"`(APM 라우트만) + `shared/apm-pages.scss`(`.ant-row > .ant-col > .ant-card { height:100%; flex column }`, 본문 flex:1 — 본문을 flex로 바꾸지 않음) + `ApmChartCard`가 `.apm-chart-card__chart`(flex:1, minHeight=height, ECharts height 100%)·각주 `margin-top:auto`. 실측 개요 [291,291]·[237,237,237]·[240,240,240], 서비스 상세 쌍 전부 일치. 🔴 다른 구역(자산 등)엔 적용 안 됨 — 필요하면 라우트에 같은 클래스.

**표 열 균일화·메서드 필터(09-15 추가, 미커밋):** APM 서비스 목록 표(10열)·서비스 상세 트랜잭션 표(7열)도 수신 토큰 표와 같은 규칙(폭 전부 제거 + `tableLayout="fixed"` + `scroll={{x:"100%"}}` + 새 `tableId`). 트랜잭션 표에 메서드 필터 `Select`(선택지 = `useApmMethods` 관측 메서드 + URL값) — URL 키 `httpMethod`(선택 엔드포인트의 `method` 키와 별개, 같은 키면 시계열 대상까지 바뀜). BE `GET /apm/services/{uid}/endpoints?method=` 가산(인메모리 필터, q와 AND, otherRoutes는 필터 전 집계; 7인자 오버로드 유지). MVC 테스트 mock은 `endpoints(...)` 인자 8개로.
