---
type: project
tags: [project, moves-approval-jira, forge, forge-sql, codex-review]
created: 2026-10-27
updated: 2026-10-27
status: done
---

# 2026-10-27 잔존 DRAFT 거두기 · 알림 라이선스 경계 · 스테이징 전 코드 잔여 소진

## 개요
- **목적**: 스테이징 배포 전에 코드로 끝낼 수 있는 RELEASE_GATE 잔여(A8·A9·D4)를 소진. 커밋 `2fb3c74`·`6818bfc`, dev 6.5.0.
- **저장소**: `C:\CloudJira\moves-approval-jira`, 관문 문서 `_workspace/RELEASE_GATE.md`.

## 핵심 결정 (Decisions)
- **DRAFT→LIVE 2단계 커밋엔 "거두는 경로"가 반드시 짝으로 있어야 한다.** 트랜잭션 없는 Forge SQL 에서 보상 DELETE 를 안 하기로 한 순간(생성 실패 시 DRAFT 를 남김), 누군가는 그 DRAFT 를 치워야 한다. 안 그러면 `dedupe_key` UNIQUE 가 그 대상을 영구히 `ALREADY_OPEN` 으로 잠근다(status-rule-kvs 설계가 R1 로 기록만 하고 넘긴 갭). 일일 EXPIRY 스윕에 `abandonStaleDrafts` 를 넣었다 — 1시간(Forge 함수 상한 15분의 4배) 지난 DRAFT → `commit_state='DEAD'`(상수는 이미 있었다), dedupe `dead:{id}`, 업무함 행 삭제.
- **DEAD 는 보관 정리 대상에 넣지 않는다** — 보관 내보내기(`RetentionRepository`)가 LIVE 만 다루므로 DEAD 를 넣으면 내보내기 파일에 유령 요청이 섞인다. 중단 사고 때만 생기는 흔적이라 남겨 둔다.
- **라이선스 경계는 "알림 INSERT 를 하는 모든 곳"에** — 정책("상태 정합은 막지 않고 알림만 막는다")은 서비스 한 곳(`createNotificationsBestEffort`)에만 걸려 있었고, 리포지토리가 직접 INSERT 하는 두 곳(REQUESTED·선행 요청 EXPIRED)이 트리거·큐 소비자 경로에서 비활성 라이선스에도 알림을 만들었다. 리포지토리에 같은 판정을 주입.
- **미사용 테이블은 DROP 하지 않고 DDL 헤더에 "미사용"만** — DROP 은 major 마이그레이션이라 상용 뒤.

## 겪은 문제 & 해결 (Troubleshooting)
- **Codex 3회 왕복으로 정리 경로의 구멍 두 개를 잡았다.** ① DEAD 전환 뒤 업무함 DELETE 가 실패하면 다음 스윕은 DRAFT 만 골라 영구 누락 → 후보에 "DEAD 인데 업무함 행 있음"을 넣고 DELETE 를 `EXISTS(DEAD)` 조건부로 항상 보내 멱등하게. ② 행 하나의 실패가 바깥 catch 로 빠져 뒤 후보를 막고 `complete:true` 로 보고 → 행 단위 try/catch + `incomplete=true`. ③ 그 수정 뒤 "실패 후보 50건이 배치를 영구 점유" → ORDER BY 에 DRAFT 우선(`CASE WHEN commit_state='DRAFT' THEN 0 ELSE 1 END`). 정리 루프는 **후보 선택 → 처리 → 실패 시 다음 선택이 같은 것을 다시 고르는가**를 세 번 묻는 게 기본이다.
- **유휴 SQL 예산 테스트가 즉시 깨졌다**(EXPIRY 10→11). 예산 테스트는 "+1 이 의도된 것인지" 묻는 장치로 잘 작동했다. 하루 합계 상한(27)은 그대로.
- **webpack 경고로 발견한 잠복 결함** — `forge deploy` 출력의 "export 'WORKFORCE_ORIGIN_PROPERTY' was not found" 한 줄. 채널 전환 때 삭제한 상수를 `WorklogControlWorker` 가 계속 import 해 `ORIGIN_KEYS` Set 에 `undefined` 가 들어가 있었다. 단위 테스트는 전부 통과했다(mock 이 가림). **배포 출력의 ⚠ 줄은 테스트가 못 잡는 import 부패를 알려 주는 유일한 신호**라 매 배포마다 읽어야 한다.
- **Claude in Chrome 이 사용자 PC 가 아닌 인스턴스에만 연결** — `list_connected_browsers` 에 macOS(theo@)·최소화된 Windows 인스턴스만 보이고 DESKTOP-Q21AG2J 가 없었다. 브라우저 실측(A6 잔여·B9·B12)은 사용자가 확장을 다시 연결할 때까지 보류.

## 교훈 (Lessons)
- "실패하면 그냥 남긴다"는 결정은 반드시 "그럼 누가 치우나"와 짝이다. 설계서의 R1 같은 "기록만" 항목은 상용 전 관문에서 다시 꺼내야 한다.
- 정책 경계는 함수 하나가 아니라 **그 자원을 쓰는 모든 INSERT 지점**에 걸어야 한다(이전에도 `ExpiryService` 직접 INSERT 가 같은 이유로 우회됐었다 — 2026-10-07 리뷰).
- 멱등 정리 작업의 재검토 질문 세 개: 실패한 행을 다음 회차가 다시 고르는가 / 한 행의 실패가 뒤를 막는가 / 영구 실패 행이 배치를 점유하는가.

## 관련 노트
- [[2026-10-14-linked-mode-fix-reopen]] · [[2026-10-20-marketplace-prelaunch-audit]]
