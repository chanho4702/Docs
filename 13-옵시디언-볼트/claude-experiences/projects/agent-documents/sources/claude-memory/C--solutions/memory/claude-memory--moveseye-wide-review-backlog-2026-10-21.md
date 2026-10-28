---
name: moveseye-wide-review-backlog-2026-10-21
description: "10-21 MovesEye 전반 검수 R1~R8 + 설계 개선 6건 — R1~R4 10-23 완료·푸시, R5~R8 남음"
metadata:
  node_type: memory
  type: project
  originSessionId: eee4683d-0280-4673-9a67-5cecb7771b95
  modified: 2026-10-21T04:11:55.419Z
---

정본: `_workspace/verification/review-20261021/review_moveseye-wide.md` (기준 BE `a9080eb`·FE `258d747`·AI `6eef23c`). 2026-10-21 사용자가 "나중에 할 목록"으로 정리 지시. 미착수.

**1순위(영향 넓음)** — ✅ 2026-10-23 둘 다 ZM-157로 커밋·푸시(BE `5599fa8`, FE `e34e671`). 처리 내용은 정본 문서 `## 처리 현황`. 🔴BE :3000 재기동 전엔 R2 미반영

- R2 높음 BE: 로그인·refresh가 해당 Zabbix 사용자의 **모든** API 토큰을 삭제(`AuthService` → `ZabbixTokenServiceImpl.deleteAllTokensByUserId`). MovesEye 소유 토큰만 추적·교체, 외부 토큰 보존 테스트.
- R1 높음 FE: `axiosInstance.ts` 중복 요청 자동 취소가 첫 Promise를 `new Promise(()=>{})`로 영구 대기(GET·POST 모두). GET은 Promise 공유, 취소는 reject, 쓰기는 자동 취소 제외.

**2순위** — ✅ 2026-10-23 R3 BE `d420340`·FE `abbd9fa`, R4 FE `808ecb6`(ZM-157, 푸시). R3 잘림 상태는 Redis `CLOUD_COST_SYNC_STATUS`

- R3 높음 BE: AWS 비용 페이지에 같은 날짜가 나뉘면 일별 TOTAL이 마지막 페이지 값으로 덮임(`CloudCostSyncService` + upsert `amount=EXCLUDED.amount`). 날짜×서비스 병합 후 1회 산출, truncated 상태 노출.
- R4 중간 FE: `setting.api.ts updateCloudInfraInformation`이 실패 envelope(HTTP 200)을 resolve → 성공 메시지·시크릿 입력 삭제. `isFailureEnvelope` 적용.

**3순위**
- R5 BE: `JwtAuthFilter` 락 첫 실패 뒤 재획득해도 재발급·반납 건너뜀.
- R6 BE: 아카이브 삭제 감사 행위자가 `?` → `ActorResolver` 재사용 + userId 기록.
- R7 BE: OTP 조회가 사용자 무관 `findFirst` → 같은 코드 충돌 시 정상 코드 거절.
- R8 FE CI: `.gitlab-ci.yml`이 고정 디렉터리 `git pull`+브랜치 checkout → 검증 SHA와 배포물 불일치. SHA checkout·artifact·test 단계.

**4순위(설계)**: mutation 실패 계약 통일, 인증과 Zabbix 토큰 확보 분리, refresh timeout, APM 알람 평가 외부 HTTP↔긴 트랜잭션 분리, 스케줄러 lease heartbeat/fencing, ActorResolver·unwrap 전역화.

**BE 전체 테스트 함정(10-23)**: IT 포함 전체 실행은 master에서도 210 클래스 부근 테스트 JVM OOM(힙 2g도 동일) → 변경 검증은 관련 패키지 `--tests`로. `ApmStuckRequestLedgerIT` 묶음 실행 시 간헐 실패(단독 통과).

**How to apply:** "남은 작업" 질문 시 APM 알람 잔여(6c·Flyway·병합 등) 다음에 이 목록을 꺼낸다. 착수 전 해당 코드가 바뀌었는지 위치부터 재확인. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-alert-channel-decision-2026-10-10|apm-alert-channel-decision-2026-10-10]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zm-151-156-backlog-sprint|zm-151-156-backlog-sprint]].


## 2026-10-25 진행
- R5 `c833166`·R6 `32cfeb8`·R7 `cb7d08c` master 푸시. R8은 지적 파일(.gitlab-ci.yml)이 미사용 — 삭제/Bitbucket 개선 여부 사용자 결정 대기.
- BE 전체 테스트 OOM 해소 `04d03af`: ArchUnit 테스트가 클래스 그래프를 각자 static 보유 → `support/ProductionClasses` 공유 + 컨텍스트 캐시 4. 🔴새 ArchUnit 테스트는 `ProductionClasses.get()`을 쓸 것.
- 순서 의존: FakeZabbixIT 워커 풀은 컨텍스트 공유 — 시작 전 풀 비우기 대기 추가. 남은 플래키: `ApmStuckRequestLedgerIT.latencyMatrixWithFiveSecondZabbix`(전체 실행에서만 실패).
- R3·R5·R7 런타임 반영엔 BE 재기동 필요(미실시).

- 2026-10-26 BE 재기동 후 R5·R7 런타임 확인 통과(동시 8건·락 반납 / OTP 응답 동일·정상 경로). R3은 유료 API라 미실측. R8은 여전히 결정 대기.
- 2026-10-26 R8 종료: `.gitlab-ci.yml` 삭제·푸시(FE a5a6ff6). Bitbucket 배포 개선은 사용자 결정으로 보류(복사 실패 대비가 1순위 후보). → R1~R8 전부 종료.
