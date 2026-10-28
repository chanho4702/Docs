# review_cloud-gating.md — 클라우드(AWS) 설정 기반 활성화

**요청일:** 2026-08-24 · **작성:** Claude · **검수:** Codex (COLLAB §8)
**브랜치:** BE `ZM-79` / FE `master` · **커밋:** BE `285855b` · FE `74e41d0` (미푸시)
**계약서:** `_workspace/features/cloud/aws-monitoring/contract_cloud-gating.md`

---

## 범위

"AWS 키를 설정에서 넣으면 클라우드 모니터링이 켜지는" 구조로 바꿨다. 사용자가 지정한 범위는
**게이팅까지**이고, 자산관리 ↔ EC2 연동과 Cost Explorer는 명시적으로 범위 밖이다.

착수 후 발견한 것 두 가지가 범위에 포함됐다:

1. **`CloudInfraInfo.tsx`가 고아 파일이었다** — 라우트에도 `SETTINGS_ENTRIES`에도 없어 제품에
   AWS 키를 넣을 UI 경로가 아예 없었다. "설정에서 값을 넣어 활성화"의 전제라 함께 살렸다.
2. **화면 도움말이 잘못 안내하고 있었다** — `page_guide.monitoring_cloud`가 "설정 > 데이터 소스
   관리에 AWS 자격 증명이 있어야"라고 하는데, 데이터 소스 카탈로그에 AWS는 없다. 문구를 정정했다.

### 변경 파일

**BE (`moveseye-be-spring`)**
| 파일 | 변경 |
|---|---|
| `aws/CloudCredentialsResolver.java` | 🆕 자격증명·리전 해석 단일 출처(`AwsServiceImpl`에서 추출) |
| `aws/CloudStatusService.java` | 🆕 상태 판정 + 연결 테스트 |
| `aws/dto/CloudStatusDto.java`, `aws/dto/CloudConnectionTestDto.java` | 🆕 |
| `aws/CloudInfraController.java` | `GET /status`·`POST /test-connection` 추가, 기존 5개 EP에 `requireConfigured()` 가드 |
| `aws/AwsServiceImpl.java` | 자격증명 3메서드 제거 → resolver 위임 |
| `common/exception/ErrorCode.java` | `CLOUD_NOT_CONFIGURED` 추가 |
| `home/HomeSystemStatusService.java` | AWS 행의 리전 부가 표시 제거(기본 리전 폐기) |
| `test/aws/CloudStatusServiceTest.java` | 🆕 6건 |
| `test/aws/AwsCredentialDecryptionTest.java` | resolver 기준으로 갱신 |

**FE (`moveseyee_fe`)**
| 파일 | 변경 |
|---|---|
| `hooks/useCloudStatus.ts` | 🆕 게이팅 판정 훅(`useAiHealth` 패턴) |
| `pages/cloud-infra-monitoring/components/CloudInfraGate.tsx` | 🆕 라우트 진입 가드 |
| `__tests__/CloudInfraGate.test.tsx` | 🆕 3건 |
| `pages/setting/CloudInfraInfo.tsx` | 상태 배지·연결 테스트·시크릿 required 수정·리전 Select 제거 |
| `routes/routes.tsx` | 설정 라우트 등록 + 클라우드 root에 가드 적용 |
| `layouts/app/{SideNav,MobileSideNav}.tsx` | 미설정 시 메뉴 잠금 + 힌트 |
| `layouts/app/SettingsMenu.tsx` | 설정 엔트리 추가 |
| `constants/page-guide.ts`, `locales/{kr,en}.json` | 도움말 신설 + 기존 오안내 정정 + i18n 19키 |
| `services/cloud-infra.ts`, `types/cloud-infra.ts`, `constants/queryKey.ts` | status·test API 배선 |

---

## 의도 (선택한 설계와 버린 대안)

**1. 상태 판정은 AWS를 호출하지 않는다.**
"자격증명이 있느냐"까지만 본다. 진짜 호출을 섞는 안을 버린 이유는 두 가지 — 메뉴를 그릴 때마다
불리는 값이라 사이드바가 AWS 응답 시간만큼 늦어지고, 일시적 네트워크 장애가 멀쩡한 설치본의
메뉴를 지운다. 실제 연결 확인은 사용자가 "연결 테스트"를 누를 때만 한다.

**2. 판정 로직을 복제하지 않고 추출했다.**
`AwsServiceImpl` 안에 있던 자격증명 해석을 `CloudCredentialsResolver`로 뽑았다. 상태 판정용으로
같은 로직을 한 벌 더 만드는 안을 버렸다 — 언젠가 한쪽만 바뀌면 "메뉴는 켜졌는데 호출이 죽는"
(또는 그 반대) 상태가 되고, 그 증상은 원인을 찾기 어렵다.

**3. 하이브리드(환경/IAM 역할)를 게이트에 포함시켰다.**
DB 설정만 보는 안을 버렸다. `.env`·IAM 역할로 도는 설치본이 실제로 동작하는데 메뉴를 잠그면
회귀다. 대신 `settingPresent`로 출처를 구분해 화면에 알린다 — 설정에 아무것도 없는데 동작하면
설치 담당자는 "왜 되는지"를 알 수 없다.

**4. 설정 화면 위치는 독립 엔트리(`설정 > 클라우드 인프라`).**
코덱스가 만들고 있는 `데이터 소스 설정`에 AWS 프로바이더로 넣는 안을 버렸다 — 그 카탈로그는
수집 엔진 포트(메트릭/인벤토리/알람 공급자) 개념이고 AWS는 그 포트를 구현하지 않아서,
"AWS를 골랐는데 호스트 모니터링이 안 바뀐다"는 혼선이 난다.

**5. 화면 4개를 각각 고치지 않고 라우트 부모에 가드 하나.**
`CLOUD_NOT_CONFIGURED` errorCode를 화면마다 해석하는 안보다 단순하고, 사이드바와 같은 훅을
써서 판정이 갈라지지 않는다.

**6. "기본 리전" 설정을 통째로 없앴다** (사용자 결정).
처음엔 그 자리가 목록용 다중 선택 필터 훅(`useFilterRegion`)을 끌어다 쓰고 필드명도 `vpc`인 게
문제라고 보고 `defaultRegion`으로 정리했는데, 사용자가 **설정 자체가 필요 없다**고 판단했다.
확인해 보니 맞다 — 리전을 지정하지 않는 호출은 `getRegions()` 하나뿐이고 `ec2:DescribeRegions`는
어느 리전 엔드포인트로 불러도 전체 목록을 준다. 나머지 자원 조회는 리전을 명시하거나 전체 리전으로
팬아웃한다. 즉 그 값은 "SDK 클라이언트를 만들 때 필요한 아무 리전"이었고, 사용자에게 물을 이유가
없었다. 리전 해석은 `요청 리전 → AWS 표준 체인 → us-east-1`로 단순화했고, 설정 화면의 리전
Select와 그 닭-달걀(최초 등록 시 리전 조회가 막힘)도 함께 사라졌다.
⚠️ 홈 시스템 상태 위젯의 AWS 행에서 리전 부가 표시가 없어진다(`-`로 표시).

---

## 🔴 중점 확인 요청 (스스로 불안한 지점)

1. **기본 리전 제거의 파급.** 리전 해석이 `us-east-1` 폴백으로 떨어질 수 있다. `DescribeRegions`
   결과는 동일하고 자원 조회는 전부 리전을 명시하지만, **엔드포인트가 멀어져 지연이 붙는지**는
   실측하지 못했다. 또 기존 설치본에 저장돼 있던 `defaultRegion` 값은 다음 저장 때 사라진다
   (읽는 코드가 없어졌으므로 무해하다고 봤다).

2. **`DefaultCredentialsProvider.resolveCredentials()` 호출 비용.** `source()`가 표준 체인을
   해석하는데, EC2 IAM 역할 환경에서는 IMDS를 읽는다. provider 인스턴스를 필드로 재사용해
   SDK 내부 캐시를 타게 했지만, **IMDS가 없는 환경(사내 서버)에서 매 호출 타임아웃이 붙는지**를
   실측하지 못했다. `/status`는 메뉴 렌더마다 불리므로 여기서 지연이 생기면 체감이 크다.
   서버측 짧은 캐시를 넣을지 판단이 필요하다.

3. **`/cloud-infras/status`를 관리자로 좁히지 않았다.** 메뉴 게이팅이 전 사용자에게 필요해서인데,
   응답에 `settingPresent`·`source`가 실린다. 비밀값은 아니지만
   **일반 사용자에게 자격증명 출처를 알려도 되는지**는 정책 판단이 필요하다.

4. **`AwsServiceImpl` 생성자 시그니처가 바뀌었다**(`SettingRepository`+`SettingSecretCodec` →
   `CloudCredentialsResolver`). 테스트는 갱신했고 1019건 통과지만, 이 클래스를 직접 `new` 하는
   곳이 더 없는지 확인해 달라.

5. **연결 테스트가 `ec2:DescribeRegions`를 쓴다.** 가장 가볍고 권한 요구가 낮다고 판단했는데,
   고객사 IAM이 `Describe*`를 리전 조건으로 제한한 경우 **키는 멀쩡한데 테스트만 실패**할 수 있다.

6. **기존 `CLOUD_INFRA_NOT_ACCESS`를 재사용하지 않고 새 코드를 만들었다.** 구 NestJS는 미설정에
   `SETTING_NOT_FOUND`를 던졌다. 코드 3종이 비슷한 상황을 가리키게 됐는데, 정리할지 봐 달라.

---

## 검증 / 미검증

### 검증됨
- BE 전체 테스트 **1019 green** (신규 `CloudStatusServiceTest` 6건 포함, `LicenseArchitectureTest`
  통과 = 새 EP가 `@LicenseExempt` 규칙 위반 아님)
- FE `tsc --noEmit` 통과 · 변경 파일 `eslint` 경고 0
- FE 테스트 **1076 pass / 1 fail** — 실패 1건은 `AiAssistantPage.test.tsx`(AI 대화 URL 동기화)로
  **이번 변경과 무관한 선재 실패**다. 그 파일도 `pages/ai/`도 미커밋 변경이 없고(커밋 `c383528`
  상태), 클라우드·SideNav를 참조하지 않는다. 단독 실행에서도 재현된다(flaky 아님).
- 신규 `CloudInfraGate.test.tsx` 3건 통과(로딩·게이트·통과)

### 미검증 (런타임)
- **브라우저에서 실제로 확인하지 않았다.** 메뉴 잠금·힌트 표시, 설정 화면 렌더, 연결 테스트
  성공/실패 배너, 저장 후 메뉴가 즉시 살아나는지(쿼리 무효화) 전부 정적 검증까지만.
- **실제 AWS 자격증명으로 `test-connection`을 호출해 보지 않았다.** dev DB의 CLOUD 설정 행 상태도
  확인하지 않았다(과거 메모에 `setting` 0행 기록이 있음).
- BE 재기동 없이 작업했으므로 `/cloud-infras/status`의 실 응답을 받아보지 못했다.

### 커밋 정리 메모

두 세션이 같은 작업 트리를 공유해 커밋이 섞였다. 정리 결과:

| 커밋 | 내용 |
|---|---|
| BE `285855b` · FE `74e41d0` | **클라우드 게이팅**(이 문서의 대상) |
| BE `5b845fe` | Codex의 호스트그룹 문제 집계 스캔 — 원래 클라우드 메시지로 커밋됐다가 메시지를 정정 |
| FE `2f794a7` · BE `db03600` | Codex의 글로벌 검색·KPI 스트립 — Claude가 대신 정리해 커밋(사용자 승인) |

🔴 **사고 경위**: 클라우드 BE 커밋 시도 중 Codex가 동시에 스테이징·커밋을 실행해, 내 인덱스가
탈취되고 **내 커밋 메시지에 Codex의 파일 3개가 담겼다**. 파일 소실은 없었다. 재시도 때는
`git commit --only <경로>`로 경로를 못 박아 인덱스 상태와 무관하게 지정 파일만 담기게 했다.
FE에서는 `queryKey.ts`만 두 작업이 한 파일에 겹쳐 hunk 단위로 갈랐다
(`SERVER_QUERY_KEY`=Codex / `CLOUD_INFRAS_QUERY_KEY`=클라우드).
⚠️ `SideNav`·`MobileSideNav`·`SettingsMenu`·`locales`에는 Codex의 내비 개편 변경이 함께 담겼다.

### 알려진 잔여
- 설정 화면 레이아웃은 기존 카드 구조를 유지했다. 다른 설정 화면(AI·라이선스)과 톤이 다를 수 있다.
- `DmovePermissionsKey.CLOUD_INFRA_INFO` enum 값은 여전히 미사용이다(권한은 `adminOnly`로 통제).
