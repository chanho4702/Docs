# Moves Workforce 고객 가이드 작업 재개

## 최신 상태 — 2026-10-05 프로젝트 스킬·협업 모드 및 통합 대시보드 차트별 구성 완료

- 사용자 지정 범위인 **프로젝트 관리·통합 대시보드 한영 4페이지만** 갱신했습니다. 프로젝트 KO171573335 v13 / EN204046601 v8, 통합 대시보드 KO173015041 v6 / EN204047167 v4입니다. 다른 86페이지는 전후 버전이 동일합니다.
- 프로젝트 관리에는 필요 스킬 선택·제거·저장·조회 실패·부분 저장 재시도와 협업 모드의 ON 확인/OFF 즉시 요청, 별도 즉시 저장, 참여자·프로젝트 범위·Jira 편집 권한, 앱 조회 제한과 본인 권한 예외를 추가했습니다. 간트도 적용 화면에 포함하며, 연관관계 예외는 작업 상세 영역으로 한정했습니다.
- 통합 대시보드는 실제 UI 순서에 맞춰 Overview / Time / Scope / Resource / Cost 아래 **언어별 25개 H3 차트 설명**으로 재구성했습니다. 각 차트는 표시 내용·계산 기준·해석 방법·필터/권한/주의사항으로 나누고 기존 계산/해석 셀 50개를 언어별 그대로 보존했습니다. 전역 문제 이슈 TOP50에는 상단 선택과 프로젝트 범위 필터가 적용되지 않는 실제 제한을 명시했습니다.
- **사용자가 기존 페이지를 직접 수정하고 이미지를 첨부했습니다. 과거 ‘실제 첨부 0’ 기록은 현재 상태가 아닙니다.** 프로젝트 KO의 media ID12864439-f87b-42e3-90d1-ffadc9028a81, 이미지 크기·배치·캡션을 전후 ADF로 확인했습니다. 프로젝트 기존 본문 뒤에만 추가했습니다. EN 편집기에 있던 info panel·표 너비는 유지된 채 게시됐습니다. 대시보드 2페이지는 최신 공개 본문을 읽어 재구성했고 당시 media0을 확인했습니다.
- `project-additions/`에 before/after 공개 본문·ADF·90페이지 버전, 추가 설명 MD/HTML, 대시보드 HTML, `verification.json`을 보관했습니다. 준비 `prepare-focused-help.cjs`, 읽기 검증 `verify-focused-help.cjs`, 스냅샷 `project-additions-snapshot.cjs`입니다. 읽기 전용 상위 모델 소스 검토도 완료했습니다.
- **기존 전체 generator/publisher를 그대로 실행하지 마세요.** 로컬 옛 원본은 사용자가 Confluence에서 수정한 본문·이미지를 반영하지 않습니다. 다음 수정도 최신 공개/편집 본문을 백업하고 사용자가 지정한 페이지에만 적용합니다. 이번 작업에서 앱 코드·실데이터·배포·커밋은 변경하지 않았습니다.

## 최신 상태 — 2026-10-05 버튼·필드·차트 상세 참조 보강 완료

- 사용자 요청에 따라 상위 모델 `gpt-6-astra`의 읽기 전용 소스·독자 검토를 적용했습니다. **32개 기능 주제·한영 64페이지에 언어별 211개 항목군**을 추가했습니다. 버튼·필드의 목적, 조건, 변경 대상, 저장 결과 확인, 실패 대응과 차트의 계산·해석을 한영으로 대응시켰습니다. 모든 UI 버튼을 전수 실동작 검증했다는 뜻은 아닙니다.
- 개인 업무 3주제, 프로젝트 기능 6주제, 관리자 설정 9주제, 분석·자원·패널 14주제를 보강했습니다. 프로젝트 대시보드 15종 위젯과 실제 포트폴리오 JSX에서 소비되는 25종 차트 도움말도 설명했습니다. 기존 FAQ·권한 요약 각 한영 2페이지, 한국어 프로젝트 상세 개요 1페이지, 심사 안내 한영 2페이지도 교정해 이번에 **기존 71페이지**를 갱신했습니다. 페이지 주소·언어별 목차는 재사용했습니다.
- 교정: Add User에 역할·레벨 입력이 있다는 잘못된 절차, 일괄 담당자 수정, 보드 구독, 비용 Excel 내보내기, 미존재 계정의 원인 단정, 프로젝트 범위만으로 전사 인력 접근이 열린다는 설명을 수정했습니다. 급여 밴드 최초 설정 순서·기호 제거, CPI 0의 예상 비용 대체 표시, 전역 TOP50 문제 이슈의 담당자별 TOP10, 최근 26주 수정일 조건, 명부 등록과 Jira 담당·동료 권한의 차이도 반영했습니다.
- 검증: 로컬 핵심 42페이지·194링크 빌드, 공개 핵심 42/42·부속 46/46·심사 2/2 통과. 전체 한영 **44쌍·88페이지**, 링크·영어 한국어 잔존·깨진 문자 검사 실패 0. 상세 참조 **64/64페이지·1,334개 본문 항목**을 공개 저장 본문과 대조했습니다. 기존 상세 절차 회귀 **16/16·371개 항목**도 통과했습니다. `control-reference-verification.json`, `bilingual-verification.json`과 각 publication verification 파일이 증빙입니다.
- 현재 이미지 삽입 위치 표시는 **77곳**입니다(진척 화면 표시 한영 2곳을 명시적 삽입 표시로 정리). 실제 첨부 0, 캡처 20장+진단 1장 상태는 유지됩니다. 역할별 실계정 저장·제품 배포 버전은 미검증입니다. 앱 코드·실사용 데이터 mutation·배포·설치·커밋·푸시·Marketplace 제출은 수행하지 않았습니다.
- 원본 상세 데이터는 `control-reference-{personal,project,administration,analytics}.json`; `refine-control-data.cjs`와 `fix-control-contracts.cjs`는 발견한 사실 오류 교정, `apply-control-reference.cjs`는 상세 참조 구간 생성입니다. 소스 근거는 `control-reference-coverage.json`에 있습니다. `inventory-controls.cjs`의 정규식 수집 결과는 탐색 보조이며 전수 기능 검증 증빙이 아닙니다.
- **부속 HTML 재생성에는 `prepare-supplemental.cjs --html-only`를 사용합니다.** 기본 실행은 예전 한국어 매뉴얼을 다시 읽어 이번 원본 보강을 덮을 수 있습니다. `enrich-walkthroughs.cjs`·`enrich-review-guide.cjs`도 교정 전 내용을 다시 생성할 수 있으므로 그대로 실행하지 않습니다. 실제 이미지 첨부 후 이미지 없는 publisher를 재실행하면 이미지를 제거하므로 주의합니다.
- Chrome 실제 연결을 공식 Browser runtime으로 확인했습니다. 게시용 새 도구 탭 `961899587`에서 갱신했습니다. 한국어 프로젝트 상세 개요의 본문 제거 확인이 한 번 실패해 `controlsSup.publishCurrent()`로 재시도한 뒤 공개 링크 검증을 통과했습니다. 최종 사용자 확인은 언어별 목차에서 가능합니다.

## 최신 상태 — 2026-10-05 따라 하는 상세 절차 보강 완료

- 사용자가 기존 가이드의 설명이 짧다고 지적해 핵심 7주제(빠른 시작, My Work, 프로젝트 생성, 프로젝트 인력, 작업 관리, 문서 연결, 관리자 초기 설정)의 한·영 14페이지를 보강하고 기존 Confluence 페이지에 게시했습니다. 메뉴 경로, 입력 항목 의미와 예시, 단계별 실행, 저장 후 확인과 실패 재시도를 추가했습니다. 전체 88페이지를 이번에 다시 쓴 것은 아닙니다.
- 기간 워크로그 실패는 생성분 취소 시도를 설명하고, 취소 불완전 시 남은 정상 기록 유지·누락 날짜만 단일 입력 또는 남은 기록 삭제 후 전체 재시도로 안내했습니다. 소스는 `WorklogModal.jsx`의 실제 취소 처리와 대조했습니다.
- 문서 연결은 프로젝트 전체 문서와 특정 Jira 작업 문서의 예시를 나눴습니다. 같은 사이트 Confluence 조건, Documents / Work items / Category 선택, 분류 변경·연결 해제 후 원본 보존과 작업별 실패 확인을 설명했습니다.
- Marketplace 심사 안내 한·영 2페이지도 준비 항목·Jira 실행 표·Confluence 실행 표·예상 결과로 보강했습니다. 일반 사용자로 기록할 때 본인 계정 전환을 명시했습니다. 영어 203718677 / 한국어 203751433의 기존 주소를 재사용했습니다.
- 독자 관점 검토에서 설정 순서, 팀 구성원 선택 용어, 프로젝트 기간 기반 비용 환산, 기간 입력 실패 후 행동, 심사 기록 계정의 모호성을 수정했습니다.
- 검증: 로컬 42페이지·194링크 빌드 통과, 공개 핵심 42/42 및 심사 2/2 통과, 기존 한·영 44쌍·88페이지 전환 검사 실패 0. `verify-detailed-walkthroughs.cjs`는 이번 보강 16페이지의 공개 본문에서 371개 문장·표 항목을 대조해 16/16 통과했습니다. 증빙 `detailed-verification.json`, `review-verification.json`, `public-verification.json`.
- 실제 그림 첨부는 여전히 0이며 기존 이미지 위치 표시 75곳은 유지합니다. 캡처는 `captures/en/`, 원본 문서 참조는 `confluence/images/en/`입니다. 문서·링크 검증은 역할별 실계정 저장 동작·배포 버전 검증과 구분합니다. 앱 코드·배포·설치·커밋·푸시·Marketplace 제출은 수행하지 않았습니다.
- 이어서 게시할 때는 공식 Browser runtime과 `browser-publisher.mjs`를 사용합니다. 핵심은 `browser-publication.json`, 심사는 `review-publication.json`과 `review-html/`입니다. 실제 이미지를 첨부한 뒤에는 이미지 없는 본문 덮어쓰기 helper를 그대로 재실행하지 않습니다.

## 최신 상태 — 2026-10-05 부속 포함 한·영 대응 정리 완료

- 사용자 지시 ‘계속 진행해 문서 마무리’에 따라 기존 부속 23주제를 한·영으로 정리했습니다. 기존 EN_한국어 상세 문서 21개를 영어로 교체하고, 영어 지표 계산 203751835·권한 요약 203751861을 새로 만들었습니다. **핵심 21쌍 + 부속 23쌍 = 44쌍, 88페이지**입니다.
- 기존 한국어 부속도 최신 매뉴얼의 절차·권한·팀장 규칙으로 갱신하고 상단 언어 전환을 붙였습니다. 제목의 EN_와 README, 옛 번호를 고객용 제목으로 정리했습니다. 부모는 보존했으므로 사용자·관리자 폴더의 물리적 배치는 완전 동일하지 않으며, 주제·목차·상호 링크가 대응합니다.
- `supplemental-publication.json` 실제 ID·본문 소스·상태, `supplemental-verification.json` 공개 검증 46/46. 원본은 `confluence/supplemental/{ko,en}/`. 준비기는 `prepare-supplemental.cjs`입니다. KO 세부 절차는 기존 로컬 매뉴얼에서 생성하고 EN 대응 소스는 직접 번역했습니다. 지표 KO·EN은 고객용 계산과 해석으로 작성해 내부 SQL·KVS 규약을 제외했습니다.
- 핵심 12페이지에 세부 안내 링크를 추가했습니다. `append-supplemental-navigation.cjs`가 핵심 소스의 주석 구간을 갱신합니다. 로컬 핵심 빌드 42페이지·168로컬링크 통과. 실제 핵심 공개 검증은 42/42입니다.
- 공간 홈 114327890과 예전 User Guide120619009를 최신 가이드·심사 안내·정책으로 연결했습니다. `auxiliary-publication.json`, `auxiliary-verification.json`, 공개 검증 2/2입니다. 심사 안내 한·영 2개는 지난 턴 게시 상태 유지.
- `verify-bilingual-pairs.cjs` 결과 88페이지, KO44, EN44, 44쌍, 실패0. 모든 문서의 언어 전환을 확인하고 영어 본문의 한국어 잔존을 검사했습니다. 예외는 용어집의 원본에 있는 한국어 대조 열만이며 안내 문단은 영어입니다.
- 사용자 요청으로 드래그 업로드 가능성을 확인했습니다. 현재 Browser runtime은 브라우저 내부 요소만 드래그하고 OS 파일 탐색기에서 로컬 파일을 가져오는 기능은 제공하지 않습니다. Choose a file 재시도도 같은 파일 URL 접근 오류였습니다. **실제 첨부 없음**. 대신 이미지 위치 **75곳**, 확보된 JPG 파일명과 미확보 ‘추가 캡처 필요’를 구분했습니다.
- 마지막 Chrome kernel 초기화에서 ID1이 ‘내 Chrome’(extensionInstanceId9ca8ab00-29da-441b-85bf-956be279ac06), ID2가dmvdev였습니다. 숫자를 재사용하지 말고 실제 목록의 메타데이터로 판단합니다. 도구 소유 탭961899573은 영어 목차를 deliverable로 보존했습니다. 마지막 화면 `publication-final-en-guide.jpg`를 육안 확인했습니다.
- 발행 helper는 옵션 planFile·htmlDirectory를 지원합니다. 실제 편집기는 `#ak-editor-textarea.ProseMirror[aria-label="Page editing area, start typing to enter text."]`입니다. Rovo 입력과 중복ID가 생길 수 있어 좁힌 selector를 사용합니다. 빈 편집기 안내 ‘Press space to Ask Rovo or / to insert elements’는 본문이 아닙니다. `fill` 후 남아 있으면 Control+A 두 번과 Backspace로 제거하고 빈 상태를 확인합니다.
- 새 페이지에 붙여넣으면 Rovo가 제목을 자동 생성할 수 있습니다. 실제 제목을 다시 대조해야 합니다. Publish... → 게시 위치 대화상자 → Publish입니다. permission-summary는 처음 자동 제목으로 게시된 것을 읽기 검증으로 확인한 뒤 제목과 본문을 다시 갱신했습니다. 현재 공개 제목은 정확합니다.
- 영어 분석 2개에 오래된 한국어 본문이 남은 것을 공개 검사로 발견해 완전히 제거하고 재게시했습니다. HTML의 `&middot;`와 Unicode 중점은 같은 문자로 비교합니다. 원문 깨진 색상 문자2곳도 정리했습니다.
- 앱 코드·권한 변경·실데이터 mutation·배포·설치·커밋·푸시·Marketplace 제출은 하지 않았습니다. 남은 것은 실제 그림 첨부와 역할별 실계정·저장 동작·배포 버전의 제품 검증입니다. 본문·번역·목차·언어 이동은 완료입니다.

아래는 2026-10-04 과거 작업 기록입니다. 최신 숫자와 상태는 위를 기준으로 합니다.

## 최신 상태 — Confluence 본문 게시 및 공개 조회 검증 완료

- 사용자가 이미지 첨부가 안 되면 위치를 표시하라고 요청했습니다. **한·영 20페이지의 36곳**에 `[이미지 삽입 위치]` / `[Image insertion point]`, 실제 JPG 파일명, 화면 설명을 해당 절차 바로 아래에 게시했습니다. `prepare-browser-publication.cjs`가 원본 이미지·캡션을 위치 표시로 변환합니다. `verify-publication.cjs`는 이제 공개 본문에 해당 파일명도 존재하는지 대조하며 최종 42/42 통과했습니다. 원본 Markdown의 이미지 링크는 유지했습니다.
- 2026-10-04 한·영 21개 주제, 42페이지 본문을 실제 Confluence MW에 게시했습니다. `verify-publication.cjs`의 최종 결과는 **42페이지, 검증 42, 미완료 0**입니다. 검증은 인증 없는 Confluence REST v1 요청으로 제목·본문 H2·렌더링된 링크의 실제 대상 ID를 대조했습니다. 제품의 역할별 동작 검증 완료를 뜻하지 않습니다.
- 한국어 목차: https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/172326913
- 영어 목차: https://dmove-addons.atlassian.net/wiki/spaces/MW/pages/204046349
- Marketplace 신규 심사용 Jira·Confluence 안내도 한·영으로 갱신했습니다. 영어 203718677, 한국어 203751433, 두 페이지 모두 공개 조회에서 설치·3.4 심사 절차·search:confluence·Sentry 설명을 확인했습니다.
- Confluence 연동의 의미는 Jira 안에서 같은 사이트의 Confluence 페이지를 검색해 프로젝트·작업에 연결하는 기능입니다. 앱 화면은 Jira에 있으며 Confluence 원본을 쓰거나 삭제하지 않습니다. 기존 자료의 ‘타사 연동 없음’은 Sentry 설정과 맞지 않아 수정했습니다.
- 실제 게시 ID·상태: `browser-publication.json`. 공개 검증: `public-verification.json`, `confluence-public/verified/`. 기존 페이지 저장 본문은 `confluence-public/pages-before-guide-updates.json`과 최초 심사 안내 AX 스냅샷으로 보존했습니다. `page-map.json`은 계획 파일이며 실제 상태가 아닙니다.
- **남은 이미지 첨부:** 고객용 20장·진단 1장을 확보했지만 Chrome ChatGPT 확장의 **파일 URL에 대한 액세스 허용**이 꺼져 있어 `fileChooser.setFiles`가 실패했습니다. 사용자에게 설정 안내와 비동기 질문을 전달했으며 답은 아직 없습니다. 공개 본문에는 실제 이미지 대신 위치·파일명·화면 설명이 있습니다. 클립보드 JPEG도 실제 이미지로 삽입되지 않았습니다. 이미지가 첨부됐다고 보고하면 안 됩니다.
- 공식 runtime의 browser ID 숫자는 초기화 때 바뀝니다. `browsers.list()`의 profileName **내 Chrome**, extensionInstanceId `9ca8ab00-29da-441b-85bf-956be279ac06`로 선택합니다. 마지막 초기화에서 해당 browser ID는 `2`였고 `1`은 dmvdev였습니다.
- node_repl timeout으로 kernel이 초기화되면 이전 claimed tab이 `Debugger unattached`로 실패할 수 있습니다. 실제 browser를 다시 선택한 뒤 공식 `tabs.new()`로 새 탭을 열어 복구했습니다. 외부 셸로 Chrome을 조작하지 않았습니다.
- 재사용 UI 발행 helper: `browser-publisher.mjs`. `makePublisher(tab)` 후 `update(source)`를 호출합니다. 본문은 실제 DOM에서 확인한 `#ak-editor-textarea.ProseMirror`를 `fill('')`하고 공식 AX HTML paste로 입력합니다. AX의 본문 텍스트 영역 클릭은 편집기 밖 region에 포커스할 수 있어 Ctrl+A가 페이지 전체 선택으로 끝났습니다. 페이지 로딩과 입력 H2, 게시 제목·H2를 확인해야 합니다. 한 번의 node_repl 호출에 여러 페이지를 묶어 timeout을 유발하지 않습니다.
- helper의 `browser-html/`은 현재 **이미지 없는 본문**입니다. 이미지 추가 이후 이 helper로 본문을 다시 덮으면 그림이 빠지므로 그대로 재실행하지 않습니다. 새 첨부는 page-map의 attachments 및 원본 Markdown 캡션 위치를 기준으로 기존 게시 페이지에 넣습니다.
- 역할별 실계정·저장 동작·배포 버전, 미확보 주제 화면은 여전히 미검증입니다. 기존 부속 세부 페이지는 별도 보존되어 있으며 42페이지 전체 제품 검증 완료나 기존 영문 영역 모든 부속 문서의 번역 완료를 뜻하지 않습니다.
- 앱 코드·배포·설치·커밋·푸시는 하지 않았습니다. 사용자가 마지막으로 소요 시간을 물었을 때 본문 완료, 기록·마지막 확인 약 2~3분 남았다고 답했습니다.

## 최신 상태 — Chrome 연결 성공, 캡처 반영 완료

- 상세 설명에 초기 12장만으로 충분한지 사용자가 질문해 상세 절차 캡처를 추가했습니다. 최신 원본은 고객 가이드용 20장과 이슈 패널 미표시 진단 1장, 총 21장입니다.
- 워크로그 기간 입력, Subscriptions 목록·조건 편집, 문서 목록·연결 창·작업 선택, 자원 배정·작업 선택 창을 추가했습니다. IMG-10·13·14와 기간 입력 그림을 한·영 본문에 반영했습니다. 최신 검증은 42페이지·168링크·36첨부 참조 통과입니다.
- MWD-46의 Jira 화면에서 앱 패널·활동 탭이 표시되지 않았습니다. `10-issue-panel-unavailable.jpg`는 진단용이며 고객 본문에는 연결하지 않았습니다. backfill·배포·권한 변경은 하지 않았습니다. 이 결과만으로 모든 이슈에서 기능이 없다고 단정하지 않습니다.
- 구독 신규 조건 미리보기, 팀장 역할 화면, 포트폴리오·워크로그 추출 등 남은 주제 캡처는 아직 완료되지 않았습니다. 초기 12장이나 최신 20장을 전체 상세 가이드의 최종 캡처 완료로 표현하지 않습니다.

- 아래 과거 연결 실패 기록은 최신 상태가 아닙니다. 2026-10-04 공식 Browser runtime으로 Chrome 탭 접근에 성공했습니다.
- `node_repl`에서 `C:/Users/DMOVE/.codex/plugins/cache/openai-bundled/browser/26.930.31428/scripts/browser-client.mjs`의 `setupBrowserRuntime()`를 import하고 실행합니다. `browsers.list()` 결과에서 실제 Chrome을 선택합니다. 브라우저 documentation을 읽고 `nameSession()` 후 `user.openTabs()`의 실제 객체를 `claimTab()`에 전달합니다.
- 사용자는 이미지를 영어 화면으로 공통 사용해도 된다고 지정했습니다. 계정 언어는 변경하지 않았습니다.
- `_workspace/bilingual-guide-preview/captures/en/`에 영어 원본 12장. `captures.html`에서 전체 확인 가능. 원본 복사본은 `Moves_Workforce_사용자_매뉴얼/confluence/images/en/`입니다.
- 우선 IMG-01~08과 IMG-11을 한·영 본문에 연결했습니다. `build-guide.cjs`는 JPEG 원본·대체 텍스트 검증, 미리보기 복사, Confluence attachment 참조와 page-map의 attachments를 생성합니다.
- 재생성: `node Moves_Workforce_사용자_매뉴얼/confluence/build-guide.cjs`. 추가 확인: `node _workspace/bilingual-guide-preview/verify-captures.cjs`. 42페이지·168링크·22첨부 참조 통과. 게시 완료를 뜻하지 않습니다.
- 실제 화면에서 프로젝트 인력 진입 `User Management → Members`를 확인했습니다. 일반 설정에 MM 입력란은 관찰되지 않아 해당 표 행을 제거했습니다. 워크로그 영어 UI에는 한국어 버튼과 `{3}h {30}m` 표기 차이가 있습니다.
- 현재 로그인 계정으로 촬영했으며 일반 사용자·팀장별 권한 검증을 대신하지 않습니다. 워크로그·설정·권한은 저장하지 않았습니다.
- Confluence 현재 User Guide 폴더 204046344를 읽었습니다. 기존 한국어 사용자 폴더 171573307, 한국어 관리자 폴더 172457996, 한국어 최상위 폴더 172195842가 보입니다. 영어 기존 페이지: 개요 204046349, My Work 204046436, 마이페이지 204046526, 프로젝트 관리 204046601, 프로젝트 상세 204046659, 통합 대시보드 204047167, 자원 관리 204047231, 설정 204047432. 페이지 현재 내용·버전과 21개 새 주제의 매핑은 추가 확인해야 합니다.
- 남은 작업: 추가 기능·역할별 화면과 배포 버전 확인, 기존 Confluence 내용·버전 대조, 42페이지 배치·첨부 업로드·게시. 외부 게시는 아직 하지 않았습니다.

## 사용자 요청

- 기존 문서를 개선해 고객 사용자·관리자용 한국어·영어 가이드를 Confluence MW 공간에 배치합니다.
- 화면 기준: https://dmove-staging.atlassian.net/jira/apps/f8962f17-9f12-43d0-91f5-7f3a626c1bbf/d4db76d2-78e2-47b6-a931-bcbd33ac8f7d/myWork
- 게시 대상: https://dmove-addons.atlassian.net/wiki/spaces/MW/overview?homepageId=114327890
- 필요한 실제 화면 이미지를 판단하고, 확보 전에는 구체적인 이미지 요청을 표시합니다.

## 완료된 로컬 작업

- 원본: `Moves_Workforce_사용자_매뉴얼/confluence/`.
- 한·영 21개 주제, 42페이지 초안. 언어별 같은 파일 이름을 사용합니다.
- 편집·검증 상태: 원본 폴더의 `README.md`, `publication.md`.
- 이미지 요청: `image-requests.md`. 우선 8종, 추가 후보 10종. 실제 캡처는 아직 없습니다.
- 빌드: app root에서 `node Moves_Workforce_사용자_매뉴얼/confluence/build-guide.cjs`.
- 결과: `_workspace/bilingual-guide-preview/index.html`, `page-map.json`, `storage/`.
- 언어 대응·로컬 링크 168개 검사 통과. 대표 한·영 HTML 육안 확인 및 데스크톱 5페이지·모바일 권한 안내 넘침 검사 통과.
- 실제 staging 화면 확인, 배포 버전 확인, Confluence 현재 페이지 조회 및 게시 모두 미완료입니다.

## 브라우저 연결 진단 — 2026-10-04

- 사용자는 Chrome 확장을 설치하고 Computer Use를 켰으나 `@` 목록에 Chrome이 없다고 보고했습니다.
- 사용자 제공 `캡처.png`에서 모든 앱과 Google Chrome 스위치가 켜져 있고, Chrome은 확장 설치됨·관리 버튼 상태입니다.
- 로컬 설정에서 `browser@openai-bundled`, `chrome@openai-bundled`, `computer-use@openai-bundled`가 활성화되어 있습니다.
- 설치된 Chrome 플러그인의 공식 진단 스크립트로 Chrome 실행, 확장 활성화, native host 등록 정상임을 확인했습니다.
- 샌드박스 안에서 native host 등록이 없다는 결과는 제한 밖 재검사에서 해소됐습니다. 이를 실제 등록 누락으로 판단하지 않습니다.
- 현재 대화에 Chrome 이름의 도구가 없으며, `node_repl`의 단순 출력 확인도 시간 초과 후 커널 재설정됐습니다. 정확한 원인은 확정되지 않았습니다.
- 스위치 활성화나 확장 설치를 반복 안내하지 않습니다. 앱 재시작·새 대화에서 기능이 제공되는지 확인하고, 연결되면 지정된 staging 화면부터 읽습니다.

## 다음 작업

1. 실제 제공되는 브라우저 도구·스킬을 확인합니다. Chrome 접근이 가능하면 staging 탭을 확인합니다.
2. 초안을 실제 화면·언어·권한과 대조하고 필요한 화면 이미지를 확보합니다. 로그인 비밀번호나 OTP를 채팅으로 요청하지 않습니다.
3. MW 공간의 현재 페이지 구조·버전을 읽고 기존 문서와 매핑한 다음 게시 내용을 정리합니다.
4. 예전 `_workspace/user-manual/publish-confluence.js`는 신규 한·영 링크와 누락 이미지를 안전하게 처리하지 않으므로 그대로 실행하지 않습니다.

기존 사용자 문서와 관련 없는 작업 트리 변경은 보존합니다. 커밋·푸시·앱 배포는 요청받지 않았습니다.

## 재개 확인 및 사용자 지시 — 2026-10-04

- 사용자는 Chrome 연결이 안 되면 필요한 화면을 설명받고 직접 캡처하겠다고 했습니다.
- 이번 세션에서는 node_repl 단순 출력이 정상 응답했습니다. 이전 시간 초과 상태가 계속된다고 판단하지 않습니다.
- 제공된 도구 목록에는 Chrome 제어 도구가 없으며, 설치된 Chrome 플러그인의 skills 폴더도 비어 있습니다. 실제 Chrome 탭 접근은 확인하지 못했습니다.
- 연결 진단을 더 확장하지 않고 image-requests.md의 우선 8종을 사용자에게 안내합니다. 한국어 캡처부터 받아 화면과 본문을 대조한 다음 영어 대응 캡처를 정리할 수 있습니다.
- staging 화면 확인, 이미지 확보, Confluence 페이지 조회 및 게시는 아직 미완료입니다.
