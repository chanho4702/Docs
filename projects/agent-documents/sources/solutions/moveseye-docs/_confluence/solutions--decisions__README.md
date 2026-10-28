# MovesEye ADR 목록

| 항목 | 내용 |
|---|---|
| 대상 독자 | 기술 리더, 개발자, 운영자 |
| 문서 상태 | current |
| 관리 주체 | MovesEye 팀 |
| 기준일 | 2026-08-05 |
| 최종 검토 | 2026-08-05 |
| 검토 주기 | quarterly |
| 정본 위치 | C:/solutions/moveseye-docs/decisions |

# ADR 목록

제품 동작이나 비용 구조를 장기간 구속하는 채택 결정을 기록한다. 작업 일지는 Obsidian에, 최종 결정은 ADR에 둔다. 새 ADR은 **ADR 템플릿**을 사용한다.

## 채택된 결정

- **ADR-0001 문서 정본과 Obsidian 경험 Vault 분리**

## 번호 규칙

`ADR-0001-short-title.md`처럼 순차 번호를 사용한다. 문서 생명주기는 `status`, 결정 상태는 `decision_status`로 분리한다. 결정 상태는 `proposed`, `accepted`, `superseded`, `rejected` 중 하나다. 대체된 ADR은 삭제하지 않고 `superseded_by`를 연결한다.

## 승격 후보

- Spring Boot 단일 백엔드 채택
- 수집 엔진 in-process port/adapter와 server 분리 유예
- app → engine-zabbix compile 의존 차단
- 지도 좌표의 Zabbix inventory 단일 원천
- User Group–Host Group 데이터 범위 모델
