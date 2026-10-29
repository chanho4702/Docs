---
name: apm-comprehension-backlog
description: "APM \"이해하기 쉽게\" 개선 + AI 접목 후보 — 09-16 로컬 셀프 APM 실사용에서 막힌 지점을 백로그로 기록(1건은 실제 결함)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d71735bd-2e35-4d22-bdcc-f58ce828438f
  modified: 2026-09-16T07:02:37.810Z
---

2026-09-16 사용자 지시로 기록. 정본 `_workspace/features/apm/backlog/backlog_apm-comprehension-and-ai.md`. 기획이 아니라 **실사용 기록** — 09-15~16에 로컬 BE·AI에 OTel 에이전트를 붙여 우리 제품으로 우리를 관측하며 막힌 지점 그대로다.

🔴 **실제 결함(즉시 고칠 것)**: `http.server.active_requests`는 OTel **실험 지표**라 Java 에이전트가 기본으로 안 보내는데 **화면에는 카드가 있다**(개요 StatCard 4·서비스 개요 탭). 설치 가이드의 Java env 8개에 켜는 옵션이 없어 **가이드대로 설치한 고객은 이 카드가 영원히 빈다.** 필요한 것은 `-Dotel.instrumentation.http.server.emit-experimental-telemetry=true`(env `OTEL_INSTRUMENTATION_HTTP_SERVER_EMIT_EXPERIMENTAL_TELEMETRY=true`). 09-16 실측은 Java만 — .NET·Node·Python은 키가 다를 수 있어 확인 필요.

**우선순위**: ① 위 가이드 누락(결함) → ② 빈 값의 이유를 그 자리에 쓰기 → ③ AI 수집 진단 체인 → ④ 허용목록 확장 수단(설계 필요) → 나머지.

🔴 **같은 모양의 공백 하나 더(09-16 추가)**: 폐기 통계가 `NOT_ALLOWLISTED`를 알려주며 스스로 "허용목록 확장 근거를 찾는 창구"라고 하는데 **확장 수단이 제품에 없다.** 관문 둘 중 BE `ApmMetricAllowlist`가 **자바 상수 표**라 코드 수정+재배포가 유일한 길 — 고객 커스텀 지표는 우리가 배포하기 전까진 전량 폐기된다. 잠금 자체는 타당하다(수집기 필터는 고객이 지울 수 있고 1m은 일 1,400만 행 설계라 BE가 최종 게이트). 문제는 **여는 정식 절차가 없는 것.** 방향은 ①설정 노출+카디널리티 상한 ②커스텀 지표 전용 저장 경로 분리. 허용목록은 이름뿐 아니라 **살릴 차원 목록**까지 정하므로 UX가 간단하지 않다.
🔴 **아카이빙·내보내기가 통째로 없다(09-16 추가)**: 보존이 끝나면 **지우기만 하고 어디에도 안 남긴다**. 화면에 "며칠 뒤 사라진다"는 안내도 없다. 🔴 롤업은 압축이 아니라 **되돌릴 수 없는 요약**(1분 60개→1시간 1개, 평균·최대·백분위만 남김)이고 트레이스는 접지도 않고 7일 뒤 소멸한다. 보존 일수는 `apm_retention` 옵션(`raw1mDays`7·`rollup5mDays`30·`rollup1hDays`400 등)으로 조절만 된다. 필요한 것 셋: ①보존 안내 표시(가벼움, 1-1과 같은 뿌리라 함께) ②기간 지정 내보내기 ③콜드 아카이브(무거움). 🔴 ③은 **온프렘이라 S3 전제 금지** — 로컬/NFS 경로 설정 + 디스크 책임이 고객에게 감. 착수 전 확인 4(보관 의무 고객 실재·restore 필요 여부·형식 CSV/Parquet·DROP과의 순서 보장).

🔴 **화면 개선을 AI보다 먼저 한다** — AI가 답해야 할 질문 수 자체를 줄이는 쪽이 싸고, 화면이 말 안 하는 걸 AI로 메우면 AI 없는 화면은 계속 불친절하다.

**빈 값 문제**: 판정은 이미 있는데(계측 미제공 3분류·`apm_ingest_drop_stat` 폐기 사유·SLO UNKNOWN) **화면이 말을 안 한다.** 에이전트 미전송 / 런타임이 못 내는 지표 / 요청 없어 못 잼 / 보존 밖 / 폐기됨이 전부 똑같이 빈칸으로 보인다.

**AI 접목 후보 5**: ①수집 진단 체인(에이전트 부착→Collector 수신→BE 수신→서비스 등록 4단계, `apm_collector_status` 재사용·온보딩 최다 질문) ②빈 값 이유 문장화 ③SLO 목표 추천(추천이지 기본값 아님 — 목표는 조직의 결정) ④배포 30분 뒤 자동 요약(단, 배포 탭이 의도적으로 개선/악화 판정을 안 하는 제약 승계) ⑤외부 호출 이상 짚기.

**진단 체인이 필요한 이유(실사례)**: Collector·BE 수신은 정상인데 에이전트 서비스 이름이 달라 **새 서비스로 등록**돼 원래 서비스가 STALE로 남았다 — 단계를 안 나누면 "수집 끊김"으로 오진한다.

**이미 해결된 것**: SLO가 사이드바에 없어 주소로만 진입하던 것 → FE `3a09b33`(#ZM-122) 커밋.

관련: [[apm-implementation-progress]] · [[cloud-snapshot-region-fanout]](같은 세션에서 우연히 발견 — 후보 ⑤의 근거) · [[apm-install-paths]]
