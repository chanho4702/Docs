---
name: apm-scale-observability-gap
description: "APM 데이터량이 승격 임계값에 얼마나 가까운지 고객 설치본을 우리가 볼 방법이 없음(09-21 기록, 미착수, 판단 보류)"
metadata: 
  node_type: memory
  type: project
  originSessionId: da79ce82-aa1e-4b61-b389-8c9157fc38a2
  modified: 2026-09-21T00:24:31.792Z
---

2026-09-21 사용자 질문("APM 1주일치 저장 중인데 인프라 분리 고민")에서 이어진 진단. 코드 수정 0건, 기능화 여부 미결정 — "나중에 판단"하기 위한 기록.

**발견**: `devdesign_apm.md` §4.6에 PostgreSQL→분리(ClickHouse 등) 승격 조건이 이미 있음(일 2천만 행 검토·3,500만 행 착수, 화면 체감 서비스목록 cold p50>3초·6시간 RED>1.5초가 용량보다 먼저 옴). `ApmMetricStore` 인터페이스로 저장소 교체 자체도 이미 가능하게 분리돼 있음 — **아키텍처는 한계 대응책을 갖고 있음.**

**진짜 문제**: moveseye는 설치형이라 **고객사 실제 설치본의 APM 데이터량(서비스·인스턴스 수, 일별 행수)을 우리가 볼 방법이 없다.** 코드 전체에 phone-home/usage-report 채널 없음(있는 건 고객이 자기 AI 계정 사용량 보는 기능뿐, 우리에게 보고 아님 — `aimonitor/provider/` 검색으로 확인). dev DB(5433, self-monitoring 테스트 데이터, env=local 서비스 2개)로 실측한 결과 기준선의 1/45 수준(일 31만 행)이었지만 이건 우리 내부 테스트일 뿐 고객사 근거는 못 됨.

**리스크 재정의**: "지금 구조로 못 버틴다"가 아니라 **"특정 고객사가 이미 승격 임계값을 넘었어도 우리가 모를 수 있다"** — 아키텍처 결함이 아니라 관측 공백(observability gap).

**후보 대응(미결정, 판단 보류)**: 고객 설치본이 자체적으로 확인할 수 있게 설정 화면에 "일일 수집량 / 권장 상한 대비 %" 같은 자가진단 표시를 추가하는 안. 구현 여부·형태는 미정 — 사용자가 나중에 판단하겠다고 함.

**Why:** 자빅스 기생·설치형이라 고객 환경마다 규모가 다른데([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--architecture-onprem-scaleout-audit|architecture-onprem-scaleout-audit]]의 "코드는 설치형인데 배포는 SaaS" 진단과 같은 결의 문제) 우리 쪽엔 그 다양성을 확인할 피드백 채널이 없음.
**How to apply:** 착수 여부를 묻기 전에 이 메모리부터 확인. 착수한다면 자가진단 화면(설정 메뉴)이 가장 가벼운 시작점. [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-comprehension-backlog|apm-comprehension-backlog]](APM 이해도 개선 백로그)와 성격이 비슷해 같이 검토할 만함.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-implementation-progress|apm-implementation-progress]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-data-archiving-backlog|zabbix-data-archiving-backlog]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--self-monitoring-backlog|self-monitoring-backlog]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--architecture-onprem-scaleout-audit|architecture-onprem-scaleout-audit]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-comprehension-backlog|apm-comprehension-backlog]]
