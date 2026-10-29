---
name: member-allocation
description: "프로젝트 인력 참여 기간·투입률(계획 기반 모드) 설계 v1.1 — 2026-09-22 Codex 검토 반영, 구현 전. 핵심 결정(D7 기간 외 워크로그 분리·D12 revision·D18 명단 기반 인력 분석·비용은 P3 후순위)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d7ad1f1a-365b-4bb6-a4a4-bd29b93a2c89
  modified: 2026-09-22T05:18:07.863Z
---

설계서: `_workspace/member-allocation/DESIGN.md` v1.1 (Codex 검토 원문 `codex_review.md`). 브랜치 후보 RFC-201. **구현 전**.

배경: `projectusers`에 기간 컬럼이 없어 "참여 기간" = 프로젝트 기간(급여 월할·AC·전사 가동률 합집합·참여 수 전부). 워크로그 없는 조직에서 인력·공수 축이 0이라 사용자가 "관리자만 쓰면 의미 없다"고 지적 → 참여 기간+투입률로 **계획 기반 모드**(계획 MD·계획 부하·미배정 가용)를 만들기로.

핵심 결정: 3컬럼(`joined_at/left_at/allocation_pct`) + 내부 배열 정규화(D15) · `project.assignment_revision`을 캐시 키·스냅샷에(D12) · `asOfDate` 진입점 1회(D13) · 기간 외 워크로그는 총 실적에만, 비율 지표 제외(D7) · 투입률은 계획에만, 가동률 분모 미적용(D2) · PROJECT 급여는 고정 총액 `costBasis` 명시(D14) · 인력 분석 결과 = 명단 ∪ 워크로그 작성자(D18) · 상속은 "프로젝트 기간 사용" 체크 → null 저장(D22).

단계: P0 모델+편집 UI → P1 계획 capacity → P2 실제 가동률 분모 → P3 비용(잔차 보정·burnRate 재정의) → P4 스냅샷·위젯. 비용은 D7·D14·D12가 코드로 닫힌 뒤에만.

**Why:** 사용자 요청(2026-09-22): "참여 기간이랑 투입률 같이 묶어서 설계서로, 코덱스랑 논의해서 강화". Codex 상위 5개 지적 전부 채택, 플래그·schemaVersion·감사 로그·수요 비교는 보류(과설계).

**How to apply:** 구현 시 §4 소비처 매트릭스 순서대로. `p.start_date/end_date`를 멤버 기간으로 직접 쓰는 코드는 전부 `MemberPeriod.js`로. 같은 이름 지표 분모 일치 검증을 P2·P3 끝에. 관련: [[project-work-assignment]], [[project-salary-policy]], [[project-portfolio-dashboard]].
