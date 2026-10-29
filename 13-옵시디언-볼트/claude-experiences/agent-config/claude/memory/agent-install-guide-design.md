---
name: agent-install-guide-design
description: "Zabbix 에이전트 설치 가이드 — A안(링크+반입), FE 구현 완료(미커밋·브라우저 미검증), CDN latest 별칭 채택"
metadata: 
  node_type: memory
  type: project
  originSessionId: 34085c28-ec73-4eff-b048-b3d1543cbaee
  modified: 2026-08-24T09:01:54.492Z
---

2026-08-24 에이전트 설치 가이드 **FE 구현+커밋 완료**(BE 무수정). **`5d88bb5` #ZM-113 (master, 미푸시)** — 검수 문서 `_workspace/features/zabbix-config/agent-install-guide/review_agent-install-guide.md`. 🔴 커밋 시 작업 트리에 aws-gating 미커밋 변경이 섞여 있어 공유 5파일(routes.ts·queryKey.ts·routes.tsx·kr/en.json)은 **U0 diff 헝크 선별 → `git apply --cached --unidiff-zero`**로 내 헝크만 스테이징(외부 마커 0건 검증) — 순수 삽입 헝크였기에 가능했던 방법. 설계서 정본 `_workspace/devdesign_agent-install-guide.md` v1.1(§9 구현 결과). 신규 4파일(본체=`commandTemplates.ts` 순수함수) + 수정 7, 테스트 16 green·tsc 클린·전체 1098 pass(선재 실패 1: AiAssistantPage URL 미러링 — 본 변경과 접점 0 확인). system-status 런타임 실측 `{status:"UP", detail:"7.0.6", endpoint:"https://dmove.co.kr"}` — 훅 가정 일치. **잔여: 브라우저 렌더 미검증(Chrome 확장 미연결)·실서버 설치 완주 미실시·커밋 승인 대기.**

🔴 **CDN은 구 패치 바이너리를 정리한다** — 7.0.6의 MSI/pkg가 404("서버 풀버전 URL" 전략이 Windows/macOS에서 붕괴). 해법 = 공식 `{major}/latest/` 별칭(`zabbix_agent2-7.0-latest-windows-amd64-openssl.msi`) — major만으로 조립·항상 존재. Linux repo는 풀버전 전략 유효(전 조합 HEAD 200 실측).

핵심 결정: 폐쇄망은 **A안(다운로드 링크+반입)**, B안(제품 서버 셀프호스팅)은 설치 번들([[architecture-onprem-scaleout-audit]] 참고 — 번들 전무)과 묶어 2차. 문서가 아니라 **명령어 생성기** — OS/배포판/모드 선택 → 우리 Zabbix 서버 주소·버전 박힌 복붙 블록.

실측 사실:
- dev Zabbix = **7.0.6** (`apiinfo.version` 무인증 호출, dmove.co.kr)
- 🔴 에이전트 버전 = 서버 풀버전으로 URL 생성하면 패키지 존재 보장(서버가 릴리즈됐으니 그 버전 디렉토리 존재)
- 🔴 rpm 파일명 `release{N}`은 예측 불가(대부분 release1) → 디렉토리 리스팅 링크 항상 병기. deb는 `-1+ubuntuXX.04` 일관
- macOS는 arm64 pkg만(Intel 없음)·agent2 없음(구형 agent) → 2순위 지원
- Windows MSI는 `msiexec /qn SERVER= SERVERACTIVE= HOSTNAME=` 한 줄 무인 설치

구현 방침: **1차 BE 무수정** — 서버 주소는 `GET /settings/zabbix` value.url 호스트 추출, 버전은 `GET /home/system-status` dataSources[].detail(HealthPort가 apiinfo.version 결과를 실음, ⚠️포맷 실측 필요). 라우트 `/zabbix-management/agent-install-guide`(🔴 host-management/:hostid와 형제로 — 동적 라우트 충돌 회피), 선택 상태는 URL query([[fe-page-remount-on-navigate]]). 진입점 = HostTab 버튼 + HostCreateResultStep agent unavailable Alert action + page-guide. 명령 템플릿은 `commandTemplates.ts` 순수 함수로 분리(2차 B안 때 URL 생성부만 교체).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

에이전트 설치 가이드 — 2026-08-24 A안(링크+반입) **FE 구현+커밋 `5d88bb5` #ZM-113**(BE 무수정, 미푸시·검수대기). 혼합 트리에서 헝크 선별 스테이징(git apply --cached) 사용. 🔴CDN은 구 패치 바이너리 정리(7.0.6 MSI 404) → Windows/macOS는 `{major}-latest` 별칭, Linux는 서버 풀버전(전 조합 HEAD 200). 잔여: 브라우저 렌더 미검증·실서버 완주 미실시. 정본 _workspace/devdesign_agent-install-guide.md v1.1
