---
name: zm136-chart-incremental-doc-todo
description: "ZM-136 차트 증분 에픽 — 09-14 인수·완주(139~143·145~148 커밋+실측+문서), ZM-144만 대기(148 장기 관측 선행)"
metadata:
  type: project
---

2026-09-14 **ZM-136 인수 완주** (원 담당 세션의 미커밋 ZM-139~142를 검증 후 커밋, 이어서 143·145·146·147 구현, 148 dev 실측).

- **✅ 코덱스 검수 완료(09-14, gpt-6-astra xhigh)**: 10건(HIGH5·MED4·LOW1) 중 9건 반영 커밋(BE·FE #ZM-136 [FIX]) — 요청-응답 메타 대조(캐시 잔재·identity 오염), single-flight 키 requested 축, (clock,eventId) 복합 커서, Error 완료, 48h+ 증분 무시, 잔재 행 정리, 30초 격자, trailing 취소, 응답당 1회 처리. 이월 1건: 복관 시 range 재계산(갱신 끔 사용자만 영향).
- **커밋**: BE `#ZM-139`(증분 EP)·`#ZM-145 #ZM-146`(되짚기 커서·읽음 축 통일+UPSERT)·`#ZM-143`(SingleFlightExecutor) / FE `5ffa1d7`(#ZM-140~142)·`#ZM-147`(SSE trailing). 전부 미푸시.
- **실측(ZM-148 부분)**: dev :3002 — 계약 전건(전체 창·overlap 120s·30분 조각·hasMore 이어받기) + **전체 vs 증분 병합 동등성 완전 일치(60점=60점)**. 스크립트 scratchpad `zm148_verify.py`. 잔여: FE 브라우저 E2E·Zabbix delay 분포 기반 기본 주기 검증·PARTIAL(truncated 메타) — 운영 관측으로 이월.
- **ZM-144(예산 분리)만 대기** — 148 장기 호출량 관측 없이 수치를 정하면 ZM-129 풀 상한과 이중 규제. 착수 시 후보: backfill 동시 상한 or 풀 예약 슬롯.
- **문서 완료**: `moveseye-docs/improvements/ZM-136-차트-증분-조회.md`(표준 양식) + ZM-127·128 문서에 145~147 해소 반영. 에픽 보고서(`_workspace/features/infra/chart-incremental/report_zm-136_monitoring-chart-epic.md`) 전 절 갱신.
- 🔴 함정: 인수 시 tsc 에러 1건(queryEnabled boolean|undefined) 실결함 — optional 조합 식은 경계에서 !! 확정 · single-flight 키에 principal 필수(권한 우회) · knownThrough는 "마지막 point"가 아니라 "완전히 확보한 구간 끝" · PARTIAL에서 커서 전진 금지 · ZM-146 기존 Zabbix-id 축 잔재 행은 판별 불가라 미정리(실서버 적용 시 인지) · :3001은 타 세션 자바가 점유(3002 사용).
- 관련: [[zabbix-load-relief]] [[apm-implementation-progress]]
