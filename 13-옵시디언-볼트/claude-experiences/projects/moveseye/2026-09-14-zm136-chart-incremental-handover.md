---
type: project
tags: [moveseye, zabbix, chart, incremental, sse, handover, codex]
created: 2026-09-14
updated: 2026-09-14
status: done
---

# 2026-09-14 — ZM-136 차트 증분 조회 에픽 인수 완주 (ZM-139~148)

- 프로젝트: [[moveseye]] · 선행 [[2026-09-07-zabbix-load-next-steps]](ZM-138 계약·ZM-139 구현 초안) · 상위 에픽 [[2026-09-07-zm123-load-relief-epic]]
- 상태: ✅ 커밋 완료(BE·FE, 전부 미푸시). ZM-144(예산 분리)만 장기 관측 뒤로 이월.

## 무슨 일이 있었나

원 담당 세션이 남긴 **미커밋 ZM-139~142**를 검증 후 커밋하고, 이어서 143(SingleFlightExecutor)·145·146(되짚기 커서·읽음 축 통일+UPSERT)·147(SSE trailing 취소)을 구현, 148은 dev `:3002`에서 실측했다.

- 커밋: BE `#ZM-139`(증분 EP) · `#ZM-145 #ZM-146` · `#ZM-143` / FE `5ffa1d7`(#ZM-140~142) · `#ZM-147`.
- 코덱스 검수(gpt-6-astra xhigh) 10건(HIGH 5·MED 4·LOW 1) 중 9건 반영 — 요청-응답 메타 대조(캐시 잔재·identity 오염), single-flight 키에 requested 축, `(clock, eventId)` 복합 커서, Error 완료 처리, 48h+ 증분 무시, 잔재 행 정리, 30초 격자, trailing 취소, 응답당 1회 처리. 이월 1건: 복관 시 range 재계산(갱신 끔 사용자만 영향).
- 실측(ZM-148 일부): 계약 전건(전체 창·overlap 120s·30분 조각·hasMore 이어받기) + **전체 조회 vs 증분 병합 동등성 완전 일치(60점=60점)**. 잔여는 FE 브라우저 E2E·Zabbix delay 분포 기반 기본 주기·PARTIAL 메타 — 운영 관측으로 이월.
- 문서: `moveseye-docs/improvements/ZM-136-차트-증분-조회.md`(표준 양식) + ZM-127·128 문서에 145~147 해소 반영 + 에픽 보고서 전 절 갱신.

## 결정

- **ZM-144(증분/백필 예산 분리)는 대기** — 148 장기 호출량 관측 없이 수치를 정하면 ZM-129 풀 상한과 이중 규제가 된다. 착수 시 후보: backfill 동시 상한 또는 풀 예약 슬롯.

## 함정·교훈

- 🔴 인수 시 tsc 에러 1건(`queryEnabled: boolean|undefined`)이 **실결함**이었다 — optional 조합 식은 경계에서 `!!`로 확정한다.
- 🔴 **single-flight 키에 principal이 없으면 권한 우회**가 된다(다른 사용자의 계산 결과에 합류).
- `knownThrough`는 "마지막 point"가 아니라 **"완전히 확보한 구간의 끝"**이다 — PARTIAL(truncated) 응답에서는 커서를 전진시키지 않는다.
- ZM-146 이전 Zabbix-id 축으로 남은 잔재 행은 판별 불가라 미정리(실서버 적용 시 인지할 것).
- `:3001`은 타 세션 자바가 점유 중이라 `:3002`를 썼다 — 검증 포트는 먼저 점유 확인.

## 관련
[[2026-09-07-zabbix-load-next-steps]] · [[2026-09-07-zm123-load-relief-epic]] · 메모리 `zm136-chart-incremental-doc-todo`
