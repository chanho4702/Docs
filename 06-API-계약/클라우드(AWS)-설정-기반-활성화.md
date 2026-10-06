# contract_cloud-gating.md — 클라우드(AWS) 설정 기반 활성화

**티켓:** ZM-79(BE) / master(FE) · **작성:** 2026-08-24 · **상태:** BE·FE 구현 완료 · 커밋 BE `285855b` / FE `74e41d0`(미푸시) · 런타임 미검증 · 검수 대기 → `review_cloud-gating.md`

## 배경

클라우드 인프라 모니터링(EC2·VPC 화면 4개)은 지금 **아무 조건 없이 항상 노출**된다. AWS 자격증명이
없으면 메뉴는 보이는데 들어가면 AWS SDK가 `Unable to load credentials`를 던져 **500**이 나간다 —
장애가 아니라 "키를 안 넣었다"인데 화면은 그걸 구분하지 못한다.

게다가 **키를 넣을 화면(`CloudInfraInfo.tsx`)이 고아 파일**이다. 라우트에도 설정 메뉴에도 없어서
현재 제품에는 AWS 키 입력 경로가 존재하지 않는다(DB 직접 수정이나 `.env`/IAM 역할에만 의존).

→ **설정에 값을 넣으면 켜지고, 없으면 안내와 함께 잠기는** 구조로 바꾼다.

## 판정 규칙 (단일 출처)

`CloudCredentialsResolver`가 자격증명 해석의 유일한 출처다. 게이팅 판정과 실제 AWS 호출이 **같은
규칙**을 쓰게 하려고 `AwsServiceImpl`에서 추출했다 — 복제해 두면 언젠가 한쪽만 바뀌어
"메뉴는 켜졌는데 호출이 죽는" 상태가 된다.

| source | 의미 |
|--------|------|
| `SETTING` | 설정 > 클라우드 인프라에 입력된 키 |
| `ENVIRONMENT` | `.env`·IAM 역할·프로파일 등 AWS 표준 자격증명 체인 |
| `NONE` | 어디에도 없음 → 게이트 |

🔴 **상태 판정은 AWS를 호출하지 않는다.** 메뉴를 그릴 때마다 불리는 값이라, 진짜 호출을 섞으면
사이드바가 AWS 응답 시간만큼 늦어지고 일시적 네트워크 장애가 멀쩡한 설치본의 메뉴를 지운다.
실제 연결 확인은 사용자가 "연결 테스트"를 눌렀을 때만 한다.

## API

### `GET /cloud-infras/status` — 신규

게이팅 판정. **관리자 전용이 아니다** — 메뉴 게이팅은 모든 사용자에게 필요하다. 비밀값은 나가지 않는다.

```json
{ "status": "success", "data": {
  "state": "ready",            // ready | unconfigured
  "source": "SETTING",         // SETTING | ENVIRONMENT | NONE
  "settingPresent": true       // false인데 ready면 환경/IAM 역할로 도는 것
}}
```

### `POST /cloud-infras/test-connection` — 신규 (관리자)

저장된 자격증명으로 `ec2:DescribeRegions` 1회. **실패해도 200이다** — 연결 테스트에서 인증 실패는
서버 오류가 아니라 사용자가 물어본 것에 대한 정상적인 답이다.

```json
{ "status": "success", "data": {
  "ok": false, "source": "SETTING", "regionCount": null,
  "reason": "The security token included in the request is invalid."
}}
```
성공 시 `{ "ok": true, "source": "SETTING", "regionCount": 17, "reason": null }`

### 기존 5개 EP — 미설정 가드 추가

`/cloud-infras/{regions,vpcs,ec2s,ec2-dashboard,ec2}` 는 첫 줄이 `requireConfigured()`다.
미설정이면 **`CLOUD_NOT_CONFIGURED`** (기존 500 대신).

🔴 `CLOUD_INFRA_NOT_ACCESS`(기존 코드)와 구분한다 — 저쪽은 "자격증명은 있는데 AWS가 거부",
이쪽은 "아직 입력조차 안 됐다". 화면이 보여줄 것이 다르다(전자는 키 재확인, 후자는 설정 링크).

## FE 소비 규약

- `useCloudStatus()` — `useAiHealth`와 같은 패턴. **로딩 중에는 잠그지 않는다**(상태를 받기 전에
  잠그면 정상 설치본도 새로고침마다 메뉴가 깜빡인다 — 라이선스 `FeatureGate`와 같은 규칙).
- 사이드바: 미설정이면 `disabled` + 힌트("설정 > 클라우드 인프라에서 AWS 자격증명을 먼저 입력하세요").
  라벨을 `<Link>`가 아닌 평문으로 바꾼다 — disabled여도 Link가 남아 있으면 키보드 이동·중클릭으로 들어가진다.
- 화면 4개: `CLOUD_NOT_CONFIGURED` 응답이면 설정 바로가기 안내를 그린다.
- 설정 저장·연결 테스트 성공 후 `CLOUD_INFRAS_QUERY_KEY.STATUS`를 무효화하면 메뉴가 즉시 살아난다.

## 함께 정리한 것 (착수 후 발견)

- **"기본 리전" 필드 제거** — 위 "미해결/후속" 참고. 화면 Select·`CloudInfraInfoDto.defaultRegion`·
  `CloudStatusDto.defaultRegion`·`CloudCreds.defaultRegion`·홈 위젯 부가 표시를 모두 걷어냈다.
- **`CloudInfraInfo.tsx` 라우트 연결** — 고아 파일이라 제품에 AWS 키를 넣을 UI 경로가 없었다.
  `설정 > 클라우드 인프라`(`SETTINGS_ENTRIES` + `PATH_SETTING.cloudInfraInfo`, 관리자 전용)로 살렸다.
- **시크릿 키 `required` 제거(저장된 키가 있을 때)** — BE는 "비우면 기존 유지"(ZM-100)인데 폼이
  필수로 막아, 리전만 바꾸려는 사용자도 시크릿을 다시 타이핑해야 저장됐다.
- **화면 도움말** — `page_guide.setting_cloud_infra` 신설. 기존 `monitoring_cloud`가 "설정 >
  **데이터 소스 관리**에 AWS 자격 증명이 있어야"라고 안내했는데 그 카탈로그에 AWS는 없다 → 정정.

## 🔄 FE 요청사항

(없음 — SOLO-CLAUDE 기간이라 BE·FE 모두 Claude가 구현)

## 미해결 / 후속

- **"기본 리전" 설정은 두지 않는다**(2026-08-24 사용자 결정으로 제거). 리전을 지정하지 않는 호출은
  `getRegions()` 하나뿐이고 `ec2:DescribeRegions`는 **어느 리전 엔드포인트로 불러도 전체 목록**을 준다.
  자원 조회는 모두 리전을 명시하거나 전체 리전으로 팬아웃하므로, 그 값은 "SDK 클라이언트를 만들 때
  필요한 아무 리전"에 지나지 않았다 — 사용자에게 물을 이유가 없다. 리전 해석은
  `요청 리전 → AWS 표준 리전 체인 → us-east-1`. 설정 화면의 리전 Select와 그 닭-달걀(최초 등록 시
  자격증명이 없어 리전 조회가 막히는 문제)도 함께 사라졌다.
  ⚠️ 홈 시스템 상태 위젯이 AWS 행에 리전을 부가 표시하던 것도 제거됐다(이제 `-`로 표시).
- 자산관리 ↔ EC2 연동(자산에 `cloud_data` 자동 채우기)은 **이번 범위 밖**. 자산 동기화는 여전히
  Zabbix 기준이고 `AssetSyncService`는 `cloudData(Map.of())`로 비운다.
- AWS Cost Explorer 연동 없음(리소스 단위 14일 제약 + 요청당 $0.01로 보류된 항목).
