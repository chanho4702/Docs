# Moves Approval 승인 수명 주기 설정 UI

## 결정

- Appfire Comala의 장점은 임의 workflow 편집보다 상태 흐름을 중심으로 설정을 설명하는 정보 구조에 있다고 판단했다.
- Moves Approval의 `EXPIRED`는 진행 중 요청의 마감·문서 변경 종료 상태이며 승인 완료 문서의 정기 재검토가 아니다. 재검토 기능이 필요하지 않다는 사용자 결정을 반영해 도메인과 DB는 바꾸지 않았다.
- 고정 상태 머신은 유지하고 `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` 노드를 선택하면 오른쪽 inspector에서 상태 의미와 관련 정책을 확인하도록 재구성했다.
- `PENDING`에는 마감·알림·독촉, `REJECTED`에는 반려 사유 정책을 배치했다. 나머지 종료 상태는 새 요청으로만 다시 시작한다는 의미를 안내한다.
- PIN·서명·위임·결재란과 접근 권한은 여러 상태에 걸친 공통 정책이므로 상태 inspector 아래의 기존 카드에 남겼다.

## 구현과 검증

- 변경: `PolicySettings.jsx`, `StatusFlow.jsx`, 한·영 `policy.json`.
- resolver, 정책 키, 저장 API, DB schema는 변경하지 않았다.
- UI Jest 16 suites / 91 tests, backend Jest 35 suites / 248 tests 통과.
- production UI build 통과. 설정 번들은 약 91.83 kB gzip이며 기존 Atlaskit CSS 변수 경고만 남았다.
- `forge lint`: No issues found.
- 배포는 수행하지 않았다.

## 공식 문서 동기화

- 코드 커밋 `8d97698`의 새 설정 정보 구조에 맞춰 한·영 `admin-policy`와 `admin-setup` 4페이지를 갱신하고 공개 Confluence에도 게시했다.
- 기존 MA-14/MA-15 캡처는 패치 전 평면 정책 화면이어서 본문에서 제거했다. 새 화면을 실제 배포 환경에서 캡처한 뒤에만 다시 넣는다.
- `PENDING`의 마감·알림·독촉, `REJECTED`의 반려 사유, 아래 공통 결재·접근 정책, 마지막 공통 저장 버튼의 조작 순서를 문서화했다. 종료 상태는 표시명만 편집 가능하다는 점도 명시했다.
- 48개 공개 가이드의 본문·링크 검증은 통과했지만, Forge staging 배포 여부 조회가 응답 없이 지연돼 실제 staging UI와 새 문서의 일치 여부는 확인하지 못했다.

## Production 출시 전 감사

- production 환경에는 암호화된 `SENTRY_DSN`이 이미 등록돼 있고, major version 2가 2026-10-26 08:28 UTC에 배포됐다. Forge 판정상 유료 라이선스가 켜져 있고 Runs on Atlassian 대상이다.
- 원격 `main`의 병합 커밋 `3bcc2e6`은 `develop`의 `8d97698`을 포함한다. production 파이프라인의 브랜치 조건과 최신 코드 반영은 맞다.
- `forge install list`에는 development·staging 설치만 있고 production 설치가 없어, 실제 production context의 유료 라이선스와 Sentry 이벤트는 아직 재현하지 못했다.
- `npm audit --omit=dev` 결과 backend High 3건, frontend Critical 1건·High 9건·Moderate 2건이 보고됐다. 신규 Marketplace 심사는 Critical 및 일부 High 취약점에 막힐 수 있으므로 제출 전에 의존성 업데이트와 회귀 검증이 필요하다.
- 상세 경로: backend High 3건은 lockfile의 `@forge/api → @forge/manifest → fast-uri/undici/brace-expansion`; frontend Critical은 `jsPDF` optional dependency `DOMPurify 3.4.16`, High 다수는 `@forge/bridge 5.17.0 → @atlaskit/adf-schema → editor-prosemirror/markdown-it/linkify-it`, 나머지는 Forge manifest 하위 패키지다.
- 빌드 산출물을 검색한 결과 DOMPurify는 `jspdf` 동적 chunk에 실제 포함된다. 앱은 `jsPDF.html()` 대신 html2canvas 이미지를 PDF에 넣지만 Marketplace 의존성 스캐너와 배포 번들 양쪽에서 제거 대상이다.
- 안전한 패치 업데이트는 `DOMPurify 3.4.17`, `markdown-it 14.3.3`, `undici 7.30.1`, `fast-uri 3.1.9`, `brace-expansion` 각 패치 버전이다. `@forge/bridge 7.2.1`은 major 회귀 검증이 필요하고, `exceljs 4.4.0 → uuid 8.3.2` Moderate는 upstream 고정 버전이 없어 override·교체·위험 수용 판단이 별도로 필요하다. `npm audit fix --force`는 bridge major와 exceljs downgrade를 섞으므로 사용하지 않는다.
- 구매 CTA는 아직 Marketplace 검색 결과를 가리킨다. 리스팅 URL 발급 뒤 실제 앱 URL로 교체해야 한다.
- Sentry는 URL·요청 데이터·사용자·breadcrumb를 제거하지만 예외 message와 stack은 남긴다. `inScopeEUD: false`와 Privacy & Security의 “EUD 없음” 답변을 유지하려면 Sentry 서버 측 IP 저장 방지·scrubber 설정과 오류 payload 잔여 위험 판단이 필요하다.

## 의존성 보강과 Production 2.2.0 배포

- `npm audit fix --force`를 쓰지 않고 production 경로만 보강했다. backend lockfile의 `brace-expansion`, `fast-uri`, `undici`를 패치했고 frontend는 `@forge/bridge 7.2.1`, `DOMPurify 3.4.17`, `prosemirror-view 1.42.3`, ExcelJS 하위 `uuid 11.1.1`로 정리했다.
- backend와 frontend 모두 `npm audit --omit=dev --audit-level=moderate` 결과가 0건이다. 전체 frontend audit에는 `react-scripts 5` 개발 도구 체인의 31건이 남지만 production dependency 및 배포 번들에는 포함되지 않는다. 개발 도구 현대화는 별도 변경으로 다룬다.
- 평가판 만료 테스트가 UTC 날짜 문자열과 로컬 자정의 차이로 2일을 1일로 계산하는 문제를 발견했다. 테스트 날짜를 `dayjs().add(2, 'day').format('YYYY-MM-DD')`로 만들어 실제 구현의 로컬 날짜 기준과 맞췄다.
- backend 249 tests, frontend 91 tests, production build, `forge lint`를 모두 통과했다. 기존 Atlaskit CSS 계산 경고 1건만 남았다.
- `develop` 커밋 `966609d`를 `main` 병합 커밋 `b0e1cbb`로 반영하고 두 브랜치를 원격에 push했다.
- Forge production에 version `2.2.0`을 배포했다. 암호화된 `SENTRY_DSN` snapshot이 반영됐고 Runs on Atlassian 적격 상태를 유지했다.
- production 설치는 여전히 0건이다. 배포 완료와 고객 사이트 설치·Marketplace 라이선스 실검증을 같은 상태로 보지 않는다.
