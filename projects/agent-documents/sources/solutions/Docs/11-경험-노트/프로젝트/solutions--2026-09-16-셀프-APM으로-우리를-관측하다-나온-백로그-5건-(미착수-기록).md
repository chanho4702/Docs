---
type: project
tags: [moveseye, apm, backlog, cloud, archiving, self-monitoring, on-prem]
created: 2026-09-14
updated: 2026-09-21
status: backlog
---

# 2026-09-14~21 — 셀프 APM으로 우리를 관측하다 나온 백로그 5건 (미착수 기록)

- 프로젝트: [[projects/moveseye/moveseye|moveseye]] · 정본은 각 `_workspace/planning/backlog_*.md`. **구현 0** — "나중에 판단"하려고 적어 둔 것들. 설계서만 있으면 잊힌다는 게 09-16의 교훈(사용자가 아카이빙 등록 여부를 되물었다).

## 계기

09-15~16 로컬 BE·AI에 OTel 에이전트를 붙여 **우리 제품으로 우리를 관측**했다(`_tools/run_be_3000_dev_apm.ps1`, `OTEL_JAVAAGENT_JAR` 옵트인 훅 — 🔴 `JAVA_TOOL_OPTIONS`로 달면 Gradle 데몬까지 계측돼 `unknown_service` 유령). 화면에서 막힌 지점이 그대로 백로그가 됐다.

## 1. APM 이해도 개선 + AI 접목 (`backlog_apm-comprehension-and-ai.md`)

- 🔴 **실제 결함**: `http.server.active_requests`는 OTel **실험 지표**라 Java 에이전트가 기본으로 안 보내는데 **화면엔 카드가 있다**. 설치 가이드 Java env 8개에 켜는 옵션(`OTEL_INSTRUMENTATION_HTTP_SERVER_EMIT_EXPERIMENTAL_TELEMETRY=true`)이 없어 **가이드대로 설치한 고객은 이 카드가 영원히 빈다.** .NET·Node·Python 키는 미확인.
- 🔴 **허용목록 확장 수단이 제품에 없다** — 폐기 통계가 `NOT_ALLOWLISTED`를 알려주며 "확장 근거를 찾는 창구"라 하는데, BE `ApmMetricAllowlist`가 **자바 상수 표**라 코드 수정+재배포가 유일한 길. 잠금은 타당(1m 일 1,400만 행 설계), 문제는 **여는 정식 절차 부재**. → ZM-155 설계서로 이어짐([[projects/moveseye/2026-09-22-zm151-156-backlog-sprint|2026-09-22-zm151-156-backlog-sprint]]).
- 🔴 **아카이빙·내보내기 전무** — 보존 끝나면 지우기만. 롤업은 압축이 아니라 **되돌릴 수 없는 요약**, 트레이스는 7일 뒤 소멸. 필요한 것 ① 보존 안내 표시 ② 기간 지정 내보내기(→ ZM-154로 구현됨) ③ 콜드 아카이브(→ ZM-156 설계, 🔴 온프렘이라 S3 전제 금지).
- **빈 값 문제**: 판정은 있는데(계측 미제공 3분류·폐기 사유·SLO UNKNOWN) **화면이 말을 안 한다** → ZM-152 화면 자기설명으로 구현됨.
- **결정: 화면 개선을 AI보다 먼저** — AI가 답할 질문 수 자체를 줄이는 쪽이 싸고, 화면이 말 안 하는 걸 AI로 메우면 AI 없는 화면은 계속 불친절하다. AI 후보 5(①수집 진단 체인 ②빈 값 이유 문장화 ③SLO 목표 추천 ④배포 30분 뒤 요약 ⑤외부 호출 이상). ①이 필요한 실사례: 에이전트 서비스 이름이 달라 **새 서비스로 등록**돼 원래 서비스가 STALE — 단계를 안 나누면 "수집 끊김"으로 오진.

## 2. 클라우드 스냅샷 리전 팬아웃 (`backlog_cloud-snapshot-region-scope.md`) — 사용자 판단 "수정 필요"

- APM 서비스 맵에 `ec2.<region>.amazonaws.com` 노드가 **17개** — 로그로만 알던 외부 호출량이 맵에 드러난 사례(AI 후보 ⑤의 근거).
- `cloud_snapshot`(5분)이 리전 화이트리스트 없이 **활성 리전 전부**를 병렬 호출 — 서울만 쓰는 고객도 시간당 204회·하루 4,900회. 과금 0(`Describe*`)이지만 스레드·대기는 실제(맵 엣지 p95 300~1,700ms).
- 🔴 반쯤 고친 이력 — 08-25 `enabledRegionNames()`가 미옵트인을 걸러 34→17. "안 쓰는 리전" 문제는 절반 남았다.
- **배치 자체는 유지**(CloudWatch에 상태 역사가 없고 무료 Describe로 과금 0 시계열을 만드는 것이 V28의 목적, [[projects/moveseye/2026-08-26-ec2-monitoring-sources-and-cloud-cost|2026-08-26-ec2-monitoring-sources-and-cloud-cost]]). 줄일 것은 팬아웃만: ① 리전 화이트리스트 ② 인스턴스 5분 / VPC·SG·RT 30분~1시간 ③ 빈 리전 백오프. 당장 회피 = 스케줄러에서 `cloud_snapshot` 끄기.

## 3. 자빅스 메트릭 아카이빙 (`devdesign_data-archiving.md`, 백로그 I7) — 설계만

- 확정: 감사용 원본 보관(차트 기간 확장 아님) · 파일(하루 ZIP 1개, CSV.gz) · 원시+시간집계 · Spring Batch 미도입 · 목록에 파일 경로·실물 존재 · 다운로드·선택 삭제. 09-16 결정: 보관 기간은 화면 설정(기본 5년)·텍스트 기본 포함+스위치.
- 착수 시 🔴 V41 번호 낡음 → 재배정 · 병렬 호출 금지(자빅스 PHP 워커) · 삭제해도 행은 남김(사유 필수) · 실패율 20% 넘으면 빈 ZIP 안 만듦. APM 콜드 아카이브(ZM-156)와 파일 기록기·목록 화면 공유 — 먼저 착수하는 쪽이 공용으로.

## 4. 자체 점검(셀프 APM) 페이지 — 09-14 보류

- 기술 실증은 끝남(08-31 E2E `e2e_apm-selfmonitoring.md`: BE+javaagent → otelcol → 자기 수신부, 오류율 10.1% DEGRADED 실검출). 남은 건 **채택 결정**.
- 착수 시: ① 로그로만 있는 계측(`[zabbix-calls]`·event_sync stale·SSE 연결·풀 포화)을 OTel 커스텀 메트릭으로 ② 셀프 수집 옵트인 상시화 ③ 화면. 🔴 **관측의 관측** — 생사 최후 감시는 자빅스(외부)로 역할 분담 · 온프렘 Collector 상주 +1 · APM=PREMIUM인데 "셀프 점검은 라이선스 없이?" 정책 결정 필요.

## 5. APM 규모 관측 공백 (09-21) — 판단 보류

- 사용자 "APM 1주일치 저장 중인데 인프라 분리 고민" → 진단. `devdesign_apm.md` §4.6에 PostgreSQL→분리 승격 조건(일 2천만 행 검토·3,500만 착수, 화면 체감이 용량보다 먼저)과 `ApmMetricStore` 인터페이스가 **이미 있다** — 아키텍처는 대응책을 갖고 있음.
- **진짜 문제**: 설치형이라 **고객 설치본의 APM 데이터량을 우리가 볼 방법이 없다**(phone-home 채널 0). dev 실측(일 31만 행, 기준선의 1/45)은 내부 테스트일 뿐. 리스크 재정의 = "지금 구조로 못 버틴다"가 아니라 **"특정 고객이 이미 임계값을 넘었어도 우리가 모를 수 있다"**(관측 공백). [[projects/moveseye/2026-08-21-architecture-audit|2026-08-21-architecture-audit]] "코드는 설치형인데 배포는 SaaS"와 같은 결.
- 후보: 설정 화면에 "일일 수집량 / 권장 상한 대비 %" 자가진단 표시(가장 가벼운 시작점). 1번 백로그와 같이 검토.

## 관련
[[projects/moveseye/2026-09-22-zm151-156-backlog-sprint|2026-09-22-zm151-156-backlog-sprint]](1번 중 3건이 ZM-152·154·155·156으로 승격) · [[projects/moveseye/2026-09-21-zm159-scale-call-guard|2026-09-21-zm159-scale-call-guard]] · [[projects/moveseye/2026-08-31-apm-p1-implementation|2026-08-31-apm-p1-implementation]] · [[projects/moveseye/2026-09-17-apm-retention-policy-design|2026-09-17-apm-retention-policy-design]] · 메모리 `apm-comprehension-backlog`·`cloud-snapshot-region-fanout`·`zabbix-data-archiving-backlog`·`self-monitoring-backlog`·`apm-scale-observability-gap`
