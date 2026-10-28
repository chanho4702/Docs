---
type: project
tags: [project, forge, marketplace, security, privacy, license, moves-approval]
created: 2026-10-20
updated: 2026-10-22
status: active
---

# 2026-10-19~20 — Confluence 승인 앱 Marketplace 유료 출시 전 감사

## 개요
- **요청**: "마켓플레이스에 유료앱으로 올릴거야 그전에 문제 없는지 검사해줘" → 감사 → 단계별 수정 → dev 배포 → 제출 문안.
- **결과 커밋**(master, 미푸시): `035e5ee`(유료화+감사 1단계) · `e52b559`(문서) · `18514c6`(미결제 시 보이는 것) · `b9b22e2`(docs gitignore) · `db03d43`(권한 허점 4건) · `f4cbd7c`(잔여 항목) · `25eaa73`(문서).
- **배포**: development 6.0.0, `--approve MAJOR_VERSION_RULE` + `install --upgrade`. Forge 가 "Runs on Atlassian 대상" 판정. 브라우저로 byline·업무함·영역 매크로·상세(서명) 확인.
- **제출 문안**: `docs/guide/marketplace-submission.md`(gitignore 대상) — Privacy & Security 탭 질문별 답 + 심사자 안내.
- 관련: [[2026-10-07-confluence-paid-license-sentry]] · [[forge-licensing]] · [[forge-marketplace-review-and-remote]] · [[forge-prelaunch-audit-checklist]]

## 감사에서 찾은 것 → 처리
| 등급 | 문제 | 처리 |
|---|---|---|
| 차단 | **모듈 전역 캐시**(관리자 판정·명부·마이그레이션 플래그·테이블 준비)가 warm runtime 을 타고 **다른 테넌트로 샌다** | `utils/runtimeScope` 의 `perInvocation`/`perInstallation`(키 = `getAppContext().invocationId`/`installationAri`) |
| 차단 | 유료화 코드 전부 미커밋 | 커밋 |
| 차단 | **Personal data reporting API 미구현**(accountId 저장 앱 의무) | `PrivacyReporter` — 일일 스윕에서 7일 주기, 90건/호출, 키셋 커서, 폐쇄 계정의 서명·PIN·위임·알림·명부 삭제. scope `report:personal-data` |
| 차단 | 문서 "외부 전송 없음" ↔ Sentry egress 모순 | 08 문서 "오류 진단 예외" 절. Sentry 는 처리 안 된 예외만, user/extra/breadcrumb/URL/console 제거 |
| 높음 | production 실패 응답에 SQL·API 원문 `cause` | 업무 오류(Logical/Permission/Concurrency) 외 `cause` 비움 |
| 높음 | 스윕의 마감 임박·독촉 알림이 미결제 사이트에도 생성 | `shouldEmitNotifications` 판정 |
| 높음 | 권한 허점 4건: 재상신으로 남의 결재 닫기 · `getSignatures` 로 아무 서명 조회 · PIN 실패 카운트 read-modify-write · 위임이 전 탭에 적용 | 요청자 or 실제 수정됨만 / 페이지 열람 가드 + 그 요청에서 결정한 사람만 / 비교 **전에** `reserveAttempt` 원자 증가 / 내 차례 탭만 |
| 중간 | 사라진 페이지(휴지통 비움) 결재 기록이 보관 정리에서 영원히 빠짐 | `filterRetainablePages` — 사용자에게 안 보인 id 만 asApp 존재 판정, 사라졌으면 포함하되 제목·메모·사유 가림 |
| 중간 | 삭제 가능 건수는 전 관리자에게 보이는데 삭제는 내보낸 사람만 | 확정된 내보내기는 아무 관리자나 삭제 |
| 중간 | 영역 매크로 삭제·복제 시 업무함 상세·회수 실패 | requestId 로 열 땐 요청 당시 해시의 영역 선택, 없으면 본문 없이(결정 닫고 회수 남김) |
| 낮음 | source map 배포 · 평가판 날짜 필드 순서 · 영역 매크로 제목 i18n · 스파이크 시절 manifest 주석 | `.env.production GENERATE_SOURCEMAP=false` · `trialEndDate` 우선 · 번역 키 · 주석 정리 |

## 수정분 재검토 (2026-10-21~22)
감사 수정 커밋을 다시 읽어 3건을 더 고쳤다 → `86a7586`(코드)·`d7d478e`(가이드). development **6.1.0** 배포(minor, install --upgrade 불필요).
| 문제 | 처리 |
|---|---|
| "아무 관리자나 삭제"로 바꿨는데 삭제 단계가 **지금 누른 관리자 기준**으로 열람 권한을 다시 걸러, 못 보는 페이지 하나에 삭제가 멈춤 | 삭제 시 재검사 제거 — 범위는 내보내기 확정 때 고정 |
| PIN `lock()` 이 fail_count 를 0 으로 되돌려, 먼저 센 동시 시도들이 잠금 뒤에도 해시 비교까지 감 | 다시 읽은 기록의 `lockedUntil` 확인 |
| 재상신 권한 확인이 결재란 삽입보다 늦어 거절돼도 문서 버전이 오름 | supersede 를 삽입 앞으로 |
| asApp 으로 안 보이는 페이지 = 삭제 **또는** 앱까지 막는 제한(v2 가 둘 다 404) | 문서에 명시(감수) |

교훈: **고친 코드도 다시 읽는다.** 한 축(소유자 제한)을 풀면 같은 경로의 다른 검사(열람 재검사)가 새 막힘이 된다. 잠금처럼 상태를 리셋하는 쓰기는 동시 경로가 "리셋된 값"을 볼 수 있는지 따진다.

## 사용자 결정
- **미결제여도 고객 콘텐츠는 볼모로 잡지 않는다** — 영역 매크로 본문(라이선스 예외 resolver `getRegionBody`, `PermissionMap.LICENSE_EXEMPT` 계약 테스트로 하나만 허용)과 byline 결재 상태는 보인다.
- **폐쇄 계정의 결재 기록 accountId 는 남긴다** — 감사 기록. 서명·PIN·위임·알림만 지운다.
- `read:comment:confluence` 는 유지(v2 footer-comments 생성이 read+write 요구라고 판단, 실측 없이 빼면 알림이 조용히 끊길 위험).
- `docs/` 는 gitignore(기존 `./docs/` 는 문법상 무효였다). 이미 추적 중인 `docs/guide/{ko,en}` 는 계속 추적 — 스테이징은 `git add -u -- <path>`.

## 겪은 문제
- handbook 원고 스크립트(`pair()`)·`render.cjs` 는 실행하면 게시 상태(`pages.json`)·`image-plan.json` 을 덮는다 → 실행하지 않고 원고·md 를 직접 치환. 로컬 preview HTML 은 옛 내용.
- 재상신 경계: 서버가 `canResubmit` 조건을 다시 확인하지 않았다 — **화면이 버튼을 숨기는 것은 권한이 아니다.**
- PIN 원자성 테스트: 메모리 mock 에서 동시 10건이 모두 증가한 뒤 읽기를 하면 전부 LOCKED 가 된다(실제 DB 도 같음, 안전한 쪽). 정확한 개수 대신 "INVALID ≤ 4, 나머지 LOCKED" 로 고정.
- `%SystemDrive%/` 폴더가 저장소에 생겨 있었다(Windows 셸 캐시가 환경 변수 미해석 경로로 씀) — 삭제.

## 교훈
- **Forge 는 warm runtime 을 테넌트 간에 재사용한다.** 키 없는 모듈 캐시는 성능 최적화가 아니라 교차 테넌트 권한 상승이다. 캐시는 invocation/installation 키로만.
- **accountId 를 저장하면 Personal data reporting 은 선택이 아니다.** 새 테이블·컬럼은 `ACCOUNT_SOURCES` 에 넣는 것을 체크리스트로(AGENTS.md).
- **egress 를 추가하면 "외부 전송 없음" 문서가 거짓이 된다.** 코드 변경과 개인정보 문서는 같은 커밋 단위로 본다.
- "가드 통과 ≠ 데이터 범위" 가 다시 나왔다 — `getSignatures` 는 SELF 가드였지만 SELF 가 "남의 것 조회 금지"를 뜻하지 않았다.
- 미결제 정책은 "막을 것"보다 **"보여야 할 것"** 을 먼저 정한다(고객 콘텐츠·상태 표시).

## 열린 항목
- [ ] push, production 배포(`--approve MAJOR_VERSION_RULE`)
- [ ] Sentry 프로젝트 "Prevent Storing of IP Addresses"·Data Scrubber 켜기(P&S 탭 "No" 의 전제)
- [ ] 리스팅 자산·개인정보처리방침·EULA·지원/보안 연락처·가격
- [ ] Confluence 가이드(dmove-addons `MA`) 재게시 — 개인정보·미결제 문구가 바뀜
- [ ] 두 번째 계정 수동 QA(재상신·위임·PIN 잠금·보관 정리)
- [ ] 리스팅 후 `MARKETPLACE_URL` 교체, production 에서 미결제 화면 확인
- [ ] restrictAccess(등록 사용자만) 켜진 사이트에서 미등록자에게 영역 본문이 가려지는 문제 — 사용자 판단 대기
