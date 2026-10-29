---
name: apm-design
description: "APM 설계 v3.1(2026-08-26) — 제품 주력 기능, 수집기 OpenTelemetry Collector 확정, 메뉴 13·차트 18·WBS ~247일, 코덱스 검수 23건 반영, 구현은 후일(미결 Q 대기)"
metadata: 
  node_type: memory
  type: project
  originSessionId: b420d8dd-b928-4ff0-92ce-f57ab9689130
  modified: 2026-08-26T01:49:06.790Z
---

2026-08-26 APM 설계서 **v2**(`_workspace/features/apm/core/devdesign_apm.md`). 사용자 결정: **"수집기는 오픈텔레메트리 쓸거야"** → v1의 Zabbix 래핑 M1 삭제, 파이프라인 = 앱(OTel 자동계측) → **OTel Collector 게이트웨이 1대**(우리는 yaml 생성기·설치 가이드 제공, 단일 바이너리·무도커) → BE `/apm/otlp/v1/*`(json, Collector `otlphttp encoding: json`이라 protobuf 의존 불요) → PG 롤업. tail 샘플링(오류·느림 100%)은 Collector. 서비스는 `service.name` 첫 수신 시 **자동 등록**. M1 메트릭·M2 트레이스·M3 로그 상관. 구현 0, 미결 Q1·5~17 대기.

- 🔴 체크리스트 검토(WhaTap 7항목+AWS·Elastic 정의)에서 드러난 갭: 제품 자체 푸시 알림은 **이메일뿐**, Slack/Teams/Jandi는 Zabbix 미디어 타입 관리 기능일 뿐(AI 모니터링 `evaluateAll`도 화면용). → 추천 Q14-A: APM 알람을 **Zabbix 7.0 `history.push`** 트래퍼 아이템+자동 트리거로 밀어 Zabbix 액션·미디어·에스컬레이션·Problem 화면을 공짜로 사용(R10 실측 필요).
- 갭 2: K8s 통합 없음(Collector k8s receiver가 지름길, 스텝 6 재논의). 강점: 에디션 정액이라 **확장 시 비용 증가 0**(사용량 과금 대비 영업 포인트), 개방형 표준=락인 없음.
- 합성 감시(Zabbix 웹 시나리오 22건 실사용)는 세 정의 모두 APM 요소 → M1.5 편입 후보(Q15). 액티브 트랜잭션·DB 호출 지연 허용목록 추가, 배포 마커(`service.version` 변화)·SLO 목표는 Q16.
- 재사용: `aimonitor/otel/` 파서(히스토그램 sum만 → 버킷 보존 필요). 기존 실측: JMX 66아이템 수집 0건(Gateway 미구성)은 OTel 경로에선 무관.

- **v3(같은 날)**: 사용자 "주력으로 갈 것" → 범위 확대(에러 그룹·DB 쿼리 그룹·외부 호출·메시징/배치·SLO·배포·합성 감시 편입·RUM·K8s·리포트·AI 툴), 메뉴 13개, Phase P1~P4 ~210 사람-일. 동반 문서 `_workspace/features/apm/core/devdesign_apm-screens-wbs.md`(차트 프리미티브 18종: ECharts 내장 17 + **워터폴 1건 직접 구현**, 신규 의존 dagre·sql-formatter MIT). §14 핵심 지표 6종 커버리지(🔴 "코드 수준 추적"은 자동계측 기본 아님 → `otel.instrumentation.methods.include`). 검수 요청 `_workspace/features/apm/core/review_apm-design.md`, `codex exec --sandbox read-only -` 로 직접 실행.

- **v3.1 코덱스 검수 반영**(🔴13·🟡10 전건, 표는 `_workspace/features/apm/core/review_apm-design.md` 하단): 서비스 식별 `(name, env)`+불변 UUID+등록 모드 AUTO/APPROVE/ALLOWLIST · 🔴**403은 OTLP exporter가 영구 실패로 즉시 폐기**(재시도로 버틴다는 전제 틀림 → 만료=즉시 손실, D-14 배너) · Collector yaml에 `prometheus/self`(otelcol_* 수신)·마스킹 체인(attributes regex·redaction·transform/sql) · 토큰 원문 1회·설정 생성은 POST no-store · 용량은 인스턴스 축 포함 1만 행/분 · 히스토그램 정규 경계 재버킷 · Zabbix 트리거 키=UUID+드리프트 동기화 · engine-api `zabbix/`에 history.push 계약 1개만(프로비저닝은 zabbixadmin 재사용) · RUM 보안 §15 · WBS ~247일+로그/K8s 별도, R1(json 픽스처)을 파서보다 먼저. 🔴교훈: **"기존 알림 채널로"·"재시도로 버틴다" 같은 전제는 grep/문서로 한 번 확인** — 두 설계서가 같은 가정을 복사했다.

**Why:** 껍데기(Feature.APM·라우트·게이트·문서)만 있고 내용물 0. 설치형 제약(무도커·새 DB 금지)과 OTel 표준을 양립시키는 구조가 필요했고, 고객이 시장 체크리스트로 채점한다는 전제로 갭을 먼저 드러냈다.
**How to apply:** Q 확정 → v3 착수본 → M1-a(otel 승격·수신·자동 등록·V36·yaml 생성기). 첫 실측 R1(Collector json+히스토그램 버킷 round-trip, BE 자기 자신에 -javaagent)·R10(history.push). 관련 [[premium-license-design]] [[ai-account-monitoring-design]] [[architecture-onprem-scaleout-audit]] [[zabbix-wrapper-principle]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

APM 설계 — 2026-08-26 **v3.1 = 주력 기능·수집기 OTel Collector 확정·코덱스 검수 23건 반영 완료**(`_workspace/features/apm/core/devdesign_apm.md` + 동반 `features/apm/core/devdesign_apm-screens-wbs.md`(메뉴 13→노출 6·차트 18·WBS ~247일+로그/K8s 별도), 구현 0·후일 착수, 검수 `_workspace/features/apm/core/review_apm-design.md`, `codex exec --skip-git-repo-check --sandbox read-only -`). 🔴403은 exporter 영구 실패(즉시 손실) · 서비스 식별 (name,env)+UUID+등록 모드 · 마스킹 체인 · 토큰 1회 노출. 앱 OTel 자동계측→Collector 게이트웨이(json 변환·tail 샘플링, 단일 바이너리)→BE PG 롤업, 서비스 자동 등록, M1 메트릭·M2 트레이스·M3 로그. 🔴자체 푸시 알림은 이메일뿐(Slack/Teams는 Zabbix 미디어) → APM 알람은 Zabbix `history.push` 경유 추천 · K8s 없음 · 정액 라이선스=확장 비용 0 강점 · 합성 감시는 M1.5 후보 · JMX 수집 0건(Gateway)은 OTel엔 무관 · TracePort는 엔진 포트 아님

- 2026-09-03 OTel 기술 해설·도입 배경·한계 문서(컨플루언스용) 작성: `_workspace/guides/apm-opentelemetry-primer.md`(12장: OTel 기술·대안 비교·Zabbix 한계·APM 요건·설계 결정 10·적용 절차·API·원리·OTel 한계 17·실측 교훈).
