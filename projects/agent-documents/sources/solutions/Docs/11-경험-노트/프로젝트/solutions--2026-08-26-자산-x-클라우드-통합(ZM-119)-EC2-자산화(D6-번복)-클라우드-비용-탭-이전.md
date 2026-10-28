# 2026-08-26 — 자산 × 클라우드 통합(ZM-119): EC2 자산화(D6 번복) + 클라우드 비용 탭 이전

> 프로젝트 [[projects/moveseye/moveseye|moveseye]] · 설계 `_workspace/designs/devdesign_asset-cloud.md` · 계약 `_workspace/contract_asset-cloud.md` · 검수 `_workspace/review_asset-cloud.md`
> 선행: [[projects/moveseye/2026-08-26-asset-dashboard|2026-08-26-asset-dashboard]](같은 날 ZM-116, 같은 격리 방식) · `devdesign_cloud-cost-optin.md`(D6)

## 무엇을 했나

요청: "클라우드 비용은 자산관리 쪽으로 옮기고, 자산관리에 클라우드까지 더해서 구현 — 기존 설계 토대로 보강".
확인 질문 4개(티켓 ZM-119 · 완전 이동 · 자동 upsert+수동 · CE 인스턴스 귀속 제외) → 보강 설계 v1 → 격리 worktree(zm-119) 하네스 구현 → 정적/런타임 QA → 코덱스 검수(BE 🔴4/🟡2·FE 🟡4 → 반영) → 재검증 → 커밋(BE `81c1999`·FE `1e841b3`).

## 결정과 근거

1. **D6 번복의 근거를 먼저 썼다.** "EC2를 자산으로 자동 생성하지 않는다"는 파급 우려였지, 기획 정본(§1.1 Cloud+On-prem 통합)이 배제한 게 아니다. 파급은 assets-core의 편집 소유권 규칙(`cloud_data`=동기화 소유, 사용자 필드 불가침)으로 흡수된다.
2. **AWS 추가 호출 0** — 5분 스냅샷 배치가 이미 받은 `Instance` 리스트를 SPI 리스너(`aws/spi/InstanceSnapshotListener`)로 자산 동기화에 넘긴다. 패키지 방향 `aws ← asset ← cost`를 지키려 aws가 asset을 import하지 않게 역전.
3. **결정 #11 개정** — HW 비용 모집단 `source != cloud`. 진짜 cloud 자산이 생기는 순간 HW 미입력 큐가 EC2로 가득 찬다는 것을 실측 전에 설계에서 잡았다.
4. **KRW·USD 합산 금지** — 대시보드는 나란히. 기획의 Platform allocation은 자산 수 기준으로만.
5. 사유 코드를 단계별로 분리(`AWS_UNAVAILABLE`=AWS 단계 / `SYNC_FAILED`=저장 단계 / `ASSET_SYNC_NO_SOURCE`·`ASSET_INVALID_SYNC_SOURCE`) — 뭉치면 원인을 엉뚱한 데서 찾는다(아래 교훈).

## 교훈

- 🔴 **"환경이 원래 그렇다"는 내가 환경을 안 바꿨을 때만 유효하다.** BE 에이전트가 기동 스크립트를 구 Nest `.env`(다른 암호화 키)로 바꿔 놓고 "dev DB 시크릿 복호화 불가 = 선재 문제"로 오진 → "AWS 실연동 미검증"으로 보고. 다른 세션 :3000/:3002가 멀쩡히 도는 것이 반증이었다. Spring `.env`가 정본([[dev-runtime-startup]]).
- 🔴 **첫 실측의 `AWS_UNAVAILABLE`은 자격증명이 아니라 배치/수동 create 경합**(리전 팬아웃 14.9초 창 안에 수동 경로 진입 → 유니크 충돌)이었다. 설계에 "회차는 겹치지 않는다"고 써 놓고 코드가 강제하지 않았다. 사유 코드가 뭉뚱그려져 진단을 오도.
- 🔴 **ZM-116의 "계약 픽스처를 tsc가 강제" 게이트는 허위였다** — `tsconfig`가 `src/__tests__`를 exclude + `isolatedModules`. `tsconfig.contract.json` + `npm run typecheck:contract`로 진짜 게이트를 만드니 ZM-116 픽스처 누락 2건이 즉시 잡혔다([[fe-contract-fixture-gate]]). "게이트"라고 부르려면 실패하는 것을 한 번 봐야 한다.
- 🔴 **코덱스 검수가 잡은 4개 결함은 전부 "규칙은 설계에 있는데 코드가 한 경로만 지킨 것"**: 사용자 `retired`를 배치가 `active`로 되돌림(강제값과 사용자값 구분 표식 부재) · PATCH↔배치가 엔티티 전체 저장이라 마지막 커밋 승리(`manual_cleared` 유실) · 전체 리전 실패를 부분 실패로 보고 · `GET /costs/hw/{id}` fallback이 cloud 자산 상각 생성. 자기 QA 2종(정적 38 PASS·런타임 12 PASS)이 다 통과한 뒤에 나왔다 — **판정 규칙 표의 각 행마다 "모든 경로에서?"를 묻는 검수 관점**은 자기 QA와 다르다.
- Python `open(path,'w')`는 write 전에 파일을 비운다 — 이모지 서로게이트 `UnicodeEncodeError`로 Java 파일이 잘렸다(즉시 `git checkout --` 복구). 한글/이모지 있는 파일은 Edit 도구로([[bash-heredoc-eats-backslash]] 계열).
- Gradle 멀티모듈 `--tests` 필터는 `:test`(app 모듈)로 — 루트 `test`는 engine-zabbix에서 "No tests found"로 BUILD FAILED가 나 실패로 오인.
- 공유 dev DB에서 다른 세션이 스케줄러 lease를 쥐면 내 :3001에선 5분 배치가 `skipped` — 배치 검증은 수동 경로로 대체하고 "결함 아님"을 명시.
- 격리 worktree 방식(ZM-116과 동일)이 두 번째도 먹혔다. 단 에이전트가 **추적 파일 `start_3001.ps1`을 고치고 worktree에 잡파일**을 만들어 범위 밖 diff가 생겼다 — 커밋 전 `git status`에서 `src/` 밖 항목을 반드시 본다.

## 잔여
- ✅ 코덱스 BE 🔴4·🟡2 + FE 🟡4 반영 → 재검증 8/8 → 승인 후 커밋 BE `81c1999`·FE `1e841b3`(2026-08-27, 미푸시). → 후속 ZM-119 드릴다운과 함께 리베이스·로컬 병합·worktree 제거 완료(2026-08-27). 푸시는 사용자.
- M2(설계 §8): missing 30일 자동 제외 · RDS/EBS/EIP 자산화 · 태그→분류/소유자 매핑 · `cloud_missing` 태그 · Cloud Cost Detail · `failedRegions` 이름 배열(FE-1).
