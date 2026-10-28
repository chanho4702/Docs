---
type: project
tags: [moveseye, apm, allowlist, cardinality, codex, zm-155]
created: 2026-10-13
updated: 2026-10-19
status: done
---

# 2026-10-13~19 — ZM-155 APM 커스텀 지표 허용목록: 폐기 통계에서 "받기", 서비스당 50 자리 원장

- 프로젝트: [[moveseye]] · 스프린트 [[2026-09-22-zm151-156-backlog-sprint]] · 기능 지도 [[apm-수집과-운영]]
- 상태: **master ff 병합(미푸시)** BE `a9080eb`(Flyway **V81**)·FE `258d747`(2026-10-19). 런타임 실측 0건(dev DB V81 미적용·다중 노드 미검증). 정본 기능 문서 `moveseye-docs/features/APM-커스텀-지표-허용목록.md`(review).
- 정본: 설계 `_workspace/features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md`(§8 결정 Q1~Q9) · 계약 `features/apm/metric-allowlist/contract_apm-metric-allowlist.md`(v1~v1.3) · 보고 `reports/zm-155_{apm-metric-allowlist-extension,be-metric-allowlist,fe-metric-allowlist}.md` · 검수 `reviews/review_zm-155-{be,fe}-metric-allowlist.md`(각 v1~v5) · 쉬운 요약 `planning/sprint-zm-151-156/summary_zm-151-156_쉬운-요약.md`

## 경위 — 보류했다가 같은 날 뒤집힘
10-13 "꼭 필요한 작업임?"에 요청 고객 없음·상수 표 한 줄 + 배포가 더 쌈을 들어 **보류**로 답하고 폐기 표 힌트만 커밋(FE `821344b`). 사용자 "일단 하자"를 그 작은 힌트 수정으로 좁혀 읽었고, "155 하자했잖아"로 정정 → 본 구현 착수. 🔴 "일단 하자"는 직전에 내가 제안한 **큰 안**을 가리킨다.

## 결정 (10-13)
이름만(차원 없음) · L1 규칙 20 · L5 서비스당 시계열 **50**(원안 200) · 기존 `apm_metric_1m`에 저장(롤업·보존·아카이브 자동 합류) · 히스토그램 제외 · 이름 직접 입력 없음(폐기 통계 `NOT_ALLOWLISTED` 행에서만) · 로그 감사 `[APM-ALLOWLIST]` · 수집기 yaml `extra` 자동 포함 + 재생성 안내 · 전파 TTL 30초.

## 핵심 구조 (코덱스 5회로 바뀐 것이 본체)
| 처음 | 최종 | 이유 |
|---|---|---|
| L5 상한을 노드 메모리로 | **DB 자리 원장 `apm_custom_metric_admission`**(PG advisory lock, 서비스 ID 오름차순) — 캐시는 60초 힌트, 커밋 뒤에만 게시 | 재기동·다중 노드·규칙 교체에서 풀렸다 |
| 규칙 조회 실패 시 옛 규칙으로 무기한 수신 | **마지막 성공 + 60초 fail-closed** | 장애 날 정확히 지켜야 할 상한이 사라진다 |
| 접힘 50%/1h면 자동 정지 | **경고(WARN)만, 저장 계속** | 한 노드의 표본으로 전역 규칙을 멈추지 않는다 |
| 값 종류를 규칙에 | **자리(서비스×이름)에 + 규칙 세대 `rule_id`** | 재등록 시 옛 종류·옛 데이터가 섞였다. 조회는 `ceil(created_at)` 다음 칸부터 |
| 캐시 적중 0문장 | **공유 락 + 세대 확인 2문장** | 옛 스냅샷 노드가 캐시로 계속 저장했다(P1) |
| FE가 epoch `ceil`로 칸 계산 | **응답 `points[].ts`만 사용** | BE 칸 정렬이 서버 시간대 기준(30분 오프셋 TZ에서 어긋남) |

초과분은 버리지 않고 `__other__` 한 줄로 접어 저장(합계 보존, count만 의미). 내장 지표 경로는 **한 글자도 안 바뀜**(실측 페이로드 행 단위 동일 테스트).

## 교훈
- **상한·캐시·잠금은 "서버 한 대·재기동 없음" 가정을 코덱스가 매번 깬다.** 처음부터 "이 상태의 정본 저장소는 어디인가"를 적어 두면 왕복이 줄었다.
- **시간 칸 정렬은 BE에 먼저 물어라.** FE가 epoch 기준 구현·테스트를 끝낸 뒤 서버 TZ 기준임을 확인해 전부 버렸다. 계약서에 "칸 경계는 누가 계산하나" 한 줄이 먼저.
- 1차(차원 없음)는 규칙 하나 = 서비스당 시계열 하나라 **50 상한에 실제로 닿지 않는다** — 2차(차원 선택)용 장치를 미리 깐 것임을 문서에 명시했다.
- Flyway V81은 다른 세션 브랜치가 V76~V80을 점유한 상태에서 번호를 땄다 → 그쪽이 병합될 때 out-of-order 재확인.

## 남은 것
푸시 · BE 재기동 후 받기 → 규칙 탭 → 서비스 탭 → yaml 정규식 포함 실측 · 2차(차원 선택·후보 관측·접힘 비율 전역 집계·규칙별 행 수).

## 관련 노트
[[2026-09-22-zm151-156-backlog-sprint]] · [[2026-10-02-zm156-apm-cold-archive]] · [[2026-09-16-apm-observability-backlogs]](허용목록 확장 절차 부재가 백로그 출처) · [[2026-09-15-apm-install-guide-and-fe-polish]](수집기 설정 생성 폼) · [[concurrent-upsert-lock-order]] · [[shared-it-db-worktree-collision]]
