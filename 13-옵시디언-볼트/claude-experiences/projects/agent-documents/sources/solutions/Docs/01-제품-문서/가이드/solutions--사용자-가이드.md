---
title: MovesEye 사용자 가이드
doc_type: guide
audience: [운영자, 관리자, 자산 관리자]
status: current
owner: MovesEye 팀
baseline: 2026-08-11
source_of_truth: moveseyee_fe/src/routes/routes.tsx + SideNav.tsx
reviewed_at: 2026-08-11
review_cycle: monthly
deployment_scope: source navigation; deployment unverified
---

# MovesEye 사용자 가이드

> 이 문서는 2026-08-11 source navigation을 설명한다. 특정 운영 환경에 배포됐다는 증거는 아니며, 실제 제공 메뉴는 해당 환경의 release·permission으로 확인한다.
>
> 📖 **화면 하나하나의 상세 사용법은 [화면별 가이드](%ED%99%94%EB%A9%B4%EB%B3%84/solutions--MovesEye-%ED%99%94%EB%A9%B4%EB%B3%84-%EA%B0%80%EC%9D%B4%EB%93%9C.md)에 사이드바 구조 그대로 정리돼 있다.** 이 문서는 전체 흐름과 공통 원칙을 다룬다.

## 1. 화면을 읽는 공통 원칙

- 메뉴와 데이터 범위는 Role과 Host Group 권한에 따라 달라질 수 있다.
- `-`, `N/A`, 빈 차트는 **관측값 없음**을 뜻할 수 있다. 실제 0과 구분한다.
- 화면의 기준 시각 또는 `syncTime`을 확인해 데이터 신선도를 판단한다.
- 조회 기간을 바꾸면 summary와 chart의 집계 구간이 함께 바뀌는지 확인한다.
- 저장·동기화·acknowledge 뒤에는 성공 toast만 보지 말고 목록과 상세의 실제 반영을 확인한다.

## 2. 홈

로그인 후 전체 상태를 빠르게 확인하는 진입점이다. 이상 수치가 보이면 해당 Host Group, Host 또는 Problem 상세로 내려간다. 홈은 원인 분석을 끝내는 화면이 아니라 **탐색 방향을 정하는 화면**이다.

## 3. 모니터링

### 3.1 호스트 그룹

담당 시스템 묶음의 상태를 비교한다. 그룹 상세에서는 KPI, resource trend, alert trend, top host, host list를 순서대로 본다.

권장 탐색 순서:

1. 문제 수와 정상 비율을 확인한다.
2. CPU·메모리·디스크·트래픽의 avg/max를 전환한다.
3. 급격한 변화가 있는 시점을 찾는다.
4. top host 또는 host list에서 개별 host로 내려간다.

### 3.2 서버 모니터링

Host별 CPU, memory, disk, network, interface, response time과 custom widget을 본다. metric 하나만 비어 있으면 host 전체 장애로 단정하지 말고 item key와 수집 가능 상태를 확인한다.

### 3.3 네트워크 모니터링

응답 시간, packet loss, interface traffic 등을 확인한다. 장비가 Proxy를 통해 수집되면 host 관리 화면의 monitored-by 정보도 함께 본다.

## 4. 이벤트·알림

### 4.1 Problem 목록

활성 장애를 severity·host·발생 시각 기준으로 좁힌다. acknowledge는 장애 해소가 아니라 **운영자가 인지하고 조치 중임을 기록하는 행위**다.

### 4.2 Host Group 기준

조직이나 서비스 단위로 문제를 묶어 볼 때 사용한다. 접근 권한이 없는 Host Group은 목록과 집계 양쪽에서 제외되어야 한다.

### 4.3 상세

발생 정보, service detail, log, 이전 event를 함께 보고 원인과 영향 범위를 판단한다. Problem과 Event는 같은 말이 아니다. [용어집](../%EC%B0%B8%EA%B3%A0/solutions--%EC%9A%A9%EC%96%B4%EC%A7%91.md)을 참조한다.

## 5. 자산 관리

### 5.1 자산 목록·상세

Zabbix에서 동기화한 자산과 custom 자산을 함께 관리한다. Zabbix 원천 필드와 MovesEye가 소유하는 보강 필드의 편집 권한이 다르므로, 수정 화면의 안내를 따른다.

- `source=zabbix`: Zabbix host에서 유래한 자산
- `source=custom`: MovesEye에서 만든 자산
- `excluded`: 동기화 대상에서 숨긴 soft-delete 상태
- `linked_hostid`: custom 자산이 참조하는 Zabbix host

### 5.2 비용

HW 비용과 감가상각을 조회·수정한다. CSV 일괄 업로드는 비동기로 처리되므로 제출 성공과 처리 완료를 구분하고, current job 또는 job 상세 상태를 확인한다.

### 5.3 네트워크 맵

노드·edge로 논리 구성도를 편집한다. main map은 하나만 유지한다. live view는 저장 문서와 현재 host 상태를 결합해 보여 준다.

### 5.4 지리 맵

Cluster와 host pin을 지도에서 본다. 좌표 편집의 원천은 Zabbix inventory이며, 자산 문서에 별도 좌표를 중복 저장하지 않는다.

## 6. 데이터소스와 대상 관리

MovesEye는 여러 모니터링 데이터소스를 통합하도록 설계됐고, **현재 연결 가능한 소스는 Zabbix**다. 아래 메뉴는 Zabbix가 연결됐을 때 제공된다. 소스마다 관리 개념이 달라 이 영역은 공통화되지 않으므로, 다른 소스가 추가되면 그 소스에 맞는 화면이 별도로 나타난다.

특정 관리 메뉴가 보이지 않는다면 권한 문제이거나, **연결된 소스가 그 기능을 제공하지 않는 것**일 수 있다.

| 메뉴 | 목적 | 주의 |
|---|---|---|
| 연동 정보 | 데이터소스 연결 설정 | credential은 화면·로그·문서에 복사하지 않음 |
| 호스트 관리 | host·group·interface·template·proxy 관리 | tags·template link의 전체 교체 여부 확인 |
| 템플릿 관리 | template과 group·link 관리 | unlink 영향 범위를 먼저 확인 |
| 아이템 Lens/관리 | item 조회·생성·수정·상태 전환 | item type과 key 형식 검증 |
| 트리거 Lens/관리 | trigger 정의·상태 관리 | expression과 severity 영향 확인 |
| 사용자 관리 | Zabbix 사용자와 MovesEye 사용자 연결 | 계정 동기화와 로컬 권한을 구분 |

Zabbix API의 일부 update는 부분 수정이 아니라 전체 배열 교체다. 다건 변경 전에 현재 값을 다시 읽고 보존할 필드를 포함한다.

## 7. 설정과 사용자·권한

- My Page: 개인 프로필과 계정 정보
- 보고서 관리: 생성 보고서와 보존 설정
- 장비 분류: 분류 code, 표시명, 순서, 비용 영향을 관리
- 스케줄러: job 활성화·주기·수동 실행·실행 로그
- 사용자·Role·User Group: 기능 권한과 Host Group 데이터 범위를 관리
- 연결된 앱: Claude·Cursor·VS Code 같은 외부 AI 앱을 MCP로 내 계정에 연결하고 끊는다. 절차는 [MCP 연결 가이드](solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)

권한은 화면 숨김만으로 끝나지 않는다. 서버에서 기능 권한과 데이터 범위를 다시 검증해야 한다.

### 7.1 권한이 없을 때 보이는 것 **(ZM-157, 소스 반영·배포 전)**

역할에서 허락되지 않은 기능은 메뉴, 주소 직접 입력, AI 어시스턴트 어디에서도 쓸 수 없다.

| 상황 | 화면에 보이는 것 |
|---|---|
| 역할에 없는 메뉴 | 사이드바·모바일 메뉴·⚙ 설정·전역 검색에 나타나지 않는다 |
| 권한 없는 화면 주소로 직접 진입 | 404(페이지 없음) 화면으로 이동한다 |
| 화면 안의 조회가 권한 때문에 거부됨 | "이 작업을 수행할 권한이 없습니다." 안내가 한 번 뜨고, 해당 영역은 비어 있다 |
| 내 정보·권한을 불러오지 못함 | "권한 정보를 불러오지 못했습니다" 화면과 [다시 시도] 버튼 |
| 새로고침 직후 | 서버에서 권한을 받은 뒤 메뉴가 나타난다(잠시 비어 보일 수 있다) |
| 알림 벨에서 문제를 눌렀는데 이동하지 않음 | 이벤트/알림 보기 권한이 없다 |

화면별로 권한이 필요한 작업:

- **호스트 상세의 사용자 정의 차트** — 차트 추가·편집·삭제·배치 변경 버튼은 서버 또는 네트워크 모니터링의 편집 권한이 있을 때만 보인다. 기본 역할의 일반 사용자에게는 보이지 않는다. 차트 보기는 그대로 된다. → [서버 모니터링](%ED%99%94%EB%A9%B4%EB%B3%84/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%84%9C%EB%B2%84-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)
- **지리 맵의 좌표 편집** — 관리자만 핀을 옮기거나 좌표를 입력할 수 있다. → [지리 맵](%ED%99%94%EB%A9%B4%EB%B3%84/%EC%9E%90%EC%82%B0-%EA%B4%80%EB%A6%AC/solutions--%EC%A7%80%EB%A6%AC-%EB%A7%B5.md)
- **문제 확인(Acknowledge) 저장** — 이벤트 템플릿별 편집 권한이 있을 때만 저장 버튼이 보인다.

로그인 세션과 관련해 달라진 점:

- 비밀번호를 바꾸거나 관리자가 계정을 비활성화하면 **다른 기기에서는 곧바로 로그아웃**된다.
- 업데이트 직후에는 모든 사용자가 **한 번 다시 로그인**한다.
- 로그아웃하지 않고 다른 계정으로 로그인하면 이전 계정의 화면 데이터와 AI 대화가 지워진 상태로 시작한다.

증상별 조치는 [문제 해결 §1](solutions--%EB%AC%B8%EC%A0%9C-%ED%95%B4%EA%B2%B0.md)과 [FAQ §3](solutions--%EC%9E%90%EC%A3%BC-%EB%AC%BB%EB%8A%94-%EC%A7%88%EB%AC%B8.md)을 본다. 역할 설계는 [관리자 가이드 §3-6](solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md)을 본다.

## 8. 현재 기능과 계획 기능 구분

`Database Monitoring`, `GPU Monitoring` route가 코드에 있어도 실제 데이터 수집·edition 정책·운영 검증이 완료됐다는 뜻은 아니다. 릴리스 노트와 실제 배포 환경에서 current 여부를 확인한다. `Application Monitoring`(APM)은 2026-09-01 1단계(개요·서비스·수집기·알람 규칙)가 구현되어 서버 파이프라인이 종단 검증됐다 — 화면 설명은 [어플리케이션 모니터링](%ED%99%94%EB%A9%B4%EB%B3%84/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md), 온보딩은 [수집기 설치](%ED%99%94%EB%A9%B4%EB%B3%84/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md). 트레이스·서비스 맵·합성 감시는 아직 계획이다.

데이터소스 화면에 Prometheus·Datadog·Elasticsearch가 보이는 것도 마찬가지다. **화면 골격은 있지만 실제 연결되는 어댑터는 Zabbix뿐**이며, 나머지는 계획 단계다.

## 9. 관련 문서

- [빠른 시작](solutions--%EB%B9%A0%EB%A5%B8-%EC%8B%9C%EC%9E%91.md)
- [MCP 연결 가이드](solutions--MCP-%EC%97%B0%EA%B2%B0-%EA%B0%80%EC%9D%B4%EB%93%9C.md)
- [로컬·검증 Runbook](../%EC%9A%B4%EC%98%81/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)
- [용어집](../%EC%B0%B8%EA%B3%A0/solutions--%EC%9A%A9%EC%96%B4%EC%A7%91.md)

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-05 | 2026-08-05 FE route·SideNav 기준 최초 작성 |
| 2026-08-11 | 다중 데이터소스 관점 반영 — 6장을 데이터소스·대상 관리로 재정의, 소스별 제공 상태 명시 |
| 2026-09-17 | §7에 연결된 앱 항목과 MCP 연결 가이드 링크 추가 |
| 2026-09-17 | §7.1 신설 — 권한이 없을 때 보이는 것, 차트·좌표·문제 확인 권한, 세션 변화(ZM-157, 소스 기준·배포 전) |
