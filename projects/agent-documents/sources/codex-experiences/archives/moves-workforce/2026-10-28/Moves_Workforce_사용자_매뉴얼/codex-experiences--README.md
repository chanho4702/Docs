# Moves Workforce 사용자 매뉴얼

> **한·영 고객 가이드 편집본:** [Confluence 게시용 검토 초안](confluence/codex-experiences--README.md)에 고객 사용자·관리자 기준으로 재구성한 한국어·영어 21개 주제가 있습니다. 실제 staging 화면과 대조하기 전의 초안이며, [이미지 요청 목록](confluence/codex-experiences--image-requests.md)과 [검증·게시 준비 상태](confluence/codex-experiences--publication.md)를 함께 확인하세요.

| 항목 | 내용 |
|------|------|
| 버전 | v3.1 |
| 최종 현행화 | 2026-10-04 |
| 기준 소스 | `develop` + `RFC-204` 작업 트리 (2026-09-28), `static/ui/src`, `locales/kr`, `src/permission` |

> Jira(Atlassian)에 설치되는 **Moves Workforce** 앱의 사용 안내서입니다.
> 작업 시간(워크로그) 기록과 프로젝트별 인력·작업·인건비 관리, 진척·가동률 분석을 한 곳에서 처리할 수 있는 워크포스 관리 도구입니다.

> **기준선 주의:** 이 매뉴얼은 2026-09-28 개발 소스를 기준으로 하며, 운영 환경의 배포 시점에 따라 일부 화면이 아직 없을 수 있습니다. 실제 제공 기능은 [릴리스 노트](../codex-experiences--Moves_Workforce_%EB%A6%B4%EB%A6%AC%EC%8A%A4%EB%85%B8%ED%8A%B8.md)와 대상 환경의 배포 상태를 확인하세요.

> **그림에 대하여:** 각 페이지의 `그림 N-M`은 캡처 예정 자리입니다. 캡처 목록·촬영 조건은 [images/README.md](images/codex-experiences--README.md)에 있습니다. 파일이 아직 없으면 그림 자리에 깨진 이미지가 표시됩니다.

## 접근 권한

| 구분 | 필요 권한 |
|---|---|
| 이 목차 페이지 | **권한 불필요** |
| 각 화면의 권한 | 페이지마다 상단의 **접근 권한** 표를 확인하세요 |
| 권한 전체 요약 | [부록 B. 권한별 사용 범위](%EB%B6%80%EB%A1%9D/codex-experiences--B-%EA%B6%8C%ED%95%9C%EB%B3%84-%EC%82%AC%EC%9A%A9-%EB%B2%94%EC%9C%84.md) |
| 내 현재 권한 확인 | [마이페이지 > 내 권한](codex-experiences--03-%EB%A7%88%EC%9D%B4%ED%8E%98%EC%9D%B4%EC%A7%80.md#31-내-현황) (권한 불필요) |

**권한 표기 규칙**

권한 이름은 **[설정 > 권한 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--08-%EA%B6%8C%ED%95%9C-%EA%B4%80%EB%A6%AC.md) 화면에 표시되는 항목명**을 「 」 안에 그대로 씁니다.

| 표기 | 의미 |
|---|---|
| 「프로젝트 관리」 읽기 | 그 항목의 **읽기(Read)** 체크가 있어야 화면이 보입니다 |
| 「프로젝트 관리」 쓰기 | **쓰기(Write)** 체크가 있어야 추가·수정·삭제 버튼이 나타납니다 |
| A 또는 B | 둘 중 **하나만** 있어도 됩니다 |
| A + B | **둘 다** 있어야 합니다 |
| 권한 불필요 | 본인 데이터이거나 전역 공개 정보입니다 |
| Jira 권한 | 앱 권한과 **별개로** Jira 자체 권한이 필요합니다 |

> 권한이 없으면 대부분 **버튼·탭·메뉴가 아예 보이지 않습니다.** 서버에서도 같은 검사를 하므로 화면을 우회해도 거부됩니다.

---

## 이 문서를 읽는 법

각 페이지는 다음 순서로 구성됩니다.

1. **접근 권한** — 이 화면을 보고 편집하는 데 필요한 권한
2. **언제 쓰나** — 이 화면이 해결하는 문제
3. **화면 구성** — 어디에 무엇이 있는지 (그림 포함)
4. **절차** — 단계별 절차
5. **알아두기 / 주의** — 오해하기 쉬운 규칙
6. (필요 시) **문제 해결** — 증상과 원인

---

## 목차

### 1. [개요](codex-experiences--01-%EA%B0%9C%EC%9A%94.md)
제품 소개, 접속 방법, 메뉴 구성, 권한의 기본 개념, 공통 UI 규칙(주소 공유·링크 복사·패널 접기)

### 2. [My Work](codex-experiences--02-my-work.md)
상단 요약 지표, My 프로젝트, My 업무(캘린더 워크로그/이슈 모드·테이블), 업무일지 추가(시간 범위·기간 일괄)

### 3. [마이페이지](codex-experiences--03-%EB%A7%88%EC%9D%B4%ED%8E%98%EC%9D%B4%EC%A7%80.md)
내 현황 KPI, 기여 차트, 내 권한·스킬, 내 팀(팀장 전용)

### 4. [프로젝트 관리](codex-experiences--04-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EA%B4%80%EB%A6%AC.md)
프로젝트 목록·상세 드로어, 추가·수정(필요 스킬), 삭제 진행, 칸반 보드

### 5. [프로젝트 상세](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--README.md)

| 절 | 내용 |
|---|---|
| 5.1 [대시보드](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--01-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md) | 요약 카드 6종, 위젯 15종, 템플릿·전부 추가, 커스텀 필터 |
| 5.2 [인력 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--02-%EC%9D%B8%EB%A0%A5-%EA%B4%80%EB%A6%AC.md) | 담당 팀, 인력 목록, **급여 관리**, 작업 배정 |
| 5.3 [작업 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md) | 목록(계층·일괄 적용)·트리·간트·**맵**, 담당자/동료, 자동 편입(구독) |
| 5.4 [캘린더](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--04-%EC%BA%98%EB%A6%B0%EB%8D%94.md) | 워크로그/이슈 모드, 기간 미설정 이슈 |
| 5.5 [분석 및 리포트](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--05-%EB%B6%84%EC%84%9D-%EB%B0%8F-%EB%A6%AC%ED%8F%AC%ED%8A%B8.md) | 작업·인력·팀 분석, 진척률, 비용, 작업 이력 |
| 5.6 [문서 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--06-%EB%AC%B8%EC%84%9C-%EA%B4%80%EB%A6%AC.md) | Confluence 문서를 작업·프로젝트에 연결·분류, 문서 현황 |

### 6. [자원 관리](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--README.md)

| 절 | 내용 |
|---|---|
| 6.1 [인력 현황](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--01-%EC%9D%B8%EB%A0%A5-%ED%98%84%ED%99%A9.md) | 전사 인력 부하·스킬, 인력 상세 드로어 |
| 6.2 [조직 현황](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--02-%EC%A1%B0%EC%A7%81-%ED%98%84%ED%99%A9.md) | 계층형 팀 트리와 팀원 목록 |
| 6.3 [팀 분석](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--03-%ED%8C%80-%EB%B6%84%EC%84%9D.md) | 팀·프로젝트 교차 지표, 계층 롤업 |
| 6.4 [프로젝트 배정](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--04-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EB%B0%B0%EC%A0%95.md) | 적합도 기반 배정, 배정 관계도 |

### 7. [설정](07-%EC%84%A4%EC%A0%95/codex-experiences--README.md)

| 절 | 내용 |
|---|---|
| 7.1 [일반 설정](07-%EC%84%A4%EC%A0%95/codex-experiences--01-%EC%9D%BC%EB%B0%98-%EC%84%A4%EC%A0%95.md) | 근무시간·MM 기준·가동률 밴드·급여 정책 |
| 7.2 [인력 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--02-%EC%9D%B8%EB%A0%A5-%EA%B4%80%EB%A6%AC.md) | 사용자 등록, 엑셀 일괄 업로드, 팀장 표시 |
| 7.3 [팀 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--03-%ED%8C%80-%EA%B4%80%EB%A6%AC.md) | 조직 계층, 팀장(= 소속 팀원), 팀원 배치, 팀 권한 상속 |
| 7.4 [역할 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--04-%EC%97%AD%ED%95%A0-%EA%B4%80%EB%A6%AC.md) | 직무 정의 |
| 7.5 [등급 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--05-%EB%93%B1%EA%B8%89-%EA%B4%80%EB%A6%AC.md) | 등급과 급여 밴드 |
| 7.6 [스킬 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--06-%EC%8A%A4%ED%82%AC-%EA%B4%80%EB%A6%AC.md) | 직군별 스킬 사전 |
| 7.7 [프로젝트 상태 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--07-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%ED%83%9C-%EA%B4%80%EB%A6%AC.md) | 칸반 컬럼과 상태 흐름 |
| 7.8 [권한 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--08-%EA%B6%8C%ED%95%9C-%EA%B4%80%EB%A6%AC.md) | 권한 세트, 읽기/쓰기, 프로젝트 범위 |
| 7.9 [휴일 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--09-%ED%9C%B4%EC%9D%BC-%EA%B4%80%EB%A6%AC.md) | 공휴일과 가용률 |

### 8. [통합 대시보드 (전사)](codex-experiences--08-%ED%86%B5%ED%95%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md)
여러 프로젝트를 한 화면에서 비교 — T/S/R 신호등, 일정·범위·자원·비용 서브탭, 토폴로지

### 9. [워크로그 추출](codex-experiences--09-%EC%9B%8C%ED%81%AC%EB%A1%9C%EA%B7%B8-%EC%B6%94%EC%B6%9C.md)
Jira 전체 워크로그를 기간·프로젝트·작성자로 검색해 Excel로 내려받기

### 10. [Jira 이슈 화면의 Moves Workforce 패널](codex-experiences--10-jira-%EC%9D%B4%EC%8A%88-%ED%8C%A8%EB%84%90.md)
앱을 열지 않고 Jira 이슈 화면에서 공수 확인·워크로그 기록

### 부록

- [A. 용어집](%EB%B6%80%EB%A1%9D/codex-experiences--A-%EC%9A%A9%EC%96%B4%EC%A7%91.md)
- [B. 권한별 사용 범위 요약](%EB%B6%80%EB%A1%9D/codex-experiences--B-%EA%B6%8C%ED%95%9C%EB%B3%84-%EC%82%AC%EC%9A%A9-%EB%B2%94%EC%9C%84.md)
- [C. 변경 이력](%EB%B6%80%EB%A1%9D/codex-experiences--C-%EB%B3%80%EA%B2%BD-%EC%9D%B4%EB%A0%A5.md)
- [그림 캡처 계획](images/codex-experiences--README.md)

---

## 목적별 빠른 찾기

| 하고 싶은 일 | 페이지 |
|---|---|
| 오늘 일한 시간을 기록하고 싶다 | [2.4 업무일지 추가](codex-experiences--02-my-work.md#24-업무일지워크로그-추가하기) · [10. Jira 이슈 화면에서 기록](codex-experiences--10-jira-%EC%9D%B4%EC%8A%88-%ED%8C%A8%EB%84%90.md) |
| 여러 날치를 한 번에 기록하고 싶다 | [2.4 기간 입력](codex-experiences--02-my-work.md#방법-2-기간-입력일괄) |
| 내 이슈 일정을 달력에서 보고 싶다 | [2.3 캘린더 이슈 모드](codex-experiences--02-my-work.md#캘린더-뷰) |
| 프로젝트를 새로 만들고 싶다 | [4.1 프로젝트 목록](codex-experiences--04-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EA%B4%80%EB%A6%AC.md#프로젝트-추가--수정) |
| 프로젝트에 사람을 넣고 싶다 | [5.2 인력 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--02-%EC%9D%B8%EB%A0%A5-%EA%B4%80%EB%A6%AC.md) |
| 인건비가 0원으로 나온다 | [5.2 급여 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--02-%EC%9D%B8%EB%A0%A5-%EA%B4%80%EB%A6%AC.md#인건비가-0원으로-나올-때) |
| 여러 작업의 일정을 한 번에 바꾸고 싶다 | [5.3 일괄 적용](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md#일괄-적용과-제외) |
| WBS(작업 계층)를 만들고 싶다 | [5.3 트리 보기](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md#536-트리-보기) |
| 일정을 드래그로 조정하고 싶다 | [5.3 간트 보기](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md#537-간트-보기) |
| 작업 구조를 한 장의 그림으로 보고 싶다 | [5.3 맵 보기](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md#538-맵-보기) |
| 이슈를 자동으로 편입하고 싶다 | [5.3 자동 편입](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--03-%EC%9E%91%EC%97%85-%EA%B4%80%EB%A6%AC.md#533-자동-편입프로젝트-구독) |
| Confluence 문서를 작업에 연결하고 싶다 | [5.6 문서 관리](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--06-%EB%AC%B8%EC%84%9C-%EA%B4%80%EB%A6%AC.md) |
| 프로젝트가 지연인지 알고 싶다 | [5.5 진척률](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--05-%EB%B6%84%EC%84%9D-%EB%B0%8F-%EB%A6%AC%ED%8F%AC%ED%8A%B8.md#554-진척률) |
| 누가 과부하인지 보고 싶다 | [5.5 인력 분석](05-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EC%83%81%EC%84%B8/codex-experiences--05-%EB%B6%84%EC%84%9D-%EB%B0%8F-%EB%A6%AC%ED%8F%AC%ED%8A%B8.md#552-인력-분석) · [6.1 인력 현황](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--01-%EC%9D%B8%EB%A0%A5-%ED%98%84%ED%99%A9.md) |
| 특정 스킬을 가진 사람을 찾고 싶다 | [6.1 인력 현황](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--01-%EC%9D%B8%EB%A0%A5-%ED%98%84%ED%99%A9.md) · [6.4 프로젝트 배정](06-%EC%9E%90%EC%9B%90-%EA%B4%80%EB%A6%AC/codex-experiences--04-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%EB%B0%B0%EC%A0%95.md) |
| 조직도를 구성하고 싶다 | [7.3 팀 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--03-%ED%8C%80-%EA%B4%80%EB%A6%AC.md) |
| 권한을 조정하고 싶다 | [7.8 권한 관리](07-%EC%84%A4%EC%A0%95/codex-experiences--08-%EA%B6%8C%ED%95%9C-%EA%B4%80%EB%A6%AC.md) |
| 여러 프로젝트를 한눈에 비교하고 싶다 | [8. 통합 대시보드](codex-experiences--08-%ED%86%B5%ED%95%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md) |
| 어느 프로젝트가 위험한지 알고 싶다 | [8.2 T/S/R 신호등](codex-experiences--08-%ED%86%B5%ED%95%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C.md#82-종합-개요tsr-신호) |
| 전사 워크로그를 엑셀로 뽑고 싶다 | [9. 워크로그 추출](codex-experiences--09-%EC%9B%8C%ED%81%AC%EB%A1%9C%EA%B7%B8-%EC%B6%94%EC%B6%9C.md) |
| 지금 보는 화면을 동료에게 보내고 싶다 | [1.5 링크 복사](codex-experiences--01-%EA%B0%9C%EC%9A%94.md#15-공통-ui-규칙) |
| 화면이 안 보인다 | [1.4 권한의 기본 개념](codex-experiences--01-%EA%B0%9C%EC%9A%94.md#14-권한의-기본-개념) · [부록 B](%EB%B6%80%EB%A1%9D/codex-experiences--B-%EA%B6%8C%ED%95%9C%EB%B3%84-%EC%82%AC%EC%9A%A9-%EB%B2%94%EC%9C%84.md) |

---

## 관련 문서

| 문서 | 다루는 내용 |
|---|---|
| [관리자 매뉴얼](../codex-experiences--Moves_Workforce_%EA%B4%80%EB%A6%AC%EC%9E%90_%EB%A7%A4%EB%89%B4%EC%96%BC.md) | 설치·초기화, 권한 설계, 대량 업로드, 저장 공간 운영 |
| [빠른시작 가이드](../codex-experiences--Moves_Workforce_%EB%B9%A0%EB%A5%B8%EC%8B%9C%EC%9E%91_%EA%B0%80%EC%9D%B4%EB%93%9C.md) | 설치 직후 15분 세팅 |
| [FAQ](../codex-experiences--Moves_Workforce_FAQ.md) | 자주 묻는 질문 |
| [용어집](../codex-experiences--Moves_Workforce_%EC%9A%A9%EC%96%B4%EC%A7%91.md) | 전사 공통 용어 |
| [릴리스 노트](../codex-experiences--Moves_Workforce_%EB%A6%B4%EB%A6%AC%EC%8A%A4%EB%85%B8%ED%8A%B8.md) | 버전별 제공 기능 |

> **범위 밖:** **저장 공간 관리**(Settings > 저장공간 관리)는 이 매뉴얼에서 다루지 않습니다. 관리자 매뉴얼을 참고하세요.
