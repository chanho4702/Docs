---
name: apm-collector-redaction-log-body
description: "수집기 redaction/pii의 카드번호 패턴(\\d{13,16})이 OTLP 로그 본문의 13자리 숫자(epoch ms)를 가려 JSON이 깨진다 — 확장 목록 로그에 13자리 이상 숫자 금지, BE는 파싱 실패를 로그로"
metadata: 
  node_type: memory
  type: project
  originSessionId: 73f0e76e-73ad-4f5f-b22e-ed7729545a96
  modified: 2026-09-23T04:31:26.797Z
---

2026-09-23 런타임 실측에서 발견. 자바 확장의 처리 중 요청 목록(OTLP 로그 한 줄)이 **부하 중에만** BE에 안 들어왔다 —
빈 목록 `[]`은 통과, 항목이 있는 목록은 통째로 사라짐. 원인은 수집기 `redaction/pii`(`blocked_values`에
`\b(?:\d[ -]*?){13,16}\b`)가 본문의 시작 시각 `"a":1790137249185`(13자리)를 가려 JSON이 깨지고, BE
`ActiveRequestListIngestor.parse`가 IOException을 조용히 null로 버린 것. 수집기 logs 파이프라인은 저장 경로와 같은
`redaction/pii`를 탄다(config.yaml).

**Why:** 증상이 "부하 중에만 목록 없음"이라 확장·감시기·세션 문제로 오진해 1시간을 썼다. 로그 본문을 JSON으로 실어
보내는 기능은 전부 같은 함정에 걸린다.

**How to apply:**
- OTLP 로그 본문에 넣는 JSON엔 **13자리 이상 숫자 연속을 두지 않는다**(epoch ms·긴 ID). 확장은 `a`를 빼고 BE가
  `startedAt = asOf − e`로 만든다(확장 테스트 `\d{13,}` 부재 고정). 계약 `[{t,s,m,p,e,o,d}]`.
- BE 수신기는 파싱 실패를 최소 DEBUG로 남긴다("본문 파싱 실패" + 앞 160자).
- 같은 증상 재발 시 첫 확인: 수집기 redaction 패턴 vs 본문 숫자.
- 이벤트 SSE 실제 경로는 `/event/stream`(확장 기본 제외에 추가함). 고객 앱 SSE 경로는 `exclude-paths`로.
- 실측 절차: curl 부하 루프에 `-c`(쿠키 저장) 금지 — 응답 쿠키가 세션을 덮어 401. 로그인만 `-c`, 나머지 `-b`.
  계정당 세션 1개라 admin으로 로그인하면 사용자 브라우저 세션이 끊긴다 → 임시 계정(DB에서 admin 행 복제, 뒤에 삭제).
- IDE에서 띄운 BE를 내가 재기동할 때: `Get-CimInstance Win32_Process`로 실행줄을 저장 → Stop-Process → `gradlew classes
  :engine-api:jar :engine-zabbix:jar` → .env를 프로세스 env로 싣고 같은 실행줄로 Start-Process(스크립트
  scratchpad `start_be_ide_cmd.ps1` 패턴). 진단은 `-Dmoveseye.active-requests.output=<json>` +
  `write-every-snapshot=true`로 확장 카운터를 1초마다 파일로.

관련 [[apm-implementation-progress]] [[bash-heredoc-eats-backslash]] [[no-be-restart-without-ask]]
