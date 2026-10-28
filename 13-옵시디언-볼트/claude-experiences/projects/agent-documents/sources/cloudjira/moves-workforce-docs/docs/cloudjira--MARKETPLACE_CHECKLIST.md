# Moves Workforce Docs — 배포·마켓플레이스 심사 점검표

> 작성 2026-09-30. 기준: Atlassian 앱 승인 가이드라인, Marketplace 보안 요구사항(2026-02 개정), Runs on Atlassian 자격, 브랜드 가이드라인.
> 판정: ✅ 충족 · 🟡 코드 밖에서 준비 필요 · ⏳ 배포 뒤 확인 · ❌ 미충족

## 1. 요약

| 구분 | 상태 |
|---|---|
| 코드로 확인되는 항목 | 전부 충족 (보안 감사 M-1~M-3, L-1~L-5 반영 완료) |
| 배포 뒤 실측 항목 | 14건 (`DESIGN.md` §10 P1~P14) + `forge eligibility` |
| 사람이 준비할 것 | 등록 자료 8건 (§5) |

## 2. 기술 요구사항

| 항목 | 상태 | 근거 |
|---|---|---|
| 모든 요청의 인증·권한 | ✅ | resolver 5개 전부 `guardedDefine` 경유, 미등록 함수 자동 거부, 호출자 미상은 PUBLIC 도 거부. 계약 테스트가 `src/` 전체에서 직접 등록을 검사 |
| 최소 권한 스코프 | ✅ | `storage:app`(설정·기억), `read:jira-work`(이슈 검색·프로퍼티 읽기·`mypermissions`), `write:jira-work`(프로퍼티 쓰기), `search:confluence`(문서·스페이스 검색). 4개 모두 실제 호출과 1:1 |
| 사용자 자격 사용 | ✅ | `asApp()` 사용 0건. Jira·Confluence 호출 전부 사용자 자격 |
| 입력 검증 | ✅ | resolver payload(형식·길이·개수), URL 파라미터(id 형식), 이슈 프로퍼티(30건·글자 수·id 숫자), 검색식 이스케이프, 링크는 id 로만 조립 |
| 테넌트 격리 | ✅ | Forge 저장소는 설치 단위. 사용자별 데이터는 `accountId` 로 키 분리, 호출자 미상 시 거부 |
| 비밀 값 저장 | ✅ 해당 없음 | 저장하는 비밀 값 없음. 소스·설정에 키·토큰 없음(감사 확인) |
| 로그에 개인정보 없음 | ✅ | `console.*` 호출 0건. 실패 응답에 원문 오류·내부 정보 미포함 |
| 사용자 자격증명 수집 없음 | ✅ | 로그인·비밀번호 입력 없음 |
| 높음 이상 취약 의존성 없음 | ✅ | `npm audit --omit=dev` 루트·프론트 0건 (2026-09-30). 개발 도구(react-scripts)는 배포물 밖 |
| 지원 종료 런타임 아님 | ✅ | `nodejs22.x` |
| 소스맵 미배포 | ✅ | production 빌드 `devtool=false`, `.map` 0건 |
| 외부 통신 없음 | ✅ | `permissions.external` 없음, remotes 없음 |
| Runs on Atlassian | ⏳ | 외부 도메인·remotes·동적 웹트리거 없음 → 자격 예상. `forge eligibility` 는 등록 뒤 실행 |
| 라이선스 검사 | ✅ | `app.licensing.enabled: true`, 백엔드(모든 resolver)·화면 판정 동일 경계, 판정표 28행 양쪽 통과. 운영 실측 P12 |
| 다중 제품 호환 | ⏳ | Jira 필수 + Confluence 선택. **유료 전용, Preview, 비가역** — 첫 운영 배포 전 확정됨 |
| 호스트 UI 영향 없음 | ✅ | 전역 페이지 하나, 이슈 화면·Confluence 화면 모듈 없음 |

## 3. 배포 뒤 실측 (등록 → 배포 → 설치 순서)

```bash
cd C:\CloudJira\moves-workforce-docs
forge register                      # 앱 이름: Moves Workforce Docs
cd static/ui && npm run build && cd ../..
forge lint
forge deploy -e development
forge install -e development        # Jira 먼저
forge install -e development        # 한 번 더: Confluence 연결
forge eligibility                   # Runs on Atlassian 자격
```

실측 항목은 `DESIGN.md` §10 P1~P14. 영향이 큰 순서:

| 순위 | 항목 | 다르면 |
|---|---|---|
| 1 | P1 설치 감지(`jql/parse` strict) | Workforce 문서 탭이 항상 보이거나 항상 숨음 |
| 2 | P3 Jira 화면에서 `requestConfluence` | 문서 연결 자체 불가 → 백엔드 경유로 변경 |
| 3 | P12 운영 `context.license` | 오지 않으면 미결제 설치가 통과 → License API 직접 조회 추가 |
| 4 | P14 `viewpage.action?pageId=` 링크 | 링크가 안 열리면 주소 형식만 교체 |
| 5 | P9 manifest `translations` 전달 | 문구 대신 키가 보임 |
| 6 | P4 다른 앱 화면으로 이동 | 버튼이 홈으로만 감 |
| 7 | P2·P6·P7·P8·P10·P11·P13 | 색인·팀 관리형·검색 품질·응답 필드·스페이스·본문 검색·평가판 필드 |

등록 뒤 채울 값: `manifest.yml` `app.id`(자동), Workforce `static/ui/src/constants/movesDocs.js` 앱 id·환경 id, `static/ui/src/pages/license/licenseConstants.js` 마켓 주소.

## 4. 이름·브랜드

| 항목 | 상태 | 내용 |
|---|---|---|
| 등록명 | ✅ | **Moves Workforce Docs for Jira** — 제품명 앞, "for Jira" 뒤, 29자, 금지어 없음, Title Case |
| 로고 | 🟡 | Atlassian 로고·색·글꼴·아이콘 사용 금지. 자체 마크로 제작 |
| 설명 문구 | 🟡 | 내부 용어(프로퍼티·JQL·CQL·스코프) 없이 작성. "접근 범위는 Jira 권한을 따른다", "문서 제목이 이슈를 볼 수 있는 사람에게 보인다"를 안내에 포함 |

## 5. 등록 자료 (사람이 준비)

| 자료 | 상태 | 비고 |
|---|---|---|
| 개인정보 처리방침 URL | 🟡 | Workforce 것을 확장 가능. 저장 데이터: 설정 1건, 사용자별 열어 본 프로젝트 목록(id·이름·시각), Jira 이슈 프로퍼티에 문서 제목·스페이스 이름·분류·연결한 사람 id·시각 |
| 이용 약관(EULA) | 🟡 | Atlassian 표준 EULA 채택 가능 |
| 데이터 처리 부속서(DPA) | 🟡 | 계정 id 를 저장하므로 개인정보 처리에 해당 |
| 문서 URL | 🟡 | 설치·사용 안내. `README.md` 기반 |
| 지원 연락처 | 🟡 | 회사 도메인 이메일(무료 메일 불가) |
| 개인정보 및 보안 탭 | 🟡 | 저장 위치: Atlassian(Forge KVS + Jira 이슈 프로퍼티). 외부 전송 없음. 데이터 레지던시: Forge 저장소 기준 |
| 스코프 사유 | ✅ | §2 표의 스코프 행 그대로 |
| 화면 캡처·배너 | 🟡 | 배포 뒤 실제 화면으로 |
| 가격 | 🟡 | Jira 사용자 수 기준 청구(다중 제품 앱은 필수 제품 기준). 유료 전용 |
| 파트너 검증 | 🟡 | 기존 파트너 계정이면 완료 상태 확인 |

## 6. 심사 답변에 적어 둘 것

- `permissions.content.styles: unsafe-inline` — Atlaskit 이 런타임에 인라인 스타일을 삽입한다. Workforce 와 같은 사유.
- 이슈 프로퍼티에 문서 메타데이터를 저장하는 이유 — 두 Forge 앱이 데이터를 공유할 수 있는 유일한 지점. 본문은 저장하지 않는다.
- 다중 제품 호환을 쓰는 이유 — 문서 검색에 Confluence 권한이 필요. Confluence 화면 모듈은 없다.

## 7. 후속 과제 (심사와 무관, 기록)

- 빌드 도구(react-scripts 5)의 취약점 25건은 배포물 밖. 제품군 공통으로 도구 교체 검토.
- Workforce 본체의 운영 의존성 취약점(루트 높음 7·프론트 높음 17, `@forge/bridge` 5.x 경유 등)은 이번 범위 밖 — 별도 정리 필요.
- 문서 제목 자동 갱신 끄기 설정, 연결 쓰기의 백엔드 이전(라이선스 완전 강제)은 실측 결과에 따라.
