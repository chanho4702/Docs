---
name: license-kernel-progress
description: "2026-08-12 라이선스 0단계 사실상 완료 — 판정 18/19(FE 브라우저 검증 포함), 잔여는 판정 12(1단계 GPU에서)와 커밋 푸시뿐"
metadata: 
  node_type: memory
  type: project
  modified: 2026-08-12T07:42:24.355Z
  originSessionId: 4b03a8af-98c1-428f-b292-c00004dbbc9e
---

라이선스 0단계. 설계는 [[premium-license-design]] v4, 완료 판정 19항목은 설계서 §6.

**BE 커널 T1~T8 완료. 커밋 6건 전부 미푸시**(BE `ZM-79`):
`8cb1944`(T3검증) `eb86507`(T4판정) `b64cd6e`(T5게이트) `4b82bcc`(T6실시간) `5934015`(T7배치·ArchUnit) `9a88253`(T8결함수정).
app 모듈 **775 green** · 완료 판정 **16/19**(1·2·3·4·6·7·8·9·10·11·13·14·15·16·18 실측 + 17 실증).
**남은 둘은 지금 검증 불가**: 12는 `@RequiresFeature` 붙은 실제 EP가 1단계(GPU)에 가야 생김, 19는 FE.
2차 검증(08-11): 11=`PUT /event/{id}/acknowledge`→`LICENSE_READ_ONLY` · 13=`event_sync` skip / `event_cleanup` 실행(**대조군 먼저 확인**, 주기 원복함) · 14=**리포트는 다운로드 전용 EP가 없다**는 게 답(조회 GET 200 + 생성은 배치 게이팅). R-9도 닫힘 — 두 cleanup 모두 리포지토리 삭제만 하고 엔진 포트를 안 부른다(소스 확인).

**문서**: 검수요청 `_workspace/features/auth-license/license/review_license-kernel.md`(R-1~R-9) · 런타임기록 `_workspace/e2e_license-kernel.md` · 옵시디언 `projects/moveseye/2026-08-10-license-kernel-implementation.md` + `topics/backend/test-false-safety-nets.md`

✅ **배포 전 필수 "스케줄러 다중 인스턴스 잠금" 해소**(08-11 `57c63e5`, 라이선스와 별건). `scheduler_lease` **V21** + `SchedulerLeaseService`, `SchedulerManager.execute`에서 획득·`finally` 반납. 🔴 획득은 **조건부 UPDATE + PK 충돌**로 원자화(SELECT 후 INSERT는 동시에 보면 둘 다 통과 — 8스레드 IT가 실증). 🔴 release는 **소유자 확인 후 삭제**(안 하면 늦게 끝난 이전 소유자가 남의 lease를 지워 셋째가 들어온다). 🔴 `ReportSchedule`의 volatile 플래그 2개 **제거**(lease에 덮여 죽은 코드). ⚠️ **heartbeat 없음** — TTL 30분+종료 시 반납, 크래시 시 최대 30분 잠김. 배치가 30분 넘게 돌면 그때 넣을 것. ⚠️ **V21은 dev DB 미적용**(다음 기동 시 Flyway 적용). app 모듈 **784 green**.

**✅ 2026-08-12 3차 검증 완료 — 판정 18/19.** T9 FE는 다른 세션이 완결(FE `3fa60fb`→`8389c08`→`b0cbfc6`→`ea0d7c5`, master에 커밋됨 — 게이트 errorCode 4종 소비 경로까지 포함). 내가 브라우저(Chrome MCP + localhost)로 판정 **19 실측**: 잠금 화면 / EXPIRED 배너+토스트(동기화 차단, 단 뮤테이션 자체 에러가 겹쳐 **토스트 2개** — 오동작 아님·문구 개선 여지) / ARCHIVED 배너 전환+`LICENSE_LIVE_BLOCKED`(200+바디)+자산 조회 200. **업셀만 렌더 지점 부재**(FeatureGate 마운트 0곳 — 프리미엄 화면은 1단계)로 판정 14 부류의 답. 판정 **5도 이날 닫음** — 발급기 `--deadline 0` 키를 UI 등록 → "등록 가능 기간이 지난 라이선스입니다" 거부·DB 행 미생성(2차까지 목록에서 빠져 있던 항목). UI 해지(판정 15 FE면)·P13 기간 고정 UI 표시도 확인. FE 프로덕션 빌드(`npm run build`)도 완주 성공(2m8s — 검수 미완 항목 해소). 기록: `e2e_license-kernel.md` §9.

**남은 것**: 판정 12(프리미엄 실제 EP — 1단계 GPU에서, 업셀 실증도 그때) · BE `ZM-79` 커밋들 푸시(사용자 승인 필요) · dev DB는 활성 라이선스 0행으로 복원해 둠(재등록은 `issued/테스트고객사_주식회사_PREMIUM_20260812.lic` 붙여넣기면 즉시).

🔴 **런타임에서만 드러난 결함 2건(775 green인 상태에서)**
① `registered_by` 항상 null — JWT에 username 클레임 없음(`id`·`userRole`·`roleid`·`userid`만). **`asset_activity` actor null과 같은 함정 재발** — 새 코드에서 사용자명이 필요하면 무조건 `ActorResolver`를 거칠 것.
② 잘못된 본문 → HTTP 500. `HttpMessageNotReadableException` 미매핑(계약은 200+code). 같은 부류로 **없는 경로도 404 아닌 500**(미수정, 라이선스 범위 밖).

🔴 **테스트가 못 잡던 자리 3종(이번에 실증)** — 상세는 `topics/backend/test-false-safety-nets.md`
① **P18 순서 테스트는 "인증 없음"으로 검증 불가** — Security 필터가 DispatcherServlet보다 앞이라 순서를 뒤집어도 401. 진짜 링은 `VisitorIdCheckInterceptor`와의 겨룸 → **유효 JWT + 틀린 x-visitor-id**로 검증.
② **게이트를 켜면 권한 계약 테스트가 거짓 통과**(라이선스 잠금도 403) → `IntegrationTestSupport`가 실제 서명 키를 실제 테이블에 심어 게이트를 연다(P11, 우회 스위치 금지).
③ **컴파일러는 "검사를 불렀는지"는 모른다** → 포트 데코레이터 테스트는 리플렉션으로 전 메서드를 훑는다. `@Primary`가 실제로 이기는지도 별도 검증(단위 테스트는 직접 new라 전부 통과).

🔴 **판정 경로는 `verify()`가 아니라 `parse()`** — `activationDeadline`(발급 후 7일)을 상시 판정에 걸면 **등록 8일째 전 고객 잠김**(영구 라이선스 포함).

🔴 **설계서와 달라진 것**: ArchUnit A5를 원안(`license..`·`auth..`)대로 못 함. FE 부팅경로 둘(`GET /users/my-profile`·`/users/role/permission`)이 `user` 패키지라 **메서드 이름 허용목록**으로 좁힘. 설계서 §5.7 반영됨.

**런타임 검증 환경**: BE `:3001`(다른 세션이 `:3000`·`:5173` 사용 중이라 분리). dev DB 정리 완료(license 0행). 발급기 실물 키로 검증 — 공개키 == 제품 `public-1.pem`, 기동 로그 "라이선스 공개키 1개 로드"(**테스트는 검증기 빈을 갈아끼워 이 경로를 안 탄다**). ⚠️ **판정 캐시 60초** — DB를 직접 고치면 63초 기다려야 반영.

🔴 **Windows 도구 함정(3~4번째)**: PS 5.1은 **BOM 없는 .ps1을 MS949로 읽어 스크립트 본문 한글이 깨진다** → 검증 스크립트는 ASCII. `ConvertTo-Json`이 문자열을 `{"value":…}` 객체로 감쌈. `-SkipHttpErrorCheck`는 PS7+. 할당 우변 명령 호출은 괄호 필요. **`Content-Disposition`에 한글 파일명 raw → HTTP 헤더 붕괴**(RFC 6266 `filename*=UTF-8''` 필요). ⚠️ **UTF-8 텍스트 파일을 PowerShell로 편집하지 말 것** — 발급 대장 CSV를 그렇게 깨뜨렸다(복구함).

✅ **발급기 웹 UI 완료**(별도 저장소 `moveseye-license-issuer` `main` `6692f69`, 미푸시): `issue.bat --web` → `http://127.0.0.1:877`. 한글 고객사명 사고 경로 제거(브라우저 폼=UTF-8), 실측 왕복 확인(클레임→제품 등록→DB 28바이트). **Spring Boot 없이** JDK `HttpServer` + Thymeleaf 1개. 서명·대장은 `LicenseIssuerCore`로 추출해 CLI/웹 공유(**한쪽만 고치면 서명이 갈리므로**). 🔴 개인키를 들고 도는 프로세스라 **루프백 고정 · `--host` 바꾸려면 `--token` 강제(없으면 기동 거부) · 다운로드는 발급 대장 화이트리스트**(아니면 `../keys/private-key.pem`이 그대로 나간다). **제품에 이 화면을 넣지 말 것.**

⚠️ 사용자 요청 대기: 설정 화면 2건(FE 세션이 이미 착수 — 게이트 errorCode 4종 누락 전달 필요).

관련: [[premium-license-design]] [[commit-requires-approval]] [[dev-runtime-startup]] [[vault-secrets-management]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

라이선스 커널 구현 진행 — **2026-08-12 0단계 사실상 완료 — 판정 18/19**(FE 브라우저 3차 검증 포함: 잠금/배너+토스트/실시간차단 실측, 판정 5도 `--deadline 0` 키로 닫음, 업셀만 렌더 지점 부재→1단계). T9 FE는 별도 세션이 완결(errorCode 4종 소비 경로 포함, master 커밋). FE 프로덕션 빌드 완주 확인. 잔여: 판정 12(1단계 GPU) · BE `ZM-79` 커밋 푸시(승인 필요). dev DB는 활성 라이선스 0행 복원. 🔴저장소 분리로 소스공유 끊김→네 파일 동일사본+양쪽 LicenseContractTest. 🔴.bat에 한글=cmd 파싱 붕괴 / `shift`는 `%*` 안 바꿈 / 전역 JAVA_HOME=JDK8 / Java 기본 MS949로 한글이 클레임에 깨져 박힘
