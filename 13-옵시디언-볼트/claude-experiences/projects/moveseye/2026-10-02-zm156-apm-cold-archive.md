---
type: project
tags: [moveseye, apm, archive, retention, codex, zm-156]
created: 2026-10-01
updated: 2026-10-19
status: done
---

# 2026-10-01~02 — ZM-156 APM 콜드 아카이브: 지우기 전에 파일로, 못 떨구면 안 지운다

- 프로젝트: [[moveseye]] · 스프린트 [[2026-09-22-zm151-156-backlog-sprint]] · 기능 지도 [[apm-수집과-운영]]
- 상태: **master ff 병합(미푸시)** BE `3637c77`·FE `2ed84f7`(2026-10-02). 런타임 실측 0건(NFS·컨테이너 볼륨·리눅스 심볼릭 링크·다중 노드 미검증). 정본 기능 문서 `moveseye-docs/features/APM-콜드-아카이브.md`(review).
- 정본: 설계 `_workspace/features/apm/cold-archive/devdesign_apm-cold-archive.md`(§10 결정) · 계약 `features/apm/cold-archive/contract_apm-cold-archive.md`(v1 + §9) · 보고 `reports/zm-156_{apm-cold-archive,be-cold-archive,fe-cold-archive}.md` · 검수 `reviews/review_zm-156-{be,fe}-cold-archive.md`(BE v1~v5·FE v1~v3) · 메모리 `apm-cold-archive-decisions`

## 무엇을
APM 보존 배치(`apm_retention`, 01:30)는 날짜만 보고 파티션을 DROP하고 어디에도 남기지 않았다. 이 기능은 DROP 직전의 (데이터셋, 날짜) 하나를 ZIP으로 떨구고(`apm_archive`, 00:50), **떨구지 못한 날은 지우지 않는다(DROP 게이트)**. 공통 기반(원장 `archive_file`·ZIP 작성기·경로 정책·목록 화면)은 자빅스 아카이빙(I7)과 함께 쓰도록 premium 밖 `com.dmove.moveseye.archive`에 두고 APM은 그 위의 첫 소스다.

## 결정 (10-01, 2안 + 권고 + 한 줄 답 형식으로 한 대화에 종료)
| Q | 결정 |
|---|---|
| Q1 | **A안 — 보관 의무 고객 없음 전제.** 기본 데이터셋 SLO 일 스냅샷·1h 지표·트레이스 요약, 1m·스팬은 옵트인 |
| Q2 | `maxHoldDays=7` 뒤 보관 없이 DROP + 원장 `HOLD_EXPIRED` 기록, **보류 첫날부터 배너·알람 `ARCHIVE_HOLD`**, 0 = 무기한 |
| Q3 | 공통 기반까지 이번에 만든다(별도 기반 이슈 없음) |
| Q4 | (데이터셋, 날짜) 단위 ZIP, DROP 직전 (하루 1 ZIP은 400일 이중 보관) |
| Q7 | 허용 루트 `ARCHIVE_ALLOWED_ROOTS` 강제 |
| Q8 | 공통 감사 체계 선행 안 함 — 로그 `[APM-ARCHIVE]` |
| Q11 | 자빅스 아카이빙은 기본 기능 → 공통 기반은 premium 밖(ArchUnit A1) |

## 핵심 구조
- **DROP 게이트**: 보존 서비스 세 단계가 `archiveGate.isActive()`를 한 번 묻고, **false면 원래 문장 그대로**(꺼진 상태 byte-identical — 원본 두 파일 diff 삭제 0줄 + `allowAllMatchesOriginalBytes` + ArchUnit 6건으로 고정). true면 날짜마다 한 트랜잭션: 설정 락 공유 → 날짜 락 배타 → 원장 OK ∧ 실물 존재 → DROP, 아니면 보류 장부 touch. 전부 fail-closed(조회 실패 = 지우지 않음).
- **쓰기 원자성**: UUID `.partial` + `CREATE_NEW` → 봉인(checksums·manifest·fsync·재읽기 SHA-256) → 하드 링크 no-replace 게시(충돌은 `-rN`). 시간 예산 25 + 3 ≤ 28 < 30(리스) < 60(크래시 정리).
- **원장 상태 7종**(`RUNNING·OK·SUPERSEDED·DELETED·FAILED·SOURCE_EXPIRED·HOLD_EXPIRED`), 부분 유니크 4개로 키당 유효본 하나. 삭제해도 행은 남는다.
- **화면**: 관리 콘솔 › 운영 › 데이터 아카이브 3탭 + APM 상단 보류 배너 + 알람 규칙 `ARCHIVE_HOLD`(켜기/끄기만, 그 밖은 `APM_ALERT_RULE_PROTECTED`).
- **배포 전제**: `bitbucket-pipelines.yml` `docker run`에 `-v /data/moveseye-archive:/data/archive` + `ARCHIVE_ALLOWED_ROOTS` — 코드로 못 막는 요건, 실서버 작업은 사람 몫.

## 코덱스가 잡은 것 (BE 5회·FE 3회, 데이터 손실급 위주)
설정 오류 시 fail-open · 관리자 삭제 ↔ DROP 경쟁 · 다중 실행의 공유 `.partial` 이름 · `ATOMIC_MOVE` 덮어쓰기 · 봉인 중 deadline 미검사 · 원장 경로 미검증 · 설정 저장 lost update · 설정 락 실패 시 보류 재오픈 · `resync THEIRS`로 보호 규칙 우회 → PG advisory lock 2종·부분 유니크 upsert·락 밖 실검사로 전부 해소.

## 교훈
- **"꺼짐 = 옛 코드 그대로"를 테스트로 고정하는 것이 첫 일**이었다. 게이트를 추가하는 기능은 기본값에서 아무것도 달라지지 않아야 롤백 없이 배포된다.
- **잠금 두 겹(설정·날짜)의 대기 예산은 하나로 공유**해야 "끄기 + 보류 해제"와 DROP이 엇갈려 방금 닫힌 보류를 다시 열지 않는다.
- 결정 대기 이슈는 2안 + 권고 + "되돌릴 수 있나" 한 줄이 가장 빨랐다(Q1~Q11이 한 대화).
- 스케줄러 DTO 시각이 서버 현지 시각 + `Z`인 기존 결함을 FE가 발견 — 아카이브 EP는 epoch ms로 회피, 스케줄러는 별도 이슈.

## 남은 것
푸시 · BE 재기동 후 S6 런타임(게이트 거부 → 다음 날 DROP, NFS, 크래시 후 `.partial` 청소) · 1m·스팬 용량 실측 · restore·RUM 데이터셋·날짜 단위 페이지(보류).

## 관련 노트
[[2026-09-22-zm151-156-backlog-sprint]] · [[2026-10-19-zm155-apm-custom-metric-allowlist]](같은 Q7 로그 감사 결정) · [[2026-09-17-apm-retention-policy-design]] · [[2026-09-16-apm-observability-backlogs]](자빅스 아카이빙 I7) · [[concurrent-upsert-lock-order]] · [[codex-exec-operations]]
