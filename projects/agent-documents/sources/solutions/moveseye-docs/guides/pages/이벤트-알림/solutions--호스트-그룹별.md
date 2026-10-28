---
title: 호스트 그룹별
doc_type: page-guide
menu_path: 이벤트/알림 > 호스트 그룹별
route: /event-alert/by-hostgroup
audience: [운영자, 팀 리더]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: pages/event-alert/by-host-group/ByHostgroup.tsx, ByHostgroupDetail.tsx
reviewed_at: 2026-08-11
---

# 호스트 그룹별

> **사이드바** 이벤트/알림 > 호스트 그룹별
> **경로** `/event-alert/by-hostgroup` → 상세 `/:id`

## 무엇을 하는 화면인가

장애를 **조직·서비스 단위로 묶어** 보는 화면이다. [Problem](solutions--Problem.md)이 개별 장애 목록이라면, 이 화면은 "어느 그룹에 문제가 몰려 있는가"를 본다.

## 화면 구성

### 목록

호스트 그룹별 이벤트 집계를 표로 본다.

- **검색** — 호스트 그룹, 호스트 이름
- **기간 필터**
- 그룹별 발생 건수와 상태

### 상세 (그룹 선택 시)

해당 그룹의 이벤트 목록을 본다.

- **검색** — 호스트, problem name, 트리거 이름

## 사용 흐름

1. 기간을 정한다(주간·월간 회고라면 그에 맞춰).
2. 발생 건수가 많은 그룹을 찾는다.
3. 그룹 상세에서 **어떤 호스트·트리거가 반복되는지** 확인한다.
4. 반복 원인이 명확하면 트리거 임계값 조정이나 근본 조치를 검토한다.

## 언제 이 화면을 쓰나

| 상황 | 이유 |
|---|---|
| 주간·월간 장애 회고 | 그룹 단위 집계가 보고에 맞다 |
| 특정 팀의 담당 범위 점검 | 호스트 그룹이 대개 조직 단위와 일치한다 |
| 알람 노이즈 찾기 | 한 그룹에서 반복 발생하는 트리거를 식별한다 |

## 주의할 점

- 집계에는 **내 권한 범위의 그룹만** 포함된다. 전사 집계가 필요하면 전체 권한 계정으로 봐야 한다.
- 기간을 넓히면 조회가 느려진다. 필요한 범위만 지정한다.
- 건수가 많다고 항상 심각한 것은 아니다. **낮은 심각도의 반복 알람**이 건수를 부풀릴 수 있으므로 심각도와 함께 본다.

## 관련 문서

- [Problem](solutions--Problem.md)
- [호스트 그룹 모니터링](../%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%ED%98%B8%EC%8A%A4%ED%8A%B8-%EA%B7%B8%EB%A3%B9.md)
- [트리거 관리](../Zabbix-%EA%B4%80%EB%A6%AC/solutions--%ED%8A%B8%EB%A6%AC%EA%B1%B0-%EA%B4%80%EB%A6%AC.md)
