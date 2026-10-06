---
title: MovesEye ADR 목록
doc_type: hub
audience: [기술 리더, 개발자, 운영자]
status: current
owner: MovesEye 팀
baseline: 2026-08-05
source_of_truth: C:/solutions/moveseye-docs/decisions
reviewed_at: 2026-08-05
review_cycle: quarterly
---

# ADR 목록

제품 동작이나 비용 구조를 장기간 구속하는 채택 결정을 기록한다. 작업 일지는 Obsidian에, 최종 결정은 ADR에 둔다. 새 ADR은 [ADR 템플릿](../%ED%85%9C%ED%94%8C%EB%A6%BF/ADR-%ED%85%9C%ED%94%8C%EB%A6%BF.md)을 사용한다.

## 채택된 결정

- [ADR-0001 문서 정본과 Obsidian 경험 Vault 분리](ADR-0001-%EB%AC%B8%EC%84%9C-%EC%A0%95%EB%B3%B8%EA%B3%BC-%EC%98%B5%EC%8B%9C%EB%94%94%EC%96%B8.md)
- [ADR-0002 역할 권한의 BE 강제와 사용자 세대 기반 세션 회수](ADR-0002-%EC%97%AD%ED%95%A0-%EA%B6%8C%ED%95%9C-BE-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%EC%84%B8%EB%8C%80.md) — 2026-09-17, ZM-157(소스 기준, 미배포)

## 번호 규칙

`ADR-0001-short-title.md`처럼 순차 번호를 사용한다. 문서 생명주기는 `status`, 결정 상태는 `decision_status`로 분리한다. 결정 상태는 `proposed`, `accepted`, `superseded`, `rejected` 중 하나다. 대체된 ADR은 삭제하지 않고 `superseded_by`를 연결한다.

## 승격 후보

- Spring Boot 단일 백엔드 채택
- 수집 엔진 in-process port/adapter와 server 분리 유예
- app → engine-zabbix compile 의존 차단
- 지도 좌표의 Zabbix inventory 단일 원천
- User Group–Host Group 데이터 범위 모델
