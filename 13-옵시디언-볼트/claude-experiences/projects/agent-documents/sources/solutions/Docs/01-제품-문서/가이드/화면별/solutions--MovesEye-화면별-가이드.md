---
title: MovesEye 화면별 가이드
doc_type: guide-index
audience: [사용자, 운영자, 관리자, 지원 담당자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: moveseyee_fe/src/layouts/app/SideNav.tsx + 각 page 컴포넌트
reviewed_at: 2026-08-11
review_cycle: monthly
---

# MovesEye 화면별 가이드

제품의 **사이드바 메뉴 구조 그대로** 각 화면의 사용법을 정리한 문서 모음이다. 화면을 보면서 해당 문서를 찾을 수 있도록 메뉴 이름과 파일 이름을 일치시켰다.

- 기능의 동작 원리와 알려진 문제점은 [기능별 상세 가이드](../%EA%B8%B0%EB%8A%A5/solutions--MovesEye-%EA%B8%B0%EB%8A%A5%EB%B3%84-%EC%83%81%EC%84%B8-%EA%B0%80%EC%9D%B4%EB%93%9C.md) — 2026-10-06 소스 기준이며, 아래 표의 메뉴 위치·주소 중 현재와 다른 곳은 그 문서의 "메뉴 전체 지도"와 각 문서 5절을 따른다
- 전체 흐름과 공통 원칙은 [사용자 가이드](../solutions--%EC%82%AC%EC%9A%A9%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- 설정·운영 관점은 [관리자 가이드](../solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- 증상별 해결은 [문제 해결 가이드](../solutions--%EB%AC%B8%EC%A0%9C-%ED%95%B4%EA%B2%B0.md)

## 공통 원칙 (모든 화면에 적용)

이 다섯 가지는 화면마다 반복하지 않으니 먼저 익혀 둔다.

1. **메뉴와 데이터는 권한에 따라 달라진다.** 메뉴가 보여도 목록이 비었다면 호스트 그룹 데이터 범위가 없는 것이다.
2. **빈 값과 0은 다르다.** `-`, `N/A`, 빈 차트는 "관측값 없음"일 수 있다.
3. **성공 메시지가 반영을 보장하지 않는다.** 저장·동기화 후 목록과 상세에서 실제 값을 확인한다.
4. **기준 시각을 본다.** 화면의 `syncTime`이나 갱신 시각으로 데이터 신선도를 판단한다.
5. **조회 기간을 바꾸면 요약과 차트의 집계 구간이 함께 바뀐다.**

## 화면 목록

### 홈

| 메뉴 | 문서 |
|---|---|
| 홈 | [홈](solutions--%ED%99%88.md) |

### 모니터링

| 메뉴 | 문서 |
|---|---|
| 모니터링 > 호스트 그룹 | [호스트 그룹](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%ED%98%B8%EC%8A%A4%ED%8A%B8-%EA%B7%B8%EB%A3%B9.md) |
| 모니터링 > 서버 모니터링 | [서버 모니터링](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%84%9C%EB%B2%84-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md) |
| 모니터링 > 네트워크 모니터링 | [네트워크 모니터링](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md) |
| 〃 > 클라우드 인프라 > AWS 리소스 > VPC 그룹 목록 | [VPC 그룹 목록](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-VPC-%EA%B7%B8%EB%A3%B9-%EB%AA%A9%EB%A1%9D.md) |
| 〃 > 클라우드 인프라 > AWS 리소스 > EC2 대시보드 | [EC2 대시보드](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md) |
| 〃 > 클라우드 인프라 > AWS 리소스 > EC2 목록 | [EC2 목록](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%ED%81%B4%EB%9D%BC%EC%9A%B0%EB%93%9C-EC2-%EB%AA%A9%EB%A1%9D.md) |
| 〃 > 어플리케이션 모니터링 (APM 개요·서비스·서비스 맵·트레이스 탐색·합성 감시·수집기) | [어플리케이션 모니터링](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md) |
| 〃 > 어플리케이션 모니터링 > 수집기 (온보딩 절차) | [수집기 설치](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md) |
| 〃 > DB / GPU 모니터링 | [준비 중인 모니터링](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%A4%80%EB%B9%84-%EC%A4%91%EC%9D%B8-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md) |

### 자산 관리

| 메뉴 | 문서 |
|---|---|
| 자산 관리 > 자산 목록 | [자산 목록](%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EC%9E%90%EC%82%B0-%EB%AA%A9%EB%A1%9D.md) |
| 자산 관리 > 비용 | [비용](%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EB%B9%84%EC%9A%A9.md) |
| 자산 관리 > 맵 > 네트워크 맵 | [네트워크 맵](%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC-%EB%A7%B5.md) |
| 자산 관리 > 맵 > 지리 맵 | [지리 맵](%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EC%A7%80%EB%A6%AC-%EB%A7%B5.md) |

### 이벤트/알림

| 메뉴 | 문서 |
|---|---|
| 이벤트/알림 > Problem | [Problem](%EC%9D%B4%EB%B2%A4%ED%8A%B8-%EC%95%8C%EB%A6%BC/solutions--%EB%AC%B8%EC%A0%9C-Problem-%ED%99%94%EB%A9%B4.md) |
| 이벤트/알림 > 호스트 그룹별 | [호스트 그룹별](%EC%9D%B4%EB%B2%A4%ED%8A%B8-%EC%95%8C%EB%A6%BC/solutions--%ED%98%B8%EC%8A%A4%ED%8A%B8-%EA%B7%B8%EB%A3%B9%EB%B3%84.md) |

### Zabbix 관리

> 이 그룹은 `ZABBIX_ADMIN` 능력을 가진 데이터소스가 연결됐을 때 나타난다. 다른 소스가 추가되면 그 소스에 맞는 관리 화면이 따로 제공된다.

| 메뉴 | 문서 |
|---|---|
| Zabbix 관리 > 호스트 관리 | [호스트 관리](%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC/solutions--%ED%98%B8%EC%8A%A4%ED%8A%B8-%EA%B4%80%EB%A6%AC.md) |
| Zabbix 관리 > 템플릿 관리 | [템플릿 관리](%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC/solutions--%ED%85%9C%ED%94%8C%EB%A6%BF-%EA%B4%80%EB%A6%AC.md) |
| Zabbix 관리 > 아이템 관리 | [아이템 관리](%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC/solutions--%EC%95%84%EC%9D%B4%ED%85%9C-%EA%B4%80%EB%A6%AC.md) |
| Zabbix 관리 > 트리거 관리 | [트리거 관리](%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC/solutions--%ED%8A%B8%EB%A6%AC%EA%B1%B0-%EA%B4%80%EB%A6%AC.md) |
| Zabbix 관리 > 사용자 관리 | [사용자 관리](%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC/solutions--%EC%82%AC%EC%9A%A9%EC%9E%90-%EA%B4%80%EB%A6%AC.md) |

### 설정

| 메뉴 | 문서 |
|---|---|
| 설정 > 마이 페이지 | [마이 페이지](%EC%84%A4%EC%A0%95/solutions--%EB%A7%88%EC%9D%B4-%ED%8E%98%EC%9D%B4%EC%A7%80.md) |
| 설정 > 리포트 관리 | [리포트 관리](%EC%84%A4%EC%A0%95/solutions--%EB%A6%AC%ED%8F%AC%ED%8A%B8-%EA%B4%80%EB%A6%AC.md) |
| 설정 > 기기분류 관리 | [기기분류 관리](%EC%84%A4%EC%A0%95/solutions--%EA%B8%B0%EA%B8%B0%EB%B6%84%EB%A5%98-%EA%B4%80%EB%A6%AC.md) |
| 설정 > 스케줄러 | [스케줄러](%EC%84%A4%EC%A0%95/solutions--%EC%8A%A4%EC%BC%80%EC%A4%84%EB%9F%AC.md) |
| 설정 > 데이터 소스 관리 | [데이터 소스 관리](%EC%84%A4%EC%A0%95/solutions--%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%86%8C%EC%8A%A4-%EA%B4%80%EB%A6%AC.md) |
| 설정 > 라이선스 | [라이선스](%EC%84%A4%EC%A0%95/solutions--%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4.md) |
| 설정 > 연결된 앱 (외부 AI 앱 MCP 연결) | [연결된 앱](%EC%84%A4%EC%A0%95/solutions--%EC%97%B0%EA%B2%B0%EB%90%9C-%EC%95%B1.md) · 연결 절차는 [MCP 연결 가이드](../solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md) |

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-11 | 사이드바 구조 기준 화면별 가이드 25종 신설 |
| 2026-09-01 | 어플리케이션 모니터링(APM) 1단계 구현에 따라 [어플리케이션 모니터링](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)·[수집기 설치](%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md) 2종 신설, 준비 중인 모니터링은 DB·GPU만 |
| 2026-09-17 | [연결된 앱](%EC%84%A4%EC%A0%95/solutions--%EC%97%B0%EA%B2%B0%EB%90%9C-%EC%95%B1.md) 신설, [MCP 연결 가이드](../solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md) 링크 |
