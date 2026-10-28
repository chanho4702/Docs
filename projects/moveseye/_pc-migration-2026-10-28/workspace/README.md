# _workspace 문서 허브 (2026-10-19 기능 폴더 재편)

> 처음 읽는 분은 [통합 읽기 안내](../moveseye-docs/overview/start-here.md) → 옵시디언 [무브스아이 기능 지도](C:/Users/DMOVE/claude-experiences/projects/moveseye/무브스아이-기능-지도.md) 순서. 이 폴더는 **작업 증거**(설계·계약·보고·검수)이고, 제품 정본은 `moveseye-docs/`다.

## 구조 — 접두어 폴더가 아니라 기능 폴더

```
_workspace/
├─ features/<영역>/<기능>/      ← 한 기능의 설계·계약·보고·검수 요청서·QA·E2E·구현 메모를 한 폴더에
├─ _archive/features/<영역>/<기능>/  ← 같은 기능의 흔적: 코덱스 원시 출력·프롬프트·JSON·테스트 로그·패치
├─ planning/                     ← 기능 횡단 백로그·요구·스프린트(sprint-zm-151-156/)
├─ analysis/                     ← 감사·진단·조사(기능 횡단)
├─ guides/                       ← 핸드북·가이드·포트폴리오(apm-handbook/00-index.md부터)
├─ _archive/{scripts,logs,data,screenshots}/  ← 비문서 산출물
├─ _moved.tsv                    ← 재편 전 경로 → 새 경로 표 (코드 주석의 옛 경로는 여기서 찾는다)
└─ (워크트리 3개: apm-ux-fix-20261001 · lld-fix-20260908 · worktrees/ — git 등록 워크트리라 옮기지 않음)
```

### 영역(area) 14개 — 옵시디언 기능 지도 노드와 1:1

| 영역 폴더 | 기능 지도 노드 | 기능 폴더 |
|---|---|---|
| `home/` | 홈·공통 화면 틀 | home-widgets · custom-dashboard · chart-drilldown · design-system · error-ux · admin-console |
| `infra/` | 인프라 모니터링 | hostgroup-and-reports · host-checks · chart-incremental · report-management · scale-call-guard · fullscan-and-metric-refactor · kpi-strip |
| `events/` | 이벤트·알림 | zabbix-load-relief · lld-management · event-stats-history |
| `assets/` | 자산·비용 | assets-design · assets-core · asset-cost · asset-dashboard · asset-cloud · assets-demo |
| `maps/` | 네트워크·지리 맵 | network-maps · geo-maps · propagation-lens |
| `zabbix-config/` | Zabbix 구성 관리 | host-registration · item-template-mgmt · trigger-mgmt · classification-tags · macro · config-overview · managed-marker · agent-install-guide · drilldown-restructure · management-guide |
| `zabbix-ops/` | Zabbix 운영 관리 | discovery · alert-actions-media · proxy-management · monitoring-coverage |
| `cloud/` | 클라우드 AWS | aws-monitoring · snapshot |
| `apm/` | APM 조회·분석 / APM 수집·운영 | core · realtime · dashboards · self-explain · data-export · cold-archive · metric-allowlist · ingest-resilience · retention · deadlock-fixes · hardening-20261006 · alerts · full-review-20260928 · backlog |
| `ai/` | AI 어시스턴트·MCP | ai-assistant · ai-account-monitoring |
| `auth-license/` | 인증·권한·라이선스 | license · zm-157-permission · user-management |
| `platform/` | 설정·운영 기반 | collector-engine · data-archiving · redis-cache · architecture · zabbix-api-reference |
| `premium/` | 프리미엄 GPU·DB | gpu-monitoring · db-monitoring |
| `product-docs/` | 제품 문서·온보딩 | product-docs |

## 새 문서는 어디에

- **같은 기능의 문서는 같은 폴더**: `features/<영역>/<기능>/` 아래에 `devdesign_{기능}.md`(설계) · `contract_{기능}.md`(BE↔FE 계약) · `zm-NNN_*.md`(보고) · `review_{기능}.md`(검수 요청서, 결과는 `## 검수 결과(코덱스 vN)` 절) · `qa_`/`e2e_`(검증).
- **코덱스 원시 출력·프롬프트·JSON·테스트 로그·패치**는 `_archive/features/<영역>/<기능>/`에. 요청서에서 상대 링크로 가리킨다.
- 기능이 여러 영역에 걸치면 **주 영역** 하나에 두고 다른 영역의 기능 지도 노드에서 링크한다. 새 영역이 필요하면 이 표와 옵시디언 기능 지도에 함께 행을 추가한다.
- 이슈 묶음(스프린트)·제품 횡단 백로그·요구사항은 `planning/`, 감사·조사는 `analysis/`.
- 파일 이름 접두(`devdesign_`·`contract_`·`review_`·`qa_`·`e2e_`)는 그대로 쓴다 — 폴더가 바뀌었을 뿐 이름 규칙은 같다.

## 이동 규칙

- 문서를 옮기면 `_moved.tsv`에 한 줄 추가하고, `moveseye-docs`·옵시디언·메모리·하네스(`.claude/`)의 경로 참조를 함께 고친다. 코드 주석의 `_workspace/...` 경로는 고치지 않는다(245파일) — `_moved.tsv`로 찾는다.
- 다른 세션이 쓰고 있는 문서를 옮길 때는 옛 경로를 **하드링크**로 남긴다(2026-10-19: APM 알람 채널·장애 메뉴·legacy-hold·DB 모니터링 문서). 그 작업이 병합되면 옛 경로 링크를 지운다.
- 삭제하지 않는다. 쓸모가 끝난 문서는 `_archive/`로.

## 비문서 산출물

일회성 스크립트·로그·응답 샘플·토큰·쿠키는 scratchpad에 두고, 보존 가치가 있을 때만 `_archive/`로. credential·token은 문서에 쓰지 않는다.
