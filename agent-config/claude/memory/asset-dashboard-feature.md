---
name: asset-dashboard-feature
description: "자산 관리 > 자산 현황 대시보드(ZM-116) — 2026-08-26 설계→격리 worktree(C:/worktrees/zm-116-be|fe) 하네스 구현→QA→커밋·리베이스·코덱스 검수 반영 완료(로컬 병합 완료 BE ZM-79=0e2aad5·FE master=fb878fa, 미푸시). 비용 대시보드와의 경계·데이터 품질이 본체라는 결정·실측 프로필"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2e70ea6a-09df-4f5c-8a78-5575dcb760e3
  modified: 2026-08-26T01:23:29.394Z
---

**상태(2026-08-26)**: 완료 — 2차 리베이스 후 BE `0e2aad5`(onto ZM-79@e6e3199)·FE `a54e875`+`fb878fa`(onto master@a8cae71). worktree 제거 후 **로컬 ff 병합 완료**(사용자 지시): FE `master`=`fb878fa`, BE `ZM-79`=`0e2aad5`(BE 로컬 `master`는 8/20 6dfd275로 정체 — 사용자가 'master'라 해도 BE 실질 메인은 ZM-79, 확인 후 진행했음). 병합 시 다른 세션 미커밋 1줄(CostService 주석)과 겹쳐 pathspec stash→merge→pop으로 보존. 미푸시(사용자 직접). 다른 세션 worktree zm-114·zm-118은 손대지 않음(zm-114는 `git cherry` 전부 `+`라 완료 판정 불가). 코덱스 검수(`codex exec --sandbox read-only -` BE·FE 병렬): BE 🔴0/🟡5(전부 기지 한계, 후속)·FE 🔴2/🟡2 반영. 🔴 검수가 잡은 것: live 상태 조각 클릭이 coverage=monitored로 확장(상태 목록 축 없음→클릭 제거) · 완성도 막대 링크 대상이 막대 건수와 다른 항목 6개(문구를 런타임 비교로). 알려진 한계: 가로막대 canvas 드릴다운 마우스 전용. 검수 문서 `_workspace/features/assets/asset-dashboard/review_asset-dashboard.md`. 🔴 Gradle 멀티모듈에서 `--tests` 필터는 `:test`(app 모듈)로 지정할 것 — 루트 `test`는 engine-zabbix에 매칭 0건이라 BUILD FAILED로 오인. 잔여: 코덱스 검수 · M2(목록 축 expiryWindow/osFamily/hostLinked·위치/벤더 위젯·인벤토리 일괄 활성화·홈 위젯 2종) · worktree 정리는 사용자 결정.

**무엇**: 자산 관리 메뉴 첫 항목 `/asset/dashboard`. 설계 정본 `_workspace/devdesign_asset-dashboard.md`(2026-08-26 v1), 계약 `_workspace/features/assets/asset-dashboard/contract_asset-dashboard.md`. 단일 EP `GET /assets/dashboard`(필터 6축 URL query, filterOptions는 필터 적용 전 모집단, `live`만 부분 성공 null).

**핵심 결정**
- 형제 화면 **비용 대시보드**(`/asset/cost?tab=dashboard`)는 돈의 질문, 이 화면은 **구성·품질·상태**의 질문. 만료는 여기선 건수만·같은 계산기(`CostParamResolver`), 금액은 링크. `owner_missing/host_unlinked/cost_missing` 판정은 `AssetQualityPolicy`로 두 화면이 공유.
- 🔴 **본체는 C. 데이터 품질**(완성도 10항목 균등 + 작업 큐 태그 9종). 실측(dev 79건)이 결정: 미분류 78%, vendor 1·model 3·location 0·date_hw_* 0건 → 분포 도넛은 성립 안 함, "미입력" 조각을 1급 값으로. `inventory_mode=-1`이 33건 → 동기화해도 인벤토리 영영 안 옴(태그 `inventory_disabled`). 분류 태그 키가 두 벌(`device-type:서버` 32 vs `device_type:server` 15)이 미분류 원인(태그 `classification_tag_mismatch`).
- 차트는 전부 막대(도넛 없음, dataviz 규칙: 근접값 비교엔 도넛 금지), 호스트그룹 다중 소속이라 합≠자산 수 명시, `created_at` 추정 취득일은 "미상".
- 미결 Q1~Q9는 사용자 지시("설계 완료되면 하네스로 구현")로 제안 기본값 채택.

**격리 작업 방식(사용자: "다른 세션 영향 안 받게")**: 레포별 `git worktree add C:/worktrees/zm-116-{be,fe} -b ZM-116 HEAD`(기존 zm-114 관례 따름), `.env` 복사 후 BE `PORT=3001`·FE `VITE_API_URL=localhost:3001`, FE는 `--port 5174`. 기동 스크립트는 scratchpad `_run_be_3001_zm116.ps1`. 메인 체크아웃 :3000/:5173은 다른 세션이 점유. 커밋은 worktree 브랜치 `ZM-116`에서, 승인 후([[commit-requires-approval]]).

**Why:** 병행 세션 커밋이 내 커밋을 되돌린 사고([[zabbix-wrapper-gaps]]) 재발 방지. **How to apply:** 이 기능 후속 작업은 worktree 경로에서만, 완료 후 `git worktree remove`는 사용자 확인 후.

관련: [[asset-cost-design]] [[assets-core-devdesign]] [[home-widget-dashboard]] [[fe-page-remount-on-navigate]] [[codex-review-handoff]]

🔴 **후기(2026-08-26 ZM-119)**: "계약 §5 실응답 픽스처를 tsc가 강제" 주장은 **게이트 허위**였다(tsc가 __tests__ 제외) — [[fe-contract-fixture-gate]]. ZM-119에서 `npm run typecheck:contract`로 실제 게이트 신설 후 ZM-116 픽스처의 누락 2건이 잡혔다.
