---
name: apm-cold-archive-decisions
description: ZM-156 APM 콜드 아카이브 — 2026-10-01 사용자와 대화로 착수 조건 7개 확정(Q1 A안 보관 의무 없음·Q2 7일 후 DROP+첫날 알람·Q3 156이 공통 기반까지·Q4 데이터셋별 ZIP·Q7 허용 루트 강제·Q8 로그 기반 감사·Q11 자빅스 아카이빙은 기본 기능→common/archive). 🔴 배포 docker run 볼륨 선행
metadata:
  node_type: memory
  type: project
  originSessionId: 88ace7d2-9c84-493b-a4a4-d5e7dfb6b7a4
  modified: 2026-10-01T06:48:51.985Z
---

2026-10-01 사용자 "Q1부터 대화하자" → 하나씩 확정. 정본은 `_workspace/features/apm/cold-archive/devdesign_apm-cold-archive.md` §10(각 행에 ✅ 결정 기록)·보고 `features/apm/cold-archive/zm-156_apm-cold-archive.md`.

| Q | 결정 | 근거 |
|---|---|---|
| Q1 | **A안 — 보관 의무 고객 없음 전제.** 기본 대상 SLO 일 스냅샷·1h 지표·트레이스 요약, **1m·스팬 옵트인** | 현대캐피탈 13건에 APM 보관 요구 0(전부 자빅스 인프라 축). 되돌릴 길(옵트인·`maxHoldDays=0`)이 있어 채택 |
| Q2 | `maxHoldDays=7` 후 DROP + `HOLD_EXPIRED` 기록, **보류 첫날부터 배너·알람**(기존 APM 서비스 알람 이벤트 통로), 0=무기한 | 조용한 소실 방지 |
| Q3 | **ZM-156이 첫 소비자로 공통 기반(원장·writer·경로 정책·목록 화면)까지 만든다.** 별도 기반 이슈 없음 | 기반 요구의 대부분이 APM 쪽에서 나옴 |
| Q4 | (데이터셋, 날짜) 단위 ZIP, DROP 직전 | 하루 1 ZIP은 400일 이중 보관·실패 전파 |
| Q7 | 허용 루트 강제 | 권고 |
| Q8 | 공통 감사 체계 선행 안 함 — 1차는 ZM-154처럼 로그 기반 | 권고 |
| Q11 | 자빅스 아카이빙은 **기본 기능**(premium 아님) → 공통 기반은 `common/archive`(가칭), APM 소스만 `premium/apm` | 의존 방향(premium→common만) |

🔴 **인프라 선행**: `bitbucket-pipelines.yml` BE `docker run`에 `-v` 없음 → 아카이브 볼륨 마운트 + `ARCHIVE_ALLOWED_ROOTS` 환경변수 없이는 배포마다 파일 소실. 코드로 못 막는 요건.
🔴 가장 큰 리스크: 판정 없는 `dropExpired(table, days)` 신규 호출이 DROP 게이트를 우회 → 호출처 테스트로 고정(설계 §12). **꺼진 상태에서 기존 보존 동작 불변 테스트가 S2의 첫 일**.

**Why:** 09-16 "설계 질문 먼저" 결정으로 2주 대기했던 이슈. 사용자가 짧은 선택지(A/B, ㄱ/ㄴ)로 물으면 바로 답했다 — 긴 설계 용어 설명은 "뭔소린지 이해가 안가"를 받았다.
**How to apply:** 결정 요청은 선택지 2개 + 추천 1개 + 되돌릴 수 있는지 한 줄로. 관련 [[zm-151-156-backlog-sprint]] [[zabbix-data-archiving-backlog]] [[apm-implementation-progress]]

**10-01 구현 → 10-02 사용자 승인("ㅇㅇ 승인") 후 커밋·master ff 병합 BE `3637c77`·FE `2ed84f7`(미푸시), 워크트리·브랜치 정리, 병합본 BE 컴파일·FE tsc·contract 0. 🔴 BE 본체에 다른 세션 미커밋 `ApmCollectorController.java` 1건 잔존(건드리지 않음)** — BE `C:\worktrees\zm-156-be`(수정 21·신규 15 항목, V69 테이블 3 + 시드 배치 `apm_archive` 00:50·알람 `ARCHIVE_HOLD`, 공통 기반 `com.dmove.moveseye.archive`, 관련 테스트 592 통과·IT 17) · FE `C:\worktrees\zm-156-fe`(수정 17·신규 9 항목, 관리 콘솔 > 운영 > 데이터 아카이브 3탭, 보류 배너, 232건 중 229 통과 — 실패 3은 master 기존 `apmHelpContent`).
- 코덱스가 잡은 핵심(데이터 손실 급): 설정 오류 시 fail-open, 삭제↔DROP 경쟁, 공유 `.partial` 이름, `ATOMIC_MOVE` 덮어쓰기, 봉인 중 deadline 없음, 원장 경로 미검증, 설정 저장 lost update, 설정 락 실패 시 보류 재오픈, resync THEIRS로 보호 규칙 우회. → PG advisory lock(날짜·설정), UUID partial+CREATE_NEW, 하드링크 no-replace 게시, 락 밖 실검사·SHA, 부분 유니크 인덱스 upsert.
- 🔴 설계와 달라진 것: 기능 스위치는 아카이브 설정 `enabled` 하나(스케줄러 행은 켜진 채 시드), 게이트 인터페이스는 retention 패키지, 배치·소스는 `premium/apm/archive/`, 권한은 관리자 판정(기능 권한 미도입), CSV 수식 방어는 아카이브에서 끔(`csvFormulaGuard:false`), `STUCK_REQUEST`는 보호 안 함.
- 🔴 master 기존 실패 2종 발견: BE `LicenseArchitectureTest` A5-c, FE `apmHelpContent.test.ts` 3건 — 별도 수정.
- 🔴 FE가 찾은 기존 결함: 스케줄러 DTO 시각이 서버 현지 시각+`Z`(JVM KST면 9시간 어긋남) — 아카이브 EP는 epoch ms로 회피, 스케줄러 EP는 별도 이슈.
- 남은 것: 푸시(사용자) → BE 재기동 후 런타임 실측(S6: 게이트 거부→다음 날 DROP, NFS·컨테이너 볼륨, 크래시 후 `.partial` 청소) · 기능 문서(`moveseye-docs/features`) 작성 · 1m·스팬 용량 실측.

**10-02 10:15 dev BE 재기동(사용자 "고고")** — IDE가 띄운 BE(PID 45768, OTEL 에이전트)를 종료하고 scratchpad 래퍼 `run_be_3000_dev_apm_archive.ps1`(= `_tools/run_be_3000_dev_apm.ps1` + `--no-daemon` + `ARCHIVE_ALLOWED_ROOTS=<scratchpad>rchive-root`)로 gradle bootRun. **dev DB(5433) V69 적용됨**, `apm_archive` 스케줄러 등록 로그 확인. 🔴 이 인스턴스는 scratchpad 로그 `be3000.log`로 돌고 있고 IDE 재시작 시 포트 충돌 — 다시 IDE로 띄우려면 이 java를 먼저 죽일 것. 로그인 필요한 실측(설정 켜기→실행→파일·게이트)은 세션 끊김 때문에 사용자 허락 대기.

**10-28 S6 런타임 실측 통과** — 게이트 거부→보류·알람→다음 회차 보관→DROP, 보류 기한(0=무기한·7일 만료 HOLD_EXPIRED), 크래시 `.partial` 정리, 동시 실행, 삭제·경로 조작 거절, 끄기 시 보류 DISABLED. 정본 `_workspace/features/apm/cold-archive/qa_zm-156-runtime-s6.md`. 🔴 실측하려면 BE를 `ARCHIVE_ALLOWED_ROOTS` 넣어 재기동해야 한다(없으면 configured=false). 🔴 발견: APM 설정 감사 로그 user=null — 실제 대상은 APM 9곳(21파일은 과장 — DTO·로그인·Zabbix 필드 오탐). 10-28 `ActorResolver`로 교체 + ArchUnit `ActorNameArchTest`(허용: 캐시·키 폴백 3메서드) — master `df1b39f`(미푸시), 수신 토큰 created_by=admin 실측 확인. 🔴`ApmExportIT` 2건은 master에서도 실패(기존). 미실측: NFS·컨테이너 볼륨·다중 노드.
