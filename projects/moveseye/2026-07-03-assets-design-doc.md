---
tags: [moveseye, assets, design, confluence]
updated: 2026-07-03
---

# 2026-07-03 — 자산관리(Assets) 메뉴 통합 설계 정의서 작성

## 무슨 일
- Confluence ZM(MovesEye) 스페이스의 자산관리 기획 5건을 Atlassian MCP로 스캔하여 **통합 설계 정의서** 작성.
  - `01. Assets` / `01-1. Cost - 컨셉` / `01-2. Maps` (+연계: `[자산목록] 엑셀업로드`, `자산관리 기능(Zabbix Inventory)`)
- 산출물: **`C:\solutions\_workspace\design_assets-management.md`** — 무브스아이 자산관리 메뉴 개발의 기준 문서. (Vault 사본: [[assets-design-spec]])

## 설계 요지
- 자산관리 = **Assets(인벤토리 CRUD) + Costs(비용 모니터링) + Maps(Network/Geo/Clustering)** 3개 서브 도메인.
- 축이 되는 관계: **Asset ↔ Host = 0:1 or 1:1** (`linkedHostId`, coverage=monitored/unmonitored 시스템 산출). Asset ↔ Cost 1:N. Asset의 위경도(locationLat/Lon)가 Geo Maps 좌표 소스.
- platform(`onpremise`/`cloud`)에 따라 HW 필드 ↔ AWS 필드 폼/상세 분기. AWS 자동수집(import) 데이터는 수정 불가.
- Cost 지표는 계산식까지 기획에 확정되어 있음(KPI tile·도넛·bar별 산정식). CUR은 일 단위 refresh(실시간 아님).
- Maps: Network Maps 완료 / Geo Maps 진행중(live doc). Geo는 트리거 배치 미지원 — Problem 아이콘으로 대체.

## 교훈 / 함정
- **Confluence 화이트보드는 Atlassian MCP로 못 읽는다** (page 타입만 지원, whiteboard ARI는 404). User Flow·API Sequence 3건이 화이트보드에만 있어 설계서에 공백으로 표시 — 브라우저(claude-in-chrome)로 캡처하거나 수동 확인 필요. 이번엔 확장 미연결로 실패.
- 기획서 간 상호참조가 많아(스마트링크) 단일 페이지만 보면 Excel 업로드 type(zabbix/custom)·Inventory item key 매핑 같은 핵심이 빠진다 — 연계 페이지까지 따라가서 스캔해야 함.
- 미확정 11건을 설계서 §6에 표로 정리(생성/편집 API 시퀀스 미정의, lifecycleStatus `expired` 여부, budget 관리 기능 부재, Maps 수치 N/M 미정 등) — 개발 착수 전 기획 확인 필요.

## 다음
- 화이트보드 3건 확인 후 설계서 보강 → BE 엔티티(asset/cost/budget/activity_log/map) 설계 → [[2026-06-02-zabbix-sync-audit]]에서 제기된 호스트 JSONB 정규화와 연결 검토.

관련: [[moveseye]] · [[moveseye-overview]] · [[zabbix-agent-item-keys]]
