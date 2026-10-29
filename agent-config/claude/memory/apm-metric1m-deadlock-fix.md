---
name: apm-metric1m-deadlock-fix
description: "APM 1m 배치 UPSERT 동시 데드락을 PK 정렬로 제거 — 코덱스 승인·커밋 ad57ea5(미푸시), 런타임 부하 재현만 미검증"
metadata:
  node_type: memory
  type: project
  originSessionId: ea811f3c-87a7-4010-a646-be820d5c725a
  modified: 2026-09-29T01:47:35.962Z
---

2026-09-28. APM OTLP 수신 로그에 `deadlock detected`(`apm_metric_1m_p20260923` 인덱스 튜플) ERROR. 원인: `ApmMetric1mStore.store()`가 배치를 **도착 순서 그대로**(정렬 없음) UPSERT해, 동시에 들어온 두 요청이 같은 행 묶음을 서로 반대 순서로 잠가 교착. 특히 `otelcol_*` 자기 텔레메트리는 `service_id=0`에 소수 행으로 몰려 경합이 잦다. 데이터 손실은 아님(stored=0 → 503 → exporter 재전송, 덧셈이지만 저장 0이라 중복 가산 없음) — ERROR 로그·재전송 낭비만.

**수정**: `store()`에서 UPSERT 직전 `batch.sort(BATCH_LOCK_ORDER)` 1줄 추가. 정렬 키 = PK 전순서 `(serviceId, instanceId, metric, dimsHash, bucketStart)`. 모든 프로세스가 같은 순서로 잠그면 교착 대신 직렬화. 같은 `batch` 리스트를 쓰는 `nullifyConflicted`의 `NULLIFY_HISTOGRAM` 배치까지 함께 순서 통일 → 두 경로 교착 다 잡힘. 신규 파일·마이그레이션 없음. 테스트 3건(instanceId 순서·serviceId 최우선·5필드 폴백 tie-break).

**교훈(재사용)**: 동시성 하에서 같은 테이블에 배치 UPSERT/DML을 치는 코드는 **conflict 키로 정렬해 잠금 순서를 통일**해야 데드락이 안 난다 — 재시도로 증상만 덮지 말 것. 자세한 노트는 옵시디언 [[topics/backend/concurrent-upsert-lock-order]].

**런타임 검증(09-29, DB 레벨 결정적 재현)**: BE 재기동 없이 docker DB(5433)에 apm_metric_1m과 동일 복합 PK+동일 ON CONFLICT DO UPDATE 임시 테이블(zz_deadlock_demo)로 두 psql 커넥션 A/B 실험. **반대 순서(A:X→Y, B:Y→X)=`deadlock detected` 재현**(운영 로그와 동일 형태, A 트랜잭션 통째 ROLLBACK=운영의 stored=0→503). **같은 순서(정렬)=데드락 없음, 둘 다 커밋**(각 count 2). 정렬이 교착을 없애고 직렬화만 함을 실증. 임시 테이블 DROP 정리. **앱 레벨 부하 시험(09-29, B7#1 일부)**: 러닝 :3000 BE에 알려진 평문 토큰 심고(apm_receive_token id=5, ingest scope) service.name=otelcol-contrib 자기텔레메트리 14메트릭을 **정방향/역방향 순서로 동시 POST**(반대순서 잠금 시도). 600요청(300쌍) 결과 **200×589·429×11·503(데드락) 0건**. 429는 admission 상한(max-concurrent 기본 6) 정상 백프레셔이지 데드락 아님. 🔴러닝 BE는 admission(429)이 도는 걸로 봐 ZM-122 회복력(78cd40b, 내 fix ad57ea5의 후손) 포함 = **이미 fix된 빌드**라 앱 레벨 "before(pre-fix)"는 못 봄(그건 DB 레벨 결정적 재현이 대신 증명). 수신 경로는 여전히 동기 store(admission 세마포어만 앞단). 테스트 데이터·토큰 전부 정리(dltest 메트릭 삭제·token5 cascade 삭제, 잔여 0). 🔴OTLP 자기텔레메트리 저장 조건=resource service.name이 otelcol/otelcol-접두 → service_id=0.

**상태**: ✅ 커밋 완료 `ad57ea5`(master, **미푸시**). Codex(gpt-5.6-sol high) 검수 **승인** — 핵심 4항목 🟢, 🟡 2건(주석 범위·테스트 축) 반영. 🔴 **Codex 샌드박스가 프로세스를 못 띄워**(`helper_unknown_error: setup refresh had errors`) 1차 판정 보류 → **diff+미변경 코드를 인라인 번들로 재첨부**해 2차 검수 성공(교훈: 코덱스 샌드박스 오류 시 근거 본문 첨부). 인계서 `_workspace/features/apm/deadlock-fixes/review_apm-metric1m-deadlock.md`에 결과 기록. **런타임 부하 재현만 미검증**(BE 재기동 필요, 사용자 요청 대기). 관련 [[apm-implementation-progress]], [[apm-collector-redaction-log-body]].
