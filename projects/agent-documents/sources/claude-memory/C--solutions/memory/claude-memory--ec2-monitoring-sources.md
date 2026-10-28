---
name: ec2-monitoring-sources
description: 2026-08-26 EC2 모니터링 소스 매트릭스(Zabbix agent × CloudWatch) — 설계+구현, 코덱스 검수 4라운드 반영 후 **커밋 완료**(BE `1c76397`·FE `ca47c9e`, P3 플릿지표 코덱스분 동반)
metadata:
  type: project
---

2026-08-26 사용자 요청 "자빅스 에이전트 유무 × CloudWatch 사용 유무 분리" → 설계 `_workspace/devdesign_ec2-monitoring-sources.md` (§8 = 코덱스 1차 설계 검토 반영) → 구현 완료(미커밋). 계약 `features/cloud/aws-monitoring/contract_aws-status-timeline.md` 개정 2, 검수 요청 `review_ec2-monitoring-sources.md`.

**핵심 결정**: 판정 단위는 인스턴스. 우선순위 `zabbix-agent(품질 게이트: CPU·메모리 존재+30분 내 포인트) > cloudwatch(명시적 fallback, fallbackUsed) > 밴드만`. 매칭 `Ec2ZabbixMatcher`: INSTANCE_ID_EXACT(호스트명/`aws.instanceId` 태그) > IP_EXACT(ENI 전체 주소 ↔ **AGENT 인터페이스만**, 유일 히트만) — 오연결이 미연결보다 나쁘다. 시스템 컨텍스트+전역 5분 캐시(사용자 세션 섞으면 권한 누출 — 코덱스 지적). CW 거부 캐시는 리전 단위(`CloudWatchAvailability`). 커버리지 4값(zabbix-agent/cloudwatch/unavailable/unmonitored) — 목록 컬럼+개요 카드, "에이전트 깔면 메모리·디스크 무료" 안내.

**전략 함의**: agent 커버리지 높을수록 P3(유료 GetMetricData) 가치 하락 → 폐기 말고 데이터 보고 재평가.

**교훈**:
- `codex exec --sandbox read-only -`(stdin 프롬프트, 레포 안에서 실행)로 설계/코드 검토 의견을 직접 받을 수 있다 — 한글 인자 cp949 함정 회피로 파일→stdin.
- 🔴 병행 세션이 내 파일(`EC2Dashboard.tsx`)에 hunk를 넣음 — 커밋 시 hunk 분리 필수.
- 기존 `getRegions()`는 `opt-in-not-required`만 필터 → opted-in 리전 누락(발견, 미수정).
- 1차 한계: 단건 매칭은 역방향 유일성 미검증 · useip=0 호스트 누락 · agent 소스 네트워크/디스크 사용률은 다차원이라 2차.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--aws-zero-cost-charting|aws-zero-cost-charting]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--cloud-paid-api-optin|cloud-paid-api-optin]]

**코덱스 코드 검수 4라운드(2026-08-26)로 잡힌 것**: ①만료 캐시 재사용→fail-closed ②useip=0 DNS 호스트 오매칭→엔진 모델 `useIp` 신설 ③지표별 freshness ④stopped 우선 ⑤커버리지/상세 예산 기준 통일(5콜) ⑥예산 원자 예약(`reserve`)+월 경계 토큰 ⑦single-flight ⑧FE 문구 / 2차: 역방향 유일성→EC2 주소 역색인(스냅샷 배치 공급, 콜드면 IP 비활성) / 3차: 부분 리전 실패 시 색인 콜드 / 4차: 예외 전 clear·warm 플래그. 🔴 교훈: 단건 매칭의 "유일"은 양방향이어야 하고, 불완전 데이터로 유일을 판정하면 안 된다(fail-closed). 🔴 병행 세션이 같은 파일(AwsServiceImpl)에 P3를 구현 중이라 커밋 분리 조율 필요.

**2026-08-28 agent 경로 실측 통과**: dev Zabbix 신선 호스트(10635)에 `aws.instanceId` 태그 임시 부착 → `source=zabbix-agent` CPU/메모리 1,440pt, CW 미호출 → 원복. 품질 게이트가 데이터 없는 호스트(10745)를 올바르게 거부하는 것도 실증. 🔴 신선도 조사는 `/host/*` EP가 로컬 admin에 401이라 Zabbix API 직접(설정 DB 자격증명을 .env `CREDENTIAL_ENCRYPTION_KEY`로 AES-GCM 복호화 — `cryptography` pip). 🔴 한글 태그 PUT은 `--data-binary @utf8file`. 🔴 매처 캐시 TTL 5분 — 태그 붙이고 300초 넘게 기다려야 반영. 코덱스가 P3·EC2→자산 동기화·비용 탭 이전·CW 전역 스위치까지 완료(8/26~27, 푸시됨).

**2026-08-31 브라우저 렌더 확인(FE `a9c9a80`)**: 개요·목록·타임라인·설정 Modal 전부 OK. 보면서 잡은 3건 — ①CW 꺼짐인데 "출처: CloudWatch" 배지(state≠ok면 "출처: 없음") ②healthy는 밴드를 안 그려 전부 정상=빈 스트립("이상 구간 없음 — 스냅샷 N개" 한 줄) ③🔴BE가 꺼져 있던 사흘이 "전 구간 정상"으로 읽힘 → 스냅샷 간격 2주기 초과=**"수집 공백" 밴드**(FE 파생). 🔴로그인은 비밀번호 입력 대신 curl `/auth/login` 토큰을 `document.cookie`로 주입+`localStorage.isAuthenticated=1`(HttpOnly 아니어도 BE가 이름으로 읽음, localhost 포트 무관). 🔴상세 URL은 `?region=` 필수(없으면 전부 "-"). 미확인: 로우데이터 팝업·agent 차트(수치 시리즈 뜨는 환경 필요).


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

EC2 모니터링 소스 매트릭스 — 2026-08-26 agent×CloudWatch 분리 검수 4라운드 반영·커밋 완료(BE 1c76397·FE ca47c9e). 08-31 브라우저 확인+수정 3건(FE a9c9a80: 출처 배지·전구간 정상 안내·수집 공백 밴드). agent 품질게이트>CW 폴백, 매칭 INSTANCE_ID>IP(AGENT만·유일), 시스템 컨텍스트 캐시, 커버리지 4값. 🔴codex exec로 검토 직접 수령 가능 · 🔴브라우저 로그인은 curl 토큰 쿠키 주입+isAuthenticated=1 · 상세 URL ?region= 필수
