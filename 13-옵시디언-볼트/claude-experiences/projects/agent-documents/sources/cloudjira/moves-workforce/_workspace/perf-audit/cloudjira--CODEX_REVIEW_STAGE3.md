Reading additional input from stdin...
OpenAI Codex v0.147.0
--------
workdir: C:\CloudJira\moves-workforce
model: gpt-5.6-terra
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: none
session id: 019ff563-f404-7cf3-9048-94f4a84bb565
--------
user
성능 리팩토링 3단계 코드 리뷰를 요청한다. 감사 원본은 _workspace/perf-audit/BACKEND_2026-08-12.md·FRONTEND_2026-08-12.md, 이번 수정 리포트는 FIX_STAGE3_BACKEND.md / FIX_STAGE3_FRONTEND.md / FIX_STAGE3_BUNDLE.md. 워킹 트리의 미커밋 변경(git diff HEAD + 미추적 신규 파일)이 전부 리뷰 대상이다. (1·2단계는 이전 리뷰에서 승인되어 커밋 완료 — 재리뷰 불필요.)

변경 의도와 대상:
1. A-4 업로드/백필 job 완결 판정 B²→B: src/queue/consumer.js(checkJobCompletion), src/nosql/query/CustomEntityManager.js(findByWherePaged 신설), src/queue/__test__/JobCompletion.test.js. 카운터 대신 jobId 인덱스 커서 페이징으로 done 배치 계수(멱등성: 키 유일 + done-only 저장).
2. A-6 권한 가드 병렬화: src/permission/PrincipalResolver.js — isAdministrator()와 users SQL을 Promise.all로. 판정 분기·fail-close 방향 불변 주장.
3. P1-5 간트 인라인 편집 3종 invalidate 제거: static/ui/src/pages/projectDetail/gantt/useGanttMutations.js — 낙관 패치 유지+롤백 보존, plannedMd는 실제 write 시간값에서 역산(plannedHours 헬퍼 공유).
4. P1-1 번들 분리: components/calendar/FullCalendarLazy.jsx, components/markdown/MarkdownEditorLazy.jsx(신규), pages/myWork/WorklogPage.jsx, pages/myWork/modal/WorklogModal.jsx — MDXEditor/FullCalendar/moment lazy. main gzip 899KB→432KB. legacy ReactDOM.render 환경이라 #426 주의(각 lazy 지점 자체 Suspense 경계 + ChunkErrorBoundary).
5. P1-2는 오탐 판정(코드 무변경): Atlaskit Tabs 18.3.4가 미방문 패널을 마운트하지 않음(tabs.js visited Set) — pages/resource/__test__/resourceTabsLazyMount.test.js로 고정. 이 판정 자체의 타당성도 검토해 달라.

리뷰 관점 (중요 순):
1) A-4 정확성 — 동시 소비/재시도/부분 실패에서 조기 완결 또는 영구 미완결 시나리오가 정말 없는가. findByWherePaged 커서 루프의 종료 조건·인덱스 정합. totalBatches 가드의 부작용.
2) A-6 — 권한 판정 결과가 어떤 입력에서도 종전과 동일한가(admin 판정 실패, users 조회 실패, 미등록 사용자 각 조합). fail-close 유지.
3) P1-5 — invalidate 제거 후 낙관값과 서버 상태가 어긋날 수 있는 경로(부분 실패, 동시 편집, 서버측 가공값). plannedHours 역산의 반올림 동등성.
4) P1-1 — WorklogModal의 ADF 변환 비동기화(레이스·cancelled 가드), 모달 열림 중 청크 로드 실패 UX, calendarRef 전달 방식의 동작 보존, Suspense 경계 배치가 #426을 정말 막는가.
5) P1-2 오탐 판정의 타당성 — visited Set 동작 해석이 맞는가, 회귀 테스트가 전제를 실제로 고정하는가.

출력: 결함은 심각도(치명/중요/사소)+파일:라인+구체 실패 시나리오. 스타일 지적 생략. 문제없는 항목은 번호로 짧게 확인.
hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit
hook: UserPromptSubmit Completed
hook: UserPromptSubmit Failed
codex
지정된 감사 원본·수정 리포트와 워킹 트리 전체 diff를 대조해, 동시성/권한/낙관적 UI·lazy-loading 경로 위주로 증거 기반 리뷰를 진행하겠습니다. 먼저 프로젝트 경험 인덱스와 변경 범위를 확인하겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Raw 'C:\\Users\\DMOVE\\Codex-experiences\\INDEX.md'; git status --short; git diff --stat HEAD; git diff --name-only HEAD" in C:\CloudJira\moves-workforce
2026-08-12T09:53:31.307593Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 2.9 seconds
Output:
# Codex Experiences

- [[projects/confluence-approval-dc-2026-08-12-qa-6b-rework]] Confluence Approval DC 諛곗튂 6b QA 寃고븿 ?ъ옉?낃낵 寃利??섍꼍 ?쒖빟 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-qa-6a-rework]] Confluence Approval DC 諛곗튂 6a QA ?ъ옉?? ?곸뿭 ?ㅼ틦?? ?댁떆 ?대갚, ?ㅼ젙 諛??대찓???명솚 ?섏젙.

- [[projects/confluence-approval-dc-2026-08-12-cancel-region-hash]] Confluence Approval DC 痍⑥냼 ?곹깭, ?붿껌 硫붾え, ?곸뿭 蹂몃Ц ?댁떆 湲곕컲 ?뺣? 留뚮즺 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-reapproval-qa-fixes]] Confluence Approval DC ?ъ듅???④퀎 snapshot 蹂듭썝, 洹몃９ 異쒖쿂 蹂댁〈 諛?QA ?섏젙 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-email-due-soon]] Confluence Approval DC C9 email MailQueue 梨꾨꼸, 留덇컧 ?꾨컯 ?⑹꽦 ???뚮┝, ?ㅼ젙 諛?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-notification-outbox]] Confluence Approval DC C9 媛먯궗 ?대깽??湲곕컲 in-app ?뚮┝ outbox, ?ъ떆??drain, 沅뚰븳 ?꾪꽣 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-review-fixes]] Confluence Approval DC C9 ?ㅼ젙 ??κ낵 scheduler lifecycle, macro render-context ?ㅼ젙 cache??由щ럭 ?섎━ 諛?寃利?湲곕줉.
- [[projects/confluence-approval-dc-2026-08-11-deadline-scheduler]] Confluence Approval DC C9 cluster ?⑥씪 留뚮즺 sweep, ?ㅼ젙 ?щ벑濡? `dueSoon` ?뚯깮 ?묐떟怨?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-group-approver-snapshot]] Confluence Approval DC C9 洹몃９ ?뱀씤???좏깮, user key snapshot, `VIA_GROUP` 蹂댁〈怨?Flow 寃利??쒖젏 遺꾨━ 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-10-app-settings]] Confluence Approval DC ???꾩뿭 ?ㅼ젙 援ы쁽怨?C9 寃利?李⑤떒 ?먯씤 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-user-key-regression]] Confluence Approval DC ?ъ슜??寃??key瑜?Confluence user key濡?蹂듦뎄?섍퀬 username ????곗씠???쒖떆 fallback??異붽???湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-formatting]] Confluence Approval DC C9 Java ?뚯씪???뺤텞???щ㎎??湲곕뒫 蹂寃??놁씠 蹂듦뎄?섍퀬 Maven 寃利앹쓣 ?꾨즺??湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11]] C9 ?뱀씤 ?낅Т??3-tab, ?곸꽭 REST ?묐떟, AO Flow ?곌껐怨??ㅽ뻾 以?target lock 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-09]] Confluence 9 REST媛 Jersey HK2濡??앹꽦?섎뒗 ?쒖빟, ActiveObjects??plugin-scoped OSGi 議고쉶, C9/C10 manifest쨌?⑦궎吏?寃利?湲곕줉.

- [[projects/moves-workforce-documentation-2026-08-06-sync]] 2026-08-06 肄붾뱶 湲곗??좉낵 ?쒗뭹 臾몄꽌??鍮꾨룞湲??ъ쭛怨꽷톢017 schema ?쒕━?꾪듃瑜??숆린?뷀븳 湲곕줉.

- [[topics/confluence-dc-ao-table-name]] Confluence Data Center Active Objects entity table-name 30???쒗븳怨?吏㏃? `@Table` 紐낅챸 洹쒖튃.

- [[topics/tanstack-query-cross-domain-invalidation]] ???섎굹???ㅼ젙 蹂寃쎌씠 ?щ윭 ?붾㈃???뚯깮 cache??誘몄튂???곹뼢??query key prefix helper濡?愿由ы븯???⑦꽩.
- [[projects/moves-workforce-documentation-baseline-sync]] ???댁쁺 諛고룷蹂멸낵 媛쒕컻 湲곗???遺꾨━, ?ㅼ젣 ?곹븳쨌沅뚰븳쨌schema 怨꾩빟??援먯감 寃利앺빐 臾몄꽌瑜??숆린?뷀븯???⑦꽩.
- [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] ??multi-repo ?쒗뭹 臾몄꽌 ?뺣낯쨌?묒뾽 利앷굅쨌Obsidian MOC瑜?遺꾨━?섍퀬 code/OpenAPI/Flyway/route瑜??ъ떎 ?먯쿇?쇰줈 ?곌껐?섎뒗 ?⑦꽩.
- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
- [[topics/confluence-dc-forge-approval-estimation]] ??Confluence Data Center ?뱀씤 ???곗젙?먯꽌 Forge Cloud? Java P2瑜?遺꾨━?섍퀬 macro쨌?대윭?ㅽ꽣쨌Marketplace 鍮꾩슜??怨꾩궛?섎뒗 湲곗?.
- [[topics/code-splitting-bundle-budget-contract]] ??肄붾뱶 ?ㅽ뵆由ы똿 援ъ“媛 諛붾???initial/async chunk ?덉궛怨?CI gate瑜??④퍡 媛깆떊?섎뒗 ?⑦꽩.
- [[projects/escore-resume-customization]] ???먯뒪肄붿뼱 Elastic Stack ?ъ??섏슜 ?대젰?쒖쓽 MovesEye쨌Moves Workforce 洹쇨굅, 怨쇱옣 諛⑹? ?먯튃, 7?섏씠吏 Word 寃??湲곗???
- [[vault_updates/escore-resume-movesai-expansion|escore-resume-movesai-expansion]] ???붾Т釉?寃쎈젰??MovesEye쨌Moves Workforce쨌Elastic Stack쨌?덉쭏/?댁쁺?쇰줈 理쒕? ?뺤옣?섍퀬 8?섏씠吏 Word ?뚮뜑留곸쓣 寃?섑븳 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-batch-7a-tests]] Confluence Approval DC 諛곗튂 7a ?좉퇋 ?⑥쐞 ?뚯뒪?몄? Maven 寃利?湲곕줉.

fatal: detected dubious ownership in repository at 'C:/CloudJira/moves-workforce'
'C:/CloudJira/moves-workforce' is owned by:
	DESKTOP-Q21AG2J/DMOVE (S-1-5-21-257218257-3326819578-2473551123-1001)
but the current user is:
	DESKTOP-Q21AG2J/CodexSandboxOffline (S-1-5-21-257218257-3326819578-2473551123-1004)
To add an exception for this directory, call:

	git config --global --add safe.directory C:/CloudJira/moves-workforce
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file

warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file


 exited 1 in 2923ms:
# Codex Experiences

- [[projects/confluence-approval-dc-2026-08-12-qa-6b-rework]] Confluence Approval DC 諛곗튂 6b QA 寃고븿 ?ъ옉?낃낵 寃利??섍꼍 ?쒖빟 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-qa-6a-rework]] Confluence Approval DC 諛곗튂 6a QA ?ъ옉?? ?곸뿭 ?ㅼ틦?? ?댁떆 ?대갚, ?ㅼ젙 諛??대찓???명솚 ?섏젙.

- [[projects/confluence-approval-dc-2026-08-12-cancel-region-hash]] Confluence Approval DC 痍⑥냼 ?곹깭, ?붿껌 硫붾え, ?곸뿭 蹂몃Ц ?댁떆 湲곕컲 ?뺣? 留뚮즺 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-reapproval-qa-fixes]] Confluence Approval DC ?ъ듅???④퀎 snapshot 蹂듭썝, 洹몃９ 異쒖쿂 蹂댁〈 諛?QA ?섏젙 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-email-due-soon]] Confluence Approval DC C9 email MailQueue 梨꾨꼸, 留덇컧 ?꾨컯 ?⑹꽦 ???뚮┝, ?ㅼ젙 諛?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-notification-outbox]] Confluence Approval DC C9 媛먯궗 ?대깽??湲곕컲 in-app ?뚮┝ outbox, ?ъ떆??drain, 沅뚰븳 ?꾪꽣 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-review-fixes]] Confluence Approval DC C9 ?ㅼ젙 ??κ낵 scheduler lifecycle, macro render-context ?ㅼ젙 cache??由щ럭 ?섎━ 諛?寃利?湲곕줉.
- [[projects/confluence-approval-dc-2026-08-11-deadline-scheduler]] Confluence Approval DC C9 cluster ?⑥씪 留뚮즺 sweep, ?ㅼ젙 ?щ벑濡? `dueSoon` ?뚯깮 ?묐떟怨?寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-group-approver-snapshot]] Confluence Approval DC C9 洹몃９ ?뱀씤???좏깮, user key snapshot, `VIA_GROUP` 蹂댁〈怨?Flow 寃利??쒖젏 遺꾨━ 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-10-app-settings]] Confluence Approval DC ???꾩뿭 ?ㅼ젙 援ы쁽怨?C9 寃利?李⑤떒 ?먯씤 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-user-key-regression]] Confluence Approval DC ?ъ슜??寃??key瑜?Confluence user key濡?蹂듦뎄?섍퀬 username ????곗씠???쒖떆 fallback??異붽???湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11-formatting]] Confluence Approval DC C9 Java ?뚯씪???뺤텞???щ㎎??湲곕뒫 蹂寃??놁씠 蹂듦뎄?섍퀬 Maven 寃利앹쓣 ?꾨즺??湲곕줉.

- [[projects/confluence-approval-dc-2026-08-11]] C9 ?뱀씤 ?낅Т??3-tab, ?곸꽭 REST ?묐떟, AO Flow ?곌껐怨??ㅽ뻾 以?target lock 寃利?湲곕줉.

- [[projects/confluence-approval-dc-2026-08-09]] Confluence 9 REST媛 Jersey HK2濡??앹꽦?섎뒗 ?쒖빟, ActiveObjects??plugin-scoped OSGi 議고쉶, C9/C10 manifest쨌?⑦궎吏?寃利?湲곕줉.

- [[projects/moves-workforce-documentation-2026-08-06-sync]] 2026-08-06 肄붾뱶 湲곗??좉낵 ?쒗뭹 臾몄꽌??鍮꾨룞湲??ъ쭛怨꽷톢017 schema ?쒕━?꾪듃瑜??숆린?뷀븳 湲곕줉.

- [[topics/confluence-dc-ao-table-name]] Confluence Data Center Active Objects entity table-name 30???쒗븳怨?吏㏃? `@Table` 紐낅챸 洹쒖튃.

- [[topics/tanstack-query-cross-domain-invalidation]] ???섎굹???ㅼ젙 蹂寃쎌씠 ?щ윭 ?붾㈃???뚯깮 cache??誘몄튂???곹뼢??query key prefix helper濡?愿由ы븯???⑦꽩.
- [[projects/moves-workforce-documentation-baseline-sync]] ???댁쁺 諛고룷蹂멸낵 媛쒕컻 湲곗???遺꾨━, ?ㅼ젣 ?곹븳쨌沅뚰븳쨌schema 怨꾩빟??援먯감 寃利앺빐 臾몄꽌瑜??숆린?뷀븯???⑦꽩.
- [[projects/moveseye/moveseye-documentation-system|moveseye-documentation-system]] ??multi-repo ?쒗뭹 臾몄꽌 ?뺣낯쨌?묒뾽 利앷굅쨌Obsidian MOC瑜?遺꾨━?섍퀬 code/OpenAPI/Flyway/route瑜??ъ떎 ?먯쿇?쇰줈 ?곌껐?섎뒗 ?⑦꽩.
- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
- [[topics/confluence-dc-forge-approval-estimation]] ??Confluence Data Center ?뱀씤 ???곗젙?먯꽌 Forge Cloud? Java P2瑜?遺꾨━?섍퀬 macro쨌?대윭?ㅽ꽣쨌Marketplace 鍮꾩슜??怨꾩궛?섎뒗 湲곗?.
- [[topics/code-splitting-bundle-budget-contract]] ??肄붾뱶 ?ㅽ뵆由ы똿 援ъ“媛 諛붾???initial/async chunk ?덉궛怨?CI gate瑜??④퍡 媛깆떊?섎뒗 ?⑦꽩.
- [[projects/escore-resume-customization]] ???먯뒪肄붿뼱 Elastic Stack ?ъ??섏슜 ?대젰?쒖쓽 MovesEye쨌Moves Workforce 洹쇨굅, 怨쇱옣 諛⑹? ?먯튃, 7?섏씠吏 Word 寃??湲곗???
- [[vault_updates/escore-resume-movesai-expansion|escore-resume-movesai-expansion]] ???붾Т釉?寃쎈젰??MovesEye쨌Moves Workforce쨌Elastic Stack쨌?덉쭏/?댁쁺?쇰줈 理쒕? ?뺤옣?섍퀬 8?섏씠吏 Word ?뚮뜑留곸쓣 寃?섑븳 湲곕줉.

- [[projects/confluence-approval-dc-2026-08-12-batch-7a-tests]] Confluence Approval DC 諛곗튂 7a ?좉퇋 ?⑥쐞 ?뚯뒪?몄? Maven 寃利?湲곕줉.

fatal: detected dubious ownership in repository at 'C:/CloudJira/moves-workforce'
'C:/CloudJira/moves-workforce' is owned by:
	DESKTOP-Q21AG2J/DMOVE (S-1-5-21-257218257-3326819578-2473551123-1001)
but the current user is:
	DESKTOP-Q21AG2J/CodexSandboxOffline (S-1-5-21-257218257-3326819578-2473551123-1004)
To add an exception for this directory, call:

	git config --global --add safe.directory C:/CloudJira/moves-workforce
warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file

warning: Not a git repository. Use --no-index to compare two paths outside a working tree
usage: git diff --no-index [<options>] <path> <path>

Diff output format options
    -p, --patch           generate patch
    -s, --no-patch        suppress diff output
    -u                    generate patch
    -U, --unified[=<n>]   generate diffs with <n> lines context
    -W, --[no-]function-context
                          generate diffs with <n> lines context
    --raw                 generate the diff in raw format
    --patch-with-raw      synonym for '-p --raw'
    --patch-with-stat     synonym for '-p --stat'
    --numstat             machine friendly --stat
    --shortstat           output only the last line of --stat
    -X, --dirstat[=<param1>,<param2>...]
                          output the distribution of relative amount of changes for each sub-directory
    --cumulative          synonym for --dirstat=cumulative
    --dirstat-by-file[=<param1>,<param2>...]
                          synonym for --dirstat=files,<param1>,<param2>...
    --check               warn if changes introduce conflict markers or whitespace errors
    --summary             condensed summary such as creations, renames and mode changes
    --name-only           show only names of changed files
    --name-status         show only names and status of changed files
    --stat[=<width>[,<name-width>[,<count>]]]
                          generate diffstat
    --stat-width <width>  generate diffstat with a given width
    --stat-name-width <width>
                          generate diffstat with a given name width
    --stat-graph-width <width>
                          generate diffstat with a given graph width
    --stat-count <count>  generate diffstat with limited lines
    --[no-]compact-summary
                          generate compact summary in diffstat
    --binary              output a binary diff that can be applied
    --[no-]full-index     show full pre- and post-image object names on the "index" lines
    --[no-]color[=<when>] show colored diff
    --ws-error-highlight <kind>
                          highlight whitespace errors in the 'context', 'old' or 'new' lines in the diff
    -z                    do not munge pathnames and use NULs as output field terminators in --raw or --numstat
    --[no-]abbrev[=<n>]   use <n> digits to display object names
    --src-prefix <prefix> show the given source prefix instead of "a/"
    --dst-prefix <prefix> show the given destination prefix instead of "b/"
    --line-prefix <prefix>
                          prepend an additional prefix to every line of output
    --no-prefix           do not show any source or destination prefix
    --default-prefix      use default prefixes a/ and b/
    --inter-hunk-context <n>
                          show context between diff hunks up to the specified number of lines
    --output-indicator-new <char>
                          specify the character to indicate a new line instead of '+'
    --output-indicator-old <char>
                          specify the character to indicate an old line instead of '-'
    --output-indicator-context <char>
                          specify the character to indicate a context instead of ' '

Diff rename options
    -B, --break-rewrites[=<n>[/<m>]]
                          break complete rewrite changes into pairs of delete and create
    -M, --find-renames[=<n>]
                          detect renames
    -D, --irreversible-delete
                          omit the preimage for deletes
    -C, --find-copies[=<n>]
                          detect copies
    --[no-]find-copies-harder
                          use unmodified files as source to find copies
    --no-renames          disable rename detection
    --[no-]rename-empty   use empty blobs as rename source
    --[no-]follow         continue listing the history of a file beyond renames
    -l <n>                prevent rename/copy detection if the number of rename/copy targets exceeds given limit

Diff algorithm options
    --minimal             produce the smallest possible diff
    -w, --ignore-all-space
                          ignore whitespace when comparing lines
    -b, --ignore-space-change
                          ignore changes in amount of whitespace
    --ignore-space-at-eol ignore changes in whitespace at EOL
    --ignore-cr-at-eol    ignore carrier-return at the end of line
    --ignore-blank-lines  ignore changes whose lines are all blank
    -I, --[no-]ignore-matching-lines <regex>
                          ignore changes whose all lines match <regex>
    --[no-]indent-heuristic
                          heuristic to shift diff hunk boundaries for easy reading
    --patience            generate diff using the "patience diff" algorithm
    --histogram           generate diff using the "histogram diff" algorithm
    --diff-algorithm <algorithm>
                          choose a diff algorithm
    --anchored <text>     generate diff using the "anchored diff" algorithm
    --word-diff[=<mode>]  show word diff, using <mode> to delimit changed words
    --word-diff-regex <regex>
                          use <regex> to decide what a word is
    --color-words[=<regex>]
                          equivalent to --word-diff=color --word-diff-regex=<regex>
    --[no-]color-moved[=<mode>]
                          moved lines of code are colored differently
    --[no-]color-moved-ws <mode>
                          how white spaces are ignored in --color-moved

Other diff options
    --[no-]relative[=<prefix>]
                          when run from subdir, exclude changes outside and show relative paths
    -a, --[no-]text       treat all files as text
    -R                    swap two inputs, reverse the diff
    --[no-]exit-code      exit with 1 if there were differences, 0 otherwise
    --[no-]quiet          disable all output of the program
    --[no-]ext-diff       allow an external diff helper to be executed
    --[no-]textconv       run external text conversion filters when comparing binary files
    --ignore-submodules[=<when>]
                          ignore changes to submodules in the diff generation
    --submodule[=<format>]
                          specify how differences in submodules are shown
    --ita-invisible-in-index
                          hide 'git add -N' entries from the index
    --ita-visible-in-index
                          treat 'git add -N' entries as real in the index
    -S <string>           look for differences that change the number of occurrences of the specified string
    -G <regex>            look for differences that change the number of occurrences of the specified regex
    --pickaxe-all         show all changes in the changeset with -S or -G
    --pickaxe-regex       treat <string> in -S as extended POSIX regular expression
    -O <file>             control the order in which files appear in the output
    --rotate-to <path>    show the change in the specified path first
    --skip-to <path>      skip the output to the specified path
    --find-object <object-id>
                          look for differences that change the number of occurrences of the specified object
    --diff-filter [(A|C|D|M|R|T|U|X|B)...[*]]
                          select files by diff type
    --output <file>       output to a specific file


codex
통합 정합성·회귀 관점의 코드 리뷰이므로 `integration-verify` 스킬 절차를 적용해 resolver–UI 계약과 검증 근거를 함께 점검하겠습니다. 앞선 Git 조회는 소유권 안전 설정 때문에 막혔으나, 읽기 전용 `safe.directory` 설정을 명령별로 적용해 계속하겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Raw '.agents/skills/integration-verify/SKILL.md'" in C:\CloudJira\moves-workforce
 succeeded in 1957ms:
---
name: integration-verify
description: "Moves RMS ?듯빀 ?뺥빀?깆쓣 寃利앺븯???ㅽ궗. 諛깆뿏??resolver ?묐떟 shape ???꾨줎??invoke ?뚮퉬 肄붾뱶瑜?援먯감 鍮꾧탳?섍퀬, jest/鍮뚮뱶瑜??ㅽ뻾?섎ŉ, ?깅뒫 ?⑦꽩 ?꾨컲怨?i18n ?꾨씫???먭??쒕떎. integration-verifier ?먯씠?꾪듃媛 ?ъ슜. 寃利?QA/?뚯뒪???뺥빀???뺤씤 ???ъ슜."
---

# Integration Verify ???듯빀 ?뺥빀??寃利?
媛?而댄룷?뚰듃媛 媛쒕퀎?곸쑝濡?留욎븘??**?곌껐 吏?먯뿉??怨꾩빟???닿툔?섎뒗** 寃쎄퀎硫?踰꾧렇媛 ?고????먮윭??二쇱썝?몄씠?? ???ㅽ궗???듭떖? "議댁옱 ?뺤씤"???꾨땲??**"寃쎄퀎硫?援먯감 鍮꾧탳"** ??

## 寃利??먯튃: ?묒そ ?숈떆 ?쎄린

?쒖そ留?蹂대㈃ 寃쎄퀎硫?踰꾧렇瑜?紐??〓뒗?? ?앹궛?먯? ?뚮퉬?먮? **媛숈씠** ?닿퀬 鍮꾧탳?쒕떎.

| 寃쎄퀎硫?| ?앹궛??(?쇱そ) | ?뚮퉬??(?ㅻⅨ履? | ?먭? |
|--------|-------------|---------------|------|
| ?묐떟 shape | resolver??responseWrapper 諛섑솚 媛앹껜 | `invoke()` 寃곌낵 `result.content.xxx` ?묎렐 | ?꾨뱶紐끒룹쨷泥?援ъ“ ?쇱튂 |
| **?쒕퉬???대? ?뚮퉬??* | Service ?⑥닔 諛섑솚 shape 蹂寃?| **洹??⑥닔瑜?import ?섎뒗 ?ㅻⅨ 諛깆뿏??Service** | ?⑥닔紐??꾩뿭 grep ??紐⑤뱺 ?대? ?몄텧 吏?먯쓽 ?뚮퉬 肄붾뱶 ?쇱튂 |
| **?ㅼ쨷 shape ?ъ궗??而댄룷?뚰듃** | 媛숈? 而댄룷?뚰듃???꾨떖?섎뒗 **?쒕줈 ?ㅻⅨ 媛앹껜 2醫??댁긽** | 洹?而댄룷?뚰듃媛 ?쎈뒗 ?꾨뱶 ?꾩껜 | 媛?shape??**紐⑤뱺 李몄“ ?꾨뱶媛 ?ㅼ옱?섎뒗媛** (?쒖そ?먮쭔 ?덈뒗 ?꾨뱶 = 議곗슜???ㅽ몴湲? |
| ?⑥닔 留ㅽ븨 | `src/index.js` ?깅줉 + `registerXxxController` | ?꾨줎??`invoke('fnName')` | fnName ?쇱튂, ?깅줉 ?꾨씫 ?놁쓬 |
| ?섑븨 | 諛깆뿏?쒓? `{ content:{ items:[] } }`濡?媛먯뙂 | ?꾨줎?멸? `.content.items` unwrap | ?섑븨 ?④퀎 ?쇱튂 |
| 荑쇰━??| ??| `queryKey/` ?⑺넗由??ъ슜 ?щ? | ?몃씪??諛곗뿴 ?꾨떂 |
| i18n | `locales/kr/*`쨌`locales/en/*` ??+ merge ?ㅽ뻾 | UI `t('key')` | ??議댁옱 (`locales/script/*.json`? 鍮??ㅽ뀅 ??嫄곌린 ?덉쑝硫?誘몃컲?? |
| 沅뚰븳 | 諛깆삤?쇱뒪 resolver 沅뚰븳 媛??| `canRead/canWrite(pageId)` | ?쇱튂 |

> ?좑툘 **?쒕퉬???묐떟 怨꾩빟 蹂寃????꾩닔 ?덉감** (2026-07-13 ?뚭? 援먰썕): resolver?뷀봽濡좏듃 寃쎄퀎留?蹂대㈃ ???쒕떎.
> Service ?⑥닔???ㅻⅨ ?꾨찓??Service 媛 吏곸젒 import ???ъ궗?⑺븯??寃쎌슦媛 ?덈떎 ???? `getProjectStatusListService`
> 怨꾩빟??`{rows:[...]}` 濡?諛붽엥?????꾨줎???뚮퉬泥?3怨녹? 怨좎낀吏留?`PortfolioDashboardService` ???대? ?몄텧(諛곗뿴濡?> `.map`)???볦퀜 ?듯빀 ??쒕낫???꾩껜媛 "?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??濡??ㅼ슫?먮떎.
> **怨꾩빟??諛붾??⑥닔???⑥닔紐낆쑝濡?`src/` ?꾩뿭 grep ?섏뿬 由ъ「踰??깅줉遺 ?몄쓽 紐⑤뱺 import/?몄텧 吏?먯쓣 援먯감 鍮꾧탳?섎씪.**

> ?좑툘 **??而댄룷?뚰듃媛 ?щ윭 shape??諛쏆쓣 ??* (2026-07-22 ?뚭? 援먰썕): resolver?뷀봽濡좏듃 異뺣쭔 蹂대㈃ 紐??〓뒗 遺瑜섍? ?덈떎.
> **?묒そ ??怨꾩빟??吏耳곕뒗?곕룄** 踰꾧렇媛 ?쒕떎 ???묒뾽 諛곗젙 ?붾㈃??`ScopeSplitCell` ? `candidate.project` ?
> `candidate.company` ??媛앹껜???ъ궗?⑸릺?붾뜲, `assignedCount` ??`project` ?먮쭔 ?덇퀬 `company` ?먮뒗 ?녿떎.
> 而댄룷?뚰듃媛 `scope?.assignedCount ?? 0` ?쇰줈 ?쎌뼱 ?꾩궗 ?ㅼ퐫?꾧? **??긽 "?좊떦 ?묒뾽 ?놁쓬"** ?쇰줈 ?쒓린?먮떎
> (怨쇰????몄썝???ъ쑀濡?떎怨??ㅽ뙋?쒗궎?? 洹??붾㈃??留됱쑝?ㅻ뜕 ?ㅽ뙣 紐⑤뱶 洹??먯껜).
> **?먭?踰?** 媛숈? 而댄룷?뚰듃??2醫??댁긽??媛앹껜瑜??섍린??吏?먯쓣 李얘퀬(?몄텧遺 grep), 而댄룷?뚰듃媛 李몄“?섎뒗 **紐⑤뱺 ?꾨뱶**瑜?> 媛?shape???ㅼ젣 ?앹궛 肄붾뱶? ?議고븯?? ?듭뀛??泥댁씠?씲??? 0` ? ??寃고븿??**?먮윭 ?놁씠 ?쇱폒** ?섎せ??媛믪쑝濡??뚮뜑?쒕떎.
> 怨듯넻 ?꾨뱶 / A ?꾩슜 / B ?꾩슜???쒕줈 遺꾨━??由ы룷?몄뿉 ?④만 寃?

## 媛뺥븳 泥댄겕由ъ뒪??(議댁옱 ?뺤씤 < 援먯감 鍮꾧탳)

| ?쏀븿 | 媛뺥븿 |
|------|------|
| resolver媛 議댁옱?섎뒗媛? | resolver ?묐떟 shape怨??꾨줎??`result.content` ?묎렐???쇱튂?섎뒗媛? |
| invoke瑜??몄텧?섎뒗媛? | ?몄텧 fnName??`src/index.js`???깅줉???⑥닔? 留ㅼ묶?섎뒗媛? |
| 踰덉뿭 ?ㅺ? ?덈뒗媛? | `t()`媛 李몄“?섎뒗 ?ㅺ? `locales/kr/`쨌`locales/en/`???덇퀬 merge?먮뒗媛? |
| 而댄룷?뚰듃媛 ?꾨뱶瑜??쎈뒗媛? | 洹?而댄룷?뚰듃???섏뼱?ㅻ뒗 **紐⑤뱺 shape**??洹??꾨뱶媛 ?ㅼ옱?섎뒗媛? |

## ?꾨줈?앺듃 ?뱁솕 ?먭?

- **invoke ?묐떟 ?묎렐:** `{ success, content, error }`?먯꽌 `result.content`瑜??뺥솗??爰쇰궡怨?`result.success===false`瑜?泥섎━?섎뒗媛?
- **camelCase/snake_case:** DB 而щ읆 ??Query 寃곌낵 ???묐떟 ?꾨뱶 ???꾨줎???묎렐???꾨뱶紐??쇨???- **利됱떆 ?묐떟 vs ??鍮꾨룞湲?:** ?묒? ?낅줈????`src/queue/consumer.js`+`JobPollingManager.jsx`)?먯꽌 ?꾨줎?멸? 利됱떆 ?묐떟?먯꽌 理쒖쥌 寃곌낵瑜??묎렐?섏? ?딅뒗媛?
- **?깅뒫 ?꾨컲:** ?뚰겕濡쒓렇 ?ㅺ굔 議고쉶媛 怨듯넻 ?섏튂 寃쎈줈瑜??섏젙?덈뒗媛(湲덉?)? ?꾩슜 蹂묐젹 ?섏쿂 + `p-limit`?멸?? Resource 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆?멸??
- **i18n:** ko-KR/en-US瑜?吏곸젒 ?섏젙?섏? ?딆븯?붽?? merge媛 ?ㅽ뻾?먮뒗媛?

## ?ㅽ뻾 寃利?
- 諛깆뿏?? 猷⑦듃 `npm test` (jest)
- ?꾨줎?? `cd static/ui && npm test`, ?꾩슂 ??`npm run build`
- **鍮뚮뱶 ?듦낵 ???뺤긽 ?숈옉.** 鍮뚮뱶媛 ?듦낵?대룄 shape 遺덉씪移섎뒗 ?고??꾩뿉 ?곗쭊?? 諛섎뱶??援먯감 鍮꾧탳瑜?蹂묓뻾?쒕떎.

## 寃利??쒖젏: ?먯쭊??incremental)

?꾩껜 ?꾩꽦 ??1?뚭? ?꾨땲??**媛?紐⑤뱢(resolver + ????? ?꾩꽦 吏곹썑** 利됱떆 ?대떦 寃쎄퀎硫댁쓣 援먯감 寃利? 珥덇린 遺덉씪移섍? ?꾩냽 紐⑤뱢濡??꾪뙆?섎뒗 寃껋쓣 留됰뒗??

## 異쒕젰

`_workspace/<feature>/03_verify_report.md`??**?듦낵 / ?ㅽ뙣 / 誘멸?利?* 3遺꾨쪟濡??묒꽦. ?ㅽ뙣 ??ぉ? `?뚯씪:?쇱씤` + 遺덉씪移??댁슜 + ?섏젙 諛⑸쾿. 寃쎄퀎硫??댁뒋??backend쨌frontend ?묒そ???듭?. 寃利?遺덇? ??ぉ? "誘멸?利??쇰줈 紐낆떆?섍퀬 異붿륫?쇰줈 ?듦낵 泥섎━?섏? ?딅뒗??


hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git -c safe.directory=C:/CloudJira/moves-workforce status --short; git -c safe.directory=C:/CloudJira/moves-workforce diff --stat HEAD; git -c safe.directory=C:/CloudJira/moves-workforce diff --name-status HEAD; Get-ChildItem -Path . -Filter 'FIX_STAGE3_*.md' -Recurse -File | Select-Object -ExpandProperty FullName; Get-ChildItem -Path '_workspace/perf-audit' -File | Select-Object -ExpandProperty FullName" in C:\CloudJira\moves-workforce
2026-08-12T09:54:03.248082Z ERROR codex_core::tools::router: error=Exit code: 124
Wall time: 11 seconds
Output:
command timed out after 11046 milliseconds
 M .gitignore
 M src/nosql/query/CustomEntityManager.js
 M src/permission/PrincipalResolver.js
 M src/queue/consumer.js
 M static/ui/src/pages/myWork/WorklogPage.jsx
 M static/ui/src/pages/myWork/modal/WorklogModal.jsx
 M static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
 M static/ui/src/pages/resource/ResourcePage.jsx
?? .container-service-assets/
?? du.exe.stackdump
?? src/queue/__test__/
?? static/ui/src/components/calendar/FullCalendarLazy.jsx
?? static/ui/src/components/markdown/MarkdownEditorLazy.jsx
?? static/ui/src/pages/projectDetail/work/WORK_VIEWS.md
?? static/ui/src/pages/resource/__test__/
 .gitignore                                         |  5 +-
 src/nosql/query/CustomEntityManager.js             | 52 +++++++++++++++++++
 src/permission/PrincipalResolver.js                | 46 +++++++++++++----
 src/queue/consumer.js                              | 58 ++++++++++++++++++----
 static/ui/src/pages/myWork/WorklogPage.jsx         |  7 ++-
 static/ui/src/pages/myWork/modal/WorklogModal.jsx  | 55 ++++++++++++++++----
 .../pages/projectDetail/gantt/useGanttMutations.js | 49 +++++++++++-------
 static/ui/src/pages/resource/ResourcePage.jsx      |  9 ++++
 8 files changed, 230 insertions(+), 51 deletions(-)
M	.gitignore
M	src/nosql/query/CustomEntityManager.js
M	src/permission/PrincipalResolver.js
M	src/queue/consumer.js
M	static/ui/src/pages/myWork/WorklogPage.jsx
M	static/ui/src/pages/myWork/modal/WorklogModal.jsx
M	static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
M	static/ui/src/pages/resource/ResourcePage.jsx

 exited 124 in 11046ms:
 M .gitignore
 M src/nosql/query/CustomEntityManager.js
 M src/permission/PrincipalResolver.js
 M src/queue/consumer.js
 M static/ui/src/pages/myWork/WorklogPage.jsx
 M static/ui/src/pages/myWork/modal/WorklogModal.jsx
 M static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
 M static/ui/src/pages/resource/ResourcePage.jsx
?? .container-service-assets/
?? du.exe.stackdump
?? src/queue/__test__/
?? static/ui/src/components/calendar/FullCalendarLazy.jsx
?? static/ui/src/components/markdown/MarkdownEditorLazy.jsx
?? static/ui/src/pages/projectDetail/work/WORK_VIEWS.md
?? static/ui/src/pages/resource/__test__/
 .gitignore                                         |  5 +-
 src/nosql/query/CustomEntityManager.js             | 52 +++++++++++++++++++
 src/permission/PrincipalResolver.js                | 46 +++++++++++++----
 src/queue/consumer.js                              | 58 ++++++++++++++++++----
 static/ui/src/pages/myWork/WorklogPage.jsx         |  7 ++-
 static/ui/src/pages/myWork/modal/WorklogModal.jsx  | 55 ++++++++++++++++----
 .../pages/projectDetail/gantt/useGanttMutations.js | 49 +++++++++++-------
 static/ui/src/pages/resource/ResourcePage.jsx      |  9 ++++
 8 files changed, 230 insertions(+), 51 deletions(-)
M	.gitignore
M	src/nosql/query/CustomEntityManager.js
M	src/permission/PrincipalResolver.js
M	src/queue/consumer.js
M	static/ui/src/pages/myWork/WorklogPage.jsx
M	static/ui/src/pages/myWork/modal/WorklogModal.jsx
M	static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
M	static/ui/src/pages/resource/ResourcePage.jsx

codex
리뷰 대상에는 요청에 열거된 코드 외에 `.gitignore`, `ResourcePage.jsx`, 작업 문서·환경 산출물도 포함되어 있습니다. 전부 확인하되, 환경 산출물은 애플리케이션 동작에 영향을 주는지부터 분리해 보겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg --files -g 'FIX_STAGE3_*.md' -g 'BACKEND_2026-08-12.md' -g 'FRONTEND_2026-08-12.md' -g 'JobCompletion.test.js' -g 'resourceTabsLazyMount.test.js' -g 'FullCalendarLazy.jsx' -g 'MarkdownEditorLazy.jsx' -g 'WORK_VIEWS.md' -g '.gitignore' | Sort-Object; git -c safe.directory=C:/CloudJira/moves-workforce diff -- .gitignore src/nosql/query/CustomEntityManager.js src/permission/PrincipalResolver.js src/queue/consumer.js static/ui/src/pages/myWork/WorklogPage.jsx static/ui/src/pages/myWork/modal/WorklogModal.jsx static/ui/src/pages/projectDetail/gantt/useGanttMutations.js static/ui/src/pages/resource/ResourcePage.jsx" in C:\CloudJira\moves-workforce
 succeeded in 1572ms:
.gitignore
src\queue\__test__\JobCompletion.test.js
static\ui\.gitignore
static\ui\src\components\calendar\FullCalendarLazy.jsx
static\ui\src\components\markdown\MarkdownEditorLazy.jsx
static\ui\src\pages\projectDetail\work\WORK_VIEWS.md
static\ui\src\pages\resource\__test__\resourceTabsLazyMount.test.js
diff --git a/.gitignore b/.gitignore
index 78a1dd5..c9dd429 100644
--- a/.gitignore
+++ b/.gitignore
@@ -71,4 +71,7 @@ Thumbs.db
 /라이선스_정책_구현.md
 /src/resolver/gantt/GANTT.md
 
-/.agents/*
\ No newline at end of file
+/.agents/*
+
+
+/Moves_Workforce_사용자_매뉴얼/*
\ No newline at end of file
diff --git a/src/nosql/query/CustomEntityManager.js b/src/nosql/query/CustomEntityManager.js
index ea10492..969050b 100644
--- a/src/nosql/query/CustomEntityManager.js
+++ b/src/nosql/query/CustomEntityManager.js
@@ -141,6 +141,58 @@ export const customEntityManager = (entityName) => {
             }
         },
 
+        /**
+         * 인덱스 동등조건 + 커서 페이징 (`findAllPaged` 의 where 버전).
+         *
+         * `findByWhere` 는 `.limit()` 상한에서 잘리고 `nextCursor` 를 버린다 —
+         * `findAll()` 100건 하드캡과 **같은 함정**이라, 건수가 상한을 넘을 수 있는 곳에서는 이걸 쓴다.
+         *
+         * **기존 `findByWhere` 는 변경하지 않는다** — 다른 도메인 회귀 방지.
+         *
+         * @param {string} indexName manifest indexes 에 선언된 인덱스명
+         * @param {string|number|boolean} value 동등 비교 값
+         * @param {number} pageLimit 1회 조회 건수
+         * @param {number} maxItems 수집 상한. 도달했는데 커서가 남아 있으면 truncated:true
+         * @returns {Promise<{results: Array, truncated: boolean}>}
+         */
+        async findByWherePaged(indexName, value, pageLimit = 100, maxItems = 1000) {
+            try {
+                const results = [];
+                let cursor;
+                let truncated = false;
+
+                for (;;) {
+                    let query = kvs.entity(entityName)
+                        .query()
+                        .index(indexName)
+                        .where(WhereConditions.equalTo(value))
+                        .limit(pageLimit);
+
+                    if (cursor) query = query.cursor(cursor);
+
+                    const page = await query.getMany();
+
+                    results.push(...(page?.results ?? []));
+                    cursor = page?.nextCursor;
+
+                    // 커서가 없으면 마지막 페이지 — 상한과 무관하게 정상 종료(truncated:false).
+                    if (!cursor) break;
+
+                    // 상한 도달 + 커서 잔존. 호출자가 "필요한 만큼만" 상한으로 쓰는 경우가 있어
+                    // (완료 판정 등) findAllPaged 와 달리 error 로그는 남기지 않고 플래그만 돌려준다.
+                    if (results.length >= maxItems) {
+                        truncated = true;
+                        break;
+                    }
+                }
+
+                return { results: results.slice(0, maxItems), truncated };
+            } catch (e) {
+                logError('findByWherePaged', e);
+                throw CustomEntityError.init(e);
+            }
+        },
+
         async findByFilterExists(indexName,filter, limit = 100) {
             try {
                 return await kvs.entity(entityName)
diff --git a/src/permission/PrincipalResolver.js b/src/permission/PrincipalResolver.js
index 4fe9ab6..be09dcd 100644
--- a/src/permission/PrincipalResolver.js
+++ b/src/permission/PrincipalResolver.js
@@ -19,6 +19,8 @@
  *
  * 성능(§4):
  *   - accountId 는 context 에서 취득(Jira /myself 불필요).
+ *   - admin 판정(Jira /mypermissions)과 users 행 조회(SQL)는 **병렬**이다(2026-08-12, 감사 A-6).
+ *     호출 횟수는 종전과 같고 왕복만 2단 → 1단. 판정 순서·fail-close 동작은 불변.
  *   - admin  : Jira /mypermissions 1회 (+ 표시용 users SQL 1 + 팀 인덱스 캐시)
  *   - 비admin: Jira 1 + users SQL 1 + KVS permission 1 + 팀 인덱스(60초 캐시)
  *              (+ 팀장/TEAM_ONLY 시 users SQL 1, + MEMBER_ONLY/TEAM_ONLY 시 projectusers SQL 1)
@@ -214,8 +216,37 @@ export const resolvePrincipal = async (context) => {
     return principal;
 };
 
+/**
+ * users 행 조회 — 실패는 종전과 같이 "행 없음"으로 흡수한다(넓히지 않는다).
+ * 조회 결과는 admin/비admin 두 경로가 **모두** 필요로 한다:
+ *   admin  → 표시용 팀 컨텍스트(+ stale leaderAccountId fail-close 전제)
+ *   비admin → 권한 세트/팀 결정
+ */
+const loadUserRows = async (accountId) => {
+    try {
+        return (await getUserInfoService({ accountId }))?.rows ?? [];
+    } catch (e) {
+        console.error('[PrincipalResolver] getUserInfoService error:', e);
+        return [];
+    }
+};
+
 const buildPrincipal = async (accountId) => {
-    const isAdmin = await isAdministrator();
+    /*
+     * 성능 (2026-08-12 감사 A-6) — admin 판정(Jira `/mypermissions`)과 users 행 조회(SQL)는
+     * 서로 독립인데 직렬로 줄세워져 있었다. 두 경로 모두 users 행을 쓰므로 병렬로 묶어도
+     * **호출 횟수는 그대로**이고 왕복만 2단 → 1단이 된다(가드는 모든 resolver 진입마다 돈다).
+     *
+     * ★ 판정 불변 조건
+     *   · `isAdministrator()` 는 catch 하지 않는다 — 실패는 종전처럼 throw 되어 가드가 fail-close 한다.
+     *     (`loadUserRows` 는 절대 reject 하지 않으므로 Promise.all 이 unhandled rejection 을 만들지 않는다.)
+     *   · users 조회 실패는 종전처럼 rows=[] 로 흡수 → admin 은 팀 정보 없음, 비admin 은 미등록 처리.
+     *   · 아래 분기 순서(admin → 미등록 → 팀 → 세트)는 그대로다. 값이 언제 도착하는지만 달라진다.
+     */
+    const [isAdmin, dbUserInfo] = await Promise.all([
+        isAdministrator(),
+        loadUserRows(accountId),
+    ]);
 
     // 1) Jira ADMINISTER → 전권 Admin (항상 projectScope ALL)
     if (isAdmin) {
@@ -226,9 +257,8 @@ const buildPrincipal = async (accountId) => {
         //   ★ 여기서도 users 행이 있어야 팀장으로 인정한다(stale leaderAccountId fail-close 일관).
         let teamCtx = emptyTeamContext();
         try {
-            const rows = (await getUserInfoService({ accountId }))?.rows ?? [];
-            if (rows.length > 0) {
-                const { teamIndex, ...ctx } = await resolveTeamContext(accountId, rows[0].team_key ?? null);
+            if (dbUserInfo.length > 0) {
+                const { teamIndex, ...ctx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);
                 teamCtx = ctx;
             }
         } catch (e) {
@@ -249,13 +279,7 @@ const buildPrincipal = async (accountId) => {
         };
     }
 
-    // 2) users DB 조회 → permission_key / team_key
-    let dbUserInfo = [];
-    try {
-        dbUserInfo = (await getUserInfoService({ accountId }))?.rows ?? [];
-    } catch (e) {
-        console.error('[PrincipalResolver] getUserInfoService error:', e);
-    }
+    // 2) users DB 조회 결과(위에서 admin 판정과 병렬로 이미 받아 뒀다) → permission_key / team_key
 
     // 3) 미등록 사용자 → 전부 false (fail-close)
     //    ★ 팀 컨텍스트를 **계산하지 않는다.** KVS team.leaderAccountId 에 이 계정이 stale 하게
diff --git a/src/queue/consumer.js b/src/queue/consumer.js
index e1db5d9..3e9fdc5 100644
--- a/src/queue/consumer.js
+++ b/src/queue/consumer.js
@@ -229,6 +229,9 @@ export const backfillSubscription = createConsumerHandler(
     },
 );
 
+/** 완료 판정 스캔의 페이지 크기 (KVS 쿼리 limit 상한) */
+const JOB_BATCH_PAGE_LIMIT = 100;
+
 /**
  * @param appJobId
  * @param totalBatches
@@ -236,17 +239,54 @@ export const backfillSubscription = createConsumerHandler(
  *
  * 전체 배치 완료 여부 확인 및 job 최종 집계 함수 각 배치의 상태는 jobBatchManager로 확인하며
  * 최종 상태는 jobManager에 업데이트 하여 관리한다
+ *
+ * ── 성능 (2026-08-12 감사 A-4) ────────────────────────────────────────────────
+ * 이전에는 배치가 하나 끝날 때마다 `findById(`${appJobId}-batch-${i}`)` 를 0..totalBatches-1
+ * **전부** 발행해서, job 하나의 KVS 읽기가 `B × (B+1) ≈ B²` 였다(U=5,000 업로드 → 62,750회).
+ * 지금은 `job_batch` 의 `jobId` 인덱스를 커서 페이징으로 훑는다 — 1회 판정 비용이
+ * `ceil(완료배치수 / 100)` 페이지로 떨어진다(대부분의 호출은 1페이지).
+ *
+ * ── 멱등성 (큐는 병렬·재시도 소비다) ─────────────────────────────────────────
+ * 카운터를 따로 두지 않는다. Forge KVS 에는 트랜잭션도 원자적 증가도 없어서
+ * read-modify-write 카운터는 (a) 갱신 유실로 완료가 영영 오지 않거나
+ * (b) 재시도 배치의 중복 증가로 **조기 완결**된다. 대신 배치 레코드 자체를 진실의 원천으로 쓴다:
+ *   · 배치 레코드는 처리가 끝났을 때만 `done: true` 로 저장된다(미완료 레코드는 존재하지 않는다).
+ *   · 키가 `${appJobId}-batch-${index}` 로 배치마다 유일하므로, 같은 배치가 재시도로 몇 번
+ *     저장되든 같은 키를 덮어쓴다 → 중복 계수가 원천적으로 불가능하다.
+ *   · 따라서 "서로 다른 키의 done 레코드 수"는 **완료 배치 수와 정확히 같고 단조 증가**한다.
+ * 즉 종전 구현과 **같은 키 집합을 세는 다른 방법**일 뿐이라 판정 결과가 바뀌지 않는다.
+ * `appJobId` 는 job 생성 시 새 UUID 라 이전 job 의 레코드가 섞여 들어올 여지도 없다.
  */
 const checkJobCompletion = async (appJobId, totalBatches) => {
-    // 모든 배치 결과 조회 , 미완료 배치는 널로 처리
-    const batchResults = await Promise.all(
-        Array.from({ length: totalBatches }, (_, i) =>
-            jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)
-        )
-    );
-    // 완료된 배치만
-    const doneBatches = batchResults.filter(b => b?.done);
-    if (doneBatches.length < totalBatches) return;
+    const total = Number(totalBatches);
+    // 배치 수를 모르면 완료를 판정할 수 없다(아래 스캔 상한의 입력이기도 하다)
+    if (!appJobId || !Number.isInteger(total) || total <= 0) return;
+
+    // 저장된 배치 레코드는 전부 done 이므로 상한을 total 로 두면 판정에 필요한 만큼만 읽고 멈춘다.
+    let scan;
+    try {
+        scan = await jobBatchManager.findByWherePaged('jobId', appJobId, JOB_BATCH_PAGE_LIMIT, total);
+    } catch (e) {
+        // 조회 실패는 완료 판정을 미룰 뿐이다 — 다음 배치(또는 재시도)가 다시 판정한다.
+        console.error('[checkJobCompletion] batch scan failed', appJobId, e);
+        return;
+    }
+
+    // 키 기준 중복 제거 — 재시도 저장은 덮어쓰기라 원래 유일하지만, 페이지 경계 방어로 남긴다.
+    const seen = new Set();
+    const doneBatches = [];
+    for (const row of scan?.results ?? []) {
+        const value = row?.value ?? row;
+        if (!value?.done) continue;
+        const key = row?.key;
+        if (key) {
+            if (seen.has(key)) continue;
+            seen.add(key);
+        }
+        doneBatches.push(value);
+    }
+
+    if (doneBatches.length < total) return;
     // 집계
     const totalProcessed = doneBatches.reduce((s, b) => s + (b.processedCount || 0), 0);
     const totalFailed = doneBatches.reduce((s, b) => s + (b.failCount || 0), 0);
diff --git a/static/ui/src/pages/myWork/WorklogPage.jsx b/static/ui/src/pages/myWork/WorklogPage.jsx
index 7559a5e..f09cb2d 100644
--- a/static/ui/src/pages/myWork/WorklogPage.jsx
+++ b/static/ui/src/pages/myWork/WorklogPage.jsx
@@ -1,5 +1,8 @@
 import React, {useEffect, useMemo, useRef, useState} from 'react';
-import {CustomFullCalendar} from "../../components/calendar/FullCalendar";
+// ⚠ 캘린더는 **lazy** 다(`@fullcalendar/*` + moment 를 main 밖으로 내보내는 경계).
+//   이 페이지는 기본 진입 라우트라 정적 import 인데, 그 정적 경로가 캘린더 스택까지
+//   main 에 고정시키고 있었다. 정적 import 로 되돌리면 그 회귀가 그대로 재발한다.
+import {LazyFullCalendar} from "../../components/calendar/FullCalendarLazy";
 import {WorklogModal} from "./modal/WorklogModal";
 import {STATUS_COLOR_MAP} from "../../constants/statusColorMap";
 import {invoke, Modal, view} from "@forge/bridge";
@@ -489,7 +492,7 @@ export default function WorklogPage() {
                                     }}
                                 >
                                     {viewMode === "calendar" ? (
-                                        <CustomFullCalendar
+                                        <LazyFullCalendar
                                             context={context}
                                             event={mergedEvents}
                                             onEventClick={onEventClick}
diff --git a/static/ui/src/pages/myWork/modal/WorklogModal.jsx b/static/ui/src/pages/myWork/modal/WorklogModal.jsx
index 3072cce..671a324 100644
--- a/static/ui/src/pages/myWork/modal/WorklogModal.jsx
+++ b/static/ui/src/pages/myWork/modal/WorklogModal.jsx
@@ -19,9 +19,7 @@ import {
     getTimeISOString,
     timeValidation
 } from "../../../utils/TimeUtils";
-import {MarkdownEditor} from "../../../components/markdown/MarkdownEditor";
-import { markdownToAdf } from 'marklassian';
-import * as adf2md from 'adf-to-md';
+import {LazyMarkdownEditor} from "../../../components/markdown/MarkdownEditorLazy";
 import {UserAvatar} from "../../../components/avatar/UserAvatar";
 import {AvatarStack} from "../../../components/avatar/AvatarStack";
 import {scheduleTypeOptions} from "../../../constants/scheduleTypeOptions";
@@ -33,6 +31,30 @@ import {calendarKeys} from "../../../utils/queryKey/logicalAuditKeys";
 
 const context = await view.getContext();
 
+/*
+ * 마크다운↔ADF 변환기는 마크다운 파서(marked/mdast/micromark)를 통째로 끌고 온다.
+ * 이 모달을 소유한 `WorklogPage` 가 기본 진입 라우트(정적 import)라, 정적으로 두면 워크로그를
+ * 한 번도 열지 않는 사용자까지 파서를 내려받는다 — 에디터(`MarkdownEditorLazy`)를 내렸는데
+ * 변환기가 남아 있으면 분리 효과가 절반이 된다.
+ *
+ * 모듈 promise 를 캐시하므로 두 번째 호출부터는 왕복이 없다(webpack 도 같은 청크를 재사용한다).
+ */
+let markdownToAdfPromise = null;
+const loadMarkdownToAdf = () => {
+    if (!markdownToAdfPromise) {
+        markdownToAdfPromise = import('marklassian').then(m => m.markdownToAdf);
+    }
+    return markdownToAdfPromise;
+};
+
+let adfToMdPromise = null;
+const loadAdfToMd = () => {
+    if (!adfToMdPromise) {
+        adfToMdPromise = import('adf-to-md');
+    }
+    return adfToMdPromise;
+};
+
 // executeRequest 는 실패 시 throw 대신 {success:false} 반환 → throw 로 승격해 catch 로 흘림
 const ensureWorklogResult = (result) => {
     if (result?.success === false) {
@@ -102,12 +124,24 @@ export const WorklogModal = ({
         setIsEdit(!!worklog_id);
         setInputMode("simple");
         setSubmitError(null);
-        try {
-            const text = worklog?.comment && adf2md.convert(worklog.comment)?.result || '';
-            setMarkdown(text);
-        } catch (e) {
+
+        // 기존 코멘트가 없으면 변환기를 아예 받지 않는다(신규 등록이 대부분이다).
+        const comment = worklog?.comment;
+        if (!comment) {
             setMarkdown('');
+            return;
         }
+
+        // 변환기 로드가 비동기라, 그 사이 다른 워크로그를 열면 늦게 도착한 결과가 덮어쓸 수 있다.
+        let cancelled = false;
+        loadAdfToMd()
+            .then(adf2md => {
+                if (!cancelled) setMarkdown(adf2md.convert(comment)?.result || '');
+            })
+            .catch(() => {
+                if (!cancelled) setMarkdown('');
+            });
+        return () => { cancelled = true; };
     }, [worklogInfo]);
 
     // 본인 워크로그이거나 작성자 정보가 없을 때만 편집 허용
@@ -294,7 +328,8 @@ export const WorklogModal = ({
     };
 
     // 단일 날짜 워크로그 추가
-    const addWorklog = value => {
+    const addWorklog = async value => {
+        const markdownToAdf = await loadMarkdownToAdf();
         const pathParams = { issueIdOrKey: value.issueKey.value };
         const params = {
             comment: markdownToAdf(markdown),
@@ -306,6 +341,7 @@ export const WorklogModal = ({
 
     // 단일 워크로그 수정
     const updateWorklog = async value => {
+        const markdownToAdf = await loadMarkdownToAdf();
         const pathParams = { issueIdOrKey: value.issueKey.value, id: worklog_id };
         const params = {
             comment: markdownToAdf(markdown),
@@ -317,6 +353,7 @@ export const WorklogModal = ({
 
     // 기간 입력: 날짜별 워크로그를 순차 생성, 중간 실패 시 성공분 전체 롤백
     const addWorklogRange = async value => {
+        const markdownToAdf = await loadMarkdownToAdf();
         const issueIdOrKey = value.issueKey.value;
         const dates = getWorkingDateList(value.range_start_date, value.range_end_date);
         const timeSpentSeconds = hoursPerDay * 3600;
@@ -616,7 +653,7 @@ export const WorklogModal = ({
 
             <Field name="description" label={t('worklog.modal.field.description')}>
                 {({ fieldProps }) => (
-                    <MarkdownEditor markdown={markdown} setMarkdown={setMarkdown} />
+                    <LazyMarkdownEditor markdown={markdown} setMarkdown={setMarkdown} />
                 )}
             </Field>
 
diff --git a/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js b/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
index 2627aea..fb95097 100644
--- a/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
+++ b/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js
@@ -34,6 +34,11 @@ function patchTask(old, issueKey, patch) {
     };
 }
 
+/** 계획 작업량(MD) → Jira originalEstimate 시간(0.1h 반올림). write 값과 낙관 캐시값의 단일 출처. */
+function plannedHours(md, rate) {
+    return md > 0 ? Math.round(md * rate * 10) / 10 : 0;
+}
+
 /**
  * useUpdateSchedule — 막대 드래그/리사이즈 일정 write-back (M2).
  *
@@ -378,9 +383,15 @@ export function useSetLink({ projectId, toast }) {
  * useUpdateAssignee — 그리드 담당자 인라인 편집 write-back.
  *
  * 경로: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 직접 호출, ProjectIssueTable.assignIssue 동일)
- * 전략: useUpdateSchedule 패턴 — 낙관 패치(task.assignee 교체) + onError 롤백 + onSettled invalidate(shape 안전망).
+ * 전략: useUpdateSchedule 패턴 — 낙관 패치(task.assignee 교체) + onError 롤백. **invalidate 하지 않는다.**
  *       성공 토스트 표시(2026-07-02), 실패는 gantt.error.saveFailed.
  *
+ * ⚠️ 과거 onSettled invalidate("shape 안전망")는 제거했다(2026-08-12): ganttKeys.data 는
+ *    프로젝트 이슈를 JQL 로 전량 페이징 수집하는 최고비용 resolver 라 셀 편집 1회당 전량 재조회가 붙었고,
+ *    JQL 재조회는 write 직후 인덱스 지연으로 옛 값을 돌려줄 수 있다(§6 / CLAUDE.md).
+ *    낙관 패치가 이미 gantt 계약 shape({accountId, displayName, avatarUrl})으로 정규화하므로 안전망도 불필요하다.
+ *    전체 재동기화는 다음 자연 재조회(탭 재진입/새로고침) — useSetParent/useSetLink 와 동일 정책.
+ *
  * mutate 인자: { issueKey, accountId(string|null), assigneeObj }
  *  - assigneeObj: 선택 옵션 value({ accountId, displayName, avatarUrls }) — 낙관 표시용(gantt 계약 assignee shape 로 매핑).
  */
@@ -438,11 +449,6 @@ export function useUpdateAssignee({ projectId, toast }) {
                 : t('gantt.error.saveFailed');
             toast?.showError?.(t('common.toast.title.Fail'), message);
         },
-
-        // 서버 확정 상태로 동기화(낙관 shape 불일치 안전망).
-        onSettled: () => {
-            queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
-        },
     });
 }
 
@@ -452,7 +458,14 @@ export function useUpdateAssignee({ projectId, toast }) {
  * 경로: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker 동일)
  *  - customFieldId(coworkerFieldId)는 useGanttData 가 채운 ['coworkerFieldId'] 쿼리 캐시를 공유.
  *  - issueId 는 숫자 Jira id(string) — Task.issueId(신규 필드).
- * 전략: 낙관 패치(task.coworkers 교체) + onError 롤백 + onSettled invalidate(user shape 불일치 안전망).
+ * 전략: 낙관 패치(task.coworkers 교체) + onError 롤백. **invalidate 하지 않는다.**
+ *
+ * ⚠️ 과거 onSettled invalidate 는 **규약 위반**이라 제거했다(2026-08-12). 이 훅의 write 경로
+ *    (updateProjectIdField → setAppFieldValueForIssues)는 **앱 커스텀필드 write** 이고,
+ *    ganttKeys.data 재조회는 JQL search 다 — write 직후 search 는 인덱스 지연으로 옛 값을 돌려주고
+ *    그 값이 staleTime 캐시에 박제된다(§6 「write 직후 search 재조회 금지」, CLAUDE.md).
+ *    낙관 패치가 캐시의 최종 상태다. user 객체는 select 옵션 value({accountId, displayName,
+ *    avatarUrls:{'24x24'}})로 AvatarStack 이 읽는 키를 모두 갖춘다(서버 shape 과 렌더 동등).
  *
  * mutate 인자: { issueId, accountIds(string[]), coworkers }  (coworkers=선택 옵션 value 배열, 낙관 표시용)
  */
@@ -507,10 +520,6 @@ export function useUpdateCoworkers({ projectId, toast }) {
             }
             toast?.showError?.(t('common.toast.title.Fail'), t('gantt.error.saveFailed'));
         },
-
-        onSettled: () => {
-            queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
-        },
     });
 }
 
@@ -518,8 +527,13 @@ export function useUpdateCoworkers({ projectId, toast }) {
  * useUpdatePlannedMd — 그리드 "계획 작업량"(MD) 인라인 편집 write-back.
  *
  * 경로: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD 동일)
- *  - originalEstimate = md>0 ? `${round(md*hourRate*10)/10}h` : '0h'
- * 전략: 낙관 패치(task.originalEstimateSeconds = round(md*hourRate*3600)) + onError 롤백 + onSettled invalidate.
+ *  - originalEstimate = `${plannedHours(md, hourRate)}h`
+ * 전략: 낙관 패치(task.originalEstimateSeconds) + onError 롤백. **invalidate 하지 않는다.**
+ *
+ * ⚠️ 과거 onSettled invalidate 는 제거했다(2026-08-12) — 셀 편집 1회당 최고비용 resolver 전량 재조회였고,
+ *    JQL 재조회는 write 직후 인덱스 지연 위험이 있다(§6). 대신 낙관값을 **실제로 write 하는 시간값**에서
+ *    역산해(plannedHours) 캐시와 서버 상태가 어긋나지 않게 한다 — 이것이 옛 invalidate 의 역할이었다.
+ *    (처리율/aggregate 파생값은 서버 재계산이라 다음 자연 재조회에서 따라온다.)
  *
  * mutate 인자: { issueKey, md(number) }
  */
@@ -534,7 +548,7 @@ export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
             // 실제 400(timetracking) 실패를 onError 에서 안내로 매핑.
             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
             if (perms.canEditIssues === false) throw jiraPermissionError();
-            const originalEstimate = md > 0 ? `${Math.round(md * rate * 10) / 10}h` : '0h';
+            const originalEstimate = `${plannedHours(md, rate)}h`;
             // 기존 remaining 조회 후 함께 전송 — 수정 시 remaining 미동봉이면 Jira 검증 400
             // (Task 에는 remaining 이 없어 단건 GET 1회. buildTimetrackingPayload 참조)
             const cur = await executeRequest('getIssue', { fields: 'timetracking' }, { issueIdOrKey: issueKey });
@@ -555,7 +569,8 @@ export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
         onMutate: async ({ issueKey, md }) => {
             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
-            const seconds = md > 0 ? Math.round(md * rate * 3600) : 0;
+            // 낙관값은 write 하는 시간값(0.1h 반올림)에서 역산 — 캐시가 서버 저장값과 같은 수를 갖는다.
+            const seconds = Math.round(plannedHours(md, rate) * 3600);
             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
                 patchTask(old, issueKey, { originalEstimateSeconds: seconds })
             );
@@ -580,9 +595,5 @@ export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
                         : t('gantt.error.saveFailed');
             toast?.showError?.(t('common.toast.title.Fail'), message);
         },
-
-        onSettled: () => {
-            queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
-        },
     });
 }
diff --git a/static/ui/src/pages/resource/ResourcePage.jsx b/static/ui/src/pages/resource/ResourcePage.jsx
index 21df4c8..8d388d1 100644
--- a/static/ui/src/pages/resource/ResourcePage.jsx
+++ b/static/ui/src/pages/resource/ResourcePage.jsx
@@ -16,6 +16,15 @@ import TeamAnalyticsTab from './teamAnalytics/TeamAnalyticsTab';
  * 조직 현황·팀 분석은 인력 현황과 **같은 쿼리(`getResourceOverview`)를 공유**한다 —
  * 탭 전환에 네트워크가 발생하지 않는다. 페이지 게이트도 이 한 곳뿐이다.
  *
+ * ── 탭 마운트: 수동 lazy 게이트를 두지 않는다 ────────────────────────────────
+ * `TabPanel` 자체는 children 을 무조건 렌더하지만, 상위 `Tabs`(@atlaskit/tabs 18.3.4)가
+ * **방문한(visited) 패널만** 렌더하고 방문 후에는 언마운트하지 않는다
+ * (`dist/esm/components/tabs.js` — `Array.from(visited.current).map(...)`).
+ * 즉 진입 시 숨김 탭(팀 분석·프로젝트 배정)의 훅/invoke 는 실행되지 않고,
+ * 한 번 연 탭의 패널 상태(ResizablePanels 폭 등)·스크롤은 전환해도 보존된다.
+ * 이 전제는 `__test__/resourceTabsLazyMount.test.js` 가 고정한다 — 여기에 `selected`/`visited` 를
+ * 손으로 다시 구현하면 라이브러리 동작과 중복되고 조건부 탭의 인덱스 정렬만 깨진다.
+ *
  * ── 🔴 팀 분석 탭만 추가 조건이 있다 (team-analytics §5-1) ───────────────────
  * `teamAnalyticsScope === 'NONE'` 이면 **탭 자체를 내지 않는다.** 서버가 판정한 값
  * (`userPermissionCheck.team.teamAnalyticsScope`)을 그대로 읽을 뿐 프론트가 재판정하지 않는다.

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force '_workspace\\perf-audit' | Select-Object Name,Length,FullName; Get-ChildItem -Force . | Where-Object { "'$_.Name -like '"'FIX_STAGE3*' } | Select-Object Name,Length,FullName; Get-Content -Raw '_workspace\\perf-audit\\BACKEND_2026-08-12.md'; Get-Content -Raw '_workspace\\perf-audit\\FRONTEND_2026-08-12.md'; Get-Content -Raw 'FIX_STAGE3_BACKEND.md'; Get-Content -Raw 'FIX_STAGE3_FRONTEND.md'; Get-Content -Raw 'FIX_STAGE3_BUNDLE.md'" in C:\CloudJira\moves-workforce
2026-08-12T09:54:23.248969Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.4 seconds
Total output lines: 1123
Output:

Name                    Length FullName                                                                 
----                    ------ --------                                                                 
03_verify_stage12.md     25491 C:\CloudJira\moves-workforce\_workspace\perf-audit\03_verify_stage12.md  
BACKEND_2026-08-12.md    50818 C:\CloudJira\moves-workforce\_workspace\perf-audit\BACKEND_2026-08-12.md 
CODEX_REVIEW_RFC187.md 1046630 C:\CloudJira\moves-workforce\_workspace\perf-audit\CODEX_REVIEW_RFC187.md
CODEX_REVIEW_STAGE3.md   84524 C:\CloudJira\moves-workforce\_workspace\perf-audit\CODEX_REVIEW_STAGE3.md
FIX_STAGE1_BACKEND.md     4467 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE1_BACKEND.md 
FIX_STAGE1_FRONTEND.md    5734 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE1_FRONTEND.md
FIX_STAGE2_BACKEND.md    21854 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE2_BACKEND.md 
FIX_STAGE2_FRONTEND.md   15741 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE2_FRONTEND.md
FIX_STAGE3_BACKEND.md    10864 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_BACKEND.md 
FIX_STAGE3_BUNDLE.md      8823 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_BUNDLE.md  
FIX_STAGE3_FRONTEND.md    8770 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_FRONTEND.md
FRONTEND_2026-08-12.md   76512 C:\CloudJira\moves-workforce\_workspace\perf-audit\FRONTEND_2026-08-12.md
# 諛깆뿏??src/) 鍮꾪슚?㉱룰퀬鍮꾩슜 濡쒖쭅 媛먯궗 ??2026-08-12

- ????뚯뒪: `develop` @ `f6e521c` 湲곗? ?묒뾽 ?몃━ (`src/` ?꾨줈?뺤뀡 肄붾뱶 ?꾩껜)
- 諛⑸쾿: grep ?꾩닔 + ?뺣룆. ?몄텧遺?뷀뵾?몄텧遺 ?숈떆 ?쎄린濡??몄텧 ?잛닔瑜?**?앹쑝濡?* ?곗텧. DDL怨?荑쇰━瑜??議고빐 ?몃뜳???뺥빀 ?뺤씤. **肄붾뱶 ?섏젙 ?놁쓬**
- 異붿륫 諛곗젣: 肄붾뱶?먯꽌 ?쎌? ?곸닔쨌猷⑦봽 援ъ“쨌DDL ?좎뼵留?洹쇨굅濡??쇱븯?? ?뺤씤 遺덇???寃껋? ?뚮?寃利앫띿뿉 ?④꼈??
> **?ш컖??* ??**P1** ?ъ슜??泥닿컧/鍮꾩슜 ??쨌 **P2** 議곌굔遺쨌以묎컙 쨌 **P3** ?ъ냼

## ?쒖쇅(?щ낫怨?????

| ??ぉ | 洹쇨굅 |
|------|------|
| ?먯썝 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆(Forge SQL ?곸옱 諛곗젣) | ?섎룄??寃곗젙 |
| ?뚰겕濡쒓렇 ?섏쿂 湲곕뒫蹂?寃⑸━(怨듯넻 寃쎈줈 ?섏젙 湲덉?) | ?섎룄??寃곗젙 ??寃⑸━???섏쿂 **?대?**??鍮꾪슚?⑤쭔 吏?곹븳??|
| 由ъ빻???덉궛 200嫄??덈떒 / `applyDefaultEstimate` ?곹븳 / 諛깊븘 job ?곹깭 湲곌퀎 | `_workspace/subscription-audit/AUDIT_2026-08-11.md` 湲곕낫怨?|
| 援щ룆 ?꾨찓???쇰컲 | ??媛먯궗 ?꾨즺 ??**鍮꾩슜 愿???좉퇋 吏?곷쭔** ?ㅼ뿀??|

## 湲고샇

`P` ?쒖꽦 ?꾨줈?앺듃 ??쨌 `I_p` ?꾨줈?앺듃 ?댁뒋 ??쨌 `M_p` ?꾨줈?앺듃 ?몄썝 ??쨌 `w_i` ?댁뒋 i ?뚰겕濡쒓렇 嫄댁닔 쨌
`U` ?깅줉 ?ъ슜????쨌 `W` ??쒕낫???꾩젽 ??쨌 `B` ??諛곗튂 ??쨌 `S` ?붾㈃ 吏꾩엯 ???숈떆 invoke ??

????덉떆??**P=30 쨌 I=5,000(?됯퇏 I_p??67) 쨌 ?곸꽭 ????꾨줈?앺듃 1,000?댁뒋 쨌 U=500** 湲곗?.

## ?뚯씠釉?洹쒕え (DDL쨌肄붾뱶 ?ㅼ륫)

| ?뚯씠釉?| ????洹쒕え | 洹쇨굅 |
|---|---|---|
| `users` | ?깅줉 ?몄썝, 10짼~10쨀 | `MAX_USER_CANDIDATES=1000`(`TeamService.js:65`), `TEAM_SCOPE_WARN_THRESHOLD=2000`(`PrincipalResolver.js:59`) |
| `projectusers` | 誇(?꾨줈?앺듃 횞 ?ъ엯 ?몄썝) | 1??諛곗젙 ?곹븳 `TEAM_ASSIGN_MAX=500` |
| `project` | 10쨔~10짼 | ??|
| `portfolio_project_snapshot` | ?쒖꽦 ?꾨줈?앺듃??1??(+JSON 3而щ읆) | PK = `project_id` |
| `gantt_folder_issue` | ?댁뒋 ?섏뿉 鍮꾨? | PK = `issue_key` |

> **?뚰겕濡쒓렇 SQL ?뚯씠釉붿? 議댁옱?섏? ?딅뒗??** `src/rdb/schema/ddl/worklog.js` ???꾩껜媛 二쇱꽍?닿퀬 `ddl/index.js` ??誘몃벑濡앹씠?? ?뚰겕濡쒓렇???꾨? Jira REST 寃쎌쑀?대?濡?**"?뚰겕濡쒓렇 ?뚯씠釉?N+1" 異뺤? ?대떦 ?놁쓬**?대떎.

---

## ?붿빟

| ?ш컖??| 嫄댁닔 | ??ぉ |
|--------|------|------|
| **P1** | 8 | A-1 ?뚰겕濡쒓렇 異붽?議고쉶 ?섏씠吏 20 쨌 A-2 吏꾩쿃/鍮꾩슜 罹먯떆 臾댄슚 쨌 A-3 ??쒕낫???꾩젽蹂??꾨웾 ?ㅼ틪 쨌 A-4 `checkJobCompletion` O(B짼) 쨌 A-5 ?ы듃?대━??諛곗튂 臾댁쬆遺?쨌 A-6 媛??怨좎젙鍮?횞 invoke ??쨌 A-7 留덉뒪???ъ쟾 ?쒕쾭 罹먯떆 遺??쨌 A-8 `BIN_TO_UUID()` 濡?PK ?몃뜳??臾대젰??|
| **P2** | 17 | B-1 ~ B-17 |
| **P3** | 15 | C-1 ~ C-15 |

**媛??????媛쒖꽑**: `maxResult: 20` ??`100` ?곸닔 ??湲??(A-1) ??`/myWork` 吏꾩엯 Jira ?몄텧 **275 ??65 (??7%)**.
**??踰덉㎏**: `WHERE BIN_TO_UUID(p.project_id) = ?` ??`WHERE p.project_id = UUID_TO_BIN(?)` (A-8) ???꾨줈?앺듃 ?곸꽭 4媛???쓽 ?꾨웾 議곗씤 ?쒓굅.

---

# P1

## A-1. ?뚰겕濡쒓렇 異붽? 議고쉶媛 ?섏씠吏 ?ш린 20?쇰줈 ?쒖감 ??API 湲곕낯媛?100??踰꾨━怨?5諛곕? ??遺瑜몃떎

- **?앹궛??API)**: `C:\CloudJira\moves-workforce\src\api\jira\worklog\WorklogApi.js:4` ??`maxResult = 100` ??湲곕낯媛?- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:114-135`
- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\utils\worklog\WorklogService.js:209-230`

```js
// MyWorkService.jsx:118-122 / WorklogService.js:213-217 ??臾몄옄 洹몃?濡?媛숈? 蹂듭궗蹂?2踰?while (true) {
    const res = await getWorkLogByIssueKey({
        issueIdOrKey: issueKey,
        startAt: currentStartAt,
        maxResult: 20});          // ??湲곕낯媛?100??援녹씠 20?쇰줈 ??텣??```

寃???묐떟???몃씪???뚰겕濡쒓렇 ?곹븳(`worklog.maxResults`, ?듭긽 20)??**?섏씠吏 ?ш린濡??ㅼ씤???ъ궗??*??寃껋쑝濡?蹂댁씤?? ??媛믪? 臾닿??섎떎 ??`startAt` 留?20?먯꽌 ?쒖옉?섎㈃ ?섍퀬 ?섏씠吏 ?ш린??100?댁뼱???쒕떎.

- **鍮꾩슜**: ?뚰겕濡쒓렇 200嫄??댁뒋 1媛?= `ceil((200??0)/20)` = **Jira 9???쒖감**. `maxResult:100` ?대㈃ `ceil(180/100)` = **2??*.
  `/myWork` 吏꾩엯???댁뒋 200嫄?以?30嫄댁씠 ?뚰겕濡쒓렇 200嫄?珥덇낵 ??寃??1 + **270??*(`pLimit(5)` ??54?쇱슫??. ?섏젙 ??**61??*(12?쇱슫??.
- **?議곌뎔???대? 由ы룷 ?덉뿉 ?덈떎**: `ResourceWorklogFetcher.js:6,37-50` 쨌 `ProjectCalendarService.js:11,17-34` ??`EXTRA_PAGE_SIZE = 100` + **蹂묐젹**?대떎. myWork/怨듯넻 ??寃쎈줈留???諛⑹떇?쇰줈 ?⑥븯??
- **?섏젙 諛⑺뼢**: `maxResult: 100`. ?щ젰???섎㈃ `ProjectCalendarService.fetchExtraWorklogs` ?뺥깭(offset 紐⑸줉 ??`Promise.all`)濡?蹂묐젹?붽퉴吏.

## A-2. 吏꾩쿃?꽷룸퉬????쓽 10遺?KVS 罹먯떆媛 **Jira ?몄텧????嫄대룄 以꾩씠吏 紐삵븳??*

- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:49-52` ??`:199-215` (`buildIssuesArray`)
- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:66-90` ??`:206-218` (`buildByIssue`)

```js
// ProjectProgressService.js:49-52 ??罹먯떆 hit ?몃뜲?꾟?if (cached && new Date(cached.expireTime) >= new Date()) {
    const issues = await buildIssuesArray({ projectId, coworkerFieldId, hourRate });   // ??    return assembleResponse(cached.value, issues, thresholdPP);
}
// :200-204 ??媛??鍮꾩떬 ???섏튂瑜?洹몃?濡??ㅼ떆 ?쒕떎
const [holidayResult, worklogs, rawIssues] = await Promise.all([
    getPublicHolidayListService(),
    getResourceProjectWorklogs({ projectId }),                // ?뚰겕濡쒓렇 ?꾨웾
    fetchAllProjectIssues({ projectId, coworkerFieldId }),    // ?댁뒋 ?꾨웾
]);
```

`issues[]`/`byIssue[]` 媛 KVS 媛??곹븳(240KiB) ?뚮Ц??罹먯떆?먯꽌 鍮좎졇 ?덇퀬, 洹멸구 ?ш뎄?깊븯?ㅻ㈃ 寃곌뎅 ?먮낯???ㅼ떆 ?섏튂?댁빞 ?섎뒗 援ъ“?? `ProjectCostService.js:70-71` 二쇱꽍???대? ?몄??섍퀬 ?덈떎 ??*"??寃쎈줈???대? ?뚰겕濡쒓렇쨌?댁뒋 ?꾨웾???ы럹移섑븯誘濡?*.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃, 罹먯떆 hit쨌miss 臾닿? ?숈씪)**:
  `fetchAllProjectIssues` = `ceil(1000/100)` = **寃??10??* + `getResourceProjectWorklogs` = 寃??1??+ `誇 ceil((w_i??0)/100)`.
  ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋媛 100嫄댁씠硫?**珥?111??Jira ?몄텧**. 罹먯떆媛 ?덉빟?섎뒗 寃껋? **JS 吏묎퀎 CPU肉?*?대떎.
- 吏꾩쿃????낵 鍮꾩슜 ??? 媛숈? ???섏튂瑜?**媛곴컖** ?섑뻾?쒕떎 ?????ъ슜?먭? ????쓣 ?대㈃ 222??(B-14).
- **?섏젙 諛⑺뼢**: (a) 罹먯떆 ??곸쓣 ?ㅼ쭛?붾떎 ??`issues[]`/`byIssue[]` 瑜?蹂꾨룄 KVS ?ㅻ줈 **泥?겕 遺꾪븷 ???*(240KiB ?곹븳 ?뚰뵾), ?먮뒗 (b) `ProjectRaw:{projectId}` 5遺?TTL 怨듭쑀 罹먯떆瑜??먭퀬 吏꾩쿃쨌鍮꾩슜쨌byIssue ?ш뎄?깆씠 **媛숈? ?먯떆 ?섏튂 寃곌낵 ?꾩뿉??怨꾩궛留?* ?쒕떎. (b)媛 ??媛?以묐났(B-14)源뚯? ?④퍡 ?놁븻??

## A-3. ?꾨줈?앺듃 ??쒕낫?????꾩젽 ?섎굹媛 ?댁뒋 ?꾨웾 ?ㅼ틪 1踰? 洹멸쾬??**?숈씪 荑쇰━瑜?2踰?*

- **?뚮퉬??*: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:59-79` ???꾩젽 **1媛쒕떦 `invoke('getChartDataById')` 1??*
- **?앹궛??*: `C:\CloudJira\moves-workforce\src\resolver\projectDashboard\ProjectDashboardService.js:265-276`
- **以묐났???ㅼ껜**: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:14` vs `:95`

```js
// IssueApi.js:14  (getAssigneeStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
// IssueApi.js:95  (getIssueParticipantStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
```

**URL??臾몄옄 ?⑥쐞濡?媛숇떎.** ???⑥닔??媛숈? ?곗씠?곕? 媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곸뼱? 吏묎퀎留??ㅻⅤ寃??쒕떎(?대떦?먮퀎 嫄댁닔 / ?댁뒋蹂?李몄뿬????. `getChartDataset`(`:176-211`)?????섏쓣 蹂꾧컻 `dataType`(`assignee` / `issue`)?쇰줈 遺꾧린?섎?濡????꾩젽??媛숈씠 ?볦씠硫?**媛숈? ?ㅼ틪??2踰?* ?섍컙?? ?뚰겕濡쒓렇 ?꾩젽留?10遺?KVS 罹먯떆媛 ?덇퀬(`WorklogService.js:26-47`) assignee/issue ?꾩젽?먮뒗 罹먯떆媛 **?녿떎**.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃)**: assignee ?꾩젽 1媛?= 寃??**10??*. assignee + issue ???꾩젽 = **20??*(洹몄쨷 10???꾩쟾 以묐났).
  `level`/`role`/`team` ?꾩젽? 媛곴컖 KVS 留덉뒪???ъ쟾 ?ㅼ틪 1~2?뚯뵫(A-7怨?怨깊빐吏꾨떎).
  ?꾩젽 `W` 媛???쒕낫??= resolver invoke `W` ????媛??怨좎젙鍮꾨룄 `W` 諛?A-6).
- **?섏젙 諛⑺뼢**: ??`getAssigneeStats`/`getIssueParticipantStats` 瑜?**1?⑥뒪 ?섏쿂 + 2吏묎퀎**濡??⑹튇??怨듯넻 ?섏쿂 寃⑸━ ?먯튃??留욊쾶 `projectDashboard` ?꾩슜 ?섏쿂 ?좎꽕). ???뚰겕濡쒓렇 ?꾩젽怨??숈씪?섍쾶 `Assignee:{projectId}` 10遺?KVS 罹먯떆瑜?遺숈뿬 ?꾩젽 媛꽷룹옱諛⑸Ц 媛?以묐났???≪닔?쒕떎.

## A-4. ???꾨즺 ?먯젙??諛곗튂留덈떎 ?꾨웾 fan-in ??KVS ?쎄린媛 諛곗튂 ?섏쓽 **?쒓낢**

`C:\CloudJira\moves-workforce\src\queue\consumer.js:240-249` (?몄텧遺 `:93`, `:154`, `:215`)

```js
const checkJobCompletion = async (appJobId, totalBatches) => {
    const batchResults = await Promise.all(
        Array.from({ length: totalBatches }, (_, i) =>
            jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
    const doneBatches = batchResults.filter(b => b?.done);
    if (doneBatches.length < totalBatches) return;   // ???遺遺??ш린??議곌린 return
```

**諛곗튂媛 ?섎굹 ?앸궇 ?뚮쭏??* ?꾩껜 諛곗튂 ?곹깭瑜??ㅼ떆 ?쎈뒗?? ?꾩슂?됱? `B`?몃뜲 ?ㅼ젣??`B횞B`.

- **鍮꾩슜**: `KVS_reads = B 횞 (B+1) ??B짼`
  - ?ъ슜???묒? ?낅줈??(`UserService.js:587` `chunk(items, 20)` ??`B = ceil(U/20)`):
    U=1,000 ??B=50 ??**2,550??* 쨌 U=5,000 ??B=250 ??**62,750??* 쨌 U=10,000 ??B=500 ??**250,500??*
  - 援щ룆 諛깊븘 (`SubscriptionBackfill.js` `BATCH_SIZE=50` ??`B = ceil(N/50)`):
    N=2,000 ??B=40 ??**1,640??* 쨌 N=10,000 ??B=200 ??**40,200??*
  - `concurrencyLimit`(3/2) ?뚮Ц???숈떆???щ윭 踰뚯씠 媛숈? fan-in???덈떎. ?ъ떆?꾧? ?쇰㈃ ???섏뼱?쒕떎.
- **?섏젙 諛⑺뼢**: 媛숈? ?뚯씪 怨꾩뿴??`getJobBatchService`(`JobService.js:73-80`)媛 ?대? ?곕뒗 `findByWhere('jobId', appJobId)` **?몃뜳??議고쉶 1??*濡?援먯껜(B>100?대㈃ 而ㅼ꽌 ?섏씠吏??꾩슂). ?먮뒗 ?꾨즺 ?먯젙??留덉?留?諛곗튂?먯꽌留??섑뻾.

## A-5. ?ы듃?대━????諛곗튂媛 **利앸텇 ?놁씠** ???꾨줈?앺듃 ??湲곌컙??留ㅼ씪 ?ы럹移?
- `C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:276-281`
- ?뚰겕濡쒓렇 珥덇낵遺?猷⑦봽: `C:\CloudJira\moves-workforce\src\resolver\resourceAnalysis\ResourceWorklogFetcher.js:35-50`

```js
const [projectUserRows, worklogs, scheduleRows, rawIssues] = await Promise.all([
    getProjectMemberRows(projectId),
    getResourceProjectWorklogs({ projectId, startDate, endDate, as: 'app' }),  // startDate = ?꾨줈?앺듃 ?쒖옉??    getProjectWorkersScheduleRepository({ projectId, startDate, endDate }),
    fetchAllProjectIssues({ projectId, coworkerFieldId, as: 'app' }),          // ?댁뒋 ?꾨웾
]);
```

"?댁젣 ?댄썑 蹂寃쎈텇" ?먯젙???대뵒?먮룄 ?녿떎. 蹂寃??щ?? 臾닿??섍쾶 紐⑤뱺 ?쒖꽦 ?꾨줈?앺듃瑜?**留ㅼ씪 ??湲곌컙 ?꾨웾 ?ш퀎??*?쒕떎.

- **鍮꾩슜 ??1???ㅽ뻾 = 1??**
  ```
  Jira = 誇_p [ 1(?뚰겕濡쒓렇 寃?? + ceil(I_p/100) + ceil(M_p/100) ]  +  誇_{i : w_i>20} ceil((w_i??0)/100)
  SQL  = 1 + 3P
  ```
  ???P=30, I_p??67, M_p??): 湲곕낯??= 30 횞 (1+2+1) = **120 Jira ?몄텧**, SQL 91.
  臾몄젣??留덉?留???씠?? ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋留덈떎 理쒖냼 1?뚭? 遺숆퀬 `w_i` ???꾨줈?앺듃媛 ?숈쓣?섎줉 ?⑥“ 利앷??쒕떎 ??  5,000 ?댁뒋 以?10%媛 20嫄?珥덇낵硫?**+500????*, 30%硫?**+1,500????*濡?湲곕낯??쓽 4~12諛곌? ?섏뼱 諛곗튂 鍮꾩슜??吏諛고븳??
  ??鍮꾩슜? **?꾨줈?앺듃 ?섎챸 ?대궡 留ㅼ씪 諛섎났**?쒕떎(2???꾨줈?앺듃硫?媛숈? ?뚰겕濡쒓렇瑜?730???ы럹移?.
- **?섏젙 諛⑺뼢**: ?ㅻ깄?룹뿉 `lastAggregatedAt` ???먭퀬 `updated >= lastAggregatedAt` 移댁슫??寃??1?뚮줈 臾대?寃??꾨줈?앺듃瑜?嫄대꼫?대떎. ?먮뒗 ?뚰겕濡쒓렇 議고쉶 李쎌쓣 利앸텇 李쎌쑝濡?醫곹엳怨??꾩쟻遺꾩? ?ㅻ깄?룹뿉 ?⑹궛 蹂댁〈?쒕떎.

## A-6. 沅뚰븳 媛??怨좎젙鍮꾧? **?붾㈃ 吏꾩엯 invoke ?섎쭔??怨깊빐吏꾨떎**

- `C:\CloudJira\moves-workforce\src\permission\permissionGuard.js:119-150` ??紐⑤뱺 guarded resolver媛 `resolvePrincipal` ?듦낵
- `C:\CloudJira\moves-workforce\src\permission\PrincipalResolver.js:207-215`, `:218`

```js
// :207-215 ??罹먯떆??buildPrincipal ??**?앸궃 ?ㅼ뿉留?* 梨꾩썙吏꾨떎
const cached = cache.get(accountId);
if (cached && cached.expireAt > Date.now()) return cached.value;
const principal = await buildPrincipal(accountId);   // ???숈떆 吏꾩엯 ???꾩썝???ш린濡??ㅼ뼱?⑤떎
cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });

// :218 ??鍮꼆dmin(??ㅼ닔)?먭쾶??Jira REST ?뺣났??臾댁“嫄? 洹몃━怨?users SQL(:255)怨?吏곷젹濡??좏뻾?쒕떎
const isAdmin = await isAdministrator();      // asUser GET /rest/api/3/mypermissions
```

30珥?L1 罹먯떆(`:62`)??**?붾㈃ 吏꾩엯 ?ъ씠**?먮쭔 ?ｊ퀬 **吏꾩엯 洹??쒓컙**?먮뒗 ?ｌ? ?딅뒗?? React Query媛 resolver瑜??숈떆??`S`媛??섎㈃ `S`媛??꾨? `buildPrincipal` ???덈떎.

- **鍮꾩슜(罹먯떆 誘몄뒪 1?뚮떦)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
  `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? = Jira **6??* + SQL **6??* + KVS **12??*媛 ?쒖닔 媛??怨좎젙鍮?
  洹??붾㈃ ?꾩껜 Jira ?몄텧 7??以?**6??86%)** 媛 媛?쒕떎.
- **?섏젙 諛⑺뼢(?④낵 ????**:
  1. `isAdministrator()` ? `getUserInfoService()` 瑜?`Promise.all` 濡?蹂묐젹?????뺣났 2????1??(?섏? ?낅┰).
  2. 罹먯떆 媛믪쓣 `Promise` 濡???ν빐 in-flight dedup. **??而⑦뀒?대꼫媛 媛덈━硫??ｌ? ?딅뒗??*(誘멸?利?李몄“) ??洹몃옒??1踰덉씠 癒쇱???
  3. admin ?먯젙??蹂꾨룄 吏㏃? TTL濡?遺꾨━??鍮꼆dmin 寃쎈줈??Jira ?뺣났???쒓굅.

## A-7. 留덉뒪???ъ쟾(role/level/skill/permission/status/holiday)???쒕쾭 罹먯떆媛 ?녿떎 ???붾㈃ 吏꾩엯留덈떎 ?꾨웾 ?ㅼ틪

`getTeamIndex()` 留?60珥?紐⑤뱢 TTL 罹먯떆瑜?媛뽯뒗??`backoffice/team/TeamTreeCache.js:95-104`). ?섎㉧吏???몄텧留덈떎 KVS瑜?移쒕떎.

| ?쒕퉬??| ?꾩튂 | 1??KVS 鍮꾩슜 |
|---|---|---|
| `getRoleListService` | `backoffice\role\RoleService.js:36` | `findAll()` 1 |
| `getLevelListService` | `backoffice\level\LevelService.js:86` | `findAll()` 1 |
| `getSkillListService` | `backoffice\skill\SkillService.js:58` | `findAllPaged` **2** (?꾨━??141嫄? |
| `getProjectStatusListService` | `backoffice\projectStatus\ProjectStatusService.js:78` | 1 |
| `getPublicHolidayListService` | `backoffice\publicHoliday\PublicHolidayService.js:34` | 1 |
| `getSettingDataService` | `backoffice\setting\SettingService.js:11` | `findById` 1 |

- **鍮꾩슜 ??`/backoffice/users` 吏꾩엯**: `roleLevelMap()`(`UserService.js:151-171`)??`getUserListWithPaging`쨌`getUserMetaCount`(`:785`) ??寃쎈줈?먯꽌 媛곴컖 ?몄텧?섍퀬, ?꾨줎?멸? `getRoleList`/`getLevelList`/`getPermissionList` 瑜????낅┰ ?몄텧 ??**role 3 + level 3 + permission 3 = KVS 9??*(?꾩슂遺?3??.
- **鍮꾩슜 ??`/resource` ?몃젰?꾪솴 吏꾩엯**: `buildPeopleContext`(`ResourceManagementService.js:59-77`)媛 role 1 + level 1 + skill 2 + settings 1 + rollup 1 = 6?? ?꾨줎??`SkillMultiSelect.jsx:34` 媛 `getSkillList` **2????*(諛⑷툑 ?쒕쾭媛 ?쎌? 寃껉낵 ?숈씪 ?곗씠?? = **9?? 洹몄쨷 3???쒖닔 以묐났**.
- **鍮꾩슜 ???꾨줈?앺듃 ??쒕낫??*: `getLevelChartData`/`getRoleChartData`(`ProjectDashboardService.js:213-231`)媛 ?꾩젽留덈떎 ?몄텧 ??level/role ?꾩젽 `W` 媛쒕㈃ `findAll` **W??*. 媛숈? ?뚯씪 `:114-120` ??`salaryPolicy` ??"猷⑦봽 諛?1??濡?紐낆떆?곸쑝濡??몄씠?ㅽ똿?덈뒗??level/role? ?⑥븯??
- **?섏젙 諛⑺뼢**: `TeamTreeCache` ? ?숉삎??紐⑤뱢 ?ㅼ퐫??60珥?TTL 罹먯떆瑜?role/level/skill/permission/status/holiday/setting???꾩엯. ?꾨? ?蹂寃??ъ쟾?닿퀬 60珥?stale ?섏슜 ?좊?媛 ?대? ?덈떎. ?곌린 寃쎈줈??`loadTeamIndexFresh` 泥섎읆 罹먯떆瑜??고쉶?쒕떎.

## A-8. `WHERE BIN_TO_UUID(p.project_id) = ?` ??PK ?몃뜳?ㅻ? ?⑥닔濡?臾대젰??
`C:\CloudJira\moves-workforce\src\rdb\query\ProjectDashboard.js:16`

```sql
FROM project p LEFT JOIN projectusers pu ON p.project_id = pu.project_id
WHERE BIN_TO_UUID(p.project_id) = ?          -- ???몃뜳??而щ읆???⑥닔瑜??뚯썙 鍮꾧탳
GROUP BY p.project_id
```

?몃뜳??而щ읆???⑥닔濡?媛먯떥硫?PK瑜?紐??꾨떎. **???꾩껜?먯꽌 ????怨노쭔** ???뺥깭?????섎㉧吏 ??荑쇰━??`project_id = UUID_TO_BIN(?)` 濡??몃뜳?ㅻ? ?꾨떎(`grep "WHERE BIN_TO_UUID" src/rdb` ?좎씪 留ㅼ튂, 寃利??꾨즺).

- **?몄텧遺 4怨?* ???꾨줈?앺듃 ?곸꽭??**??쒕낫?쑣룸퉬?㈑룹쭊泥숇룄쨌湲됱뿬 ??吏꾩엯留덈떎** 諛쒖깮?쒕떎:
  `ProjectDashboardController`(?붿빟 移대뱶) 쨌 `ProjectCostService.js:102` 쨌 `ProjectProgressService.js:58` 쨌 `ProjectUsersService.js:171`
- **鍮꾩슜**: ?몄텧 1?뚮떦 `project` ?????ㅼ틪 + `projectusers` ?꾨웾 議곗씤 ???꾪꽣. ?꾨줈?앺듃 100媛?횞 ?됯퇏 ?몄썝 20紐낆씠硫?**1?됱쓣 ?살쑝????2,000?됱쓣 議곗씤**?쒕떎(?뺤긽?대㈃ …24165 tokens truncated…(`hooks/usePermissionCatalog.js:32-41` ??`enabled` 媛???놁쓬) ??**?섏씠吏 吏꾩엯 1?뚮떦 `getPermissionCatalog` 1 invoke ??퉬** |
| P3-24 | `pages/myWork/myProject/MyProjectList.jsx:95-97` | `projects.filter(...)` 媛 useMemo ?놁씠 留??뚮뜑, `searchQuery.toLowerCase()` 瑜???ぉ留덈떎 ?ъ깮??|
| P3-25 | `utils/jiraApi/issue/getJqlIssue.js:33` ??`pages/myWork/MyLogSummary.jsx:32` | 媛쒖닔留??꾩슂?쒕뜲 `maxResults`/`fields` 誘몄??뺤쑝濡?湲곕낯 50嫄댁쓣 諛쏆븘 `.length` 瑜??대떎 ??**51嫄??댁긽?대㈃ KPI ?レ옄媛 50?먯꽌 硫덉텣??*(?뺥솗??臾몄젣 寃명븿) |
| P3-26 | `pages/project/modal/ProjectModal.jsx:99-107,129` | `staleTime:0` ?쇰줈 ???뚮쭏??`findProjectById` ?ъ“???몄쭛 紐⑤떖?대씪 ?섎룄?????덉쓬). `:129` `Promise.all(userSet.values().map(...))` ??Set ?댄꽣?덉씠?곗뿉 `.map` ??嫄곕뒗 ?뺥깭(ES2025 Iterator Helpers)???고??꾩뿉 ?곕씪 throw 媛?????깅뒫 異뺤? ?꾨땲??湲곕줉 |
| P3-27 | `pages/myPage/hooks/useMyPermissionMatrix.js:34-59` | `sections`(以묒꺽 map) + `all`(flatMap) + `summary`(filter 3??媛 留??뚮뜑 ?ㅽ뻾?섍퀬 ??`sections` 諛곗뿴??諛섑솚??`MyPermissionSection` ????긽 由щ젋?? 移댄깉濡쒓렇 14媛??섏??대씪 ?ㅻ퉬?⑹? ?묐떎 |
| P3-28 | `pages/resource/assignment/projects/ProjectCardList.jsx:64` | `cards.map(...)` ??硫붾え 諛?+ `ProjectCard` 誘몃찓紐???蹂대뱶 由щ젋?붾쭏????移대뱶 ?щ젋???섏떗 ???곹븳) |
| P3-29 | `keepPreviousData: true` **7怨?* ??`useProjectResourceMembers.js:101,159`, `cost/useProjectCostSummary.js:43`, `dashboard/summary/SummaryPanel.jsx:19`, `progress/ProgressPage.jsx:42`, `salary/SalaryManagementPage.jsx:77`, `user/ProjectUserPanel.jsx:73` | `@tanstack/react-query@5.95.2` ?먯꽌 ??**遺덈━???듭뀡? ?쒓굅**?먮떎(v5??`placeholderData: keepPreviousData` ?⑥닔 ?뺥깭留??좏슚 ??`useWorkListQueries.js:119`쨌`useLevelList.js:56` ???щ컮瑜???. ?ㅽ듃?뚰겕 ??퉬???놁쑝???섏씠吏 ?꾪솚留덈떎 ?뚯씠釉붿씠 ?ㅼ펷?덊넠?쇰줈 鍮꾩썙吏怨?10??湲됱뿬??InlineEdit+Select ?ы븿 ~60?)???꾨웾 ?щ쭏?댄듃?쒕떎 |
| P3-30 | `analysisReport/resource/hooks/useProjectResourceMembers.js:87`, `salary/SalaryManagementPage.jsx:74` | `enabled` ?꾨씫(?뺤젣 荑쇰━ `:158` ?먮뒗 ?덉쓬) |
| P3-31 | `pages/resource/overview/ResourceOverviewTable.jsx:41`, `assignment/people/CompanyResourceTable.jsx:47`, `organization/OrganizationTab.jsx:279`, `myPage/sections/MyIssuesPanel.jsx:102` | `head` 媛앹껜媛 留??뚮뜑 ?덈줈 ?앹꽦 ??`CommonTable`??TableSurface` ??而щ읆 ???숆껐 怨꾩륫???ъ떎?됰맆 ?ъ? |
| P3-32 | `pages/projectDetail/user/IssueAssignSelect.jsx` | **?곕뱶肄붾뱶** ??`static/ui/src` ?꾩뿭 import 0嫄댁씠怨? 鍮꾨룞湲??꾨땶 `Select` ??`loadOptions`/`defaultOptions`(`:51-52`)瑜??섍꺼 諛곗꽑?대룄 ?듭뀡?????щ떎. ?댁븘 ?덈뒗 寃??寃쎈줈濡??ㅼ씤?섏? ?딅룄濡?湲곕줉 |
| P3-33 | `utils/useRoleLevelPermissions.js:10-54` vs `:56-84` | `useRoleLevelPermissions` ? `useRoleLevel` ??roles/levels 荑쇰━瑜?**湲??洹몃?濡?蹂듬텤**?덈떎. 荑쇰━?ㅺ? 媛숈븘 ?ㅽ듃?뚰겕??怨듭쑀?섏?留??좎?蹂댁닔 ?댁쨷?붿씠怨? `enabled` 媛?쒓? ?놁뼱 `components/search/UserSearchFilter.jsx:54` 泥섎읆 ?꾪꽣 UI 媛 蹂댁씠湲곕쭔 ?섎㈃ invoke 3?뚭? ?섍컙??|
| P3-34 | `components/chart/echart/ThemedECharts.js` ?뚮퉬泥??꾨컲 | `echarts-for-react` ??`node_modules/echarts-for-react/lib/core.js:52` ?먯꽌 `isEqual(pick(props, ['option', ...]))` 濡?**源딆? 鍮꾧탳**瑜??쒕떎. 媛믪씠 媛숈쑝硫?`setOption` ? 嫄대꼫?곗?留?**series ?곗씠??諛곗뿴 ?꾩껜瑜?留??뚮뜑 ?쒗쉶**?쒕떎. `option` ???몃씪??議곕┰???섍린???뚮퉬泥섍? ?⑥븘 ?덉쑝硫?洹몃쭔??怨깊빐吏꾨떎(??ㅼ닔??硫붾え???덉쓬 ???뚰넻怨쇈?李몄“) |
| P3-35 | `polling/JobPollingManager.jsx:24` | `const { jobIds, forgetJob, cleanupJob, init } = useJobStore();` ????됲꽣 ?놁씠 ?ㅽ넗???꾩껜 援щ룆. ??猷⑦듃???곸떆 留덉슫?몃릺吏留?`useJobStore` ?곹깭媛 `jobIds` ?섎굹肉먯씠???ㅼ넀?대뒗 誘몃??섎떎. **怨듭슜 ?덉씠?댁뿉????됲꽣 ?놁씠 援щ룆?섎뒗 ?좎씪??吏??*?대씪 湲곕줉留??④릿??|
| P3-36 | `components/table/TableSurface.jsx:47` | 濡쒕뵫 以?`buildSkeletonRows(head, skeletonRowCount)`(`skeletonRows.js:21`)媛 留??뚮뜑 ??諛곗뿴??留뚮뱾??`adaptedRows` 硫붾え瑜?**?뺤젙?곸쑝濡?* 臾댄슚?뷀븳??P1-13 ??濡쒕뵫 援ш컙 鍮꾩슜) |

---

## ?듦낵 (?뺤씤?덇퀬 臾몄젣 ?놁쓬)

> 移⑤У = 誘멸?利??ㅻ룆??留됯린 ?꾪빐 紐낆떆?쒕떎.

| 異?| ?뺤씤 ?댁슜 | ?먯젙 |
|----|----------|------|
| **?뚮뜑 猷⑦봽 ??`invoke()` (吏꾩꽦 N+1)** | 582 ?뚯씪 ??踰붿쐞?먯꽌 `.map()`/`forEach` **?뚮뜑 猷⑦봽** ?덉쓽 `invoke`/`requestJira` **0嫄?*. P1-4 ??`getUser` ???꾨? queryFn ?대? 猷⑦봽(?섏젙 ??곸씠吏留??뚮뜑 猷⑦봽???꾨땲?? | **?듦낵** |
| **`requestJira` 寃쎈줈 吏묒쨷??* | ?꾨줎?몄쓽 Jira 吏곸젒 ?몄텧? `utils/jiraApi/requestJira.js:168` ?⑥씪 吏?먯쓣 ?듦낵?쒕떎. ?곕컻??`requestJira` ?몄텧 ?놁쓬 | **?듦낵** |
| **肄붾뱶 ?ㅽ뵆由ы똿 援ъ“** | `App.jsx` ?쇱슦??15媛?+ `constants/tabs.js` ??13媛?+ `ProjectWorkPanel.jsx` 酉?2媛쒓? `React.lazy`. 鍮뚮뱶 ?곗텧臾쇱뿉??**echarts(1,112KB 泥?겕)쨌xyflow쨌svar-gantt쨌exceljs쨌react-grid-layout쨌kanban-kit ??main ??0諛붿씠??* ?뺤씤 ??遺꾨━ ?먯껜???섎룄?濡??숈옉 以묒씠???덉쇅??P1-1 ???⑹뼱由? | **?듦낵** |
| **???쒖꽦-only ?뚮뜑** | `components/tabs/CommonTab.jsx:70-81` ???쒖꽦 ??1媛쒕쭔 ?뚮뜑 + Suspense/ChunkErrorBoundary 寃쎄퀎 ?뚯쑀. `MainPageTabs`/`ProjectDetailTabs` 媛 ?대? ?ъ슜 | **?듦낵** (?덉쇅 2嫄? P1-2 `ResourcePage`, `IssueAddModal`) |
| **?대쭅 諛깃렇?쇱슫???뺤?** | `pages/project/ProjectPage.jsx:30`(5遺?쨌`projectKanban/ProjectKanbanBoard.jsx:85`(3遺?? `refetchIntervalInBackground` 誘몄꽕????`query-core/queryObserver.js:215` ??`focusManager.isFocused()` 媛?쒕줈 諛깃렇?쇱슫????뿉???뺤?. `ProjectPage.jsx:31` ???대떦 ?듭뀡??**二쇱꽍 泥섎━**??寃껊룄 ?섎룄?? ????? `CommonTab` ???숈떆???댁븘 ?덉????딅떎 | **?듦낵** (?덉쇅: P1-7 `JobPollingManager` ??raw setInterval ?대씪 ??蹂댄샇 諛? |
| **紐⑤떖 ?곗씠???좊줈??* | `components/modal/CommonModal.jsx:26` ??`{isOpen && children}` ?쇰줈 寃뚯씠????`TeamSelect`쨌`ProjectUserPanel`쨌`ProjectIssuePanel`쨌`RequiredSkillEditor` ?깆씠 ?닿린 ?꾧퉴吏 留덉슫?????? `projectKanban/KanbanCard.jsx:188,194` 媛 移대뱶留덈떎 紐⑤떖 2媛쒕? ?뚮뜑?섏?留?媛숈? ?댁쑀濡?移대뱶??invoke 0 | **?듦낵** (?덉쇅: P3-23 `UserPage` ??紐⑤떖 2醫낆? `CommonModal` 諛뽰뿉???낆쓣 ?몄텧) |
| **`enabled` 媛??* | resource/portfolio/myPage ???낆씠 沅뚰븳쨌?앸퀎??媛??蹂댁쑀(`canRead`, `canReadReport`, `!!accountId && projectIds.length>0`, `!!teamKey`, `!!projectId && enabled`). myWork/backoffice ??`useMyWorklogList.js:28`, `useMyIssueTable.js:23`, `WorklogPage.jsx:104,134`, `ProjectDetailDrawer.jsx:85,104,114`, `useSkillQuickAddModal.js:31`, `useUserEditModal.js:86,114`, `useTeamMemberAssignModal.js:44` ?뺤긽 | **?듦낵** (?꾨씫 2嫄?P3-30) |
| **ECharts `option` 硫붾え??* | portfolio ?꾩젽 13醫?+ teamAnalytics 6醫?+ allocation + myPage 3醫?+ `cost/*`쨌`progress/ProgressSCurve.jsx:127`쨌`analysisReport/issue/IssueAnalysisChart.jsx:252`쨌`taskHistory/TaskHistoryBurnup.jsx:70`쨌`dashboard/ChartTemplate.js:160` **?꾨? `useMemo` + ?щ컮瑜?deps**. `t`(`stores/useI18nStore.js:4-13`)? `isDark` ???덉젙 李몄“ | **?듦낵** (deps 媛 留ㅻ쾲 諛붾뚮뒗 ?덉쇅 2嫄? P1-10, P3-4) |
| **ECharts ?뚮쭏 ?깅줉 ?꾩튂** | `components/chart/echart/ThemedECharts.js:15` 媛 `utils/echartsTheme`(=`import * as echarts`) 瑜??뚯쑀?섍퀬 `App.jsx:3-7` ??吏꾩엯遺 import 瑜?湲덉??섎뒗 洹쇨굅瑜?紐낆떆. 鍮뚮뱶?먯꽌 echarts 0諛붿씠??in main ?쇰줈 ?ㅼ쬆??| **?듦낵** |
| **Zustand ??됲꽣 踰붿쐞** | ?ㅽ넗????됲꽣媛 **??媛앹껜/諛곗뿴??諛섑솚?섎뒗 吏??0嫄?*(`s => s.t`, `s => s.canRead('X')` ???ㅼ뭡?쇰쭔). 愿묒뿭 ?щ젋???좊컻 ?놁쓬. projectDetail ?몃━??React Context ???녿떎 | **?듦낵** |
| **?곌린 ??罹먯떆 ?⑥튂 洹쒖빟** | `projectDetail/assignment/*`(`useAssignWorkItem.js:17,45-51` ??invalidate 湲덉? + `refetchOnWindowFocus:false`), `gantt/useGanttFolderMutations.js:16-21`, `useGanttMutations` ???쇱젙/遺紐?留곹겕 3醫?`:156-158` 洹쇨굅 二쇱꽍), `ProjectIssueTable` ??`patchGroupPage`, `resource/assignment/patchAssignmentCache.js:6,95` ?꾨? 以??| **?듦낵** (?꾨컲 2嫄? P1-5 `useUpdateCoworkers`, P2-5 ?뚰겕濡쒓렇 ?쒕∼) |
| **?숆????낅뜲?댄듃** | `projectKanban/useKanbanMutations.js` 6醫?紐⑤몢 `onMutate` ?숆? ?⑥튂 + `onError` 濡ㅻ갚 + ?뺥솗 踰붿쐞 invalidate(`utils/queryKey/projectKeys.js:25-39`) | **?듦낵** |
| **愿묒뿭 invalidate ?⑤컻** | `backoffice/page/setting/SalaryPolicySetting.jsx:116-121`(6??? `backoffice/page/team/TeamPage.jsx:103-111`(5??? **?대떦 ?섏씠吏???쒖꽦 愿痢≪옄媛 ?놁뼱 stale 留덊궧?쇰줈 ?앸궃??*(?ㅼ젣 ?ъ“??0~1??. `TeamPage.jsx:106-108` ??洹쇨굅 二쇱꽍???덈떎. `utils/queryKey/salaryBandInvalidation.js` ???꾩슜 ?뚯뒪?몃줈 怨좎젙 | **?듦낵** (?ㅼ젣 ??뙆 2嫄? P2-3 湲됱뿬, P2-4 ?ъ슜?? |
| **荑쇰━???⑺넗由?怨꾩빟** | ?몃씪??諛곗뿴 由ы꽣??0嫄? `utils/queryKey/queryKeyContract.test.js:24` 媛 `invalidateQueries|setQueryData|...(\[` ?⑦꽩???뺢퇋?앹쑝濡?湲덉? | **?듦낵** |
| **?쒕쾭 ?섏씠吏?* | `backoffice/page/user/UserListPaging.jsx:33`(`getUserListWithPaging`), `pages/project/ProjectPage.jsx:26`(page/pagesize), `IssueAnalysisTable`쨌`TaskHistoryTable`(而ㅼ꽌), `getProjectSalaryList`(page), `findProjectusersByProjectId`(page/pageSize), `assignment/ProjectGroupCard.jsx:55-56,127-134`(1??lazy 留덉슫????`display` ?좉? ???묎린/?닿린 ?ъ“??0) ?뺤긽. **?꾨웾 ?섏떊 ???대씪 ?섏씠吏뺤? `useTeamMemberAssignModal.js:54-86` 1嫄대퓧?닿퀬, `:19-25` 二쇱꽍??"?쒕쾭 ?섏씠吏?寃쎈줈??沅뚰븳 異뺤씠 ?щ씪 ?????녿떎"??洹쇨굅媛 臾몄꽌??*???덈떎 | **?듦낵** |
| **媛?곹솕/?덈룄??* | `resource/assignment/people/CompanyResourceTable.jsx:45` 媛 `useInfiniteSlice(rows,{initial:30,step:30})`. `CommonTable`??TableSurface`?묭ynamicTable ? `rowsPerPage` 濡?DOM ???쒗븳. (臾몄젣??DOM ???꾨땲??洹??욌떒 議곕┰ ??P1-12) | **?듦낵** |
| **?붾컮?댁뒪 ?곸슜 ?꾪솴** | ?뺤긽 10怨???`AssignmentPage.jsx:108-109`(200ms), `ProjectIssuePanel.jsx:42`쨌`IssueAddModal.jsx:35`쨌`IssueAnalysisTable.jsx:164`쨌`TaskHistoryTable.jsx:47`쨌`useSubscriptionPreview.js:26`(300ms), `ProjectHeader.jsx:30`(300ms), `ProjectIssueAssignSelect.jsx:78`(400ms), `DropdownJql.jsx:50`(500ms), `ProjectAssignmentBoard.jsx:77`(200ms), `ProjectUserSelect.jsx:60,109`(1000ms) | **?듦낵** (?꾨씫 5怨? P1-8, P1-12) |
| **Jira 沅뚰븳 議고쉶 罹먯떛** | `utils/jiraApi/useJiraEditGuards.js:26-27,51-71` 紐⑤뱢 TTL 5遺?罹먯떆 ??裕ㅽ뀒?댁뀡留덈떎 ?ъ“???놁쓬 | **?듦낵** |
| **?숈씪 resolver 以묐났 ?몄텧 (??怨듭쑀)** | `getSettingData` 17媛쒖냼 ?꾨? `settingKeys.detail()` 怨듭쑀, `getResourceOverview` 4媛???怨듭쑀(`resourceKeys.overview()`), `getPortfolioDashboard` 瑜?`/dashboard` ? ? 遺꾩꽍 ??씠 怨듭쑀(`useTeamAnalyticsData.js:29-33,83` ??罹먯떆 媛??뺥깭源뚯? 留욎땄), `ganttKeys.data` 瑜?GanttPage/ProjectTreeView 媛 怨듭쑀(酉??꾪솚 ?ъ“??0) | **?듦낵** (staleTime 遺덉씪移섎쭔 P2-7, `view.getContext()` 3以??ㅻ쭔 P2-9) |
| **? 吏묎퀎 ?뚭퀬由ъ쬁 蹂듭옟??* | `utils/team/` ??`teamMetricsByTeam`쨌`rollupTeamTree`쨌`aggregateByTeam`쨌`projectTeamMatrix`쨌`compositionByTeam` ?꾨? ?⑥씪 ?쒗쉶 + Map 湲곕컲. `rollupTeamTree` ??O(teams) + ?ъ씠??諛⑹뼱(`visited`) 蹂댁쑀 | **?듦낵** (以묐났 ?몄텧留?P2-8, P3-14) |
| **`projectDetail/assignment/` ??異?* | 蹂대뱶 1 invoke(`useWorkAssignmentBoard.js:22-34`), ?? `poolOpen && meta?.poolAvailable` ?⑤뵒留⑤뱶(`AssignmentPage.jsx:96`), ???뚯깮媛?硫붾え?? ???몃뱾??`useCallback`, ?쒖닔 ?좏떥??誘몃?寃????먮낯 李몄“ 諛섑솚 ??**由ы룷 ??紐⑤쾾 ?щ?** | **?듦낵** |
| **愿怨꾨룄 ?⑤뵒留⑤뱶 濡쒕뱶** | `AllocationGraphSection` ? `graphOpen` ???뚮쭔 留덉슫????`getResourceAllocationGraph` 媛 ?쇱튌 ?뚮쭔 諛쒖궗(`ProjectAssignmentBoard.jsx:336-340`) | **?듦낵** |
| **FullCalendar 由ъ궗?댁쫰 泥섎━** | `components/calendar/FullCalendar.jsx:27-38` ??ResizeObserver ??**?먭린 ?몄뒪?댁뒪?먮쭔** `getApi().updateSize()` 瑜??몄텧?쒕떎(?꾩뿭 ?붿뒪?⑥튂 ?꾨떂) | **?듦낵** |
| **1?뚯꽦 ?꾩뿭 resize ?붿뒪?⑥튂** | `components/card/CardFullscreen.jsx:25`, `components/card/collapse/CardCollapseContext.jsx:55`, `portfolio/widgets/ChartBox.jsx:19`, `resource/teamAnalytics/TeamChartBox.jsx:32` ???꾨? `setTimeout` 1?뚯꽦(100~200ms) ???곗냽 諛쒗솕 ?놁쓬 | **?듦낵** (?곗냽 諛쒗솕 1嫄? P1-11) |
| **以묐났 ?좏떥/?섏〈??* | `from 'moment'` 吏곸젒 import **0嫄?* ??moment ??`@fullcalendar/moment-timezone` ?꾩씠 ?섏〈?깅퓧?닿퀬 ??肄붾뱶??`dayjs` 濡??듭씪. **?댁쨷 ?좎쭨 ?쇱씠釉뚮윭由??ъ슜 ?놁쓬.** ECharts ??`ThemedECharts` ?⑥씪 吏꾩엯 | **?듦낵** |
| **?ㅽ넗??以묐났 濡쒕뱶 媛??* | `stores/usePermissionStore.js:37` 쨌 `stores/useLicenseStore.js:82` ??`_loaded`/`_loading` 媛???뺤뿉 `App.jsx:72-78` ???댁쨷 `useEffect`(StrictMode ?댁쨷 ?ㅽ뻾 ?ы븿)?먯꽌??invoke 1??| **?듦낵** |
| **`adaptRows` 臾대?寃?理쒖쟻??* | `components/table/tableSort.js:191` ??`if (!needsRewrite) return rows` 媛 ?ㅼ젣濡??숈옉?쒕떎. `sortValue` 瑜??곕뒗 ?쒓? 4媛쒕퓧(`StorageProjectList`, `StorageTableList`, `PortfolioProjectTable`, `ResourceAnalysisTable`)?대씪 **O(?됁쀬뿴) 媛앹껜 ?꾨웾 ?ы븷??寃쎈줈??嫄곗쓽 ?吏 ?딅뒗??* ??P1-13 ???ㅻ퉬?⑹? ?ㅼ틪쨌?꾩떆諛곗뿴 履쎌씠??| **?듦낵** |
| **`hooks/` ??staleTime쨌enabled** | `useProjectTeams`(60s + enabled), `useTeamOptions`(5m + enabled), `useTeamUserCandidates`(5m + enabled), `usePermissionCatalog`(10m + gcTime), `usePublicHolidayList`(30m), `useJiraEditGuards`(5m + 紐⑤뱢 TTL 罹먯떆) ?뺤긽. `useTeamMemberCandidates` ??`staleTime:0` ? `:37` ??洹쇨굅媛 紐낆떆??**?섎룄??* ?좏깮 | **?듦낵** |
| **`CardFullscreen` ?댁쨷 ?뚮뜑 ?놁쓬** | `components/card/CardFullscreen.jsx:29` ??`if (!isOpen) return null` 濡??ロ엺 ?숈븞 children ??洹몃━吏 ?딅뒗??`Card.jsx:82` 媛 ??긽 ?뚮뜑?섎뒗 寃껋쿂??蹂댁씠???ㅻ퉬??0). **P2-15 ???쒕줈???댁쨷 留덉슫?몄????ㅻⅨ 援ъ“** | **?듦낵** |
| **`useInfiniteSlice`** | `utils/useInfiniteSlice.js` ??IntersectionObserver ?뺣━쨌?섏〈???뺤긽 | **?듦낵** |
| **`JobPollingManager` ?대? 諛⑹뼱** | `inFlightRef` 以묐났 ?몄텧 李⑤떒 쨌 `nextPollAtRef` 吏??諛깆삤??쨌 `intervalsRef` 以묐났 ?명꽣踰?諛⑹? 쨌 ?몃쭏?댄듃 ?뺣━(`:40-44`) 紐⑤몢 媛뽰땄 ??寃고븿? **諛깃렇?쇱슫??誘몄젙吏? 醫낅즺 議곌굔**(P1-7)肉?| **?듦낵** |

---

## 誘멸?利?(??媛먯궗濡??뺤씤?????녿뒗 寃?

| ??ぉ | ?ъ쑀 |
|------|------|
| P1-1 ??**gzip ?덇컧???뺥솗移?* | ?먮낯 諛붿씠??洹??1,261KB / 34.1%)? ?뚯뒪留듭쑝濡??뺤젙?덉쑝?? gzip ? 肄섑뀗痢좊퀎 ?뺤텞瑜좎씠 ?щ씪 ?ㅼ젣 lazy 遺꾨━ ??`node scripts/check-bundle-budget.js` 瑜??ㅼ떆 ?뚮젮???뺤젙?쒕떎. 蹂몃Ц??250~300KB ??鍮꾨? 異붿젙移섎떎 |
| 媛???ぉ??**?ㅼ젣 泥닿컧 吏??ms)** | ?뺤쟻 遺꾩꽍?대씪 ?몄텧 ?잛닔쨌?щ젋??踰붿쐞쨌諛붿씠?몃쭔 ?뺣웾?뷀뻽?? ?꾨줈?뚯씪???ㅼ륫(React DevTools Profiler / Performance ??? 誘몄닔??|
| ????곗씠???쒕굹由ъ삤??**?ㅼ젣 ?곗씠??洹쒕え** | 500紐?議곗쭅쨌2,000 ?댁뒋쨌50 ?꾨줈?앺듃 ?깆? 肄붾뱶???곹븳 ?곸닔(`USER_MAX=100`, `MAX_ISSUES=2000`, `MAX_GRAPH_PROJECTS=15`, ? 500)?먯꽌 媛?몄삩 媛믪씠?? ?댁쁺 ?ъ씠?몄쓽 ?ㅼ젣 遺꾪룷??誘명솗??|
| Forge iframe ?먯꽌 `refetchOnWindowFocus` ??**?ㅼ젣 諛쒗솕 鍮덈룄** | Jira ?섏씠吏? iframe ?ъ씠 ?ъ빱???꾪솚??`focusManager` ???대뼸寃??≫엳?붿???諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂. ?꾩젣 (a) ??鍮꾩슜? "諛쒗솕?쒕떎硫???議곌굔遺??|
| `EchartPanel` ??ResizeObserver **?섎㉨??猷⑦봽 ?ㅼ옱 ?щ?** | 肄붾뱶 寃쎈줈??媛?ν븯??李⑦듃 resize ??而⑦뀒?대꼫 ?ш린 蹂?????듭?踰??щ컻??, ?ㅼ젣濡?臾댄븳 猷⑦봽???ㅼ뼱媛?붿???釉뚮씪?곗? ?ㅼ륫 ?꾩슂. 由ъ궗?댁쫰 利앺룺(N媛?李⑦듃 ?숈떆 ?ъ륫?? ?먯껜??肄붾뱶濡??뺤젙 |
| ?뚯뒪?맞룸퉴???ㅽ뻾 | ??媛먯궗??**?쎄린 ?꾩슜**?대씪 `npm test`쨌`npm run build` 瑜??덈줈 ?뚮━吏 ?딆븯?? 踰덈뱾 ?섏튂??湲곗〈 `build/` ?곗텧臾?2026-08-12 15:34, `main.4db70f69.js` = raw 3,701,918B / gzip 898,285B / ?덉궛 950,000B) 湲곗??대떎 |
| P1-13 ??Atlaskit ?ъ젙?ъ씠 **?ㅼ젣濡??쇰쭏???먯＜ 諛쒗쁽?섎뒗吏** | 肄붾뱶??`getSortedRows` ??`sortKey` 媛 ?덉쓣 ?뚮쭔 ?뺣젹?쒕떎(?뺤씤 ?꾨즺). 利?"?ъ슜?먭? ?뺣젹 ?ㅻ뜑瑜??대┃?????먯꽌留?諛쒗쁽?섎뒗?? ?ㅼ궗?⑹뿉???뺣젹??耳???梨??ㅻ옒 癒몃Т??鍮꾩쑉? 誘명솗?몄씠?? **?뺣젹??耳쒖? ?딆? ?쒖뿉?쒖쓽 鍮꾩슜(?곕━ 履?`resolveSortableColumns`/`adaptRows` ?ъ떎??? 議곌굔 ?놁씠 諛쒖깮**?섎?濡???ぉ ?먯껜???깅┰?쒕떎 |
| ?쒓? IME 議고빀 以?`onInputChange` **?ㅼ젣 諛쒗솕 ?잛닔** | P1-8쨌P2-19 ??"8~11????議고빀 以묎컙 ?④퀎媛 留ㅻ쾲 諛쒗솕?쒕떎??媛?뺤씠?? 釉뚮씪?곗?쨌IME 議고빀???곕씪 ?ㅻⅤ誘濡??ㅼ륫 ?꾩슂(?붾컮?댁뒪 ?곸슜????뱀꽦? 媛?뺢낵 臾닿??섍쾶 ?깅┰) |



Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_BACKEND.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:321
+ ... TEND_2026-08-12.md'; Get-Content -Raw 'FIX_STAGE3_BACKEND.md'; Get-Co ...
+                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...AGE3_BACKEND.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 
Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_FRONTEND.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:363
+ ... STAGE3_BACKEND.md'; Get-Content -Raw 'FIX_STAGE3_FRONTEND.md'; Get-Co ...
+                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...GE3_FRONTEND.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 
Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_BUNDLE.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:406
+ ... Raw 'FIX_STAGE3_FRONTEND.md'; Get-Content -Raw 'FIX_STAGE3_BUNDLE.md'
+                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...TAGE3_BUNDLE.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

 exited 1 in 1437ms:

Name                    Length FullName                                                                 
----                    ------ --------                                                                 
03_verify_stage12.md     25491 C:\CloudJira\moves-workforce\_workspace\perf-audit\03_verify_stage12.md  
BACKEND_2026-08-12.md    50818 C:\CloudJira\moves-workforce\_workspace\perf-audit\BACKEND_2026-08-12.md 
CODEX_REVIEW_RFC187.md 1046630 C:\CloudJira\moves-workforce\_workspace\perf-audit\CODEX_REVIEW_RFC187.md
CODEX_REVIEW_STAGE3.md   84524 C:\CloudJira\moves-workforce\_workspace\perf-audit\CODEX_REVIEW_STAGE3.md
FIX_STAGE1_BACKEND.md     4467 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE1_BACKEND.md 
FIX_STAGE1_FRONTEND.md    5734 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE1_FRONTEND.md
FIX_STAGE2_BACKEND.md    21854 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE2_BACKEND.md 
FIX_STAGE2_FRONTEND.md   15741 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE2_FRONTEND.md
FIX_STAGE3_BACKEND.md    10864 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_BACKEND.md 
FIX_STAGE3_BUNDLE.md      8823 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_BUNDLE.md  
FIX_STAGE3_FRONTEND.md    8770 C:\CloudJira\moves-workforce\_workspace\perf-audit\FIX_STAGE3_FRONTEND.md
FRONTEND_2026-08-12.md   76512 C:\CloudJira\moves-workforce\_workspace\perf-audit\FRONTEND_2026-08-12.md
# 諛깆뿏??src/) 鍮꾪슚?㉱룰퀬鍮꾩슜 濡쒖쭅 媛먯궗 ??2026-08-12

- ????뚯뒪: `develop` @ `f6e521c` 湲곗? ?묒뾽 ?몃━ (`src/` ?꾨줈?뺤뀡 肄붾뱶 ?꾩껜)
- 諛⑸쾿: grep ?꾩닔 + ?뺣룆. ?몄텧遺?뷀뵾?몄텧遺 ?숈떆 ?쎄린濡??몄텧 ?잛닔瑜?**?앹쑝濡?* ?곗텧. DDL怨?荑쇰━瑜??議고빐 ?몃뜳???뺥빀 ?뺤씤. **肄붾뱶 ?섏젙 ?놁쓬**
- 異붿륫 諛곗젣: 肄붾뱶?먯꽌 ?쎌? ?곸닔쨌猷⑦봽 援ъ“쨌DDL ?좎뼵留?洹쇨굅濡??쇱븯?? ?뺤씤 遺덇???寃껋? ?뚮?寃利앫띿뿉 ?④꼈??
> **?ш컖??* ??**P1** ?ъ슜??泥닿컧/鍮꾩슜 ??쨌 **P2** 議곌굔遺쨌以묎컙 쨌 **P3** ?ъ냼

## ?쒖쇅(?щ낫怨?????

| ??ぉ | 洹쇨굅 |
|------|------|
| ?먯썝 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆(Forge SQL ?곸옱 諛곗젣) | ?섎룄??寃곗젙 |
| ?뚰겕濡쒓렇 ?섏쿂 湲곕뒫蹂?寃⑸━(怨듯넻 寃쎈줈 ?섏젙 湲덉?) | ?섎룄??寃곗젙 ??寃⑸━???섏쿂 **?대?**??鍮꾪슚?⑤쭔 吏?곹븳??|
| 由ъ빻???덉궛 200嫄??덈떒 / `applyDefaultEstimate` ?곹븳 / 諛깊븘 job ?곹깭 湲곌퀎 | `_workspace/subscription-audit/AUDIT_2026-08-11.md` 湲곕낫怨?|
| 援щ룆 ?꾨찓???쇰컲 | ??媛먯궗 ?꾨즺 ??**鍮꾩슜 愿???좉퇋 吏?곷쭔** ?ㅼ뿀??|

## 湲고샇

`P` ?쒖꽦 ?꾨줈?앺듃 ??쨌 `I_p` ?꾨줈?앺듃 ?댁뒋 ??쨌 `M_p` ?꾨줈?앺듃 ?몄썝 ??쨌 `w_i` ?댁뒋 i ?뚰겕濡쒓렇 嫄댁닔 쨌
`U` ?깅줉 ?ъ슜????쨌 `W` ??쒕낫???꾩젽 ??쨌 `B` ??諛곗튂 ??쨌 `S` ?붾㈃ 吏꾩엯 ???숈떆 invoke ??

????덉떆??**P=30 쨌 I=5,000(?됯퇏 I_p??67) 쨌 ?곸꽭 ????꾨줈?앺듃 1,000?댁뒋 쨌 U=500** 湲곗?.

## ?뚯씠釉?洹쒕え (DDL쨌肄붾뱶 ?ㅼ륫)

| ?뚯씠釉?| ????洹쒕え | 洹쇨굅 |
|---|---|---|
| `users` | ?깅줉 ?몄썝, 10짼~10쨀 | `MAX_USER_CANDIDATES=1000`(`TeamService.js:65`), `TEAM_SCOPE_WARN_THRESHOLD=2000`(`PrincipalResolver.js:59`) |
| `projectusers` | 誇(?꾨줈?앺듃 횞 ?ъ엯 ?몄썝) | 1??諛곗젙 ?곹븳 `TEAM_ASSIGN_MAX=500` |
| `project` | 10쨔~10짼 | ??|
| `portfolio_project_snapshot` | ?쒖꽦 ?꾨줈?앺듃??1??(+JSON 3而щ읆) | PK = `project_id` |
| `gantt_folder_issue` | ?댁뒋 ?섏뿉 鍮꾨? | PK = `issue_key` |

> **?뚰겕濡쒓렇 SQL ?뚯씠釉붿? 議댁옱?섏? ?딅뒗??** `src/rdb/schema/ddl/worklog.js` ???꾩껜媛 二쇱꽍?닿퀬 `ddl/index.js` ??誘몃벑濡앹씠?? ?뚰겕濡쒓렇???꾨? Jira REST 寃쎌쑀?대?濡?**"?뚰겕濡쒓렇 ?뚯씠釉?N+1" 異뺤? ?대떦 ?놁쓬**?대떎.

---

## ?붿빟

| ?ш컖??| 嫄댁닔 | ??ぉ |
|--------|------|------|
| **P1** | 8 | A-1 ?뚰겕濡쒓렇 異붽?議고쉶 ?섏씠吏 20 쨌 A-2 吏꾩쿃/鍮꾩슜 罹먯떆 臾댄슚 쨌 A-3 ??쒕낫???꾩젽蹂??꾨웾 ?ㅼ틪 쨌 A-4 `checkJobCompletion` O(B짼) 쨌 A-5 ?ы듃?대━??諛곗튂 臾댁쬆遺?쨌 A-6 媛??怨좎젙鍮?횞 invoke ??쨌 A-7 留덉뒪???ъ쟾 ?쒕쾭 罹먯떆 遺??쨌 A-8 `BIN_TO_UUID()` 濡?PK ?몃뜳??臾대젰??|
| **P2** | 17 | B-1 ~ B-17 |
| **P3** | 15 | C-1 ~ C-15 |

**媛??????媛쒖꽑**: `maxResult: 20` ??`100` ?곸닔 ??湲??(A-1) ??`/myWork` 吏꾩엯 Jira ?몄텧 **275 ??65 (??7%)**.
**??踰덉㎏**: `WHERE BIN_TO_UUID(p.project_id) = ?` ??`WHERE p.project_id = UUID_TO_BIN(?)` (A-8) ???꾨줈?앺듃 ?곸꽭 4媛???쓽 ?꾨웾 議곗씤 ?쒓굅.

---

# P1

## A-1. ?뚰겕濡쒓렇 異붽? 議고쉶媛 ?섏씠吏 ?ш린 20?쇰줈 ?쒖감 ??API 湲곕낯媛?100??踰꾨━怨?5諛곕? ??遺瑜몃떎

- **?앹궛??API)**: `C:\CloudJira\moves-workforce\src\api\jira\worklog\WorklogApi.js:4` ??`maxResult = 100` ??湲곕낯媛?- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:114-135`
- **?뚮퉬????*: `C:\CloudJira\moves-workforce\src\resolver\utils\worklog\WorklogService.js:209-230`

```js
// MyWorkService.jsx:118-122 / WorklogService.js:213-217 ??臾몄옄 洹몃?濡?媛숈? 蹂듭궗蹂?2踰?while (true) {
    const res = await getWorkLogByIssueKey({
        issueIdOrKey: issueKey,
        startAt: currentStartAt,
        maxResult: 20});          // ??湲곕낯媛?100??援녹씠 20?쇰줈 ??텣??```

寃???묐떟???몃씪???뚰겕濡쒓렇 ?곹븳(`worklog.maxResults`, ?듭긽 20)??**?섏씠吏 ?ш린濡??ㅼ씤???ъ궗??*??寃껋쑝濡?蹂댁씤?? ??媛믪? 臾닿??섎떎 ??`startAt` 留?20?먯꽌 ?쒖옉?섎㈃ ?섍퀬 ?섏씠吏 ?ш린??100?댁뼱???쒕떎.

- **鍮꾩슜**: ?뚰겕濡쒓렇 200嫄??댁뒋 1媛?= `ceil((200??0)/20)` = **Jira 9???쒖감**. `maxResult:100` ?대㈃ `ceil(180/100)` = **2??*.
  `/myWork` 吏꾩엯???댁뒋 200嫄?以?30嫄댁씠 ?뚰겕濡쒓렇 200嫄?珥덇낵 ??寃??1 + **270??*(`pLimit(5)` ??54?쇱슫??. ?섏젙 ??**61??*(12?쇱슫??.
- **?議곌뎔???대? 由ы룷 ?덉뿉 ?덈떎**: `ResourceWorklogFetcher.js:6,37-50` 쨌 `ProjectCalendarService.js:11,17-34` ??`EXTRA_PAGE_SIZE = 100` + **蹂묐젹**?대떎. myWork/怨듯넻 ??寃쎈줈留???諛⑹떇?쇰줈 ?⑥븯??
- **?섏젙 諛⑺뼢**: `maxResult: 100`. ?щ젰???섎㈃ `ProjectCalendarService.fetchExtraWorklogs` ?뺥깭(offset 紐⑸줉 ??`Promise.all`)濡?蹂묐젹?붽퉴吏.

## A-2. 吏꾩쿃?꽷룸퉬????쓽 10遺?KVS 罹먯떆媛 **Jira ?몄텧????嫄대룄 以꾩씠吏 紐삵븳??*

- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:49-52` ??`:199-215` (`buildIssuesArray`)
- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:66-90` ??`:206-218` (`buildByIssue`)

```js
// ProjectProgressService.js:49-52 ??罹먯떆 hit ?몃뜲?꾟?if (cached && new Date(cached.expireTime) >= new Date()) {
    const issues = await buildIssuesArray({ projectId, coworkerFieldId, hourRate });   // ??    return assembleResponse(cached.value, issues, thresholdPP);
}
// :200-204 ??媛??鍮꾩떬 ???섏튂瑜?洹몃?濡??ㅼ떆 ?쒕떎
const [holidayResult, worklogs, rawIssues] = await Promise.all([
    getPublicHolidayListService(),
    getResourceProjectWorklogs({ projectId }),                // ?뚰겕濡쒓렇 ?꾨웾
    fetchAllProjectIssues({ projectId, coworkerFieldId }),    // ?댁뒋 ?꾨웾
]);
```

`issues[]`/`byIssue[]` 媛 KVS 媛??곹븳(240KiB) ?뚮Ц??罹먯떆?먯꽌 鍮좎졇 ?덇퀬, 洹멸구 ?ш뎄?깊븯?ㅻ㈃ 寃곌뎅 ?먮낯???ㅼ떆 ?섏튂?댁빞 ?섎뒗 援ъ“?? `ProjectCostService.js:70-71` 二쇱꽍???대? ?몄??섍퀬 ?덈떎 ??*"??寃쎈줈???대? ?뚰겕濡쒓렇쨌?댁뒋 ?꾨웾???ы럹移섑븯誘濡?*.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃, 罹먯떆 hit쨌miss 臾닿? ?숈씪)**:
  `fetchAllProjectIssues` = `ceil(1000/100)` = **寃??10??* + `getResourceProjectWorklogs` = 寃??1??+ `誇 ceil((w_i??0)/100)`.
  ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋媛 100嫄댁씠硫?**珥?111??Jira ?몄텧**. 罹먯떆媛 ?덉빟?섎뒗 寃껋? **JS 吏묎퀎 CPU肉?*?대떎.
- 吏꾩쿃????낵 鍮꾩슜 ??? 媛숈? ???섏튂瑜?**媛곴컖** ?섑뻾?쒕떎 ?????ъ슜?먭? ????쓣 ?대㈃ 222??(B-14).
- **?섏젙 諛⑺뼢**: (a) 罹먯떆 ??곸쓣 ?ㅼ쭛?붾떎 ??`issues[]`/`byIssue[]` 瑜?蹂꾨룄 KVS ?ㅻ줈 **泥?겕 遺꾪븷 ???*(240KiB ?곹븳 ?뚰뵾), ?먮뒗 (b) `ProjectRaw:{projectId}` 5遺?TTL 怨듭쑀 罹먯떆瑜??먭퀬 吏꾩쿃쨌鍮꾩슜쨌byIssue ?ш뎄?깆씠 **媛숈? ?먯떆 ?섏튂 寃곌낵 ?꾩뿉??怨꾩궛留?* ?쒕떎. (b)媛 ??媛?以묐났(B-14)源뚯? ?④퍡 ?놁븻??

## A-3. ?꾨줈?앺듃 ??쒕낫?????꾩젽 ?섎굹媛 ?댁뒋 ?꾨웾 ?ㅼ틪 1踰? 洹멸쾬??**?숈씪 荑쇰━瑜?2踰?*

- **?뚮퉬??*: `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:59-79` ???꾩젽 **1媛쒕떦 `invoke('getChartDataById')` 1??*
- **?앹궛??*: `C:\CloudJira\moves-workforce\src\resolver\projectDashboard\ProjectDashboardService.js:265-276`
- **以묐났???ㅼ껜**: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:14` vs `:95`

```js
// IssueApi.js:14  (getAssigneeStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
// IssueApi.js:95  (getIssueParticipantStats)
route`/rest/api/3/search/jql?jql=moves_RMS_projectId="${projectId}"&fields=assignee&properties=${MOVES_PROPERTY_KEY}&maxResults=100...`
```

**URL??臾몄옄 ?⑥쐞濡?媛숇떎.** ???⑥닔??媛숈? ?곗씠?곕? 媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곸뼱? 吏묎퀎留??ㅻⅤ寃??쒕떎(?대떦?먮퀎 嫄댁닔 / ?댁뒋蹂?李몄뿬????. `getChartDataset`(`:176-211`)?????섏쓣 蹂꾧컻 `dataType`(`assignee` / `issue`)?쇰줈 遺꾧린?섎?濡????꾩젽??媛숈씠 ?볦씠硫?**媛숈? ?ㅼ틪??2踰?* ?섍컙?? ?뚰겕濡쒓렇 ?꾩젽留?10遺?KVS 罹먯떆媛 ?덇퀬(`WorklogService.js:26-47`) assignee/issue ?꾩젽?먮뒗 罹먯떆媛 **?녿떎**.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃)**: assignee ?꾩젽 1媛?= 寃??**10??*. assignee + issue ???꾩젽 = **20??*(洹몄쨷 10???꾩쟾 以묐났).
  `level`/`role`/`team` ?꾩젽? 媛곴컖 KVS 留덉뒪???ъ쟾 ?ㅼ틪 1~2?뚯뵫(A-7怨?怨깊빐吏꾨떎).
  ?꾩젽 `W` 媛???쒕낫??= resolver invoke `W` ????媛??怨좎젙鍮꾨룄 `W` 諛?A-6).
- **?섏젙 諛⑺뼢**: ??`getAssigneeStats`/`getIssueParticipantStats` 瑜?**1?⑥뒪 ?섏쿂 + 2吏묎퀎**濡??⑹튇??怨듯넻 ?섏쿂 寃⑸━ ?먯튃??留욊쾶 `projectDashboard` ?꾩슜 ?섏쿂 ?좎꽕). ???뚰겕濡쒓렇 ?꾩젽怨??숈씪?섍쾶 `Assignee:{projectId}` 10遺?KVS 罹먯떆瑜?遺숈뿬 ?꾩젽 媛꽷룹옱諛⑸Ц 媛?以묐났???≪닔?쒕떎.

## A-4. ???꾨즺 ?먯젙??諛곗튂留덈떎 ?꾨웾 fan-in ??KVS ?쎄린媛 諛곗튂 ?섏쓽 **?쒓낢**

`C:\CloudJira\moves-workforce\src\queue\consumer.js:240-249` (?몄텧遺 `:93`, `:154`, `:215`)

```js
const checkJobCompletion = async (appJobId, totalBatches) => {
    const batchResults = await Promise.all(
        Array.from({ length: totalBatches }, (_, i) =>
            jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
    const doneBatches = batchResults.filter(b => b?.done);
    if (doneBatches.length < totalBatches) return;   // ???遺遺??ш린??議곌린 return
```

**諛곗튂媛 ?섎굹 ?앸궇 ?뚮쭏??* ?꾩껜 諛곗튂 ?곹깭瑜??ㅼ떆 ?쎈뒗?? ?꾩슂?됱? `B`?몃뜲 ?ㅼ젣??`B횞B`.

- **鍮꾩슜**: `KVS_reads = B 횞 (B+1) ??B짼`
  - ?ъ슜???묒? ?낅줈??(`UserService.js:587` `chunk(items, 20)` ??`B = ceil(U/20)`):
    U=1,000 ??B=50 ??**2,550??* 쨌 U=5,000 ??B=250 ??**62,750??* 쨌 U=10,000 ??B=500 ??**250,500??*
  - 援щ룆 諛깊븘 (`SubscriptionBackfill.js` `BATCH_SIZE=50` ??`B = ceil(N/50)`):
    N=2,000 ??B=40 ??**1,640??* 쨌 N=10,000 ??B=200 ??**40,200??*
  - `concurrencyLimit`(3/2) ?뚮Ц???숈떆???щ윭 踰뚯씠 媛숈? fan-in???덈떎. ?ъ떆?꾧? ?쇰㈃ ???섏뼱?쒕떎.
- **?섏젙 諛⑺뼢**: 媛숈? ?뚯씪 怨꾩뿴??`getJobBatchService`(`JobService.js:73-80`)媛 ?대? ?곕뒗 `findByWhere('jobId', appJobId)` **?몃뜳??議고쉶 1??*濡?援먯껜(B>100?대㈃ 而ㅼ꽌 ?섏씠吏??꾩슂). ?먮뒗 ?꾨즺 ?먯젙??留덉?留?諛곗튂?먯꽌留??섑뻾.

## A-5. ?ы듃?대━????諛곗튂媛 **利앸텇 ?놁씠** ???꾨줈?앺듃 ??湲곌컙??留ㅼ씪 ?ы럹移?
- `C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:276-281`
- ?뚰겕濡쒓렇 珥덇낵遺?猷⑦봽: `C:\CloudJira\moves-workforce\src\resolver\resourceAnalysis\ResourceWorklogFetcher.js:35-50`

```js
const [projectUserRows, worklogs, scheduleRows, rawIssues] = await Promise.all([
    getProjectMemberRows(projectId),
    getResourceProjectWorklogs({ projectId, startDate, endDate, as: 'app' }),  // startDate = ?꾨줈?앺듃 ?쒖옉??    getProjectWorkersScheduleRepository({ projectId, startDate, endDate }),
    fetchAllProjectIssues({ projectId, coworkerFieldId, as: 'app' }),          // ?댁뒋 ?꾨웾
]);
```

"?댁젣 ?댄썑 蹂寃쎈텇" ?먯젙???대뵒?먮룄 ?녿떎. 蹂寃??щ?? 臾닿??섍쾶 紐⑤뱺 ?쒖꽦 ?꾨줈?앺듃瑜?**留ㅼ씪 ??湲곌컙 ?꾨웾 ?ш퀎??*?쒕떎.

- **鍮꾩슜 ??1???ㅽ뻾 = 1??**
  ```
  Jira = 誇_p [ 1(?뚰겕濡쒓렇 寃?? + ceil(I_p/100) + ceil(M_p/100) ]  +  誇_{i : w_i>20} ceil((w_i??0)/100)
  SQL  = 1 + 3P
  ```
  ???P=30, I_p??67, M_p??): 湲곕낯??= 30 횞 (1+2+1) = **120 Jira ?몄텧**, SQL 91.
  臾몄젣??留덉?留???씠?? ?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋留덈떎 理쒖냼 1?뚭? 遺숆퀬 `w_i` ???꾨줈?앺듃媛 ?숈쓣?섎줉 ?⑥“ 利앷??쒕떎 ??  5,000 ?댁뒋 以?10%媛 20嫄?珥덇낵硫?**+500????*, 30%硫?**+1,500????*濡?湲곕낯??쓽 4~12諛곌? ?섏뼱 諛곗튂 鍮꾩슜??吏諛고븳??
  ??鍮꾩슜? **?꾨줈?앺듃 ?섎챸 ?대궡 留ㅼ씪 諛섎났**?쒕떎(2???꾨줈?앺듃硫?媛숈? ?뚰겕濡쒓렇瑜?730???ы럹移?.
- **?섏젙 諛⑺뼢**: ?ㅻ깄?룹뿉 `lastAggregatedAt` ???먭퀬 `updated >= lastAggregatedAt` 移댁슫??寃??1?뚮줈 臾대?寃??꾨줈?앺듃瑜?嫄대꼫?대떎. ?먮뒗 ?뚰겕濡쒓렇 議고쉶 李쎌쓣 利앸텇 李쎌쑝濡?醫곹엳怨??꾩쟻遺꾩? ?ㅻ깄?룹뿉 ?⑹궛 蹂댁〈?쒕떎.

## A-6. 沅뚰븳 媛??怨좎젙鍮꾧? **?붾㈃ 吏꾩엯 invoke ?섎쭔??怨깊빐吏꾨떎**

- `C:\CloudJira\moves-workforce\src\permission\permissionGuard.js:119-150` ??紐⑤뱺 guarded resolver媛 `resolvePrincipal` ?듦낵
- `C:\CloudJira\moves-workforce\src\permission\PrincipalResolver.js:207-215`, `:218`

```js
// :207-215 ??罹먯떆??buildPrincipal ??**?앸궃 ?ㅼ뿉留?* 梨꾩썙吏꾨떎
const cached = cache.get(accountId);
if (cached && cached.expireAt > Date.now()) return cached.value;
const principal = await buildPrincipal(accountId);   // ???숈떆 吏꾩엯 ???꾩썝???ш린濡??ㅼ뼱?⑤떎
cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });

// :218 ??鍮꼆dmin(??ㅼ닔)?먭쾶??Jira REST ?뺣났??臾댁“嫄? 洹몃━怨?users SQL(:255)怨?吏곷젹濡??좏뻾?쒕떎
const isAdmin = await isAdministrator();      // asUser GET /rest/api/3/mypermissions
```

30珥?L1 罹먯떆(`:62`)??**?붾㈃ 吏꾩엯 ?ъ씠**?먮쭔 ?ｊ퀬 **吏꾩엯 洹??쒓컙**?먮뒗 ?ｌ? ?딅뒗?? React Query媛 resolver瑜??숈떆??`S`媛??섎㈃ `S`媛??꾨? `buildPrincipal` ???덈떎.

- **鍮꾩슜(罹먯떆 誘몄뒪 1?뚮떦)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
  `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? = Jira **6??* + SQL **6??* + KVS **12??*媛 ?쒖닔 媛??怨좎젙鍮?
  洹??붾㈃ ?꾩껜 Jira ?몄텧 7??以?**6??86%)** 媛 媛?쒕떎.
- **?섏젙 諛⑺뼢(?④낵 ????**:
  1. `isAdministrator()` ? `getUserInfoService()` 瑜?`Promise.all` 濡?蹂묐젹?????뺣났 2????1??(?섏? ?낅┰).
  2. 罹먯떆 媛믪쓣 `Promise` 濡???ν빐 in-flight dedup. **??而⑦뀒?대꼫媛 媛덈━硫??ｌ? ?딅뒗??*(誘멸?利?李몄“) ??洹몃옒??1踰덉씠 癒쇱???
  3. admin ?먯젙??蹂꾨룄 吏㏃? TTL濡?遺꾨━??鍮꼆dmin 寃쎈줈??Jira ?뺣났???쒓굅.

## A-7. 留덉뒪???ъ쟾(role/level/skill/permission/status/holiday)???쒕쾭 罹먯떆媛 ?녿떎 ???붾㈃ 吏꾩엯留덈떎 ?꾨웾 ?ㅼ틪

`getTeamIndex()` 留?60珥?紐⑤뱢 TTL 罹먯떆瑜?媛뽯뒗??`backoffice/team/TeamTreeCache.js:95-104`). ?섎㉧吏???몄텧留덈떎 KVS瑜?移쒕떎.

| ?쒕퉬??| ?꾩튂 | 1??KVS 鍮꾩슜 |
|---|---|---|
| `getRoleListService` | `backoffice\role\RoleService.js:36` | `findAll()` 1 |
| `getLevelListService` | `backoffice\level\LevelService.js:86` | `findAll()` 1 |
| `getSkillListService` | `backoffice\skill\SkillService.js:58` | `findAllPaged` **2** (?꾨━??141嫄? |
| `getProjectStatusListService` | `backoffice\projectStatus\ProjectStatusService.js:78` | 1 |
| `getPublicHolidayListService` | `backoffice\publicHoliday\PublicHolidayService.js:34` | 1 |
| `getSettingDataService` | `backoffice\setting\SettingService.js:11` | `findById` 1 |

- **鍮꾩슜 ??`/backoffice/users` 吏꾩엯**: `roleLevelMap()`(`UserService.js:151-171`)??`getUserListWithPaging`쨌`getUserMetaCount`(`:785`) ??寃쎈줈?먯꽌 媛곴컖 ?몄텧?섍퀬, ?꾨줎?멸? `getRoleList`/`getLevelList`/`getPermissionList` 瑜????낅┰ ?몄텧 ??**role 3 + level 3 + permission 3 = KVS 9??*(?꾩슂遺?3??.
- **鍮꾩슜 ??`/resource` ?몃젰?꾪솴 吏꾩엯**: `buildPeopleContext`(`ResourceManagementService.js:59-77`)媛 role 1 + level 1 + skill 2 + settings 1 + rollup 1 = 6?? ?꾨줎??`SkillMultiSelect.jsx:34` 媛 `getSkillList` **2????*(諛⑷툑 ?쒕쾭媛 ?쎌? 寃껉낵 ?숈씪 ?곗씠?? = **9?? 洹몄쨷 3???쒖닔 以묐났**.
- **鍮꾩슜 ???꾨줈?앺듃 ??쒕낫??*: `getLevelChartData`/`getRoleChartData`(`ProjectDashboardService.js:213-231`)媛 ?꾩젽留덈떎 ?몄텧 ??level/role ?꾩젽 `W` 媛쒕㈃ `findAll` **W??*. 媛숈? ?뚯씪 `:114-120` ??`salaryPolicy` ??"猷⑦봽 諛?1??濡?紐낆떆?곸쑝濡??몄씠?ㅽ똿?덈뒗??level/role? ?⑥븯??
- **?섏젙 諛⑺뼢**: `TeamTreeCache` ? ?숉삎??紐⑤뱢 ?ㅼ퐫??60珥?TTL 罹먯떆瑜?role/level/skill/permission/status/holiday/setting???꾩엯. ?꾨? ?蹂寃??ъ쟾?닿퀬 60珥?stale ?섏슜 ?좊?媛 ?대? ?덈떎. ?곌린 寃쎈줈??`loadTeamIndexFresh` 泥섎읆 罹먯떆瑜??고쉶?쒕떎.

## A-8. `WHERE BIN_TO_UUID(p.project_id) = ?` ??PK ?몃뜳?ㅻ? ?⑥닔濡?臾대젰??
`C:\CloudJira\moves-workforce\src\rdb\query\ProjectDashboard.js:16`

```sql
FROM project p LEFT JOIN projectusers pu ON p.project_id = pu.project_id
WHERE BIN_TO_UUID(p.project_id) = ?          -- ???몃뜳??而щ읆???⑥닔瑜??뚯썙 鍮꾧탳
GROUP BY p.project_id
```

?몃뜳??而щ읆???⑥닔濡?媛먯떥硫?PK瑜?紐??꾨떎. **???꾩껜?먯꽌 ????怨노쭔** ???뺥깭?????섎㉧吏 ??荑쇰━??`project_id = UUID_TO_BIN(?)` 濡??몃뜳?ㅻ? ?꾨떎(`grep "WHERE BIN_TO_UUID" src/rdb` ?좎씪 留ㅼ튂, 寃利??꾨즺).

- **?몄텧遺 4怨?* ???꾨줈?앺듃 ?곸꽭??**??쒕낫?쑣룸퉬?㈑룹쭊泥숇룄쨌湲됱뿬 ??吏꾩엯留덈떎** 諛쒖깮?쒕떎:
  `ProjectDashboardController`(?붿빟 移대뱶) 쨌 `ProjectCostService.js:102` 쨌 `ProjectProgressService.js:58` 쨌 `ProjectUsersService.js:171`
- **鍮꾩슜**: ?몄텧 1?뚮떦 `project` ?????ㅼ틪 + `projectusers` ?꾨웾 議곗씤 ???꾪꽣. ?꾨줈?앺듃 100媛?횞 ?됯퇏 ?몄썝 20紐낆씠硫?**1?됱쓣 ?살쑝????2,000?됱쓣 議곗씤**?쒕떎(?뺤긽?대㈃ PK 1??+ ?몃뜳??20??.
- **??*: ??荑쇰━媛 留뚮뱶??`total_salary` 瑜?吏꾩쿃?꾨뒗 **?곗????딅뒗??* ??`ProjectDashboardService.js:37` 二쇱꽍??吏곸젒 *"吏꾩쿃???섏씠吏??total_salary 瑜??곗????딅뒗??= 100% ??퉬"* ?쇨퀬 ?곸뼱 ??붾뜲, 洹?媛믪쓣 留뚮뱾湲??꾪븳 議곗씤+`SUM`+`GROUP BY` ??洹몃?濡??덈떎.
- **?섏젙 諛⑺뼢**: `WHERE p.project_id = UUID_TO_BIN(?)` (?뚮씪誘명꽣쨌諛섑솚 shape 遺덈?). 異붽?濡?吏꾩쿃/鍮꾩슜? `findProjectByIdRepository`(PK 1??lookup)濡?媛덉븘?怨??몄썝 ?섎뒗 ?대? ?섏튂??`memberRows.length` ?먯꽌 痍⑦븳??B-5).

---

# P2

## B-1. `getBulkIssuesByProject` ??`maxResults=5000` ?⑥씪 ?붿껌, `nextPageToken` 猷⑦봽 ?놁쓬

`C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:177-198`

```js
const url = route`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=worklog`;  // 湲곕낯 5000
const result = await requestJiraJson({ as, url, ... });
return result?.issues || [];      // nextPageToken ???쎌??? 猷⑦봽?섏????딅뒗??```

媛숈? ?뚯씪??`getProjectIssuesByFilter`쨌`getProjectGanttIssues` ??`nextPageToken` do-while 猷⑦봽瑜??꾨뒗????寃쎈줈留??⑤컻?대떎. ?몄텧 1?뚮줈 ??蹂댁씠吏留?**`fields=worklog` 瑜?理쒕? 5,000?댁뒋遺???踰덉뿉** 諛쏅뒗?????댁뒋???몃씪???뚰겕濡쒓렇 20嫄?횞 5,000 = 理쒕? 10留??뷀듃由ш? `memoryMB: 256` ?⑥닔 ?섎굹???ㅼ뼱?ㅺ퀬, ?ы듃?대━??諛곗튂??`PROJECT_CONCURRENCY=2` ?????꾨줈?앺듃遺꾩씠 ?숈떆 ?곸＜?쒕떎. 諛섎?濡?Jira媛 ?섏씠吏瑜??섎씪 二쇰㈃ **珥덇낵遺꾩씠 議곗슜???꾨씫**?섏뼱 怨듭닔媛 怨쇱냼 吏묎퀎?쒕떎(?대뒓 履쎌씠???먰빐).

- **?뚮퉬泥?*: `WorklogService.js:133`, `ResourceWorklogFetcher.js:75`(??吏꾩쿃/鍮꾩슜/?ы듃?대━???꾨?), `ProjectService.js:272`
- **媛숈? 寃고븿??`getProjectIssuesByUser`(`IssueApi.js:206-264`)쨌`getIssuesByWorklogAuthor`(`:272-315`)?먮룄 ?덈떎** ??????`maxResults=5000` ?⑤컻. ?議곌뎔 `ResourceLoadFetcher.fetchInProgressIssuesForAccount:95-125` ??`maxResults=100` + 猷⑦봽瑜??쒕?濡??덈떎.
- **?섏젙 諛⑺뼢**: `maxResults=100` + `nextPageToken` 猷⑦봽(湲곗〈 ?⑦꽩 ?ъ궗??. ?섏씠吏 ?⑥쐞濡??뚰겕濡쒓렇瑜??묒뼱 ?ｌ쑝硫??곸＜ 硫붾え由ш? ?곸닔?붾맂??

## B-2. `getMyIssueList` ???꾨줎?멸? ???곕뒗 `worklog` 瑜??듭㎏濡??ㅼ뼱 蹂대궦??
- **?앹궛??*: `C:\CloudJira\moves-workforce\src\api\jira\issue\IssueApi.js:251`(`fields` ??`worklog` ?ы븿) ??`C:\CloudJira\moves-workforce\src\resolver\myWork\MyWorkService.jsx:204-215`(`data: issues` ?먮낯 洹몃?濡?
- **?뚮퉬??*: `static/ui/src/pages/myWork/table/useMyIssueTable.js:18`, `static/ui/src/pages/myPage/hooks/useMyPageIssues.js:30`

???뚮퉬??紐⑤몢 ?뚰겕濡쒓렇瑜??곗? ?딅뒗??myPage??`statusCategory.key` 濡??꾨즺 ?먯젙留???`useMyPageIssues.js:11-14` 二쇱꽍). 洹몃윴??`fields` 媛 `getProjectWorklogService`(?뚰겕濡쒓렇媛 **?꾩슂??* 寃쎈줈)? 怨듭쑀???쒖そ 湲곗??쇰줈 怨좎젙???덈떎.

- **鍮꾩슜**: ?댁뒋 500嫄?횞 (?몃씪???뚰겕濡쒓렇 理쒕? 20嫄?횞 author/avatarUrls 媛앹껜) ??**??MB ?묐떟**. `/myWork` ??湲곕낯 吏꾩엯 ?붾㈃?대떎.
- **?섏젙 諛⑺뼢**: `getProjectIssuesByUser` ??`fields` ?몄옄瑜??닿퀬(湲곕낯媛??꾪뻾 ?좎? = 臾댄쉶洹) `getMyIssueListService` 留?`worklog` 瑜?類 吏묓빀???섍릿??

## B-3. `job_fail` ??TTL???녾퀬 ??젣 寃쎈줈媛 **?숈옉?섏? ?딅뒗??*

- **???*: `C:\CloudJira\moves-workforce\src\queue\consumer.js:54`, `:66` ??`jobFailManager.save(...)` (`job`/`job_batch` ??`saveTTL` 30h ?몃뜲 ?ш린留?`save`)
- **??젣**: `C:\CloudJira\moves-workforce\src\resolver\utils\job\JobService.js:66-68`

```js
// JobService.js:67 ??findByWhere 媛 二쇰뒗 ?됱? {key, value} ??item.id ??undefined
await Promise.all(items.map(item => jobManager.delete(item.id)));
// :93 ??媛숈? ?뚯씪??job_batch ??item.key 瑜??대떎. ???⑥닔媛 媛덈졇??await Promise.all(items.map(item => jobManager.delete(item.key)));
```

???payload(`consumer.js:54-58`)?먮룄 `id` ?꾨뱶媛 ?녿떎. 寃뚮떎媛 ?꾨줎?몃뒗 `removeFailJobList` 瑜??몄텧?섏? ?딅뒗??`static/ui/src/stores/useJobStore.js:73-74` ??`removeJobBatch`/`removeJob` 留?.

- **鍮꾩슜**: ?ㅽ뙣 1嫄?= KVS ?뷀듃由?1媛?**?곴뎄 ?붿〈**. 1,000紐??낅줈?쒖뿉??誘몄〈???대찓??5%硫??뚮떦 50嫄? 二?1???댁쁺?대㈃ ??2,600嫄?
- **?섏젙 諛⑺뼢**: `item.key` 濡??뺤젙 + `saveTTL` ?곸슜.

## B-4. ?ы듃?대━???ㅻ깄?룹쓣 ???꾨줈?앺듃 ?꾨즺 **??* ?쇨큵 ???????꾩븘????洹몃궇 怨꾩궛 ?꾨웾 ?뚯떎

`C:\CloudJira\moves-workforce\src\resolver\portfolioDashboard\PortfolioAggregator.js:506-530`

```js
const settled = await Promise.allSettled(projectRows.map(p => limit(() => aggregateOneProject(...))));
...
for (const s of succeeded) { await upsertSnapshot(s.snapshot); }   // ???꾨? ?앸궃 ?ㅼ뿉??泥?write, 洹멸쾬??1?됱뵫 吏곷젹
```

- **鍮꾩슜/?쒓컙**: `T ??(P / PROJECT_CONCURRENCY) 횞 T_project`. ?꾨줈?앺듃??8~15珥덈㈃ P=30 ??120~225s(?ъ쑀), **P=80 ??320~600s**, P=100 ??500~750s濡?`timeoutSeconds: 600` 寃쎄퀎瑜??섎뒗?? ??꾩븘????upsert 猷⑦봽???꾨떖?섏? 紐삵빐 **?깃났 怨꾩궛遺꾧퉴吏 ?꾨웾 ?먭린**?섍퀬 `finally` ?????댁젣???ㅽ뻾?섏? ?딆븘 `STALE_LOCK_MS`(900s) ?숈븞 ?쎌씠 ?⑤뒗?? 泥댄겕?ъ씤?멸? ?놁뼱 ?ъ떆?꾨룄 泥섏쓬遺?곕떎.
  SQL? ?꾨줈?앺듃??3??硫ㅻ쾭 + ?쇱젙 + upsert) = **3P??*. P=100?대㈃ 300?? upsert 100?뚮뒗 ?꾩쟾 吏곷젹?대씪 RTT 30ms 媛????洹멸쾬留?3珥?
- **?섏젙 諛⑺뼢**: `aggregateOneProject` ?깃났 利됱떆 `upsertSnapshot` ?쇰줈 遺遺?寃곌낵瑜??뺤젙?쒕떎. 硫ㅻ쾭쨌?쇱젙 議고쉶??`project_id IN (...)` ?ㅺ굔 踰꾩쟾?쇰줈 2?뚮줈 異뺤냼?섍퀬, upsert??`PortfolioSnapshotQuery.UPSERT` 媛 ?대? `ON DUPLICATE KEY UPDATE` ?대?濡??ㅽ뻾 `VALUES` 濡?臾띕뒗??

## B-5. 吏꾩쿃?꽷룸퉬?⑹씠 ?곗????딅뒗 吏묎퀎瑜??꾪빐 臾닿굅???붿빟 荑쇰━瑜?遺瑜몃떎

- `C:\CloudJira\moves-workforce\src\resolver\projectCost\ProjectCostService.js:100-106`
- `C:\CloudJira\moves-workforce\src\resolver\projectProgress\ProjectProgressService.js:56-61`

```js
const [holidayResult, summary, memberRows, worklogs, rawIssues] = await Promise.all([
    ...,
    getSummaryDataService({ project_id: projectId }),   // A-8??鍮?sargable ?꾨웾 議곗씤
    getProjectMemberRows(projectId),                     // projectusers ??users ??????媛숈? ?뚯씠釉?2踰덉㎏ 議고쉶
    ...
]);
```

`summary` ?먯꽌 ?ㅼ젣濡??곕뒗 媛믪? `start_date`/`end_date`/`total_member_count`(`:112-114`)肉먯씠怨?`total_salary` ??`members` 濡??ш퀎?고빐 踰꾨┛??`:136`). ?몄썝 ?섎뒗 `memberRows.length` 濡??섏삤怨??좎쭨??`ProjectQuery.FIND_BY_ID`(PK, 議곗씤 ?놁쓬)濡??섏삩??

- **鍮꾩슜**: 鍮꾩슜 ??罹먯떆 miss 1?뚮떦 `projectusers` 瑜?2踰??쎄퀬 洹몄쨷 1踰덉? ?꾨웾 ?ㅼ틪. 吏꾩쿃????룄 ?숈씪.
- **?섏젙 諛⑺뼢**: `getSummaryDataService` ??`findProjectByIdRepository` 濡?援먯껜, ?몄썝 ?섎뒗 `memberRows` ?먯꽌 痍⑦븳??

## B-6. `users` ???꾪꽣쨌?뺣젹 而щ읆???몃뜳?ㅺ? ?섎굹???녿떎

DDL: `C:\CloudJira\moves-workforce\src\rdb\schema\ddl\users.sql.js:1-26` ??`PRIMARY KEY (account_id)` 媛 **?좎씪???몃뜳??*. `ALTER_USERS_ADD_TEAM_KEY` 二쇱꽍??*"?몃뜳?ㅻ뒗 ?먯? ?딅뒗????users ???뚭퇋紐?* 濡??섎룄瑜?諛앺엺?? `migrate.js` ?꾩껜??`CREATE INDEX`/`ADD INDEX` 媛 ?녿떎(寃利??꾨즺).

| ?몃뜳???녿뒗 而щ읆 | ?ъ슜泥?|
|---|---|
| `team_key` (WHERE/IN/IS NULL/GROUP BY) | `TeamRepository.js:116-127, 139-152, 158-170, 180-192`, `UserQuery.TEAM_COUNT`쨌`TEAM_INHERIT_COUNT`쨌`CLEAR_TEAM_BY_TEAM_KEY`, `UserRepository.js:16-19` |
| `role_key`/`level_key`/`permission_key` | `UserRepository.js:248-305`, `:168-213`, `ROLE/LEVEL/PERMISSION_COUNT` |
| `created_at` (ORDER BY) | `UserRepository.js:198, 234`, `TeamRepository.js:165, 186, 249` |

- **鍮꾩슜**: ???꾨?媛 ?????ㅼ틪 + filesort. U=1,000?대㈃ 媛쒕퀎濡쒕뒗 媛먮떦?섎굹 **???붾㈃???щ윭 踰?移쒕떎** ??`getProjectTeamsService`(`ProjectTeamService.js:76-98`)???대떦 ? ??1??吏꾩엯??`countUsersByTeam()`(?꾨웾 GROUP BY) + `findUsersByTeamKeys()`(?꾨웾 ?ㅼ틪) + `findUserRowsByAccountIds` 2?뚮? 諛쒖깮?쒖폒 **users ?꾨웾 ?ㅼ틪 2??*媛 ?쒕떎.
- **?섏젙 諛⑺뼢**: `team_key` ???몃뜳??1媛?異붽?(硫깅벑 `ALTER`, v018). role/level/permission ? 諛깆삤?쇱뒪 ?꾩슜?대씪 ?꾩닚??

## B-7. ????濡쒕뱶 ???깅떒 沅뚰븳 ?꾪꽣 ????μ씠 10紐낆쓣 蹂대젮怨??꾩궗瑜??쎈뒗??
- `C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:437-441` ??`FIND_ALL_ALLOCATIONS`(???꾨줈?앺듃 횞 ??諛곗젙 ?몄썝, WHERE ?놁쓬) ??`allRows.filter(r => visible.has(r.account_id))`
- `:391-396` ??`findUsersRepository({})` ?꾨웾 ??`.filter(id => !visible || visible.has(id))`

- **鍮꾩슜**: TEAM_ONLY/LEADING ?ㅼ퐫???ъ슜?먭? ?먭린 ? 10紐낅쭔 蹂?沅뚰븳?몃뜲 `projectusers` 誇(?꾨줈?앺듃횞?몄썝) ?꾨웾 + `users` ?꾨웾???쒕쾭 硫붾え由щ줈 ?뚯뼱?щ┛?? ?꾨줈?앺듃 100 횞 ?몄썝 20?대㈃ **2,000?됱쓣 ?쎌뼱 10?됱쓣 ?④릿??*.
- `findUsersRepository` ??`whereIn('account_id', users)` 瑜??대? 吏?먰븯怨?`principal.leadingScopeAccountIds` 媛 洹?紐⑸줉?대떎.
- **?섏젙 諛⑺뼢**: `visible` ??`null` ???꾨땺 ??accountId 吏묓빀??`IN` ?덈줈 諛???ｋ뒗?? **??`QueryBuilder.whereIn([])` ? 議곌굔???듭㎏濡?踰꾨젮 fail-open ?대?濡?鍮?諛곗뿴 媛???꾩닔** ??`TeamRepository.js:1-13` 二쇱꽍??C3 洹쒖빟??洹몃?濡??곕? 寃?

## B-8. `getResourceProfile` ?????щ엺 ?쒕줈?대? ?대젮怨??꾩궗 而⑦뀓?ㅽ듃瑜??듭㎏濡??ъ“由?
`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:285-295`

```js
const [ctx, inProgressIssues, historyRes, roleListRes, statusRes, assignedMap, projectCountMap] = await Promise.all([
    buildPeopleContext(),   // ???ъ슜??SQL + Jira bulk + KVS 6醫?+ ?ㅽ궗 留ㅽ븨 SQL
    ...
]);
const person = ctx.people.find((p) => p.accountId === accountId) ?? null;   // 1紐낅쭔 ?대떎
```

`buildPeopleContext`(`:53-77`)??`SELECT * FROM users ORDER BY created_at DESC`(WHERE ?놁쓬) ?꾨웾 + `SELECT_SKILLS_BY_ACCOUNTS(N)` + `userMap(userRows)`(Jira bulk `ceil(N/100)`??瑜??섑뻾?쒕떎.

- **鍮꾩슜(U=1,000)**: ?쒕줈??1?뚮떦 users ?꾨웾 ?ㅼ틪(1,000?? `salary` ?ы븿 ??而щ읆) + user_skills `IN`(1,000 ?뚮젅?댁뒪??? + **Jira bulk 10??*. ?ㅼ궗??1??????퉬??999/1,000.
- 媛숈? ?붿껌?먯꽌 `role` ??**2踰?* ?ㅼ틪?쒕떎: `buildPeopleContext` ?대?(`:70`) + `:289` ??`getRoleListService()`. `ctx.people[i].roleName` ???대? ?댁꽍???덈떎.
- **?섏젙 諛⑺뼢**: ?꾨줈???꾩슜 寃쎈웾 遺꾧린(`findUsersRepository({users:[accountId]})` + `SELECT_SKILL_IDS_BY_ACCOUNT`), `skillMap`(KVS)留?怨듭쑀. 以묐났 `getRoleListService()` ?쒓굅.

## B-9. 寃쎈웾 荑쇰━媛 ?덈뒗??臾닿굅??荑쇰━濡?accountId留?戮묐뒗??
`C:\CloudJira\moves-workforce\src\resolver\workAssignment\WorkAssignmentService.js:81-84`

```js
const { rows = [] } = await executeQuery(ProjectUsersQuery.FIND_BY_PROJECT_ID, [projectId]);
return [...new Set((rows ?? []).map((r) => r.account_id).filter(Boolean))];
```

`FIND_BY_PROJECT_ID`(`ProjectUsersQuery.js:36-52`)??`LEFT JOIN users` + `COUNT(1) OVER()` ?덈룄???⑥닔 + 10媛?而щ읆??諛섑솚?쒕떎. ?꾩슂??嫄?`account_id` ?섎굹肉먯씠怨?**?뺥솗??洹??⑸룄??`FIND_ACCOUNT_IDS_BY_PROJECT`(`:129-133`)媛 ?대? 議댁옱**?섎ŉ `ProjectTeamService.js:59` ??洹멸구 ?대떎.

- **鍮꾩슜**: `getWorkAssignmentBoard`쨌`getWorkAssignmentPool` ??resolver媛 吏꾩엯留덈떎 遺덊븘?뷀븳 users 議곗씤 + ?덈룄???⑥닔. ?몄썝 50紐낆씠硫?50??횞 10而щ읆 + users 50??議곗씤 ??50??횞 1而щ읆?쇰줈 異뺤냼 媛??
- **?섏젙 諛⑺뼢**: `FIND_ACCOUNT_IDS_BY_PROJECT` 濡?援먯껜.

## B-10. `onIssueCreated` ??援щ룆怨?臾닿????ъ씠?????댁뒋 ?앹꽦留덈떎 ?쇱씠?좎뒪 KVS 議고쉶媛 癒쇱? ?덈떎

`C:\CloudJira\moves-workforce\src\trigger\onIssueCreated.js:37-42`

```js
if (!(await isProjectSubscriptionReady())) return;   // 1) SQL (肄쒕뱶 isolate ??
if (await isLicenseBlocked()) return;                // 2) KVS get (+TTL 留뚮즺 ??License API)
const sub = await findSubscriptionBySourceRepository('SPACE', evt.projectId);  // 3) SQL
if (!sub) return;                                    // ???遺遺꾩쓽 ?댁뒋???ш린????```

援щ룆??**?섎굹???녿뒗 ?ㅽ럹?댁뒪???댁뒋**?щ룄 2)源뚯? 諛섎뱶???ㅽ뻾?쒕떎.

- **鍮꾩슜(誘몃ℓ移??댁뒋 1嫄대떦)**: KVS 1 + SQL 1~2(肄쒕뱶 isolate硫?`information_schema` 1??異붽? ??`TableReadiness.js:36-53` ??`readyTables` ??isolate ?섎챸 罹먯떆).
  ?댁뒋 300嫄?????KVS 300 + SQL 300~600???? 2,000嫄????ъ씠?몃㈃ KVS 2,000 + SQL 理쒕? 4,000????
  ?쇱씠?좎뒪 API ?먯껜??KVS 罹먯떆 TTL(1h)濡???4???쇱씠??**UNAVAILABLE ??鍮좎?硫?TTL 60s????,440????+ 留ㅻ쾲 KVS write** 濡??대떎.
- **?섏젙 諛⑺뼢**: ?쒖꽌瑜?`findSubscriptionBySource ??isLicenseBlocked` 濡?諛붽씔???쇱씠?좎뒪???ㅼ젣 write 吏곸쟾?먮쭔 ?뺤씤?대룄 寃쎄퀎媛 媛숇떎).

## B-11. 由ъ빻??watermark ?뺤껜 ??留ㅼ떆媛??꾨웾 ?ъ뒪罹붿쑝濡??섎룎?꾧컙??
- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionSweeper.js:206`, `:220`
- `C:\CloudJira\moves-workforce\src\resolver\projectSubscription\SubscriptionJqlBuilder.js:211-214`

```js
const completed = scan.completed && apply.failed === 0;
...  watermark: completed ? startedAt : null,
...
if (mode === 'RECONCILE' && sub.watermark) parts.push(`updated >= "${lower}"`);   // watermark ?놁쑝硫??섑븳 ?놁쓬
```

?뺤긽 ?꾩＜ 寃쎈줈??利앸텇 李쎌씠???쒓컙??1?섏씠吏濡??몃떎(**?듦낵**). 洹몃윭??APPLY媛 1嫄댁씠?쇰룄 ?ㅽ뙣?섎㈃(???꾨뱶 沅뚰븳/吏??429) `completed=false` ??watermark 誘몄쟾吏????ㅼ쓬 二쇨린 JQL?먯꽌 **利앸텇 ?섑븳???щ씪??baseline ?댄썑 ?꾨웾???ㅼ떆 ?묐뒗??**

- **鍮꾩슜**: ?뺤껜 援щ룆 1嫄대떦 `min(??곸닔, MAX_SCAN_ISSUES=2000)/100` = 理쒕? 20 寃???쒓컙 ??**480 寃????援щ룆**. `SWEEP_BATCH_SIZE=20` 援щ룆???④퍡 ?뺤껜?섎㈃ ?섎（ 理쒕? 9,600 寃?됱씠 ?몄엯 0嫄댁쑝濡??뚮え?섍퀬, `MAX_REQUESTS=600` ?덉궛???뺤껜 援щ룆???낆떇???뺤긽 援щ룆??諛由곕떎.
- **?섏젙 諛⑺뼢**: apply ?ㅽ뙣媛 **遺遺?*?대㈃ ?깃났遺?湲곗??쇰줈 watermark瑜??꾩쭊?쒗궎嫄곕굹(?ㅽ뙣遺꾩? `IS EMPTY` 濡??ㅼ떆 ?≫엳誘濡??덉쟾), ?곗냽 ?ㅽ뙣 援щ룆??諛깆삤?꾨줈 ?좎떆 ?쒖쇅?쒕떎.

## B-12. `getPublicHolidayListService` 媛 100嫄??섎뱶罹???鍮꾩슜쨌吏꾩쿃???レ옄媛 議곗슜????댁쭊??
`C:\CloudJira\moves-workforce\src\resolver\backoffice\publicHoliday\PublicHolidayService.js:34`

```js
const rows = (await queryManager.findByField('by-date')).results;   // CustomEntityManager.js:47 ??limit 湲곕낯 100
```

`findAll()` 100嫄??섎뱶罹↔낵 **媛숈? ?⑥젙??`findByField` ?먮룄 ?⑥븘 ?덈떎.** ?쒓뎅 怨듯쑕????15~19嫄?+ ?泥닿났?댁씪/?щ궡 ?대Т瑜??ｌ쑝硫?**5~6?꾩튂**?먯꽌 ?곹븳 ?꾨떖.

- **?곹뼢 寃쎈줈**: `ProjectCostService.js:101`, `ProjectProgressService.js:57`쨌`:201`, `IssueAnalysisService.js:39`쨌`:186`, `ResourceAnalysisService.js`, `PortfolioAggregator.js:493` ???꾨? ?곸뾽??MD ?곗떇???낅젰?대떎.
- **?섏젙 諛⑺뼢**: `findAllPaged('by-date', 100, N)`.

## B-13. `findUserByAccountIdService` ???낅┰ ?몄텧 4~5??吏곷젹

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:281-322`

```
findByAccountId(SQL) ??getBulkJiraUsersApi(Jira) ??getTeamIndex(KVS) ??resolveSalaryPolicySafe(KVS) ??getLevelListService(KVS)
```

??3媛쒕뒗 ?쒕줈 ?낅┰?몃뜲 `await` 濡?以꾩꽭?뚯졇 ?덈떎.

- **鍮꾩슜**: ?ъ슜???몄쭛 紐⑤떖 ?닿린 = ?뺣났 4~5??媛???ы븿 6??. `Promise.all` 濡?臾띠쑝硫?2??
- **?섏젙 諛⑺뼢**: 1??SQL ?댄썑 ?섎㉧吏瑜?`Promise.all`.

## B-14. `getCurrentUserApi()` 濡?Jira `/myself` 瑜?遺瑜대뒗??`context.accountId` 媛 ?대? ?덈떎

`C:\CloudJira\moves-workforce\src\resolver\backoffice\user\UserService.js:393`, `:482`, `:561` 쨌
`C:\CloudJira\moves-workforce\src\resolver\backoffice\team\TeamService.js:636`, `:647` 쨌
`C:\CloudJira\moves-workforce\src\resolver\project\ProjectService.js:245`

`PrincipalResolver.js` ?ㅻ뜑 二쇱꽍???ㅼ뒪濡?*"accountId ??context ?먯꽌 痍⑤뱷(Jira /myself 遺덊븘??"* ?쇨퀬 ?곸뼱 ?볦븯?붾뜲, ?곌린 ?쒕퉬??6怨녹? `created_id`/`updated_id` ?섎굹 ?살쑝?ㅺ퀬 Jira瑜???踰???移쒕떎.

- **鍮꾩슜**: `addUser`쨌`updateUser`쨌`uploadUsersExcelWithQueue`쨌`assignUsersToTeam`쨌`unassignUsersFromTeam`쨌`updateProjectPartial` **媛?1??遺덊븘?뷀븳 Jira ?뺣났**(?꾩냽 ?곌린? 吏곷젹).
- **?섏젙 諛⑺뼢**: 而⑦듃濡ㅻ윭媛 `context.accountId`(?먮뒗 `principal.accountId`)瑜??쒕퉬?ㅼ뿉 ?섍릿??

## B-15. ?곹깭 ??젣/?뺣젹??SQL쨌KVS N+1 ?쒖감 ???ш린??B-14媛 怨깊빐吏꾨떎

`C:\CloudJira\moves-workforce\src\resolver\backoffice\projectStatus\ProjectStatusService.js:166-217`, `:275-295`, `:327-356`

```js
for (const project of projectList) { await updateProjectPartialService(data); }   // :168
for (const link of linksToDelete)  { await linkManager.delete(link.key); }        // :191
```

`saveStatusOrder`/`saveStatusLink` ???꾨웾 ??젣 ???꾨웾 ??μ쓣 ?쒖감 猷⑦봽濡??쒕떎.

- **鍮꾩슜**: ?곹깭???꾨줈?앺듃 200媛쒓? 臾쇰젮 ?덉쑝硫?UPDATE **200???쒖감**. 洹몃━怨?`updateProjectPartialService` ??B-14??`/myself` 瑜?留ㅻ쾲 遺瑜대?濡?**Jira 200??*源뚯? 遺숇뒗??
- ?鍮덈룄 寃쎈줈(議곗쭅 ?명똿 蹂寃???P2. **?섏젙 諛⑺뼢**: `WHERE project_status_key = ?` ?⑥씪 UPDATE濡?移섑솚.

## B-16. `/resource` ?붾㈃?????ъ슜??紐낅?瑜?**??resolver媛 媛곴컖** 議곕┰?쒕떎

`C:\CloudJira\moves-workforce\src\resolver\resourceManagement\ResourceManagementService.js:206`(`buildPeopleContext`), `:390-401`(`findUsersRepository({})` ?ъ“??, `:432-459`(`userMap` ?ы샇異?

?꾨줎?몃뒗 吏꾩엯 ??`getResourceOverview` 쨌 `getResourceLoadSummary` 쨌 `getResourceAllocationGraph` 瑜?媛곴컖 invoke?쒕떎(`useResourceOverview.js:20`, `useResourceLoadSummary.js:23`, `allocation/useResourceAllocation.js:21`).

- **鍮꾩슜(U=500)**: ?ъ슜???꾨웾 SQL **3??* + Jira user bulk **理쒕? 10??*(overview 5 + allocation 5) + 媛??怨좎젙鍮?횞3.
- **?섏젙 諛⑺뼢**: ??resolver瑜???吏꾩엯 ?⑥쐞濡??⑹튂嫄곕굹 `buildPeopleContext` 寃곌낵瑜?60珥?TTL KVS 罹먯떆濡?怨듭쑀?쒕떎.

## B-17. 吏꾩쿃?꽷룸퉬?㈑룻룷?명뤃由ъ삤媛 **媛숈? ?먯떆 ?곗씠?곕? 媛곸옄** ?섏튂?쒕떎

`ProjectProgressService.js:56-61` 쨌 `ProjectCostService.js:100-106` 쨌 `PortfolioAggregator.js:276-281` ??紐⑤몢 `fetchAllProjectIssues` + `getResourceProjectWorklogs` 瑜?媛숈? ?꾨줈?앺듃??????낅┰ ?섑뻾?쒕떎.

- **鍮꾩슜(1,000?댁뒋 ?꾨줈?앺듃)**: 吏꾩쿃????111??+ 鍮꾩슜 ??111??+ ?쇨컙 諛곗튂 111??= **?섎（ 333???댁긽**, ?꾨? 媛숈? ?곗씠??
- **?섏젙 諛⑺뼢**: A-2??(b) ??`ProjectRaw:{projectId}` 怨듭쑀 罹먯떆. ???뚮퉬?먭? ??踰덉쓽 ?섏튂瑜??섎닠 ?대떎.

---

# P3

| # | ?꾩튂 | ?댁슜 | ?섏젙 諛⑺뼢 |
|---|------|------|-----------|
| C-1 | `src\resolver\myWork\MyWorkService.jsx:18-22` | role/level/status瑜?**id留덈떎 媛쒕퀎 `findById`**(KVS N+1, ?숈떆???쒗븳 ?놁쓬, 3以?`Promise.all` 以묒꺽). ?꾨줈?앺듃 30媛쑣톎istinct 16醫낆씠硫?KVS get 16????紐⑸줉 ?쒕퉬??3?뚮㈃ 異⑸텇 | `getRoleListService`+`getLevelListService`+`getProjectStatusListService` 濡?援먯껜(`UserService.roleLevelMap()` 怨?媛숈? ?⑦꽩) |
| C-2 | `manifest.yml:113-115` + `src\rdb\schema\migrate.js:55-63` | `init-db` ?ㅼ?以꾩씠 **hour**. 留ㅼ떆媛?留덉씠洹몃젅?댁뀡 ?대젰 SQL 2??+ ?곸슜遺??놁뼱??`list()` ?꾨웾 濡쒓렇 17以?= 48 SQL/??+ 408以??? `onInstall` ???대? ?ㅼ튂쨌?낃렇?덉씠????`runMigration` ???덈떎 | `interval: day` + `executed` ?덉쓣 ?뚮쭔 濡쒓렇 |
| C-3 | `src\api\jira\field\FieldApi.js:51-63` | `getCoworkerFieldIdApi` 媛 媛숈? ?뚯씪 `findAppFieldIdByName`(`:12,21-37`)??`fieldIdCache` 瑜??곗? ?딄퀬 留ㅻ쾲 `/rest/api/3/field` ?꾨웾??諛쏅뒗?? 寃뚮떎媛 ?좎씪 ?몄텧遺(`PortfolioAggregator.js:494`)媛 ?섍릿 媛믪? `getProjectIssuesByFilter` ??fields 議곕┰??**?곗씠吏 ?딄퀬**(`IssueApi.js:355-358` 二쇱꽍) `normalizeIssue` ???몄옄瑜???諛쏅뒗??= 諛곗튂??1???ы몴(閭사ⅷ) ?몄텧(????ъ씠???묐떟 ?섎갚 KB) | ?몄텧 ?쒓굅, ?먮뒗 `findAppFieldIdByName` 寃쎈줈濡??듭씪 |
| C-4 | `src\api\jira\user\UserApi.js:54-73` | `getBulkJiraUsersApi` ??100媛?泥?겕 猷⑦봽媛 **吏곷젹**. U=1,000?대㈃ Jira 10???쒖감. `TeamService.fetchCandidateProfiles:326-353` ? 媛숈? ?곹솴??`pLimit(4)` 濡?蹂묐젹?뷀빐 ???| 泥?겕 猷⑦봽瑜?`pLimit` 蹂묐젹濡?|
| C-5 | `src\utils\license\LicenseGuard.js:112-134` | `ResponseWrapper.js:7` ??紐⑤뱺 resolver瑜?媛먯떥誘濡?production?먯꽌 `context.license.active` 遺????**invoke 1嫄대떦 KVS get 1??*. `PrincipalResolver` ??媛숈? 臾몄젣瑜?30珥?L1濡?留됱븯?붾뜲 ?ш린??L1???녿떎 | KVS TTL??誘몃윭留곹븯??紐⑤뱢 ?ㅼ퐫??L1 異붽? |
| C-6 | `src\resolver\backoffice\role\RoleService.js:36` 쨌 `level\LevelService.js:86` | 紐⑸줉? `findAll()`(100罹??몃뜲 媛숈? ?꾨찓??quick-add??`CatalogBulkService.js:32` ?먯꽌 `findAllPaged('name',100,5000)` 濡??꾨웾??蹂몃떎. **skill留?怨좎퀜議뚭퀬**(`SkillService.js:58`) role/level? ?⑥븯????"紐⑸줉???녿뒗????μ? 嫄곕?"??媛숈? 援ъ“ | ?곹븳 ?곸닔瑜?怨듭쑀?섎뒗 `findAllPaged` 濡??듭씪 |
| C-7 | `src\seed\SeedData.js:160`, `:206` | ?꾨━???대쫫 異⑸룎 ?먯젙쨌`migratePermissionSets` 媛 `findAll()`(100罹?. 沅뚰븳 ?명듃 100媛?珥덇낵 ??珥덇낵遺꾩씠 **議곗슜??留덉씠洹몃젅?댁뀡?먯꽌 ?꾨씫**(移댄깉濡쒓렇 ??蹂댁땐쨌怨좎븘 ?뺣━쨌projectScope 蹂댁젙 誘몄쟻?? | `findAllPaged` |
| C-8 | `src\resolver\projectDashboard\ProjectDashboardService.js:559-568` | `saveCharts` 媛 李⑦듃留덈떎 `await insertChart` ?쒖감. 媛숈? ?뚯씪 怨꾩뿴 `bulkUpdateLayoutsRepository`(`ProjectDashboardRepository.js:89-113`)???대? ?ㅽ뻾 `VALUES`+`ON DUPLICATE KEY` ?⑦꽩??媛뽮퀬 ?덈떎 | 洹??⑦꽩 ?ъ궗?⑺빐 INSERT 1?뚮줈 |
| C-9 | `src\resolver\backoffice\user\UserService.js:778-785` | 4媛?移댁슫??荑쇰━瑜?`Promise.all` 濡??뚮┛ ??`await roleLevelMap()` ???곕줈 湲곕떎由곕떎(?섏〈 ?놁쓬) | 媛숈? `Promise.all` ???⑸쪟 |
| C-10 | `src\rdb\query\QueryBuilder.js:3` (`_select = ['*']`) | `.select()` ?놁씠 `.from('users')` 留?遺瑜?怨?8怨?`UserRepository.js:23-33, 38-49, 61-89, 168-213`, `TeamRepository.js:69-76, 162-170, 183-192, 212-215`). `role_key`/`team_key`/`account_id` 留??곕뒗 ?뚮퉬?먭? ?遺遺꾩씤??`salary` 源뚯? ?꾩넚?쒕떎. `ProjectUsersQuery.FIND_BY_PROJECT_ID` ??湲됱뿬 ?꾩텧??留됱쑝??而щ읆??紐낆떆?덈뒗??`:28-35` 二쇱꽍) users 吏곸젒 議고쉶 寃쎈줈??洹?洹쒖쑉???녿떎. **?깅뒫蹂대떎 寃뚯씠??寃ш퀬??愿??* | ?뚮퉬 ?꾨뱶留?`.select(...)` 紐낆떆 |
| C-11 | `src\queue\consumer.js:45-70` | ?ㅽ뙣 ??ぉ留덈떎 `await jobFailManager.save(...)` ?쒖감. 諛곗튂 20嫄??꾨웾 ?ㅽ뙣 ??KVS write 20??吏곷젹 | ?ㅽ뙣 紐⑸줉??紐⑥븘 `Promise.all` |
| C-12 | `src\resolver\utils\worklog\WorklogService.js:189-205` | `normalizeWorklog` 媛 ?뚰겕濡쒓렇 ?뷀듃由щ쭏??`issue:issue`, `worklog:log` **?먮낯 媛앹껜 ?꾩껜**瑜?遺숈씤?? ???뚮퉬??3媛?aggregate ?⑥닔)媛 ?꾨? 踰꾨젮 ?ㅽ빐???놁쑝?? ??諛곗뿴???묐떟?쇰줈 ?섍????뚮퉬?먭? ?앷린硫?O(n짼) 吏곷젹?붽? ?쒕떎 | 吏묎퀎 ?꾨뱶留??④릿??`ResourceWorklogFetcher.js:15-21` 媛 ?대? 洹??뺥깭) |
| C-13 | `UserService.js:446-448` 쨌 `UserRepository.js:66-78`쨌`:189-201` 쨌 `GanttFolderService.js:168쨌170`, `:258-260` | ?쒕줈 ?낅┰??荑쇰━??吏곷젹 await(??젣 cascade 3嫄? count?봪ist, ?대뜑 議고쉶 2~3?곗냽). 媛??뺣났 1~2???덇컧 | `Promise.all`. ??`users` ??젣????3嫄??댄썑?ъ빞 ?쒕떎 |
| C-14 | `src\resolver\storage\StorageQuery.js:37` | `SELECT BIN_TO_UUID(project_id), COUNT(*) FROM project GROUP BY project_id` ??`project_id` 媛 PK??`cnt` ??**?몄젣??1**. ?????ㅼ틪 + 洹몃９?묒씠 臾댁쓽誘??섎㉧吏 5媛??ㅽ럺? ?뺣떦???ㅽ뻾 吏묎퀎) | ?⑥닚 `COUNT(*)` ?먮뒗 ?쒓굅 |
| C-15 | `src\rdb\query\CommonQuery.js:11-13`, `UserRepository.js:61-89`쨌`168-213` | deep `OFFSET` ?섏씠吏? ??洹쒕え(users ??0쨀)?먯꽌??臾몄젣 ?꾨땲?? 而ㅼ꽌 諛⑹떇(`getProjectUserWithScrollRepository:165-202`)???대? 援ы쁽???덉뼱 **愿濡媛 媛덈젮 ?덈떎** | 洹쒕え 利앷? ??而ㅼ꽌濡??듭씪 |

---

# ?듦낵 (?뺤씤?덇퀬 臾몄젣 ?놁쓬)

> 移⑤У??"誘멸?利??쇰줈 ?ㅻ룆?섏? ?딅룄濡?紐낆떆?쒕떎.

## ?몃뜳???뺥빀 (DDL ?ㅼ륫 ?議?

`projectusers`(`INDEX(project_id, account_id)` + `INDEX(account_id)`) 쨌 `project_team`(PK 蹂듯빀 + `INDEX(team_key)`) 쨌 `user_skills`/`project_skills`(PK 蹂듯빀 + `INDEX(skill_id)`) 쨌 `gantt_folder`(`INDEX(project_id)`, `INDEX(project_id, parent_folder_id)`) 쨌 `gantt_folder_issue`(PK `issue_key` + `INDEX(project_id)`, `INDEX(folder_id)`) 쨌 `gantt_folder_link`(PK 3而щ읆 + 3蹂댁“) 쨌 `portfolio_project_snapshot`(PK `project_id` + `INDEX(risk_score)` ??`SELECT_ALL ORDER BY risk_score DESC` ? ?뺥솗???쇱튂) 쨌 `project_dashboard`(`INDEX(project_id)`) 쨌 `user_schedule`(`INDEX(account_id)` + `UNIQUE(account_id, schedule_start_date, schedule_type)` ??`FIND_BY_PROJECT_ID` ?좎쭨 踰붿쐞源뚯? 而ㅻ쾭)
??**?꾨? WHERE/JOIN/ORDER BY 而щ읆怨??뺥빀.** ?덉쇅??`users`(B-6)肉먯씠??

## ?섎㉧吏 異?
| 異?| ?뺤씤 ?댁슜 | ?먯젙 |
|----|----------|------|
| **DB N+1 (?ㅺ굔 議고쉶)** | `SkillMappingQuery.SELECT_SKILLS_BY_ACCOUNTS/BY_PROJECTS`, `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNTS`쨌`FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`쨌`FIND_MEMBER_TEAMS_BY_PROJECTS`, `ProjectTeamQuery.FIND_PROJECT_IDS_BY_TEAM_KEYS`, `UserQuery.UPDATE_TEAM_BY_ACCOUNTS` ???꾨? `IN` ???⑺넗由щ줈 1??議곕┰. ?몃떦/?꾨줈?앺듃??諛섎났 荑쇰━??B-4(諛곗튂)瑜?鍮쇰㈃ ?녿떎 | **?듦낵** |
| **bulk write** | `addUsersBulk`(?ㅽ뻾 INSERT IGNORE), `bulkInsertUsers`, `UPSERT_NON_PRIMARY_BULK`, `INSERT_USER_SKILLS(n)`, `INSERT_PROJECT_SKILLS(n)`, `bulkUpdateLayoutsRepository` ???꾨? ?ㅽ뻾 臾몄옣. ?묒? ?낅줈????`consumer.js:82`)??諛곗튂??1 INSERT | **?듦낵** |
| **p-limit ?숈떆???쒗븳** | ?꾨줈?앺듃 吏묎퀎(2), ?뚰겕濡쒓렇 珥덇낵 ?섏씠吏(5), 援щ룆 APPLY(2)쨌湲곕낯異붿젙(2)쨌?뚯뒪硫뷀?(3), ?깅줉??湲곕줉(5), ? ?꾨낫 ?꾨줈??4), ?몃젰遺??諛곗튂(3), myWork/罹섎┛??5) ?????蹂묐젹 吏?먯뿉 ?꾨? ?곹븳 | **?듦낵** |
| **諛곗튂??怨듯넻 ?먯썝 ?몄씠?ㅽ똿** | `PortfolioAggregator.js:490-509` 媛 settings쨌holiday쨌coworkerFieldId쨌`policyCtx` 瑜?猷⑦봽 **諛?1??*濡?議곕떖???꾨줈?앺듃蹂?二쇱엯. 二쇱꽍??*"aggregateOneProject ?덉뿉??濡쒕뱶?섎㈃ ?꾨줈?앺듃 ??횞 KVS ?뺣났 = ?깅뒫 ?ш퀬"* ?쇨퀬 紐삳컯???????紐⑤쾾 ?щ? | **?듦낵** |
| **`resolvePrincipal` 議고쉶 ??* | 30珥?L1 + KVS??`permission` `findById` 1?? ? ?ㅼ퐫??議고쉶??`isTeamLead \|\| TEAM_ONLY` ???뚮쭔(`:151-158`), ???꾨줈?앺듃 id 議고쉶??`Promise.all`(`:402-404`) | **?듦낵**(?숈떆 吏꾩엯 ??罹먯떆 誘몄쟻以묒? A-6) |
| **`TeamTreeCache`** | 60珥?TTL, ?곌린 寃쎈줈留?`loadTeamIndexFresh`. ? 100媛??댄븯硫?miss ??KVS 1??| **?듦낵** |
| **coworker resolve N+1** | `CoworkerResolver.js:20-40` ???섏씠吏 ?꾩껜 coworker id瑜?dedup ??**?붿껌??bulk 1??*. 移댁슫?몃쭔 ?꾩슂???뚮퉬泥섎뒗 ?곗? 留먮씪??寃쎄퀬媛 二쇱꽍???덇퀬 ?ㅼ젣濡?progress/cost/portfolio??`accountId[].length` 留??대떎 | **?듦낵** |
| **?몃젰 遺??諛곗튂(`ResourceLoadFetcher`)** | accountId 50媛?泥?겕 횞 `pLimit(3)`, POST search + `nextPageToken` 猷⑦봽, 泥?겕 ?⑥쐞 ?ㅽ뙣 寃⑸━, 洹몃９ 吏묎퀎瑜?**異붽? Jira 0??*濡?媛숈? ?⑥뒪?먯꽌 ?섏쭛(`:264-347`) | **?듦낵** |
| **? ?꾨낫 ?꾨줈??`TeamService.js:326-353`)** | 100媛?泥?겕 `pLimit(4)` 蹂묐젹 + 泥?겕 ?⑥쐞 ?ㅽ뙣 寃⑸━. 1,000紐?= Jira 10??3?쇱슫??| **?듦낵** |
| **`MyTeamAnalysisService.js:101-109`** | 7媛??낅┰ ?몄텧???섎굹??`Promise.all`, ?몄썝 異뺤쓣 `leadingScopeAccountIds` 濡?**癒쇱? 醫곹엺 ??* 議고쉶(B-7??吏?ν빐?????뺥깭) | **?듦낵** |
| **`mySchedule/*` ?꾩껜** | ?꾨? ?④굔 SQL. 猷⑦봽쨌N+1쨌Jira ?몄텧 0嫄?| **?듦낵** |
| **`storage/*` ?꾩껜** | 珥?SQL 8??`information_schema` 1 + ?꾨줈?앺듃紐?1 + ?됱닔 6媛?**蹂묐젹**), 媛쒕퀎 try/catch 寃⑸━ | **?듦낵**(C-14 ?쒖쇅) |
| **`MyPageService.jsx`** | ??μ냼瑜??쎌? ?딅뒗 ?쒖닔 ?묒? ?щℓ?? `MAX_ROWS=20000` ?곹븳 | **?듦낵** |
| **`ProjectCalendarService` / `ResourceWorklogFetcher`** | 珥덇낵 ?뚰겕濡쒓렇瑜?`EXTRA_PAGE_SIZE=100` offset 紐⑸줉 ??`Promise.all` 蹂묐젹. **A-1??吏?ν빐?????뺥깭** | **?듦낵** |
| **`GanttService.getProjectGanttData`** | ?꾩슜 ?섏쿂 1?⑥뒪 + ?대뜑 3荑쇰━ 蹂묐젹 + coworker bulk 1?? issuelinks瑜?search ?묐떟??inline?쇰줈 諛쏆븘 per-issue ?몄텧 0 | **?듦낵** |
| **?먯젙 紐⑤뱢** | `permissionGuard`쨌`ResourceCatalog`쨌`TeamAnalyticsScope`쨌`TeamLeadFieldPolicy`쨌`ProjectScope`쨌`CostAccess` ?꾨? **I/O 0 ?쒖닔 紐⑤뱢** | **?듦낵** |
| **`SkillService.js:58`** | `findAllPaged('name', 100, CATALOG_MAX_ITEMS)` 濡?100嫄?罹??뚰뵾 + bulk 寃쎈줈? ?곹븳 ?곸닔 怨듭쑀 | **?듦낵**(role/level? C-6) |
| **以묐났 ?대쫫 寃利?4醫?* | ?꾨? `findByWhere` ?몃뜳???숇벑寃??1?? ?꾨웾 ?ㅼ틪 ?꾨떂 | **?듦낵** |
| **`PortfolioSnapshotQuery.SELECT_ALL` ??JSON 3而щ읆** | `SELECT *` ?⑥슜?쇰줈 ?섏떖?덉쑝??`PortfolioDashboardService.js:242-244` 媛 `members_json`/`monthly_effort_json`/`weekly_effort_json` ???꾨? ?뚮퉬 ???뺣떦 | **?듦낵** |
| **`ProjectService` ??젣 cascade 10?곗냽 吏곷젹** | 蹂묐젹??媛?ν빐 蹂댁씠??TiDB ?몃옖??뀡 遺???섏뿉??"?먯떇 ??遺紐? ?쒖꽌媛 ?ъ떆???덉쟾?깆쓽 寃쎄퀎?대ŉ 二쇱꽍??洹쇨굅瑜?紐낆떆 | **?듦낵**(?섎룄??吏곷젹) |
| **`TableReadiness` ?꾨줈釉?* | `true` 留?紐⑤뱢 罹먯떆 ??而⑦뀒?대꼫??1??`information_schema` 議고쉶. 諛고룷-留덉씠洹몃젅?댁뀡 ?쒖감 諛⑹뼱濡??섎룄??| **?듦낵** |
| **TTL ?덈뒗 KVS 罹먯떆** | `ProjectProgress`/`ProjectCost`(10遺?, `ResourceAnalysis`(5쨌10遺?, `WorklogService`(10遺?, ?쇱씠?좎뒪(1h/1遺? 紐⑤몢 TTL 吏????臾댄븳 ?꾩쟻 ?놁쓬. `ProjectService.js:105쨌110` ???꾨줈?앺듃 ??젣 ???뚯깮 罹먯떆 ?ㅻ? 紐낆떆 delete | **?듦낵**(罹먯떆 **?④낵**??A-2) |
| **`onIssueCreated` ??＜ 諛⑹뼱** | 援щ룆 誘몄〈????**Jira ?몄텧 0??* 議곌린 醫낅즺. ?덈? throw ?섏? ?딆븘 ?ъ떆????＜ ?놁쓬 | **?듦낵**(?쒖꽌??B-10) |
| **?섎룞 ?ъ쭛怨?CTA** | ??1?대깽?몃쭔 ?ｊ퀬 `aggregatingStartedAt` ?쎌씠 以묐났 ?ㅽ뻾 李⑤떒 ???고?濡?鍮꾩슜??諛곗쬆?섏? ?딅뒗??| **?듦낵** |
| **?ㅼ?以?二쇨린 ?鍮?珥앸웾** | ?ы듃?대━??= day 1?? 由ъ빻??= hour 24?? ?????댁긽???⑥? 諛곗닔 ?놁쓬 | **?듦낵**(init-db hour??C-2) |
| **由ъ빻???뺤긽 寃쎈줈** | watermark `updated >=` 利앸텇 李쎌쑝濡?援щ룆???쒓컙??寃??1~2?섏씠吏. 20援щ룆 ??480~960 寃???쇰줈 ?덉궛(600/?ㅽ뻾) ?鍮??ъ쑀 | **?듦낵**(?뺤껜 ?쒕뒗 B-11) |
| **?뚰겕濡쒓렇 SQL ?뚯씠釉?異?* | `ddl/worklog.js` ?꾩껜 二쇱꽍 + `ddl/index.js` 誘몃벑濡?= ?뚯씠釉?誘몄〈?? ?뚰겕濡쒓렇 DB N+1 異뺤? **?대떦 ?놁쓬** | **?대떦 ?놁쓬** |

---

# 誘멸?利?(??媛먯궗濡??뺤젙?????녿뒗 寃?

| ??ぉ | ?ъ쑀 |
|------|------|
| Forge媛 **?숈떆 invoke瑜?媛숈? 而⑦뀒?대꼫濡?蹂대궡?붿?** | 紐⑤뱢 ?ㅼ퐫??罹먯떆(`PrincipalResolver` L1, `TeamTreeCache`, `fieldIdCache`)???ㅽ슚 ?곸쨷瑜좎씠 ?ш린 ?щ젮 ?덈떎. 而⑦뀒?대꼫媛 媛덈━硫?in-flight dedup?쇰줈??A-6??諛곗닔瑜?紐?留됰뒗????**洹몃옒??A-6??1?쒖쐞 ?섏젙? dedup???꾨땲??`isAdministrator` 蹂묐젹??*濡??≪븯??|
| `/rest/api/3/search/jql` ??`maxResults` ?ㅽ슚 ?곹븳 | B-1??`maxResults=5000` ???ㅼ젣濡?5,000嫄댁쓣 ?뚮젮二쇰뒗吏(硫붾え由??꾪뿕) ?섎━?붿?(議곗슜???꾨씫) 肄붾뱶濡??뺤젙 遺덇?. **?대뒓 履쎌씠???섏씠吏 猷⑦봽 遺?щ뒗 寃고븿**?대씪??寃곕줎? ?깅┰ |
| TiDB???ㅼ젣 ?ㅽ뻾 怨꾪쉷 | A-8쨌B-6? ?쒖? SQL ?먮━(鍮?sargable ?좎뼱, ?몃뜳??遺????洹쇨굅?쒕떎. TiDB ?듯떚留덉씠?媛 ?대뼸寃?泥섎━?섎뒗吏??`EXPLAIN` ?ㅼ륫???꾩슂?섎떎 |
| ?ㅼ젣 ?ъ씠?몄쓽 `w_i` 遺꾪룷 | A-1/A-5??諛곗닔??"?뚰겕濡쒓렇 20嫄?珥덇낵 ?댁뒋 鍮꾩쑉"???좏삎?대떎. 10%/30% ??媛吏濡??쒖떆?덉쓣 肉??ㅼ륫???꾨땲??|
| 媛??붾㈃???ㅼ젣 ?꾩젽 ??`W` | A-3/A-7????쒕낫??諛곗닔???ъ슜?먭? 諛곗튂???꾩젽 ?섏뿉 鍮꾨?. ?쒕뱶 湲곕낯 ??쒕낫??援ъ꽦? ?뺤씤?섏? ?딆븯??|
| KVS/SQL ?뺣났???ㅼ젣 吏??ms) | ?몄텧 **?잛닔**留??뚮떎. "紐?珥?鍮⑤씪吏?붽?"??諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂 |
| ?꾨줎??React Query 罹먯떆媛 ?≪닔?섎뒗 ?ы샇異?鍮꾩쑉 | `staleTime` ??嫄몃┛ 荑쇰━(??쒕낫???꾩젽 5遺??????щ갑臾????쒕쾭瑜???移쒕떎. 蹂?媛먯궗 ?섏튂??**cold 吏꾩엯 1??* 湲곗? |

# ?꾨줎?몄뿏??鍮꾪슚?㉱룰퀬鍮꾩슜 濡쒖쭅 媛먯궗 ??2026-08-12

- **???*: `static/ui/src` ?꾩껜 (582 ?뚯씪, JS/JSX)
- **?뚯뒪**: `develop` @ `2556a51` 湲곗? ?묒뾽 ?몃━
- **諛⑸쾿**: ?뺤쟻 異붿쟻(?앹궛???뚮퉬???숈떆 ?쎄린) + 鍮뚮뱶 ?곗텧臾??뚯뒪留?諛붿씠??洹??遺꾩꽍. **肄붾뱶 ?섏젙 ?놁쓬**
- **踰덈뱾 怨꾩륫**: `static/ui/build` ?곗텧臾?2026-08-12 15:34 鍮뚮뱶)??`main.js.map` ??VLQ ?뚯떛???⑦궎吏蹂??앹꽦 諛붿씠?몃? 洹??
> ?ш컖????**P1** 泥닿컧 ??/ **P2** 以묎컙 / **P3** ?ъ냼

### ?쒖쇅(?щ낫怨?????
- 援щ룆 媛먯궗(`_workspace/subscription-audit/AUDIT_2026-08-11.md`) 蹂닿퀬遺???F-8 ?뚯뒪 寃??臾대뵒諛붿슫????`projectDetail/issue/subscription/` ?꾩뿭
- RFC-160/182~185 而ㅻ컠???뚮젮吏??뱀꽦 ?????숆껐 怨꾩륫, ?⑤꼸 localStorage, `CardFullscreen`/`CardCollapseContext` ??1?뚯꽦 resize ?붿뒪?⑥튂(?뚯씪 二쇱꽍???섎룄 紐낆떆)
- ?섎룄??寃곗젙 ??肄붾뱶 ?ㅽ뵆由ы똿 援ъ“(2026-08-05 ?щ룄??, ?뚰겕濡쒓렇 湲곕뒫蹂??꾩슜 ?섏쿂 遺꾨━

---

## ?붿빟

| ?ш컖??| 嫄댁닔 | ?????ぉ |
|--------|------|-----------|
| **P1** | 14 | 踰덈뱾 ?좎텧(main 34%), ?④? ??8 invoke, ??3以?留덉슫?? `getUser` N+1 4怨? 媛꾪듃 ?몄쭛留덈떎 ?꾨웾 ?ъ“?? 3珥?諛깃렇?쇱슫???대쭅 |
| **P2** | 21 | ??쒕낫???꾨웾 ?대쭅 44?? 移몃컲 ?대쭅???ъ슜??濡쒕뱶遺???젣, 愿묒뿭 invalidate 2怨? staleTime ?꾨씫 8怨?|
| **P3** | 36 | 誘몃찓紐??뚯깮媛뮻룹씤?쇱씤 ?대줈?쨌v5 臾댄슚 ?듭뀡 7怨냈룸뜲?쒖퐫??|

**?섏젙 ?곗꽑?쒖쐞 沅뚭퀬**: P1-1(踰덈뱾 ?????ъ슜??珥덇린 濡쒕뵫) ??P1-13 + P1-12(???대뙌?걔룻뻾 議곕┰, ???몄뒪?댁뒪 65媛쒖뿉 怨깊빐吏? ??P1-2/P1-3(??留덉슫????吏꾩엯??invoke쨌?뚮뜑 ??컻) ??P1-4 + P1-14(?ъ슜???뺣낫 N+1 怨?洹?罹먯떆 ???ㅺ퀎??**?④퍡** 怨좎퀜???대뱷???⑥쟾?섎떎) ??P1-5/P1-7/P1-9 ??

> **??以??뺣━**: 愿???먯껜???????덈떎(?붾컮?댁뒪 10怨? 罹먯떆 ?⑥튂 洹쒖빟, 荑쇰━???⑺넗由?怨꾩빟 ?뚯뒪?? ECharts 遺꾨━, `assignment/` 紐⑤쾾 ?щ?). 臾몄젣??嫄곗쓽 ?꾨? **洹?愿?됱뿉???댄깉???뚯닔 吏??*?대ŉ, ?댄깉??怨녹씠 ?섑븘 **媛?????곗씠?걔룰?????? 吏꾩엯 寃쎈줈**??紐곕젮 ?덈떎.

---

## ?꾩젣 ?????꾨옒 ?щ윭 ??ぉ??鍮꾩슜???ш린???뚯깮?쒕떎

### (a) React Query ?꾩뿭 湲곕낯媛믪씠 鍮꾩뼱 ?덈떎

`static/ui/src/index.js:37`
```js
const queryClient = new QueryClient()
```

`defaultOptions` 誘몄?????v5 湲곕낯媛?洹몃?濡? **`staleTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`, `retry: 3`**.

- ??131媛?以?127媛쒖냼媛 `staleTime` ??媛쒕퀎 紐낆떆??諛⑹뼱?덉?留? **?꾨씫??8媛?荑쇰━??李??ъ빱?ㅺ? ?뚯븘???뚮쭏?ㅒ룹옱留덉슫?몃쭏???ъ“??*?쒕떎(P2-6).
- `retry: 3` ???꾩뿭?대떎. queryFn ?먯꽌 `if (!res?.success) throw` ?섎뒗 ?뚯씪??**40媛?*?몃뜲 `retry` 瑜?override ???뚯씪? **9媛?*肉???沅뚰븳 嫄곕?쨌?쇱씠?좎뒪 李⑤떒쨌?뚯씠釉?誘몄?鍮꾩쿂??**?ъ떆?꾪빐???덈? ?깃났?섏? ?딅뒗 ?ㅽ뙣**媛 ?됰룞 1?뚮떦 **invoke 4??*(1s/2s/4s 諛깆삤??瑜??쒖슦怨??섏꽌???먮윭 ?붾㈃???щ떎.
- **?섏젙 諛⑺뼢**: `new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, e) => n < 2 && !isPermanentError(e) } } })` 濡?諛붾떏??源붽퀬, ?ㅼ떆媛꾩꽦???꾩슂??怨노쭔 媛쒕퀎 override.

### (b) 而댄룷?뚰듃 硫붾え?댁젣?댁뀡???ъ떎???녿떎

`React.memo` ?ъ슜泥섎뒗 ???깆뿉 **1嫄?*(`backoffice/page/projectStatus/modal/flow/ProjectStatusFlow.jsx:34`, xyflow ?붽뎄?ы빆). `useMemo` 556 / `useCallback` 129 濡?**?곗씠?곕뒗 硫붾え?섏?留?而댄룷?뚰듃쨌??議곕┰? 硫붾え?섏? ?딅뒗** ?⑦꽩???쇨????덈떎.

???깆쓽 ?뚯씠釉붿? Atlaskit DynamicTable 怨꾩빟??`rows = [{ key, cells: [{ content: <JSX/> }] }]` ?뺥깭??**??議곕┰ ?먯껜媛 JSX ?몃━ ?앹꽦**?대떎. ?곕씪??`React.memo` 遺???먯껜蹂대떎 **`rows` ?앹꽦??`useMemo` 諛뽰뿉 ?덈뒗 寃?*???ㅼ젣 鍮꾩슜?대떎 ??P1-12(??JSX 議곕┰)? P1-13(洹??꾩뿉 ?뱁엳??怨듭슜 ?대뙌????洹?紐⑸줉?대떎. (?꾪궎?띿쿂 ?먯껜???뺤긽 ?먯젙 ??媛쒕퀎 吏?먮쭔 怨좎튂硫??섍퀬, `TableSurface` ??`React.memo` 瑜???踰??먮㈃ 鍮꾨찓紐??몄텧遺瑜?怨좎튂吏 ?딄퀬???곷떦 遺遺?諛⑹뼱?쒕떎)

---

## P1 ??泥닿컧 ??
### P1-1. 湲곕낯 吏꾩엯 ?쇱슦?멸? 留덊겕?ㅼ슫 ?먮뵒?걔룹틮由곕뜑 ?ㅽ깮??`main` 踰덈뱾??怨좎젙?쒗궓??(痢≪젙移?

- **?뺤쟻 import 泥댁씤**: `App.jsx:23` (`import WorklogPage from "./pages/myWork/WorklogPage"` ???섎룄???뺤쟻) ??`pages/myWork/WorklogPage.jsx:2-3` ??`components/calendar/FullCalendar.jsx:1-5` (`@fullcalendar/*`, `@fullcalendar/moment-timezone`) / `pages/myWork/modal/WorklogModal.jsx:22-24` ??`components/markdown/MarkdownEditor.jsx:1,10` (`@mdxeditor/editor` + `style.css`), `marklassian`, `adf-to-md`

`App.jsx:26-27` ??肄붾뱶 ?ㅽ뵆由ы똿??紐⑹쟻??**紐낆떆?곸쑝濡?* ?대젃寃??곸뼱 ?먯뿀??

```
// 臾닿굅???쇱씠釉뚮윭由?ECharts/ApexCharts/FullCalendar/MDXEditor/xyflow/kanban/gantt)媛
// 媛??섏씠吏瑜??곕씪 main 諛뽰쑝濡?鍮좎???寃껋씠 ??遺꾨━??紐⑹쟻?대떎.
```

洹몃윴??**FullCalendar ? MDXEditor ??紐⑹쟻?濡?鍮좎?吏 ?딆븯??** 湲곕낯 吏꾩엯 ?쇱슦?몃쭔 ?뺤쟻?쇰줈 ?먮뒗 寃곗젙?? 洹??쇱슦?멸? ???쇱씠釉뚮윭由щ? ?뺤쟻?쇰줈 ?뚭퀬 ?ㅻ뒗 諛붾엺??臾대젰?붾릱??

**鍮꾩슜 ?뺣웾** (?뚯뒪留?諛붿씠??洹?? `main.4db70f69.js` ?먮낯 3,702KB / gzip 898KB ???덉궛 950KB):

| ?ㅽ깮 | main ???먮낯 諛붿씠??| 鍮꾩쨷 |
|------|---------------------|------|
| MDXEditor 怨꾩뿴 (`@mdxeditor/editor` + `lexical`쨌`@lexical/*` + `@codemirror/*` + `prismjs` + `micromark`/`mdast`/`marked` + `@radix-ui/*`) | **986 KB** | **27.3%** |
| FullCalendar + `moment`(-timezone) | **275 KB** | **7.6%** |
| ?⑷퀎 | **1,261 KB** | **34.1%** |

- 媛쒕퀎 ?곸쐞 湲곗뿬: `@codemirror/view` 191KB, `@fullcalendar/core` 154KB, `lexical` 120KB, `@mdxeditor/editor` 99KB, `moment` 60KB, `prismjs` 55KB, `@codemirror/state` 49KB
- `main.895b72f2.css` **156KB** ?먮룄 mdxeditor ?대옒??15媛쒖냼쨌`fc-daygrid` ??FullCalendar 洹쒖튃???ы븿
- gzip ?섏궛 ??main 898KB 以????**250~300KB** (?먮낯 鍮꾩쨷 34% 횞 肄섑뀗痢좊퀎 ?뺤텞瑜??몄감). ?덉궛 ?ъ쑀媛 52KB 肉먯씠誘濡?**踰덈뱾 ?덉궛 寃뚯씠?몃? ?ㅼ젣濡??꾪삊?섎뒗 ?좎씪???⑹뼱由?*??
- **?꾧? ??鍮꾩슜???대뒗媛**: MDXEditor ??`WorklogModal` ?덉뿉?쒕쭔 ?곗씤??`WorklogModal.jsx:619`) ??**?뚰겕濡쒓렇 ?깅줉 踰꾪듉????踰덈룄 ?꾨Ⅴ吏 ?딆? ?ъ슜?먮룄 986KB 瑜??대젮諛쏅뒗??** ECharts(1,112KB 泥?겕)??媛숈? 洹쒖튃?쇰줈 ?대? ?щ컮瑜닿쾶 遺꾨━???덉뼱(`components/chart/echart/ThemedECharts.js:15` 二쇱꽍??洹쇨굅源뚯? 紐낆떆) **愿?됱씠 ??怨노쭔 ?닿툔???뺥깭**??

**援먯감 寃利?*: ??媛吏 ?낅┰?곸씤 怨꾩륫??媛숈? 寃곕줎???꾨떖?덈떎 ?????뚯뒪留?`mappings` VLQ ?뚯떛?쇰줈 **?앹꽦 諛붿씠??*瑜?洹??????, ???뚯뒪留?`sourcesContent` 瑜??⑦궎吏蹂??⑹궛??**?먮낯 ?뚯뒪 ?ш린**(MDXEditor 怨꾩뿴 2,002KB + FullCalendar 531KB + moment 189KB = main sourcesContent 珥앺빀 8,055KB ??**34%**). ??諛⑸쾿??34%濡??쇱튂?쒕떎. ?ㅼ껜??吏곸젒 ?뺤씤?덈떎 ??`main.js` ?덉뿉 tz ?곗씠??臾몄옄??`America/New_York`, `Asia/Seoul`, `Antarctica/Vostok`)怨?`lexical` ?щ낵 118媛? `fc-*` ?대옒??223媛쒓? 洹몃?濡??덈떎.

**?섏젙 諛⑺뼢**: `WorklogPage` ???뺤쟻?쇰줈 ?좎?(泥??붾㈃ ?뺣났 ?좎?)?섎릺 洹??덉뿉?????⑹뼱由щ쭔 lazy 濡??대┛??????`MarkdownEditor` 瑜?`React.lazy` + 紐⑤떖 ?대? Suspense 寃쎄퀎(紐⑤떖 ?ㅽ뵂 ?쒖뿉留?濡쒕뱶), ??`CustomFullCalendar` 瑜?`React.lazy` + 罹섎┛???곸뿭 Suspense 寃쎄퀎. `marklassian`/`adf2md` ???숈쟻 `import()` 濡?蹂???쒖젏?먮쭔. ?④낵 ?뺤씤? `CI=true npm run build` ??`node scripts/check-bundle-budget.js`.

---

### P1-2. `/resource` 吏꾩엯 ??**蹂댁씠吏 ?딅뒗 ??3媛?*???곗씠?곌? ?꾨? 濡쒕뱶?쒕떎

- `pages/resource/ResourcePage.jsx:52-73` ??`<TabPanel>` 4媛쒕? 議곌굔 ?놁씠 ?뚮뜑
- ?먯씤: Atlaskit `@atlaskit/tabs@18.3.4` ??`TabPanel` ? children ??**臾댁“嫄??뚮뜑**?섍퀬 HTML `hidden` ?띿꽦留?遺숈씤??(`node_modules/@atlaskit/tabs/dist/cjs/components/tab-panel.js:22-41` ??`React.createElement(Focusable, {..., hidden}, ... children)` ?뺤씤)

利?4媛???쓽 ?낆씠 **?숈떆???ㅽ뻾**?쒕떎.

**鍮꾩슜 ?뺣웾 ???섏씠吏 吏꾩엯 1?뚮떦 invoke 8嫄?* (?숈씪 ?ㅻ뒗 dedup 諛섏쁺):

| resolver | ?뚯쑀 ??| 泥??붾㈃???꾩슂? |
|---|---|---|
| `getResourceOverview` / `getResourceLoadSummary` / `getSettingData` / `getTeamOptions` | ?몃젰?꾪솴(怨듭쑀) | O |
| `getTeamAnalyticsScope` | ? 遺꾩꽍(**?④?**) | X |
| **`getPortfolioDashboard`** | ? 遺꾩꽍(**?④?**) | X ?????꾨줈?앺듃 raw + `members[]`쨌`monthlyEffort[]`쨌`weeklyEffort[]` ?꾨웾 |
| `getAssignmentProjectCards` | ?꾨줈?앺듃 諛곗젙(**?④?**) | X |
| **`getAssignmentProjectMetrics`** | ?꾨줈?앺듃 諛곗젙(**?④?**) | X ?????꾨줈?앺듃 Jira 諛곗튂 ?ㅼ틪 |

媛??臾닿굅??2嫄댁씠 **?????④? ???뚯쑀**?? 怨꾩궛???④퍡 ??퉬?쒕떎 ???④? `TeamAnalyticsTab` ??`teamMetricsByTeam` + `rollupTeamTree`(`teamAnalytics/hooks/useTeamAnalyticsData.js:153-183`)瑜??뚮━怨?**ECharts ?몄뒪?댁뒪 6媛쒕? ?ㅼ젣濡??앹꽦**?섎ŉ, ?④? `OrganizationTab` ??`aggregateByTeam` + `rollupTeamTree`(`organization/OrganizationTab.jsx:110-129`)瑜? ?④? `ProjectAssignmentBoard` 媛 `hydratePeople` + `sortHydratedRows`(`assignment/ProjectAssignmentBoard.jsx:143-152`)瑜????몄썝??????뚮┛??

> ?議곌뎔: ?섎㉧吏 ??而⑦뀒?대꼫???뺤긽?대떎. `components/tabs/CommonTab.jsx:70-81` ? **?쒖꽦 ???섎굹留?* ?뚮뜑?쒕떎(`MainPageTabs`/`ProjectDetailTabs` 媛 ?닿구 ?대떎). `ResourcePage` 留?raw `TabPanel` ???곕뒗 ?덉쇅??

**?섏젙 諛⑺뼢**: `Tabs` ??`selected`/`onChange` 瑜?遺숈뿬 `{selected === n && <XxxTab/>}` 濡?媛먯떥嫄곕굹, `CommonTab` ?쇰줈 ?닿??쒕떎.

**媛숈? ?먯씤???뚭퇋紐??щ?**: `pages/projectDetail/issue/IssueAddModal.jsx:207-211` ??"?묒뾽 異붽?" 紐⑤떖???닿린留??대룄 `activeTab === 0` ?몃뜲 `SubscriptionTab` ??留덉슫?몃뤌 援щ룆 ?곗씠???섏튂媛 ?쒖옉?쒕떎.

---

### P1-3. ?꾨줈?앺듃 ?곸꽭 吏꾩엯 ??**?쒖꽦 ???꾩껜媛 3踰?留덉슫?몃릺怨?2踰??먭린**?쒕떎

?곗뇙 (紐⑤몢 ?뺤씤):
1. `pages/projectDetail/ProjectDetailPage.jsx:22` ??`const toast = ToastFlags();` (?뚮뜑 蹂몃Ц 吏곸젒 ?몄텧)
2. `components/feedback/ToastFlags.js:75-86` ??`return { showSuccess: ..., FlagUI: <FlagPortal register={register}/> };` ??**留??뚮뜑 ??媛앹껜 由ы꽣??+ ??JSX**
3. `components/tabs/ProjectDetailTabs.jsx:22-25` ??`useMemo(..., [t, project_id, toast, ...])` ??`toast` ?꾩씠?댄떚?곌? 留ㅻ쾲 諛붾뚯뼱 **硫붾え媛 ?덈? ?덊듃?섏? ?딅뒗??*
4. `constants/tabs.js:80,99,109,...` ??`component: () => <DashboardPage project_id={project_id}/>` ?뺥깭??**?몃씪???붿궡??而댄룷?뚰듃 12媛?*媛 留ㅻ쾲 ???⑥닔濡??앹꽦
5. `components/tabs/CommonTab.jsx:78` ??`<ActivePage />` ??element **type ???щ씪吏誘濡?React 媛 ?쒕툕?몃━瑜??듭㎏濡??몃쭏?댄듃/由щ쭏?댄듃**

**鍮꾩슜 ?뺣웾**: `ProjectDetailPage` ??吏꾩엯 ??理쒖냼 3???뚮뜑?쒕떎(珥덇린 / `forgeContextKeys.current()` = `view.getContext()` ?댁냼 / `findProjectById` ?댁냼 ??`:29-42`). 利?**湲곕낯 ??`DashboardPage` 媛 3踰?留덉슫?몃릺怨?2踰?踰꾨젮吏꾨떎.** 留덉슫?몃쭏??ECharts ?몄뒪?댁뒪 ?ъ깮??+ `react-grid-layout` ?ъ륫??+ staleTime ?녿뒗 荑쇰━ ?ъ슂泥?`dashboard/DashboardPage.jsx:52-55` `getChartInfo`, `dashboard/summary/SummaryPanel.jsx:15-20` `getSummaryData`)???곕씪?⑤떎. ?댄썑 遺紐④? ??踰덈쭔 ???뚮뜑?섎㈃ ?ъ슜?먭? 嫄몄뼱???꾪꽣쨌?좏깮 ?몃뱶쨌酉곕え?쒓? **?꾨? 珥덇린??*?쒕떎.

**?섏젙 諛⑺뼢**: `const toast = useMemo(() => ToastFlags(), [])` (?대? `show*` ???대? ref 湲곕컲?대씪 ?덉쟾) + `tabs.js` ???몃씪???붿궡?쒕? 而댄룷?뚰듃 李몄“ + props ?꾨떖濡?援먯껜.

---

### P1-4. `getUser` N+1 ??4媛??붾㈃???몄썝 ?섎쭔??媛쒕퀎 Jira ?몄텧 (踰뚰겕 寃쎈줈媛 ?대? ?덈뒗??誘몄궗??

| ?꾩튂 | 肄붾뱶 | 鍮꾩슜 |
|---|---|---|
| `pages/projectDetail/cost/CostByIssueTable.jsx:66-74` | `for (let i=0; i<accountIds.length; i+=5) { await Promise.all(...map(id => executeRequest('getUser', {accountId:id}))) }` | 硫ㅻ쾭 40紐???**40 ?몄텧 / 8 ?쒖감 ?쇱슫??*, 鍮꾩슜 ??**吏꾩엯 利됱떆**(?쒕줈???닿린 ?? |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:112-118` | `Promise.all(userIds.map(accountId => executeRequest('getUser', {accountId})))` | ?섏씠吏??10 ?몄텧, 100紐??꾨줈?앺듃 ?꾩＜ = **100 ?몄텧**. staleTime ?놁뼱 ?ъ쭊?낅쭏??諛섎났 |
| `pages/projectDetail/user/ProjectUserPanel.jsx:88-101` | ?숈씪 ?⑦꽩 | ?섏씠吏??10 ?몄텧, 10?섏씠吏 = **100 ?몄텧**. staleTime ?놁쓬 |
| `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:131-144` | 5媛쒖뵫 ?쒖감 諛곗튂 | ? ?꾪꽣 ??`USER_MAX=100` ??**100 ?몄텧 / 20 ?쒖감 ?쇱슫??* |

**?대? 踰뚰겕 寃쎈줈媛 ?덈떎**: `utils/useJiraUserInfos.js:5-26` (`fetchBulkUsers` ??`/user/bulk`, 50 id/?몄텧) + `utils/jiraApi/users/getUserInfos.js` (`useUserInfos`, staleTime 10遺?. `pages/projectDetail/taskHistory/TaskHistoryTable.jsx:108` ? ?대? ?닿구 ?대떎.

**?섏젙 諛⑺뼢**: ??怨?紐⑤몢 `useUserInfos(accountIds)` 濡?援먯껜 ??100紐낆씠 **2 ?몄텧**. `CostByIssueTable` ? 異붽?濡?`enabled` 瑜??쒕줈???ㅽ뵂??嫄몄뼱 吏꾩엯 ??0 ?몄텧濡?

---

### P1-5. 媛꾪듃/?몃━ ?몃씪???몄쭛 3醫낆씠 留ㅻ쾲 **?꾨줈?앺듃 ?댁뒋 ?꾨웾 ?ъ“??*瑜?嫄대떎 (+ 罹먯떆 ?⑥튂 洹쒖빟 ?꾨컲)

- `pages/projectDetail/gantt/useGanttMutations.js:443-445` (?대떦?? / `:511-513` (?묒뾽?? / `:584-586` (怨꾪쉷 MD)

```js
onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
},
```

????紐⑤몢 `onMutate` ?숆? ?⑥튂 + `onError` 濡ㅻ갚???대? 媛뽰떠 ?볤퀬 **留덉?留됱뿉 ?꾩껜 臾댄슚??*瑜?嫄대떎. `ganttKeys.data` ??`getProjectGanttData` ???쒕쾭?먯꽌 ?꾨줈?앺듃 ?댁뒋瑜?JQL 濡??꾨웾 ?섏씠吏??섏쭛(`src/resolver/gantt/GanttService.js:66-71`)?섍퀬 ?대뜑 3荑쇰━ + `resolveCoworkerUsersMap` 踰뚰겕 ?좎? 議고쉶源뚯? ?섎뒗 **媛??臾닿굅??resolver** ??

**鍮꾩슜 ?뺣웾**: 洹몃━?쒖뿉???대떦??1紐?蹂寃?= 沅뚰븳議고쉶(紐⑤뱢 TTL 罹먯떆 hit) + `assignIssue` + **??珥덉쭨由??꾨웾 ?ъ“??1??*. 20???곗냽 吏??= ?꾨웾 ?ъ“??20??

**異붽?濡??묒뾽??`useUpdateCoworkers`)??洹쒖빟 ?꾨컲?대떎**: ???낆씠 遺瑜대뒗 `updateProjectIdField` ??`src/resolver/projectIssue/ProjectUsersService.js:270-283` ?먯꽌 `setAppFieldValueForIssues`(??而ㅼ뒪??꾨뱶 write)瑜??꾨떎. **而ㅼ뒪??꾨뱶 write 吏곹썑 invalidate** ??Jira 寃???몃뜳??吏???뚮Ц????由ы룷媛 湲덉???諛붾줈 洹??⑦꽩?대떎(CLAUDE.md?뚰봽濡좏듃?붾뱶 Jira 吏곸젒 ?몄텧??.

> 媛숈? ?뚯씪 怨꾩뿴???뺣컲? 愿?됱쓣 紐낆떆?곸쑝濡?援ы쁽???먯뿀????`useGanttFolderMutations.js:16-21`(invalidate 湲덉?, ?묐떟 湲곕컲 遺遺??⑥튂), `useGanttMutations.js:156-158`(?쇱젙/遺紐?留곹겕??"?몃뜳??吏???뚮Ц??invalidate ???" 洹쇨굅 二쇱꽍). **??3媛쒕쭔 ?댄깉**?덈떎.

**?섏젙 諛⑺뼢**: `onSettled` 3媛쒕? ?쒓굅?섍퀬 `onSuccess` ?먯꽌 ?쒕쾭 ?묐떟?쇰줈 ?대떦 task 留?`setQueryData` ?⑥튂 ???ы띁 `patchTask` 媛 媛숈? ?뚯씪 `:23` ???대? ?덈떎.

---

### P1-6. ?쒖감 20?섏씠吏 ?댁뒋 ?щ· 2怨?+ **?댁뒋 1嫄??깅줉???꾩껜 ?ы겕濡ㅼ쓣 ?좊컻**

- `pages/projectDetail/issue/useWorkListQueries.js:60-79` ??`do { await executeRequest('searchIssueWithJQL', param) } while (nextPageToken)`, ?곹븳 `issue/workListQuery.js:17-19` (`MAX_PAGES=20, MAX_ISSUES=2000, PAGE=100`)
- `pages/projectDetail/taskHistory/TaskHistoryPage.jsx:54-87` ???숈씪 援ъ“, ?곹븳 `:21-23`

而ㅼ꽌 湲곕컲?대씪 **蹂묐젹??遺덇?, ?꾨? 吏곷젹**. 1,200 ?댁뒋 ?꾨줈?앺듃 = 泥??쎌? ?꾩뿉 **12???뺣났**. ?묒뾽紐⑸줉 履쎌? 洹?寃곌낵瑜?`buildGroups`(`workListQuery.js:75-98`)濡?洹몃９蹂?`{count, statusDist}` **?뺤닔 紐?媛?*濡?以꾩뿬 踰꾨┛????2,000媛??댁뒋 媛앹껜瑜?諛쏆븘 媛쒖닔留??대떎.

**?ы듃由ш굅**: `pages/projectDetail/issue/IssueAddModal.jsx:119` ?댁뒋 1嫄??깅줉 ??`invalidateQueries(projectKeys.taskHistory(project_id))` ??**12???щ· ?꾩껜 ?ъ떎??*. `issue/subscription/useSubscriptions.js:34` ??媛숈? ?ㅻ? 臾댄슚?뷀븳??

**遺??*: `useWorkListQueries.js:88` ??`fields: ['*all']` 濡????꾨뱶瑜?諛쏅뒗?????뚯씠釉붿씠 ?ㅼ젣 ?곕뒗 嫄?9媛쒕떎.

**?섏젙 諛⑺뼢**: 洹몃９ 移댁슫?몃뒗 `maxResults:0` 移댁슫??荑쇰━ ?먮뒗 ?쒕쾭 吏묎퀎 resolver 濡? ?묒뾽?대젰? ?깅줉???댁뒋瑜?`setQueryData` 濡?append.

---

### P1-7. `JobPollingManager` ??3珥?raw `setInterval` ??**諛깃렇?쇱슫????뿉?쒕룄** 怨꾩냽 ?덈떎

- `polling/jobPolling.js:3` ??`export const POLL_INTERVAL_MS = 3000;`
- `polling/JobPollingManager.jsx:50` ??job ???낅┰ `setInterval(async () => {...}, 3000)`
- `stores/useJobStore.js:43` ??`addJob` ??`.slice(0, 5)` 濡?理쒕? 5嫄?異붿쟻
- `App.jsx:94` ??`MemoryRouter` 諛붾줈 ?꾨옒 臾댁“嫄?留덉슫????**?깆쓽 紐⑤뱺 ?붾㈃**?먯꽌 ?숈옉

**?듭떖**: ?쒖닔 `setInterval` ?대씪 `document.visibilityState` 瑜?蹂댁? ?딅뒗?? ?議곌뎔?쇰줈, 媛숈? ?깆쓽 React Query ?대쭅? `@tanstack/query-core` ??`queryObserver.js:215` `if (this.options.refetchIntervalInBackground || focusManager.isFocused())` 媛?쒕줈 諛깃렇?쇱슫?쒖뿉???먮룞 ?뺤??쒕떎. **???대쭅留??덉쇅??**

醫낅즺 議곌굔??`isTerminalJob` ?먮뒗 `job === null` 肉먯씠?? resolver 媛 怨꾩냽 ?ㅽ뙣?섎㈃ backoff 媛 30珥덉뿉??罹〓릺怨?`jobPolling.js:4,7-10`) **?곴뎄??硫덉텛吏 ?딅뒗??*.

**鍮꾩슜 ?뺣웾**: 異붿쟻 job 5嫄?湲곗? **20 invoke/遺?= 1,200 invoke/?쒓컙**(`getUploadJobStatus`), 釉뚮씪?곗? ??쓣 ?ㅻⅨ 怨녹뿉 ?먯뼱???좎?. `useJobStore` ??localStorage TTL ??24h(`useJobStore.js:6`)??釉뚮씪?곗?瑜??ㅼ떆 ?댁뼱???ш컻?쒕떎.

**?섏젙 諛⑺뼢**: `document.hidden` ?대㈃ ?ㅽ궢?섍퀬 `visibilitychange` 濡??ш컻(1以?媛??. 寃쎄낵 ?쒓컙???곕Ⅸ 媛꾧꺽 ?곹뼢(?? 5遺???10珥?怨?N?????ш린 議곌굔 異붽?.

---

### P1-8. ?ъ슜??寃?됱씠 **???낅젰留덈떎 `invoke`**, 寃뚮떎媛 ?낅젰???좎떎?쒕떎

- `components/select/UserSearchSelect.jsx:100-113` ??`handleInputChange` 媛 `loadUsers({search: val, nextPage:0})` 瑜?**?붾컮?댁뒪 ?놁씠** 利됱떆 ?몄텧
- 吏꾩엯 寃쎈줈: `backoffice/page/user/UserListPaging.jsx:132` ??`components/search/UserSearchFilter.jsx:150`

```js
const loadUsers = useCallback(async ({ search, nextPage = 0 }) => {
    if (loadingRef.current) return;      // ??:46  ?명뵆?쇱씠??以??낅젰? 踰꾨젮吏꾨떎
    ...
    const res = await invoke("searchUser", { keyword: search, page: nextPage, size: 10 });
```

- `utils/useDebounce.js` 媛 ?덇퀬 ?뺤젣 `pages/project/ProjectHeader.jsx:30` ? `useDebounce(name, 300)` ???대떎 ?????뚯씪留?鍮좎죱??
- ???섏걶 嫄?`:46` ??議곌린 return ?대떎. **?붿껌?????덈뒗 ?숈븞?????낅젰? 踰꾨젮吏꾨떎.** `reqSeqRef`(`:60,70`)???묐떟 ??쟾留?留됱? ???쒕∼? 紐?留됱쑝誘濡? 留덉?留?湲?먯쓽 寃?됱씠 ?꾩삁 諛쒖궗?섏? ?딆븘 ??寃곌낵媛 ?⑤뒗 寃쎈줈媛 ?앷릿??

**鍮꾩슜 ?뺣웾**: 寃?됱뼱 N湲??= 理쒕? **N??`invoke('searchUser')`**(媛곴컖 Jira ?ъ슜??寃???뺣났). "?띻만?? ?낅젰 ??6???쒕룄 以??쇰????쒕∼??寃곌낵媛 ?닿툔?쒕떎.

**?섏젙 諛⑺뼢**: `useDebounce(keyword, 300)` ??effect ?먯꽌 1?뚮쭔 ?몄텧. ?붾컮?댁뒪媛 ?ㅼ뼱媛硫?`loadingRef` 議곌린 return 媛???먯껜媛 遺덊븘?뷀빐吏꾨떎.

---

### P1-9. `/myWork` 吏꾩엯 ??**媛숈? ?뚰겕濡쒓렇 resolver 瑜???踰?* ?몄텧?쒕떎

`pages/myWork/WorklogPage.jsx:79-87` (罹섎┛??媛??踰붿쐞) 怨?`:118-126` (?곷떒 KPI ?붿빟, ?대쾲 ??1??留먯씪) ??**????* `useMyWorklogList({... mine:true})` 瑜??몄텧?쒕떎.

`pages/myWork/utils/useMyWorklogList.js:20` ??荑쇰━ ?ㅺ? ?좎쭨 踰붿쐞瑜??ы븿?섎?濡?`myWorkKeys.worklogList(resolverName, selectedProjectIds, startDate, endDate)`) ??荑쇰━??**罹먯떆媛 媛덈━怨??쒕쾭瑜?2踰?移쒕떎**.

湲곕낯 吏꾩엯 ?곹깭?먯꽌 FullCalendar ??`dateRange` ???대쾲 ?ъ쓣 ?꾩쟾??**?ы븿?섎뒗** 6二?援ш컙?대떎. 利?(2)媛 ?꾩슂濡??섎뒗 ?곗씠?곕뒗 (1)??**?대? ?꾨? ?ㅼ뼱 ?덈떎**.

**鍮꾩슜 ?뺣웾**: `/myWork` 吏꾩엯 1?뚮떦 ?좏깮 ?꾨줈?앺듃 ?꾩껜?????臾닿굅??Jira ?뚰겕濡쒓렇 吏묎퀎 **2??*(`getMyCalendarWorklog`). ?꾨줈?앺듃 ?좏깮??諛붽? ?뚮쭏???ㅼ떆 2??

**?섏젙 諛⑺뼢**: ?붿빟? (1)??寃곌낵?먯꽌 怨꾩궛(`useMyWorklogSummary` ???대? ?쒖닔 reduce??, 罹섎┛?붽? ?대쾲 ?ъ쓣 踰쀬뼱??寃쎌슦?먮쭔 ?붿빟??荑쇰━瑜?`enabled` 濡?耳좊떎.

---

### P1-10. ?꾨컮? ?꾨줈釉뚭? 愿怨꾨룄瑜?**?꾨컮? ?섎쭔???꾩껜 ?ш렇由ш린** ?쒕떎

`pages/resource/allocation/AllocationGraph.jsx:26,30-49,51-54,75`

```js
const [avatarOkSet, setAvatarOkSet] = useState(() => new Set());            // :26
img.onload = () => { setAvatarOkSet(prev => prev.has(url) ? prev : new Set(prev).add(url)); }; // :37-40
const option = useMemo(() => buildAllocationOption({...avatarOkSet}), [..., avatarOkSet]);      // :51-54
<ECharts option={option} notMerge={true} .../>                                                  // :75
```

`onload` 留덈떎 **??`Set`** ??留뚮뱾?댁졇 `option` useMemo 媛 臾댄슚?붾릺怨? `notMerge={true}` ??ECharts 媛 留ㅻ쾲 **?꾨웾 teardown ???ш렇由ш린** ?쒕떎. 猷⑦듃媛 `ReactDOM.render`(legacy ??`index.js:2,39`)??**?ㅼ씠?곕툕 `img.onload` ??諛곗묶?섏? ?딅뒗??* ???대?吏 1媛?濡쒕뱶 = ?뚮뜑 1??

**鍮꾩슜 ?뺣웾**: ?꾨컮? M紐???**M??由щ젋??횞 M??`buildAllocationOption` ?꾩껜 ?ш뎄??*(`allocation/allocationGraphOption.js:98-357` ???몃뱶 `projects+teams+members` + ?ｌ? `projectTeamPairs+members` ?꾨웾 + tooltip ?대줈? ?ъ깮?? **횞 M??ECharts notMerge ?ш렇由ш린**. ?곹븳 `MAX_GRAPH_PROJECTS=15` ?먯꽌 ?대떦??50~100紐낆씠硫?**50~100?곗냽 ?꾩껜 ?ш렇由ш린** ??愿怨꾨룄瑜??쇱튇 吏곹썑 ??珥덇컙 ?꾨━利?

**?섏젙 諛⑺뼢**: `onload` 寃곌낵瑜?`useRef` ??紐⑥븘 `requestAnimationFrame`/吏㏃? ??대㉧濡?**1?뚮쭔** flush ?섍굅?? ?꾨줈釉뚮? `Promise.allSettled` 濡?臾띠뼱 ?꾨? ?앸궃 ??`setAvatarOkSet` ????踰덈쭔 ?몄텧.

---

### P1-11. 而ㅼ뒪? ??쒕낫???꾩젽??**?쒕줈??由ъ궗?댁쫰瑜??꾩뿭?쇰줈 利앺룺**?쒗궓??
`components/chart/echart/EchartPanel.jsx:21-35`

```js
const observer = new ResizeObserver(() => {
    window.dispatchEvent(new Event("resize"));   // ???ㅻ줈? ?놁쓬
});
observer.observe(containerRef.current);
```

`echarts-for-react` ??**window resize 瑜?援щ룆**?쒕떎(媛숈? ?ъ떎??`components/card/CardFullscreen.jsx:17`, `components/card/collapse/CardCollapseContext.jsx:50` 二쇱꽍??紐낆떆???덈떎). ?곕씪??**???꾩젽??而⑦뀒?대꼫媛 而ㅼ?硫??섏씠吏??紐⑤뱺 ECharts ?몄뒪?댁뒪媛 ?ъ륫?빧룹옱?뚮뜑**?쒕떎.

?ъ슜泥섎뒗 `pages/projectDetail/dashboard/ChartTemplate.js` ??`react-grid-layout` ?꾩뿉 ?꾩젽 6~12媛쒓? ?щ씪媛???꾨줈?앺듃 ??쒕낫?쒕떎.

**鍮꾩슜 ?뺣웾**: ?꾩젽 N媛?媛곴컖??ResizeObserver 瑜?媛뽯뒗?? ?꾩젽 ?섎굹瑜??쒕옒洹?由ъ궗?댁쫰?섎㈃ ?덉씠?꾩썐 ?щ같移섎줈 ?щ윭 而⑦뀒?대꼫 ?ш린媛 諛붾뚭퀬 ??媛??듭?踰꾧? 諛쒗솕 ??媛곴컖 ?꾩뿭 resize ?붿뒪?⑥튂 ??**N媛?李⑦듃媛 留ㅻ쾲 ?ъ륫??*. ?쒕옒洹몃뒗 ?꾨젅???⑥쐞濡?諛쒖깮?섎?濡?**?쒕옒洹?1珥?= 理쒕? 60?꾨젅??횞 N ?붿뒪?⑥튂 횞 N 李⑦듃 ?ъ륫??(O(N짼))**. 寃뚮떎媛 李⑦듃 由ъ궗?댁쫰媛 而⑦뀒?대꼫 ?ш린瑜??ㅼ떆 嫄대뱶由щ㈃ ?듭?踰꾧? ?щ컻?뷀븯???섎㉨??寃쎈줈媛 ?대젮 ?덈떎.

> ?議곌뎔: `CardFullscreen.jsx:25`쨌`CardCollapseContext.jsx:55`쨌`portfolio/widgets/ChartBox.jsx:19`쨌`resource/teamAnalytics/TeamChartBox.jsx:32` ???꾨? **1?뚯꽦 `setTimeout` ?붿뒪?⑥튂**(100~200ms)??臾몄젣?녿떎 ???곗냽 諛쒗솕?섎뒗 寃껋? `EchartPanel` ?섎굹肉먯씠??

**?섏젙 諛⑺뼢**: ?꾩뿭 ?붿뒪?⑥튂瑜?踰꾨━怨??대떦 李⑦듃 ?몄뒪?댁뒪?먮쭔 `echartsInstance.resize()` 瑜??몄텧?섍굅?? 理쒖냼??rAF 濡?肄붿뼹?덉뒪 + ?ш린 蹂?붽? ?ㅼ젣濡??덉쓣 ?뚮쭔 諛쒗솕.

---

### P1-12. 寃???낅젰 臾대뵒諛붿슫??+ ?????議곕┰ 誘몃찓紐?(4媛??붾㈃)

`utils/useDebounce.js` ?????꾩뿭?먯꽌 10怨녹씠 ?뺤긽 ?ъ슜 以묒씤??200~500ms), ?꾨옒 4怨노쭔 鍮좎졇 ?덇퀬 **?섑븘 ???諛곗뿴??媛???щ떎**.

| ?꾩튂 | 臾대뵒諛붿슫??吏??| 誘몃찓紐???議곕┰ | 鍮꾩슜 ?뺣웾 |
|---|---|---|---|
| `pages/projectDetail/work/ProjectTreeView.jsx:87,171,192` | `search` state 利됱떆 媛깆떊(`work/TreeStructurePanel.jsx:105-115`) | ??(?뚯씠?꾨씪???먯껜媛 鍮꾩뙂) | ??湲?먮떦 `tasks.filter` ??`gantt/ganttAdapter.js:101-239 toSvarTasks`(遺紐⑥쭛??2???ㅼ틪 + ???몃뱶 留ㅽ븨) ??`:253-396 synthesizeFolderNodes`(?대뜑 ?ш? 濡ㅼ뾽) ??`buildWorkTree` ??`flattenTree` ??`nodesById` Map ?ш뎄異? **500 ?댁뒋 + 20 ?대뜑?먯꽌 3湲??= ?뚯씠?꾨씪??3???꾩＜ + 醫뚯륫 ???꾨웾 ?щ젋??* |
| `pages/resource/organization/OrganizationTab.jsx:99,290-326` | `backoffice/page/team/TeamTreePanel.jsx:127` `onChange={e => onSearchChange(e.currentTarget.value)}` | `:290` `const rows = members.map(...)` ??`useMemo` ?놁쓬, `members` ??? 誘몄꽑????**?꾩궗 ?몄썝 ?꾨웾**(`:167-175`), `head`(`:279-288`)??留??뚮뜑 ??媛앹껜 | **500紐?議곗쭅?먯꽌 ????踰덈떦 3,000媛?? 媛앹껜 + 洹??덉쓽 `UserAvatar`/`SemanticBadge`/`SkillTags`/`Badge` ?섎━癒쇳듃.** `directOnly` ?좉?쨌? ?좏깮쨌?몃━ ?묎린?먯꽌???숈씪 |
| `pages/myPage/sections/MyIssuesPanel.jsx:112-174` / `MyWorklogPanel.jsx:148,205` | `SearchInput`(`MyIssuesPanel.jsx:185-189`) | ?꾪꽣留?`rowsData`)? `:61-100` ?먯꽌 硫붾え?덈뒗??**?뺤옉 鍮꾩떬 ?섎━癒쇳듃 議곕┰(`:112`)??硫붾え 諛?* | `getMyIssueList` ???쒕쾭 ?섏씠吏뺤씠 ?놁뼱 ?꾨웾???대젮以?? ?댁뒋 N嫄?= **???낅젰 1?뚮떦 N횞5 ?**. `CommonTable rowsPerPage=10` ?대씪 DOM ? 10?됱씤??**踰꾨젮吏?N-10?됱쓣 留ㅻ쾲 留뚮뱺??* |
| `backoffice/page/team/TeamPage.jsx:97-99` + `TeamTreePanel.jsx:127` | ?숈씪 | `useMemo` 3?⑥? 嫄몃젮 ?덉쓬 | ?쒕쾭 ?곹븳 500? 湲곗? **???낅젰??1,500???쒗쉶 + 理쒕? 500媛?`TeamNodeRow` ?щ젋??*(memo ?놁쓬, ?몃씪??style) |

**媛숈? 遺瑜섏쓽 誘몃찓紐???議곕┰** (寃?됯낵 臾닿??섍쾶 遺紐??곹샇?묒슜留덈떎 諛쒖깮):
- `pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx:159-249` ??`const rows = members.map(...)` 誘몃찓紐? 遺紐?`ResourceAnalysisPage.jsx:44-55` 媛 state 12媛쒕? ?뚯쑀?섎?濡?DatePicker ??湲?먃룻듯븘?걔룻? ?좏깮쨌泥댄겕諛뺤뒪쨌?쒕줈??媛쒗룓媛 ?꾨? ?щ젋?붾? ?좊컻. ?꾨웾 ?섏튂 紐⑤뱶 `members` 理쒕? 500(`resourceMembersAdapter.js:25`), `CommonTable` ? 10?됰쭔 洹몃┝ ??**?곹샇?묒슜 1?뚮떦 ~4,000 ? ?섎━癒쇳듃 ?앹꽦, 洹몄쨷 40媛쒕쭔 ?붾㈃???섍컧**
- `pages/resource/overview/ResourceOverviewTable.jsx:69-121` ??`rows` ??`useMemo` 吏留?deps ??`onRowSelect` 媛 遺紐?`ResourceOverviewTab.jsx:155`)?먯꽌 **?몃씪???붿궡??*????긽 臾댄슚?? `rowsPerPage=15` ?몃뜲 ?꾨웾 議곕┰ ??**500紐낆씠硫?4,000?, ?⑤뒗 嫄?120?.** ?쒕줈??5??媛쒗룓 = 10??諛섎났
- `pages/resource/assignment/people/CompanyResourceTable.jsx:60,158` + `ProjectAssignmentBoard.jsx:468` ???숈씪???몃씪??`onRowSelect`. `onAssign` ? `useCallback` ?쇰줈 ?쒕?濡?怨좎젙???덉뼱 **??履쎈쭔 ?볦튇 耳?댁뒪**
- `pages/project/ProjectList.jsx:18,24-26,44-79` ???뚯깮 ?곗씠?곕? `useState`+`useEffect` 濡??ㅺ퀬 ?덉뼱 **?곗씠??1?뚮떦 ?뚮뜑 2??*(鍮?rows ??effect ??setRows/setPages ???щ젋??. `statusMap`(`:24`)??留??뚮뜑 ?ъ깮?? `ProjectPage.jsx:30` ??5遺??대쭅?쇰줈 ?좏쑕 ?곹깭?먯꽌??諛섎났
- `pages/projectDetail/progress/ProgressRiskTable.jsx:62,73` ??`rows`/`head` ????誘몃찓紐? 80??湲곗? 480?/?뚮뜑

**?섏젙 諛⑺뼢**: ??寃??4怨녹뿉 `useDebounce(search, 200~300)`, ??議곕┰ ?꾨? `useMemo`, 遺紐⑥쓽 ?몃씪??肄쒕갚??`useCallback` ?쇰줈 怨좎젙. `CompanyResourceTable` ??`useInfiniteSlice`(30媛??덈룄?? ?⑦꽩???대? 由ы룷???덉쑝誘濡?????쒕뒗 洹몄そ?쇰줈 ?섎졃?쒗궗 ???덈떎.

---

### P1-13. 怨듭슜 ???대뙌?곌? **留??뚮뜑 O(?됁쀬뿴)** 濡??꾨뒗 ?몄텧遺媛 ?덈컲?대떎 (???몄뒪?댁뒪 65媛쒖뿉 怨깊빐吏?

`components/table/TableSurface.jsx:46-75` ????媛쒖쓽 `useMemo` 瑜?`dataRows`(= `rows` prop **李몄“**)???섏〈?쒗궓??

```js
const dataRows = Array.isArray(rows) ? rows : [];                       // :46
const effectiveRows = isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows;  // :47
...
const sortable = useMemo(() => { ... resolveSortableColumns(head, dataRows) }, [signature, isLoading, dataRows]);  // :60-68
const adaptedRows = useMemo(() => adaptRows(head, effectiveRows, sortable), [signature, effectiveRows, sortable]); // :71-75
```

**?몄텧遺媛 ?뚮뜑留덈떎 ??諛곗뿴??留뚮뱾硫???硫붾え媛 ?듭㎏濡?臾댄슚?붾맂??** `CommonTable` ?몄텧 ?뚯씪 35媛?以?**17怨녹씠 `rows` 瑜?硫붾え?섏? ?딅뒗??* ??`MyIssuesPanel.jsx:112`, `MyTeamAnalysisPanel.jsx:202`, `PortfolioCostOverrunRank.jsx:27`, `PortfolioProjectTable.jsx:78`, `PortfolioTsrSignalTable.jsx:117`, `PortfolioUtilization.jsx:143`(?몃씪??`rows={topPeople.map(...)}`), `ResourceAnalysisChart.jsx:165`, `ResourceAnalysisTable.jsx:159`, `ResourceAnalysisTeamTable.jsx:117`, `TeamCoverageTable.jsx:93`, `IssueAddModal.jsx:59`, `ProgressRiskTable.jsx:73`, `StorageTableList.jsx:29`, `FailListModal.jsx:17`, `OrganizationTab.jsx:290` ?? (P1-12 ? 媛숈? 吏?먮뱾?댁?留?**鍮꾩슜??痢듭씠 ?ㅻⅤ??* ??嫄곌린?쒕뒗 JSX 議곕┰, ?ш린?쒕뒗 洹??꾩뿉 ?뱁엳??怨듭슜 ?대뙌??

**鍮꾩슜 ?뺣웾** (?ㅼ젣 ?⑥닔 蹂몃Ц ?뺤씤):
- `resolveSortableColumns`(`tableSort.js:72-101`) ???뺣젹 媛??而щ읆留덈떎 **????猷⑦봽**. `sortValue`/`sortKey` 媛 ?녿뒗 而щ읆? 議곌린 ?덉텧?????섍퀬 ?앷퉴吏 ?ㅼ틪?쒕떎.
- `adaptRows`(`tableSort.js:146-175`) ???뺣젹 媛??而щ읆留덈떎 `rows.map` + `filter` + `map` = **??湲몄씠 諛곗뿴 3媛??좊떦**. ?댄썑 `sortValue`/`sortKey` ?붾쪟 寃?щ줈 **????횞 ???** ????踰????ㅼ틪?쒕떎.
- 200??횞 ?뺣젹 而щ읆 4媛?= ?뚮뜑??**諛곗뿴 ?щ’ ~2,400媛?+ O(200횞8) ?ㅼ틪**.
- 濡쒕뵫 以묒뿉??`:47` ??`buildSkeletonRows(...)`(`skeletonRows.js:21`)媛 留??뚮뜑 ??諛곗뿴??留뚮뱾??**硫붾え瑜??뺤젙?곸쑝濡?臾댄슚??*?쒕떎.

**諛곗닔**: 怨듭슜 ???몄뒪?댁뒪 珥?**65媛?*(`CommonTable` 37 + `ChartTableToggle` 24 + `CursorPagingTable` 3 + `PagingTable` 1).

**?섏젙 諛⑺뼢**: `effectiveRows` 瑜?`useMemo([signature, skeletonRowCount, isLoading, rows])` 濡?媛먯떥怨? `<DynamicTable>` ??`frozenHead`/`adaptedRows`/`rowsPerPage` 留?蹂대뒗 `React.memo` ?섑띁濡?媛먯떬????洹몃윭硫?**鍮꾨찓紐??몄텧遺 17怨녹쓣 怨좎튂吏 ?딄퀬??諛⑹뼱**?쒕떎.

> **遺??議곌굔遺 鍮꾩슜**: `TableSurface.jsx:88-90` ??`frozenHead` ?????숆껐??耳쒖졇 ?덉쑝硫?**??긽 ??李몄“**??`:82` 二쇱꽍?濡?`adaptedHead` ???섎룄?곸쑝濡?硫붾え?섏? ?딅뒗??. Atlaskit `dynamic-table` ??`withSortedPageRows` ??`getDerivedStateFromProps` 瑜?**prevProps 鍮꾧탳 ?놁씠 留??뚮뜑** ?ㅽ뻾?쒕떎(`node_modules/@atlaskit/dynamic-table/dist/cjs/hoc/with-sorted-page-rows.js:145-165`).
> ??**?뺣젹??嫄몃젮 ?덉? ?딆쑝硫?* `getSortedRows`(`:37-40`)媛 `rows` 瑜?洹몃?濡?諛섑솚?섍퀬 `getPageRows` ?щ씪?댁뒪留??섎?濡?**鍮꾩슜? 臾댁떆??留뚰븯??*.
> ??**?ъ슜?먭? ?뺣젹 ?ㅻ뜑瑜??대┃????*?먮뒗 留??뚮뜑 `Array.from(rows)` ?꾨웾 蹂듭궗 + `Intl.Collator.compare` 湲곕컲 `.sort()` 媛 ?덈떎. 200?됱씠硫??뚮뜑??**??,530??collator 鍮꾧탳**. 利???寃쎈줈??"?뺣젹??耳????먯꽌留?諛쒗쁽?쒕떎.

---

### P1-14. `useUserInfos` ??荑쇰━?ㅺ? **accountId 諛곗뿴 ?꾩껜** ???붾㈃ 媛?罹먯떆 怨듭쑀 0, ?섏씠吏留덈떎 ?꾨웾 ?ъ“??
`utils/queryKey/jiraKeys.js:4`
```js
userInfos: (accountIds) => ['jiraUserInfos', accountIds],
```

**id 吏묓빀 ?꾩껜媛 ??*?쇱꽌 吏묓빀????紐낆씠?쇰룄 ?ㅻⅤ硫??꾩쟾???ㅻⅨ 罹먯떆 ?뷀듃由ш? ?쒕떎. **?ъ슜???⑥쐞 罹먯떆媛 ?놁뼱 寃뱀튂???몄썝??留ㅻ쾲 ?ㅼ떆 諛쏅뒗??** ?뚮퉬泥?6怨?`myPage/MyPageHeader.jsx:37`, `myWork/modal/WorklogModal.jsx:97`, `myWork/MyIssueTable.jsx:41`, `project/ProjectDetailDrawer.jsx:90`, `projectDetail/calender/useProjectWorkersSchedule.js:34`, `projectDetail/taskHistory/TaskHistoryTable.jsx:108`)???꾨? ?쒕줈 ?ㅻⅨ ?ㅻ? ?대떎.

**鍮꾩슜 ?뺣웾**: `TaskHistoryTable` ??20???섏씠吏濡?10?섏씠吏 ?섍린硫???**罹먯떆 ?뷀듃由?10媛?횞 bulk ?붿껌 10??*. ?ㅼ젣 ?깆옣 ?몄썝??30紐낅퓧?댁뼱??理쒕? 200紐낅텇???섏튂?쒕떎(**??.7諛?怨쇰떎**). ?붾㈃????린硫??묒뾽?대젰 ???꾨줈?앺듃 ?쒕줈?? 媛숈? ??먯씤?곕룄 泥섏쓬遺???ㅼ떆 諛쏅뒗??

**寃뱀튂??臾몄젣 2嫄?(媛숈? 寃쎈줈)**:
- `utils/useJiraUserInfos.js:16-24` ??50媛?泥?겕瑜?`for...of await` 濡?**吏곷젹** 泥섎━. 200紐?= 4泥?겕 = **4??吏곷젹 ?뺣났**. `Promise.all`(?먮뒗 ?숈떆??2~3 ?쒗븳)?대㈃ 1?뚮텇?대떎. 諛깆뿏?쒖뿉??`p-limit` 愿?됱씠 ?덈뒗???꾨줎????寃쎈줈?먮쭔 ?녿떎.
- `utils/jiraApi/users/getUserInfos.js:8-12` ??`useMemo(..., [accountIds])` ?몃뜲 ?몄텧遺媛 ?몃씪??諛곗뿴(`memberRows.map(...)`, `accountId ? [accountId] : []`)???섍린誘濡?**留??뚮뜑 `Set` ?앹꽦 + `sort` 媛 ?ㅼ떆 ?덈떎**.

**?섏젙 諛⑺뼢**: ?ㅻ? accountId **?⑥쐞**濡?履쇨컻嫄곕굹(`['jiraUser', id]` + `useQueries`), 理쒖냼??bulk ?묐떟??`queryClient.setQueryData` 濡?媛쒕퀎 ?ъ슜??罹먯떆???ъ뼱 ?ㅼ쓬 吏묓빀???덊듃?섍쾶 ?쒕떎. 泥?겕 猷⑦봽??`Promise.all` 濡?

> ????ぉ? P1-4(`getUser` N+1)??**?섏젙 紐⑹쟻吏**?닿린???섎떎 ?????붾㈃??`useUserInfos` 濡???린湲??꾩뿉 ???ㅺ퀎瑜?癒쇱? 怨좎퀜???대뱷???⑥쟾???쒕떎.

---

## P2 ??以묎컙

### P2-1. ?ъ쭛怨??대쭅????쒕낫??**?꾩껜 ?섏씠濡쒕뱶**瑜?15珥덈쭏??理쒕? 44???ㅼ떆 諛쏅뒗??`pages/portfolio/PortfolioDashboardPage.jsx:34-35,62-68` ??`refetchInterval: aggregating ? AGGREGATION_POLL_MS(15s) : false`, `AGGREGATION_MAX_WAIT_MS = 11遺?.

**二쇨린 ?먯껜???⑸━?곸씠????臾몄젣???대쭅 ??곸씠??** ?꾨즺 ?먯젙???꾩슂??嫄?`data.lastAggregatedAt` ???꾨뱶肉먯씤??`:115-122`), 留??깅쭏??`getPortfolioDashboard` 媛 ???꾨줈?앺듃 raw(`projects[]` + 媛??꾨줈?앺듃??`members[]`쨌`monthlyEffort[]`쨌`weeklyEffort[]`쨌`issueSummary`)瑜??듭㎏濡??대젮以?? 諛깆뿏?쒖뿉 媛踰쇱슫 ?곹깭 議고쉶媛 ?녿떎 ??`src/resolver/portfolioDashboard/PortfolioDashboardController.js` ?깅줉 ?⑥닔??`getPortfolioDashboard`, `triggerPortfolioAggregation` ?섎퓧.

**鍮꾩슜**: ?ъ쭛怨?踰꾪듉 1?대┃ = 理쒕? `11min / 15s = 44?? ?꾨웾 ?섏튂. ?꾨줈?앺듃 50嫄?횞 硫ㅻ쾭 20紐낆씠硫?留????섎갚 KB. 留??묐떟??`data` 李몄“瑜?媛깆떊 ??`usePortfolioFilter.js:65-68` `selectedProjects` ??**???꾩젽 ?ъ쭛怨?+ ??ECharts ?ш렇由ш린媛 44???곗뇙**.

**?섏젙**: `lastAggregatedAt`/`aggregateStatus` 留?二쇰뒗 寃쎈웾 resolver 瑜??대쭅?섍퀬, 媛믪씠 諛붾??쒖젏??`getPortfolioDashboard` 瑜?1?뚮쭔 invalidate.

### P2-2. 移몃컲 3遺??대쭅???ъ슜?먭? "??遺덈윭?? 移대뱶瑜?3遺꾨쭏??吏?대떎
`pages/projectKanban/ProjectKanbanBoard.jsx:63-86`(`refetchInterval: 3*60*1000`) vs `:165-203`.
`queryFn`(65-83)? `buildStatusData` + `applyProjectListToDataSource` 濡?dataSource 瑜?**泥섏쓬遺???ㅼ떆 留뚮뱺??*. 諛섎㈃ `loadMoreOldProjects` ??`queryClient.setQueryData` 濡?湲곗〈 罹먯떆??**蹂묓빀**?쒕떎 ??3遺??대쭅??蹂묓빀遺꾩쓣 ?꾨? ?좊┛?? 洹몃윴??`oldPage`/`hasMoreOld` state(`:36-37,196-197`)???⑥븘 ?덉뼱 "?붾낫湲?瑜??ㅼ떆 ?뚮윭??**?ㅼ쓬 ?섏씠吏遺??* 媛?몄삩???щ씪吏?移대뱶?????뚯븘?⑤떎).

**鍮꾩슜**: 移몃컲 泥대쪟 以?3遺꾨쭏??invoke 2??+ **?ъ슜?먭? 紐낆떆?곸쑝濡?濡쒕뱶??移대뱶 ?뚯떎**(5嫄댁뵫 3?섏씠吏 = 15??.
**?섏젙**: ?대쭅 ?쒓굅(蹂?대뒗 `useKanbanMutations` 媛 ?숆? ?⑥튂+?뺥솗 invalidate 濡??대? 泥섎━) ?먮뒗 異붽? 濡쒕뱶 ?곹깭?먯꽌 `refetchInterval` ???덈떎.

### P2-3. 湲됱뿬 ?몄쭛 1??= 湲됱뿬 ???섏씠吏 ?ъ“??+ ?먭? ?ъ쭛怨?`pages/projectDetail/salary/SalaryManagementPage.jsx:135-136`. `projectKeys.salary(project_id)` 瑜?page ?놁씠 遺瑜대㈃ **?꾨━?쎌뒪**(`utils/queryKey/projectKeys.js:91-93`)??罹먯떆??紐⑤뱺 ?섏씠吏媛 ?ъ“?뚮릺怨? `projectKeys.cost` ??KVS 10遺?罹먯떆濡?蹂댄샇?섎뒗 媛??臾닿굅???먭? 吏묎퀎瑜?踰꾨┛?? staleTime ???놁쑝??`getUser` 10???⑥씠釉?P1-4)源뚯? ?곕씪?⑤떎.
**鍮꾩슜**: ? 1媛??뺤젙 = 20+ invoke. 10嫄??몄쭛 = ?먭? ?ъ쭛怨?10??
**?섏젙**: ?대떦 ?됰쭔 `setQueryData` ?⑥튂, cost ??`refetchType:'none'`.

### P2-4. `UserPage` ??`userKeys.all` 4????臾닿???荑쇰━源뚯? ?ъ“??`backoffice/page/user/UserPage.jsx:204,215,224,236`. `utils/queryKey/userKeys.js:2-12` 湲곗? `all = ["users"]` 媛 `list`/`meta`/`failList`/`findUser` 瑜?**?꾨?** ??뒗?? ???섏씠吏??留덉슫?몃맂 ?섏쐞 荑쇰━??3媛쒕떎.
**鍮꾩슜**: ?ъ슜??1紐??깅줉(204)쨌?섏젙(215) 1?뚮떦 **3 invoke** ??洹몄쨷 `getAllFailList`(?묒? ?낅줈???ㅽ뙣 紐⑸줉)???깅줉/?섏젙怨?臾닿??섎?濡?**?됰룞 1?뚮떦 1 invoke 媛 ?쒖닔 ??퉬**.
**?섏젙**: ?깅줉/?섏젙/??젣??`userKeys.lists()` + `userKeys.meta()` 留? ?낅줈??224)쨌?ㅽ뙣紐⑸줉(236)?먯꽌留?`failList()`.

### P2-5. ?뚰겕濡쒓렇 ?쒕옒洹???μ씠 ???꾩껜 ?ъ“??(罹먯떆 ?⑥튂 洹쒖빟 ?꾨컲)
`pages/projectDetail/calender/worklogDrop.js:48` ??`invalidateQueries(calendarKeys.projectWorklogs({projectId,startDate,endDate}))` 諛붾줈 ?ㅼ쓬 以?`:51` ?먯꽌 ?대? `event.setExtendedProp('worklog', result)` 濡?濡쒖뺄 ?⑥튂瑜??쒕떎. `calender/ProjectCalender.jsx:279` ???숈씪.
**鍮꾩슜**: ?쒕옒洹?1嫄대떦 `getProjectCalendarWorklog`(??踰붿쐞 JQL + ?뚰겕濡쒓렇 ?뺤옣) 1?? 10嫄??щ같移?= 10?? ?몃뜳??吏?곗쑝濡???`started` 媛 ?뚯븘? ?대깽?멸? ?먯쐞移섎줈 ????뚭? 由ъ뒪???숇컲.

### P2-6. `staleTime` 誘몄꽕??8媛???李??ъ빱??蹂듦?쨌?щ쭏?댄듃留덈떎 ?ъ“???꾩뿭 湲곕낯媛믪씠 `staleTime:0` + `refetchOnWindowFocus:true` ?대?濡??꾩젣 (a)) ?꾨옒??**?ㅻⅨ 李쎌쓣 遊ㅻ떎媛 ?뚯븘???뚮쭏??* ?ъ“?뚮맂??

| ?꾩튂 | resolver |
|---|---|
| `backoffice/page/user/UserPage.jsx:137-143` | `getAllFailList` |
| `backoffice/page/user/UserPage.jsx:145-150` | `getUserMetaCount` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:28-38` | `getProjectStatusList` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:40-47` | `getStatusLink` |
| `pages/myWork/myProject/useMyProjectList.js:16-23` | `getMyProjectList` |
| `pages/projectDetail/dashboard/summary/SummaryPanel.jsx:15-20` | `getSummaryData` |
| `pages/projectDetail/dashboard/DashboardPage.jsx:52-55` | `getChartInfo` |
| `pages/projectDetail/issue/ProjectIssuePanel.jsx:48-51` | `getSettingData` (??P2-7) |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:74-78`, `user/ProjectUserPanel.jsx:70-74`, `analysisReport/resource/hooks/useProjectResourceMembers.js:87-102,131-144` | 紐⑸줉/`getUser` |

?뺤젣 ?낅뱾? ?대? 5遺꾩쓣 以??`useSkillList.js:44`, `useRoleList.js:45`, `usePublicHolidayList.js:44`, `usePermissionList.js:58`) ???꾨쭔 ?꾨씫?대떎. `/myWork` ??湲곕낯 吏꾩엯 ?쇱슦?몃씪 ?쇱슦?몃? ?ㅺ컝 ?뚮쭏???꾨줈?앺듃 紐⑸줉??留ㅻ쾲 ?ㅼ떆 諛쏄퀬, 洹?寃곌낵媛 ?뚰겕濡쒓렇 ?섏튂 泥댁씤(P1-9)???낃뎄??

### P2-7. `settingKeys.detail()` ?섎굹??staleTime ??5媛吏 + queryFn 3踰?`getSettingData` ??17媛쒖냼?먯꽌 ?몄텧?섏?留??꾨? 媛숈? ??`settingKeys.detail()` ?대씪 dedup ? ?뺤긽?대떎. 洹몃윴??**愿痢≪옄蹂?staleTime ???쒓컖媛?*?대떎 ??30遺?`myWork/WorklogPage.jsx:150`, `myPage/MyPage.jsx:115`, `projectDetail/{assignment,gantt,taskHistory,work,calender}`, `resource/*`), 10遺?`backoffice/page/setting/SettingPage.jsx:26`, `MonthMmSummary.jsx:41`, `hooks/useSalaryPolicy.js:63`, `IssueAnalysisPage.jsx:31`, `useProjectResourceMembers.js:74`), **臾댁꽕??1嫄?*(`projectDetail/issue/ProjectIssuePanel.jsx:48-51`).

**鍮꾩슜**: React Query ??stale ?먯젙? 愿痢≪옄 ?⑥쐞????**臾댁꽕??愿痢≪옄媛 留덉슫?몃맆 ?뚮쭏??臾댁“嫄??ъ“??*?섍퀬, 洹?寃곌낵媛 怨듭쑀 罹먯떆瑜?媛깆떊?쒕떎. 利??묒뾽愿由?紐⑸줉) ??뿉 ?ㅼ뼱媛??뚮쭏??`getSettingData` 1?뚭? 異붽??쒕떎. 留뚮즺 ?쒖젏??留덉슫???쒖꽌??醫뚯슦??鍮꾧껐?뺤쟻?대떎.

queryFn ??3踰뚯씠??**??λ릺??shape ??媛덈┛??* ??`SettingPage.jsx:16-27` ? `const {success, ...setting} = result` 濡?success 瑜?踰쀪린怨? `WorklogPage.jsx:144-152`쨌`MonthMmSummary.jsx:38-42` ??envelope ?듭㎏濡??ｋ뒗?? ?꾩옱???뚮퉬遺媛 ?꾨? 猷⑦듃??`hourRate` 留??쎌뼱 **?곗뿰??* ?숈옉?쒕떎.
**?섏젙**: `useSettingData()` 怨듭슜 ??1媛쒕줈 ?듯빀.

### P2-8. ? 遺꾩꽍 ??씠 媛숈? ?꾩껜 吏묎퀎瑜???踰??뚮━怨? 異?踰꾪듉 ?대┃留덈떎 ?ㅼ떆 ?뚮┛??`pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:74-85` 媛 ?낆씠 ?대? 怨꾩궛????`metrics`(`hooks/useTeamAnalyticsData.js:153-170`)瑜????곌퀬 `teamComparison(...)` ???몄텧?섎뒗?? ???⑥닔媛 ?대??먯꽌 **`teamMetricsByTeam` ???듭㎏濡??ㅼ떆 遺瑜몃떎**(`utils/team/teamMetrics.js:430-435`).
**鍮꾩슜**: ??吏꾩엯 1?뚮떦 `teamMetricsByTeam` **2???ㅽ뻾**(媛곴컖 `誇(projects 횞 members)` ?쒗쉶 + `aggregateByTeam` 2??+ `utilizationPeople` ?꾨웾 map). `axis` 媛 deps ???덉뼱 **異?踰꾪듉(媛?숇쪧/怨듭닔/吏꾩쿃瑜??멸굔鍮? ?대┃ 1?뚮떦 ?꾩껜 吏묎퀎媛 ?듭㎏濡??ъ떎??*?쒕떎 ???ㅼ젣濡?諛붾뚮뒗 嫄??뺣젹 湲곗?怨?topN ?덈떒肉?`teamMetrics.js:457-494`).
**?섏젙**: `teamComparison` ??異?臾닿? 遺遺?= `teamMetricsByTeam`)怨?異??섏〈 遺遺??뺣젹+topN+'湲고?')?쇰줈 遺꾨━?섍퀬 ?욎そ? ?낆쓽 `metrics` ?ъ궗??

### P2-9. 媛꾪듃 ?곗씠??濡쒕뱶媛 **?쒕쾭媛 ?곗????딅뒗 媛?*??吏곷젹濡?留됲? ?덈떎
`pages/projectDetail/gantt/useGanttData.js:18-33` ??`coworkerFieldId` 荑쇰━媛 `isSuccess` ???뚭퉴吏 蹂?荑쇰━媛 `enabled:false`. 洹몃윴??`src/resolver/gantt/GanttService.js:56` ? `({projectId, coworkerFieldId} = {})` 濡?援ъ“遺꾪빐留??섍퀬 **蹂몃Ц ?대뵒?쒕룄 ?곗? ?딅뒗??*(?꾩껜 ?뚯씪 grep 寃곌낵 ?쒓렇?덉쿂/二쇱꽍 2嫄대퓧, "??而ㅼ뒪??꾨뱶 id 議곕떖 遺덊븘?? 二쇱꽍 議댁옱).
**鍮꾩슜**: 媛꾪듃쨌?몃━ 泥?濡쒕뱶媛 `getCustomFieldId`(?대??곸쑝濡?`view.getContext()` ??`constants/customField.js:4`) 釉뚮━吏 ?뺣났 1?뚮? 湲곕떎由??ㅼ뿉???쒖옉?섎뒗 **遺덊븘?뷀븳 吏곷젹 ?뚰꽣??*. 寃뚮떎媛 媛숈? `view.getContext()` 寃곌낵媛 `forgeContextKeys.current()`(`ProjectDetailPage.jsx:29`, staleTime Infinity)? `jiraKeys.coworkerField()` **???ㅼ뿉 以묐났 罹먯떆**?쒕떎(`calender/useProjectCalender.js:9` ?????ㅻⅨ `calendarKeys.coworkerField()` ??3踰?.

### P2-10. ?몃━ ???꾨웾??memo ?놁씠 ?몃씪???대줈? 5媛쒖뵫 諛쏅뒗??`pages/projectDetail/work/TreeStructurePanel.jsx:194-213` ??`rows.map` ?덉뿉??`onToggle`/`onSelect`/`onDragStart`/`onDragOver`/`onDrop` 5媛쒕? ?꾨? ?몃씪???앹꽦. `TreeNodeRow`(`:251`)??`React.memo` 媛 ?꾨땲怨? `handleDragOver`(`:67-73`)??dragover ?대깽?몃쭏??`setDropTargetId(id)` 瑜??몄텧?쒕떎.
**鍮꾩슜**: ?쒕옒洹몃줈 ???섎굹瑜?吏?섏튌 ?뚮쭏??**媛?????꾨웾 ?щ젋??*(500?됱씠硫?500 횞 Tooltip/Avatar/Icon ?몃━ ?ъ깮??. 寃????湲?먃룸끂???좏깮???숈씪.

### P2-11. 媛꾪듃 ?몄뒪?몄뿉 MutationObserver 2媛쒓? 留?DOM 蹂寃쎈쭏???꾩껜 ?ㅼ쐲
`pages/projectDetail/gantt/GanttChart.jsx:436-468`(placeholder ?대옒?? ? `:475-529`(?대뜑 ?대옒??. 媛곴컖 `mo.observe(host, {childList:true, subtree:true})` 濡?嫄몃젮 `host.querySelectorAll('.wx-bar[data-task-id]')` ?꾨웾 ?쒗쉶 + ?대옒???좉????섍퀬, ??踰덉㎏??`.wx-grid .wx-body .wx-row[data-id]` 源뚯? 異붽? ?쒗쉶?섎ŉ ?됰쭏??理쒕? 4媛??대옒?ㅻ? ?좉??쒕떎. 留덉슫??`tasks` 蹂寃???**媛곴컖 30?꾨젅??rAF ?뚰봽**(`:457-461`, `:518-522`)媛 遺숇뒗??
**鍮꾩슜**: SVAR ???ㅽ겕濡?以????됱쓣 ?ъ깮?깊븯誘濡??ㅽ겕濡??쒕옒洹?1?뚯뿉 ???듭?踰꾧? 怨꾩냽 源⑥뼱?쒕떎. 200??湲곗? **?꾨젅?꾨떦 ~1,800???대옒???곗궛**.
**?섏젙**: ???댄럺?몃? ?섎굹濡??⑹퀜 ?ㅼ쐲 1?뚮줈 以꾩씠怨?`apply` 瑜?rAF 肄붿뼹?덉뒪.

### P2-12. ?몃젰 遺꾩꽍 ??酉??좉? 1?뚮떦 500???꾨웾 ?ы럹移?`pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:87-102`(staleTime ?놁쓬 + `keepPreviousData:true` = v5 臾댄슚) / `:131-144`(N+1 `getUser`, staleTime ?놁쓬). `resourceMembersAdapter.js:62-63` ??`pagesize = isFullFetch ? 500 : 10` ??荑쇰━ ?ㅼ뿉 ?ㅼ뼱媛꾨떎(`:88-92`).
**鍮꾩슜**: ?몃퀎?뷀?蹂??좉? 3??= `findProjectusersByProjectId` **6 invoke**(洹몄쨷 3?뚮뒗 500???섏씠濡쒕뱶) + ?몃퀎 蹂듦?留덈떎 `getUser` 100??猷⑦봽 ?ъ떎?? alt-tab 蹂듦?留뚯쑝濡쒕룄 ?숈씪 鍮꾩슜 ?щ컻??
**?섏젙**: ??荑쇰━??staleTime 5~10遺? `placeholderData: keepPreviousData` 濡?援먯껜. 500?됱씠 10?됱쓽 ?곸쐞吏묓빀?대?濡?1???섏튂 ???대씪 ?щ씪?댁떛??媛??

### P2-13. 留덉씠?섏씠吏 ?꾨줈?앺듃 移대뱶 1?대┃ = 臾닿굅??JQL invoke 2嫄?`pages/myPage/MyPage.jsx:67,85-104` + `sections/MyProjectsPanel.jsx:94-99,159` ??移대뱶 ?대┃??利됱떆 `selectedProjectIds` 瑜?媛깆떊 ??`myPageKeys.issues(...)`(`getMyIssueList`) + `myPageKeys.worklogs(...)`(`getMyCalendarWorklog`) ???ㅺ? ?숈떆??諛붾먮떎.
**鍮꾩슜**: 移대뱶 ?대┃ 1?뚮떦 **invoke 2嫄?*. ?꾨줈?앺듃 10媛쒕? ?섎굹??怨⑤씪 ?ㅼ퐫?꾨? 醫곹엳硫?**20嫄?*. `keepPreviousData` ??源쒕묀?꾨쭔 留됯퀬 ?붿껌? 洹몃?濡??섍컙?? ?좏깮 議고빀留덈떎 ??罹먯떆 ?뷀듃由ш? ?볦씤??
**?섏젙**: `normalizedProjectIds` ??200~300ms ?붾컮?댁뒪, ?먮뒗 紐낆떆??"?곸슜" 踰꾪듉.

### P2-14. `getProjectUserWithScroll` ??罹먯떆 怨꾩링 ?놁씠 ?몄쭛 ???뚮쭏???ы샇異?`pages/projectDetail/user/ProjectIssueAssignSelect.jsx:47,58-63` ??React Query ???`useState` + 留덉슫???댄럺?몃줈 `invoke`. ?몄텧 吏?먯? `issue/ProjectIssueTable.jsx:290`(?대떦??/`:314`(?묒뾽?? ??`InlineEdit editView`(?몄쭛 以묒뿉留??뚮뜑 = ???뚮쭏????留덉슫?? ? `gantt/GanttUserModal.jsx:78`(?곸쐞媛 `key={task.id}` 濡?媛뺤젣 ?щ쭏?댄듃).
**鍮꾩슜**: ?/紐⑤떖 1???ㅽ뵂 = invoke 1?? 罹먯떆 0. **20???대떦??吏??= ?숈씪 泥??섏씠吏 20??invoke.** ?대떦???묒뾽?먮㈃ 2諛? (寃???낅젰 ?먯껜??400ms ?붾컮?댁뒪 ?뺤긽)

### P2-15. ?곸꽭 ?쒕줈???뺤옣 ??媛숈? 李⑦듃/?뚯씠釉붿씠 2踰?留덉슫??`pages/projectDetail/analysisReport/issue/IssueAnalysisPage.jsx:99` 媛 ?쒕줈?대? ?レ? ?딄퀬 ?뺤옣 ?ы꽭???대ŉ, `components/drawer/SideDrawer.jsx:100` ? `isOpen` ?대㈃ children ??怨꾩냽 留덉슫?명빐 ?붾떎 ??`IssueAnalysisChart` 媛 `:117` 怨?`:143` ?묒そ?? `WorklogDetailPanel` ??`:123` 怨?`:147` ?묒そ?? `analysisReport/resource/ResourceAnalysisPage.jsx:353-362`(?쒕줈?? / `:383-392`(?ы꽭) ?숈씪.
**鍮꾩슜**: ?붾㈃???섎굹留?蹂댁씠?붾뜲 ECharts ?몄뒪?댁뒪 2媛쒓? 珥덇린?붋룹옱?쒕줈??`notMerge={true}`) + ?뚰겕濡쒓렇 ?뚯씠釉???2踰? invoke ????怨듭쑀??異붽? ?놁쓬(?쒖닔 ?뚮뜑/GPU ??퉬).

### P2-16. ??쒕낫???쒕ぉ 蹂寃쎌씠 硫뷀? ?꾨웾 ?ъ“?????꾩젽 ?꾨웾 ?щ젅?댁븘??`pages/projectDetail/dashboard/DashboardPage.jsx:184-190` ??`updateChartTitle` 吏곹썑 `invalidateQueries(projectKeys.dashboardInfo)`. ?묐떟??`:58-72` ?댄럺?몃? ?ъ떎?됲빐 `items` 諛곗뿴???덈줈 ?앹꽦?섍퀬 `ReactGridLayout` ??6~12媛??꾩젽???щ같移섑븳?? ???쒕ぉ? ?대? ?먯뿉 ?덉쑝誘濡?`setQueryData` 濡?異⑸텇?섎떎. (P1-3 ??3以?留덉슫?몄? 怨깊빐吏꾨떎)

### P2-17. `SalaryCell` ??**?留덈떎** `useQuery` 瑜?留뚮뱺??`components/salary/SalaryCell.jsx:52` ??`const { policy, isLevelBand, isPolicyLoading } = useSalaryPolicy(responsePolicy);` 媛 而댄룷?뚰듃 理쒖긽?? `mode` 遺꾧린(`:54-58`)蹂대떎 **??*???덈떎. `hooks/useSalaryPolicy.js:53-64` ??`useQuery({queryKey: settingKeys.detail()})` ?대떎.

?ㅽ듃?뚰겕??dedupe ?섏?留?**QueryObserver ??? ?몄뒪?댁뒪留덈떎 ?앹꽦**?섍퀬, 洹??ㅺ? invalidate ?섎㈃ **??????숈떆??由щ젋??*?쒕떎. 寃뚮떎媛 `mode='plain'`/`'band'` ???뺤콉???꾪? ?곗? ?딄퀬 利됱떆 諛섑솚?섎뒗???낆? ?대? ?ㅽ뻾???ㅻ떎 ??`salary/SalaryManagementPage.jsx:234,265,284` 3怨녠낵 `backoffice/page/level/useLevelList.js:74-75` 2怨녹씠 ?꾨? `mode="plain"`/`"band"` ?? `responsePolicy` 瑜??섍꺼諛쏅뒗 寃쎌슦(`:75` ?곗꽑 ?곸슜)?먮룄 ?낆? 洹몃?濡??덈떎.

**鍮꾩슜 ?뺣웾**: 湲됱뿬愿由???50??횞 湲됱뿬 而щ읆 2媛?= **???붾㈃??QueryObserver 100媛?*. `settingKeys.detail()` invalidate(P2-3 ??湲됱뿬 ???寃쎈줈 ?ы븿) ??踰덉뿉 100媛?而댄룷?뚰듃媛 ?숈떆 由щ젋?? `backoffice/page/user/UserListPaging.jsx:92` ??媛숈? 援ъ“.
**?섏젙**: ?뺤콉????而⑦뀒?대꼫?먯꽌 1???쎌뼱 `policy` prop ?쇰줈 ?대젮蹂대궡怨?`SalaryCell` ? ?대? prop ?곗꽑), ? ?대? ?낆? ?대갚?쇰줈留? 理쒖냼??`mode !== 'policy'` 硫??낆쓣 ?吏 ?딄쾶 遺꾧린.

### P2-18. `DropdownJql` ???쒕∼?ㅼ슫??**?댁? ?딆븘??* 留덉슫??利됱떆 Jira REST 瑜?移쒕떎
`components/project/DropdownJql.jsx:61-69` ??`useEffect(() => { ... searchHook(searchTermDebounced) ... }, [searchTermDebounced])` ??**?대┝ ?щ? 媛?쒓? ?녿떎.** 留덉슫???쒖젏(`searchTermDebounced === ''`)?먮룄 ?ㅽ뻾?쒕떎. React Query 瑜??곗? ?딄퀬 濡쒖뺄 `useState` ??**罹먯떆???녿떎** ??媛숈? ?붾㈃???ㅼ떆 ?ㅼ뼱媛??뚮쭏??諛섎났.

`components/filter/ProjectFilter.jsx:135,141` ??`DropdownJql` ??2媛??뚮뜑?섎?濡?**?붾㈃??`getProjects` + `getUsersGroups` 2??*媛 ?ъ슜??議곗옉 ?꾩뿉 ?섍컙??
**鍮꾩슜 ?뺣웾**: `ProjectFilter` ?ъ슜泥?4怨?`IssueAnalysisTable.jsx:321`, `IssueAddModal.jsx:200`, `ProjectIssuePanel.jsx:151`, `TaskHistoryPage.jsx:100`) 횞 2 = 4?붾㈃ 紐⑤몢 諛⑸Ц ??**Jira REST 8??*, ?꾨? 議곗옉 ???꾨━?섏튂.
**?섏젙**: `DropdownMenu` ??`onOpenChange` 濡?理쒖큹 ?ㅽ뵂 ?쒖뿉留??섏튂?섍굅??`useQuery` + `enabled: isOpen` + `staleTime`.

### P2-19. `JiraUserSelect` ?????낅젰留덈떎 `invoke` (P1-8 怨?媛숈? 遺瑜?
`components/select/JiraUserSelect.jsx:99-113` ??`AsyncCreatableSelect` ??`loadOptions` ??react-select 媛 ?붾컮?댁뒪?섏? ?딆쑝誘濡??낅젰留덈떎 `invoke('searchJiraUsers')`. ?몃젰 異붽? 紐⑤떖 ?깆뿉???ъ슜.
**鍮꾩슜**: "源泥좎닔" ?낅젰 ???쒓? IME 議고빀 以묎컙 ?④퀎 ?ы븿 **8~11??invoke**(?붾컮?댁뒪 ??1??.
**?섏젙**: `loadOptions` 瑜??붾컮?댁뒪 ?섑븨?섍굅??`useDebounce(keyword, 300)` 湲곕컲?쇰줈 ?꾪솚. **媛숈? ?대뜑 ?덉뿉??洹쒖튃??媛덈┛??* ??`ProjectUserSelect.jsx:94`(1000ms), `DropdownJql.jsx:50`(500ms)? ?붾컮?댁뒪媛 ?덈떎.

### P2-20. `CardCollapseProvider` 而⑦뀓?ㅽ듃 媛믪씠 ?묎린 1?뚯뿉 ??移대뱶瑜?由щ젋?붿떆?⑤떎
`components/card/collapse/CardCollapseContext.jsx:58` ??`const api = useMemo(() => ({ state, toggle }), [state, toggle])`. `state` 媛 諛붾뚮㈃ ??媛앹껜 ??`useCardCollapse` ?뚮퉬??**?꾩썝**(移대뱶 + `BentoTile`) 由щ젋??
**鍮꾩슜**: ?꾩궗 ??쒕낫???꾩젽 10~15媛?湲곗? 移대뱶 1媛쒕? ?묒쓣 ??**~25媛?而댄룷?뚰듃 由щ젋??*(+ `:55` ???꾩뿭 resize ?붿뒪?⑥튂濡?李⑦듃 ?ъ륫??1??.
**?섏젙**: `state` ? `toggle` ??而⑦뀓?ㅽ듃 2媛쒕줈 遺꾨━?섍굅????됲꽣?뺤쑝濡?

### P2-21. `TaskHistory` ?뚯씠釉붿씠 React Query 諛붽묑 ??罹먯떆 0
`pages/projectDetail/taskHistory/TaskHistoryTable.jsx:39-45,57-87,90-93` ??`useState` 吏곸젒 愿由? 而ㅼ꽌??蹂닿??섏?留??묐떟? 踰꾨젮 **Next ??Prev ??Next = 3??異붽? ?붿껌**. ?뺤젣 `analysisReport/issue/IssueAnalysisTable.jsx:176-187` ? 而ㅼ꽌瑜?荑쇰━ ?ㅼ뿉 ?ｌ뼱 staleTime 5遺꾩쑝濡?Prev 媛 罹먯떆 ?덊듃?쒕떎 ??**?섎룄???⑦꽩??諛붾줈 ?놁뿉 ?덈떎**.

---

## P3 ???ъ냼

| # | ?꾩튂 | ?댁슜 |
|---|------|------|
| P3-1 | `pages/projectDetail/gantt/useGanttMutations.js:540` | 怨꾪쉷MD ?????`executeRequest('getIssue', {fields:'timetracking'})` ?④굔 GET. MD ?몄쭛 1??= 沅뚰븳議고쉶 + getIssue + updateIssue + (P1-5?? ?꾨웾 ?ъ“??|
| P3-2 | `pages/projectDetail/work/TreeDetailPanel.jsx:501,534-541` | `splitDependencies(ganttLinks, node.id)` ? `nodesById.forEach(...)` 媛 useMemo ?놁씠 留??뚮뜑 O(?꾩껜 ?몃뱶) ?ㅼ틪. ?곸쐞媛 寃?됀룸뱶?섍렇?ㅻ쾭留덈떎 ?щ젋?붾릺誘濡?怨깊빐吏꾨떎 |
| P3-3 | `pages/projectDetail/gantt/GanttChart.jsx:103-120` | `mousemove` 留덈떎 `setTip({x,y,task})` state 媛깆떊(珥덈떦 ~60??. 蹂꾨룄 而댄룷?뚰듃 寃⑸━???섎룄?곸씠??媛숈? task쨌洹쇱젒 醫뚰몴硫??ㅽ궢 媛??|
| P3-4 | `useProjectResourceMembers.js:170`, `cost/CostByIssueTable.jsx:39`, `cost/CostByIssueChart.jsx:18`, `cost/CostByRoleLevel.jsx:61` | `data?.x ?? {}` / `?? []` 媛 濡쒕뵫 以?**留??뚮뜑 ??李몄“** ??李⑦듃 option useMemo 臾댄슚????`notMerge={true}` 濡?**李⑦듃 ?꾩껜 ?щ뱶濡쒖슦** |
| P3-5 | `pages/projectDetail/dashboard/ChartTemplate.js:128-131` | ?뚯씠釉붿씠 ?ロ? ?덉뼱??`isSwitch` false, `:279`) 1000+ ??媛앹껜瑜?留뚮뱾怨? `.sort()` 媛 React Query 罹먯떆 諛곗뿴??**?쒖옄由?蹂??*?쒕떎 |
| P3-6 | `ChartTemplate.js:104,165,248` | head memo ?섏〈?깆뿉 `t` ?꾨씫, option ?섏〈?깆뿉 `t` ?꾨씫(濡쒖????꾪솚 ???쇰꺼 stale), filter memo ??`teamNote`(留??뚮뜑 ??JSX, `:195-200`)???섏〈??**?곴뎄 誘몄뒪** |
| P3-7 | `dashboard/DashboardPage.jsx:255,280-282` | ?몃씪??`layout={items.map(...)}` + 移대뱶???몃씪???붿궡??3媛?12?꾩젽 = 36 ?대줈?/?뚮뜑) |
| P3-8 | `dashboard/DashboardPage.jsx:159,177` | `projectKeys.dashboardData` 瑜?臾댄슚?뷀븯?붾뜲 ???ㅻ? ?깅줉??`useQuery` 媛 ?녿떎(`projectKeys.js:65` ?뺤쓽, 李몄“????2以꾨퓧). 臾댄빐?섏?留??ㅼ젣 ?꾩젽 ?곗씠?곌? `dashboardItem` ?ㅼ뿉 ?덈떎???ъ떎??媛由곕떎 |
| P3-9 | `pages/projectDetail/issue/IssueAddModal.jsx:59` | `rows` 誘몃찓紐?+ `rowsPerPage=100` + `maxResults:100`. 泥댄겕諛뺤뒪 20踰?= 100??媛앹껜 20???ш뎄異???,000 ?섎━癒쇳듃). `:128-141` 寃?됱? 300ms ?붾컮?댁뒪媛 ?덉쑝??React Query 諛뽰씠??紐⑤떖 ?ъ삤????罹먯떆 0 |
| P3-10 | `pages/projectDetail/user/ProjectUserPanel.jsx:237,255` | 媛숈? ?꾨━?쎌뒪 ??`projectKeys.users`)瑜?onSuccess/onSettled ?먯꽌 **2??* 臾댄슚????`:216` ???숆? ?⑥튂媛 利됱떆 ?먭린 |
| P3-11 | `pages/projectDetail/user/ProjectTeamBar.jsx:100` | `onDone={() => refetch()}` ?몃뜲 `hooks/useProjectTeams.js:71` ???대? invalidate ?쒕떎 ?????1?뚮떦 `getProjectTeams` **2??* |
| P3-12 | `pages/projectDetail/issue/ProjectIssueTable.jsx:548-553,150-163` | memo ?섏〈?깆쓽 `jiraPermissions` 媛 `utils/jiraApi/useJiraEditGuards.js:116` `return data ?? mapPermissions(null)` 濡?**濡쒕뵫 以?留??뚮뜑 ??媛앹껜** ??????理쒕? 50) 횞 InlineEdit 4媛??몃━ ?ш뎄異? `head` ??誘몃찓紐?|
| P3-13 | `pages/projectDetail/issue/ProjectIssueTable.jsx:193-199` | ? ?몃씪???몄쭛 1?뚮떦 write + `getIssue(*all)` + `getBulkUser` = **3 ?뺣났**. 20???쇨큵 ?몄쭛 = ~60 ?붿껌 (罹먯떆 ?⑥튂 ?꾨왂 ?먯껜??洹쒖빟 以?? |
| P3-14 | `analysisReport/team/ProjectTeamAnalysisPage.jsx:94-97` + `resource/ResourceAnalysisTeamTable.jsx:67-70` | 媛숈? `members` 諛곗뿴濡?`aggregateByTeam` ??**媛곴컖** ?섑뻾(理쒕? 500??횞 2). ?섏씠吏 二쇱꽍 `:90-93` ??以묐났???몄??섍퀬 ?덈떎 |
| P3-15 | `progress/ProgressBars.jsx:30,54`, `progress/ProgressStatusDistribution.jsx:31,65` | 留??뚮뜑 ?덈줈 留뚮뱺 諛곗뿴??useMemo ?섏〈?깆뿉 ?ｌ뼱 memo 媛 ?덈? ?덊듃?섏? ?딆쓬(6??3?됱씠??鍮꾩슜? 誘몃?) |
| P3-16 | `analysisReport/resource/ResourceAnalysisPage.jsx:41-42` | `getDefaultDateRange()` 瑜?留??뚮뜑 ?몄텧(?뺤젣 `ProjectTeamAnalysisPage.jsx:56` ? `useMemo(...,[])` 濡??щ컮由? |
| P3-17 | `calender/ProjectCalender.jsx:226,235,247,266,336` | FullCalendar ???몃씪???대줈? 5媛????뚰겕濡쒓렇 紐⑤떖 媛쒗룓留뚯쑝濡??듭뀡 ?뗭씠 諛붾뚯뼱 `eventContent` 媛 ??? ?ъ떎??`dayMaxEvents=3` 횞 ~35?) |
| P3-18 | `pages/portfolio/PortfolioDashboardPage.jsx:196-200` | `signalBands` 媛 ?뚮뜑 蹂몃Ц?먯꽌 留ㅻ쾲 ??媛앹껜 ??`PortfolioTsrSignalTable.jsx:69` ??`signals` useMemo 媛 ??긽 臾댄슚?붾릺??`tsrSignals` + `signalLevelsForSort` 瑜?2횞N log N ???ъ떎?? P2-1 ???대쭅 44?뚯? 怨깊빐吏꾨떎 |
| P3-19 | `pages/portfolio/utils/portfolioAggregate.js:73-79,111-118` | `keys.map(k => selected.map(p => members.filter(...).length))` = `O(keys 횞 projects 횞 members)`. `salaryHistogram` ??踰꾪궥留덈떎 `Array.from(seen.values()).filter(...)` 濡??꾩껜 諛곗뿴 ?ъ깮?? ?몄텧遺媛 ?꾨? `useMemo` ??鍮덈룄????떎 |
| P3-20 | `pages/projectKanban/ProjectKanbanBoard.jsx:205-227` | `configMap` ??`useMemo` ?놁씠 ?몃씪????`<Kanban configMap={configMap}>`(`:259`)??留ㅻ쾲 ??李몄“ ??移대뱶 N???щ젋?? 媛숈? ?뚯씪???ㅻⅨ ?몃뱾??7媛쒕뒗 ?꾨? `useCallback` ?몃뜲 ?ш린留?鍮좎죱??|
| P3-21 | `components/select/ProjectUserSelect.jsx:152`, `ProjectIssueSelect.jsx:172` | `components={{ MenuList: ({children}) => {...} }}` 濡?**?뚮뜑 蹂몃Ц?먯꽌 而댄룷?뚰듃瑜??뺤쓽**?쒕떎(?대???`useRef`/`useLayoutEffect` 蹂댁쑀). 遺紐??뚮뜑留덈떎 而댄룷?뚰듃 identity 媛 諛붾뚯뼱 react-select 媛 MenuList 瑜?**留ㅻ쾲 ?몃쭏?댄듃/由щ쭏?댄듃** ???ㅽ겕濡??꾩튂 ?먯떎(洹몃옒??`scrollPosRef` 濡??섎룞 蹂듭썝?섎뒗 肄붾뱶媛 ?덈떎). ?몄씠?ㅽ똿?섎㈃ 蹂듭썝 肄붾뱶媛 遺덊븘?뷀빐吏꾨떎 |
| P3-22 | `components/table/useStableColumnWidths.js:41-84` | `useLayoutEffect` ???섏〈??諛곗뿴???녿떎(?섎룄??. ?뺤긽 寃쎈줈??泥??ㅻ뜲?댄꽣 ?섏씤?몄뿉???숆껐??`:43` 媛?쒕줈 O(1) ?댁?留? `toPercentWidths` 媛 `null` ??諛섑솚?섎뒗 寃쎌슦(`:55` ??珥앺빀 0 = `display:none`)?먮뒗 **?곸썝???숆껐?섏? ?딆븘** 留??뚮뜑 `getBoundingClientRect()` 瑜?而щ읆 ??2???몄텧?쒕떎. **?④꺼吏???룹젒??移대뱶 ?덉쓽 ??*媛 ?ш린 ?대떦?쒕떎(P1-2 ??`ResourcePage` ?④? ??낵 怨깊빐吏꾨떎). ???ㅽ뙣 ???쒓렇?덉쿂瑜?"痢≪젙 遺덇?"濡?湲곕줉???ъ떆?꾨? 留됱쓣 寃?|
| P3-23 | `backoffice/page/user/UserPage.jsx:198,207` | `UserRegistrationModal`/`UserEditModal` ??`isOpen=false` ?щ룄 ??긽 ?뚮뜑?섍퀬 ??紐⑤떖??理쒖긽?⑥뿉??`usePermissionCatalog()` ?몄텧(`hooks/usePermissionCatalog.js:32-41` ??`enabled` 媛???놁쓬) ??**?섏씠吏 吏꾩엯 1?뚮떦 `getPermissionCatalog` 1 invoke ??퉬** |
| P3-24 | `pages/myWork/myProject/MyProjectList.jsx:95-97` | `projects.filter(...)` 媛 useMemo ?놁씠 留??뚮뜑, `searchQuery.toLowerCase()` 瑜???ぉ留덈떎 ?ъ깮??|
| P3-25 | `utils/jiraApi/issue/getJqlIssue.js:33` ??`pages/myWork/MyLogSummary.jsx:32` | 媛쒖닔留??꾩슂?쒕뜲 `maxResults`/`fields` 誘몄??뺤쑝濡?湲곕낯 50嫄댁쓣 諛쏆븘 `.length` 瑜??대떎 ??**51嫄??댁긽?대㈃ KPI ?レ옄媛 50?먯꽌 硫덉텣??*(?뺥솗??臾몄젣 寃명븿) |
| P3-26 | `pages/project/modal/ProjectModal.jsx:99-107,129` | `staleTime:0` ?쇰줈 ???뚮쭏??`findProjectById` ?ъ“???몄쭛 紐⑤떖?대씪 ?섎룄?????덉쓬). `:129` `Promise.all(userSet.values().map(...))` ??Set ?댄꽣?덉씠?곗뿉 `.map` ??嫄곕뒗 ?뺥깭(ES2025 Iterator Helpers)???고??꾩뿉 ?곕씪 throw 媛?????깅뒫 異뺤? ?꾨땲??湲곕줉 |
| P3-27 | `pages/myPage/hooks/useMyPermissionMatrix.js:34-59` | `sections`(以묒꺽 map) + `all`(flatMap) + `summary`(filter 3??媛 留??뚮뜑 ?ㅽ뻾?섍퀬 ??`sections` 諛곗뿴??諛섑솚??`MyPermissionSection` ????긽 由щ젋?? 移댄깉濡쒓렇 14媛??섏??대씪 ?ㅻ퉬?⑹? ?묐떎 |
| P3-28 | `pages/resource/assignment/projects/ProjectCardList.jsx:64` | `cards.map(...)` ??硫붾え 諛?+ `ProjectCard` 誘몃찓紐???蹂대뱶 由щ젋?붾쭏????移대뱶 ?щ젋???섏떗 ???곹븳) |
| P3-29 | `keepPreviousData: true` **7怨?* ??`useProjectResourceMembers.js:101,159`, `cost/useProjectCostSummary.js:43`, `dashboard/summary/SummaryPanel.jsx:19`, `progress/ProgressPage.jsx:42`, `salary/SalaryManagementPage.jsx:77`, `user/ProjectUserPanel.jsx:73` | `@tanstack/react-query@5.95.2` ?먯꽌 ??**遺덈━???듭뀡? ?쒓굅**?먮떎(v5??`placeholderData: keepPreviousData` ?⑥닔 ?뺥깭留??좏슚 ??`useWorkListQueries.js:119`쨌`useLevelList.js:56` ???щ컮瑜???. ?ㅽ듃?뚰겕 ??퉬???놁쑝???섏씠吏 ?꾪솚留덈떎 ?뚯씠釉붿씠 ?ㅼ펷?덊넠?쇰줈 鍮꾩썙吏怨?10??湲됱뿬??InlineEdit+Select ?ы븿 ~60?)???꾨웾 ?щ쭏?댄듃?쒕떎 |
| P3-30 | `analysisReport/resource/hooks/useProjectResourceMembers.js:87`, `salary/SalaryManagementPage.jsx:74` | `enabled` ?꾨씫(?뺤젣 荑쇰━ `:158` ?먮뒗 ?덉쓬) |
| P3-31 | `pages/resource/overview/ResourceOverviewTable.jsx:41`, `assignment/people/CompanyResourceTable.jsx:47`, `organization/OrganizationTab.jsx:279`, `myPage/sections/MyIssuesPanel.jsx:102` | `head` 媛앹껜媛 留??뚮뜑 ?덈줈 ?앹꽦 ??`CommonTable`??TableSurface` ??而щ읆 ???숆껐 怨꾩륫???ъ떎?됰맆 ?ъ? |
| P3-32 | `pages/projectDetail/user/IssueAssignSelect.jsx` | **?곕뱶肄붾뱶** ??`static/ui/src` ?꾩뿭 import 0嫄댁씠怨? 鍮꾨룞湲??꾨땶 `Select` ??`loadOptions`/`defaultOptions`(`:51-52`)瑜??섍꺼 諛곗꽑?대룄 ?듭뀡?????щ떎. ?댁븘 ?덈뒗 寃??寃쎈줈濡??ㅼ씤?섏? ?딅룄濡?湲곕줉 |
| P3-33 | `utils/useRoleLevelPermissions.js:10-54` vs `:56-84` | `useRoleLevelPermissions` ? `useRoleLevel` ??roles/levels 荑쇰━瑜?**湲??洹몃?濡?蹂듬텤**?덈떎. 荑쇰━?ㅺ? 媛숈븘 ?ㅽ듃?뚰겕??怨듭쑀?섏?留??좎?蹂댁닔 ?댁쨷?붿씠怨? `enabled` 媛?쒓? ?놁뼱 `components/search/UserSearchFilter.jsx:54` 泥섎읆 ?꾪꽣 UI 媛 蹂댁씠湲곕쭔 ?섎㈃ invoke 3?뚭? ?섍컙??|
| P3-34 | `components/chart/echart/ThemedECharts.js` ?뚮퉬泥??꾨컲 | `echarts-for-react` ??`node_modules/echarts-for-react/lib/core.js:52` ?먯꽌 `isEqual(pick(props, ['option', ...]))` 濡?**源딆? 鍮꾧탳**瑜??쒕떎. 媛믪씠 媛숈쑝硫?`setOption` ? 嫄대꼫?곗?留?**series ?곗씠??諛곗뿴 ?꾩껜瑜?留??뚮뜑 ?쒗쉶**?쒕떎. `option` ???몃씪??議곕┰???섍린???뚮퉬泥섍? ?⑥븘 ?덉쑝硫?洹몃쭔??怨깊빐吏꾨떎(??ㅼ닔??硫붾え???덉쓬 ???뚰넻怨쇈?李몄“) |
| P3-35 | `polling/JobPollingManager.jsx:24` | `const { jobIds, forgetJob, cleanupJob, init } = useJobStore();` ????됲꽣 ?놁씠 ?ㅽ넗???꾩껜 援щ룆. ??猷⑦듃???곸떆 留덉슫?몃릺吏留?`useJobStore` ?곹깭媛 `jobIds` ?섎굹肉먯씠???ㅼ넀?대뒗 誘몃??섎떎. **怨듭슜 ?덉씠?댁뿉????됲꽣 ?놁씠 援щ룆?섎뒗 ?좎씪??吏??*?대씪 湲곕줉留??④릿??|
| P3-36 | `components/table/TableSurface.jsx:47` | 濡쒕뵫 以?`buildSkeletonRows(head, skeletonRowCount)`(`skeletonRows.js:21`)媛 留??뚮뜑 ??諛곗뿴??留뚮뱾??`adaptedRows` 硫붾え瑜?**?뺤젙?곸쑝濡?* 臾댄슚?뷀븳??P1-13 ??濡쒕뵫 援ш컙 鍮꾩슜) |

---

## ?듦낵 (?뺤씤?덇퀬 臾몄젣 ?놁쓬)

> 移⑤У = 誘멸?利??ㅻ룆??留됯린 ?꾪빐 紐낆떆?쒕떎.

| 異?| ?뺤씤 ?댁슜 | ?먯젙 |
|----|----------|------|
| **?뚮뜑 猷⑦봽 ??`invoke()` (吏꾩꽦 N+1)** | 582 ?뚯씪 ??踰붿쐞?먯꽌 `.map()`/`forEach` **?뚮뜑 猷⑦봽** ?덉쓽 `invoke`/`requestJira` **0嫄?*. P1-4 ??`getUser` ???꾨? queryFn ?대? 猷⑦봽(?섏젙 ??곸씠吏留??뚮뜑 猷⑦봽???꾨땲?? | **?듦낵** |
| **`requestJira` 寃쎈줈 吏묒쨷??* | ?꾨줎?몄쓽 Jira 吏곸젒 ?몄텧? `utils/jiraApi/requestJira.js:168` ?⑥씪 吏?먯쓣 ?듦낵?쒕떎. ?곕컻??`requestJira` ?몄텧 ?놁쓬 | **?듦낵** |
| **肄붾뱶 ?ㅽ뵆由ы똿 援ъ“** | `App.jsx` ?쇱슦??15媛?+ `constants/tabs.js` ??13媛?+ `ProjectWorkPanel.jsx` 酉?2媛쒓? `React.lazy`. 鍮뚮뱶 ?곗텧臾쇱뿉??**echarts(1,112KB 泥?겕)쨌xyflow쨌svar-gantt쨌exceljs쨌react-grid-layout쨌kanban-kit ??main ??0諛붿씠??* ?뺤씤 ??遺꾨━ ?먯껜???섎룄?濡??숈옉 以묒씠???덉쇅??P1-1 ???⑹뼱由? | **?듦낵** |
| **???쒖꽦-only ?뚮뜑** | `components/tabs/CommonTab.jsx:70-81` ???쒖꽦 ??1媛쒕쭔 ?뚮뜑 + Suspense/ChunkErrorBoundary 寃쎄퀎 ?뚯쑀. `MainPageTabs`/`ProjectDetailTabs` 媛 ?대? ?ъ슜 | **?듦낵** (?덉쇅 2嫄? P1-2 `ResourcePage`, `IssueAddModal`) |
| **?대쭅 諛깃렇?쇱슫???뺤?** | `pages/project/ProjectPage.jsx:30`(5遺?쨌`projectKanban/ProjectKanbanBoard.jsx:85`(3遺?? `refetchIntervalInBackground` 誘몄꽕????`query-core/queryObserver.js:215` ??`focusManager.isFocused()` 媛?쒕줈 諛깃렇?쇱슫????뿉???뺤?. `ProjectPage.jsx:31` ???대떦 ?듭뀡??**二쇱꽍 泥섎━**??寃껊룄 ?섎룄?? ????? `CommonTab` ???숈떆???댁븘 ?덉????딅떎 | **?듦낵** (?덉쇅: P1-7 `JobPollingManager` ??raw setInterval ?대씪 ??蹂댄샇 諛? |
| **紐⑤떖 ?곗씠???좊줈??* | `components/modal/CommonModal.jsx:26` ??`{isOpen && children}` ?쇰줈 寃뚯씠????`TeamSelect`쨌`ProjectUserPanel`쨌`ProjectIssuePanel`쨌`RequiredSkillEditor` ?깆씠 ?닿린 ?꾧퉴吏 留덉슫?????? `projectKanban/KanbanCard.jsx:188,194` 媛 移대뱶留덈떎 紐⑤떖 2媛쒕? ?뚮뜑?섏?留?媛숈? ?댁쑀濡?移대뱶??invoke 0 | **?듦낵** (?덉쇅: P3-23 `UserPage` ??紐⑤떖 2醫낆? `CommonModal` 諛뽰뿉???낆쓣 ?몄텧) |
| **`enabled` 媛??* | resource/portfolio/myPage ???낆씠 沅뚰븳쨌?앸퀎??媛??蹂댁쑀(`canRead`, `canReadReport`, `!!accountId && projectIds.length>0`, `!!teamKey`, `!!projectId && enabled`). myWork/backoffice ??`useMyWorklogList.js:28`, `useMyIssueTable.js:23`, `WorklogPage.jsx:104,134`, `ProjectDetailDrawer.jsx:85,104,114`, `useSkillQuickAddModal.js:31`, `useUserEditModal.js:86,114`, `useTeamMemberAssignModal.js:44` ?뺤긽 | **?듦낵** (?꾨씫 2嫄?P3-30) |
| **ECharts `option` 硫붾え??* | portfolio ?꾩젽 13醫?+ teamAnalytics 6醫?+ allocation + myPage 3醫?+ `cost/*`쨌`progress/ProgressSCurve.jsx:127`쨌`analysisReport/issue/IssueAnalysisChart.jsx:252`쨌`taskHistory/TaskHistoryBurnup.jsx:70`쨌`dashboard/ChartTemplate.js:160` **?꾨? `useMemo` + ?щ컮瑜?deps**. `t`(`stores/useI18nStore.js:4-13`)? `isDark` ???덉젙 李몄“ | **?듦낵** (deps 媛 留ㅻ쾲 諛붾뚮뒗 ?덉쇅 2嫄? P1-10, P3-4) |
| **ECharts ?뚮쭏 ?깅줉 ?꾩튂** | `components/chart/echart/ThemedECharts.js:15` 媛 `utils/echartsTheme`(=`import * as echarts`) 瑜??뚯쑀?섍퀬 `App.jsx:3-7` ??吏꾩엯遺 import 瑜?湲덉??섎뒗 洹쇨굅瑜?紐낆떆. 鍮뚮뱶?먯꽌 echarts 0諛붿씠??in main ?쇰줈 ?ㅼ쬆??| **?듦낵** |
| **Zustand ??됲꽣 踰붿쐞** | ?ㅽ넗????됲꽣媛 **??媛앹껜/諛곗뿴??諛섑솚?섎뒗 吏??0嫄?*(`s => s.t`, `s => s.canRead('X')` ???ㅼ뭡?쇰쭔). 愿묒뿭 ?щ젋???좊컻 ?놁쓬. projectDetail ?몃━??React Context ???녿떎 | **?듦낵** |
| **?곌린 ??罹먯떆 ?⑥튂 洹쒖빟** | `projectDetail/assignment/*`(`useAssignWorkItem.js:17,45-51` ??invalidate 湲덉? + `refetchOnWindowFocus:false`), `gantt/useGanttFolderMutations.js:16-21`, `useGanttMutations` ???쇱젙/遺紐?留곹겕 3醫?`:156-158` 洹쇨굅 二쇱꽍), `ProjectIssueTable` ??`patchGroupPage`, `resource/assignment/patchAssignmentCache.js:6,95` ?꾨? 以??| **?듦낵** (?꾨컲 2嫄? P1-5 `useUpdateCoworkers`, P2-5 ?뚰겕濡쒓렇 ?쒕∼) |
| **?숆????낅뜲?댄듃** | `projectKanban/useKanbanMutations.js` 6醫?紐⑤몢 `onMutate` ?숆? ?⑥튂 + `onError` 濡ㅻ갚 + ?뺥솗 踰붿쐞 invalidate(`utils/queryKey/projectKeys.js:25-39`) | **?듦낵** |
| **愿묒뿭 invalidate ?⑤컻** | `backoffice/page/setting/SalaryPolicySetting.jsx:116-121`(6??? `backoffice/page/team/TeamPage.jsx:103-111`(5??? **?대떦 ?섏씠吏???쒖꽦 愿痢≪옄媛 ?놁뼱 stale 留덊궧?쇰줈 ?앸궃??*(?ㅼ젣 ?ъ“??0~1??. `TeamPage.jsx:106-108` ??洹쇨굅 二쇱꽍???덈떎. `utils/queryKey/salaryBandInvalidation.js` ???꾩슜 ?뚯뒪?몃줈 怨좎젙 | **?듦낵** (?ㅼ젣 ??뙆 2嫄? P2-3 湲됱뿬, P2-4 ?ъ슜?? |
| **荑쇰━???⑺넗由?怨꾩빟** | ?몃씪??諛곗뿴 由ы꽣??0嫄? `utils/queryKey/queryKeyContract.test.js:24` 媛 `invalidateQueries|setQueryData|...(\[` ?⑦꽩???뺢퇋?앹쑝濡?湲덉? | **?듦낵** |
| **?쒕쾭 ?섏씠吏?* | `backoffice/page/user/UserListPaging.jsx:33`(`getUserListWithPaging`), `pages/project/ProjectPage.jsx:26`(page/pagesize), `IssueAnalysisTable`쨌`TaskHistoryTable`(而ㅼ꽌), `getProjectSalaryList`(page), `findProjectusersByProjectId`(page/pageSize), `assignment/ProjectGroupCard.jsx:55-56,127-134`(1??lazy 留덉슫????`display` ?좉? ???묎린/?닿린 ?ъ“??0) ?뺤긽. **?꾨웾 ?섏떊 ???대씪 ?섏씠吏뺤? `useTeamMemberAssignModal.js:54-86` 1嫄대퓧?닿퀬, `:19-25` 二쇱꽍??"?쒕쾭 ?섏씠吏?寃쎈줈??沅뚰븳 異뺤씠 ?щ씪 ?????녿떎"??洹쇨굅媛 臾몄꽌??*???덈떎 | **?듦낵** |
| **媛?곹솕/?덈룄??* | `resource/assignment/people/CompanyResourceTable.jsx:45` 媛 `useInfiniteSlice(rows,{initial:30,step:30})`. `CommonTable`??TableSurface`?묭ynamicTable ? `rowsPerPage` 濡?DOM ???쒗븳. (臾몄젣??DOM ???꾨땲??洹??욌떒 議곕┰ ??P1-12) | **?듦낵** |
| **?붾컮?댁뒪 ?곸슜 ?꾪솴** | ?뺤긽 10怨???`AssignmentPage.jsx:108-109`(200ms), `ProjectIssuePanel.jsx:42`쨌`IssueAddModal.jsx:35`쨌`IssueAnalysisTable.jsx:164`쨌`TaskHistoryTable.jsx:47`쨌`useSubscriptionPreview.js:26`(300ms), `ProjectHeader.jsx:30`(300ms), `ProjectIssueAssignSelect.jsx:78`(400ms), `DropdownJql.jsx:50`(500ms), `ProjectAssignmentBoard.jsx:77`(200ms), `ProjectUserSelect.jsx:60,109`(1000ms) | **?듦낵** (?꾨씫 5怨? P1-8, P1-12) |
| **Jira 沅뚰븳 議고쉶 罹먯떛** | `utils/jiraApi/useJiraEditGuards.js:26-27,51-71` 紐⑤뱢 TTL 5遺?罹먯떆 ??裕ㅽ뀒?댁뀡留덈떎 ?ъ“???놁쓬 | **?듦낵** |
| **?숈씪 resolver 以묐났 ?몄텧 (??怨듭쑀)** | `getSettingData` 17媛쒖냼 ?꾨? `settingKeys.detail()` 怨듭쑀, `getResourceOverview` 4媛???怨듭쑀(`resourceKeys.overview()`), `getPortfolioDashboard` 瑜?`/dashboard` ? ? 遺꾩꽍 ??씠 怨듭쑀(`useTeamAnalyticsData.js:29-33,83` ??罹먯떆 媛??뺥깭源뚯? 留욎땄), `ganttKeys.data` 瑜?GanttPage/ProjectTreeView 媛 怨듭쑀(酉??꾪솚 ?ъ“??0) | **?듦낵** (staleTime 遺덉씪移섎쭔 P2-7, `view.getContext()` 3以??ㅻ쭔 P2-9) |
| **? 吏묎퀎 ?뚭퀬由ъ쬁 蹂듭옟??* | `utils/team/` ??`teamMetricsByTeam`쨌`rollupTeamTree`쨌`aggregateByTeam`쨌`projectTeamMatrix`쨌`compositionByTeam` ?꾨? ?⑥씪 ?쒗쉶 + Map 湲곕컲. `rollupTeamTree` ??O(teams) + ?ъ씠??諛⑹뼱(`visited`) 蹂댁쑀 | **?듦낵** (以묐났 ?몄텧留?P2-8, P3-14) |
| **`projectDetail/assignment/` ??異?* | 蹂대뱶 1 invoke(`useWorkAssignmentBoard.js:22-34`), ?? `poolOpen && meta?.poolAvailable` ?⑤뵒留⑤뱶(`AssignmentPage.jsx:96`), ???뚯깮媛?硫붾え?? ???몃뱾??`useCallback`, ?쒖닔 ?좏떥??誘몃?寃????먮낯 李몄“ 諛섑솚 ??**由ы룷 ??紐⑤쾾 ?щ?** | **?듦낵** |
| **愿怨꾨룄 ?⑤뵒留⑤뱶 濡쒕뱶** | `AllocationGraphSection` ? `graphOpen` ???뚮쭔 留덉슫????`getResourceAllocationGraph` 媛 ?쇱튌 ?뚮쭔 諛쒖궗(`ProjectAssignmentBoard.jsx:336-340`) | **?듦낵** |
| **FullCalendar 由ъ궗?댁쫰 泥섎━** | `components/calendar/FullCalendar.jsx:27-38` ??ResizeObserver ??**?먭린 ?몄뒪?댁뒪?먮쭔** `getApi().updateSize()` 瑜??몄텧?쒕떎(?꾩뿭 ?붿뒪?⑥튂 ?꾨떂) | **?듦낵** |
| **1?뚯꽦 ?꾩뿭 resize ?붿뒪?⑥튂** | `components/card/CardFullscreen.jsx:25`, `components/card/collapse/CardCollapseContext.jsx:55`, `portfolio/widgets/ChartBox.jsx:19`, `resource/teamAnalytics/TeamChartBox.jsx:32` ???꾨? `setTimeout` 1?뚯꽦(100~200ms) ???곗냽 諛쒗솕 ?놁쓬 | **?듦낵** (?곗냽 諛쒗솕 1嫄? P1-11) |
| **以묐났 ?좏떥/?섏〈??* | `from 'moment'` 吏곸젒 import **0嫄?* ??moment ??`@fullcalendar/moment-timezone` ?꾩씠 ?섏〈?깅퓧?닿퀬 ??肄붾뱶??`dayjs` 濡??듭씪. **?댁쨷 ?좎쭨 ?쇱씠釉뚮윭由??ъ슜 ?놁쓬.** ECharts ??`ThemedECharts` ?⑥씪 吏꾩엯 | **?듦낵** |
| **?ㅽ넗??以묐났 濡쒕뱶 媛??* | `stores/usePermissionStore.js:37` 쨌 `stores/useLicenseStore.js:82` ??`_loaded`/`_loading` 媛???뺤뿉 `App.jsx:72-78` ???댁쨷 `useEffect`(StrictMode ?댁쨷 ?ㅽ뻾 ?ы븿)?먯꽌??invoke 1??| **?듦낵** |
| **`adaptRows` 臾대?寃?理쒖쟻??* | `components/table/tableSort.js:191` ??`if (!needsRewrite) return rows` 媛 ?ㅼ젣濡??숈옉?쒕떎. `sortValue` 瑜??곕뒗 ?쒓? 4媛쒕퓧(`StorageProjectList`, `StorageTableList`, `PortfolioProjectTable`, `ResourceAnalysisTable`)?대씪 **O(?됁쀬뿴) 媛앹껜 ?꾨웾 ?ы븷??寃쎈줈??嫄곗쓽 ?吏 ?딅뒗??* ??P1-13 ???ㅻ퉬?⑹? ?ㅼ틪쨌?꾩떆諛곗뿴 履쎌씠??| **?듦낵** |
| **`hooks/` ??staleTime쨌enabled** | `useProjectTeams`(60s + enabled), `useTeamOptions`(5m + enabled), `useTeamUserCandidates`(5m + enabled), `usePermissionCatalog`(10m + gcTime), `usePublicHolidayList`(30m), `useJiraEditGuards`(5m + 紐⑤뱢 TTL 罹먯떆) ?뺤긽. `useTeamMemberCandidates` ??`staleTime:0` ? `:37` ??洹쇨굅媛 紐낆떆??**?섎룄??* ?좏깮 | **?듦낵** |
| **`CardFullscreen` ?댁쨷 ?뚮뜑 ?놁쓬** | `components/card/CardFullscreen.jsx:29` ??`if (!isOpen) return null` 濡??ロ엺 ?숈븞 children ??洹몃━吏 ?딅뒗??`Card.jsx:82` 媛 ??긽 ?뚮뜑?섎뒗 寃껋쿂??蹂댁씠???ㅻ퉬??0). **P2-15 ???쒕줈???댁쨷 留덉슫?몄????ㅻⅨ 援ъ“** | **?듦낵** |
| **`useInfiniteSlice`** | `utils/useInfiniteSlice.js` ??IntersectionObserver ?뺣━쨌?섏〈???뺤긽 | **?듦낵** |
| **`JobPollingManager` ?대? 諛⑹뼱** | `inFlightRef` 以묐났 ?몄텧 李⑤떒 쨌 `nextPollAtRef` 吏??諛깆삤??쨌 `intervalsRef` 以묐났 ?명꽣踰?諛⑹? 쨌 ?몃쭏?댄듃 ?뺣━(`:40-44`) 紐⑤몢 媛뽰땄 ??寃고븿? **諛깃렇?쇱슫??誘몄젙吏? 醫낅즺 議곌굔**(P1-7)肉?| **?듦낵** |

---

## 誘멸?利?(??媛먯궗濡??뺤씤?????녿뒗 寃?

| ??ぉ | ?ъ쑀 |
|------|------|
| P1-1 ??**gzip ?덇컧???뺥솗移?* | ?먮낯 諛붿씠??洹??1,261KB / 34.1%)? ?뚯뒪留듭쑝濡??뺤젙?덉쑝?? gzip ? 肄섑뀗痢좊퀎 ?뺤텞瑜좎씠 ?щ씪 ?ㅼ젣 lazy 遺꾨━ ??`node scripts/check-bundle-budget.js` 瑜??ㅼ떆 ?뚮젮???뺤젙?쒕떎. 蹂몃Ц??250~300KB ??鍮꾨? 異붿젙移섎떎 |
| 媛???ぉ??**?ㅼ젣 泥닿컧 吏??ms)** | ?뺤쟻 遺꾩꽍?대씪 ?몄텧 ?잛닔쨌?щ젋??踰붿쐞쨌諛붿씠?몃쭔 ?뺣웾?뷀뻽?? ?꾨줈?뚯씪???ㅼ륫(React DevTools Profiler / Performance ??? 誘몄닔??|
| ????곗씠???쒕굹由ъ삤??**?ㅼ젣 ?곗씠??洹쒕え** | 500紐?議곗쭅쨌2,000 ?댁뒋쨌50 ?꾨줈?앺듃 ?깆? 肄붾뱶???곹븳 ?곸닔(`USER_MAX=100`, `MAX_ISSUES=2000`, `MAX_GRAPH_PROJECTS=15`, ? 500)?먯꽌 媛?몄삩 媛믪씠?? ?댁쁺 ?ъ씠?몄쓽 ?ㅼ젣 遺꾪룷??誘명솗??|
| Forge iframe ?먯꽌 `refetchOnWindowFocus` ??**?ㅼ젣 諛쒗솕 鍮덈룄** | Jira ?섏씠吏? iframe ?ъ씠 ?ъ빱???꾪솚??`focusManager` ???대뼸寃??≫엳?붿???諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂. ?꾩젣 (a) ??鍮꾩슜? "諛쒗솕?쒕떎硫???議곌굔遺??|
| `EchartPanel` ??ResizeObserver **?섎㉨??猷⑦봽 ?ㅼ옱 ?щ?** | 肄붾뱶 寃쎈줈??媛?ν븯??李⑦듃 resize ??而⑦뀒?대꼫 ?ш린 蹂?????듭?踰??щ컻??, ?ㅼ젣濡?臾댄븳 猷⑦봽???ㅼ뼱媛?붿???釉뚮씪?곗? ?ㅼ륫 ?꾩슂. 由ъ궗?댁쫰 利앺룺(N媛?李⑦듃 ?숈떆 ?ъ륫?? ?먯껜??肄붾뱶濡??뺤젙 |
| ?뚯뒪?맞룸퉴???ㅽ뻾 | ??媛먯궗??**?쎄린 ?꾩슜**?대씪 `npm test`쨌`npm run build` 瑜??덈줈 ?뚮━吏 ?딆븯?? 踰덈뱾 ?섏튂??湲곗〈 `build/` ?곗텧臾?2026-08-12 15:34, `main.4db70f69.js` = raw 3,701,918B / gzip 898,285B / ?덉궛 950,000B) 湲곗??대떎 |
| P1-13 ??Atlaskit ?ъ젙?ъ씠 **?ㅼ젣濡??쇰쭏???먯＜ 諛쒗쁽?섎뒗吏** | 肄붾뱶??`getSortedRows` ??`sortKey` 媛 ?덉쓣 ?뚮쭔 ?뺣젹?쒕떎(?뺤씤 ?꾨즺). 利?"?ъ슜?먭? ?뺣젹 ?ㅻ뜑瑜??대┃?????먯꽌留?諛쒗쁽?섎뒗?? ?ㅼ궗?⑹뿉???뺣젹??耳???梨??ㅻ옒 癒몃Т??鍮꾩쑉? 誘명솗?몄씠?? **?뺣젹??耳쒖? ?딆? ?쒖뿉?쒖쓽 鍮꾩슜(?곕━ 履?`resolveSortableColumns`/`adaptRows` ?ъ떎??? 議곌굔 ?놁씠 諛쒖깮**?섎?濡???ぉ ?먯껜???깅┰?쒕떎 |
| ?쒓? IME 議고빀 以?`onInputChange` **?ㅼ젣 諛쒗솕 ?잛닔** | P1-8쨌P2-19 ??"8~11????議고빀 以묎컙 ?④퀎媛 留ㅻ쾲 諛쒗솕?쒕떎??媛?뺤씠?? 釉뚮씪?곗?쨌IME 議고빀???곕씪 ?ㅻⅤ誘濡??ㅼ륫 ?꾩슂(?붾컮?댁뒪 ?곸슜????뱀꽦? 媛?뺢낵 臾닿??섍쾶 ?깅┰) |



Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_BACKEND.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:321
+ ... TEND_2026-08-12.md'; Get-Content -Raw 'FIX_STAGE3_BACKEND.md'; Get-Co ...
+                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...AGE3_BACKEND.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 
Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_FRONTEND.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:363
+ ... STAGE3_BACKEND.md'; Get-Content -Raw 'FIX_STAGE3_FRONTEND.md'; Get-Co ...
+                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...GE3_FRONTEND.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 
Get-Content : 'C:\CloudJira\moves-workforce\FIX_STAGE3_BUNDLE.md' 경로는 존재하지 않으므로 찾을 수 없습니다.
위치 줄:2 문자:406
+ ... Raw 'FIX_STAGE3_FRONTEND.md'; Get-Content -Raw 'FIX_STAGE3_BUNDLE.md'
+                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (C:\CloudJira\mo...TAGE3_BUNDLE.md:String) [Get-Content], ItemNotFoundEx 
   ception
    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand
 

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command '$f=@('"'src/queue/consumer.js','src/nosql/query/CustomEntityManager.js','src/permission/PrincipalResolver.js','src/queue/__test__/JobCompletion.test.js','static/ui/src/components/calendar/FullCalendarLazy.jsx','static/ui/src/components/markdown/MarkdownEditorLazy.jsx','static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js','static/ui/src/pages/myWork/WorklogPage.jsx','static/ui/src/pages/myWork/modal/WorklogModal.jsx','static/ui/src/pages/projectDetail/gantt/useGanttMutations.js','static/ui/src/pages/resource/ResourcePage.jsx','static/ui/src/pages/projectDetail/work/WORK_VIEWS.md'); foreach("'$p in $f){"`n--- $p ---"; $n=0; Get-Content $p | ForEach-Object {$n++; '"'{0,5}: {1}' -f "'$n,$_}}' in C:\CloudJira\moves-workforce
 succeeded in 1538ms:

--- src/queue/consumer.js ---
    1: import {createConsumerHandler} from "../utils/queueUtil";
    2: import {searchJiraUsersApi} from "../api/jira/user/UserApi";
    3: import {addUsersBulk} from "../resolver/backoffice/user/UserRepository";
    4: import {customEntityManager} from "../nosql/query/CustomEntityManager";
    5: import {isLicenseBlocked} from "../utils/license/LicenseGuard";
    6: import {aggregateAllProjects} from "../resolver/portfolioDashboard/PortfolioAggregator";
    7: import {getProjectIdFieldIdApi} from "../api/jira/field/FieldApi";
    8: import {setAppFieldValueForIssues} from "../api/jira/field/AppFieldValueApi";
    9: import {
   10:     findSubscriptionBySourceRepository,
   11:     incrementTaggedRepository,
   12: } from "../resolver/projectSubscription/ProjectSubscriptionRepository";
   13: import {applyDefaultEstimate} from "../resolver/projectSubscription/DefaultEstimateApplier";
   14: import {ASSIGNED_VIA, recordAssignedDateOnce} from "../api/jira/issue/AssignedDateRecorder";
   15: 
   16: const jobManager = customEntityManager('job');
   17: const jobBatchManager = customEntityManager('job_batch');
   18: const jobFailManager = customEntityManager('job_fail');
   19: 
   20: export const uploadUsers = createConsumerHandler(
   21:     async (event) => {
   22:         // 誘몃씪?댁꽑???좊즺??鍮꾪솢?? ?ㅼ튂?먯꽌???ъ슜???낅줈??泥섎━瑜?嫄대꼫?대떎. (臾대즺/誘몃벑濡?媛쒕컻? ?듦낵)
   23:         if (await isLicenseBlocked()) {
   24:             console.log('[uploadUsers] skipped: license inactive');
   25:             return;
   26:         }
   27:         // batch(item) consume start size = 20 batchIndex = ?낅┰??(worker 異⑸룎?놁쓬)
   28:         const { appJobId, batchId, batchIndex, totalBatches, items } = event.body;
   29:         if (!Array.isArray(items)) return;
   30:         // retry ??以묐났 泥섎━ 諛⑹?  ?대? ?꾨즺??諛곗튂?몄? ?뺤씤
   31:         const existingBatch = await jobBatchManager
   32:             .findById(`${appJobId}-batch-${batchIndex}`)
   33:             .catch(() => null);
   34:         // ?대? ?꾨즺??諛곗튂硫?吏묎퀎留??ъ떆?꾪븯怨?醫낅즺
   35:         if (existingBatch?.done) {
   36:             await checkJobCompletion(appJobId, totalBatches);
   37:             return;
   38:         }
   39:         // items??媛??대찓?쇰줈 Jira API 蹂묐젹 ?몄텧
   40:         const results = await Promise.allSettled(
   41:             items.map(item => searchJiraUsersApi('app',item.email))
   42:         );
   43: 
   44:         const usersToInsert = [];
   45:         let failCount = 0;
   46: 
   47:         for (let i = 0; i < results.length; i++) {
   48:             const item = items[i];
   49:             const result = results[i];
   50:             // Jira API ?ㅽ뙣 ??
   51:             if (result.status === 'rejected') {
   52:                 failCount++;
   53:                 const failKey = `${batchId}:${i}`;
   54:                 await jobFailManager.save(failKey, {
   55:                     jobId: appJobId,
   56:                     data: item.email,
   57:                     message: result.reason?.message ?? 'API ERROR'
   58:                 });
   59:                 continue;
   60:             }
   61:             // API ?깃났? ?덉?留?Jira User媛 ?놁쓬
   62:             const user = result.value?.[0];
   63:             if (!user?.accountId) {
   64:                 failCount++;
   65:                 const failKey = `${batchId}:${i}`;
   66:                 await jobFailManager.save(failKey, {
   67:                     jobId: appJobId,
   68:                     data: item.email,
   69:                     message: 'User not found'
   70:                 });
   71:                 continue;
   72:             }
   73:             // ?뺤긽 寃???곗씠??
   74:             usersToInsert.push({
   75:                 accountId: user.accountId,
   76:                 createdId: item.createdId,
   77:                 permission_key : item.permissionMemberKey
   78:             });
   79:         }
   80:         // DB ???
   81:         if (usersToInsert.length > 0) {
   82:             await addUsersBulk(usersToInsert);
   83:         }
   84:         //
   85:         await jobBatchManager.saveTTL(`${appJobId}-batch-${batchIndex}`, {
   86:             processedCount: items.length,
   87:             jobId: appJobId,
   88:             failCount,
   89:             done: true,
   90:         });
   91: 
   92:         // ?꾩껜 ?꾨즺 ?щ? ?뺤씤
   93:         await checkJobCompletion(appJobId, totalBatches);
   94:     },
   95:     {
   96:         retry: true,
   97:         retryCondition: (error) => {
   98:             return (
   99:                 error?.status === 429 ||                    // API ?쒕룄 珥덇낵
  100:                 error?.message?.includes('rate') ||
  101:                 error?.message?.includes('timeout') ||
  102:                 error?.message?.includes('ECONNRESET')
  103:             );
  104:         },
  105:     }
  106: );
  107: /**
  108:  * ?ы듃?대━???섎룞 ?ъ쭛怨?而⑥뒋癒?
  109:  * resolver ?먯꽌 aggregateAllProjects() 瑜?fire-and-forget ?쇰줈 ?섏?硫? resolver invocation ??
  110:  * 醫낅즺????諛깃렇?쇱슫?쒕줈 ?⑥? 肄붾뱶??Forge proxy ?몄쬆??留뚮즺?섏뼱 泥?write(setRollupMeta)遺??
  111:  * "proxy authorization expired" 濡??ㅽ뙣?쒕떎. ?먯껜 invocation(600s)??媛吏???而⑥뒋癒몄뿉??
  112:  * await ?ㅽ뻾?섎㈃ ?몄쬆???좏슚???숈븞 ?꾨즺?쒕떎. (?ㅼ?以??ㅻ깄??寃쎈줈? ?숈씪???덉쟾 ?⑦꽩)
  113:  */
  114: export const aggregatePortfolio = createConsumerHandler(
  115:     async () => {
  116:         if (await isLicenseBlocked()) {
  117:             console.log('[aggregatePortfolio] skipped: license inactive');
  118:             return;
  119:         }
  120:         await aggregateAllProjects();
  121:     },
  122:     { retry: false },
  123: );
  124: 
  125: /**
  126:  * 援щ룆 諛깊븘 而⑥뒋癒?(RFC-171 P3).
  127:  *
  128:  * ?곸옱 ?쒖젏??SCAN ???앸굹 **???紐⑸줉??怨좎젙**???덉쑝誘濡?SubscriptionBackfill), ?ш린?쒕뒗
  129:  * 寃???놁씠 APPLY 留??쒕떎. ?ъ떆????以묐났 write 媛 ?섎룄 媛믪씠 媛숈븘 硫깅벑?대떎.
  130:  *
  131:  * ??留?諛곗튂留덈떎 援щ룆???ш?利앺븳?????먯뿉 ?볦뿬 ?덈뒗 ?숈븞 ?ъ슜?먭? 援щ룆???댁젣?섍굅??洹쒖튃??
  132:  *   諛붽엥?????덈떎. ?≪? 洹쒖튃?쇰줈 ?쒓퉭?섎㈃ ?ъ슜?먭? 痍⑥냼???숈옉???ㅻ뒭寃??ㅽ뻾?섎뒗 ?덉씠??
  133:  *   (`generation` ? 洹쒖튃 蹂寃???+1 ?쒕떎.)
  134:  */
  135: export const backfillSubscription = createConsumerHandler(
  136:     async (event) => {
  137:         if (await isLicenseBlocked()) {
  138:             console.log('[SUBSCRIPTION BACKFILL] skipped: license inactive');
  139:             return;
  140:         }
  141: 
  142:         const {
  143:             appJobId, batchId, batchIndex, totalBatches,
  144:             sourceType, sourceId, projectId, generation, issueIds,
  145:         } = event.body ?? {};
  146: 
  147:         if (!Array.isArray(issueIds) || !issueIds.length) return;
  148: 
  149:         const key = batchId ?? `${appJobId}-batch-${batchIndex}`;
  150: 
  151:         // ?ъ떆??以묐났 諛⑹? ???대? ?앸궃 諛곗튂硫?吏묎퀎留??ㅼ떆 ?쒕룄?쒕떎
  152:         const existingBatch = await jobBatchManager.findById(key).catch(() => null);
  153:         if (existingBatch?.done) {
  154:             await checkJobCompletion(appJobId, totalBatches);
  155:             return;
  156:         }
  157: 
  158:         // 援щ룆 ?곹깭 ?ш?利?痍⑥냼쨌鍮꾪솢?굿룰퇋移?蹂寃승룹냼???댁쟾)
  159:         const sub = await findSubscriptionBySourceRepository(sourceType, sourceId);
  160:         const stale = !sub
  161:             || sub.isActive === false
  162:             || String(sub.projectId) !== String(projectId)
  163:             || Number(sub.generation) !== Number(generation);
  164: 
  165:         if (stale) {
  166:             console.log(`[SUBSCRIPTION BACKFILL] ${key} ?먭린 ??援щ룆??蹂寃??댁젣??);
  167:             await jobBatchManager.saveTTL(key, {
  168:                 processedCount: 0, jobId: appJobId, failCount: 0, done: true,
  169:             });
  170:             await checkJobCompletion(appJobId, totalBatches);
  171:             return;
  172:         }
  173: 
  174:         const fieldId = await getProjectIdFieldIdApi();
  175:         if (!fieldId) {
  176:             // ?꾨뱶瑜?紐?李얠쑝硫??ъ떆????곸씠???쇱떆 ?ㅻ쪟?????덉쓬) ??throw ?댁꽌 retry ??留↔릿??
  177:             throw new Error('moves_RMS_projectId field not found');
  178:         }
  179: 
  180:         let failCount = 0;
  181:         try {
  182:             await setAppFieldValueForIssues({
  183:                 fieldIdOrKey: fieldId,
  184:                 issueIds,
  185:                 value: String(sub.projectId),
  186:             });
  187:             await incrementTaggedRepository(sourceType, sourceId, issueIds.length);
  188: 
  189:             // ?몄엯 ?댁뒋???깅줉?쇱쓣 理쒖큹 1??湲곕줉?쒕떎(?묒뾽 ?대젰?먯꽌 "異붿쟻 ???쇰줈 ?⑥? ?딄쾶).
  190:             // recorder ??throw ?섏? ?딆쑝誘濡??꾨옒 failCount/retryCondition ?먯젙???곹뼢???녿떎.
  191:             await recordAssignedDateOnce({
  192:                 issueIds,
  193:                 extra: {assignedVia: ASSIGNED_VIA.SUBSCRIPTION},
  194:                 logPrefix: '[SUBSCRIPTION BACKFILL] ?깅줉??湲곕줉 ?ㅽ뙣(臾댁떆)',
  195:             }).catch(e => console.error('[SUBSCRIPTION BACKFILL] ?깅줉??湲곕줉 ?ㅽ뙣(臾댁떆)', e));
  196: 
  197:             // ?덉긽 ?쒓컙??鍮꾩뼱 ?덈뒗 ?댁뒋?먮쭔 援щ룆 湲곕낯媛믪쓣 梨꾩슫???ㅼ젙??寃쎌슦?먮쭔)
  198:             if (sub.defaultEstimateSeconds) {
  199:                 await applyDefaultEstimate({
  200:                     issueIds,
  201:                     defaultEstimateSeconds: sub.defaultEstimateSeconds,
  202:                 }).catch(e => console.error('[SUBSCRIPTION BACKFILL] 湲곕낯 ?덉긽 ?쒓컙 ?곸슜 ?ㅽ뙣(臾댁떆)', e));
  203:             }
  204:         } catch (e) {
  205:             // 諛곗튂 ?⑥쐞 ?ㅽ뙣??湲곕줉留??섍퀬 job ??怨꾩냽 吏꾪뻾?쒗궓??
  206:             // ?볦튇 ?댁뒋??由ъ빻?ㅼ씠 ?ㅼ떆 ?〓뒗??IS EMPTY ??硫깅벑).
  207:             failCount = issueIds.length;
  208:             console.error('[SUBSCRIPTION BACKFILL] batch write ?ㅽ뙣', key, e);
  209:             throw e;   // retryCondition ???먯젙 ???쇱떆 ?ㅻ쪟硫??ъ떆?? ?꾨땲硫??꾪뙆
  210:         } finally {
  211:             if (!failCount) {
  212:                 await jobBatchManager.saveTTL(key, {
  213:                     processedCount: issueIds.length, jobId: appJobId, failCount: 0, done: true,
  214:                 });
  215:                 await checkJobCompletion(appJobId, totalBatches);
  216:             }
  217:         }
  218:     },
  219:     {
  220:         retry: true,
  221:         retryCondition: (error) => (
  222:             error?.status === 429
  223:             || String(error?.code ?? '').includes('429')
  224:             || error?.message?.includes('rate')
  225:             || error?.message?.includes('timeout')
  226:             || error?.message?.includes('ECONNRESET')
  227:             || error?.message?.includes('field not found')
  228:         ),
  229:     },
  230: );
  231: 
  232: /** ?꾨즺 ?먯젙 ?ㅼ틪???섏씠吏 ?ш린 (KVS 荑쇰━ limit ?곹븳) */
  233: const JOB_BATCH_PAGE_LIMIT = 100;
  234: 
  235: /**
  236:  * @param appJobId
  237:  * @param totalBatches
  238:  * @returns {Promise<void>}
  239:  *
  240:  * ?꾩껜 諛곗튂 ?꾨즺 ?щ? ?뺤씤 諛?job 理쒖쥌 吏묎퀎 ?⑥닔 媛?諛곗튂???곹깭??jobBatchManager濡??뺤씤?섎ŉ
  241:  * 理쒖쥌 ?곹깭??jobManager???낅뜲?댄듃 ?섏뿬 愿由ы븳??
  242:  *
  243:  * ?? ?깅뒫 (2026-08-12 媛먯궗 A-4) ????????????????????????????????????????????????
  244:  * ?댁쟾?먮뒗 諛곗튂媛 ?섎굹 ?앸궇 ?뚮쭏??`findById(`${appJobId}-batch-${i}`)` 瑜?0..totalBatches-1
  245:  * **?꾨?** 諛쒗뻾?댁꽌, job ?섎굹??KVS ?쎄린媛 `B 횞 (B+1) ??B짼` ???U=5,000 ?낅줈????62,750??.
  246:  * 吏湲덉? `job_batch` ??`jobId` ?몃뜳?ㅻ? 而ㅼ꽌 ?섏씠吏뺤쑝濡??묐뒗????1???먯젙 鍮꾩슜??
  247:  * `ceil(?꾨즺諛곗튂??/ 100)` ?섏씠吏濡??⑥뼱吏꾨떎(?遺遺꾩쓽 ?몄텧? 1?섏씠吏).
  248:  *
  249:  * ?? 硫깅벑??(?먮뒗 蹂묐젹쨌?ъ떆???뚮퉬?? ?????????????????????????????????????????
  250:  * 移댁슫?곕? ?곕줈 ?먯? ?딅뒗?? Forge KVS ?먮뒗 ?몃옖??뀡???먯옄??利앷????놁뼱??
  251:  * read-modify-write 移댁슫?곕뒗 (a) 媛깆떊 ?좎떎濡??꾨즺媛 ?곸쁺 ?ㅼ? ?딄굅??
  252:  * (b) ?ъ떆??諛곗튂??以묐났 利앷?濡?**議곌린 ?꾧껐**?쒕떎. ???諛곗튂 ?덉퐫???먯껜瑜?吏꾩떎???먯쿇?쇰줈 ?대떎:
  253:  *   쨌 諛곗튂 ?덉퐫?쒕뒗 泥섎━媛 ?앸궗???뚮쭔 `done: true` 濡???λ맂??誘몄셿猷??덉퐫?쒕뒗 議댁옱?섏? ?딅뒗??.
  254:  *   쨌 ?ㅺ? `${appJobId}-batch-${index}` 濡?諛곗튂留덈떎 ?좎씪?섎?濡? 媛숈? 諛곗튂媛 ?ъ떆?꾨줈 紐?踰?
  255:  *     ??λ릺??媛숈? ?ㅻ? ??뼱?대떎 ??以묐났 怨꾩닔媛 ?먯쿇?곸쑝濡?遺덇??ν븯??
  256:  *   쨌 ?곕씪??"?쒕줈 ?ㅻⅨ ?ㅼ쓽 done ?덉퐫??????**?꾨즺 諛곗튂 ?섏? ?뺥솗??媛숆퀬 ?⑥“ 利앷?**?쒕떎.
  257:  * 利?醫낆쟾 援ы쁽怨?**媛숈? ??吏묓빀???몃뒗 ?ㅻⅨ 諛⑸쾿**??肉먯씠???먯젙 寃곌낵媛 諛붾뚯? ?딅뒗??
  258:  * `appJobId` ??job ?앹꽦 ????UUID ???댁쟾 job ???덉퐫?쒓? ?욎뿬 ?ㅼ뼱???ъ????녿떎.
  259:  */
  260: const checkJobCompletion = async (appJobId, totalBatches) => {
  261:     const total = Number(totalBatches);
  262:     // 諛곗튂 ?섎? 紐⑤Ⅴ硫??꾨즺瑜??먯젙?????녿떎(?꾨옒 ?ㅼ틪 ?곹븳???낅젰?닿린???섎떎)
  263:     if (!appJobId || !Number.isInteger(total) || total <= 0) return;
  264: 
  265:     // ??λ맂 諛곗튂 ?덉퐫?쒕뒗 ?꾨? done ?대?濡??곹븳??total 濡??먮㈃ ?먯젙???꾩슂??留뚰겮留??쎄퀬 硫덉텣??
  266:     let scan;
  267:     try {
  268:         scan = await jobBatchManager.findByWherePaged('jobId', appJobId, JOB_BATCH_PAGE_LIMIT, total);
  269:     } catch (e) {
  270:         // 議고쉶 ?ㅽ뙣???꾨즺 ?먯젙??誘몃０ 肉먯씠?????ㅼ쓬 諛곗튂(?먮뒗 ?ъ떆??媛 ?ㅼ떆 ?먯젙?쒕떎.
  271:         console.error('[checkJobCompletion] batch scan failed', appJobId, e);
  272:         return;
  273:     }
  274: 
  275:     // ??湲곗? 以묐났 ?쒓굅 ???ъ떆????μ? ??뼱?곌린???먮옒 ?좎씪?섏?留? ?섏씠吏 寃쎄퀎 諛⑹뼱濡??④릿??
  276:     const seen = new Set();
  277:     const doneBatches = [];
  278:     for (const row of scan?.results ?? []) {
  279:         const value = row?.value ?? row;
  280:         if (!value?.done) continue;
  281:         const key = row?.key;
  282:         if (key) {
  283:             if (seen.has(key)) continue;
  284:             seen.add(key);
  285:         }
  286:         doneBatches.push(value);
  287:     }
  288: 
  289:     if (doneBatches.length < total) return;
  290:     // 吏묎퀎
  291:     const totalProcessed = doneBatches.reduce((s, b) => s + (b.processedCount || 0), 0);
  292:     const totalFailed = doneBatches.reduce((s, b) => s + (b.failCount || 0), 0);
  293: 
  294:     const job = await jobManager.findById(appJobId);
  295:     if (!job) {
  296:         console.error("JOB NOT FOUND");
  297:         return;
  298:     }
  299:     // 理쒖쥌 ?곹깭 ?낅뜲?댄듃
  300:     await jobManager.saveTTL(appJobId, {
  301:         ...job,
  302:         processed: totalProcessed,
  303:         failed: totalFailed,
  304:         status: totalFailed > 0 ? 'PARTIAL' : 'COMPLETED',
  305:     });
  306: };

--- src/nosql/query/CustomEntityManager.js ---
    1: import {Filter, FilterConditions, kvs, WhereConditions} from '@forge/kvs';
    2: import {CustomEntityError} from "../../error/CustomEntityError";
    3: 
    4: export const customEntityManager = (entityName) => {
    5: 
    6:     if (!entityName) {
    7:         throw new CustomEntityError('INVALID_ENTITY_VALUE', 'entityName is required');
    8:     }
    9: 
   10:     const logError = (action, e) => {
   11:         console.error(`[${entityName}] ${action} failed`, e);
   12:     };
   13: 
   14:     return {
   15:         async save(id, data) {
   16:             try {
   17:                 await kvs.entity(entityName).set(id, {...data});
   18:             }catch (e){
   19:                 logError('save', e);
   20:                 throw CustomEntityError.init(e);
   21:             }
   22:         },
   23: 
   24:         async saveTTL(id, data) {
   25:             try {
   26:                 await kvs.entity(entityName).set(id, {...data},{
   27:                     ttl:{
   28:                         unit:'HOURS',
   29:                         value: 30,
   30:                     }
   31:                 });
   32:             }catch (e){
   33:                 logError('save', e);
   34:                 throw CustomEntityError.init(e);
   35:             }
   36:         },
   37: 
   38:         async findById(id) {
   39:             try {
   40:                 return await kvs.entity(entityName).get(id);
   41:             }catch (e){
   42:                 logError('findById', e);
   43:                 throw CustomEntityError.init(e);
   44:             }
   45:         },
   46: 
   47:         async findByField(indexName, limit = 100) {
   48:             try {
   49:                 return await kvs.entity(entityName)
   50:                     .query()
   51:                     .index(indexName)
   52:                     .limit(limit)
   53:                     .getMany();
   54:             } catch (e) {
   55:                 logError('findByField', e);
   56:                 throw CustomEntityError.init(e);
   57:             }
   58:         },
   59: 
   60:         async findByWhere(indexName, value, limit = 100) {
   61:             try {
   62: 
   63:                 return await kvs.entity(entityName)
   64:                     .query()
   65:                     .index(indexName)
   66:                     .where(WhereConditions.equalTo(value))
   67:                     .limit(limit)
   68:                     .getMany();
   69:             } catch (e) {
   70:                 logError('findByWhere', e);
   71:                 throw CustomEntityError.init(e);
   72:             }
   73:         },
   74: 
   75:         async findAll() {
   76:             try {
   77:                 return await kvs.entity(entityName)
   78:                     .query()
   79:                     .index('name')
   80:                     .limit(100)
   81:                     .getMany();
   82:             }catch (e){
   83:                 logError('findAll', e);
   84:                 throw CustomEntityError.init(e);
   85:             }
   86:         },
   87: 
   88:         /**
   89:          * 而ㅼ꽌 ?섏씠吏뺤쑝濡??뷀떚???꾨웾 ?섏쭛 (? ?꾩엯 P0).
   90:          *
   91:          * `findAll()` ? `.limit(100)` ?섎뱶罹≪씠??100嫄댁쓣 ?섍린硫?議곗슜???섎┛??
   92:          * ?? 100媛쒕? ?섍만 ???덉쑝誘濡?nextCursor 媛 ?놁쓣 ?뚭퉴吏 諛섎났 ?섏쭛?쒕떎.
   93:          * (@forge/kvs ????ㅼ륫: KvsQueryBuilder.cursor() ?낅젰 + ListResult.nextCursor 諛섑솚 吏??
   94:          *
   95:          * **湲곗〈 findAll() ? 蹂寃쏀븯吏 ?딅뒗??* ???ㅻⅨ ?꾨찓???뚭? 諛⑹?.
   96:          *
   97:          * @param {string} indexName  ?뺣젹/?ㅼ틪?????몃뜳?ㅻ챸(manifest indexes ???좎뼵???덉뼱???쒕떎)
   98:          * @param {number} pageLimit  1??議고쉶 嫄댁닔
   99:          * @param {number} maxItems   ?섏쭛 ?곹븳. ?꾨떖?덈뒗??而ㅼ꽌媛 ?⑥븘 ?덉쑝硫?truncated:true
  100:          * @returns {Promise<{results: Array, truncated: boolean}>}
  101:          */
  102:         async findAllPaged(indexName = 'name', pageLimit = 100, maxItems = 500) {
  103:             try {
  104:                 const results = [];
  105:                 let cursor;
  106:                 let truncated = false;
  107: 
  108:                 for (;;) {
  109:                     let query = kvs.entity(entityName)
  110:                         .query()
  111:                         .index(indexName)
  112:                         .limit(pageLimit);
  113: 
  114:                     if (cursor) query = query.cursor(cursor);
  115: 
  116:                     const page = await query.getMany();
  117: 
  118:                     results.push(...(page?.results ?? []));
  119:                     cursor = page?.nextCursor;
  120: 
  121:                     // 而ㅼ꽌媛 ?놁쑝硫?留덉?留??섏씠吏 ???곹븳怨?臾닿??섍쾶 ?뺤긽 醫낅즺(truncated:false).
  122:                     if (!cursor) break;
  123: 
  124:                     // ?곹븳 ?꾨떖 + 而ㅼ꽌 ?붿〈 = ?ㅼ젣濡??섎졇??
  125:                     if (results.length >= maxItems) {
  126:                         truncated = true;
  127:                         break;
  128:                     }
  129:                 }
  130: 
  131:                 if (truncated) {
  132:                     console.error(
  133:                         `[${entityName}] findAllPaged truncated: collected=${results.length}, maxItems=${maxItems} ???곗씠?곌? 遺덉셿?꾪빀?덈떎`,
  134:                     );
  135:                 }
  136: 
  137:                 return { results: results.slice(0, maxItems), truncated };
  138:             } catch (e) {
  139:                 logError('findAllPaged', e);
  140:                 throw CustomEntityError.init(e);
  141:             }
  142:         },
  143: 
  144:         /**
  145:          * ?몃뜳???숇벑議곌굔 + 而ㅼ꽌 ?섏씠吏?(`findAllPaged` ??where 踰꾩쟾).
  146:          *
  147:          * `findByWhere` ??`.limit()` ?곹븳?먯꽌 ?섎━怨?`nextCursor` 瑜?踰꾨┛????
  148:          * `findAll()` 100嫄??섎뱶罹↔낵 **媛숈? ?⑥젙**?대씪, 嫄댁닔媛 ?곹븳???섏쓣 ???덈뒗 怨녹뿉?쒕뒗 ?닿구 ?대떎.
  149:          *
  150:          * **湲곗〈 `findByWhere` ??蹂寃쏀븯吏 ?딅뒗??* ???ㅻⅨ ?꾨찓???뚭? 諛⑹?.
  151:          *
  152:          * @param {string} indexName manifest indexes ???좎뼵???몃뜳?ㅻ챸
  153:          * @param {string|number|boolean} value ?숇벑 鍮꾧탳 媛?
  154:          * @param {number} pageLimit 1??議고쉶 嫄댁닔
  155:          * @param {number} maxItems ?섏쭛 ?곹븳. ?꾨떖?덈뒗??而ㅼ꽌媛 ?⑥븘 ?덉쑝硫?truncated:true
  156:          * @returns {Promise<{results: Array, truncated: boolean}>}
  157:          */
  158:         async findByWherePaged(indexName, value, pageLimit = 100, maxItems = 1000) {
  159:             try {
  160:                 const results = [];
  161:                 let cursor;
  162:                 let truncated = false;
  163: 
  164:                 for (;;) {
  165:                     let query = kvs.entity(entityName)
  166:                         .query()
  167:                         .index(indexName)
  168:                         .where(WhereConditions.equalTo(value))
  169:                         .limit(pageLimit);
  170: 
  171:                     if (cursor) query = query.cursor(cursor);
  172: 
  173:                     const page = await query.getMany();
  174: 
  175:                     results.push(...(page?.results ?? []));
  176:                     cursor = page?.nextCursor;
  177: 
  178:                     // 而ㅼ꽌媛 ?놁쑝硫?留덉?留??섏씠吏 ???곹븳怨?臾닿??섍쾶 ?뺤긽 醫낅즺(truncated:false).
  179:                     if (!cursor) break;
  180: 
  181:                     // ?곹븳 ?꾨떖 + 而ㅼ꽌 ?붿〈. ?몄텧?먭? "?꾩슂??留뚰겮留? ?곹븳?쇰줈 ?곕뒗 寃쎌슦媛 ?덉뼱
  182:                     // (?꾨즺 ?먯젙 ?? findAllPaged ? ?щ━ error 濡쒓렇???④린吏 ?딄퀬 ?뚮옒洹몃쭔 ?뚮젮以??
  183:                     if (results.length >= maxItems) {
  184:                         truncated = true;
  185:                         break;
  186:                     }
  187:                 }
  188: 
  189:                 return { results: results.slice(0, maxItems), truncated };
  190:             } catch (e) {
  191:                 logError('findByWherePaged', e);
  192:                 throw CustomEntityError.init(e);
  193:             }
  194:         },
  195: 
  196:         async findByFilterExists(indexName,filter, limit = 100) {
  197:             try {
  198:                 return await kvs.entity(entityName)
  199:                     .query()
  200:                     .index(indexName)
  201:                     .filters(
  202:                         new Filter().and(filter, FilterConditions.exists())
  203:                     )
  204:                     .limit(limit)
  205:                     .getMany();
  206:             } catch (e) {
  207:                 logError('findByOrderExists', e);
  208:                 throw CustomEntityError.init(e);
  209:             }
  210:         },
  211: 
  212:         async delete(id) {
  213:             try {
  214:                 await kvs.entity(entityName).delete(id);
  215:             }catch (e){
  216:                 logError('delete', e);
  217:                 throw CustomEntityError.init(e);
  218:             }
  219:         },
  220:     };
  221: }

--- src/permission/PrincipalResolver.js ---
    1: /**
    2:  * PrincipalResolver ???몄텧???좎썝/沅뚰븳 ?댁꽍 (permission-hardening ?졖룐몿).
    3:  *
    4:  * 媛??permissionGuard)? userPermissionCheckService 媛 怨듭쑀?섎뒗 ?⑥씪 ?댁꽍湲?SSOT 짠4-C).
    5:  *
    6:  * 諛섑솚(P1 ?뺤옣 ??湲곗〈 8?꾨뱶???꾨? 遺덈?):
    7:  *   湲곗〈: accountId, isAdmin, isUser, name, pages, resourceMap, projectScope, memberProjectIds
    8:  *   ?좉퇋: teamKey, teamName, teamPath, leadingTeamKeys, isTeamLead,
    9:  *         scopeTeamKeys, leadingScopeTeamKeys, teamScopeAccountIds, leadingScopeAccountIds,
   10:  *         permissionSource('personal'|'team'|'team-default'|'none')
   11:  *           쨌 team         : ?(?먮뒗 ?곸쐞 ?)??吏?뺣맂 沅뚰븳 ?명듃瑜??곸냽
   12:  *           쨌 team-default : ?곸냽???명듃媛 ?놁뼱 ???????꾨━?뗭쓣 諛붾떏媛믪쑝濡??곸슜(2026-08-05)
   13:  *
   14:  * `memberProjectIds` ??**?꾨뱶紐낆쓣 ?좎???梨??섎?留??뺤옣**?쒕떎(?뚮퉬??臾대?寃?:
   15:  *   MEMBER_ONLY ??蹂몄씤??projectusers ???덈뒗 project_id
   16:  *   TEAM_ONLY   ??(scopeTeamKeys ??먮뱾??projectusers ???덈뒗 project_id)
   17:  *                 **??* (scopeTeamKeys 媛 project_team ???대떦 諛곗젙??project_id)   ??P2-a ?먯꽌 ?⑹쭛???꾩꽦
   18:  *   洹???      ??null
   19:  *
   20:  * ?깅뒫(짠4):
   21:  *   - accountId ??context ?먯꽌 痍⑤뱷(Jira /myself 遺덊븘??.
   22:  *   - admin ?먯젙(Jira /mypermissions)怨?users ??議고쉶(SQL)??**蹂묐젹**?대떎(2026-08-12, 媛먯궗 A-6).
   23:  *     ?몄텧 ?잛닔??醫낆쟾怨?媛숆퀬 ?뺣났留?2????1?? ?먯젙 ?쒖꽌쨌fail-close ?숈옉? 遺덈?.
   24:  *   - admin  : Jira /mypermissions 1??(+ ?쒖떆??users SQL 1 + ? ?몃뜳??罹먯떆)
   25:  *   - 鍮꼆dmin: Jira 1 + users SQL 1 + KVS permission 1 + ? ?몃뜳??60珥?罹먯떆)
   26:  *              (+ ???TEAM_ONLY ??users SQL 1, + MEMBER_ONLY/TEAM_ONLY ??projectusers SQL 1)
   27:  *   - L1 in-memory TTL(30珥? 罹먯떆: warm 而⑦뀒?대꼫?먯꽌 媛숈? accountId ?꾩냽 媛?쒕뒗 議고쉶 0??
   28:  *     ?뺥솗?깆? 罹먯떆???섏〈?섏? ?딆쓬(?쒖닔 理쒖쟻??. 沅뚰븳 蹂寃?理쒕? ~30珥?吏???꾪뙆(?섏슜).
   29:  *   - ??? ?몃뜳??TeamTreeCache) TTL 60珥덇? ?뷀빐??**? 愿??沅뚰븳 蹂寃쎌? 理쒕? 90珥?stale** ???섏슜?쒕떎.
   30:  *     (????댁젣쨌? ?대룞쨌? 沅뚰븳?명듃 蹂寃? 利됱떆 ?뚯닔??Jira 怨꾩젙 鍮꾪솢?깊솕媛 1李??듭젣?대ŉ 罹먯떆瑜??吏 ?딅뒗??)
   31:  */
   32: 
   33: import { checkAdministerPermission } from '../api/jira/user/UserApi';
   34: import { getUserInfoService } from '../resolver/backoffice/user/UserService';
   35: import {
   36:     findProjectIdsByAccountRepository,
   37:     findProjectIdsByAccountsRepository,
   38: } from '../resolver/projectIssue/ProjectUsersRepository';
   39: import { findAccountTeamPairsByTeamKeys } from '../resolver/backoffice/team/TeamRepository';
   40: import { findProjectIdsByTeamKeysSafe } from '../resolver/projectTeam/ProjectTeamRepository';
   41: import { getTeamIndex } from '../resolver/backoffice/team/TeamTreeCache';
   42: import { descendantsOf, nearestAncestorWith } from '../resolver/backoffice/team/TeamTree';
   43: import { customEntityManager } from '../nosql/query/CustomEntityManager';
   44: import { getSeedPages, mergeSetPages, pagesToResourceMap, RESOURCE_KEYS } from './ResourceCatalog';
   45: import { normalizeScope } from './ProjectScope';
   46: import { PermissionError } from '../error/PermissionError';
   47: import { ErrorCodes } from '../utils/errors/ErrorCodes';
   48: 
   49: const PERMISSION_ENTITY = 'permission';
   50: 
   51: /*
   52:  * ? 湲곕낯 ?명듃 id ??`SeedData.js` ??`PRESET_PERMISSION_SETS` ? **媛숈? 媛믪씠?댁빞 ?쒕떎.**
   53:  * SeedData 瑜?import ?섏? ?딅뒗 ?댁쑀: ?쒕뱶 ?ㅽ뻾 泥댁씤(KVS ?곌린 ?ы븿)??沅뚰븳 ?댁꽍 寃쎈줈???몃젮?⑤떎.
   54:  * ???`__test__/TeamDefaultPermission.test.js` 媛 ???뚯씪??id ?쇱튂瑜?怨좎젙?쒕떎.
   55:  */
   56: const TEAM_LEAD_PRESET_ID = 'permission-TeamLead';
   57: const TEAM_MEMBER_PRESET_ID = 'permission-TeamMember';
   58: const CACHE_TTL_MS = 30 * 1000; // 30珥?
   59: 
   60: /** teamScopeAccountIds 愿痢??곹븳 ??罹≪씠 ?꾨땲???좏샇(珥덇낵?대룄 ?숈옉? 怨꾩냽?쒕떎) */
   61: const TEAM_SCOPE_WARN_THRESHOLD = 2000;
   62: 
   63: // 紐⑤뱢 ?ㅼ퐫??L1 罹먯떆 (best-effort). key: accountId
   64: const cache = new Map();
   65: 
   66: const allFalsePages = () =>
   67:     RESOURCE_KEYS.map(key => ({ pageId: key, value: { read: false, write: false } }));
   68: 
   69: /**
   70:  * ? 愿??principal ?꾨뱶??湲곕낯媛?(P1).
   71:  *
   72:  * ??**`leadingTeamKeys: []` 媛 fail-close ???듭떖?대떎.** ?꾨옒 `resolveTeamContext` ??
   73:  *   `users` ?됱씠 ?뺤씤???ㅼ뿉留??몄텧?섎?濡? 諛깆삤?쇱뒪?먯꽌 ??젣???ъ슜?먭? KVS `team.leaderAccountId`
   74:  *   ??stale ?섍쾶 ?⑥븘 ?덉뼱??**???沅뚰븳??遺?쒗븯吏 ?딅뒗??*(Jira 怨꾩젙? ?댁븘 ?덉뼱 濡쒓렇?몄? ?쒕떎).
   75:  */
   76: const emptyTeamContext = () => ({
   77:     teamKey: null,
   78:     teamName: null,
   79:     teamPath: [],
   80:     leadingTeamKeys: [],
   81:     isTeamLead: false,
   82:     scopeTeamKeys: [],
   83:     leadingScopeTeamKeys: [],
   84:     teamScopeAccountIds: null,
   85:     leadingScopeAccountIds: null,
   86: });
   87: 
   88: const isAdministrator = async () => {
   89:     const result = await checkAdministerPermission();
   90:     return result?.permissions?.ADMINISTER?.havePermission ?? false;
   91: };
   92: 
   93: /**
   94:  * ? 而⑦뀓?ㅽ듃 ?댁꽍 (P1).
   95:  *
   96:  * **?몄텧 ?꾩젣: ?몄텧?먭? `users` ??議댁옱瑜??대? ?뺤씤?덈떎.** ???꾩젣媛 源⑥?硫?stale
   97:  * `team.leaderAccountId` 濡????沅뚰븳???덉뼱 ?섍컙??짠4-1 fail-open). ?꾩젣瑜?肄붾뱶濡?媛뺤젣?????놁쑝誘濡?
   98:  * ?몄텧 吏?먯쓣 buildPrincipal ??2怨녹쑝濡??쒖젙?섍퀬, ?뚯뒪?몃줈 怨좎젙?쒕떎.
   99:  *
  100:  * @param {string} accountId
  101:  * @param {string|null} teamKey users.team_key
  102:  * @returns {Promise<object>} emptyTeamContext() ? 媛숈? ?뺥깭 (+ teamIndex)
  103:  */
  104: const resolveTeamContext = async (accountId, teamKey) => {
  105:     let index = null;
  106:     try {
  107:         // ?쎄린 寃쎈줈 ??60珥?罹먯떆(? CRUD ?붾㈃怨??щ━ ?ш린??沅뚰븳 ?먯젙?대씪 stale ??紐낆떆?곸쑝濡??섏슜?쒕떎)
  108:         index = await getTeamIndex();
  109:     } catch (e) {
  110:         console.error('[PrincipalResolver] team index load error:', e);
  111:         return { ...emptyTeamContext(), teamIndex: null };
  112:     }
  113: 
  114:     const myTeamKey = teamKey && index.byKey.has(teamKey) ? teamKey : null;
  115: 
  116:     // ?닿? 由щ뜑???(吏곸냽) ??users ?됱씠 ?덈뒗 ?ъ슜?먯뿉 ??댁꽌留?怨꾩궛?쒕떎(???꾩젣 李몄“)
  117:     const leadingTeamKeys = [...index.byKey.values()]
  118:         .filter(t => t.leaderAccountId && t.leaderAccountId === accountId)
  119:         .map(t => t.teamKey);
  120: 
  121:     // ?닿? 由щ뜑??? + 洹??꾩넀 ??**write ?먯젙 ?꾩슜**.
  122:     //   scopeTeamKeys ???뚯냽 ?源뚯? ?ы븿?섎?濡?write ???곕㈃ ?먭린 ? ?꾩껜??write 媛 ?대젮 怨쇰??섎떎.
  123:     const leadingScopeTeamKeys = [...new Set(
  124:         leadingTeamKeys.flatMap(key => descendantsOf(index, key, { includeSelf: true })),
  125:     )];
  126: 
  127:     // (?먭린 ? + ?꾩넀) ??(???? + ?꾩넀) ???쎄린 ?ㅼ퐫??
  128:     const scopeTeamKeys = [...new Set([
  129:         ...(myTeamKey ? descendantsOf(index, myTeamKey, { includeSelf: true }) : []),
  130:         ...leadingScopeTeamKeys,
  131:     ])];
  132: 
  133:     return {
  134:         teamKey: myTeamKey,
  135:         teamName: myTeamKey ? index.byKey.get(myTeamKey)?.name ?? null : null,
  136:         teamPath: myTeamKey ? index.pathOf.get(myTeamKey) ?? [] : [],
  137:         leadingTeamKeys,
  138:         isTeamLead: leadingTeamKeys.length > 0,
  139:         scopeTeamKeys,
  140:         leadingScopeTeamKeys,
  141:         teamScopeAccountIds: null,      // ?꾨옒?먯꽌 議곌굔遺濡?梨꾩슫??
  142:         leadingScopeAccountIds: null,
  143:         teamIndex: index,
  144:     };
  145: };
  146: 
  147: /**
  148:  * ? ?ㅼ퐫?????accountId 吏묓빀??梨꾩슫??(SQL 1??.
  149:  *
  150:  * `isTeamLead === true` ?먮뒗 `projectScope === 'TEAM_ONLY'` ???뚮쭔 議고쉶?쒕떎.
  151:  * ??吏묓빀(?쎄린???꾩껜 / ???write ?꾩슜)??**team_key 瑜??④퍡 諛쏆븘 JS ?먯꽌 遺꾪븷**?쒕떎.
  152:  */
  153: const fillTeamScopeAccounts = async (teamCtx, projectScope, accountId) => {
  154:     const needed = teamCtx.isTeamLead || projectScope === 'TEAM_ONLY';
  155:     if (!needed) return teamCtx;
  156: 
  157:     // 鍮?吏묓빀?대㈃ 荑쇰━ ?먯껜瑜?諛쒗뻾?섏? ?딅뒗??Repository 媛?쒖? ?댁쨷 諛⑹뼱) ?????0紐?= fail-close
  158:     if (!teamCtx.scopeTeamKeys.length) {
  159:         return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
  160:     }
  161: 
  162:     let pairs = [];
  163:     try {
  164:         pairs = await findAccountTeamPairsByTeamKeys(teamCtx.scopeTeamKeys);
  165:     } catch (e) {
  166:         console.error('[PrincipalResolver] team scope accounts load error:', e);
  167:         // 議고쉶 ?ㅽ뙣 ??鍮?吏묓빀(????놁쓬). ?볧엳吏 ?딅뒗??
  168:         return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
  169:     }
  170: 
  171:     /*
  172:      * ?뵶 ???蹂몄씤???먭린 ? ?몄썝 吏묓빀???ｋ뒗????"??λ룄 洹?????쇱썝"(2026-08-05).
  173:      *
  174:      *   ??`pairs` ??SQL `users.team_key` 湲곕컲?대씪, ?뚯냽??鍮꾩뼱 ?덈뒗 ??μ? ?ш린 ?섑??섏? ?딅뒗??
  175:      *   紐낆떆?곸쑝濡??뷀븯吏 ?딆쑝硫??뚮퉬 痢≪씠 ??吏묓빀?쇰줈 **?ш탳吏묓빀**???????蹂몄씤???꾨줈 鍮좎쭊????
  176:      *   `MyTeamAnalysisService` ??"???" 紐⑸줉?먯꽌 ??μ씠 ?щ씪吏??寃쎈줈媛 ?뺥솗???닿쾬?대떎.
  177:      *   ??議고쉶 ?ㅽ뙣 寃쎈줈(??catch)?먮뒗 ?뷀븯吏 ?딅뒗?? ?ㅽ뙣??鍮?吏묓빀 = fail-close 濡??좎??쒕떎.
  178:      */
  179:     const withSelf = (ids) => (teamCtx.isTeamLead && accountId ? [...new Set([...ids, accountId])] : ids);
  180: 
  181:     const leadingSet = new Set(teamCtx.leadingScopeTeamKeys);
  182:     const teamScopeAccountIds = withSelf([...new Set(pairs.map(p => p.accountId))]);
  183:     const leadingScopeAccountIds = withSelf([...new Set(
  184:         pairs.filter(p => leadingSet.has(p.teamKey)).map(p => p.accountId),
  185:     )]);
  186: 
  187:     if (teamScopeAccountIds.length > TEAM_SCOPE_WARN_THRESHOLD) {
  188:         // 罹≪씠 ?꾨땲??愿痢??좏샇 ???ш린???섎씪?대㈃ 沅뚰븳??議곗슜??醫곸븘吏꾨떎.
  189:         console.warn(`[PrincipalResolver] teamScopeAccountIds=${teamScopeAccountIds.length} (> ${TEAM_SCOPE_WARN_THRESHOLD})`);
  190:     }
  191: 
  192:     return { ...teamCtx, teamScopeAccountIds, leadingScopeAccountIds };
  193: };
  194: 
  195: /**
  196:  * ?좎썝/沅뚰븳 ?댁꽍. 罹먯떆 ?덊듃 ??議고쉶 0??
  197:  * @param {object} context resolver req.context (accountId ?ы븿)
  198:  * @returns {Promise<object>} principal
  199:  */
  200: export const resolvePrincipal = async (context) => {
  201:     const accountId = context?.accountId;
  202:     if (!accountId) {
  203:         throw new PermissionError(
  204:             ErrorCodes.PERMISSION_PRINCIPAL_UNRESOLVED,
  205:             'Principal accountId is not available in context',
  206:         );
  207:     }
  208: 
  209:     const cached = cache.get(accountId);
  210:     if (cached && cached.expireAt > Date.now()) {
  211:         return cached.value;
  212:     }
  213: 
  214:     const principal = await buildPrincipal(accountId);
  215:     cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });
  216:     return principal;
  217: };
  218: 
  219: /**
  220:  * users ??議고쉶 ???ㅽ뙣??醫낆쟾怨?媛숈씠 "???놁쓬"?쇰줈 ?≪닔?쒕떎(?볧엳吏 ?딅뒗??.
  221:  * 議고쉶 寃곌낵??admin/鍮꼆dmin ??寃쎈줈媛 **紐⑤몢** ?꾩슂濡??쒕떎:
  222:  *   admin  ???쒖떆??? 而⑦뀓?ㅽ듃(+ stale leaderAccountId fail-close ?꾩젣)
  223:  *   鍮꼆dmin ??沅뚰븳 ?명듃/? 寃곗젙
  224:  */
  225: const loadUserRows = async (accountId) => {
  226:     try {
  227:         return (await getUserInfoService({ accountId }))?.rows ?? [];
  228:     } catch (e) {
  229:         console.error('[PrincipalResolver] getUserInfoService error:', e);
  230:         return [];
  231:     }
  232: };
  233: 
  234: const buildPrincipal = async (accountId) => {
  235:     /*
  236:      * ?깅뒫 (2026-08-12 媛먯궗 A-6) ??admin ?먯젙(Jira `/mypermissions`)怨?users ??議고쉶(SQL)??
  237:      * ?쒕줈 ?낅┰?몃뜲 吏곷젹濡?以꾩꽭?뚯졇 ?덉뿀?? ??寃쎈줈 紐⑤몢 users ?됱쓣 ?곕?濡?蹂묐젹濡?臾띠뼱??
  238:      * **?몄텧 ?잛닔??洹몃?濡?*?닿퀬 ?뺣났留?2????1?⑥씠 ?쒕떎(媛?쒕뒗 紐⑤뱺 resolver 吏꾩엯留덈떎 ?덈떎).
  239:      *
  240:      * ???먯젙 遺덈? 議곌굔
  241:      *   쨌 `isAdministrator()` ??catch ?섏? ?딅뒗?????ㅽ뙣??醫낆쟾泥섎읆 throw ?섏뼱 媛?쒓? fail-close ?쒕떎.
  242:      *     (`loadUserRows` ???덈? reject ?섏? ?딆쑝誘濡?Promise.all ??unhandled rejection ??留뚮뱾吏 ?딅뒗??)
  243:      *   쨌 users 議고쉶 ?ㅽ뙣??醫낆쟾泥섎읆 rows=[] 濡??≪닔 ??admin ? ? ?뺣낫 ?놁쓬, 鍮꼆dmin ? 誘몃벑濡?泥섎━.
  244:      *   쨌 ?꾨옒 遺꾧린 ?쒖꽌(admin ??誘몃벑濡???? ???명듃)??洹몃?濡쒕떎. 媛믪씠 ?몄젣 ?꾩갑?섎뒗吏留??щ씪吏꾨떎.
  245:      */
  246:     const [isAdmin, dbUserInfo] = await Promise.all([
  247:         isAdministrator(),
  248:         loadUserRows(accountId),
  249:     ]);
  250: 
  251:     // 1) Jira ADMINISTER ???꾧텒 Admin (??긽 projectScope ALL)
  252:     if (isAdmin) {
  253:         const pages = getSeedPages('admin');
  254: 
  255:         // ? ?뺣낫??best-effort 濡쒕쭔 梨꾩슫????沅뚰븳 ?먯젙?먮뒗 ?곗씠吏 ?딄퀬(admin ? ?꾧텒 諛붿씠?⑥뒪),
  256:         //   /my-page "???" ?뱀뀡 ?몄텧 媛숈? **?쒖떆 ?⑸룄**?? ?ㅽ뙣?대룄 admin ?숈옉???곹뼢???녿떎.
  257:         //   ???ш린?쒕룄 users ?됱씠 ?덉뼱????μ쑝濡??몄젙?쒕떎(stale leaderAccountId fail-close ?쇨?).
  258:         let teamCtx = emptyTeamContext();
  259:         try {
  260:             if (dbUserInfo.length > 0) {
  261:                 const { teamIndex, ...ctx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);
  262:                 teamCtx = ctx;
  263:             }
  264:         } catch (e) {
  265:             console.error('[PrincipalResolver] admin team context error:', e);
  266:         }
  267: 
  268:         return {
  269:             accountId,
  270:             isAdmin: true,
  271:             isUser: true,
  272:             name: 'Admin',
  273:             pages,
  274:             resourceMap: pagesToResourceMap(pages),
  275:             projectScope: 'ALL',
  276:             memberProjectIds: null,
  277:             ...teamCtx,
  278:             permissionSource: 'personal',
  279:         };
  280:     }
  281: 
  282:     // 2) users DB 議고쉶 寃곌낵(?꾩뿉??admin ?먯젙怨?蹂묐젹濡??대? 諛쏆븘 ??? ??permission_key / team_key
  283: 
  284:     // 3) 誘몃벑濡??ъ슜?????꾨? false (fail-close)
  285:     //    ??? 而⑦뀓?ㅽ듃瑜?**怨꾩궛?섏? ?딅뒗??** KVS team.leaderAccountId ????怨꾩젙??stale ?섍쾶
  286:     //      ?⑥븘 ?덉뼱??leadingTeamKeys=[] ??isTeamLead=false 濡?怨좎젙?쒕떎(짠4-1 fail-open 李⑤떒).
  287:     if (!dbUserInfo || dbUserInfo.length === 0) {
  288:         const pages = allFalsePages();
  289:         return {
  290:             accountId,
  291:             isAdmin: false,
  292:             isUser: false,
  293:             name: 'undefined',
  294:             pages,
  295:             resourceMap: pagesToResourceMap(pages),
  296:             projectScope: 'ALL',
  297:             memberProjectIds: null,
  298:             ...emptyTeamContext(),
  299:             permissionSource: 'none',
  300:         };
  301:     }
  302: 
  303:     // 4) ? 而⑦뀓?ㅽ듃 (users ???뺤씤 ?꾩뿉留?怨꾩궛 ????3) 二쇱꽍 李몄“)
  304:     const { teamIndex, ...baseTeamCtx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);
  305: 
  306:     // 5) 沅뚰븳 ?명듃 寃곗젙 ??**媛쒖씤 ?ㅻ쾭?쇱씠????? ?곸냽 fallback** (R2. ?⑹쭛???꾨떂)
  307:     //    ??踰덉뿉 ?섎굹???명듃留??곸슜?섎?濡?projectScope 媛 ??異쒖쿂?먯꽌 ?욎씠??寃쎌슦媛 ?먯쿇 李⑤떒?쒕떎.
  308:     let permissionKey = dbUserInfo[0].permission_key ?? null;
  309:     let permissionSource = 'personal';
  310: 
  311:     if (!permissionKey) {
  312:         /*
  313:          * ?곸냽 ?쒖옉?? ?뚯냽 ? ???놁쑝硫?**?대걚???**.
  314:          *   "??λ룄 洹?????쇱썝"?대?濡? ?뚯냽??鍮꾩뼱 ?덈뒗 ??λ룄 ?먭린 ?(怨??곸쐞)??沅뚰븳 ?명듃瑜??곸냽?댁빞 ?쒕떎.
  315:          *   ?닿쾶 ?놁쑝硫?????명듃媛 吏?뺣뤌 ?덈뒗?곕룄 怨㏓컮濡??꾨━??諛붾떏媛믪쑝濡??⑥뼱??
  316:          *   `媛쒖씤 ??? ?곸냽 ??湲곕낯媛? ?쒖꽌媛 ?ㅼ쭛?뚮떎.
  317:          */
  318:         const inheritFrom = baseTeamCtx.teamKey ?? baseTeamCtx.leadingTeamKeys?.[0] ?? null;
  319:         const inherited = (inheritFrom && teamIndex)
  320:             ? nearestAncestorWith(teamIndex, inheritFrom, t => !!t.permissionKey)
  321:             : null;
  322: 
  323:         if (inherited) {
  324:             permissionKey = inherited.permissionKey;
  325:             permissionSource = 'team';
  326:         } else {
  327:             /*
  328:              * ? 湲곕낯 ?명듃 (2026-08-05) ??媛쒖씤 沅뚰븳???녾퀬 ??먯꽌 ?곸냽諛쏆쓣 ?명듃???놁쓣 ?뚯쓽 諛붾떏媛?
  329:              *
  330:              * ?댁쟾?먮뒗 怨㏓컮濡???由ъ냼??false ??? 洹?寃곌낵 "??먮뒗 ?랁빐 ?덈뒗???꾨Т寃껊룄 紐?蹂대뒗" ?몄썝??
  331:              * ?앷꼈怨? 愿由ъ옄媛 ??紐낆뵫 ?명듃瑜?吏?뺥븯湲??꾧퉴吏 ?깆씠 ?ъ떎??鍮꾩뼱 蹂댁???
  332:              *
  333:              * ?뵶 fail-close 瑜?**?섎룄?곸쑝濡??꾪솕**?섎뒗 吏?먯씠?? ?ㅻ쭔 臾댁젣???꾪솕媛 ?꾨땲??
  334:              *    쨌 ? 而⑦뀓?ㅽ듃媛 ?덈뒗 ?щ엺留?諛쏅뒗????????녾퀬 ??λ룄 ?꾨땲硫?醫낆쟾?濡???由ъ냼??false.
  335:              *    쨌 ???꾨━??紐⑤몢 `projectScope: 'TEAM_ONLY'` + WORKFORCE ?쎄린 ?꾩슜?닿퀬,
  336:              *      PROJECT_COST(?щТ)???ロ? ?덈떎(`SeedData.js` PRESET_PERMISSION_SETS).
  337:              *    쨌 愿由ъ옄媛 ?꾨━?뗭쓣 吏?좊떎硫?KVS 議고쉶媛 null ??`mergeSetPages([])` 濡??꾨? false ??
  338:              *      利??명듃媛 ?놁쑝硫??먮룞?쇰줈 醫낆쟾 ?숈옉(fail-close)?쇰줈 ?뚯븘媛꾨떎.
  339:              */
  340:             const preset = baseTeamCtx.isTeamLead
  341:                 ? TEAM_LEAD_PRESET_ID
  342:                 : (baseTeamCtx.teamKey ? TEAM_MEMBER_PRESET_ID : null);
  343: 
  344:             if (preset) {
  345:                 permissionKey = preset;
  346:                 permissionSource = 'team-default';
  347:             } else {
  348:                 permissionSource = 'none';
  349:             }
  350:         }
  351:     }
  352: 
  353:     // 6) ?곸냽諛쏆쓣 ?명듃媛 ?놁쑝硫???由ъ냼??false (fail-close). KVS 議고쉶 ?먯껜瑜??섏? ?딅뒗??
  354:     if (permissionSource === 'none') {
  355:         const pages = allFalsePages();
  356:         return {
  357:             accountId,
  358:             isAdmin: false,
  359:             isUser: true,
  360:             name: 'undefined',
  361:             pages,
  362:             resourceMap: pagesToResourceMap(pages),
  363:             projectScope: 'ALL',
  364:             memberProjectIds: null,
  365:             ...baseTeamCtx,
  366:             permissionSource,
  367:         };
  368:     }
  369: 
  370:     // 7) KVS permission ?명듃 ??移댄깉濡쒓렇 蹂묓빀
  371:     let set = null;
  372:     try {
  373:         set = await customEntityManager(PERMISSION_ENTITY).findById(permissionKey);
  374:     } catch (e) {
  375:         console.error('[PrincipalResolver] permission set load error:', e);
  376:     }
  377: 
  378:     /*
  379:      * ?뵶 ? 湲곕낯 ?명듃濡?怨좊Ⅸ ?꾨━?뗭씠 **?ㅼ젣濡??놁쑝硫?* 醫낆쟾?濡???由ъ냼??false 濡??뚯븘媛꾨떎.
  380:      *
  381:      *   `mergeSetPages([])` ????κ컪???녿뒗 ?ㅼ뿉 `defaultForNew` 瑜??곸슜?쒕떎(ResourceCatalog.js:110).
  382:      *   利?"?명듃 ?놁쓬"? "沅뚰븳 ?놁쓬"???꾨땲???????대갚???놁쑝硫?愿由ъ옄媛 ?꾨━?뗭쓣 吏???쒓컙
  383:      *   ? ?뚯냽 ?꾩썝?먭쾶 defaultForNew 媛 議곗슜???대┛?? ?꾨━?뗭? "理쒖큹 1?뚮쭔 ?앹꽦"?대씪
  384:      *   (SeedData.js) 吏?뚯쭊 ?곹깭媛 ?뺤긽 ?댁쁺 以묒뿉??議댁옱?????덈떎.
  385:      */
  386:     if (!set && permissionSource === 'team-default') {
  387:         const pages = allFalsePages();
  388:         return {
  389:             accountId,
  390:             isAdmin: false,
  391:             isUser: true,
  392:             name: 'undefined',
  393:             pages,
  394:             resourceMap: pagesToResourceMap(pages),
  395:             projectScope: 'ALL',
  396:             memberProjectIds: null,
  397:             ...baseTeamCtx,
  398:             permissionSource: 'none',
  399:         };
  400:     }
  401: 
  402:     const pages = mergeSetPages(set?.pages ?? []);
  403:     const projectScope = normalizeScope(set?.projectScope);
  404: 
  405:     // 8) ? ?ㅼ퐫?????accountId 吏묓빀(議곌굔遺 SQL 1??
  406:     const teamCtx = await fillTeamScopeAccounts(baseTeamCtx, projectScope, accountId);
  407: 
  408:     // 9) ?꾨줈?앺듃 ?ㅼ퐫?꾨퀎 ?뚯냽 ?꾨줈?앺듃 id lazy 議고쉶
  409:     let memberProjectIds = null;
  410:     if (projectScope === 'MEMBER_ONLY') {
  411:         try {
  412:             memberProjectIds = await findProjectIdsByAccountRepository(accountId);
  413:         } catch (e) {
  414:             console.error('[PrincipalResolver] memberProjectIds load error:', e);
  415:             memberProjectIds = []; // 議고쉶 ?ㅽ뙣 ???덉쟾?섍쾶 鍮??뚯냽(=鍮꾩냼??泥섎━)
  416:         }
  417:     } else if (projectScope === 'TEAM_ONLY') {
  418:         // P2-a ?먯꽌 **?⑹쭛?⑹씠 ?꾩꽦**?먮떎(P1 ? projectusers 寃쎈줈留??곕뒗 怨쇰룄湲곗???:
  419:         //   ??scopeTeamKeys ?뚯냽 ??먮뱾??projectusers ???덈뒗 ?꾨줈?앺듃
  420:         //   ??scopeTeamKeys 媛 project_team ??**?대떦 諛곗젙**???꾨줈?앺듃
  421:         // ?↔? ?뷀빐吏硫댁꽌 ?ㅼ퐫?꾧? **?볦뼱吏꾨떎** ??P1 ??醫곸? ?곹깭???섎룄??fail-close ?怨?
  422:         // ?ш린???ㅺ퀎 ?섎룄(짠R3)???꾨떖?쒕떎.
  423:         //   ?????낅젰??紐⑤몢 鍮?諛곗뿴?대㈃ Repository 媛?쒓? 荑쇰━瑜?留됯퀬 [] 瑜??뚮젮以????0嫄?
  424:         //     `whereIn([])` / `generateInClause(0)` 濡??꾩궗媛 ?덈뒗 寃쎈줈媛 ?녿떎(C3쨌L3).
  425:         try {
  426:             const [byMembers, byTeams] = await Promise.all([
  427:                 findProjectIdsByAccountsRepository(teamCtx.teamScopeAccountIds ?? []),
  428:                 findProjectIdsByTeamKeysSafe(teamCtx.scopeTeamKeys ?? []),
  429:             ]);
  430:             memberProjectIds = [...new Set([...byMembers, ...byTeams])];
  431:         } catch (e) {
  432:             console.error('[PrincipalResolver] team memberProjectIds load error:', e);
  433:             memberProjectIds = [];
  434:         }
  435:     }
  436: 
  437:     return {
  438:         accountId,
  439:         isAdmin: false,
  440:         isUser: true,
  441:         name: set?.name ?? 'undefined',
  442:         pages,
  443:         resourceMap: pagesToResourceMap(pages),
  444:         projectScope,
  445:         memberProjectIds,
  446:         ...teamCtx,
  447:         permissionSource,
  448:     };
  449: };
  450: 
  451: /**
  452:  * ?ㅼ퐫?꾧? 嫄몃┛ ?꾨줈?앺듃 id 諛곗뿴, ?꾨땲硫?null(=?ㅼ퐫??誘몄쟻??.
  453:  * 紐⑸줉/吏묎퀎 ?쒕퉬?ㅺ? ?꾪꽣 ?곸슜 ?щ? ?먯젙???ъ슜.
  454:  *
  455:  * ??**TEAM_ONLY 瑜?????怨녹뿉???≪닔?쒕떎(S4).** 洹몃옒??湲곗〈 ?뚮퉬??6?뚯씪
  456:  *   (`permissionGuard.enforceProjectScope`, `PortfolioDashboardService`, `IssueAnalysisService`,
  457:  *    `ProjectCalendarService`, `ProjectService`, `AssignmentProjectService`)??**肄붾뱶 1以꾨룄 諛붾뚯? ?딅뒗??**
  458:  *   ???ㅼ퐫??異뺤쓣 ?쒕퉬?ㅻ쭏??遺꾧린?쒗궎吏 ?딅뒗 寃껋씠 ?뚭? ?꾪뿕 理쒖냼?붿쓽 ?듭떖?대떎.
  459:  */
  460: export const scopedProjectIds = (principal) => {
  461:     if (!principal || principal.isAdmin) return null;
  462:     if (principal.projectScope === 'MEMBER_ONLY') return principal.memberProjectIds || [];
  463:     if (principal.projectScope === 'TEAM_ONLY') return principal.memberProjectIds || [];
  464:     return null;
  465: };
  466: 
  467: /** ?뚯뒪??沅뚰븳蹂寃?利됱떆諛섏쁺??罹먯떆 臾댄슚??(?좏깮) */
  468: export const clearPrincipalCache = (accountId) => {
  469:     if (accountId) cache.delete(accountId);
  470:     else cache.clear();
  471: };

--- src/queue/__test__/JobCompletion.test.js ---
    1: /**
    2:  * ??諛곗튂 ?꾨즺 ?먯젙 (`checkJobCompletion`) ??2026-08-12 ?깅뒫 媛먯궗 A-4.
    3:  *
    4:  * 怨좎젙?섎뒗 寃?
    5:  *  - ?꾨즺 ?먯젙??諛곗튂留덈떎 **?꾨웾 fan-in(B짼)** ???꾨땲??`jobId` ?몃뜳??**?섏씠吏 ?ㅼ틪**?대떎
    6:  *  - ?ъ떆?꾨줈 媛숈? 諛곗튂媛 ?ㅼ떆 ?뚮퉬?쇰룄 **以묐났 怨꾩닔濡?議곌린 ?꾧껐?섏? ?딅뒗??*(硫깅벑)
    7:  *  - ??諛곗튂媛 done ?댁뼱?쇰쭔 job ??理쒖쥌 ?곹깭濡??섏뼱媛怨? 吏묎퀎媛믪씠 ?뺥솗?섎떎
    8:  */
    9: 
   10: const mockKvsPageReads = { count: 0 };
   11: const mockStores = new Map();
   12: 
   13: const mockMakeStore = () => {
   14:     const map = new Map();
   15:     return {
   16:         map,
   17:         save: jest.fn(async (id, data) => { map.set(id, { ...data }); }),
   18:         saveTTL: jest.fn(async (id, data) => { map.set(id, { ...data }); }),
   19:         findById: jest.fn(async (id) => map.get(id) ?? null),
   20:         delete: jest.fn(async (id) => { map.delete(id); }),
   21:         findByWherePaged: jest.fn(async (indexName, value, pageLimit = 100, maxItems = 1000) => {
   22:             const all = [...map.entries()]
   23:                 .filter(([, v]) => v?.[indexName] === value)
   24:                 .map(([key, v]) => ({ key, value: v }));
   25: 
   26:             const results = [];
   27:             let truncated = false;
   28:             let i = 0;
   29:             for (;;) {
   30:                 mockKvsPageReads.count += 1;          // KVS ?뺣났 1??= ?섏씠吏 1??                results.push(...all.slice(i, i + pageLimit));
   31:                 i += pageLimit;
   32:                 if (i >= all.length) break;
   33:                 if (results.length >= maxItems) { truncated = true; break; }
   34:             }
   35:             return { results: results.slice(0, maxItems), truncated };
   36:         }),
   37:     };
   38: };
   39: 
   40: jest.mock('../../nosql/query/CustomEntityManager', () => ({
   41:     customEntityManager: (entityName) => {
   42:         if (!mockStores.has(entityName)) mockStores.set(entityName, mockMakeStore());
   43:         return mockStores.get(entityName);
   44:     },
   45: }));
   46: 
   47: // ???섑띁??洹몃?濡??먮㈃ @forge/events 瑜??뚭퀬 ?ㅻ?濡?handler 瑜?洹몃?濡??뚮젮以??jest.mock('../../utils/queueUtil', () => ({
   48:     createConsumerHandler: (handler) => handler,
   49:     createQueue: jest.fn(),
   50:     pushQueueEvents: jest.fn(),
   51: }));
   52: 
   53: jest.mock('../../utils/license/LicenseGuard', () => ({ isLicenseBlocked: jest.fn(async () => false) }));
   54: jest.mock('../../api/jira/user/UserApi', () => ({
   55:     searchJiraUsersApi: jest.fn(async (_as, email) => [{ accountId: `acc-${email}` }]),
   56: }));
   57: jest.mock('../../resolver/backoffice/user/UserRepository', () => ({ addUsersBulk: jest.fn(async () => undefined) }));
   58: jest.mock('../../resolver/portfolioDashboard/PortfolioAggregator', () => ({ aggregateAllProjects: jest.fn() }));
   59: jest.mock('../../api/jira/field/FieldApi', () => ({ getProjectIdFieldIdApi: jest.fn(async () => 'field-1') }));
   60: jest.mock('../../api/jira/field/AppFieldValueApi', () => ({ setAppFieldValueForIssues: jest.fn(async () => undefined) }));
   61: jest.mock('../../resolver/projectSubscription/ProjectSubscriptionRepository', () => ({
   62:     findSubscriptionBySourceRepository: jest.fn(async () => null),
   63:     incrementTaggedRepository: jest.fn(async () => undefined),
   64: }));
   65: jest.mock('../../resolver/projectSubscription/DefaultEstimateApplier', () => ({ applyDefaultEstimate: jest.fn() }));
   66: jest.mock('../../api/jira/issue/AssignedDateRecorder', () => ({
   67:     ASSIGNED_VIA: { SUBSCRIPTION: 'SUBSCRIPTION' },
   68:     recordAssignedDateOnce: jest.fn(async () => undefined),
   69: }));
   70: 
   71: const { uploadUsers } = require('../consumer');
   72: 
   73: const APP_JOB_ID = 'job-test-1';
   74: const TOTAL = 5;
   75: 
   76: const jobStore = () => mockStores.get('job');
   77: const batchStore = () => mockStores.get('job_batch');
   78: 
   79: /** batchIndex 踰덉㎏ 諛곗튂瑜??뚮퉬?쒕떎(items 2嫄? 洹몄쨷 failCount 嫄댁? Jira 誘멸??? */
   80: const consume = (batchIndex, { emails = ['a@x.com', 'b@x.com'] } = {}) =>
   81:     uploadUsers({
   82:         body: {
   83:             appJobId: APP_JOB_ID,
   84:             batchId: `${APP_JOB_ID}-batch-${batchIndex}`,
   85:             batchIndex,
   86:             totalBatches: TOTAL,
   87:             items: emails.map(email => ({ email, createdId: 'me', permissionMemberKey: 'pm' })),
   88:         },
   89:     });
   90: 
   91: beforeEach(async () => {
   92:     mockKvsPageReads.count = 0;
   93: 
   94:     // ??consumer.js ??紐⑤뱢 濡쒕뱶 ?쒖젏??留ㅻ땲?瑜??≪븘 ?붾떎 ???ㅽ넗?대? **援먯껜?섎㈃** ???섍퀬
   95:     //   媛숈? ?몄뒪?댁뒪???댁슜留?鍮꾩슫??
   96:     for (const store of mockStores.values()) {
   97:         store.map.clear();
   98:         [store.save, store.saveTTL, store.findById, store.delete, store.findByWherePaged]
   99:             .forEach(m => m.mockClear());
  100:     }
  101: 
  102:     require('../../api/jira/user/UserApi').searchJiraUsersApi
  103:         .mockImplementation(async (_as, email) => [{ accountId: `acc-${email}` }]);
  104: 
  105:     await jobStore().save(APP_JOB_ID, {
  106:         id: APP_JOB_ID, total: TOTAL * 2, totalBatches: TOTAL,
  107:         processed: 0, failed: 0, status: 'RUNNING',
  108:     });
  109: });
  110: 
  111: describe('checkJobCompletion ???꾨즺 ?먯젙', () => {
  112:     test('?쇰? 諛곗튂留??앸굹硫?job ??理쒖쥌 ?곹깭濡??섍린吏 ?딅뒗??, async () => {
  113:         await consume(0);
  114:         await consume(1);
  115: 
  116:         expect(batchStore().map.size).toBe(2);
  117:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  118:     });
  119: 
  120:     test('??諛곗튂媛 ?앸굹硫?COMPLETED 濡?吏묎퀎?쒕떎', async () => {
  121:         for (let i = 0; i < TOTAL; i++) await consume(i);
  122: 
  123:         const job = jobStore().map.get(APP_JOB_ID);
  124:         expect(job.status).toBe('COMPLETED');
  125:         expect(job.processed).toBe(TOTAL * 2);
  126:         expect(job.failed).toBe(0);
  127:     });
  128: 
  129:     test('Jira 誘멸???嫄댁씠 ?덉쑝硫?PARTIAL 濡?吏묎퀎?쒕떎', async () => {
  130:         const { searchJiraUsersApi } = require('../../api/jira/user/UserApi');
  131:         searchJiraUsersApi.mockImplementation(async (_as, email) =>
  132:             (email === 'ghost@x.com' ? [] : [{ accountId: `acc-${email}` }]));
  133: 
  134:         await consume(0, { emails: ['ghost@x.com', 'b@x.com'] });
  135:         for (let i = 1; i < TOTAL; i++) await consume(i);
  136: 
  137:         const job = jobStore().map.get(APP_JOB_ID);
  138:         expect(job.status).toBe('PARTIAL');
  139:         expect(job.failed).toBe(1);
  140:     });
  141: 
  142:     /**
  143:      * 硫깅벑?깆쓽 ?듭떖 ??移댁슫?곗??ㅻ㈃ ?ш린??done ?섍? 6???섏뼱 5媛?以?4媛쒕쭔 ?앸궗?붾뜲???꾧껐?먯쓣 寃껋씠??
  144:      * ?덉퐫????`${appJobId}-batch-${index}`)媛 ?좎씪?섎?濡??ъ냼鍮꾨뒗 媛숈? ?ㅻ? ??뼱??肉먯씠??
  145:      */
  146:     test('?ъ떆?꾨줈 媛숈? 諛곗튂瑜??ㅼ떆 ?뚮퉬?대룄 ?꾨즺 ?섍? 遺?吏 ?딅뒗??, async () => {
  147:         for (let i = 0; i < TOTAL - 1; i++) await consume(i);   // 4/5 ?꾨즺
  148:         await consume(0);                                        // 諛곗튂 0 ?ъ떆??        await consume(1);                                        // 諛곗튂 1 ?ъ떆??
  149:         expect(batchStore().map.size).toBe(TOTAL - 1);
  150:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  151: 
  152:         await consume(TOTAL - 1);                                // 留덉?留?諛곗튂媛 ?꾩갑?댁빞 ?꾧껐
  153:         const job = jobStore().map.get(APP_JOB_ID);
  154:         expect(job.status).toBe('COMPLETED');
  155:         expect(job.processed).toBe(TOTAL * 2);                   // ?ъ냼鍮꾨텇??以묐났 ?⑹궛?섏? ?딅뒗??    });
  156: 
  157:     test('?ъ떆?꾧? ?쇱뼱???대? done ??諛곗튂??Jira ?ъ“???놁씠 吏묎퀎留??ㅼ떆 ?쒕떎', async () => {
  158:         const { searchJiraUsersApi } = require('../../api/jira/user/UserApi');
  159:         await consume(0);
  160:         const callsAfterFirst = searchJiraUsersApi.mock.calls.length;
  161: 
  162:         await consume(0);
  163: 
  164:         expect(searchJiraUsersApi.mock.calls.length).toBe(callsAfterFirst);
  165:     });
  166: 
  167:     test('KVS ?쎄린媛 諛곗튂 ?섏쓽 ?쒓낢???꾨땲???먯젙 1?뚮떦 1?섏씠吏??(A-4)', async () => {
  168:         for (let i = 0; i < TOTAL; i++) await consume(i);
  169: 
  170:         // ?먯젙 B??횞 ?섏씠吏 1??= B. 醫낆쟾 fan-in ?대㈃ B횞(B+1)=30 ?댁뿀??
  171:         expect(mockKvsPageReads.count).toBe(TOTAL);
  172:         expect(mockKvsPageReads.count).toBeLessThan(TOTAL * (TOTAL + 1));
  173:         // 諛곗튂 ?ㅻ? ?섎굹??李띿뼱 ?쎈뒗 寃쎈줈媛 ?⑥븘 ?덉? ?딆븘???쒕떎(findById ??job 理쒖쥌 議고쉶 1?뚮퓧)
  174:         expect(batchStore().findById.mock.calls.length).toBe(TOTAL);   // 諛곗튂蹂?以묐났 ?뚮퉬 媛??1?뚯뵫
  175:     });
  176: 
  177:     test('totalBatches 媛 ?좏슚?섏? ?딆쑝硫??꾨즺濡??먯젙?섏? ?딅뒗??, async () => {
  178:         await uploadUsers({
  179:             body: {
  180:                 appJobId: APP_JOB_ID, batchId: `${APP_JOB_ID}-batch-0`, batchIndex: 0,
  181:                 totalBatches: undefined,
  182:                 items: [{ email: 'a@x.com', createdId: 'me', permissionMemberKey: 'pm' }],
  183:             },
  184:         });
  185: 
  186:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  187:     });
  188: });

--- static/ui/src/components/calendar/FullCalendarLazy.jsx ---
    1: import React, {Suspense} from 'react';
    2: import AkSkeleton from '@atlaskit/skeleton';
    3: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
    4: import {useI18nStore} from '../../stores/useI18nStore';
    5: 
    6: /**
    7:  * 罹섎┛???ㅽ깮??main 踰덈뱾 諛뽰쑝濡??대낫?대뒗 寃쎄퀎.
    8:  *
    9:  * ???꾩슂?쒓?: `/myWork` ??湲곕낯 吏꾩엯 ?쇱슦?몃씪 `App.jsx` 媛 **?뺤쟻 import** 濡??붾떎(泥??붾㈃源뚯?
   10:  * 泥?겕 ?뺣났????踰????쒖슦吏 ?딄린 ?꾪빐). 洹몃윴??洹??섏씠吏媛 `components/calendar/FullCalendar`
   11:  * 瑜??뺤쟻?쇰줈 ?뚭퀬 ?ㅻ뒗 諛붾엺??`@fullcalendar/*` + `moment(-timezone)` 275KB(?먮낯)媛 main ?? * ?뚮윭?됱븘 ?덉뿀????肄붾뱶 ?ㅽ뵆由ы똿??紐⑹쟻(App.jsx:25-27 二쇱꽍)??????寃쎈줈?먯꽌 臾대젰?붾릱??
   12:  * ?섏씠吏 ?먯껜???뺤쟻?쇰줈 ?먭퀬 **罹섎┛???⑹뼱由щ쭔** ?ш린???대┛??
   13:  *
   14:  * ?뵶 lazy 媛 ?깅┰?섎뒗 議곌굔? ?꾨옒 **Suspense 寃쎄퀎**?? 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426
   15:  *    ("A component suspended while responding to synchronous input")???쒕떎. 猷⑦듃 `index.js` 媛
   16:  *    ReactDOM.render(legacy root)??startTransition ? ?대쾿???꾨땲????寃쎄퀎濡쒕쭔 留됲엺??
   17:  *
   18:  * ?????뚯씪? `./FullCalendar` 瑜?**?뺤쟻?쇰줈 import ?섏? ?딅뒗??*. ??以꾩씠?쇰룄 ?뺤쟻 李몄“媛
   19:  *   ?앷린硫?泥?겕媛 ?꾨줈 main ?쇰줈 ?⑹퀜吏꾨떎.
   20:  *
   21:  * `moment` ???ㅼ쭅 `@fullcalendar/moment-timezone` ???듯빐?쒕쭔 ?ㅼ뼱?⑤떎(???꾩뿭?먯꽌 ?ㅻⅨ
   22:  * `moment` import ???녿떎) ??利???寃쎄퀎媛 moment 源뚯? ?④퍡 ?곕젮媛꾨떎.
   23:  */
   24: const CustomFullCalendarChunk = React.lazy(() =>
   25:     import('./FullCalendar').then(m => ({default: m.CustomFullCalendar}))
   26: );
   27: 
   28: const WEEK_ROWS = 6;
   29: const WEEK_COLS = 7;
   30: 
   31: /**
   32:  * 罹섎┛???먮━ ?ㅼ펷?덊넠 ??泥?겕瑜?湲곕떎由щ뒗 ?숈븞 **?붽컙 酉곗? 媛숈? 怨④꺽**??洹몃┛??
   33:  * ?대컮 ??以?+ ?붿씪 癒몃━湲 + 6二?寃⑹옄濡??ㅼ젣 ?뚮뜑 ?꾩쓽 ?믪씠瑜?洹몃?濡?李⑥??섎?濡? * 濡쒕뱶媛 ?앸굹???덉씠?꾩썐???吏 ?딅뒗??遺紐④? `height:100%` 瑜?以??.
   34:  */
   35: export function CalendarSkeleton({label = 'Loading'}) {
   36:     return (
   37:         <div
   38:             role="status"
   39:             aria-label={label}
   40:             aria-busy="true"
   41:             style={{
   42:                 height: '100%',
   43:                 minHeight: 0,
   44:                 display: 'flex',
   45:                 flexDirection: 'column',
   46:                 gap: 12,
   47:                 paddingBottom: 4,
   48:             }}
   49:         >
   50:             {/* ?대컮 ??prev/today/next 쨌 ?쒕ぉ 쨌 ??二??꾪솚 */}
   51:             <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0}}>
   52:                 <AkSkeleton width={132} height={28} isShimmering />
   53:                 <AkSkeleton width={160} height={20} isShimmering />
   54:                 <AkSkeleton width={148} height={28} isShimmering />
   55:             </div>
   56: 
   57:             {/* ?붿씪 癒몃━湲 */}
   58:             <div style={{display: 'grid', gridTemplateColumns: `repeat(${WEEK_COLS}, 1fr)`, gap: 4, flexShrink: 0}}>
   59:                 {Array.from({length: WEEK_COLS}, (_, i) => (
   60:                     <AkSkeleton key={i} width="100%" height={12} isShimmering />
   61:                 ))}
   62:             </div>
   63: 
   64:             {/* 二?횞 ?붿씪 寃⑹옄 */}
   65:             <div
   66:                 style={{
   67:                     flex: '1 1 auto',
   68:                     minHeight: 0,
   69:                     display: 'grid',
   70:                     gridTemplateRows: `repeat(${WEEK_ROWS}, 1fr)`,
   71:                     gridTemplateColumns: `repeat(${WEEK_COLS}, 1fr)`,
   72:                     gap: 4,
   73:                 }}
   74:             >
   75:                 {Array.from({length: WEEK_ROWS * WEEK_COLS}, (_, i) => (
   76:                     <AkSkeleton key={i} width="100%" height="100%" isShimmering />
   77:                 ))}
   78:             </div>
   79:         </div>
   80:     );
   81: }
   82: 
   83: /**
   84:  * `CustomFullCalendar` ? **媛숈? props** 瑜?諛쏅뒗???섑띁??ResizeObserver쨌updateSize ?숈옉 ?ы븿).
   85:  * `calendarRef` ???쇰컲 prop ?대씪 洹몃?濡??꾨떖?섎ŉ, 泥?겕媛 ?꾩갑???ㅼ젣 罹섎┛?붽? 留덉슫?몃릺?? * ?쒖젏??`calendarRef.current` 媛 梨꾩썙吏꾨떎.
   86:  */
   87: export const LazyFullCalendar = (props) => {
   88:     const t = useI18nStore(s => s.t);
   89: 
   90:     return (
   91:         <ChunkErrorBoundary>
   92:             <Suspense fallback={<CalendarSkeleton label={t('common.loading')} />}>
   93:                 <CustomFullCalendarChunk {...props} />
   94:             </Suspense>
   95:         </ChunkErrorBoundary>
   96:     );
   97: };

--- static/ui/src/components/markdown/MarkdownEditorLazy.jsx ---
    1: import React, {Suspense} from 'react';
    2: import AkSkeleton from '@atlaskit/skeleton';
    3: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
    4: import {useI18nStore} from '../../stores/useI18nStore';
    5: 
    6: /**
    7:  * 留덊겕?ㅼ슫 ?먮뵒???ㅽ깮??main 踰덈뱾 諛뽰쑝濡??대낫?대뒗 寃쎄퀎.
    8:  *
    9:  * ???꾩슂?쒓?: `MarkdownEditor` ???뚰겕濡쒓렇 ?깅줉/?섏젙 **紐⑤떖 ?덉뿉?쒕쭔** ?곗씤?? 洹몃윴??洹?紐⑤떖?? * ?뚯쑀??`WorklogPage` 媛 湲곕낯 吏꾩엯 ?쇱슦???뺤쟻 import)?? `@mdxeditor/editor` + `lexical`
   10:  * + `@codemirror/*` + `prismjs` + `@radix-ui/*` 986KB(?먮낯)媛 main ???ㅻ젮 **?깅줉 踰꾪듉????踰덈룄
   11:  * ?꾨Ⅴ吏 ?딆? ?ъ슜?먭퉴吏** ?대젮諛쏄퀬 ?덉뿀?? ECharts 媛 ?대? 媛숈? 洹쒖튃?쇰줈 遺꾨━???덉쑝誘濡? * (`components/chart/echart/ThemedECharts.js`) 愿?됱쓣 ??怨녹뿉 留욎텛??蹂寃쎌씠??
   12:  *
   13:  * 寃쎄퀎媛 紐⑤떖 ?덉씠?쇰뒗 ?먯씠 以묒슂?섎떎 ??`CommonModal` ? `isOpen` ???뚮쭔 children ??留덉슫?명븯誘濡? * (`components/modal/CommonModal.jsx:26`) **紐⑤떖???щ뒗 ?쒓컙**??怨?泥?겕瑜?諛쏅뒗 ?쒖젏?대떎.
   14:  *
   15:  * ?뵶 lazy 媛 ?깅┰?섎뒗 議곌굔? ?꾨옒 **Suspense 寃쎄퀎**?? 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426.
   16:  *    猷⑦듃媛 ReactDOM.render(legacy root)??startTransition ? ?대쾿???꾨땲??
   17:  *
   18:  * ?????뚯씪? `./MarkdownEditor` 瑜?**?뺤쟻?쇰줈 import ?섏? ?딅뒗??*. ?뺤쟻 李몄“媛 ?섎굹?쇰룄 ?앷린硫? *   泥?겕媛 ?꾨줈 main ?쇰줈 ?⑹퀜吏꾨떎.
   19:  */
   20: const MarkdownEditorChunk = React.lazy(() =>
   21:     import('./MarkdownEditor').then(m => ({default: m.MarkdownEditor}))
   22: );
   23: 
   24: /**
   25:  * ?먮뵒???먮━ ?ㅼ펷?덊넠 ???대컮 ??以?+ 蹂몃Ц.
   26:  * 蹂몃Ц ?믪씠 200px ? `MarkdownEditor.css` ??`.my-custom-editor-scroll` 怨좎젙 ?믪씠? 媛숈? 媛믪씠?? * 泥?겕媛 ?꾩갑?대룄 紐⑤떖 ?믪씠媛 ?吏 ?딅뒗?? (媛믪씠 諛붾뚮㈃ ?ш린??媛숈씠 ?먮킄???쒕떎.)
   27:  */
   28: export function MarkdownEditorSkeleton({label = 'Loading'}) {
   29:     return (
   30:         <div
   31:             role="status"
   32:             aria-label={label}
   33:             aria-busy="true"
   34:             style={{border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden'}}
   35:         >
   36:             <div style={{display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px'}}>
   37:                 {[40, 24, 96, 24, 28, 28].map((w, i) => (
   38:                     <AkSkeleton key={i} width={w} height={20} isShimmering />
   39:                 ))}
   40:             </div>
   41:             <div style={{display: 'flex', flexDirection: 'column', gap: 10, padding: 20, height: 200}}>
   42:                 <AkSkeleton width="100%" height={12} isShimmering />
   43:                 <AkSkeleton width="92%" height={12} isShimmering />
   44:                 <AkSkeleton width="96%" height={12} isShimmering />
   45:                 <AkSkeleton width="60%" height={12} isShimmering />
   46:             </div>
   47:         </div>
   48:     );
   49: }
   50: 
   51: /** `MarkdownEditor` ? 媛숈? props(`markdown`, `setMarkdown`)瑜?諛쏅뒗?? */
   52: export const LazyMarkdownEditor = (props) => {
   53:     const t = useI18nStore(s => s.t);
   54: 
   55:     return (
   56:         <ChunkErrorBoundary>
   57:             <Suspense fallback={<MarkdownEditorSkeleton label={t('common.loading')} />}>
   58:                 <MarkdownEditorChunk {...props} />
   59:             </Suspense>
   60:         </ChunkErrorBoundary>
   61:     );
   62: };

--- static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js ---
    1: /**
    2:  * ResourcePage ??留덉슫??怨꾩빟 ??@atlaskit/tabs ??"諛⑸Ц???⑤꼸留?留덉슫?? 諛⑸Ц ???좎?" ?숈옉 怨좎젙.
    3:  *
    4:  * 諛곌꼍(2026-08-12 ?깅뒫 媛먯궗 P1-2 ?먯젙): `TabPanel` ?먯껜??children ??臾댁“嫄??뚮뜑?섏?留?
    5:  * ?곸쐞 `Tabs`(18.3.4)媛 `visited` Set ???덈뒗 ?⑤꼸留??뚮뜑?쒕떎(`dist/esm/components/tabs.js`).
    6:  * ?곕씪??`ResourcePage` ???④? ??? 遺꾩꽍/?꾨줈?앺듃 諛곗젙)? **留덉슫?몃릺吏 ?딄퀬 invoke ??諛쒖깮?섏? ?딅뒗??* ?? * 蹂꾨룄??lazy 寃뚯씠?몃? ?먯쑝濡?留뚮뱾 ?꾩슂媛 ?녿떎. ???뚯뒪?몃뒗 Atlaskit ?낃렇?덉씠?쒕줈 洹??꾩젣媛
    7:  * 源⑥?硫?= ?④? ??씠 留덉슫?몃릺湲??쒖옉?섎㈃) 利됱떆 ?ㅽ뙣?쒗궎湲??꾪븳 寃껋씠??
    8:  */
    9: import React, { act } from 'react';
   10: import { createRoot } from 'react-dom/client';
   11: import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
   12: 
   13: // ??猷⑦듃??legacy ReactDOM.render 吏留? ??留덉슫???숈옉? 猷⑦듃 紐⑤뱶? 臾닿??섎떎.
   14: // ?뚯뒪?몃뒗 createRoot 瑜??⑥꽌 React 18 寃쎄퀬 ?몄씠利??놁씠 ?뺤씤?쒕떎.
   15: global.IS_REACT_ACT_ENVIRONMENT = true;
   16: 
   17: const renderTabs = (events) => {
   18:     const Probe = ({ name }) => {
   19:         React.useEffect(() => {
   20:             events.push(`mount:${name}`);
   21:             return () => events.push(`unmount:${name}`);
   22:         }, [name]);
   23:         return <div>{name}</div>;
   24:     };
   25:     const container = document.createElement('div');
   26:     document.body.appendChild(container);
   27:     const root = createRoot(container);
   28:     act(() => {
   29:         root.render(
   30:             <Tabs id="resource-tabs">
   31:                 <TabList>
   32:                     <Tab>overview</Tab>
   33:                     <Tab>organization</Tab>
   34:                     {/* ResourcePage ? ?숈씪?섍쾶 議곌굔遺 ??쓣 ?쇱썙 ?몃뜳???뺣젹???④퍡 寃利?*/}
   35:                     {true && <Tab>teamAnalytics</Tab>}
   36:                     <Tab>assignment</Tab>
   37:                 </TabList>
   38:                 <TabPanel><Probe name="overview" /></TabPanel>
   39:                 <TabPanel><Probe name="organization" /></TabPanel>
   40:                 {true && <TabPanel><Probe name="teamAnalytics" /></TabPanel>}
   41:                 <TabPanel><Probe name="assignment" /></TabPanel>
   42:             </Tabs>
   43:         );
   44:     });
   45:     return container;
   46: };
   47: 
   48: test('吏꾩엯 ??泥???쭔 留덉슫?몃맂??(?④? ??invoke ?놁쓬)', () => {
   49:     const events = [];
   50:     renderTabs(events);
   51:     expect(events).toEqual(['mount:overview']);
   52: });
   53: 
   54: test('???꾪솚 ??諛⑸Ц???⑤꼸? ?몃쭏?댄듃?섏? ?딅뒗??(?⑤꼸 ?곹깭쨌?ㅽ겕濡?蹂댁〈)', () => {
   55:     const events = [];
   56:     const container = renderTabs(events);
   57:     const tabs = container.querySelectorAll('[role="tab"]');
   58:     act(() => tabs[3].dispatchEvent(new MouseEvent('click', { bubbles: true })));
   59:     act(() => tabs[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
   60: 
   61:     // 議곌굔遺 ???ㅼ쓽 'assignment'(index 3) 媛 ?뺥솗??留ㅼ묶?섍퀬, ?섎룎?꾩????щ쭏?댄듃媛 ?녿떎.
   62:     expect(events).toEqual(['mount:overview', 'mount:assignment']);
   63: });

--- static/ui/src/pages/myWork/WorklogPage.jsx ---
    1: import React, {useEffect, useMemo, useRef, useState} from 'react';
    2: // ??罹섎┛?붾뒗 **lazy** ??`@fullcalendar/*` + moment 瑜?main 諛뽰쑝濡??대낫?대뒗 寃쎄퀎).
    3: //   ???섏씠吏??湲곕낯 吏꾩엯 ?쇱슦?몃씪 ?뺤쟻 import ?몃뜲, 洹??뺤쟻 寃쎈줈媛 罹섎┛???ㅽ깮源뚯?
    4: //   main ??怨좎젙?쒗궎怨??덉뿀?? ?뺤쟻 import 濡??섎룎由щ㈃ 洹??뚭?媛 洹몃?濡??щ컻?쒕떎.
    5: import {LazyFullCalendar} from "../../components/calendar/FullCalendarLazy";
    6: import {WorklogModal} from "./modal/WorklogModal";
    7: import {STATUS_COLOR_MAP} from "../../constants/statusColorMap";
    8: import {invoke, Modal, view} from "@forge/bridge";
    9: import {Flex, Stack} from "@atlaskit/primitives/compiled";
   10: import {executeRequest} from "../../utils/jiraApi/requestJira";
   11: import {useI18nStore} from "../../stores/useI18nStore";
   12: import {token} from "@atlaskit/tokens";
   13: import PageContainer from "../../components/layout/PageContainer";
   14: import {
   15:     addDaysToDateString,
   16:     formatToHHmm,
   17:     getDateString,
   18:     getTimeISOString
   19: } from "../../utils/TimeUtils";
   20: import {MyLogSummary} from "./MyLogSummary";
   21: import {Box} from "@atlaskit/primitives";
   22: import MyProjectList from "./myProject/MyProjectList";
   23: import Card from "../../components/card/Card";
   24: import ResizablePanels, {Panel, PanelToggleButton} from "../../components/layout/ResizablePanels";
   25: import CalendarPlusIcon from "@atlaskit/icon/core/calendar-plus";
   26: import TasksIcon from "@atlaskit/icon/core/tasks";
   27: import DiagramSymbolActionIcon from "@atlaskit/icon-lab/core/diagram-symbol-action";
   28: import CalendarIcon from "@atlaskit/icon/core/calendar";
   29: import TableIcon from "@atlaskit/icon/core/table";
   30: import {ViewModeToggle} from "../../components/toggle/ViewModeToggle";
   31: import { useQuery, useQueryClient} from "@tanstack/react-query";
   32: import {useMyWorklogList} from "./utils/useMyWorklogList";
   33: import LoadingOverlay from "../../components/feedback/LoadingOverlay";
   34: import MyIssueTable from "./table/MyIssueTable";
   35: import {clipWorklogsToRange, useMyWorklogSummary} from "./utils/useMyWorklogSummary";
   36: import { getUserIssueIds} from "../../utils/jiraApi/issue/getJqlIssue";
   37: import {ScheduleModal} from "./modal/ScheduleModal";
   38: import {scheduleTypeOptions} from "../../constants/scheduleTypeOptions";
   39: import Button from "@atlaskit/button/new";
   40: import AddIcon from "@atlaskit/icon/core/add";
   41: import {usePublicHolidayList} from "../../utils/usePublicHolidayList";
   42: import {scheduleKeys, settingKeys} from '../../utils/queryKey/logicalAuditKeys';
   43: import {myWorkKeys} from '../../utils/queryKey/myWorkKeys';
   44: const context = await view.getContext()
   45: 
   46: export default function WorklogPage() {
   47:     const t = useI18nStore(s => s.t);
   48: 
   49:     const calendarRef = useRef(null);
   50: 
   51:     const queryClient = useQueryClient();
   52: 
   53:     const [viewMode, setViewMode] = useState("calendar");
   54:     const [selectedProjectIds, setSelectedProjectIds] = useState([]);
   55:     const [projectCount, setProjectCount] = useState(0);
   56: 
   57:     const [dateRange, setDateRange] = useState({
   58:         start: new Date(),
   59:         end: new Date()
   60:     });
   61: 
   62:     // ?뚰겕濡쒓렇 紐⑤떖
   63:     const [isWorklogOpen, setIsWorklogOpen] = useState(false);
   64:     const [worklogInfo, setWorklogInfo] = useState(null);
   65: 
   66:     // ?쇱젙 紐⑤떖
   67:     const [isScheduleOpen, setIsScheduleOpen] = useState(false);
   68:     const [scheduleInfo, setScheduleInfo] = useState(null);
   69: 
   70:     const [clickedDate, setClickedDate] = useState(null);
   71: 
   72:     const formatDate = (date) => getDateString(date);
   73: 
   74:     const startDate = formatDate(dateRange.start);
   75:     const endDate = formatDate(dateRange.end);
   76: 
   77:     const normalizedProjectIds = useMemo(
   78:         () => [...(selectedProjectIds ?? [])].sort(),
   79:         [selectedProjectIds]
   80:     );
   81:     // 1. ???뚰겕濡쒓렇 紐⑸줉 議고쉶 (?닿? ?묒꽦???뚰겕濡쒓렇留?
   82:     const {isLoading, myWorklogs,isFetching,coworkerFieldId}
   83:         = useMyWorklogList(
   84:             {
   85:                 context,
   86:                 selectedProjectIds:normalizedProjectIds,
   87:                 startDate,
   88:                 endDate,
   89:                 mine: true
   90:             });
   91: 
   92:     const {
   93:         data: myScheduleList,
   94:         isLoading: isScheduleLoading
   95:     } = useQuery({
   96:         queryKey: scheduleKeys.myList({startDate, endDate}),
   97:         queryFn: async () => {
   98:             const result = await invoke("getMyScheduleList", {
   99:                 startDate,
  100:                 endDate
  101:             });
  102:             if (!result?.success) {
  103:                 throw new Error(result?.error?.message ?? 'getMyScheduleList failed');
  104:             }
  105:             return result;
  106:         },
  107:         enabled: !!context?.accountId,
  108:         staleTime: 1000 * 60 * 5
  109:     });
  110: 
  111:     const summaryRange = useMemo(() => {
  112:         const now = new Date();
  113:         const start = new Date(now.getFullYear(), now.getMonth(), 1);
  114:         const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  115:         return {
  116:             startDate: formatDate(start),
  117:             endDate: formatDate(end)
  118:         };
  119:     }, []);
  120: 
  121:     /*
  122:      * ?붿빟? ??罹섎┛??荑쇰━(1) 寃곌낵?먯꽌 ?뚯깮?쒕떎 ??媛숈? resolver(`getMyCalendarWorklog`)瑜?
  123:      * ?좎쭨 踰붿쐞留??щ━????踰?移섎뜕 寃껋쓣 湲곕낯 吏꾩엯?먯꽌 1?뚮줈 以꾩씤??
  124:      *
  125:      * 湲곕낯 ?곹깭??罹섎┛??媛??踰붿쐞???대쾲 ?ъ쓣 ?듭㎏濡??ы븿?섎뒗 6二?援ш컙?대씪 ?붿빟???꾩슂??
  126:      * ?뚰겕濡쒓렇媛 ?대? ???ㅼ뼱? ?덈떎. 罹섎┛?붾? ?ㅻⅨ ?щ줈 ?섍꺼 ?대쾲 ?ъ쓣 ??? 紐삵븯寃??섎㈃
  127:      * (??寃쎄퀎 ?? 洹몃븣留??붿빟 ?꾩슜 荑쇰━瑜?耳좊떎.
  128:      * ???좎쭨??紐⑤몢 'YYYY-MM-DD' 臾몄옄?댁씠???ъ쟾??鍮꾧탳媛 怨??좎쭨 鍮꾧탳??
  129:      */
  130:     const calendarCoversSummary = !!startDate && !!endDate
  131:         && startDate <= summaryRange.startDate
  132:         && endDate >= summaryRange.endDate;
  133: 
  134:     const {
  135:         myWorklogs: summaryWorklogs
  136:     } = useMyWorklogList({
  137:         context,
  138:         selectedProjectIds: normalizedProjectIds,
  139:         startDate: summaryRange.startDate,
  140:         endDate: summaryRange.endDate,
  141:         mine: true,
  142:         enabled: !calendarCoversSummary
  143:     });
  144: 
  145:     // 罹섎┛??寃곌낵瑜????뚮뒗 ?붿빟 踰붿쐞濡??섎씪 ?ｋ뒗???쒕쾭媛 ?붿빟 ?꾩슜 荑쇰━???섎뜕 寃껉낵 媛숈? ?꾪꽣).
  146:     // author쨌?꾨줈?앺듃 ?좏깮 議곌굔? (1)??mine:true + 媛숈? normalizedProjectIds ???숈씪?섎떎.
  147:     const summarySource = useMemo(
  148:         () => (calendarCoversSummary
  149:             ? clipWorklogsToRange(myWorklogs, summaryRange.startDate, summaryRange.endDate)
  150:             : summaryWorklogs),
  151:         [calendarCoversSummary, myWorklogs, summaryWorklogs, summaryRange]
  152:     );
  153: 
  154:     const summary = useMyWorklogSummary({
  155:         myWorklogs: summarySource
  156:     });
  157: 
  158:     const {data:issueCountData} =useQuery({
  159:         queryKey: myWorkKeys.issueIds(normalizedProjectIds),
  160:         enabled: !!selectedProjectIds?.length,
  161:         queryFn: () =>
  162:             getUserIssueIds({
  163:                 selectedProjectIds: normalizedProjectIds,
  164:                 accountId: context.accountId,
  165:                 coworker: true
  166:             }),
  167:         staleTime: 1000 * 60 * 5,
  168:     });
  169: 
  170:     const {data:settingData} = useQuery(
  171:         {
  172:             queryKey: settingKeys.detail(),
  173:             queryFn: async () =>{
  174:                 return await invoke('getSettingData')
  175:             },
  176:             staleTime: 1000 * 60 * 30
  177:         }
  178:     );
  179: 
  180:     const {data : holidayList , isLoading:isHolidayLoading} = usePublicHolidayList();
  181: 
  182:     const worklogEvents = useMemo(() => {
  183:         if (!myWorklogs?.data) return [];
  184: 
  185:         const hourRate = settingData?.hourRate || 8;
  186: 
  187:         return myWorklogs.data.flatMap(issue =>
  188:             issue.fields.worklog.worklogs.map(worklog => {
  189:                 const timeSpent = worklog.timeSpent || '';
  190:                 const isMultiDay = /\d+[dw]/.test(timeSpent); // w ?먮뒗 d ?쒖떇???덉쓣 ??泥섎━
  191: 
  192:                 if (isMultiDay) {
  193:                     const days = Math.round(worklog.timeSpentSeconds / (hourRate * 3600));
  194:                     if (days > 1) {
  195:                         const status = issue.fields?.status?.statusCategory;
  196:                         const color = STATUS_COLOR_MAP[status?.colorName] || STATUS_COLOR_MAP["medium-gray"];
  197:                         const startDateStr = worklog.started.substring(0, 10);
  198:                         const endDate = new Date(startDateStr);
  199:                         endDate.setDate(endDate.getDate() + days);
  200:                         const endDateStr = endDate.toISOString().substring(0, 10);
  201:                         return {
  202:                             start: startDateStr,
  203:                             end: endDateStr,
  204:                             allDay: true,
  205:                             backgroundColor: color.bg,
  206:                             borderColor: color.bg,
  207:                             textColor: color.text,
  208:                             extendedProps: { type: "worklog", issue, worklog }
  209:                         };
  210:                     }
  211:                 }
  212: 
  213:                 return {
  214:                     start: worklog.started,
  215:                     extendedProps: { type: "worklog", issue, worklog }
  216:                 };
  217:             })
  218:         );
  219: 
  220:     }, [myWorklogs, settingData]);
  221: 
  222:     const scheduleEvents = useMemo(() => {
  223: 
  224:         const events = makeScheduleEvents(
  225:             myScheduleList?.data || []
  226:         );
  227: 
  228:         return events.map(event => ({
  229:             ...event,
  230:             extendedProps: {
  231:                 ...event.extendedProps,
  232:                 type: "schedule"
  233:             }
  234:         }));
  235: 
  236:     }, [myScheduleList]);
  237: 
  238:     const holidayEvents = useMemo(() => {
  239:         return makeHolidayEvents(holidayList || []);
  240:     }, [holidayList]);
  241: 
  242:     const holidayDates = useMemo(() => {
  243:         return new Set((holidayList || []).map(h => h.holidayDate));
  244:     }, [holidayList]);
  245: 
  246:     const mergedEvents = useMemo(() => {
  247: 
  248:         return [
  249:             ...worklogEvents,
  250:             ...scheduleEvents,
  251:             ...holidayEvents
  252:         ];
  253: 
  254:     }, [worklogEvents, scheduleEvents, holidayEvents]);
  255: 
  256: 
  257:     const onEventClick = async (eventInfo) => {
  258: 
  259:         const {type} = eventInfo.event.extendedProps;
  260: 
  261:         // ?뚰겕濡쒓렇
  262:         if (type === "worklog") {
  263:             setWorklogInfo({
  264:                 ...eventInfo.event.extendedProps
  265:             });
  266:             setIsWorklogOpen(true);
  267: 
  268:             return;
  269:         }
  270: 
  271:         // ?쇱젙
  272:         if (type === "schedule") {
  273:             const {schedule} = eventInfo.event.extendedProps;
  274:             setScheduleInfo(schedule);
  275:             setIsScheduleOpen(true);
  276: 
  277:             return;
  278:         }
  279:     };
  280: 
  281:     const onDateClick = (dateInfo) => {
  282:         setClickedDate(dateInfo.dateStr);
  283:         setWorklogInfo(null);
  284:         setIsWorklogOpen(true);
  285:     };
  286: 
  287:     //?좎쭨 踰붿쐞 蹂寃?
  288:     const onDatesSetChange = (data) => {
  289: 
  290:         setDateRange({
  291:             start: data.start,
  292:             end: data.end
  293:         });
  294:     };
  295:     //Worklog Drag
  296:     const onEventDrop = async (eventInfo) => {
  297:         const {event} = eventInfo;
  298:         const {type} = event.extendedProps;
  299:         // ?쇱젙? ?쒕옒洹??덊븿
  300:         if (type !== "worklog") {
  301:             eventInfo.revert();
  302:             return;
  303:         }
  304:         const pathParams = {
  305:             issueIdOrKey: event.extendedProps.issue.key,
  306:             id: event.extendedProps.worklog.id
  307:         }
  308:         const started = getTimeISOString(getDateString(event.start),
  309:             formatToHHmm(new Date(event.extendedProps.worklog.started)), context.timezone)
  310:         const params = {
  311:             started: started,
  312:         }
  313:         const result = await executeRequest('updateWorklog', params, pathParams);
  314:         // executeRequest ???ㅽ뙣 ??{success:false} 諛섑솚 ???ㅽ뙣硫??쒕옒洹몃? ?먯쐞移섎줈 ?섎룎由곕떎(沅뚰븳 嫄곕? ?ы븿)
  315:         if (result?.success === false) {
  316:             eventInfo.revert();
  317:             return;
  318:         }
  319:         // 耳덈┛?붾쭔 ?몃꺼由щ뱶
  320:         await queryClient.invalidateQueries({
  321:             queryKey: myWorkKeys.calendarWorklogs(normalizedProjectIds, startDate, endDate)
  322:         });
  323:         event.setExtendedProp('worklog', result)
  324:     };
  325:     /*
  326:     * 紐⑤떖
  327:     * */
  328:     const closeWorklogModal = () => {
  329:         setIsWorklogOpen(false);
  330:         setWorklogInfo(null);
  331:     };
  332: 
  333:     const closeScheduleModal = () => {
  334:         setIsScheduleOpen(false);
  335:         setScheduleInfo(null);
  336:     };
  337: 
  338:     const submitWorklogModal = async () => {
  339:         closeWorklogModal();
  340:         await queryClient.invalidateQueries({queryKey: myWorkKeys.calendarWorklogsAll});
  341:         await queryClient.invalidateQueries({queryKey: myWorkKeys.projectWorklogsAll});
  342:     };
  343: 
  344:     const submitScheduleModal = async () => {
  345:         await queryClient.invalidateQueries({queryKey: scheduleKeys.all});
  346:         closeScheduleModal();
  347:     };
  348: 
  349:     return (
  350:         <PageContainer>
  351:             <Stack space="space.200">
  352:                 <MyLogSummary
  353:                     projectCount={projectCount}
  354:                     summary={summary}
  355:                     issueCount={issueCountData}
  356:                     settingData={settingData}
  357:                     holidayList={holidayList}
  358:                 />
  359: 
  360:                 {/*
  361:                   * 蹂몃Ц ?믪씠 ??`85vh` 怨좎젙?대뜕 寃껋쓣 **?꾩뿉????留뚰겮 類 媛?*?쇰줈 諛붽씔??
  362:                   *
  363:                   * 85vh ??酉고룷?몄쓽 85% 瑜???긽 ?붽뎄?섎뒗?? 洹??꾩뿉 ?대?
  364:                   *   app-main ?⑤뵫 48 + KPI ???~63 + Stack 媛꾧꺽 16 ??127px
  365:                   * ???뱁? ?덉뼱 ?⑹씠 100vh 瑜??섏뿀?????섏씠吏 ?ㅽ겕濡ㅼ씠 ?앷린怨?
  366:                   * 洹??덉뿉??罹섎┛?붽? ???ㅽ겕濡ㅻ뤌 ?댁쨷 ?ㅽ겕濡ㅼ씠 ?먮떎.
  367:                   *
  368:                   * ???곸닔 127 ? ????媛믪쓽 ?⑹씠?? ?곷떒 援ъ꽦??諛붾뚮㈃ 媛숈씠 ?먮킄???쒕떎.
  369:                   *   理쒖냼 ?믪씠瑜??ъ꽌 ?묒? ?붾㈃?먯꽌 罹섎┛?붽? 萸됯컻吏吏 ?딄쾶 ?쒕떎.
  370:                   */}
  371:                 {/*
  372:                   * 醫뚯슦 遺꾪븷? 怨듭슜 <ResizablePanels> ?뚯쑀(?묎린쨌?쒕옒洹??덈퉬 議곗젅쨌localStorage).
  373:                   * ??醫낆쟾 <Inline> + xcss({flex:'2'/'8'}) ??**raw flex 媛믪씠 議곗슜??臾댁떆**??
  374:                   *   ?ㅼ젣濡쒕뒗 2:8 ???꾨땲??hug + ?묐걹 ?뺣젹?댁뿀?? ?댁젣 肄붾뱶媛 ?섎룄??20:80 ???곸슜?쒕떎.
  375:                   */}
  376:                 <ResizablePanels
  377:                     storageKey="myWork.panels.layout"
  378:                     height="calc(100vh - 127px)"
  379:                     minHeight={520}
  380:                 >
  381:                     {/* ?꾨줈?앺듃 */}
  382:                     <Panel
  383:                         id="projects"
  384:                         title={t('worklog.layout.project')}
  385:                         defaultWeight={20}
  386:                         minWidth={260}
  387:                     >
  388:                         <Card
  389:                             title={t('worklog.layout.project')}
  390:                             headerRight={<PanelToggleButton panelId="projects" />}
  391:                         >
  392:                             <MyProjectList
  393:                                 context={context}
  394:                                 selectedProjectIds={selectedProjectIds}
  395:                                 onSelectProjects={setSelectedProjectIds}
  396:                                 onTotalCountChange={setProjectCount}
  397:                             />
  398:                         </Card>
  399:                     </Panel>
  400: 
  401:                     {/* 硫붿씤 */}
  402:                     <Panel
  403:                         id="main"
  404:                         title={t('worklog.layout.task')}
  405:                         defaultWeight={80}
  406:                         minWidth={880}
  407:                     >
  408:                         <Card title={t('worklog.layout.task')} headerRight={
  409:                                 <>
  410:                                     <ViewModeToggle
  411:                                         viewMode={viewMode}
  412:                                         onChange={(mode) => {
  413:                                             setViewMode(mode);
  414:                                         }}
  415:                                         items={[
  416:                                             {mode: "calendar", icon: <CalendarIcon label="" />, label: t('worklog.button.calender')},
  417:                                             {mode: "table", icon: <TableIcon label="" />, label: t('worklog.button.table')},
  418:                                         ]}
  419:                                     />
  420:                                     <PanelToggleButton panelId="main" />
  421:                                 </>
  422:                             }
  423:                         >
  424:                             {viewMode === "calendar" && (
  425:                                 <Box style={{flexShrink: 0, marginBottom: 8, display: "flex",
  426:                                     justifyContent: "space-between", alignItems: "center",gap: 12, flexWrap: "wrap"}}>
  427:                                     {/*
  428:                                       * 議곗옉 ?덈궡 ??留ㅼ씪 ?곕뒗 ?붾㈃?대씪 **?쏀엳??二쇱옣?섏? ?딄쾶** ?ㅼ쓣 ??텣??
  429:                                       * ?덉쟾???쒕ぉ??援듦쾶 ?섍퀬 肄쒕줎?쇰줈 ?댁뼱 遺숈뿬(`**?좎쭨 ?대┃**: ?뚰겕濡쒓렇 異붽?)
  430:                                       * ???⑹뼱由ш? 蹂몃Ц泥섎읆 ?쏀삍?? ?꾩씠肄샕룰??먮? 媛숈? ?ㅼ쑝濡??뺥엳怨?
  431:                                       * ??ぉ ?ъ씠???щ갚?쇰줈留?媛瑜몃떎.
  432:                                       */}
  433:                                     <Box style={{
  434:                                         display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
  435:                                         fontSize: 12, color: token("color.text.subtlest", "#8993A4"),
  436:                                     }}>
  437:                                         {[
  438:                                             [CalendarPlusIcon, 'worklog.guide.date'],
  439:                                             [TasksIcon, 'worklog.guide.issue'],
  440:                                             [DiagramSymbolActionIcon, 'worklog.guide.item'],
  441:                                         ].map(([Icon, key]) => (
  442:                                             <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
  443:                                                 <Icon label="" size="small" color="currentColor" />
  444:                                                 {t(`${key}.title`)} 쨌 {t(`${key}.description`)}
  445:                                             </span>
  446:                                         ))}
  447:                                     </Box>
  448: 
  449:                                     {/*
  450:                                       * ?깅줉 吏꾩엯????媛?
  451:                                       * 罹섎┛???좎쭨瑜??대┃?대룄 ?뚰겕濡쒓렇瑜??????덉?留?洹멸굔 **?뚯븘??蹂댁씠??湲?*?대씪,
  452:                                       * ???붾㈃??二??됰룞(?뚰겕濡쒓렇 ?깅줉)? 踰꾪듉?쇰줈???몃떎.
  453:                                       * ?좎쭨 ?놁씠 ?꾨Ⅴ硫?紐⑤떖???ㅻ뒛濡??곕떎(`onDateClick` 怨?媛숈? ?곹깭 珥덇린??.
  454:                                       */}
  455:                                     {/* ?깃꺽???ㅻⅨ ???깅줉(?묒뾽 湲곕줉 / 媛쒖씤 ?쇱젙)?대씪 遺숈뿬 ?먯? ?딅뒗??
  456:                                         ??gap ? space ?좏겙留?諛쏅뒗????'gap.200' 媛숈? 媛믪? 議곗슜??臾댁떆??媛꾧꺽??0 ???쒕떎. */}
  457:                                     <Flex gap="space.100">
  458:                                         <Button
  459:                                             iconBefore={AddIcon}
  460:                                             appearance="primary"
  461:                                             onClick={() => {
  462:                                                 setClickedDate(getDateString(new Date()));
  463:                                                 setWorklogInfo(null);
  464:                                                 setIsWorklogOpen(true);
  465:                                             }}
  466:                                         >
  467:                                             {t('worklog.button.addWorklog')}
  468:                                         </Button>
  469: 
  470:                                         <Button
  471:                                             iconBefore={AddIcon}
  472:                                             onClick={() => {
  473:                                                 setClickedDate(null);
  474:                                                 setScheduleInfo(null);
  475:                                                 setIsScheduleOpen(true);
  476:                                             }}
  477:                                         >
  478:                                             {t('worklog.button.addSchedule')}
  479:                                         </Button>
  480:                                     </Flex>
  481: 
  482:                                 </Box>
  483:                             )}
  484: 
  485:                             <LoadingOverlay isLoading={isLoading || isFetching || isScheduleLoading}>
  486:                                 <Box
  487:                                     style={{
  488:                                         flex: "1 1 auto",
  489:                                         minHeight: 0,
  490:                                         height: '100%',
  491:                                         overflow: viewMode === "calendar" ? 'hidden' : 'auto'
  492:                                     }}
  493:                                 >
  494:                                     {viewMode === "calendar" ? (
  495:                                         <LazyFullCalendar
  496:                                             context={context}
  497:                                             event={mergedEvents}
  498:                                             onEventClick={onEventClick}
  499:                                             onDatesSetChange={onDatesSetChange}
  500:                                             calendarRef={calendarRef}
  501:                                             onEventDrop={onEventDrop}
  502:                                             onDateClick={onDateClick}
  503:                                             holidayDates={holidayDates}
  504:                                             settingData={settingData}
  505:                                         />
  506:                                     ) : (
  507:                                         <MyIssueTable
  508:                                             context={context}
  509:                                             selectedProjectIds={normalizedProjectIds}
  510:                                             onWorklogClick={(worklog) => {
  511:                                                 setWorklogInfo(worklog);
  512:                                                 setIsWorklogOpen(true);
  513:                                             }}
  514:                                             settingData={settingData}
  515:                                         />
  516:                                     )}
  517:                                 </Box>
  518:                             </LoadingOverlay>
  519:                         </Card>
  520:                     </Panel>
  521:                 </ResizablePanels>
  522:             </Stack>
  523: 
  524:             {/* Worklog Modal */}
  525:             <WorklogModal
  526:                 selectedProjectIds={normalizedProjectIds}
  527:                 isOpen={isWorklogOpen}
  528:                 closeModal={closeWorklogModal}
  529:                 worklogInfo={worklogInfo}
  530:                 submitModal={submitWorklogModal}
  531:                 clickedDate={clickedDate}
  532:                 coworkerFieldId={coworkerFieldId}
  533:                 settingData={settingData}
  534:                 holidayDates={holidayDates}
  535:                 myScheduleList={myScheduleList?.data}
  536:             />
  537: 
  538:             {/* Schedule Modal */}
  539:             <ScheduleModal
  540:                 isOpen={isScheduleOpen}
  541:                 closeModal={closeScheduleModal}
  542:                 submitModal={submitScheduleModal}
  543:                 clickedDate={clickedDate}
  544:                 scheduleInfo={scheduleInfo}
  545:             />
  546:         </PageContainer>
  547:     );
  548: }
  549: 
  550: export const makeHolidayEvents = (holidayList = []) => {
  551:     return holidayList.map(holiday => ({
  552:         id: holiday.id,
  553:         title: holiday.name,
  554:         start: holiday.holidayDate,
  555:         allDay: true,
  556:         display: "block",
  557:         backgroundColor: "transparent",
  558:         borderColor: "transparent",
  559:         extendedProps: {
  560:             type: "holiday",
  561:         }
  562:     }));
  563: };
  564: 
  565: export const makeScheduleEvents = (scheduleData = []) => {
  566: 
  567:     const typeMap = new Map(
  568:         scheduleTypeOptions.map(v => [v.value, v])
  569:     );
  570: 
  571:     return scheduleData.map(schedule => {
  572: 
  573:         const typeInfo = typeMap.get(schedule.schedule_type);
  574: 
  575:         return {
  576:             id: schedule.schedule_id,
  577:             title: typeInfo?.label || schedule.schedule_type,
  578:             start: schedule.schedule_start_date,
  579:             // ??κ컪? inclusive, allDay ?대깽?몄쓽 end ??exclusive ??+1??蹂댁젙?댁빞 醫낅즺?쇨퉴吏 洹몃젮吏꾨떎
  580:             end: addDaysToDateString(schedule.schedule_end_date, 1),
  581:             allDay: true,
  582:             backgroundColor: typeInfo?.backgroundColor,
  583:             borderColor: typeInfo?.backgroundColor,
  584:             textColor: typeInfo?.color,
  585: 
  586:             extendedProps: {
  587:                 type: "schedule",
  588:                 schedule,
  589:                 typeInfo
  590:             }
  591:         };
  592:     });
  593: };

--- static/ui/src/pages/myWork/modal/WorklogModal.jsx ---
    1: import BaseModal from "../../../components/modal/CommonModal";
    2: import {ErrorMessage, Field} from "@atlaskit/form";
    3: import {DatePicker, TimePicker} from "@atlaskit/datetime-picker";
    4: import {view} from "@forge/bridge";
    5: import Button from "@atlaskit/button/new";
    6: import {useI18nStore} from "../../../stores/useI18nStore";
    7: import React, {useEffect, useMemo, useState} from "react";
    8: import Textfield from "@atlaskit/textfield";
    9: import Select from "@atlaskit/select";
   10: import Tooltip from "@atlaskit/tooltip";
   11: import {CustomFieldKey, MovesAlias} from "../../../constants/customField";
   12: import {executeRequest} from "../../../utils/jiraApi/requestJira";
   13: import {getIssueCoworkerIds} from "../../../utils/jiraApi/coworkerProperty";
   14: import {useUserInfos} from "../../../utils/jiraApi/users/getUserInfos";
   15: import {IssueComponent} from "../../../components/issue/IssueComponent";
   16: import {
   17:     convertTimeToSeconds, formatToHHmm,
   18:     getDateString,
   19:     getTimeISOString,
   20:     timeValidation
   21: } from "../../../utils/TimeUtils";
   22: import {LazyMarkdownEditor} from "../../../components/markdown/MarkdownEditorLazy";
   23: import {UserAvatar} from "../../../components/avatar/UserAvatar";
   24: import {AvatarStack} from "../../../components/avatar/AvatarStack";
   25: import {scheduleTypeOptions} from "../../../constants/scheduleTypeOptions";
   26: import Checkbox from "@atlaskit/checkbox";
   27: import {fetchJiraProjectPermissions, projectKeyOfIssue} from "../../../utils/jiraApi/useJiraEditGuards";
   28: import {useQueryClient} from "@tanstack/react-query";
   29: import {myWorkKeys} from "../../../utils/queryKey/myWorkKeys";
   30: import {calendarKeys} from "../../../utils/queryKey/logicalAuditKeys";
   31: 
   32: const context = await view.getContext();
   33: 
   34: /*
   35:  * 留덊겕?ㅼ슫?볾DF 蹂?섍린??留덊겕?ㅼ슫 ?뚯꽌(marked/mdast/micromark)瑜??듭㎏濡??뚭퀬 ?⑤떎.
   36:  * ??紐⑤떖???뚯쑀??`WorklogPage` 媛 湲곕낯 吏꾩엯 ?쇱슦???뺤쟻 import)?? ?뺤쟻?쇰줈 ?먮㈃ ?뚰겕濡쒓렇瑜?
   37:  * ??踰덈룄 ?댁? ?딅뒗 ?ъ슜?먭퉴吏 ?뚯꽌瑜??대젮諛쏅뒗?????먮뵒??`MarkdownEditorLazy`)瑜??대졇?붾뜲
   38:  * 蹂?섍린媛 ?⑥븘 ?덉쑝硫?遺꾨━ ?④낵媛 ?덈컲???쒕떎.
   39:  *
   40:  * 紐⑤뱢 promise 瑜?罹먯떆?섎?濡???踰덉㎏ ?몄텧遺?곕뒗 ?뺣났???녿떎(webpack ??媛숈? 泥?겕瑜??ъ궗?⑺븳??.
   41:  */
   42: let markdownToAdfPromise = null;
   43: const loadMarkdownToAdf = () => {
   44:     if (!markdownToAdfPromise) {
   45:         markdownToAdfPromise = import('marklassian').then(m => m.markdownToAdf);
   46:     }
   47:     return markdownToAdfPromise;
   48: };
   49: 
   50: let adfToMdPromise = null;
   51: const loadAdfToMd = () => {
   52:     if (!adfToMdPromise) {
   53:         adfToMdPromise = import('adf-to-md');
   54:     }
   55:     return adfToMdPromise;
   56: };
   57: 
   58: // executeRequest ???ㅽ뙣 ??throw ???{success:false} 諛섑솚 ??throw 濡??밴꺽??catch 濡??섎┝
   59: const ensureWorklogResult = (result) => {
   60:     if (result?.success === false) {
   61:         const err = new Error('worklog request failed');
   62:         err.cause = result.error;
   63:         throw err;
   64:     }
   65:     return result;
   66: };
   67: 
   68: export const WorklogModal = ({
   69:     selectedProjectIds, isOpen, closeModal, submitModal, worklogInfo,
   70:     clickedDate, coworkerFieldId, settingData, holidayDates, myScheduleList
   71: }) => {
   72:     const t = useI18nStore(s => s.t);
   73:     const queryClient = useQueryClient();
   74: 
   75:     // ?몄쭛 ?щ? / 留덊겕?ㅼ슫 蹂몃Ц
   76:     const [isEdit, setIsEdit] = useState(false);
   77:     const [markdown, setMarkdown] = useState('');
   78: 
   79:     // ?낅젰 紐⑤뱶: "simple" = ?좎쭨+?쒓컙 吏곸젒 ?낅젰, "range" = 湲곌컙 ?쇨큵 ?낅젰
   80:     const [inputMode, setInputMode] = useState("simple");
   81: 
   82:     // 湲곌컙 ?낅젰 紐⑤뱶??state
   83:     const [rangeStartTime, setRangeStartTime] = useState("09:00");
   84:     const [rangeEndTime, setRangeEndTime] = useState("17:00");
   85:     const [rangeStartDate, setRangeStartDate] = useState(clickedDate ?? getDateString(new Date()));
   86:     const [rangeEndDate, setRangeEndDate] = useState(clickedDate ?? getDateString(new Date()));
   87: 
   88:     // 鍮꾧렐臾댁씪 ?쒖쇅 ?듭뀡
   89:     const [skipWeekends, setSkipWeekends] = useState(false);
   90:     const [skipHolidays, setSkipHolidays] = useState(false);
   91:     const [skipSchedules, setSkipSchedules] = useState(false); // workRatio 0???ㅼ?以??곗감 ??
   92: 
   93:     // 湲곌컙 ?낅젰 ?쇨큵 ?깅줉 ?ㅽ뙣 硫붿떆吏
   94:     const [rangeError, setRangeError] = useState(null);
   95:     // ?깅줉/?섏젙/??젣 ?ㅽ뙣 硫붿떆吏 (Jira 沅뚰븳 嫄곕? ?ы븿, 紐⑤뱶 臾닿? ?쒖떆)
   96:     const [submitError, setSubmitError] = useState(null);
   97: 
   98:     const { issue, worklog } = worklogInfo || {};
   99:     const worklog_id = worklog?.id;
  100:     const issue_id = issue?.id;
  101: 
  102:     const defaultIssueOption = issue && {
  103:         label: <IssueComponent issueKey={issue.key} issueImage={issue.fields.issuetype.iconUrl} summary={issue?.fields?.summary}/>,
  104:         value: issue.id
  105:     };
  106: 
  107:     const [selectedIssue, setSelectedIssue] = useState(issue ?? null);
  108:     const [selectedWorklog, setSelectedWorklog] = useState(worklog ?? null);
  109: 
  110:     useEffect(() => {
  111:         setSelectedIssue(issue ?? null);
  112:         setSelectedWorklog(worklog ?? null);
  113:     }, [worklogInfo]);
  114: 
  115:     const assignee = selectedIssue?.fields.assignee;
  116:     const worklogAuthor = selectedWorklog?.author;
  117:     // coworker ???꾨줈?쇳떚(movesRms)??accountId[] ??useUserInfos(bulk) 濡?user 媛앹껜 resolve.
  118:     const coworkerIds = getIssueCoworkerIds(selectedIssue);
  119:     const { data: coworkerUsers } = useUserInfos(coworkerIds);
  120:     const coworkers = coworkerUsers;
  121: 
  122:     // 紐⑤떖???대┫ ?뚮쭏???몄쭛 ?щ? ?먮떒 諛?湲곕낯媛?珥덇린??
  123:     useEffect(() => {
  124:         setIsEdit(!!worklog_id);
  125:         setInputMode("simple");
  126:         setSubmitError(null);
  127: 
  128:         // 湲곗〈 肄붾찘?멸? ?놁쑝硫?蹂?섍린瑜??꾩삁 諛쏆? ?딅뒗???좉퇋 ?깅줉???遺遺꾩씠??.
  129:         const comment = worklog?.comment;
  130:         if (!comment) {
  131:             setMarkdown('');
  132:             return;
  133:         }
  134: 
  135:         // 蹂?섍린 濡쒕뱶媛 鍮꾨룞湲곕씪, 洹??ъ씠 ?ㅻⅨ ?뚰겕濡쒓렇瑜??대㈃ ??쾶 ?꾩갑??寃곌낵媛 ??뼱?????덈떎.
  136:         let cancelled = false;
  137:         loadAdfToMd()
  138:             .then(adf2md => {
  139:                 if (!cancelled) setMarkdown(adf2md.convert(comment)?.result || '');
  140:             })
  141:             .catch(() => {
  142:                 if (!cancelled) setMarkdown('');
  143:             });
  144:         return () => { cancelled = true; };
  145:     }, [worklogInfo]);
  146: 
  147:     // 蹂몄씤 ?뚰겕濡쒓렇?닿굅???묒꽦???뺣낫媛 ?놁쓣 ?뚮쭔 ?몄쭛 ?덉슜
  148:     const isEditable = !worklogAuthor || worklogAuthor.accountId === context.accountId;
  149:     const hourRate = settingData?.hourRate || 8;
  150: 
  151:     // ?쒖옉~醫낅즺 ?쒓컙 李⑥씠濡??섎（ ?묒뾽 ?쒓컙(h) 怨꾩궛
  152:     const calcHoursPerDay = (startTime, endTime) => {
  153:         if (!startTime || !endTime) return 0;
  154:         const [sh, sm] = startTime.split(':').map(Number);
  155:         const [eh, em] = endTime.split(':').map(Number);
  156:         return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60, 0);
  157:     };
  158:     const hoursPerDay = calcHoursPerDay(rangeStartTime, rangeEndTime);
  159: 
  160:     // ?쒖쇅???좎쭨 Set: 怨듯쑕??+ workRatio 0???ㅼ?以??곗감 ?? ?좎쭨瑜??⑹궛
  161:     const skipDates = useMemo(() => {
  162:         const set = new Set();
  163:         if (skipHolidays && holidayDates) {
  164:             holidayDates.forEach(d => set.add(d));
  165:         }
  166:         if (skipSchedules && myScheduleList?.length) {
  167:             // workRatio媛 0??????곗감 ?????ㅼ?以??좎쭨留??섏쭛
  168:             const zeroRatioTypes = new Set(
  169:                 scheduleTypeOptions.filter(o => o.workRatio === 0).map(o => o.value)
  170:             );
  171:             myScheduleList.forEach(schedule => {
  172:                 if (zeroRatioTypes.has(schedule.schedule_type)) {
  173:                     const cur = new Date(schedule.schedule_start_date);
  174:                     const end = new Date(schedule.schedule_end_date);
  175:                     while (cur <= end) {
  176:                         set.add(getDateString(cur));
  177:                         cur.setDate(cur.getDate() + 1);
  178:                     }
  179:                 }
  180:             });
  181:         }
  182:         return set;
  183:     }, [skipHolidays, skipSchedules, holidayDates, myScheduleList]);
  184: 
  185:     // ?듭뀡(二쇰쭚/怨듯쑕???곗감)??怨좊젮???ㅼ젣 洹쇰Т????怨꾩궛
  186:     const calcWorkingDays = (startDateStr, endDateStr) => {
  187:         if (!startDateStr || !endDateStr) return 0;
  188:         const start = new Date(startDateStr);
  189:         const end = new Date(endDateStr);
  190:         if (end < start) return 0;
  191:         let days = 0;
  192:         const cur = new Date(start);
  193:         while (cur <= end) {
  194:             const dow = cur.getDay();
  195:             const isWeekend = skipWeekends && (dow === 0 || dow === 6);
  196:             if (!isWeekend && !skipDates.has(getDateString(cur))) days++;
  197:             cur.setDate(cur.getDate() + 1);
  198:         }
  199:         return days;
  200:     };
  201: 
  202:     // ?낅젰???좎쭨 踰붿쐞 湲곗? ?덉긽 洹쇰Т????(誘몃━蹂닿린??
  203:     const previewWorkingDays = useMemo(() => {
  204:         return calcWorkingDays(rangeStartDate, rangeEndDate);
  205:     }, [rangeStartDate, rangeEndDate, skipDates, skipWeekends]);
  206: 
  207:     // 湲곌컙 ?낅젰 紐⑤뱶濡??꾪솚 ???좎쭨/?쒓컙 珥덇린媛??ㅼ젙
  208:     const handleInputModeChange = (mode) => {
  209:         if (mode === "range") {
  210:             // 湲곗〈 worklog媛 ?덉쑝硫?started 湲곗??쇰줈, ?놁쑝硫??ㅻ뒛/?대┃ ?좎쭨 湲곗?
  211:             const startDateStr = worklog?.started
  212:                 ? worklog.started.substring(0, 10)
  213:                 : (clickedDate ?? getDateString(new Date()));
  214:             const startTimeStr = worklog?.started
  215:                 ? formatToHHmm(new Date(worklog.started))
  216:                 : "09:00";
  217:             const [sh, sm] = startTimeStr.split(':').map(Number);
  218:             const endTotalMin = sh * 60 + sm + hourRate * 60;
  219:             const endTimeStr = `${String(Math.floor(endTotalMin / 60)).padStart(2, '0')}:${String(endTotalMin % 60).padStart(2, '0')}`;
  220: 
  221:             // timeSpentSeconds? hourRate濡?醫낅즺????궛
  222:             let endDateStr = startDateStr;
  223:             if (worklog?.timeSpentSeconds && hourRate > 0) {
  224:                 const extraDays = Math.max(Math.ceil(worklog.timeSpentSeconds / (hourRate * 3600)) - 1, 0);
  225:                 const d = new Date(startDateStr);
  226:                 d.setDate(d.getDate() + extraDays);
  227:                 endDateStr = getDateString(d);
  228:             }
  229: 
  230:             setRangeStartDate(startDateStr);
  231:             setRangeEndDate(endDateStr);
  232:             setRangeStartTime(startTimeStr);
  233:             setRangeEndTime(endTimeStr);
  234:         }
  235:         setInputMode(mode);
  236:     };
  237: 
  238:     // ?쒖쇅 ?듭뀡??諛섏쁺???좎쭨蹂?洹쇰Т??紐⑸줉 諛섑솚 (?뚰겕濡쒓렇 媛쒕퀎 ?앹꽦??
  239:     const getWorkingDateList = (startDateStr, endDateStr) => {
  240:         const dates = [];
  241:         const cur = new Date(startDateStr);
  242:         const end = new Date(endDateStr);
  243:         while (cur <= end) {
  244:             const dow = cur.getDay();
  245:             const isWeekend = skipWeekends && (dow === 0 || dow === 6);
  246:             const dateStr = getDateString(cur);
  247:             if (!isWeekend && !skipDates.has(dateStr)) dates.push(dateStr);
  248:             cur.setDate(cur.getDate() + 1);
  249:         }
  250:         return dates;
  251:     };
  252: 
  253:     const checkTimeReg = time => {
  254:         if (!time) return "REQUIRED";
  255:         if (!timeValidation.test(time)) return "NOT VALID";
  256:     };
  257:     const emptyValidate = value => { if (!value) return 'REQUIRED'; };
  258: 
  259:     const showErrorMsg = error => {
  260:         if (error === 'REQUIRED') return <ErrorMessage>{t('worklog.modal.field.error.required')}</ErrorMessage>;
  261:         if (error === 'NOT VALID') return <ErrorMessage>{t('worklog.modal.field.error.notvalid')}</ErrorMessage>;
  262:     };
  263: 
  264:     const onSubmit = async value => {
  265:         setRangeError(null);
  266:         setSubmitError(null);
  267: 
  268:         // 醫낅즺<=?쒖옉?대㈃ hoursPerDay 媛 0?대씪 timeSpentSeconds=0 ?쇰줈 ?쒖텧?섍퀬 Jira 媛 400 ?쇰줈
  269:         // 嫄곕??쒕떎. 誘몃━蹂닿린??hoursPerDay>0 議곌굔?대씪 ?붾㈃?먮뒗 ?꾨Т 寃쎄퀬媛 ?녿떎 ???ш린??留됰뒗??
  270:         // TimePicker ??timeIsEditable ?대씪 ?꾩쓽 臾몄옄?댁씠 ?ㅼ뼱?????덇퀬, 洹몃븣 hoursPerDay ??
  271:         // NaN ?대떎. `NaN <= 0` ? false ???ш린瑜?洹몃깷 ?듦낵??timeSpentSeconds: NaN ???섍컙??
  272:         if (inputMode === "range" && !(Number.isFinite(hoursPerDay) && hoursPerDay > 0)) {
  273:             setRangeError(t('worklog.error.rangeInvalidTime'));
  274:             return;
  275:         }
  276: 
  277:         // Jira 沅뚰븳 ?ъ쟾 泥댄겕 ???뺤젙 嫄곕?(false)留?李⑤떒, null(誘명솗??? ?쒕룄(?쒕쾭媛 理쒖쥌 嫄곕?)
  278:         const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(selectedIssue?.key));
  279:         if (worklog_id ? perms.canEditOwnWorklogs === false : perms.canWorkOnIssues === false) {
  280:             setSubmitError(t(worklog_id ? 'worklog.jiraPermission.edit' : 'worklog.jiraPermission.add'));
  281:             return;
  282:         }
  283: 
  284:         try {
  285:             if (inputMode === "range") {
  286:                 await addWorklogRange(value);
  287:             } else if (worklog_id) {
  288:                 await updateWorklog(value);
  289:             } else {
  290:                 await addWorklog(value);
  291:             }
  292:             submitModal();
  293:         } catch (e) {
  294:             // 湲곌컙 ?낅젰 以??ㅽ뙣 ??濡ㅻ갚 寃곌낵???곕씪 ?덈궡瑜?媛瑜몃떎(?⑥? ??ぉ???덉쑝硫?洹??ъ떎???뚮┛??
  295:             if (inputMode === "range") {
  296:                 if (e?.rollbackFailed) {
  297:                     // 痍⑥냼?섏? 紐삵븳 ??ぉ??紐⑸줉???쒕윭?섏빞 ?쒕떎 ???덈궡留??섍퀬 罹먯떆瑜??먮㈃ ?뺤씤??諛⑸쾿???녿떎.
  298:                     // ??紐⑤떖? ?꾨줈?앺듃 罹섎┛??ProjectCalender)?먯꽌???ъ궗?⑸릺怨?洹몄そ 罹먯떆??
  299:                     // calendarKeys 瑜??곕?濡? myWorkKeys 留?臾댄슚?뷀븯硫?洹??붾㈃?먯꽌??no-op ???쒕떎.
  300:                     queryClient.invalidateQueries({queryKey: myWorkKeys.calendarWorklogsAll});
  301:                     queryClient.invalidateQueries({queryKey: myWorkKeys.projectWorklogsAll});
  302:                     queryClient.invalidateQueries({queryKey: calendarKeys.all});
  303:                 }
  304:                 setRangeError(t(
  305:                     e?.rollbackFailed ? 'worklog.error.rangeRollbackFailed'
  306:                         : e?.nothingCreated ? 'worklog.error.saveFailed'
  307:                             : 'worklog.error.rangeRolledBack'
  308:                 ));
  309:             } else {
  310:                 setSubmitError(t('worklog.error.saveFailed'));
  311:             }
  312:         }
  313:     };
  314: 
  315:     const onDelete = async () => {
  316:         setSubmitError(null);
  317:         const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(selectedIssue?.key));
  318:         if (perms.canDeleteOwnWorklogs === false) {
  319:             setSubmitError(t('worklog.jiraPermission.delete'));
  320:             return;
  321:         }
  322:         try {
  323:             ensureWorklogResult(await executeRequest('deleteWorklog', {}, {issueIdOrKey: issue_id, id: worklog_id}));
  324:             submitModal();
  325:         } catch (e) {
  326:             setSubmitError(t('worklog.error.saveFailed'));
  327:         }
  328:     };
  329: 
  330:     // ?⑥씪 ?좎쭨 ?뚰겕濡쒓렇 異붽?
  331:     const addWorklog = async value => {
  332:         const markdownToAdf = await loadMarkdownToAdf();
  333:         const pathParams = { issueIdOrKey: value.issueKey.value };
  334:         const params = {
  335:             comment: markdownToAdf(markdown),
  336:             started: getTimeISOString(value.start_date, value.start_time, context.timezone),
  337:             timeSpentSeconds: convertTimeToSeconds(value.spent_time)
  338:         };
  339:         return executeRequest('addWorklog', params, pathParams).then(result => ensureWorklogResult(result).id);
  340:     };
  341: 
  342:     // ?⑥씪 ?뚰겕濡쒓렇 ?섏젙
  343:     const updateWorklog = async value => {
  344:         const markdownToAdf = await loadMarkdownToAdf();
  345:         const pathParams = { issueIdOrKey: value.issueKey.value, id: worklog_id };
  346:         const params = {
  347:             comment: markdownToAdf(markdown),
  348:             started: getTimeISOString(value.start_date, value.start_time, context.timezone),
  349:             timeSpentSeconds: convertTimeToSeconds(value.spent_time)
  350:         };
  351:         ensureWorklogResult(await executeRequest('updateWorklog', params, pathParams));
  352:     };
  353: 
  354:     // 湲곌컙 ?낅젰: ?좎쭨蹂??뚰겕濡쒓렇瑜??쒖감 ?앹꽦, 以묎컙 ?ㅽ뙣 ???깃났遺??꾩껜 濡ㅻ갚
  355:     const addWorklogRange = async value => {
  356:         const markdownToAdf = await loadMarkdownToAdf();
  357:         const issueIdOrKey = value.issueKey.value;
  358:         const dates = getWorkingDateList(value.range_start_date, value.range_end_date);
  359:         const timeSpentSeconds = hoursPerDay * 3600;
  360:         const createdIds = [];
  361:         try {
  362:             for (const dateStr of dates) {
  363:                 const id = await executeRequest('addWorklog', {
  364:                     comment: markdownToAdf(markdown),
  365:                     started: getTimeISOString(dateStr, rangeStartTime, context.timezone),
  366:                     timeSpentSeconds
  367:                 }, {issueIdOrKey}).then(r => ensureWorklogResult(r).id);
  368:                 createdIds.push(id);
  369:             }
  370:         } catch (e) {
  371:             /*
  372:              * ?대? ?앹꽦???뚰겕濡쒓렇瑜??섎룎由곕떎. ?대븣 ??젣 **寃곌낵瑜?諛섎뱶???뺤씤**?쒕떎 ??
  373:              * ?깅줉??留됱? ?먯씤(?ㅽ듃?뚰겕 ?⑥젅쨌沅뚰븳 ?뚯닔)??怨???젣??留됰뒗 ?먯씤?대씪,
  374:              * ?뺤씤?섏? ?딆쑝硫??뺤옉 濡ㅻ갚???ㅽ뙣???곹솴?먯꽌 "紐⑤몢 痍⑥냼???쇰줈 ?덈궡?섍쾶 ?쒕떎.
  375:              */
  376:             const rollbackOk = await Promise.all(
  377:                 createdIds.map(id =>
  378:                     executeRequest('deleteWorklog', {}, {issueIdOrKey, id})
  379:                         .then(r => r?.success !== false)
  380:                         .catch(() => false)
  381:                 )
  382:             );
  383:             const err = new Error('worklog range failed');
  384:             err.cause = e;
  385:             err.rollbackFailed = rollbackOk.some(ok => !ok);
  386:             // 泥??좎쭨遺???ㅽ뙣?섎㈃ ?섎룎由?寃껋씠 ?녿떎. ?대븣 "紐⑤몢 痍⑥냼?섏뿀?듬땲??濡??덈궡?섎㈃
  387:             // 留뚮뱾?댁죱???щ씪吏???ぉ???덈뒗 寃껋쿂???쏀엺??
  388:             err.nothingCreated = createdIds.length === 0;
  389:             throw err;
  390:         }
  391:     };
  392: 
  393:     const promiseOptions = async inputValue => {
  394:         // coworker JQL ? ?꾨줈?쇳떚 alias(movesRmsCoworkers)濡? projectId JQL ? ?꾪뻾 ?좎?(鍮꾨ぉ??.
  395:         let jql = `${CustomFieldKey.projectIdField} IS NOT EMPTY AND (${MovesAlias.coworkers} = currentUser() OR assignee = currentUser())`;
  396:         const projectIds = Array.isArray(selectedProjectIds) ? selectedProjectIds
  397:             : selectedProjectIds ? [selectedProjectIds] : [];
  398:         if (projectIds.length > 0) {
  399:             jql += ` AND (${projectIds.map(id => `moves_RMS_projectId = "${id}"`).join(" OR ")})`;
  400:         }
  401:         if (inputValue) jql += ` AND (textfields ~ "${inputValue}" OR workItemKey ~ "*${inputValue}*")`;
  402:         const result = await executeRequest('searchIssueWithJQL', {
  403:             jql, fields: ['*all'], properties: ['movesRms'], fieldsByKeys: true, maxResults: 100
  404:         });
  405:         return result.issues.map(issue => ({
  406:             label: <IssueComponent issueKey={issue.key} issueImage={issue.fields.issuetype.iconUrl} summary={issue?.fields?.summary}/>,
  407:             value: issue.id,
  408:             issue
  409:         }));
  410:     };
  411: 
  412:     return (
  413:         <BaseModal
  414:             isOpen={isOpen}
  415:             onClose={closeModal}
  416:             title={isEdit ? t('worklog.modal.title.edit') : t('worklog.modal.title.add')}
  417:             onSubmit={onSubmit}
  418:             submitText={isEdit ? t('common.button.edit') : t('common.button.add')}
  419:             footer={({ submitting, submitText }) => (
  420:                 <>
  421:                     <Button appearance="subtle" onClick={closeModal} isDisabled={submitting}>
  422:                         {t('common.button.close')}
  423:                     </Button>
  424:                     {isEditable && (
  425:                         <>
  426:                             {isEdit && worklogAuthor && (
  427:                                 <Button appearance="danger" onClick={onDelete}>
  428:                                     {t('common.button.delete')}
  429:                                 </Button>
  430:                             )}
  431:                             <Button appearance="primary" type="submit" isLoading={submitting}>
  432:                                 {submitText}
  433:                             </Button>
  434:                         </>
  435:                     )}
  436:                 </>
  437:             )}
  438:             width='large'
  439:         >
  440:             {/* ?낅젰 諛⑹떇 ?좉? - 異붽? 紐⑤뱶?먯꽌留?湲곌컙 ?낅젰 ???쒖떆 (?섏젙? 媛쒕퀎 ?뚰겕濡쒓렇 ?⑥쐞) */}
  441:             {!isEdit && isEditable && (
  442:                 <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
  443:                     <Button
  444:                         appearance={inputMode === "simple" ? "primary" : "default"}
  445:                         onClick={() => handleInputModeChange("simple")}
  446:                     >
  447:                         ?쒓컙 ?낅젰
  448:                     </Button>
  449:                     <Button
  450:                         appearance={inputMode === "range" ? "primary" : "default"}
  451:                         onClick={() => handleInputModeChange("range")}
  452:                     >
  453:                         湲곌컙 ?낅젰
  454:                     </Button>
  455:                 </div>
  456:             )}
  457: 
  458:             {/* ?몄쭛 紐⑤뱶?먯꽌 ?꾨줈?앺듃 ?쒖떆 */}
  459:             {worklogInfo != null && (
  460:                 <Field label={t('worklog.modal.field.project')} name="project">
  461:                     {() => (
  462:                         <Textfield
  463:                             value={issue?.fields.project.name ?? ""}
  464:                             isReadOnly
  465:                             appearance="none"
  466:                             elemBeforeInput={
  467:                                 issue?.fields.project.avatarUrls?.["24x24"] ? (
  468:                                     <img src={issue.fields.project.avatarUrls["24x24"]} alt=""
  469:                                          style={{ width: 20, height: 20, verticalAlign: "middle" }} />
  470:                                 ) : null
  471:                             }
  472:                         />
  473:                     )}
  474:                 </Field>
  475:             )}
  476: 
  477:             <Field name="issueKey" isDisabled={isEdit || !isEditable} validate={emptyValidate}
  478:                    defaultValue={defaultIssueOption} label={t('worklog.modal.field.work')} isRequired>
  479:                 {({ fieldProps, error }) => (
  480:                     <>
  481:                         <Select
  482:                             {...fieldProps}
  483:                             cacheOptions defaultOptions
  484:                             loadOptions={promiseOptions}
  485:                             menuPortalTarget={document.body}
  486:                             onChange={(option) => { fieldProps.onChange(option); setSelectedIssue(option?.issue ?? null); }}
  487:                             menuPosition="fixed"
  488:                             styles={{ menuPortal: base => ({ ...base, zIndex: 9999 }) }}
  489:                         />
  490:                         {showErrorMsg(error)}
  491:                     </>
  492:                 )}
  493:             </Field>
  494: 
  495:             <Field label={t('worklog.modal.field.worklog')} name="worklogAuthor">
  496:                 {() => (
  497:                     <Textfield isReadOnly appearance="none"
  498:                         elemBeforeInput={
  499:                             <UserAvatar response={worklogAuthor}
  500:                                 displayNoUser={t('projectDetail.filter.dropdownJql.noAssign')} />
  501:                         }
  502:                     />
  503:                 )}
  504:             </Field>
  505: 
  506:             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  507:                 <Field label={t('worklog.modal.field.assignee')} name="assigneeDisplay">
  508:                     {() => (
  509:                         <Textfield isReadOnly appearance="none"
  510:                             elemBeforeInput={
  511:                                 <UserAvatar response={assignee}
  512:                                     displayNoUser={t('projectDetail.filter.dropdownJql.noAssign')} />
  513:                             }
  514:                         />
  515:                     )}
  516:                 </Field>
  517:                 <Field label={t('worklog.modal.field.coworkers')} name="coworkersDisplay">
  518:                     {() => (
  519:                         <Textfield isReadOnly appearance="none"
  520:                             elemBeforeInput={<AvatarStack users={coworkers}/>}
  521:                         />
  522:                     )}
  523:                 </Field>
  524:             </div>
  525: 
  526:             {/* ?? ?쒓컙 ?낅젰 紐⑤뱶 ?? */}
  527:             {inputMode === "simple" && (
  528:                 <>
  529:                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  530:                         <Field name="start_date" label={t('worklog.modal.field.date')}
  531:                                validate={emptyValidate} isRequired
  532:                                defaultValue={
  533:                                    worklog?.started
  534:                                        ? getDateString(new Date(worklog.started))
  535:                                        : clickedDate ?? getDateString(new Date())
  536:                                }
  537:                         >
  538:                             {({ fieldProps, error }) => (
  539:                                 <>
  540:                                     <DatePicker {...fieldProps} isDisabled={!isEditable}
  541:                                         shouldShowCalendarButton locale={context.locale}
  542:                                         inputLabel={t('worklog.modal.field.date')} />
  543:                                     {showErrorMsg(error)}
  544:                                 </>
  545:                             )}
  546:                         </Field>
  547:                         <Field name="start_time" label={t('worklog.modal.field.startTime')}
  548:                                validate={emptyValidate} isRequired
  549:                                defaultValue={worklog?.started ? formatToHHmm(new Date(worklog.started)) : ''}>
  550:                             {({ fieldProps, error }) => (
  551:                                 <>
  552:                                     <TimePicker {...fieldProps} isDisabled={!isEditable}
  553:                                         locale={context.locale} timeIsEditable />
  554:                                     {showErrorMsg(error)}
  555:                                 </>
  556:                             )}
  557:                         </Field>
  558:                     </div>
  559:                     <Field name="spent_time" validate={checkTimeReg}
  560:                            label={t('worklog.modal.field.spentTime')} isRequired
  561:                            defaultValue={worklog?.timeSpent || ''}>
  562:                         {({ fieldProps, error }) => (
  563:                             <Tooltip content={
  564:                                 <><p>{t('worklog.modal.spentTime.tooltip.1')}</p>
  565:                                 <ul><li>{t('worklog.modal.spentTime.tooltip.2')}</li>
  566:                                 <li>{t('worklog.modal.spentTime.tooltip.3')}</li></ul></>
  567:                             }>
  568:                                 {(tooltipProps) => (
  569:                                     <>
  570:                                         <Textfield {...fieldProps} {...tooltipProps} isDisabled={!isEditable} />
  571:                                         {showErrorMsg(error)}
  572:                                     </>
  573:                                 )}
  574:                             </Tooltip>
  575:                         )}
  576:                     </Field>
  577:                 </>
  578:             )}
  579: 
  580:             {/* ?? 湲곌컙 ?낅젰 紐⑤뱶 ?? */}
  581:             {inputMode === "range" && (
  582:                 <>
  583:                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  584:                         <Field name="range_start_date" label="?쒖옉?? validate={emptyValidate} isRequired
  585:                                defaultValue={rangeStartDate}>
  586:                             {({ fieldProps, error }) => (
  587:                                 <>
  588:                                     <DatePicker {...fieldProps}
  589:                                         value={rangeStartDate}
  590:                                         onChange={(val) => { fieldProps.onChange(val); setRangeStartDate(val); }}
  591:                                         shouldShowCalendarButton locale={context.locale} />
  592:                                     {showErrorMsg(error)}
  593:                                 </>
  594:                             )}
  595:                         </Field>
  596:                         <Field name="range_end_date" label="醫낅즺?? validate={emptyValidate} isRequired
  597:                                defaultValue={rangeEndDate}>
  598:                             {({ fieldProps, error }) => (
  599:                                 <>
  600:                                     <DatePicker {...fieldProps}
  601:                                         value={rangeEndDate}
  602:                                         onChange={(val) => { fieldProps.onChange(val); setRangeEndDate(val); }}
  603:                                         shouldShowCalendarButton locale={context.locale} />
  604:                                     {showErrorMsg(error)}
  605:                                 </>
  606:                             )}
  607:                         </Field>
  608:                     </div>
  609:                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  610:                         <Field name="daily_start_time" label="?섎（ ?쒖옉 ?쒓컙" isRequired>
  611:                             {({ fieldProps }) => (
  612:                                 <TimePicker {...fieldProps}
  613:                                     value={rangeStartTime}
  614:                                     onChange={(val) => { fieldProps.onChange(val); setRangeStartTime(val); }}
  615:                                     locale={context.locale} timeIsEditable />
  616:                             )}
  617:                         </Field>
  618:                         <Field name="daily_end_time" label="?섎（ 醫낅즺 ?쒓컙" isRequired>
  619:                             {({ fieldProps }) => (
  620:                                 <TimePicker {...fieldProps}
  621:                                     value={rangeEndTime}
  622:                                     onChange={(val) => { fieldProps.onChange(val); setRangeEndTime(val); }}
  623:                                     locale={context.locale} timeIsEditable />
  624:                             )}
  625:                         </Field>
  626:                     </div>
  627: 
  628:                     {/* 鍮꾧렐臾댁씪 ?쒖쇅 ?듭뀡 */}
  629:                     <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
  630:                         <Checkbox isChecked={skipWeekends} onChange={e => setSkipWeekends(e.target.checked)} label="二쇰쭚 ?쒖쇅" />
  631:                         <Checkbox isChecked={skipHolidays} onChange={e => setSkipHolidays(e.target.checked)} label="怨듯쑕???쒖쇅" />
  632:                         <Checkbox isChecked={skipSchedules} onChange={e => setSkipSchedules(e.target.checked)} label="?곗감/?닿? ?쒖쇅" />
  633:                     </div>
  634: 
  635:                     {/* ?덉긽 ?앹꽦 ?뚰겕濡쒓렇 ??諛?珥??쒓컙 誘몃━蹂닿린 */}
  636:                     {hoursPerDay > 0 && rangeStartDate && rangeEndDate && (
  637:                         <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6,
  638:                             padding: '6px 10px', background: '#F3F4F6', borderRadius: 4 }}>
  639:                             ?뚰겕濡쒓렇 <strong>{previewWorkingDays}媛?/strong> ?앹꽦 &nbsp;쨌&nbsp;
  640:                             ?섎（ <strong>{hoursPerDay}h</strong> &nbsp;쨌&nbsp;
  641:                             珥?<strong>{(previewWorkingDays * hoursPerDay).toFixed(1)}h</strong>
  642:                         </div>
  643:                     )}
  644:                     {/* ?쇨큵 ?깅줉 ?ㅽ뙣 ??濡ㅻ갚 ?꾨즺 ?덈궡 */}
  645:                     {rangeError && (
  646:                         <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6,
  647:                             padding: '6px 10px', background: '#FEF2F2', borderRadius: 4 }}>
  648:                             {rangeError}
  649:                         </div>
  650:                     )}
  651:                 </>
  652:             )}
  653: 
  654:             <Field name="description" label={t('worklog.modal.field.description')}>
  655:                 {({ fieldProps }) => (
  656:                     <LazyMarkdownEditor markdown={markdown} setMarkdown={setMarkdown} />
  657:                 )}
  658:             </Field>
  659: 
  660:             {/* ?깅줉/?섏젙/??젣 ?ㅽ뙣 ?덈궡 (Jira 沅뚰븳 嫄곕? ?ы븿, ?낅젰 紐⑤뱶 臾닿?) */}
  661:             {submitError && (
  662:                 <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6,
  663:                     padding: '6px 10px', background: '#FEF2F2', borderRadius: 4 }}>
  664:                     {submitError}
  665:                 </div>
  666:             )}
  667:         </BaseModal>
  668:     );
  669: };

--- static/ui/src/pages/projectDetail/gantt/useGanttMutations.js ---
    1: import { useMutation, useQueryClient } from '@tanstack/react-query';
    2: import { invoke } from '@forge/bridge';
    3: import { executeRequest } from '../../../utils/jiraApi/requestJira';
    4: import { useI18nStore } from '../../../stores/useI18nStore';
    5: import { ganttKeys } from '../../../utils/queryKey/projectKeys';
    6: import {jiraKeys} from '../../../utils/queryKey/jiraKeys';
    7: import {
    8:     fetchJiraProjectPermissions,
    9:     isTimeTrackingUnsupportedError,
   10:     buildTimetrackingPayload,
   11:     projectKeyOfIssue,
   12: } from '../../../utils/jiraApi/useJiraEditGuards';
   13: 
   14: /** Jira 沅뚰븳 ?뺤젙 嫄곕?(false) ???섏????먮윭 ??onError ?먯꽌 code 濡?硫붿떆吏 留ㅽ븨. null(誘명솗??? ?섏?吏 ?딅뒗?? */
   15: function jiraPermissionError() {
   16:     const err = new Error('jira permission denied');
   17:     err.cause = { code: 'JIRA_PERMISSION_DENIED' };
   18:     return err;
   19: }
   20: 
   21: /** 罹먯떆(getProjectGanttData ?묐떟)???뱀젙 task 瑜?patch ?섎뒗 ?숆????낅뜲?댄듃 ?ы띁.
   22:  *  old.content.tasks[] 以?key/id 留ㅼ묶 ??ぉ??patch 瑜?蹂묓빀????罹먯떆瑜?留뚮뱺?? */
   23: function patchTask(old, issueKey, patch) {
   24:     const tasks = old?.content?.tasks;
   25:     if (!Array.isArray(tasks)) return old;
   26:     return {
   27:         ...old,
   28:         content: {
   29:             ...old.content,
   30:             tasks: tasks.map((tk) =>
   31:                 tk.key === issueKey || tk.id === issueKey ? { ...tk, ...patch } : tk
   32:             ),
   33:         },
   34:     };
   35: }
   36: 
   37: /** 怨꾪쉷 ?묒뾽??MD) ??Jira originalEstimate ?쒓컙(0.1h 諛섏삱由?. write 媛믨낵 ?숆? 罹먯떆媛믪쓽 ?⑥씪 異쒖쿂. */
   38: function plannedHours(md, rate) {
   39:     return md > 0 ? Math.round(md * rate * 10) / 10 : 0;
   40: }
   41: 
   42: /**
   43:  * useUpdateSchedule ??留됰? ?쒕옒洹?由ъ궗?댁쫰 ?쇱젙 write-back (M2).
   44:  *
   45:  * 怨꾩빟(짠2): invoke('updateGanttSchedule', { projectId, issueKey, start, due })
   46:  *           ??result.content = { issueKey, start, due }
   47:  *
   48:  * ?꾨왂: ?숆????낅뜲?댄듃 + ?ㅽ뙣 濡ㅻ갚.
   49:  *  - onMutate: 罹먯떆???대떦 task start/end 瑜?利됱떆 諛섏쁺 ??留됰?媛 ?쒖옄由??좎?(?꾩껜 ?ъ“??jank ?놁쓬).
   50:  *  - onSuccess: ?깃났 ?좎뒪???쒖떆(?ъ슜??寃곗젙 2026-07-02 ???몄쭛 諛섏쁺 ?몄?. ?댁쟾 'R3 臾댄넗?ㅽ듃' ?뺤콉 ?먭린).
   51:  *  - onError: 罹먯떆瑜??댁쟾 ?ㅻ깄?룹쑝濡?濡ㅻ갚 ??留됰?媛 ?먮옒 ?쇱젙?쇰줈 ?섎룎?꾧컧 + ?먮윭 ?좎뒪??
   52:  *
   53:  * M3(useSetParent/useSetLink)??愿怨??몄쭛(WBS 遺紐?+ ?좏썑??留곹겕) write-back ???꾨옒??異붽?.
   54:  */
   55: export function useUpdateSchedule({ projectId, toast }) {
   56:     const t = useI18nStore((s) => s.t);
   57:     const queryClient = useQueryClient();
   58: 
   59:     return useMutation({
   60:         mutationFn: async ({ issueKey, start, due }) => {
   61:             // ?쇱젙 write ??asUser(?쒖옉??Edit Issues, 湲고븳=Schedule Issues) ???뺤젙 嫄곕?留?李⑤떒
   62:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
   63:             if (perms.canEditIssues === false || perms.canScheduleIssues === false) {
   64:                 throw jiraPermissionError();
   65:             }
   66:             const result = await invoke('updateGanttSchedule', {
   67:                 projectId,
   68:                 issueKey,
   69:                 start,
   70:                 due,
   71:             });
   72:             // responseWrapper: { success, content|error }
   73:             if (!result || result.success !== true) {
   74:                 const err = new Error('updateGanttSchedule failed');
   75:                 err.cause = result?.error;
   76:                 throw err;
   77:             }
   78:             return result.content ?? result;
   79:         },
   80: 
   81:         // ?숆???諛섏쁺: 罹먯떆(getProjectGanttData ?묐떟)???대떦 task ?쇱젙??利됱떆 媛깆떊.
   82:         onMutate: async ({ issueKey, start, due }) => {
   83:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
   84:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
   85:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
   86:                 const tasks = old?.content?.tasks;
   87:                 if (!Array.isArray(tasks)) return old;
   88:                 return {
   89:                     ...old,
   90:                     content: {
   91:                         ...old.content,
   92:                         tasks: tasks.map((tk) =>
   93:                             tk.key === issueKey || tk.id === issueKey
   94:                                 ? { ...tk, start: start ?? null, end: due ?? null }
   95:                                 : tk
   96:                         ),
   97:                     },
   98:                 };
   99:             });
  100:             return { prev };
  101:         },
  102: 
  103:         // ?깃났 ?뚮┝ ?꾩엯(?ъ슜??寃곗젙 2026-07-02): ?몄쭛 諛섏쁺 ?щ?瑜??몄??섎룄濡?吏㏃? ?깃났 ?좎뒪??
  104:         //   (ToastFlags 2.5珥??먮룞?쒓굅 + 理쒕? 3媛????몄씠利?遺???곸쓬.)
  105:         onSuccess: () => {
  106:             // ?쒕옒洹??곕컻 吏묎퀎 ???schedule) ??諛곗쿂媛 2.5珥?紐⑥븘 1嫄댁쑝濡?flush.
  107:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.scheduleSaved'), {
  108:                 batch: 'schedule',
  109:             });
  110:         },
  111: 
  112:         onError: (err, _vars, ctx) => {
  113:             // 濡ㅻ갚 ??留됰?媛 ?먮옒 ?쇱젙?쇰줈 蹂듦?.
  114:             if (ctx?.prev !== undefined) {
  115:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  116:             }
  117:             const code = err?.cause?.code;
  118:             const message =
  119:                 code === 'GANTT_INVALID_DATE_RANGE'
  120:                     ? t('gantt.error.dateRange')
  121:                     : code === 'JIRA_PERMISSION_DENIED'
  122:                         ? t('projectDetail.issue.jiraPermission.schedule')
  123:                         : t('gantt.error.saveFailed');
  124:             toast?.showError?.(t('common.toast.title.Fail'), message);
  125:         },
  126:     });
  127: }
  128: 
  129: /**
  130:  * 愿怨??몄쭛(M3) ?먮윭肄붾뱶 ??i18n ?좎뒪??硫붿떆吏 留ㅽ븨.
  131:  * 諛깆뿏??`result.error.code`(02_backend_report.md 짠6) ??gantt.json ??C-3 ??.
  132:  * 誘몄〈?????놁쓬(?꾨? M1?먯꽌 ?앹꽦?? ??merge 遺덊븘??
  133:  */
  134: function mapRelationError(t, code) {
  135:     switch (code) {
  136:         case 'GANTT_CYCLE_DETECTED':
  137:             return t('gantt.error.cycle');
  138:         case 'GANTT_SELF_REFERENCE':
  139:             return t('gantt.error.selfRef');
  140:         case 'GANTT_CROSS_PROJECT_REF':
  141:             return t('gantt.error.crossProject');
  142:         case 'JIRA_PERMISSION_DENIED':
  143:             return t('projectDetail.issue.jiraPermission.link');
  144:         default:
  145:             return t('gantt.error.saveFailed');
  146:     }
  147: }
  148: 
  149: /**
  150:  * useSetParent ??WBS 遺紐??ъ????댁젣 write-back (M3).
  151:  *
  152:  * 怨꾩빟(짠A): invoke('setGanttParent', { projectId, issueKey, parentKey })
  153:  *           ??result.content = { issueKey, parentKey, effectiveParent }
  154:  *           parentKey=null ??WBS override ?댁젣(effectiveParent??jiraParent濡??대갚?????덉쓬, 짠D-4).
  155:  *
  156:  * ?꾨왂(짠D-3 媛쒖젙, 2026-07-02 ?ъ슜??寃곗젙: ?쒕옒洹?諛섏쓳??: **?숆? + ?대씪 ?ъ씠??媛??+ ?쒕쾭 沅뚯쐞 ?뺤젙**.
  157:  *  - onMutate: 罹먯떆 task ??wbsParent/effectiveParent 瑜?利됱떆 諛섏쁺(?쒕옒洹맞룸え??諛섏쓳??. cancelQueries + prev ?ㅻ깄??
  158:  *    ?좑툘 ?대씪 ?ъ쟾 媛?? parentKey 媛 (a) ?먭린 ?먯떊?닿굅??(b) 罹먯떆 湲곗? ?먯떊???먯넀?대㈃ onMutate ?⑥튂瑜?**?ㅽ궢**?쒕떎
  159:  *       (臾댄슚 ?몃━ ?쒓컙 ?몄텧 諛⑹? ???먮옒 ?숆????쇳뻽???댁쑀). ?쒕쾭媛 理쒖쥌 嫄곕??섎㈃ 濡ㅻ갚(?ㅻ깄??洹몃?濡쒕씪 臾댄빐).
  160:  *  - onError: prev ?ㅻ깄??濡ㅻ갚 + ?먮윭 ?좎뒪??
  161:  *  - ?좑툘 onSettled 利됱떆 invalidate ???ъ쟾???곗? ?딅뒗?? 怨쇨굅 ?깊븘??write ?쒖젅??search ?몃뜳??吏?곗쑝濡?
  162:  *    吏곹썑 ?ъ“?뚭? ??媛믪쓣 諛뺤젣?섎뒗 踰꾧렇媛 ?덉뿀怨?"?곸쐞 吏?뺥빐???섏쐞濡????ㅼ뼱媛?), ?꾨줈?쇳떚(movesRms.wbsParent)
  163:  *    ?꾪솚 ?꾩뿉???쒕쾭 ?뺤젙 ?묐떟 湲곕컲 罹먯떆 ?⑥튂媛 ?ъ“?뚮낫??鍮좊Ⅴ怨??덉쟾?섎떎(遺덊븘???꾩껜 ?ъ“???뚰뵾).
  164:  *  - onSuccess: ?쒕쾭媛 寃利????뺤젙??{ issueKey, parentKey, effectiveParent } 瑜?罹먯떆 task ??吏곸젒 ?⑥튂.
  165:  *    ?숆?媛믨낵 諛⑺뼢??媛숈븘 ?쒓컖 蹂???놁쓬. ?대뙌??toSvarTasks)媛 effectiveParent 湲곗??쇰줈 summary ?밴꺽/?몃━ 以묒꺽??
  166:  *    ?ы뙋?뺥븯誘濡??몃━媛 利됱떆 媛깆떊?쒕떎. ?꾩껜 ?щ룞湲고솕???ㅼ쓬 ?먯뿰 ?ъ“?????ъ쭊???덈줈怨좎묠) ???몃뜳???곕씪?≪? ?ㅻ씪 ?덉쟾.
  167:  *  - onSuccess: ?깃났 ?좎뒪???쒖떆(2026-07-02, parentKey null ?щ?濡?蹂寃??댁젣 遺꾧린). ?ㅽ뙣 ?좎뒪?몃룄 ?좎?.
  168:  */
  169: export function useSetParent({ projectId, toast }) {
  170:     const t = useI18nStore((s) => s.t);
  171:     const queryClient = useQueryClient();
  172: 
  173:     return useMutation({
  174:         mutationFn: async ({ issueKey, parentKey }) => {
  175:             const result = await invoke('setGanttParent', {
  176:                 projectId,
  177:                 issueKey,
  178:                 parentKey,
  179:             });
  180:             // responseWrapper: { success, content|error }
  181:             if (!result || result.success !== true) {
  182:                 const err = new Error('setGanttParent failed');
  183:                 err.cause = result?.error;
  184:                 throw err;
  185:             }
  186:             return result.content ?? result;
  187:         },
  188: 
  189:         // ?숆? ?⑥튂(2026-07-02): ?쒕옒洹?紐⑤떖 利됱떆 諛섏쁺. 臾댄슚(?먭린/?먯넀) 吏?뺤? ?⑥튂 ?ㅽ궢(?쒕쾭媛 理쒖쥌 嫄곕?).
  190:         onMutate: async ({ issueKey, parentKey }) => {
  191:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  192:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  193: 
  194:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  195:                 const tasks = old?.content?.tasks;
  196:                 if (!Array.isArray(tasks)) return old;
  197: 
  198:                 // ?대씪 ?ъ씠??媛?? parentKey 媛 ?먭린 ?먯떊 or ?먯떊???먯넀?대㈃ ?숆? ?⑥튂 ?ㅽ궢.
  199:                 if (parentKey != null) {
  200:                     if (parentKey === issueKey) return old; // ?먭린李몄“
  201:                     // effectiveParent 泥댁씤?쇰줈 ?먯넀 吏묓빀 ?섏쭛(?먯떇??..?뭝ssueKey 瑜?議곗긽?쇰줈 媛뽯뒗 ?몃뱶).
  202:                     const childrenOf = new Map();
  203:                     for (const tk of tasks) {
  204:                         const p = tk.effectiveParent;
  205:                         if (p != null) {
  206:                             if (!childrenOf.has(p)) childrenOf.set(p, []);
  207:                             childrenOf.get(p).push(tk.key ?? tk.id);
  208:                         }
  209:                     }
  210:                     const descendants = new Set();
  211:                     const stack = [issueKey];
  212:                     while (stack.length) {
  213:                         const cur = stack.pop();
  214:                         for (const c of childrenOf.get(cur) || []) {
  215:                             if (!descendants.has(c)) {
  216:                                 descendants.add(c);
  217:                                 stack.push(c);
  218:                             }
  219:                         }
  220:                     }
  221:                     if (descendants.has(parentKey)) return old; // ?먯넀??遺紐⑤줈 ???ㅽ궢
  222:                 }
  223: 
  224:                 // effectiveParent ?숆?媛? parentKey ?덉쑝硫?洹몃?濡?
  225:                 //   ?댁젣(null)硫?jiraParent 媛 罹먯떆 吏묓빀???덉쑝硫?洹멸쾬?쇰줈 ?대갚(짠D-4), ?놁쑝硫?null.
  226:                 const keySet = new Set(tasks.map((tk) => tk.key ?? tk.id));
  227:                 return {
  228:                     ...old,
  229:                     content: {
  230:                         ...old.content,
  231:                         tasks: tasks.map((tk) => {
  232:                             if (tk.key !== issueKey && tk.id !== issueKey) return tk;
  233:                             let effectiveParent;
  234:                             if (parentKey != null) {
  235:                                 effectiveParent = parentKey;
  236:                             } else {
  237:                                 effectiveParent =
  238:                                     tk.jiraParent && keySet.has(tk.jiraParent)
  239:                                         ? tk.jiraParent
  240:                                         : null;
  241:                             }
  242:                             return { ...tk, wbsParent: parentKey ?? null, effectiveParent };
  243:                         }),
  244:                     },
  245:                 };
  246:             });
  247: 
  248:             return { prev };
  249:         },
  250: 
  251:         onSuccess: (data, variables) => {
  252:             if (data?.issueKey) {
  253:                 queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  254:                     const tasks = old?.content?.tasks;
  255:                     if (!Array.isArray(tasks)) return old;
  256:                     return {
  257:                         ...old,
  258:                         content: {
  259:                             ...old.content,
  260:                             tasks: tasks.map((tk) =>
  261:                                 tk.key === data.issueKey || tk.id === data.issueKey
  262:                                     ? {
  263:                                           ...tk,
  264:                                           wbsParent: data.parentKey ?? null,
  265:                                           effectiveParent: data.effectiveParent ?? null,
  266:                                       }
  267:                                     : tk
  268:                             ),
  269:                         },
  270:                     };
  271:                 });
  272:             }
  273:             // ?깃났 ?뚮┝(2026-07-02): parentKey null ?щ?濡?蹂寃??댁젣 遺꾧린.
  274:             const msg =
  275:                 variables?.parentKey == null
  276:                     ? t('gantt.toast.parentCleared')
  277:                     : t('gantt.toast.parentSaved');
  278:             // ?쒕옒洹?move-task) ?곸쐞 吏??吏묎퀎 ???parent).
  279:             toast?.showSuccess?.(t('common.toast.title.success'), msg, { batch: 'parent' });
  280:         },
  281: 
  282:         onError: (err, _vars, ctx) => {
  283:             // ?숆? ?⑥튂 濡ㅻ갚 ???쒕쾭 嫄곕?(?ъ씠???? ???먮옒 ?몃━濡?蹂듦?.
  284:             if (ctx?.prev !== undefined) {
  285:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  286:             }
  287:             const message = mapRelationError(t, err?.cause?.code);
  288:             toast?.showError?.(t('common.toast.title.Fail'), message);
  289:         },
  290:     });
  291: }
  292: 
  293: /**
  294:  * useSetLink ???좏썑???섏〈??留곹겕 add/remove write-back (M3).
  295:  *
  296:  * 怨꾩빟(짠A): invoke('setGanttLink', { projectId, op:'add'|'remove', source, target, type:'FS', lag:0 })
  297:  *           ??result.content = { target, predecessors:[Link] }  // Link = read links? 1:1 ?숈씪 shape
  298:  *
  299:  * ?꾨왂: **?숆????낅뜲?댄듃 + ?쒕쾭?묐떟 ?ъ“??+ ?ㅽ뙣 濡ㅻ갚**.
  300:  *  - onMutate: 罹먯떆(content.links)??留곹겕瑜?利됱떆 add/remove ???붿궡?쒓? 諛붾줈 洹몃젮吏??щ씪吏?吏??0).
  301:  *    諛⑺뼢? SVAR/?쒕쾭? ?숈씪(swap ?놁쓬)?대씪 SVAR ?대? 留곹겕? ?닿툔?섏? ?딆쓬 ??源쒕묀???놁쓬.
  302:  *  - onSuccess: ?쒕쾭 ?뺤젙 ?묐떟(predecessors)?쇰줈 ?대떦 target 留곹겕瑜??ъ“??吏곷젹 ?쒖꽌 ???쒕쾭 沅뚯쐞 諛섏쁺).
  303:  *    ?숆?媛믨낵 諛⑺뼢??媛숈븘 ?쒓컖??蹂???놁쓬. ?꾩껜 ?ъ“??invalidate) ??????鍮좊쫫.
  304:  *  - onError: ?댁쟾 ?ㅻ깄?룹쑝濡?濡ㅻ갚(?ъ씠??self/援먯감 嫄곕? ??洹몃졇?????쒓굅) + ?먮윭 ?좎뒪??
  305:  *  type/lag??MVP?먯꽌 'FS'/0 怨좎젙.
  306:  */
  307: export function useSetLink({ projectId, toast }) {
  308:     const t = useI18nStore((s) => s.t);
  309:     const queryClient = useQueryClient();
  310: 
  311:     return useMutation({
  312:         mutationFn: async ({ op, source, target, type = 'FS', lag = 0 }) => {
  313:             // ?좏썑??留곹겕???ㅼ씠?곕툕 ?댁뒋 留곹겕 asUser write ??Link Issues 沅뚰븳 ?뺤젙 嫄곕?留?李⑤떒
  314:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(source) || projectKeyOfIssue(target));
  315:             if (perms.canLinkIssues === false) throw jiraPermissionError();
  316:             const result = await invoke('setGanttLink', {
  317:                 projectId,
  318:                 op,
  319:                 source,
  320:                 target,
  321:                 type,
  322:                 lag,
  323:             });
  324:             if (!result || result.success !== true) {
  325:                 const err = new Error('setGanttLink failed');
  326:                 err.cause = result?.error;
  327:                 throw err;
  328:             }
  329:             return result.content ?? result;
  330:         },
  331: 
  332:         // 利됱떆 諛섏쁺(吏??0): read link ? 1:1 ?숈씪 shape(id='source->target', type:'FS', lag:0).
  333:         onMutate: async ({ op, source, target }) => {
  334:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  335:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  336:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  337:                 const links = old?.content?.links;
  338:                 if (!Array.isArray(links)) return old;
  339:                 let nextLinks;
  340:                 if (op === 'add') {
  341:                     if (links.some((l) => l.source === source && l.target === target)) return old; // 以묐났 諛⑹?
  342:                     nextLinks = [...links, { id: `${source}->${target}`, source, target, type: 'FS', lag: 0 }];
  343:                 } else {
  344:                     nextLinks = links.filter((l) => !(l.source === source && l.target === target));
  345:                 }
  346:                 return { ...old, content: { ...old.content, links: nextLinks } };
  347:             });
  348:             return { prev };
  349:         },
  350: 
  351:         // ?쒕쾭 ?뺤젙 ?묐떟?쇰줈 ?대떦 target ??incoming 留곹겕留??ъ“???숆?媛믨낵 諛⑺뼢 ?숈씪 ??臾대???.
  352:         onSuccess: (data, variables) => {
  353:             if (data?.target) {
  354:                 queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  355:                     const links = old?.content?.links;
  356:                     if (!Array.isArray(links)) return old;
  357:                     const preds = Array.isArray(data.predecessors) ? data.predecessors : [];
  358:                     const others = links.filter((l) => l.target !== data.target);
  359:                     return { ...old, content: { ...old.content, links: [...others, ...preds] } };
  360:                 });
  361:             }
  362:             // ?깃났 ?뚮┝(2026-07-02): op 濡?異붽?/??젣 遺꾧린.
  363:             const msg =
  364:                 variables?.op === 'remove'
  365:                     ? t('gantt.toast.linkRemoved')
  366:                     : t('gantt.toast.linkAdded');
  367:             // 留곹겕 ?쒕옒洹??곕컻 吏묎퀎 ???link).
  368:             toast?.showSuccess?.(t('common.toast.title.success'), msg, { batch: 'link' });
  369:         },
  370: 
  371:         onError: (err, _vars, ctx) => {
  372:             // 濡ㅻ갚 ???숆??곸쑝濡?洹몃졇??吏?좊뜕 ?좎쓣 ?먯긽 蹂듦뎄.
  373:             if (ctx?.prev !== undefined) {
  374:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  375:             }
  376:             const message = mapRelationError(t, err?.cause?.code);
  377:             toast?.showError?.(t('common.toast.title.Fail'), message);
  378:         },
  379:     });
  380: }
  381: 
  382: /**
  383:  * useUpdateAssignee ??洹몃━???대떦???몃씪???몄쭛 write-back.
  384:  *
  385:  * 寃쎈줈: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 吏곸젒 ?몄텧, ProjectIssueTable.assignIssue ?숈씪)
  386:  * ?꾨왂: useUpdateSchedule ?⑦꽩 ???숆? ?⑥튂(task.assignee 援먯껜) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  387:  *       ?깃났 ?좎뒪???쒖떆(2026-07-02), ?ㅽ뙣??gantt.error.saveFailed.
  388:  *
  389:  * ?좑툘 怨쇨굅 onSettled invalidate("shape ?덉쟾留?)???쒓굅?덈떎(2026-08-12): ganttKeys.data ??
  390:  *    ?꾨줈?앺듃 ?댁뒋瑜?JQL 濡??꾨웾 ?섏씠吏??섏쭛?섎뒗 理쒓퀬鍮꾩슜 resolver ??? ?몄쭛 1?뚮떦 ?꾨웾 ?ъ“?뚭? 遺숈뿀怨?
  391:  *    JQL ?ъ“?뚮뒗 write 吏곹썑 ?몃뜳??吏?곗쑝濡???媛믪쓣 ?뚮젮以????덈떎(짠6 / CLAUDE.md).
  392:  *    ?숆? ?⑥튂媛 ?대? gantt 怨꾩빟 shape({accountId, displayName, avatarUrl})?쇰줈 ?뺢퇋?뷀븯誘濡??덉쟾留앸룄 遺덊븘?뷀븯??
  393:  *    ?꾩껜 ?щ룞湲고솕???ㅼ쓬 ?먯뿰 ?ъ“?????ъ쭊???덈줈怨좎묠) ??useSetParent/useSetLink ? ?숈씪 ?뺤콉.
  394:  *
  395:  * mutate ?몄옄: { issueKey, accountId(string|null), assigneeObj }
  396:  *  - assigneeObj: ?좏깮 ?듭뀡 value({ accountId, displayName, avatarUrls }) ???숆? ?쒖떆??gantt 怨꾩빟 assignee shape 濡?留ㅽ븨).
  397:  */
  398: export function useUpdateAssignee({ projectId, toast }) {
  399:     const t = useI18nStore((s) => s.t);
  400:     const queryClient = useQueryClient();
  401: 
  402:     return useMutation({
  403:         mutationFn: async ({ issueKey, accountId }) => {
  404:             // ?대떦??吏?뺤? asUser ??Assign Issues 沅뚰븳 ?뺤젙 嫄곕?留?李⑤떒
  405:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
  406:             if (perms.canAssignIssues === false) throw jiraPermissionError();
  407:             const result = await executeRequest(
  408:                 'assignIssue',
  409:                 { accountId: accountId || null },
  410:                 { issueIdOrKey: issueKey }
  411:             );
  412:             // executeRequest: ?깃났 ??'' ?먮뒗 JSON, ?ㅽ뙣 ??{ success:false, error }.
  413:             if (result && result.success === false) {
  414:                 const err = new Error('assignIssue failed');
  415:                 err.cause = result.error;
  416:                 throw err;
  417:             }
  418:             return result;
  419:         },
  420: 
  421:         onMutate: async ({ issueKey, accountId, assigneeObj }) => {
  422:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  423:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  424:             // gantt 怨꾩빟 assignee shape({ accountId, displayName, avatarUrl }) 濡?留ㅽ븨(?놁쑝硫??댁젣=null).
  425:             const nextAssignee =
  426:                 accountId && assigneeObj
  427:                     ? {
  428:                           accountId: assigneeObj.accountId ?? accountId,
  429:                           displayName: assigneeObj.displayName ?? null,
  430:                           avatarUrl: assigneeObj.avatarUrls?.['24x24'] ?? null,
  431:                       }
  432:                     : null;
  433:             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
  434:                 patchTask(old, issueKey, { assignee: nextAssignee })
  435:             );
  436:             return { prev };
  437:         },
  438: 
  439:         onSuccess: () => {
  440:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.assigneeSaved'));
  441:         },
  442: 
  443:         onError: (err, _vars, ctx) => {
  444:             if (ctx?.prev !== undefined) {
  445:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  446:             }
  447:             const message = err?.cause?.code === 'JIRA_PERMISSION_DENIED'
  448:                 ? t('projectDetail.issue.jiraPermission.assign')
  449:                 : t('gantt.error.saveFailed');
  450:             toast?.showError?.(t('common.toast.title.Fail'), message);
  451:         },
  452:     });
  453: }
  454: 
  455: /**
  456:  * useUpdateCoworkers ??洹몃━???묒뾽???ㅼ쨷) ?몃씪???몄쭛 write-back.
  457:  *
  458:  * 寃쎈줈: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker ?숈씪)
  459:  *  - customFieldId(coworkerFieldId)??useGanttData 媛 梨꾩슫 ['coworkerFieldId'] 荑쇰━ 罹먯떆瑜?怨듭쑀.
  460:  *  - issueId ???レ옄 Jira id(string) ??Task.issueId(?좉퇋 ?꾨뱶).
  461:  * ?꾨왂: ?숆? ?⑥튂(task.coworkers 援먯껜) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  462:  *
  463:  * ?좑툘 怨쇨굅 onSettled invalidate ??**洹쒖빟 ?꾨컲**?대씪 ?쒓굅?덈떎(2026-08-12). ???낆쓽 write 寃쎈줈
  464:  *    (updateProjectIdField ??setAppFieldValueForIssues)??**??而ㅼ뒪??꾨뱶 write** ?닿퀬,
  465:  *    ganttKeys.data ?ъ“?뚮뒗 JQL search ????write 吏곹썑 search ???몃뜳??吏?곗쑝濡???媛믪쓣 ?뚮젮二쇨퀬
  466:  *    洹?媛믪씠 staleTime 罹먯떆??諛뺤젣?쒕떎(짠6 ?똷rite 吏곹썑 search ?ъ“??湲덉??? CLAUDE.md).
  467:  *    ?숆? ?⑥튂媛 罹먯떆??理쒖쥌 ?곹깭?? user 媛앹껜??select ?듭뀡 value({accountId, displayName,
  468:  *    avatarUrls:{'24x24'}})濡?AvatarStack ???쎈뒗 ?ㅻ? 紐⑤몢 媛뽰텣???쒕쾭 shape 怨??뚮뜑 ?숇벑).
  469:  *
  470:  * mutate ?몄옄: { issueId, accountIds(string[]), coworkers }  (coworkers=?좏깮 ?듭뀡 value 諛곗뿴, ?숆? ?쒖떆??
  471:  */
  472: export function useUpdateCoworkers({ projectId, toast }) {
  473:     const t = useI18nStore((s) => s.t);
  474:     const queryClient = useQueryClient();
  475: 
  476:     return useMutation({
  477:         mutationFn: async ({ issueId, accountIds }) => {
  478:             const customFieldId = queryClient.getQueryData(jiraKeys.coworkerField());
  479:             const result = await invoke('updateProjectIdField', {
  480:                 issueId,
  481:                 value: Array.isArray(accountIds) ? accountIds : [],
  482:                 customFieldId,
  483:             });
  484:             if (!result || result.success !== true) {
  485:                 const err = new Error('updateProjectIdField failed');
  486:                 err.cause = result?.error;
  487:                 throw err;
  488:             }
  489:             return result.content ?? result;
  490:         },
  491: 
  492:         // ?숆?: task.coworkers 瑜??좏깮??user 媛앹껜 諛곗뿴濡?援먯껜(issueId 濡?留ㅼ묶 ??Task.issueId).
  493:         onMutate: async ({ issueId, coworkers }) => {
  494:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  495:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  496:             const nextCoworkers = Array.isArray(coworkers) ? coworkers : [];
  497:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  498:                 const tasks = old?.content?.tasks;
  499:                 if (!Array.isArray(tasks)) return old;
  500:                 return {
  501:                     ...old,
  502:                     content: {
  503:                         ...old.content,
  504:                         tasks: tasks.map((tk) =>
  505:                             tk.issueId === issueId ? { ...tk, coworkers: nextCoworkers } : tk
  506:                         ),
  507:                     },
  508:                 };
  509:             });
  510:             return { prev };
  511:         },
  512: 
  513:         onSuccess: () => {
  514:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.coworkerSaved'));
  515:         },
  516: 
  517:         onError: (_err, _vars, ctx) => {
  518:             if (ctx?.prev !== undefined) {
  519:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  520:             }
  521:             toast?.showError?.(t('common.toast.title.Fail'), t('gantt.error.saveFailed'));
  522:         },
  523:     });
  524: }
  525: 
  526: /**
  527:  * useUpdatePlannedMd ??洹몃━??"怨꾪쉷 ?묒뾽??(MD) ?몃씪???몄쭛 write-back.
  528:  *
  529:  * 寃쎈줈: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD ?숈씪)
  530:  *  - originalEstimate = `${plannedHours(md, hourRate)}h`
  531:  * ?꾨왂: ?숆? ?⑥튂(task.originalEstimateSeconds) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  532:  *
  533:  * ?좑툘 怨쇨굅 onSettled invalidate ???쒓굅?덈떎(2026-08-12) ??? ?몄쭛 1?뚮떦 理쒓퀬鍮꾩슜 resolver ?꾨웾 ?ъ“?뚯?怨?
  534:  *    JQL ?ъ“?뚮뒗 write 吏곹썑 ?몃뜳??吏???꾪뿕???덈떎(짠6). ????숆?媛믪쓣 **?ㅼ젣濡?write ?섎뒗 ?쒓컙媛?*?먯꽌
  535:  *    ??궛??plannedHours) 罹먯떆? ?쒕쾭 ?곹깭媛 ?닿툔?섏? ?딄쾶 ?쒕떎 ???닿쾬????invalidate ????븷?댁뿀??
  536:  *    (泥섎━??aggregate ?뚯깮媛믪? ?쒕쾭 ?ш퀎?곗씠???ㅼ쓬 ?먯뿰 ?ъ“?뚯뿉???곕씪?⑤떎.)
  537:  *
  538:  * mutate ?몄옄: { issueKey, md(number) }
  539:  */
  540: export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
  541:     const t = useI18nStore((s) => s.t);
  542:     const queryClient = useQueryClient();
  543:     const rate = hourRate > 0 ? hourRate : 8;
  544: 
  545:     return useMutation({
  546:         mutationFn: async ({ issueKey, md }) => {
  547:             // ?쒓컙 異붿쟻 媛???щ????ъ쟾 ?먯젙?섏? ?딅뒗??editmeta ?섑뵆 ?먯젙???ㅽ깘) ??
  548:             // ?ㅼ젣 400(timetracking) ?ㅽ뙣瑜?onError ?먯꽌 ?덈궡濡?留ㅽ븨.
  549:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
  550:             if (perms.canEditIssues === false) throw jiraPermissionError();
  551:             const originalEstimate = `${plannedHours(md, rate)}h`;
  552:             // 湲곗〈 remaining 議고쉶 ???④퍡 ?꾩넚 ???섏젙 ??remaining 誘몃룞遊됱씠硫?Jira 寃利?400
  553:             // (Task ?먮뒗 remaining ???놁뼱 ?④굔 GET 1?? buildTimetrackingPayload 李몄“)
  554:             const cur = await executeRequest('getIssue', { fields: 'timetracking' }, { issueIdOrKey: issueKey });
  555:             const remainingSeconds = cur?.fields?.timetracking?.remainingEstimateSeconds ?? null;
  556:             const result = await executeRequest(
  557:                 'updateIssue',
  558:                 { fields: { timetracking: buildTimetrackingPayload(originalEstimate, remainingSeconds) } },
  559:                 { issueIdOrKey: issueKey }
  560:             );
  561:             if (result && result.success === false) {
  562:                 const err = new Error('updateIssue(timetracking) failed');
  563:                 err.cause = result.error;
  564:                 throw err;
  565:             }
  566:             return result;
  567:         },
  568: 
  569:         onMutate: async ({ issueKey, md }) => {
  570:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  571:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  572:             // ?숆?媛믪? write ?섎뒗 ?쒓컙媛?0.1h 諛섏삱由??먯꽌 ??궛 ??罹먯떆媛 ?쒕쾭 ??κ컪怨?媛숈? ?섎? 媛뽯뒗??
  573:             const seconds = Math.round(plannedHours(md, rate) * 3600);
  574:             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
  575:                 patchTask(old, issueKey, { originalEstimateSeconds: seconds })
  576:             );
  577:             return { prev };
  578:         },
  579: 
  580:         onSuccess: () => {
  581:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.plannedMdSaved'));
  582:         },
  583: 
  584:         onError: (err, _vars, ctx) => {
  585:             if (ctx?.prev !== undefined) {
  586:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  587:             }
  588:             const code = err?.cause?.code;
  589:             // ?ㅼ젣 400 ?묐떟(timetracking ?몄쭛 遺덇?)留??쒓컙 異붿쟻 ?덈궡濡?留ㅽ븨 ???쒕룄 湲곕컲?대씪 ?ㅽ깘 ?놁쓬
  590:             const message =
  591:                 isTimeTrackingUnsupportedError(err)
  592:                     ? t('projectDetail.issue.timeTracking.disabled')
  593:                     : code === 'JIRA_PERMISSION_DENIED'
  594:                         ? t('projectDetail.issue.jiraPermission.edit')
  595:                         : t('gantt.error.saveFailed');
  596:             toast?.showError?.(t('common.toast.title.Fail'), message);
  597:         },
  598:     });
  599: }

--- static/ui/src/pages/resource/ResourcePage.jsx ---
    1: import React from 'react';
    2: import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
    3: import { useI18nStore } from '../../stores/useI18nStore';
    4: import { usePermissionStore } from '../../stores/usePermissionStore';
    5: import NoPermissionPage from '../nonPermission/NoPermissionPage';
    6: import PageContainer from '../../components/layout/PageContainer';
    7: import ResourceOverviewTab from './overview/ResourceOverviewTab';
    8: import OrganizationTab from './organization/OrganizationTab';
    9: import ProjectAssignmentBoard from './assignment/ProjectAssignmentBoard';
   10: import TeamAnalyticsTab from './teamAnalytics/TeamAnalyticsTab';
   11: 
   12: /**
   13:  * ?먯썝愿由??섏씠吏 ??/resource. canRead('RESOURCE_MANAGEMENT') 寃뚯씠??
   14:  * 濡쒖뺄 ??4媛??몃젰 ?꾪솴 / 議곗쭅 ?꾪솴 / **? 遺꾩꽍** / ?꾨줈?앺듃 諛곗젙 ??醫뚯슦 2遺꾪븷 諛곗젙 蹂대뱶).
   15:  *
   16:  * 議곗쭅 ?꾪솴쨌? 遺꾩꽍? ?몃젰 ?꾪솴怨?**媛숈? 荑쇰━(`getResourceOverview`)瑜?怨듭쑀**?쒕떎 ??
   17:  * ???꾪솚???ㅽ듃?뚰겕媛 諛쒖깮?섏? ?딅뒗?? ?섏씠吏 寃뚯씠?몃룄 ????怨노퓧?대떎.
   18:  *
   19:  * ?? ??留덉슫?? ?섎룞 lazy 寃뚯씠?몃? ?먯? ?딅뒗??????????????????????????????????
   20:  * `TabPanel` ?먯껜??children ??臾댁“嫄??뚮뜑?섏?留? ?곸쐞 `Tabs`(@atlaskit/tabs 18.3.4)媛
   21:  * **諛⑸Ц??visited) ?⑤꼸留?* ?뚮뜑?섍퀬 諛⑸Ц ?꾩뿉???몃쭏?댄듃?섏? ?딅뒗??
   22:  * (`dist/esm/components/tabs.js` ??`Array.from(visited.current).map(...)`).
   23:  * 利?吏꾩엯 ???④? ??? 遺꾩꽍쨌?꾨줈?앺듃 諛곗젙)????invoke ???ㅽ뻾?섏? ?딄퀬,
   24:  * ??踰?????쓽 ?⑤꼸 ?곹깭(ResizablePanels ????쨌?ㅽ겕濡ㅼ? ?꾪솚?대룄 蹂댁〈?쒕떎.
   25:  * ???꾩젣??`__test__/resourceTabsLazyMount.test.js` 媛 怨좎젙?쒕떎 ???ш린??`selected`/`visited` 瑜?
   26:  * ?먯쑝濡??ㅼ떆 援ы쁽?섎㈃ ?쇱씠釉뚮윭由??숈옉怨?以묐났?섍퀬 議곌굔遺 ??쓽 ?몃뜳???뺣젹留?源⑥쭊??
   27:  *
   28:  * ?? ?뵶 ? 遺꾩꽍 ??쭔 異붽? 議곌굔???덈떎 (team-analytics 짠5-1) ???????????????????
   29:  * `teamAnalyticsScope === 'NONE'` ?대㈃ **???먯껜瑜??댁? ?딅뒗??** ?쒕쾭媛 ?먯젙??媛?
   30:  * (`userPermissionCheck.team.teamAnalyticsScope`)??洹몃?濡??쎌쓣 肉??꾨줎?멸? ?ы뙋?뺥븯吏 ?딅뒗??
   31:  *
   32:  * ??**??媛??⑤룆?쇰줈 寃뚯씠?낇븯??寃껋씠 ?꾨땲??** ??`canRead('RESOURCE_MANAGEMENT')` 瑜??듦낵?댁빞
   33:  *   ??吏?먯뿉 ?꾨떖?섎?濡??ㅽ슚 寃뚯씠?몃뒗 ??議곌굔??AND ?? `getTeamAnalyticsScope` ??grant ??
   34:  *   `RESOURCE_MANAGEMENT read` 媛 ?ы븿???덉뼱(PermissionMap) "??? 蹂댁씠?붾뜲 resolver ??嫄곕?"媛
   35:  *   ?앷린吏 ?딅뒗??諛깆뿏??由ы룷??짠3-4 ??鍮꾨?移??뚰뵾 議곌굔).
   36:  */
   37: export default function ResourcePage() {
   38:     const t = useI18nStore(s => s.t);
   39:     const canRead = usePermissionStore(s => s.canRead('RESOURCE_MANAGEMENT'));
   40:     const teamAnalyticsScope = usePermissionStore(s => s.getTeamAnalyticsScope());
   41: 
   42:     if (!canRead) {
   43:         return <NoPermissionPage />;
   44:     }
   45: 
   46:     const showTeamAnalytics = teamAnalyticsScope !== 'NONE';
   47: 
   48:     return (
   49:         <PageContainer
   50:             title={t('resource.page.title')}
   51:             description={t('resource.page.description')}
   52:         >
   53:             <Tabs id="resource-tabs">
   54:                 <TabList>
   55:                     <Tab>{t('resource.tab.overview')}</Tab>
   56:                     <Tab>{t('resource.tab.organization')}</Tab>
   57:                     {/* ?뵶 Tab 怨?TabPanel ? 媛쒖닔媛 留욎븘???쒕떎 ????怨녹쓣 媛숈? 議곌굔?쇰줈 ?몃떎 */}
   58:                     {showTeamAnalytics && <Tab>{t('resource.tab.teamAnalytics')}</Tab>}
   59:                     <Tab>{t('resource.tab.assignment')}</Tab>
   60:                 </TabList>
   61:                 <TabPanel>
   62:                     <div style={{ width: '100%', paddingTop: 16 }}>
   63:                         <ResourceOverviewTab />
   64:                     </div>
   65:                 </TabPanel>
   66:                 <TabPanel>
   67:                     <div style={{ width: '100%', paddingTop: 16 }}>
   68:                         <OrganizationTab />
   69:                     </div>
   70:                 </TabPanel>
   71:                 {showTeamAnalytics && (
   72:                     <TabPanel>
   73:                         <div style={{ width: '100%', paddingTop: 16 }}>
   74:                             <TeamAnalyticsTab />
   75:                         </div>
   76:                     </TabPanel>
   77:                 )}
   78:                 <TabPanel>
   79:                     <div style={{ width: '100%', paddingTop: 16 }}>
   80:                         <ProjectAssignmentBoard />
   81:                     </div>
   82:                 </TabPanel>
   83:             </Tabs>
   84:         </PageContainer>
   85:     );
   86: }

--- static/ui/src/pages/projectDetail/work/WORK_VIEWS.md ---
    1: # ?묒뾽愿由???酉??꾪솚 ??쨌 ?몃━ 酉??ㅺ퀎/援ъ“ 臾몄꽌
    2: 
    3: ?꾨줈?앺듃 ?곸꽭 **?묒뾽愿由???*(`/project/:id` ???묒뾽愿由???酉??꾪솚 ?멸낵 **?몃━ 酉?*瑜??ㅻ，??
    4: 媛꾪듃 酉곗쓽 ?곗씠??紐⑤뜽쨌???諛⑹떇쨌?뚮뜑 ?⑥젙? 蹂꾨룄 臾몄꽌(`src/resolver/gantt/GANTT.md`)???덇퀬, ?ш린?쒕뒗 諛섎났?섏? ?딅뒗??
    5: 
    6: - 肄붾뱶: `static/ui/src/pages/projectDetail/work/`
    7: - 媛꾪듃 肄붾뱶: `static/ui/src/pages/projectDetail/gantt/` (?몃━媛 ?곗씠?걔룻썒쨌紐⑤떖???ъ궗??
    8: - 諛깆뿏?? `src/resolver/gantt/` (?몃━ **?꾩슜 諛깆뿏?쒕뒗 ?녿떎** ???꾨옒 짠2)
    9: 
   10: > ?꾪뻾??湲곗?: 2026-08-10 / ?뚯뒪 `f6e521c`
   11: 
   12: ---
   13: 
   14: ## 1. ??酉곗쓽 愿怨?(ProjectWorkPanel)
   15: 
   16: ?묒뾽愿由???? **媛숈? ?묒뾽(?댁뒋) 吏묓빀????媛吏 諛⑹떇?쇰줈 蹂대뒗 酉??꾪솚 洹몃９**?대떎(2026-07-22 ?ы렪, ?댁쟾??蹂꾨룄 ??.
   17: 
   18: | 酉?| 而댄룷?뚰듃 | ?곗씠???뚯뒪 | ?깃꺽 |
   19: |----|----------|-------------|------|
   20: | `table` (湲곕낯) | `../issue/ProjectIssuePanel` | ?쒕쾭 JQL(`ProjectFilter`) | 紐⑸줉 議고쉶쨌?댁뒋 異붽? |
   21: | `tree` | `ProjectTreeView` (lazy) | `getProjectGanttData` | 怨꾩링 援ъ“ + ?몃뱶 ?곸꽭/?몄쭛 |
   22: | `gantt` | `../gantt/GanttPage` (lazy) | `getProjectGanttData` | ??꾨씪??+ ?쇱젙/愿怨??몄쭛 |
   23: 
   24: ### 1-1. 肄붾뱶 ?ㅽ뵆由ы똿 ?꾩젣 (源⑤쑉由щ㈃ ?붾㈃ ?꾩껜媛 二쎈뒗??
   25: 
   26: - 泥?酉?`table`)??**?뺤쟻 import**, ?몃━쨌媛꾪듃??`React.lazy`. 媛꾪듃??`@svar-ui/react-gantt`瑜??듭㎏濡??뚭퀬 ?ㅻ?濡?遺꾨━ ?대뱷???щ떎.
   27: - lazy 酉곕뒗 諛섎뱶??`ProjectWorkPanel` ?대???**Suspense 寃쎄퀎 ?꾨옒**???덉뼱???쒕떎. 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426.
   28:   猷⑦듃 `index.js`媛 `ReactDOM.render`(legacy)??`startTransition`쨌`isPending`? 臾댄슚 ??#426? Suspense 寃쎄퀎濡쒕쭔 留됲엺??
   29: 
   30: ### 1-2. ?꾪꽣 怨듭쑀 洹쒖튃
   31: 
   32: ??`ProjectWorkPanel`)??**?대떦??/ ?곹깭 / Jira ?꾨줈?앺듃(?ㅽ럹?댁뒪)** ?꾪꽣瑜??뚯쑀??`tree ??gantt` ?ъ씠?먯꽌留?怨듭쑀?쒕떎.
   33: 
   34: - 怨듭쑀?섎뒗 ?댁쑀: ??酉곌? **媛숈? ?곗씠???뚯뒪**??"???대떦?먯쓽 ?묒뾽留? 蹂대뜕 留λ씫??酉곕? 諛붽퓭???좎??쇱빞 ?쒕떎.
   35: - `table`???쒖쇅?섎뒗 ?댁쑀: ?쒕쾭 JQL 湲곕컲?대씪 ?꾪꽣 異??먯껜媛 ?ㅻⅤ???먯껜 ?곹깭 ?좎?).
   36: - `GanttPage`??`filter` prop 誘몄＜????濡쒖뺄 state 濡??숈옉?쒕떎 ????諛??⑤룆 ?ъ슜 ?섏쐞?명솚.
   37: 
   38: ```js
   39: <GanttPage filter={{ assignees, statuses, setAssignees, setStatuses,
   40:                      projectKeys, onProjectToggle, onProjectClear }} />
   41: ```
   42: 
   43: ### 1-3. 沅뚰븳
   44: 
   45: - ?몃━쨌媛꾪듃 ????`getProjectGanttData`(?쒕쾭 `R('PROJECT','detail')`)瑜??곕?濡?**媛숈? 寃뚯씠??*瑜??곸슜?쒕떎.
   46:   (2026-07-23 媛꾪듃 沅뚰븳 ?듯빀: `PROJECT_GANTT` ??`PROJECT`. ?꾨줈?앺듃 ?곸꽭 read 硫??몃━/媛꾪듃 議고쉶 媛??
   47: - 沅뚰븳 ?녿뒗 酉곕뒗 ?좉? ??ぉ?먯꽌 鍮쇨퀬, ?⑤뒗 ??ぉ???섎굹肉먯씠硫?**?좉? ?먯껜瑜?媛먯텣??* ???좏깮吏 ?섎굹吏쒕━ ?꾪솚 UI ??怨좎옣泥섎읆 蹂댁씤??
   48: - 沅뚰븳??鍮좎졇 ?꾩옱 酉곌? ?좏깮 遺덇?媛 ?섎㈃ 泥?酉곕줈 ?섎룎由곕떎(鍮??붾㈃ 諛⑹?).
   49: - ?곌린??`canWrite('PROJECT')`. ?몃━?먯꽌??DnD쨌紐⑤떖 吏꾩엯쨌?몃씪???몄쭛 ?몄텧???꾨? ??媛믪뿉 嫄몃┛??
   50: 
   51: ---
   52: 
   53: ## 2. ?몃━ 酉곕뒗 諛깆뿏?쒓? ?녿떎 (?듭떖 ?먯튃)
   54: 
   55: ?몃━ 酉곕뒗 **?꾩슜 resolver 瑜?留뚮뱾吏 ?딅뒗??** ?쎄린??`useGanttData`(= `getProjectGanttData`), ?곌린??媛꾪듃??mutation ?낆쓣 **洹몃?濡?* ?몄텧?쒕떎.
   56: 
   57: ```
   58: useGanttData(projectId)            ??媛꾪듃? ?숈씪 荑쇰━??ganttKeys.data) = 罹먯떆 怨듭쑀
   59:       ??      ??toSvarTasks(filtered, {folders, folderIssues, hourRate, placeholderStart})   ??怨꾩링 洹쒖튃 ?뚯쑀??      ?? ?됰㈃ SVAR ?몃뱶 [{ id, text, type, parent, folder?, ... }]
   60:       ??buildWorkTree(nodes)  ?? flattenTree(tree, collapsedIds)  ?? ?붾㈃ ??```
   61: 
   62: 吏?ㅻ뒗 ?댁쑀:
   63: 
   64: - **怨꾩링????踰뚮줈 媛덈씪吏??寃껋쓣 留됰뒗??** 怨꾩링 洹쒖튃(?댁뒋 遺紐?> ?대뜑 ?뚯냽 > 猷⑦듃)? `ganttAdapter.toSvarTasks` ?뚯쑀?닿퀬 ?몃━?먯꽌 ?ы빐?앺븯吏 ?딅뒗?? ?ы빐?앺븯硫?媛숈? ?곗씠?곗씤???몃━? 媛꾪듃媛 ?ㅻⅨ ?몃━瑜?洹몃┛??
   65: - **?숆? ?⑥튂쨌?좎뒪??諛곗묶??媛덈씪吏??寃껋쓣 留됰뒗??** ?곌린??`useUpdateSchedule` / `useSetParent` / `useSetLink` / `useUpdateCoworkers` / `useUpdatePlannedMd` + ?대뜑 5醫?`useCreateFolder` / `useRenameFolder` / `useMoveFolder` / `useDeleteFolder` / `useSetIssueFolder`)??怨듭쑀?쒕떎. 紐⑤떖??`GanttScheduleModal` / `GanttUserModal` / `GanttParentModal` / `GanttFolder*Modal` ?ъ궗??
   66: - 荑쇰━?ㅺ? 媛숈쑝誘濡?**??酉곗쓽 ?몄쭛???ㅻⅨ 酉곗뿉 利됱떆 諛섏쁺**?쒕떎(?ъ“???놁쓬).
   67: 
   68: ?몃━ ?꾩슜 肄붾뱶??**?쒗쁽쨌?쇱슦???쒖닔 濡쒖쭅 3媛?*肉먯씠?? `buildWorkTree.js`, `resolveTreeDrop.js`, `relationSource.js` (紐⑤몢 jest ???.
   69: 
   70: > ?덉쇅: ?곸꽭 ?⑤꼸??**?뚰겕濡쒓렇**(`useIssueWorklogs`)? **Jira ?곌?愿怨?*(`useIssueRelations`)留??좏깮 ?쒖젏???댁뒋 1嫄댁쓣 ?⑤뵒留⑤뱶 議고쉶?쒕떎. ?꾩껜 ?댁뒋??`subtasks`/`issuelinks`/?뚰겕濡쒓렇瑜??뱀쑝硫?紐⑸줉 議고쉶媛 臾닿굅?뚯?湲??뚮Ц(짠5).
   71: 
   72: ---
   73: 
   74: ## 3. ?덉씠?꾩썐
   75: 
   76: ```
   77: ?뚢?????????????????????????? ?묒뾽愿由?????????????????????????????????                                     [紐⑸줉] [?몃━] [媛꾪듃]      ?????뚢?? 醫?4 : TreeStructurePanel ?????뚢?? ??6 : TreeDetailPanel ??먥봻
   78: ????寃??쨌 ?쇱튂湲??묎린 쨌 ?대뜑異붽? ?????ㅻ뜑(?붿빟쨌?곹깭쨌?댁뒋??   ?귘봻
   79: ?????대떦?먃룹긽?쑣룻봽濡쒖젥???꾪꽣     ????泥섎━??                   ?귘봻
   80: ?????? 怨꾩링 ?몃━(DnD) ??          ?????띿꽦(?대떦/?쇱젙/?묒뾽??MD) ?귘봻
   81: ???? ???뱚 ?대뜑                    ?????곌? 愿怨?짠5)             ?귘봻
   82: ????     ??PROJ-1 ?곸쐞 ?묒뾽       ?????뚰겕濡쒓렇                  ?귘봻
   83: ????         PROJ-2 ?섏쐞 ?묒뾽     ????                          ?귘봻
   84: ????[猷⑦듃濡??쒕∼] (?쒕옒洹?以묐쭔)   ????                          ?귘봻
   85: ???붴??????????????????????????????????붴????????????????????????????섃봻
   86: ?붴??????????????????????????????????????????????????????????????????```
   87: 
   88: - 醫뚯슦 ?믪씠??`80vh` 怨좎젙, ?대? 媛곸옄 ?ㅽ겕濡??붿껌 ?ы빆).
   89: - ?좑툘 **Atlaskit `<Inline>` + `xcss({flex})` 議고빀 湲덉?.** `Inline`? `grow` prop ?놁씠??`flex-grow`媛 遺숈? ?딄퀬(湲곕낯 hug), `xcss`???좏겙 湲곕컲?대씪 `flex:'4'` 媛숈? raw 媛믪씠 臾댁떆?쒕떎 ??而⑦뀒?대꼫媛 遺紐???쓣 紐?梨꾩슦??踰꾧렇媛 ?щ떎. ???쒖뼱媛 ?꾩슂???덉씠?꾩썐? ?쇰컲 `div` + ?몃씪??flex 濡?紐낆떆?쒕떎.
   90: - ?먯떇 ?⑤꼸?먮룄 `flex:1; width:100%; minWidth:0`??紐낆떆?쒕떎. ?놁쑝硫??좏깮 ?몃뱶 ?댁슜 湲몄씠???곕씪 ??씠 異쒕쟻?몃떎.
   91: 
   92: ---
   93: 
   94: ## 4. ?몃━ 議곕┰ (`buildWorkTree.js`)
   95: 
   96: | ?⑥닔 | ??븷 |
   97: |------|------|
   98: | `buildWorkTree(nodes)` | ?됰㈃ SVAR ?몃뱶 ??以묒꺽 ?몃━(`children` 遺李? ?먮낯 遺덈?) |
   99: | `flattenTree(tree, collapsedIds)` | ?묓옒 諛섏쁺 ?뚮뜑 ??`[{ node, depth, hasChildren, isCollapsed }]` |
  100: | `collectParentIds(tree)` | ?먯떇 蹂댁쑀 ?몃뱶 id (?꾩껜 ?묎린?? |
  101: | `isFolderNodeId(id)` / `stripFolderNodeId(id)` | `folder:<uuid>` ?먯젙/蹂??|
  102: 
  103: 洹쒖튃:
  104: 
  105: - **怨좎븘 ?몃뱶??猷⑦듃濡??밴꺽.** `parent`媛 0/?꾨씫?닿굅??**?꾪꽣濡?遺紐④? 嫄몃윭吏?* ?몃뱶瑜?猷⑦듃???щ┛?? ??洹몃윭硫??꾪꽣 寃곌낵?먯꽌 ?먯떇???듭㎏濡??щ씪吏꾨떎.
  106: - **?뺤젣 ?뺣젹? ?대뜑 ?곗꽑**, 洹??덉뿉?쒕뒗 ?낅젰 ?쒖꽌 ?좎?(?대뜑 ?먯껜 ?쒖꽌???대뙌?곗쓽 `sortOrder`).
  107: - ?묓엺 ?쒕툕?몃━???됱쓣 **?꾩삁 留뚮뱾吏 ?딅뒗??* ??媛???ㅽ겕濡??놁씠?????몃━?먯꽌 ?뚮뜑 鍮꾩슜??以??
  108: 
  109: ### 4-1. ?꾪꽣? ?대뜑
  110: 
  111: ?대뜑??`tasks`???녿떎(?대뙌?곌? ?⑹꽦?섎뒗 援ъ“ ?몃뱶). 洹몃옒???대떦???곹깭/?꾨줈?앺듃/寃???꾪꽣??**?댁뒋 task ?먮쭔** 嫄몃━怨? ?대뜑???댁븘?⑥? ?먯떇 ?댁뒋瑜??대뒗??媛꾪듃? ?숈씪 洹쒖튃). 寃?됱뼱??`key + summary` 遺遺꾩씪移?
  112: 
  113: ### 4-2. ?좏깮 ?곹깭
  114: 
  115: - `project_id`媛 諛붾뚮㈃ ?묓옒쨌?좏깮??珥덇린?뷀븳??
  116: - ?좏깮 ?몃뱶媛 ?꾪꽣濡??붾㈃?먯꽌 ?щ씪吏硫??좏깮 ?댁젣(`visibleIds` 媛먯떆) ???좊졊 ?곸꽭媛 ?⑥? ?딄쾶.
  117: 
  118: ---
  119: 
  120: ## 5. ?쒕옒洹몄븻?쒕∼ (`resolveTreeDrop.js`)
  121: 
  122: ?쒕∼ 1嫄???mutation ?섎룄瑜?寃곗젙?섎뒗 **?쒖닔 ?⑥닔**. ?ㅼ젣 mutate ?몄텧? `ProjectTreeView`媛 ?쒕떎.
  123: 
  124: | ?쒕∼ ?????/ ?쒕옒洹???| ?대뜑 | ?댁뒋 |
  125: |---|---|---|
  126: | **?대뜑** | `moveFolder`(以묒꺽 ?대룞) | `setIssueFolder`(?뚯냽 吏?? |
  127: | **?댁뒋** | 臾댁떆(?댁뒋???대뜑??遺紐④? ?????녿떎) | `setParent`(?곸쐞 吏?? |
  128: | **猷⑦듃**(鍮??곸뿭/?쒕∼議? | `moveFolder(parent=null)` | `setParent(parentKey=null)` = ?곸쐞 ?댁젣 |
  129: 
  130: - ??**?쇱슦??洹쒖튃? 媛꾪듃(`GanttChart`??move-task intercept)? ?섎룄?곸쑝濡??숈씪**?섎떎. ??酉곌? 媛숈? ?곗씠?곕? ?몄쭛?섎뒗???쒕∼ ?섎?媛 ?ㅻⅤ硫?寃곌낵媛 ?닿툔?쒕떎 ??**洹쒖튃??諛붽씀硫??묒そ??媛숈씠 諛붽퓭???쒕떎.**
  131: - ?댁뒋瑜??대뜑???ｌ쓣 ??`wbsParent`(???곸쐞 吏??媛 ?덉쑝硫?**癒쇱? ?댁젣**?쒕떎(`clearWbsParent`). ?대뙌???곗꽑?쒖쐞???댁뒋-遺紐④? ?덉쑝硫??대뜑 ?뚯냽???쒓컖?곸쑝濡?臾댄슚?쇱꽌.
  132: - ?쒗솚(?먭린 ?먯떊/?먯넀?쇰줈 ?대룞)? `isDescendantNode`濡?**?대씪?먯꽌 癒쇱?** 留됰뒗?? 理쒖쥌 諛⑹뼱???쒕쾭(`detectTreeCycle` / `detectFolderCycle`).
  133: - 蹂???녿뒗 ?쒕∼? `null` 諛섑솚?쇰줈 ?ㅽ궢 ??臾댁쓽誘명븳 write 瑜???蹂대궦?? ?꾩옱 遺紐④? ?대뜑硫?"?댁뒋 遺紐??놁쓬"?쇰줈 ?뺢퇋?뷀빐 鍮꾧탳(媛꾪듃? ?숈씪).
  134: - ?쒕∼議댁? ?쒕옒洹?以묒씪 ?뚮쭔 ?뚮뜑?쒕떎(`canWrite && dragId`).
  135: - Firefox ??`dataTransfer`???곗씠?곌? ?놁쑝硫??쒕옒洹몃? ?쒖옉?섏? ?딅뒗????`setData('text/plain', id)` ?꾩닔.
  136: 
  137: ---
  138: 
  139: ## 6. ?곸꽭 ?⑤꼸??異쒖쿂 ?쒓린 (`relationSource.js`, TreeDetailPanel)
  140: 
  141: ?몃━ ?곸꽭??"?곌? 愿怨? ?뱀뀡? **?대뒓 ??μ냼?먯꽌 ??愿怨꾩씤吏**瑜?援щ텇??蹂댁뿬以?? ?먯젙 洹쒖튃留??쒖닔 ?⑥닔濡?遺꾨━???뚯뒪?명븳????洹쒖튃???由щ㈃ 媛숈? 愿怨꾧? ??踰??섏삤嫄곕굹, Jira媛 ?뺤쓽???곸쐞瑜??뚰겕?ъ뒪媛 吏?뺥븳 寃껋쿂??蹂댁뿬二쇰뒗 ?ш퀬媛 ?쒕떎.
  142: 
  143: ### 6-1. ?ъ떎愿怨?(?ㅽ빐?섍린 ?ъ슫 吏??
  144: 
  145: 1. **?좏썑?됱? ???꾩슜 ??μ냼媛 ?꾨땲??** 媛꾪듃/?몃━???좏썑??= **Jira ?ㅼ씠?곕툕 ?댁뒋 留곹겕??`Blocks` ???洹??먯껜**(諛깆뿏??`GanttMapper.buildLinksFromIssueLinks`媛 `type.name === 'Blocks'`留?媛꾩꽑?쇰줈 戮묐뒗??.
  146:    ??媛꾪듃?먯꽌 洹몃졇?붿? Jira ?붾㈃?먯꽌 留뚮뱾?덈뒗吏 **援щ텇 遺덇?**. 援щ텇?섎뒗 泥숉븯吏 ?딄퀬 "Jira ?댁뒋 留곹겕濡???λ맖"留???踰??뺤쭅?섍쾶 ?덈궡?쒕떎.
  147:    ??媛숈? 留곹겕瑜?"Jira ?곌껐"怨?"?좏썑????紐⑤몢 洹몃━硫?1嫄댁씠 2踰?蹂댁씤????`excludeBlocksLinks`濡?Jira ?곌껐 紐⑸줉?먯꽌 Blocks ?쒖쇅.
  148: 2. **?곸쐞????μ냼媛 ?ㅼ젣濡??섏씠??**
  149:    - `wbsParent` ???깆씠 ?댁뒋 ?꾨줈?쇳떚 `movesRms.wbsParent`????? Jira ?곸쐞瑜?**override** ?쒕떎.
  150:    - Jira `parent` ???쒖? ?꾨뱶.
  151:    - 蹂묓빀 洹쒖튃(諛깆뿏??`GanttMapper.buildTasksAndLinks`): `effectiveParent = wbsParent(吏묓빀 ?? ?? jiraParent(吏묓빀 ?? ?? null`.
  152: 3. ?대뜑 ?뚯냽 / ?섏쐞 吏??`wbsChildren`)? ???꾩슜 ???뚰겕?ъ뒪 諛곗?.
  153: 
  154: ### 6-2. `resolveParentOrigin` ??援щ텇?섎뒗 ?곹깭
  155: 
  156: | 諛섑솚 ?꾨뱶 | ?섎? | ?붾㈃ |
  157: |-----------|------|------|
  158: | `source: 'workforce' \| 'jira' \| null` | ?ㅼ젣 ?곸슜 以묒씤 ?곸쐞??異쒖쿂 | 諛곗?(????/ 釉붾（=Jira) |
  159: | `isOverridden` | ?뚰겕?ъ뒪 吏?뺤씠 Jira ?곸쐞瑜?媛由ш퀬 ?덉쓬 | 媛?ㅼ쭊 Jira ?곸쐞瑜??먮━寃??④퍡 ?쒖떆 |
  160: | `isWbsUnapplied` | ?뚰겕?ъ뒪 吏?뺤? ?덉쑝????곸씠 議고쉶 踰붿쐞 諛??꾪꽣??| 誘몄쟻???덈궡 |
  161: | `isOutOfView` | ?곸슜 ?곸쐞媛 ?꾩옱 ?몃━ ?붾㈃???놁쓬 | 踰붿쐞 諛??덈궡 |
  162: 
  163: ### 6-3. ?먯젙 ??二쇱쓽
  164: 
  165: - Blocks ?먯젙? **諛섎뱶????낅챸**(`typeName === 'Blocks'`)?쇰줈. `relation`(`type.outward`/`inward` = 'blocks' / 'is blocked by')? 諛⑺뼢蹂??쒖떆 臾멸뎄??**濡쒖??셋룹빱?ㅽ? 留곹겕??낆뿉??源⑥쭊??*.
  166: - `BLOCKS_LINK_TYPE_NAME`? 諛깆뿏??`GanttMapper.BLOCKS_TYPE_NAME`怨?**媛믪씠 ?쇱튂?댁빞 ?쒕떎**(?꾨줎??踰덈뱾??諛깆뿏??紐⑤뱢??import ?섏? ?딆븘 媛믩쭔 蹂듭젣). ?쒖そ留?諛붽씀硫?留곹겕媛 "Jira ?곌껐"濡??덉뼱 ?섏삤??以묐났???섏궡?꾨궃??
  167: - `typeName`???녿뒗 ??ぉ(援щ쾭??罹먯떆 ??? ?먯젙 遺덇? ??蹂댁닔?곸쑝濡??④릿??
  168: - **踰붿쐞 諛?Blocks ?좎떎 諛⑹?**: 諛깆뿏??links ???꾨줈?앺듃 ?섏튂 吏묓빀 ?덉쓽 Blocks 留??④릿??dangling/援먯감?꾨줈?앺듃 ?쒖쇅). Blocks 瑜?Jira ?곌껐?먯꽌 臾댁“嫄?鍮쇰㈃ 踰붿쐞 諛?留곹겕媛 ?붾㈃?먯꽌 ?듭㎏濡??щ씪吏誘濡? `pickOutOfScopeBlocks`媛 ?⑥? 寃껋쓣 ?쎄린 ?꾩슜?쇰줈 ?곕줈 蹂댁뿬以??
  169: 
  170: ### 6-4. ?몄쭛 ?꾩엫
  171: 
  172: ?곸꽭 ?⑤꼸? **?낅젰 ?섏쭛留?* ?섍퀬 write 濡쒖쭅??媛뽰? ?딅뒗?? ?곸쐞(`ProjectTreeView`) 肄쒕갚 ??媛꾪듃? 媛숈? mutation.
  173: 怨꾪쉷 ?묒뾽??MD)留??몃씪???몄쭛(媛꾪듃 洹몃━??`PlannedMdCell`怨??숈씪???곹샇?묒슜: ?대┃ ???낅젰 ??Enter ???/ Esc 痍⑥냼 / blur 而ㅻ컠), ?쇱젙쨌?묒뾽?먃룹긽?꽷룻뤃?붾뒗 媛꾪듃 紐⑤떖???ъ궗?⑺븳??
  174: 
  175: ?좏썑??諛⑺뼢 怨꾩빟: `source`=?좏뻾, `target`=?꾪뻾.
  176: - ?좏뻾 ??젣 ??`{ source: ?곷?, target: ???몃뱶 }`
  177: - ?꾪뻾 ??젣 ??`{ source: ???몃뱶, target: ?곷? }`
  178: 
  179: ---
  180: 
  181: ## 7. ?⑤뵒留⑤뱶 議고쉶 2醫?
  182: | ??| 荑쇰━??| 議고쉶 | 鍮꾧퀬 |
  183: |----|--------|------|------|
  184: | `useIssueRelations(issueKey)` | `projectKeys.issueRelations(key)` | `GET issue?fields=parent,subtasks,issuelinks` | staleTime 60s. ?ㅽ뙣?대룄 throw ???섍퀬 鍮?寃곌낵 |
  185: | `useIssueWorklogs(issueKey)` | ??| ?댁뒋 ?뚰겕濡쒓렇 | 珥??쒓컙 ?⑷퀎 ?쒖떆 |
  186: 
  187: `executeRequest`???ㅽ뙣 ??`{ success:false }`瑜?**諛섑솚**?쒕떎(throw ?꾨떂) ???몄텧遺?먯꽌 諛섎뱶??泥댄겕??寃?
  188: 
  189: ---
  190: 
  191: ## 8. i18n
  192: 
  193: - ?몃━ ?꾩슜 ?? `locales/kr|en/projectDetail.json` ??`projectDetail.work.tree.*`, `projectDetail.work.view.*`
  194: - ?대뜑쨌?꾪꽣쨌?좎뒪?맞룹뿉?щ뒗 **媛꾪듃 ?ㅻ? 洹몃?濡??ъ궗??*?쒕떎(`locales/kr|en/gantt.json` ??`gantt.folder.*`, `gantt.filter.*`, `gantt.toast.*`, `gantt.error.*`).
  195: - `ko-KR.json` / `en-US.json` 吏곸젒 ?섏젙 湲덉? ??異붽? ??`cd static/ui && npm run merge`.
  196: 
  197: ---
  198: 
  199: ## 9. ?⑥젙 紐⑥쓬 (?좎?蹂댁닔 二쇱쓽)
  200: 
  201: - **怨꾩링쨌?쒕∼ 洹쒖튃???몃━?먯꽌 ?ш뎄?꾪븯吏 留?寃?** ?대뙌??`toSvarTasks`)? `resolveTreeDrop`???⑥씪 異쒖쿂?? 媛꾪듃留?怨좎튂怨??몃━瑜??먮㈃ ??酉곌? ?ㅻⅨ ?몃━瑜?洹몃┛??
  202: - **lazy 酉곕뒗 Suspense 寃쎄퀎 ?꾨옒??** 寃쎄퀎瑜?嫄룹뼱?대㈃ 酉??꾪솚 ??React error #426.
  203: - **?꾪꽣 ?곹깭瑜?酉?而댄룷?뚰듃濡??대━吏 留?寃?** ?몄씠 ?뚯쑀?댁빞 tree?봥antt ?꾪솚 ??留λ씫???좎??쒕떎.
  204: - **Blocks ?먯젙? ??낅챸?쇰줈.** ?쒖떆 臾멸뎄(`relation`)濡??먯젙?섎㈃ 濡쒖????꾪솚?먯꽌 議곗슜??源⑥쭊??
  205: - **?대뜑 ?몃뱶??`tasks`???녿떎.** ?대뜑 愿??濡쒖쭅?먯꽌 `tasks.find`濡??대뜑瑜?李얠쑝???섎㈃ ??긽 ?ㅽ뙣?쒕떎 ??`svarNodes`(?대뙌??異쒕젰)瑜?遊먯빞 ?쒕떎.
  206: - **?묒뾽??write ???レ옄 `issueId` ?꾩닔.** ?놁쑝硫??ㅽ궢?쒕떎(`node.issueId`???대뙌??passthrough).
  207: - **`Textfield type="number"`?먮뒗 `onWheel={e => e.target.blur()}`.** ?놁쑝硫??ㅽ겕濡ㅻ줈 媛믪씠 諛붾먮떎.
  208: 
  209: ---
  210: 
  211: ## 10. 李멸퀬
  212: 
  213: - 媛꾪듃 ?곗씠??紐⑤뜽쨌???諛⑹떇쨌SVAR ?뚮뜑 ?⑥젙: `src/resolver/gantt/GANTT.md`
  214: - 吏꾩쿃???곗떇: `src/resolver/projectProgress/CALCULATION.md`

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- $p:$a-$b ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'src/nosql/query/CustomEntityManager.js' 75 220; Show-Range 'src/queue/__test__/JobCompletion.test.js' 1 500; rg -n --glob '"'!node_modules/**'"' \"job_batch|jobBatchManager|findByWherePaged|checkJobCompletion\" src manifest.yml" in C:\CloudJira\moves-workforce
2026-08-12T09:54:40.805091Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.1 seconds
Output:
위치 줄:2 문자:38
+ function Show-Range($p,$a,$b){"`n--- $p:$a-$b ---";$n=0;Get-Content $ ...
+                                      ~~~
변수 참조가 잘못되었습니다. ':' 뒤에 올바른 변수 이름 문자가 없습니다. ${}를 사용하여 이름을 구분하십시오.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidVariableReferenceWithDrive
 

 exited 1 in 1100ms:
위치 줄:2 문자:38
+ function Show-Range($p,$a,$b){"`n--- $p:$a-$b ---";$n=0;Get-Content $ ...
+                                      ~~~
변수 참조가 잘못되었습니다. ':' 뒤에 올바른 변수 이름 문자가 없습니다. ${}를 사용하여 이름을 구분하십시오.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidVariableReferenceWithDrive
 

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'src/nosql/query/CustomEntityManager.js' 75 220; Show-Range 'src/queue/__test__/JobCompletion.test.js' 1 500; rg -n --glob '"'!node_modules/**'"' \"job_batch|jobBatchManager|findByWherePaged|checkJobCompletion\" src manifest.yml" in C:\CloudJira\moves-workforce
 succeeded in 1491ms:

--- src/nosql/query/CustomEntityManager.js:75-220 ---
   75:         async findAll() {
   76:             try {
   77:                 return await kvs.entity(entityName)
   78:                     .query()
   79:                     .index('name')
   80:                     .limit(100)
   81:                     .getMany();
   82:             }catch (e){
   83:                 logError('findAll', e);
   84:                 throw CustomEntityError.init(e);
   85:             }
   86:         },
   87: 
   88:         /**
   89:          * 而ㅼ꽌 ?섏씠吏뺤쑝濡??뷀떚???꾨웾 ?섏쭛 (? ?꾩엯 P0).
   90:          *
   91:          * `findAll()` ? `.limit(100)` ?섎뱶罹≪씠??100嫄댁쓣 ?섍린硫?議곗슜???섎┛??
   92:          * ?? 100媛쒕? ?섍만 ???덉쑝誘濡?nextCursor 媛 ?놁쓣 ?뚭퉴吏 諛섎났 ?섏쭛?쒕떎.
   93:          * (@forge/kvs ????ㅼ륫: KvsQueryBuilder.cursor() ?낅젰 + ListResult.nextCursor 諛섑솚 吏??
   94:          *
   95:          * **湲곗〈 findAll() ? 蹂寃쏀븯吏 ?딅뒗??* ???ㅻⅨ ?꾨찓???뚭? 諛⑹?.
   96:          *
   97:          * @param {string} indexName  ?뺣젹/?ㅼ틪?????몃뜳?ㅻ챸(manifest indexes ???좎뼵???덉뼱???쒕떎)
   98:          * @param {number} pageLimit  1??議고쉶 嫄댁닔
   99:          * @param {number} maxItems   ?섏쭛 ?곹븳. ?꾨떖?덈뒗??而ㅼ꽌媛 ?⑥븘 ?덉쑝硫?truncated:true
  100:          * @returns {Promise<{results: Array, truncated: boolean}>}
  101:          */
  102:         async findAllPaged(indexName = 'name', pageLimit = 100, maxItems = 500) {
  103:             try {
  104:                 const results = [];
  105:                 let cursor;
  106:                 let truncated = false;
  107: 
  108:                 for (;;) {
  109:                     let query = kvs.entity(entityName)
  110:                         .query()
  111:                         .index(indexName)
  112:                         .limit(pageLimit);
  113: 
  114:                     if (cursor) query = query.cursor(cursor);
  115: 
  116:                     const page = await query.getMany();
  117: 
  118:                     results.push(...(page?.results ?? []));
  119:                     cursor = page?.nextCursor;
  120: 
  121:                     // 而ㅼ꽌媛 ?놁쑝硫?留덉?留??섏씠吏 ???곹븳怨?臾닿??섍쾶 ?뺤긽 醫낅즺(truncated:false).
  122:                     if (!cursor) break;
  123: 
  124:                     // ?곹븳 ?꾨떖 + 而ㅼ꽌 ?붿〈 = ?ㅼ젣濡??섎졇??
  125:                     if (results.length >= maxItems) {
  126:                         truncated = true;
  127:                         break;
  128:                     }
  129:                 }
  130: 
  131:                 if (truncated) {
  132:                     console.error(
  133:                         `[${entityName}] findAllPaged truncated: collected=${results.length}, maxItems=${maxItems} ???곗씠?곌? 遺덉셿?꾪빀?덈떎`,
  134:                     );
  135:                 }
  136: 
  137:                 return { results: results.slice(0, maxItems), truncated };
  138:             } catch (e) {
  139:                 logError('findAllPaged', e);
  140:                 throw CustomEntityError.init(e);
  141:             }
  142:         },
  143: 
  144:         /**
  145:          * ?몃뜳???숇벑議곌굔 + 而ㅼ꽌 ?섏씠吏?(`findAllPaged` ??where 踰꾩쟾).
  146:          *
  147:          * `findByWhere` ??`.limit()` ?곹븳?먯꽌 ?섎━怨?`nextCursor` 瑜?踰꾨┛????
  148:          * `findAll()` 100嫄??섎뱶罹↔낵 **媛숈? ?⑥젙**?대씪, 嫄댁닔媛 ?곹븳???섏쓣 ???덈뒗 怨녹뿉?쒕뒗 ?닿구 ?대떎.
  149:          *
  150:          * **湲곗〈 `findByWhere` ??蹂寃쏀븯吏 ?딅뒗??* ???ㅻⅨ ?꾨찓???뚭? 諛⑹?.
  151:          *
  152:          * @param {string} indexName manifest indexes ???좎뼵???몃뜳?ㅻ챸
  153:          * @param {string|number|boolean} value ?숇벑 鍮꾧탳 媛?
  154:          * @param {number} pageLimit 1??議고쉶 嫄댁닔
  155:          * @param {number} maxItems ?섏쭛 ?곹븳. ?꾨떖?덈뒗??而ㅼ꽌媛 ?⑥븘 ?덉쑝硫?truncated:true
  156:          * @returns {Promise<{results: Array, truncated: boolean}>}
  157:          */
  158:         async findByWherePaged(indexName, value, pageLimit = 100, maxItems = 1000) {
  159:             try {
  160:                 const results = [];
  161:                 let cursor;
  162:                 let truncated = false;
  163: 
  164:                 for (;;) {
  165:                     let query = kvs.entity(entityName)
  166:                         .query()
  167:                         .index(indexName)
  168:                         .where(WhereConditions.equalTo(value))
  169:                         .limit(pageLimit);
  170: 
  171:                     if (cursor) query = query.cursor(cursor);
  172: 
  173:                     const page = await query.getMany();
  174: 
  175:                     results.push(...(page?.results ?? []));
  176:                     cursor = page?.nextCursor;
  177: 
  178:                     // 而ㅼ꽌媛 ?놁쑝硫?留덉?留??섏씠吏 ???곹븳怨?臾닿??섍쾶 ?뺤긽 醫낅즺(truncated:false).
  179:                     if (!cursor) break;
  180: 
  181:                     // ?곹븳 ?꾨떖 + 而ㅼ꽌 ?붿〈. ?몄텧?먭? "?꾩슂??留뚰겮留? ?곹븳?쇰줈 ?곕뒗 寃쎌슦媛 ?덉뼱
  182:                     // (?꾨즺 ?먯젙 ?? findAllPaged ? ?щ━ error 濡쒓렇???④린吏 ?딄퀬 ?뚮옒洹몃쭔 ?뚮젮以??
  183:                     if (results.length >= maxItems) {
  184:                         truncated = true;
  185:                         break;
  186:                     }
  187:                 }
  188: 
  189:                 return { results: results.slice(0, maxItems), truncated };
  190:             } catch (e) {
  191:                 logError('findByWherePaged', e);
  192:                 throw CustomEntityError.init(e);
  193:             }
  194:         },
  195: 
  196:         async findByFilterExists(indexName,filter, limit = 100) {
  197:             try {
  198:                 return await kvs.entity(entityName)
  199:                     .query()
  200:                     .index(indexName)
  201:                     .filters(
  202:                         new Filter().and(filter, FilterConditions.exists())
  203:                     )
  204:                     .limit(limit)
  205:                     .getMany();
  206:             } catch (e) {
  207:                 logError('findByOrderExists', e);
  208:                 throw CustomEntityError.init(e);
  209:             }
  210:         },
  211: 
  212:         async delete(id) {
  213:             try {
  214:                 await kvs.entity(entityName).delete(id);
  215:             }catch (e){
  216:                 logError('delete', e);
  217:                 throw CustomEntityError.init(e);
  218:             }
  219:         },
  220:     };

--- src/queue/__test__/JobCompletion.test.js:1-500 ---
    1: /**
    2:  * ??諛곗튂 ?꾨즺 ?먯젙 (`checkJobCompletion`) ??2026-08-12 ?깅뒫 媛먯궗 A-4.
    3:  *
    4:  * 怨좎젙?섎뒗 寃?
    5:  *  - ?꾨즺 ?먯젙??諛곗튂留덈떎 **?꾨웾 fan-in(B짼)** ???꾨땲??`jobId` ?몃뜳??**?섏씠吏 ?ㅼ틪**?대떎
    6:  *  - ?ъ떆?꾨줈 媛숈? 諛곗튂媛 ?ㅼ떆 ?뚮퉬?쇰룄 **以묐났 怨꾩닔濡?議곌린 ?꾧껐?섏? ?딅뒗??*(硫깅벑)
    7:  *  - ??諛곗튂媛 done ?댁뼱?쇰쭔 job ??理쒖쥌 ?곹깭濡??섏뼱媛怨? 吏묎퀎媛믪씠 ?뺥솗?섎떎
    8:  */
    9: 
   10: const mockKvsPageReads = { count: 0 };
   11: const mockStores = new Map();
   12: 
   13: const mockMakeStore = () => {
   14:     const map = new Map();
   15:     return {
   16:         map,
   17:         save: jest.fn(async (id, data) => { map.set(id, { ...data }); }),
   18:         saveTTL: jest.fn(async (id, data) => { map.set(id, { ...data }); }),
   19:         findById: jest.fn(async (id) => map.get(id) ?? null),
   20:         delete: jest.fn(async (id) => { map.delete(id); }),
   21:         findByWherePaged: jest.fn(async (indexName, value, pageLimit = 100, maxItems = 1000) => {
   22:             const all = [...map.entries()]
   23:                 .filter(([, v]) => v?.[indexName] === value)
   24:                 .map(([key, v]) => ({ key, value: v }));
   25: 
   26:             const results = [];
   27:             let truncated = false;
   28:             let i = 0;
   29:             for (;;) {
   30:                 mockKvsPageReads.count += 1;          // KVS ?뺣났 1??= ?섏씠吏 1??                results.push(...all.slice(i, i + pageLimit));
   31:                 i += pageLimit;
   32:                 if (i >= all.length) break;
   33:                 if (results.length >= maxItems) { truncated = true; break; }
   34:             }
   35:             return { results: results.slice(0, maxItems), truncated };
   36:         }),
   37:     };
   38: };
   39: 
   40: jest.mock('../../nosql/query/CustomEntityManager', () => ({
   41:     customEntityManager: (entityName) => {
   42:         if (!mockStores.has(entityName)) mockStores.set(entityName, mockMakeStore());
   43:         return mockStores.get(entityName);
   44:     },
   45: }));
   46: 
   47: // ???섑띁??洹몃?濡??먮㈃ @forge/events 瑜??뚭퀬 ?ㅻ?濡?handler 瑜?洹몃?濡??뚮젮以??jest.mock('../../utils/queueUtil', () => ({
   48:     createConsumerHandler: (handler) => handler,
   49:     createQueue: jest.fn(),
   50:     pushQueueEvents: jest.fn(),
   51: }));
   52: 
   53: jest.mock('../../utils/license/LicenseGuard', () => ({ isLicenseBlocked: jest.fn(async () => false) }));
   54: jest.mock('../../api/jira/user/UserApi', () => ({
   55:     searchJiraUsersApi: jest.fn(async (_as, email) => [{ accountId: `acc-${email}` }]),
   56: }));
   57: jest.mock('../../resolver/backoffice/user/UserRepository', () => ({ addUsersBulk: jest.fn(async () => undefined) }));
   58: jest.mock('../../resolver/portfolioDashboard/PortfolioAggregator', () => ({ aggregateAllProjects: jest.fn() }));
   59: jest.mock('../../api/jira/field/FieldApi', () => ({ getProjectIdFieldIdApi: jest.fn(async () => 'field-1') }));
   60: jest.mock('../../api/jira/field/AppFieldValueApi', () => ({ setAppFieldValueForIssues: jest.fn(async () => undefined) }));
   61: jest.mock('../../resolver/projectSubscription/ProjectSubscriptionRepository', () => ({
   62:     findSubscriptionBySourceRepository: jest.fn(async () => null),
   63:     incrementTaggedRepository: jest.fn(async () => undefined),
   64: }));
   65: jest.mock('../../resolver/projectSubscription/DefaultEstimateApplier', () => ({ applyDefaultEstimate: jest.fn() }));
   66: jest.mock('../../api/jira/issue/AssignedDateRecorder', () => ({
   67:     ASSIGNED_VIA: { SUBSCRIPTION: 'SUBSCRIPTION' },
   68:     recordAssignedDateOnce: jest.fn(async () => undefined),
   69: }));
   70: 
   71: const { uploadUsers } = require('../consumer');
   72: 
   73: const APP_JOB_ID = 'job-test-1';
   74: const TOTAL = 5;
   75: 
   76: const jobStore = () => mockStores.get('job');
   77: const batchStore = () => mockStores.get('job_batch');
   78: 
   79: /** batchIndex 踰덉㎏ 諛곗튂瑜??뚮퉬?쒕떎(items 2嫄? 洹몄쨷 failCount 嫄댁? Jira 誘멸??? */
   80: const consume = (batchIndex, { emails = ['a@x.com', 'b@x.com'] } = {}) =>
   81:     uploadUsers({
   82:         body: {
   83:             appJobId: APP_JOB_ID,
   84:             batchId: `${APP_JOB_ID}-batch-${batchIndex}`,
   85:             batchIndex,
   86:             totalBatches: TOTAL,
   87:             items: emails.map(email => ({ email, createdId: 'me', permissionMemberKey: 'pm' })),
   88:         },
   89:     });
   90: 
   91: beforeEach(async () => {
   92:     mockKvsPageReads.count = 0;
   93: 
   94:     // ??consumer.js ??紐⑤뱢 濡쒕뱶 ?쒖젏??留ㅻ땲?瑜??≪븘 ?붾떎 ???ㅽ넗?대? **援먯껜?섎㈃** ???섍퀬
   95:     //   媛숈? ?몄뒪?댁뒪???댁슜留?鍮꾩슫??
   96:     for (const store of mockStores.values()) {
   97:         store.map.clear();
   98:         [store.save, store.saveTTL, store.findById, store.delete, store.findByWherePaged]
   99:             .forEach(m => m.mockClear());
  100:     }
  101: 
  102:     require('../../api/jira/user/UserApi').searchJiraUsersApi
  103:         .mockImplementation(async (_as, email) => [{ accountId: `acc-${email}` }]);
  104: 
  105:     await jobStore().save(APP_JOB_ID, {
  106:         id: APP_JOB_ID, total: TOTAL * 2, totalBatches: TOTAL,
  107:         processed: 0, failed: 0, status: 'RUNNING',
  108:     });
  109: });
  110: 
  111: describe('checkJobCompletion ???꾨즺 ?먯젙', () => {
  112:     test('?쇰? 諛곗튂留??앸굹硫?job ??理쒖쥌 ?곹깭濡??섍린吏 ?딅뒗??, async () => {
  113:         await consume(0);
  114:         await consume(1);
  115: 
  116:         expect(batchStore().map.size).toBe(2);
  117:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  118:     });
  119: 
  120:     test('??諛곗튂媛 ?앸굹硫?COMPLETED 濡?吏묎퀎?쒕떎', async () => {
  121:         for (let i = 0; i < TOTAL; i++) await consume(i);
  122: 
  123:         const job = jobStore().map.get(APP_JOB_ID);
  124:         expect(job.status).toBe('COMPLETED');
  125:         expect(job.processed).toBe(TOTAL * 2);
  126:         expect(job.failed).toBe(0);
  127:     });
  128: 
  129:     test('Jira 誘멸???嫄댁씠 ?덉쑝硫?PARTIAL 濡?吏묎퀎?쒕떎', async () => {
  130:         const { searchJiraUsersApi } = require('../../api/jira/user/UserApi');
  131:         searchJiraUsersApi.mockImplementation(async (_as, email) =>
  132:             (email === 'ghost@x.com' ? [] : [{ accountId: `acc-${email}` }]));
  133: 
  134:         await consume(0, { emails: ['ghost@x.com', 'b@x.com'] });
  135:         for (let i = 1; i < TOTAL; i++) await consume(i);
  136: 
  137:         const job = jobStore().map.get(APP_JOB_ID);
  138:         expect(job.status).toBe('PARTIAL');
  139:         expect(job.failed).toBe(1);
  140:     });
  141: 
  142:     /**
  143:      * 硫깅벑?깆쓽 ?듭떖 ??移댁슫?곗??ㅻ㈃ ?ш린??done ?섍? 6???섏뼱 5媛?以?4媛쒕쭔 ?앸궗?붾뜲???꾧껐?먯쓣 寃껋씠??
  144:      * ?덉퐫????`${appJobId}-batch-${index}`)媛 ?좎씪?섎?濡??ъ냼鍮꾨뒗 媛숈? ?ㅻ? ??뼱??肉먯씠??
  145:      */
  146:     test('?ъ떆?꾨줈 媛숈? 諛곗튂瑜??ㅼ떆 ?뚮퉬?대룄 ?꾨즺 ?섍? 遺?吏 ?딅뒗??, async () => {
  147:         for (let i = 0; i < TOTAL - 1; i++) await consume(i);   // 4/5 ?꾨즺
  148:         await consume(0);                                        // 諛곗튂 0 ?ъ떆??        await consume(1);                                        // 諛곗튂 1 ?ъ떆??
  149:         expect(batchStore().map.size).toBe(TOTAL - 1);
  150:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  151: 
  152:         await consume(TOTAL - 1);                                // 留덉?留?諛곗튂媛 ?꾩갑?댁빞 ?꾧껐
  153:         const job = jobStore().map.get(APP_JOB_ID);
  154:         expect(job.status).toBe('COMPLETED');
  155:         expect(job.processed).toBe(TOTAL * 2);                   // ?ъ냼鍮꾨텇??以묐났 ?⑹궛?섏? ?딅뒗??    });
  156: 
  157:     test('?ъ떆?꾧? ?쇱뼱???대? done ??諛곗튂??Jira ?ъ“???놁씠 吏묎퀎留??ㅼ떆 ?쒕떎', async () => {
  158:         const { searchJiraUsersApi } = require('../../api/jira/user/UserApi');
  159:         await consume(0);
  160:         const callsAfterFirst = searchJiraUsersApi.mock.calls.length;
  161: 
  162:         await consume(0);
  163: 
  164:         expect(searchJiraUsersApi.mock.calls.length).toBe(callsAfterFirst);
  165:     });
  166: 
  167:     test('KVS ?쎄린媛 諛곗튂 ?섏쓽 ?쒓낢???꾨땲???먯젙 1?뚮떦 1?섏씠吏??(A-4)', async () => {
  168:         for (let i = 0; i < TOTAL; i++) await consume(i);
  169: 
  170:         // ?먯젙 B??횞 ?섏씠吏 1??= B. 醫낆쟾 fan-in ?대㈃ B횞(B+1)=30 ?댁뿀??
  171:         expect(mockKvsPageReads.count).toBe(TOTAL);
  172:         expect(mockKvsPageReads.count).toBeLessThan(TOTAL * (TOTAL + 1));
  173:         // 諛곗튂 ?ㅻ? ?섎굹??李띿뼱 ?쎈뒗 寃쎈줈媛 ?⑥븘 ?덉? ?딆븘???쒕떎(findById ??job 理쒖쥌 議고쉶 1?뚮퓧)
  174:         expect(batchStore().findById.mock.calls.length).toBe(TOTAL);   // 諛곗튂蹂?以묐났 ?뚮퉬 媛??1?뚯뵫
  175:     });
  176: 
  177:     test('totalBatches 媛 ?좏슚?섏? ?딆쑝硫??꾨즺濡??먯젙?섏? ?딅뒗??, async () => {
  178:         await uploadUsers({
  179:             body: {
  180:                 appJobId: APP_JOB_ID, batchId: `${APP_JOB_ID}-batch-0`, batchIndex: 0,
  181:                 totalBatches: undefined,
  182:                 items: [{ email: 'a@x.com', createdId: 'me', permissionMemberKey: 'pm' }],
  183:             },
  184:         });
  185: 
  186:         expect(jobStore().map.get(APP_JOB_ID).status).toBe('RUNNING');
  187:     });
  188: });
manifest.yml:325:      - name: job_batch
src\nosql\query\CustomEntityManager.js:158:        async findByWherePaged(indexName, value, pageLimit = 100, maxItems = 1000) {
src\nosql\query\CustomEntityManager.js:191:                logError('findByWherePaged', e);
src\queue\consumer.js:17:const jobBatchManager = customEntityManager('job_batch');
src\queue\consumer.js:31:        const existingBatch = await jobBatchManager
src\queue\consumer.js:36:            await checkJobCompletion(appJobId, totalBatches);
src\queue\consumer.js:85:        await jobBatchManager.saveTTL(`${appJobId}-batch-${batchIndex}`, {
src\queue\consumer.js:93:        await checkJobCompletion(appJobId, totalBatches);
src\queue\consumer.js:152:        const existingBatch = await jobBatchManager.findById(key).catch(() => null);
src\queue\consumer.js:154:            await checkJobCompletion(appJobId, totalBatches);
src\queue\consumer.js:167:            await jobBatchManager.saveTTL(key, {
src\queue\consumer.js:170:            await checkJobCompletion(appJobId, totalBatches);
src\queue\consumer.js:212:                await jobBatchManager.saveTTL(key, {
src\queue\consumer.js:215:                await checkJobCompletion(appJobId, totalBatches);
src\queue\consumer.js:240: * 전체 배치 완료 여부 확인 및 job 최종 집계 함수 각 배치의 상태는 jobBatchManager로 확인하며
src\queue\consumer.js:246: * 지금은 `job_batch` 의 `jobId` 인덱스를 커서 페이징으로 훑는다 — 1회 판정 비용이
src\queue\consumer.js:260:const checkJobCompletion = async (appJobId, totalBatches) => {
src\queue\consumer.js:268:        scan = await jobBatchManager.findByWherePaged('jobId', appJobId, JOB_BATCH_PAGE_LIMIT, total);
src\queue\consumer.js:271:        console.error('[checkJobCompletion] batch scan failed', appJobId, e);
src\queue\__test__\JobCompletion.test.js:2: * 큐 배치 완료 판정 (`checkJobCompletion`) — 2026-08-12 성능 감사 A-4.
src\queue\__test__\JobCompletion.test.js:21:        findByWherePaged: jest.fn(async (indexName, value, pageLimit = 100, maxItems = 1000) => {
src\queue\__test__\JobCompletion.test.js:79:const batchStore = () => mockStores.get('job_batch');
src\queue\__test__\JobCompletion.test.js:100:        [store.save, store.saveTTL, store.findById, store.delete, store.findByWherePaged]
src\queue\__test__\JobCompletion.test.js:113:describe('checkJobCompletion — 완료 판정', () => {
src\resolver\projectSubscription\SubscriptionBackfill.js:7: * (`consumer.js` checkJobCompletion). 페이지 수가 늘어나면 완료가 영영 오지 않는다.
src\resolver\utils\job\JobService.js:74:    const jobManager = customEntityManager("job_batch");
src\resolver\utils\job\JobService.js:83:    const jobManager = customEntityManager("job_batch");

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'manifest.yml' 315 345; Show-Range 'src/resolver/projectSubscription/SubscriptionBackfill.js' 1 300; Show-Range 'src/resolver/utils/job/JobService.js' 1 130; rg -n -C 3 \"totalBatches|appJobId|batchIndex|batchId\" src/resolver src/queue --glob '"'!src/queue/consumer.js'"'" in C:\CloudJira\moves-workforce
 succeeded in 1369ms:

--- manifest.yml:315-345 ---
  315:             type: integer
  316:           totalBatches:
  317:             type: integer
  318:           processed:
  319:             type: integer
  320:           failed:
  321:             type: integer
  322:           status:
  323:             type: string
  324: 
  325:       - name: job_batch
  326:         attributes:
  327:           id:
  328:             type: string
  329:           jobId:
  330:             type: string
  331:           processedCount:
  332:             type: integer
  333:           failCount:
  334:             type: integer
  335:           done:
  336:             type: boolean
  337:         indexes:
  338:           - jobId
  339: 
  340:       - name: job_fail
  341:         attributes:
  342:           id:
  343:             type: string
  344:           jobId:
  345:             type: string

--- src/resolver/projectSubscription/SubscriptionBackfill.js:1-300 ---
    1: /**
    2:  * SubscriptionBackfill ??援щ룆 ?앹꽦 ??"湲곗〈 ?댁뒋??媛?몄삤湲??????곸옱 (RFC-171 P3).
    3:  *
    4:  * ?? ??SCAN ??癒쇱? ?섎뒗媛 ????????????????????????????????????????????????
    5:  * 而ㅼ꽌瑜?payload ???댁븘 ?먭린 ?먯뿉 ?ш? push ?섎뒗 諛⑹떇? 湲곗〈 吏꾪뻾瑜?紐⑤뜽怨?留욎? ?딅뒗??
    6:  * `job` ? ?앹꽦 ?쒖젏???뺤젙??`totalBatches` 瑜??꾩젣濡??꾨즺瑜??먯젙?섍린 ?뚮Ц?대떎
    7:  * (`consumer.js` checkJobCompletion). ?섏씠吏 ?섍? ?섏뼱?섎㈃ ?꾨즺媛 ?곸쁺 ?ㅼ? ?딅뒗??
    8:  *   ??**SCAN ??癒쇱? ?앸궡 ???紐⑸줉??怨좎젙**?섍퀬, 洹?紐⑸줉?쇰줈 batch ?섎? ?뺤젙??push ?쒕떎.
    9:  *     ?닿굔 SCAN?묨PPLY 遺꾨━(?ㅺ퀎??짠5-2)???媛숈? 諛⑺뼢?대떎.
   10:  *
   11:  * ?? ?ъ슜???붿껌 ?덉뿉???꾨뒗 SCAN ??????????????????????????????????????????
   12:  * 援щ룆 ?앹꽦? ?ъ슜?먭? 湲곕떎由щ뒗 ?숆린 ?붿껌?대떎. SCAN ?덉궛??吏㏐쾶 ?↔퀬, ??紐??묒쑝硫?
   13:  * ?묒? 留뚰겮留??곸옱????`isScanCapped` 濡??뚮┛?????섎㉧吏??由ъ빻?ㅼ씠 ?댁뼱??媛?몄삩??
   14:  * (議곗슜???먮Ⅴ吏 ?딅뒗??)
   15:  */
   16: 
   17: import { createQueue, pushQueueEvents } from '../../utils/queueUtil';
   18: import { customEntityManager } from '../../nosql/query/CustomEntityManager';
   19: import { applyTagging, createBudget, scanSubscription, MAX_SCAN_ISSUES } from './SubscriptionSweeper';
   20: import { getProjectIdFieldIdApi } from '../../api/jira/field/FieldApi';
   21: import { incrementTaggedRepository } from './ProjectSubscriptionRepository';
   22: import { filterByBaseline } from './SubscriptionJqlBuilder';
   23: import { applyDefaultEstimate } from './DefaultEstimateApplier';
   24: import { ASSIGNED_VIA, recordAssignedDateOnce } from '../../api/jira/issue/AssignedDateRecorder';
   25: 
   26: const jobManager = customEntityManager('job');
   27: 
   28: /** ???대깽??1嫄댁씠 泥섎━???댁뒋 ?? ???꾨뱶 write 諛곗튂(50)? 留욎텣?? */
   29: const BATCH_SIZE = 50;
   30: 
   31: /**
   32:  * 諛깊븘 1???곸옱 ?곹븳.
   33:  *
   34:  * ??怨듭슜 ?ㅼ틦??`MAX_SCAN_ISSUES`)媛 ?대? 2,000嫄댁뿉???딆쑝誘濡?洹몃낫????媛믪? **?꾨떖?????녿떎**.
   35:  *   ?ㅼ젣濡?5,000 ?쇰줈 ?먯뿀?????쎈뒗 ?щ엺??"5,000嫄닿퉴吏 ?닿릿??怨??ㅽ빐?덈떎 ???ㅼ틦???곹븳??洹몃?濡??대떎.
   36:  *   珥덇낵遺꾩? ?쒓컙蹂?由ъ빻?ㅼ씠 ?≪닔?섎ŉ, ?섎┛ ?ъ떎? `isScanCapped` 濡?UI ???몄텧?쒕떎.
   37:  */
   38: export const MAX_BACKFILL_ISSUES = MAX_SCAN_ISSUES;
   39: 
   40: /**
   41:  * ?ъ슜???붿껌 ?덉뿉???꾨뒗 SCAN ?대씪 **吏㏐쾶** ?〓뒗??
   42:  *
   43:  * ??Forge ?쇰컲 ?⑥닔(resolver)??理쒕? ?ㅽ뻾 ?쒓컙? 25珥덈떎. ?ш린??20珥덈? ?곕㈃ INSERT쨌??push쨌
   44:  *   ?묐떟 吏곷젹?붽퉴吏 ?뷀빐 ?쒕룄瑜??섍꺼 **??μ? ?먮뒗???붾㈃? ?ㅽ뙣**濡??⑤뒗 諛섏そ ?곹깭媛 ?쒕떎
   45:  *   (?ъ떆?꾪븯硫?SOURCE_TAKEN ???좎꽌 ?ъ슜?먮뒗 ?먯씤???????녿떎).
   46:  *   紐??묒? ?섎㉧吏???쒓컙蹂?由ъ빻?ㅼ씠 ?댁감??媛?몄삤誘濡? ?ъ쑀瑜??ш쾶 ?먮뒗 ?몄씠 ?덉쟾?섎떎.
   47:  */
   48: const SCAN_BUDGET = { maxRequests: 40, timeoutMs: 8_000 };
   49: 
   50: const chunk = (arr, size) => {
   51:     const out = [];
   52:     for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
   53:     return out;
   54: };
   55: 
   56: /**
   57:  * ?먮? 嫄곗튂吏 ?딄퀬 **洹??먮━?먯꽌 ?앸궪** ?댁뒋 ?섏쓽 ?곹븳.
   58:  *
   59:  * ???꾨뱶 write ??50嫄댁쓣 ??踰덉뿉 蹂대궦??`APP_FIELD_BATCH_SIZE`). 利????댄븯硫?PUT 1??
   60:  * 1珥덈룄 嫄몃━吏 ?딅뒗?? 洹몃윴?곕룄 ?먮줈 ?섍린硫??ъ슜?먮뒗 "媛?몄삤??以?留?蹂닿퀬 寃곌낵瑜??뺤씤?섎젮
   61:  * ?덈줈怨좎묠?댁빞 ?섍퀬, 吏꾪뻾瑜?湲곕줉(KVS)???몃뜲?놁씠 ?볦씤??
   62:  *   ???뚮웾? 利됱떆 泥섎━??**"N嫄댁쓣 媛?몄솕?듬땲??** 濡??앸궦?? ??됰쭔 ?먮줈 蹂대궦??
   63:  */
   64: export const IMMEDIATE_APPLY_LIMIT = 50;
   65: 
   66: /**
   67:  * 諛깊븘 ?ㅽ뻾.
   68:  *
   69:  * ??곸씠 ?곸쑝硫?利됱떆 ?쒓퉭?섍퀬, 留롮쑝硫??먯뿉 ?곸옱?쒕떎.
   70:  *
   71:  * @param {object} sub       ??λ맂 援щ룆(?꾨찓??媛앹껜)
   72:  * @returns {Promise<{enqueued:boolean, applied:boolean, tagged:number,
   73:  *                    appJobId:string|null, totalIssues:number, isScanCapped:boolean}>}
   74:  */
   75: export const enqueueSubscriptionBackfill = async (sub) => {
   76:     const budget = createBudget({
   77:         maxRequests: SCAN_BUDGET.maxRequests,
   78:         deadlineAt: Date.now() + SCAN_BUDGET.timeoutMs,
   79:     });
   80: 
   81:     const scan = await scanSubscription(sub, { mode: 'BACKFILL', budget });
   82: 
   83:     // baseline ? 諛깊븘 ON ?대㈃ null ?대씪 ?듭긽 ?꾨웾 ?듦낵?섏?留? 洹쒖튃????긽 ?곸슜?쒕떎
   84:     // (諛깊븘????援щ룆????????⑥닔媛 ?몄텧?섎뒗 ?쇱? ?놁뼱???섍퀬, ?덉뼱???덉뼱 ?섍?吏 ?딄쾶).
   85:     const eligible = filterByBaseline(scan.items, sub.baselineAt).slice(0, MAX_BACKFILL_ISSUES);
   86: 
   87:     const isScanCapped = scan.capped || !scan.completed || eligible.length < scan.items.length;
   88:     const empty = { enqueued: false, applied: false, tagged: 0, appJobId: null, totalIssues: 0, isScanCapped };
   89: 
   90:     if (!eligible.length) return empty;
   91: 
   92:     // ?? ?뚮웾: 洹??먮━?먯꽌 ?앸궦????
   93:     //   ???ㅼ틪??**?꾩＜**?덉쓣 ?뚮쭔?대떎. ?덉궛???뚯쭊??50嫄대쭔 ?쎌? 寃껋씪 ?섎룄 ?덈뒗??
   94:     //     洹멸구 "?꾨?"濡?媛꾩＜?섎㈃ ?섎㉧吏媛 議곗슜??利됱떆 泥섎━ ??곸뿉??鍮좎쭊??
   95:     if (scan.completed && eligible.length <= IMMEDIATE_APPLY_LIMIT) {
   96:         const fieldId = await getProjectIdFieldIdApi();
   97:         if (fieldId) {
   98:             const result = await applyTagging({
   99:                 fieldId,
  100:                 projectId: sub.projectId,
  101:                 issueIds: eligible.map(i => i.issueId),
  102:                 budget,
  103:             });
  104: 
  105:             if (result.tagged > 0) {
  106:                 await incrementTaggedRepository(sub.sourceType, sub.sourceId, result.tagged);
  107: 
  108:                 if (sub.defaultEstimateSeconds) {
  109:                     await applyDefaultEstimate({
  110:                         issueIds: eligible.map(i => i.issueId),
  111:                         defaultEstimateSeconds: sub.defaultEstimateSeconds,
  112:                         budget,
  113:                     }).catch(e => console.error('[SUBSCRIPTION BACKFILL] 湲곕낯 ?덉긽 ?쒓컙 ?곸슜 ?ㅽ뙣(臾댁떆)', e));
  114:                 }
  115: 
  116:                 // ???깅줉??湲곕줉? 諛섎뱶???덉긽 ?쒓컙 **??*?????섏? 媛숈? budget(SCAN_BUDGET, 40?붿껌)??
  117:                 //   ?섎닠 ?곕뒗?? ?덉긽 ?쒓컙? ?대쾲 ?ㅽ뻾???볦튂硫??곴뎄 ?꾨씫(?쒓퉭???댁뒋??`IS EMPTY`
  118:                 //   寃곌낵吏묓빀???ㅼ떆 ???ㅼ뼱?⑤떎)??諛섎㈃ ?깅줉?쇱? best-effort 遺媛 ?뺣낫??
  119:                 // ?몄엯 ?댁뒋???깅줉?쇱쓣 理쒖큹 1??湲곕줉?쒕떎(?묒뾽 ?대젰?먯꽌 "異붿쟻 ???쇰줈 ?⑥? ?딄쾶).
  120:                 await recordAssignedDateOnce({
  121:                     issueIds: eligible.map(i => i.issueId),
  122:                     extra: {assignedVia: ASSIGNED_VIA.SUBSCRIPTION},
  123:                     budget,
  124:                     logPrefix: '[SUBSCRIPTION BACKFILL] ?깅줉??湲곕줉 ?ㅽ뙣(臾댁떆)',
  125:                 }).catch(e => console.error('[SUBSCRIPTION BACKFILL] ?깅줉??湲곕줉 ?ㅽ뙣(臾댁떆)', e));
  126:             }
  127: 
  128:             // ?쇰??쇰룄 ?ㅽ뙣?덉쑝硫??⑥? 嫄?由ъ빻?ㅼ씠 媛?멸컙??IS EMPTY ??硫깅벑)
  129:             return {
  130:                 enqueued: false,
  131:                 applied: true,
  132:                 tagged: result.tagged,
  133:                 appJobId: null,
  134:                 totalIssues: eligible.length,
  135:                 isScanCapped: isScanCapped || result.failed > 0,
  136:             };
  137:         }
  138:         // ?꾨뱶 id 瑜?紐?李얠쑝硫?利됱떆 泥섎━瑜??ш린?섍퀬 ?먮줈 ?섍릿??而⑥뒋癒멸? ?ъ떆?꾪븳??
  139:     }
  140: 
  141:     const issueBatches = chunk(eligible.map(i => i.issueId), BATCH_SIZE);
  142:     const appJobId = `job-${crypto.randomUUID()}`;
  143:     const totalBatches = issueBatches.length;
  144: 
  145:     const batches = issueBatches.map((issueIds, index) => ({
  146:         batchId: `${appJobId}-batch-${index}`,
  147:         batchIndex: index,
  148:         totalBatches,
  149:         // ?뚮퉬 ?쒖젏??洹쒖튃??諛붾뚯뿀?붿? ?뺤씤?????덈룄濡??뚯뒪? generation ???숇큺?쒕떎
  150:         sourceType: sub.sourceType,
  151:         sourceId: sub.sourceId,
  152:         projectId: sub.projectId,
  153:         generation: sub.generation,
  154:         issueIds,
  155:     }));
  156: 
  157:     await jobManager.save(appJobId, {
  158:         id: appJobId,
  159:         total: eligible.length,
  160:         totalBatches,
  161:         processed: 0,
  162:         failed: 0,
  163:         status: 'RUNNING',
  164:     });
  165: 
  166:     await pushQueueEvents({
  167:         queue: createQueue('subscription-backfill-queue'),
  168:         items: batches,
  169:         appJobId,
  170:         concurrencyKey: 'subscription-backfill',
  171:         concurrencyLimit: 2,   // 媛숈? ???꾨뱶??紐곕━??PUT ???듭젣?쒕떎
  172:         chunkSize: 50,
  173:     });
  174: 
  175:     return { enqueued: true, applied: false, tagged: 0, appJobId, totalIssues: eligible.length, isScanCapped };
  176: };

--- src/resolver/utils/job/JobService.js:1-130 ---
    1: import {customEntityManager} from '../../../nosql/query/CustomEntityManager'
    2: import {LogicalError} from '../../../error/LogicalError';
    3: import {ErrorCodes} from '../../../utils/errors/ErrorCodes';
    4: 
    5: 
    6: export const getUploadJobStatusService = async ({jobId} = {}) =>{
    7:     if (typeof jobId !== 'string' || jobId.trim() === '') {
    8:         throw new LogicalError(ErrorCodes.JOB_ID_REQUIRED, 'jobId is required');
    9:     }
   10:     const jobManager = customEntityManager("job");
   11: 
   12:     try {
   13:         const job = await jobManager.findById(jobId);
   14:         // job???щ씪吏?寃껋? ?ㅻ쪟媛 ?꾨땲?? frontend??local tracking留?醫낅즺?쒕떎.
   15:         return {content: {job: job ?? null}};
   16:     } catch (error) {
   17:         throw new LogicalError(
   18:             ErrorCodes.JOB_STATUS_READ_FAILED,
   19:             'Could not read upload job status',
   20:             error,
   21:         );
   22:     }
   23: }
   24: 
   25: export const removeJobService = async ({jobId}) =>{
   26: 
   27:     const jobManager = customEntityManager("job");
   28: 
   29:     await jobManager.delete(jobId);
   30: 
   31:     return ;
   32: }
   33: 
   34: 
   35: export const getFailListService = async ({jobId}) =>{
   36: 
   37:     const jobManager = customEntityManager("job_fail");
   38: 
   39:     return await jobManager.findByWhere(
   40:         "jobId",
   41:         jobId
   42:     );
   43: }
   44: 
   45: export const getAllFailListService = async () =>{
   46: 
   47:     const jobManager = customEntityManager("job_fail");
   48: 
   49:     return  await jobManager.findByField(
   50:         "jobId",
   51:     );
   52: }
   53: 
   54: 
   55: export const removeFailJobListService = async ({jobId}) =>{
   56: 
   57:     const jobManager = customEntityManager("job_fail");
   58: 
   59:     const res = await jobManager.findByWhere(
   60:         "jobId",
   61:         jobId
   62:     );
   63: 
   64:     const items = res?.results ?? [];
   65: 
   66:     await Promise.all(
   67:         items.map(item => jobManager.delete(item.id))
   68:     );
   69: 
   70:     return;
   71: }
   72: 
   73: export const getJobBatchService = async ({jobId}) =>{
   74:     const jobManager = customEntityManager("job_batch");
   75: 
   76:     return await jobManager.findByWhere(
   77:         "jobId",
   78:         jobId
   79:     );
   80: }
   81: 
   82: export const removeJobBatchService = async ({jobId}) =>{
   83:     const jobManager = customEntityManager("job_batch");
   84: 
   85:     const res = await jobManager.findByWhere(
   86:         "jobId",
   87:         jobId
   88:     );
   89: 
   90:     const items = res?.results ?? [];
   91: 
   92:     await Promise.all(
   93:         items.map(item => jobManager.delete(item.key))
   94:     );
   95: 
   96:     return;
   97: }
src/queue\__test__\JobCompletion.test.js-78-const jobStore = () => mockStores.get('job');
src/queue\__test__\JobCompletion.test.js-79-const batchStore = () => mockStores.get('job_batch');
src/queue\__test__\JobCompletion.test.js-80-
src/queue\__test__\JobCompletion.test.js:81:/** batchIndex 번째 배치를 소비한다(items 2건, 그중 failCount 건은 Jira 미검색) */
src/queue\__test__\JobCompletion.test.js:82:const consume = (batchIndex, { emails = ['a@x.com', 'b@x.com'] } = {}) =>
src/queue\__test__\JobCompletion.test.js-83-    uploadUsers({
src/queue\__test__\JobCompletion.test.js-84-        body: {
src/queue\__test__\JobCompletion.test.js:85:            appJobId: APP_JOB_ID,
src/queue\__test__\JobCompletion.test.js:86:            batchId: `${APP_JOB_ID}-batch-${batchIndex}`,
src/queue\__test__\JobCompletion.test.js:87:            batchIndex,
src/queue\__test__\JobCompletion.test.js:88:            totalBatches: TOTAL,
src/queue\__test__\JobCompletion.test.js-89-            items: emails.map(email => ({ email, createdId: 'me', permissionMemberKey: 'pm' })),
src/queue\__test__\JobCompletion.test.js-90-        },
src/queue\__test__\JobCompletion.test.js-91-    });
--
src/queue\__test__\JobCompletion.test.js-105-        .mockImplementation(async (_as, email) => [{ accountId: `acc-${email}` }]);
src/queue\__test__\JobCompletion.test.js-106-
src/queue\__test__\JobCompletion.test.js-107-    await jobStore().save(APP_JOB_ID, {
src/queue\__test__\JobCompletion.test.js:108:        id: APP_JOB_ID, total: TOTAL * 2, totalBatches: TOTAL,
src/queue\__test__\JobCompletion.test.js-109-        processed: 0, failed: 0, status: 'RUNNING',
src/queue\__test__\JobCompletion.test.js-110-    });
src/queue\__test__\JobCompletion.test.js-111-});
--
src/queue\__test__\JobCompletion.test.js-143-
src/queue\__test__\JobCompletion.test.js-144-    /**
src/queue\__test__\JobCompletion.test.js-145-     * 멱등성의 핵심 — 카운터였다면 여기서 done 수가 6이 되어 5개 중 4개만 끝났는데도 완결됐을 것이다.
src/queue\__test__\JobCompletion.test.js:146:     * 레코드 키(`${appJobId}-batch-${index}`)가 유일하므로 재소비는 같은 키를 덮어쓸 뿐이다.
src/queue\__test__\JobCompletion.test.js-147-     */
src/queue\__test__\JobCompletion.test.js-148-    test('재시도로 같은 배치를 다시 소비해도 완료 수가 부풀지 않는다', async () => {
src/queue\__test__\JobCompletion.test.js-149-        for (let i = 0; i < TOTAL - 1; i++) await consume(i);   // 4/5 완료
--
src/queue\__test__\JobCompletion.test.js-179-        expect(batchStore().findById.mock.calls.length).toBe(TOTAL);   // 배치별 중복 소비 가드 1회씩
src/queue\__test__\JobCompletion.test.js-180-    });
src/queue\__test__\JobCompletion.test.js-181-
src/queue\__test__\JobCompletion.test.js:182:    test('totalBatches 가 유효하지 않으면 완료로 판정하지 않는다', async () => {
src/queue\__test__\JobCompletion.test.js-183-        await uploadUsers({
src/queue\__test__\JobCompletion.test.js-184-            body: {
src/queue\__test__\JobCompletion.test.js:185:                appJobId: APP_JOB_ID, batchId: `${APP_JOB_ID}-batch-0`, batchIndex: 0,
src/queue\__test__\JobCompletion.test.js:186:                totalBatches: undefined,
src/queue\__test__\JobCompletion.test.js-187-                items: [{ email: 'a@x.com', createdId: 'me', permissionMemberKey: 'pm' }],
src/queue\__test__\JobCompletion.test.js-188-            },
src/queue\__test__\JobCompletion.test.js-189-        });
--
src/resolver\backoffice\user\UserService.js-581-        throw new LogicalError(ErrorCodes.EMAIL_REQUIRED, ErrorCodes.EMAIL_REQUIRED);
src/resolver\backoffice\user\UserService.js-582-    }
src/resolver\backoffice\user\UserService.js-583-
src/resolver\backoffice\user\UserService.js:584:    const appJobId = `job-${crypto.randomUUID()}`;
src/resolver\backoffice\user\UserService.js-585-    const jobManager = customEntityManager('job');
src/resolver\backoffice\user\UserService.js-586-    // 2개로 이메일 데이터 나누고
src/resolver\backoffice\user\UserService.js-587-    const rawBatches = chunk(items, 20);
src/resolver\backoffice\user\UserService.js:588:    const totalBatches = rawBatches.length;
src/resolver\backoffice\user\UserService.js-589-
src/resolver\backoffice\user\UserService.js-590-    const batches = rawBatches.map((batch, index) => ({
src/resolver\backoffice\user\UserService.js:591:        batchId: `${appJobId}-batch-${index}`,
src/resolver\backoffice\user\UserService.js:592:        batchIndex: index,
src/resolver\backoffice\user\UserService.js:593:        totalBatches,
src/resolver\backoffice\user\UserService.js-594-        items: batch,
src/resolver\backoffice\user\UserService.js-595-    }));
src/resolver\backoffice\user\UserService.js-596-
src/resolver\backoffice\user\UserService.js-597-    // JOB 초기 상태 저장
src/resolver\backoffice\user\UserService.js:598:    await jobManager.save(appJobId, {
src/resolver\backoffice\user\UserService.js:599:        id: appJobId,
src/resolver\backoffice\user\UserService.js-600-        total: items.length,
src/resolver\backoffice\user\UserService.js:601:        totalBatches,
src/resolver\backoffice\user\UserService.js-602-        processed: 0,
src/resolver\backoffice\user\UserService.js-603-        failed: 0,
src/resolver\backoffice\user\UserService.js-604-        status: 'RUNNING',
--
src/resolver\backoffice\user\UserService.js-609-    await pushQueueEvents({
src/resolver\backoffice\user\UserService.js-610-        queue:q,
src/resolver\backoffice\user\UserService.js-611-        items:batches,
src/resolver\backoffice\user\UserService.js:612:        appJobId:appJobId,
src/resolver\backoffice\user\UserService.js-613-        concurrencyKey:"upload-users",
src/resolver\backoffice\user\UserService.js-614-        concurrencyLimit:3, // 동시에 3개의 WORKER 실행
src/resolver\backoffice\user\UserService.js-615-        chunkSize:50,
src/resolver\backoffice\user\UserService.js-616-    })
src/resolver\backoffice\user\UserService.js-617-
src/resolver\backoffice\user\UserService.js-618-    return {
src/resolver\backoffice\user\UserService.js:619:        appJobId : appJobId
src/resolver\backoffice\user\UserService.js-620-    };
src/resolver\backoffice\user\UserService.js-621-};
src/resolver\backoffice\user\UserService.js-622-const chunk = (arr, size) => {
--
src/resolver\projectSubscription\ProjectSubscriptionService.js-438-    // 8) 백필 적재 (P3) — SCAN 을 끝내 대상을 고정한 뒤 큐에 넣는다.
src/resolver\projectSubscription\ProjectSubscriptionService.js-439-    //    ★ 백필 실패가 구독 생성을 되돌리지는 않는다. 구독 자체는 이미 유효하고,
src/resolver\projectSubscription\ProjectSubscriptionService.js-440-    //      적재하지 못한 이슈는 리컨실이 가져온다 → deferred 로 알린다.
src/resolver\projectSubscription\ProjectSubscriptionService.js:441:    let backfillResult = { enqueued: false, applied: false, tagged: 0, deferred: false, appJobId: null, totalIssues: 0, isScanCapped: false };
src/resolver\projectSubscription\ProjectSubscriptionService.js-442-
src/resolver\projectSubscription\ProjectSubscriptionService.js-443-    if (wantsBackfill && saved) {
src/resolver\projectSubscription\ProjectSubscriptionService.js-444-        try {
--
src/resolver\projectSubscription\ProjectSubscriptionService.js-446-            backfillResult = { ...result, deferred: result.isScanCapped };
src/resolver\projectSubscription\ProjectSubscriptionService.js-447-        } catch (e) {
src/resolver\projectSubscription\ProjectSubscriptionService.js-448-            console.error('[SUBSCRIPTION] 백필 적재 실패 — 리컨실에 위임', e);
src/resolver\projectSubscription\ProjectSubscriptionService.js:449:            backfillResult = { enqueued: false, applied: false, tagged: 0, deferred: true, appJobId: null, totalIssues: 0, isScanCapped: false };
src/resolver\projectSubscription\ProjectSubscriptionService.js-450-        }
src/resolver\projectSubscription\ProjectSubscriptionService.js-451-    }
src/resolver\projectSubscription\ProjectSubscriptionService.js-452-
--
src/resolver\projectSubscription\SubscriptionBackfill.js-3- *
src/resolver\projectSubscription\SubscriptionBackfill.js-4- * ── 왜 SCAN 을 먼저 하는가 ────────────────────────────────────────────────
src/resolver\projectSubscription\SubscriptionBackfill.js-5- * 커서를 payload 에 담아 자기 큐에 재귀 push 하는 방식은 기존 진행률 모델과 맞지 않는다.
src/resolver\projectSubscription\SubscriptionBackfill.js:6: * `job` 은 생성 시점에 확정된 `totalBatches` 를 전제로 완료를 판정하기 때문이다
src/resolver\projectSubscription\SubscriptionBackfill.js-7- * (`consumer.js` checkJobCompletion). 페이지 수가 늘어나면 완료가 영영 오지 않는다.
src/resolver\projectSubscription\SubscriptionBackfill.js-8- *   → **SCAN 을 먼저 끝내 대상 목록을 고정**하고, 그 목록으로 batch 수를 확정해 push 한다.
src/resolver\projectSubscription\SubscriptionBackfill.js-9- *     이건 SCAN→APPLY 분리(설계서 §5-2)와도 같은 방향이다.
--
src/resolver\projectSubscription\SubscriptionBackfill.js-70- *
src/resolver\projectSubscription\SubscriptionBackfill.js-71- * @param {object} sub       저장된 구독(도메인 객체)
src/resolver\projectSubscription\SubscriptionBackfill.js-72- * @returns {Promise<{enqueued:boolean, applied:boolean, tagged:number,
src/resolver\projectSubscription\SubscriptionBackfill.js:73: *                    appJobId:string|null, totalIssues:number, isScanCapped:boolean}>}
src/resolver\projectSubscription\SubscriptionBackfill.js-74- */
src/resolver\projectSubscription\SubscriptionBackfill.js-75-export const enqueueSubscriptionBackfill = async (sub) => {
src/resolver\projectSubscription\SubscriptionBackfill.js-76-    const budget = createBudget({
--
src/resolver\projectSubscription\SubscriptionBackfill.js-85-    const eligible = filterByBaseline(scan.items, sub.baselineAt).slice(0, MAX_BACKFILL_ISSUES);
src/resolver\projectSubscription\SubscriptionBackfill.js-86-
src/resolver\projectSubscription\SubscriptionBackfill.js-87-    const isScanCapped = scan.capped || !scan.completed || eligible.length < scan.items.length;
src/resolver\projectSubscription\SubscriptionBackfill.js:88:    const empty = { enqueued: false, applied: false, tagged: 0, appJobId: null, totalIssues: 0, isScanCapped };
src/resolver\projectSubscription\SubscriptionBackfill.js-89-
src/resolver\projectSubscription\SubscriptionBackfill.js-90-    if (!eligible.length) return empty;
src/resolver\projectSubscription\SubscriptionBackfill.js-91-
--
src/resolver\projectSubscription\SubscriptionBackfill.js-130-                enqueued: false,
src/resolver\projectSubscription\SubscriptionBackfill.js-131-                applied: true,
src/resolver\projectSubscription\SubscriptionBackfill.js-132-                tagged: result.tagged,
src/resolver\projectSubscription\SubscriptionBackfill.js:133:                appJobId: null,
src/resolver\projectSubscription\SubscriptionBackfill.js-134-                totalIssues: eligible.length,
src/resolver\projectSubscription\SubscriptionBackfill.js-135-                isScanCapped: isScanCapped || result.failed > 0,
src/resolver\projectSubscription\SubscriptionBackfill.js-136-            };
--
src/resolver\projectSubscription\SubscriptionBackfill.js-139-    }
src/resolver\projectSubscription\SubscriptionBackfill.js-140-
src/resolver\projectSubscription\SubscriptionBackfill.js-141-    const issueBatches = chunk(eligible.map(i => i.issueId), BATCH_SIZE);
src/resolver\projectSubscription\SubscriptionBackfill.js:142:    const appJobId = `job-${crypto.randomUUID()}`;
src/resolver\projectSubscription\SubscriptionBackfill.js:143:    const totalBatches = issueBatches.length;
src/resolver\projectSubscription\SubscriptionBackfill.js-144-
src/resolver\projectSubscription\SubscriptionBackfill.js-145-    const batches = issueBatches.map((issueIds, index) => ({
src/resolver\projectSubscription\SubscriptionBackfill.js:146:        batchId: `${appJobId}-batch-${index}`,
src/resolver\projectSubscription\SubscriptionBackfill.js:147:        batchIndex: index,
src/resolver\projectSubscription\SubscriptionBackfill.js:148:        totalBatches,
src/resolver\projectSubscription\SubscriptionBackfill.js-149-        // 소비 시점에 규칙이 바뀌었는지 확인할 수 있도록 소스와 generation 을 동봉한다
src/resolver\projectSubscription\SubscriptionBackfill.js-150-        sourceType: sub.sourceType,
src/resolver\projectSubscription\SubscriptionBackfill.js-151-        sourceId: sub.sourceId,
--
src/resolver\projectSubscription\SubscriptionBackfill.js-154-        issueIds,
src/resolver\projectSubscription\SubscriptionBackfill.js-155-    }));
src/resolver\projectSubscription\SubscriptionBackfill.js-156-
src/resolver\projectSubscription\SubscriptionBackfill.js:157:    await jobManager.save(appJobId, {
src/resolver\projectSubscription\SubscriptionBackfill.js:158:        id: appJobId,
src/resolver\projectSubscription\SubscriptionBackfill.js-159-        total: eligible.length,
src/resolver\projectSubscription\SubscriptionBackfill.js:160:        totalBatches,
src/resolver\projectSubscription\SubscriptionBackfill.js-161-        processed: 0,
src/resolver\projectSubscription\SubscriptionBackfill.js-162-        failed: 0,
src/resolver\projectSubscription\SubscriptionBackfill.js-163-        status: 'RUNNING',
--
src/resolver\projectSubscription\SubscriptionBackfill.js-166-    await pushQueueEvents({
src/resolver\projectSubscription\SubscriptionBackfill.js-167-        queue: createQueue('subscription-backfill-queue'),
src/resolver\projectSubscription\SubscriptionBackfill.js-168-        items: batches,
src/resolver\projectSubscription\SubscriptionBackfill.js:169:        appJobId,
src/resolver\projectSubscription\SubscriptionBackfill.js-170-        concurrencyKey: 'subscription-backfill',
src/resolver\projectSubscription\SubscriptionBackfill.js-171-        concurrencyLimit: 2,   // 같은 앱 필드에 몰리는 PUT 을 억제한다
src/resolver\projectSubscription\SubscriptionBackfill.js-172-        chunkSize: 50,
src/resolver\projectSubscription\SubscriptionBackfill.js-173-    });
src/resolver\projectSubscription\SubscriptionBackfill.js-174-
src/resolver\projectSubscription\SubscriptionBackfill.js:175:    return { enqueued: true, applied: false, tagged: 0, appJobId, totalIssues: eligible.length, isScanCapped };
src/resolver\projectSubscription\SubscriptionBackfill.js-176-};

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -i --glob '"'!node_modules/**'"' \"eventual|consistent|cursor|nextCursor|kvs.*query|KVS\" CLAUDE.md _workspace/perf-audit src/nosql src/queue static/ui/src | Select-Object -First 240; rg -n \"interface.*ListResult|type.*ListResult|getMany\\(\" node_modules/@forge/kvs node_modules/@forge/api -g '*.d.ts' -g '*.js' | Select-Object -First 120" in C:\CloudJira\moves-workforce
 succeeded in 1404ms:
CLAUDE.md:21:- **DB**: Forge SQL (MySQL/TiDB) + Forge KVS (NoSQL)
CLAUDE.md:23:- **백엔드 의존성**: `@forge/api`, `@forge/sql`, `@forge/kvs`, `@forge/events`, `@forge/resolver`, `exceljs`(엑셀 업로드)
CLAUDE.md:123:- **NoSQL (KVS)**: `src/nosql/query/CustomEntityManager.js` 사용
CLAUDE.md:124:- Storage 엔티티(role, level, team, skill, permission, status, status_link, settings, holiday, job, job_batch, job_fail 등)는 KVS, 프로젝트/사용자/워크로그/구독 데이터는 MySQL
CLAUDE.md:127:- KVS는 **빈 문자열 저장을 거부**한다. 선택 필드는 `|| ''` 대신 속성 자체를 생략할 것
CLAUDE.md:128:- KVS 엔티티에 새 속성을 추가하면 `manifest.yml`의 attributes 선언을 먼저 바꾸고 `forge deploy` 해야 한다 (아니면 저장 시 422)
CLAUDE.md:191:| 테이블 | `components/table/` (`CommonTable`, `PagingTable`, `CursorPagingTable`, `TreeTable`) |
CLAUDE.md:232:- **설치 트리거** (`src/trigger/onInstall.js`): SEED_VERSION 관리, KVS에 기본 데이터 초기화 (시드 값은 `src/seed/SeedData.js`)
CLAUDE.md:270:| 2026-08-10 | 백엔드 등록 패턴 정정(`responseWrapper` → `guardedDefine`) + `PermissionMap` 등록 단계 신설, 「가드 통과 ≠ 데이터 범위 확정」 규약과 KVS `findAll()` 100건 하드캡 추가 | skills/forge-backend-dev, agents/backend-engineer | 스킬이 **폐기된 패턴을 가르치고 있었고** `PermissionMap` 등록이 통째로 빠져 있었다 — 그대로 따르면 신규 resolver가 런타임에 `PERMISSION_UNMAPPED`로 죽는다 |
src/queue\consumer.js:232:/** 완료 판정 스캔의 페이지 크기 (KVS 쿼리 limit 상한) */
src/queue\consumer.js:245: * **전부** 발행해서, job 하나의 KVS 읽기가 `B × (B+1) ≈ B²` 였다(U=5,000 업로드 → 62,750회).
src/queue\consumer.js:250: * 카운터를 따로 두지 않는다. Forge KVS 에는 트랜잭션도 원자적 증가도 없어서
src/nosql\query\CustomEntityManager.js:1:import {Filter, FilterConditions, kvs, WhereConditions} from '@forge/kvs';
src/nosql\query\CustomEntityManager.js:17:                await kvs.entity(entityName).set(id, {...data});
src/nosql\query\CustomEntityManager.js:26:                await kvs.entity(entityName).set(id, {...data},{
src/nosql\query\CustomEntityManager.js:40:                return await kvs.entity(entityName).get(id);
src/nosql\query\CustomEntityManager.js:49:                return await kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:63:                return await kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:77:                return await kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:92:         * 팀은 100개를 넘길 수 있으므로 nextCursor 가 없을 때까지 반복 수집한다.
src/nosql\query\CustomEntityManager.js:93:         * (@forge/kvs 타입 실측: KvsQueryBuilder.cursor() 입력 + ListResult.nextCursor 반환 지원)
src/nosql\query\CustomEntityManager.js:105:                let cursor;
src/nosql\query\CustomEntityManager.js:109:                    let query = kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:114:                    if (cursor) query = query.cursor(cursor);
src/nosql\query\CustomEntityManager.js:119:                    cursor = page?.nextCursor;
src/nosql\query\CustomEntityManager.js:122:                    if (!cursor) break;
src/nosql\query\CustomEntityManager.js:147:         * `findByWhere` 는 `.limit()` 상한에서 잘리고 `nextCursor` 를 버린다 —
src/nosql\query\CustomEntityManager.js:161:                let cursor;
src/nosql\query\CustomEntityManager.js:165:                    let query = kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:171:                    if (cursor) query = query.cursor(cursor);
src/nosql\query\CustomEntityManager.js:176:                    cursor = page?.nextCursor;
src/nosql\query\CustomEntityManager.js:179:                    if (!cursor) break;
src/nosql\query\CustomEntityManager.js:198:                return await kvs.entity(entityName)
src/nosql\query\CustomEntityManager.js:214:                await kvs.entity(entityName).delete(id);
src/queue\__test__\JobCompletion.test.js:10:const mockKvsPageReads = { count: 0 };
src/queue\__test__\JobCompletion.test.js:30:                mockKvsPageReads.count += 1;          // KVS 왕복 1회 = 페이지 1장
src/queue\__test__\JobCompletion.test.js:94:    mockKvsPageReads.count = 0;
src/queue\__test__\JobCompletion.test.js:172:    test('KVS 읽기가 배치 수의 제곱이 아니라 판정 1회당 1페이지다 (A-4)', async () => {
src/queue\__test__\JobCompletion.test.js:176:        expect(mockKvsPageReads.count).toBe(TOTAL);
src/queue\__test__\JobCompletion.test.js:177:        expect(mockKvsPageReads.count).toBeLessThan(TOTAL * (TOTAL + 1));
static/ui/src\components\avatar\AvatarStack.jsx:60:                                cursor: 'pointer',
static/ui/src\components\avatar\AvatarStack.jsx:89:                            cursor: 'default',
static/ui/src\components\card\Card.jsx:74:            style={{ cursor: "pointer", display: "flex", alignItems: "center", color: token("color.text.subtle", "#6B778C") }}
static/ui/src\components\card\CardFullscreen.jsx:56:                <div onClick={onClose} style={{ cursor: 'pointer', padding: 4 }}>
static/ui/src\components\drawer\SideDrawer.jsx:87:        const prevCursor = document.body.style.cursor;
static/ui/src\components\drawer\SideDrawer.jsx:89:        document.body.style.cursor = 'col-resize';
static/ui/src\components\drawer\SideDrawer.jsx:96:            document.body.style.cursor = prevCursor;
static/ui/src\components\drawer\SideDrawer.jsx:145:                        cursor: 'col-resize',
static/ui/src\components\calendar\FullCalendar.css:79:    cursor: not-allowed;
static/ui/src\components\calendar\FullCalendar.css:144:    cursor: pointer;
static/ui/src\components\card\collapse\CardCollapseButton.css:16:    cursor: pointer;
static/ui/src\components\chart\ViewToggleButtons.jsx:28:                cursor: 'pointer',
static/ui/src\components\chart\layout\ChartCard.jsx:96:                                style={{ cursor: "grab", display: "flex", alignItems: "center", color: token("color.icon.brand", "#0052CC"), flexShrink: 0 }}
static/ui/src\components\chart\layout\ChartCard.jsx:143:                                style={{ cursor: "pointer", padding: 4 }}
static/ui/src\components\chart\layout\ChartCard.jsx:150:                                <Box onClick={(e) => { e.stopPropagation(); setFullscreen(true); }} style={{ cursor: "pointer", padding: 4 }}>
static/ui/src\components\chart\layout\ChartCard.jsx:155:                                    <Box onClick={(e) => { e.stopPropagation(); onRefresh(); }} style={{ cursor: "pointer", padding: 4 }}>
_workspace/perf-audit\BACKEND_2026-08-12.md:13:| 자원 분석의 프로젝트 단위 1회 페치 + KVS 캐시(Forge SQL 적재 배제) | 의도적 결정 |
_workspace/perf-audit\BACKEND_2026-08-12.md:76:## A-2. 진척도·비용 탭의 10분 KVS 캐시가 **Jira 호출을 한 건도 줄이지 못한다**
_workspace/perf-audit\BACKEND_2026-08-12.md:95:`issues[]`/`byIssue[]` 가 KVS 값 상한(240KiB) 때문에 캐시에서 빠져 있고, 그걸 재구성하려면 결국 원본을 다시 페치해야 하는 구조다. `ProjectCostService.js:70-71` 주석이 이미 인지하고 있다 — *"이 경로는 이미 워크로그·이슈 전량을 재페치하므로"*.
_workspace/perf-audit\BACKEND_2026-08-12.md:101:- **수정 방향**: (a) 캐시 대상을 뒤집는다 — `issues[]`/`byIssue[]` 를 별도 KVS 키로 **청크 분할 저장**(240KiB 상한 회피), 또는 (b) `ProjectRaw:{projectId}` 5분 TTL 공유 캐시를 두고 진척·비용·byIssue 재구성이 **같은 원시 페치 결과 위에서 계산만** 한다. (b)가 탭 간 중복(B-14)까지 함께 없앤다.
_workspace/perf-audit\BACKEND_2026-08-12.md:116:**URL이 문자 단위로 같다.** 두 함수는 같은 데이터를 각자 전량 페이지 루프로 긁어와 집계만 다르게 한다(담당자별 건수 / 이슈별 참여자 수). `getChartDataset`(`:176-211`)이 이 둘을 별개 `dataType`(`assignee` / `issue`)으로 분기하므로 두 위젯이 같이 놓이면 **같은 스캔이 2벌** 나간다. 워크로그 위젯만 10분 KVS 캐시가 있고(`WorklogService.js:26-47`) assignee/issue 위젯에는 캐시가 **없다**.
_workspace/perf-audit\BACKEND_2026-08-12.md:119:  `level`/`role`/`team` 위젯은 각각 KVS 마스터 사전 스캔 1~2회씩(A-7과 곱해진다).
_workspace/perf-audit\BACKEND_2026-08-12.md:121:- **수정 방향**: ① `getAssigneeStats`/`getIssueParticipantStats` 를 **1패스 페처 + 2집계**로 합친다(공통 페처 격리 원칙에 맞게 `projectDashboard` 전용 페처 신설). ② 워크로그 위젯과 동일하게 `Assignee:{projectId}` 10분 KVS 캐시를 붙여 위젯 간·재방문 간 중복을 흡수한다.
_workspace/perf-audit\BACKEND_2026-08-12.md:123:## A-4. 큐 완료 판정이 배치마다 전량 fan-in — KVS 읽기가 배치 수의 **제곱**
_workspace/perf-audit\BACKEND_2026-08-12.md:138:- **비용**: `KVS_reads = B × (B+1) ≈ B²`
_workspace/perf-audit\BACKEND_2026-08-12.md:191:- **비용(캐시 미스 1회당)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
_workspace/perf-audit\BACKEND_2026-08-12.md:192:  `/backoffice/users` 진입(동시 invoke 6개) = Jira **6회** + SQL **6회** + KVS **12회**가 순수 가드 고정비.
_workspace/perf-audit\BACKEND_2026-08-12.md:201:`getTeamIndex()` 만 60초 모듈 TTL 캐시를 갖는다(`backoffice/team/TeamTreeCache.js:95-104`). 나머지는 호출마다 KVS를 친다.
_workspace/perf-audit\BACKEND_2026-08-12.md:203:| 서비스 | 위치 | 1회 KVS 비용 |
_workspace/perf-audit\BACKEND_2026-08-12.md:212:- **비용 ① `/backoffice/users` 진입**: `roleLevelMap()`(`UserService.js:151-171`)이 `getUserListWithPaging`·`getUserMetaCount`(`:785`) 두 경로에서 각각 호출되고, 프론트가 `getRoleList`/`getLevelList`/`getPermissionList` 를 또 독립 호출 → **role 3 + level 3 + permission 3 = KVS 9회**(필요분 3회).
_workspace/perf-audit\BACKEND_2026-08-12.md:279:- **비용**: 실패 1건 = KVS 엔트리 1개 **영구 잔존**. 1,000명 업로드에서 미존재 이메일 5%면 회당 50건, 주 1회 운영이면 연 2,600건.
_workspace/perf-audit\BACKEND_2026-08-12.md:343:    buildPeopleContext(),   // 전 사용자 SQL + Jira bulk + KVS 6종 + 스킬 매핑 SQL
_workspace/perf-audit\BACKEND_2026-08-12.md:353:- **수정 방향**: 프로필 전용 경량 분기(`findUsersRepository({users:[accountId]})` + `SELECT_SKILL_IDS_BY_ACCOUNT`), `skillMap`(KVS)만 공유. 중복 `getRoleListService()` 제거.
_workspace/perf-audit\BACKEND_2026-08-12.md:369:## B-10. `onIssueCreated` — 구독과 무관한 사이트 전 이슈 생성마다 라이선스 KVS 조회가 먼저 돈다
_workspace/perf-audit\BACKEND_2026-08-12.md:375:if (await isLicenseBlocked()) return;                // 2) KVS get (+TTL 만료 시 License API)
_workspace/perf-audit\BACKEND_2026-08-12.md:382:- **비용(미매칭 이슈 1건당)**: KVS 1 + SQL 1~2(콜드 isolate면 `information_schema` 1회 추가 — `TableReadiness.js:36-53` 의 `readyTables` 는 isolate 수명 캐시).
_workspace/perf-audit\BACKEND_2026-08-12.md:383:  이슈 300건/일 → KVS 300 + SQL 300~600회/일. 2,000건/일 사이트면 KVS 2,000 + SQL 최대 4,000회/일.
_workspace/perf-audit\BACKEND_2026-08-12.md:384:  라이선스 API 자체는 KVS 캐시 TTL(1h)로 ≤24회/일이나 **UNAVAILABLE 에 빠지면 TTL 60s라 ≤1,440회/일 + 매번 KVS write** 로 뛴다.
_workspace/perf-audit\BACKEND_2026-08-12.md:422:findByAccountId(SQL) → getBulkJiraUsersApi(Jira) → getTeamIndex(KVS) → resolveSalaryPolicySafe(KVS) → getLevelListService(KVS)
_workspace/perf-audit\BACKEND_2026-08-12.md:441:## B-15. 상태 삭제/정렬이 SQL·KVS N+1 순차 — 여기에 B-14가 곱해진다
_workspace/perf-audit\BACKEND_2026-08-12.md:462:- **수정 방향**: 세 resolver를 한 진입 단위로 합치거나 `buildPeopleContext` 결과를 60초 TTL KVS 캐시로 공유한다.
_workspace/perf-audit\BACKEND_2026-08-12.md:477:| C-1 | `src\resolver\myWork\MyWorkService.jsx:18-22` | role/level/status를 **id마다 개별 `findById`**(KVS N+1, 동시성 제한 없음, 3중 `Promise.all` 중첩). 프로젝트 30개·distinct 16종이면 KVS get 16회 — 목록 서비스 3회면 충분 | `getRoleListService`+`getLevelListService`+`getProjectStatusListService` 로 교체(`UserService.roleLevelMap()` 과 같은 패턴) |
_workspace/perf-audit\BACKEND_2026-08-12.md:481:| C-5 | `src\utils\license\LicenseGuard.js:112-134` | `ResponseWrapper.js:7` 이 모든 resolver를 감싸므로 production에서 `context.license.active` 부재 시 **invoke 1건당 KVS get 1회**. `PrincipalResolver` 는 같은 문제를 30초 L1로 막았는데 여기엔 L1이 없다 | KVS TTL을 미러링하는 모듈 스코프 L1 추가 |
_workspace/perf-audit\BACKEND_2026-08-12.md:487:| C-11 | `src\queue\consumer.js:45-70` | 실패 항목마다 `await jobFailManager.save(...)` 순차. 배치 20건 전량 실패 시 KVS write 20회 직렬 | 실패 목록을 모아 `Promise.all` |
_workspace/perf-audit\BACKEND_2026-08-12.md:511:| **배치의 공통 자원 호이스팅** | `PortfolioAggregator.js:490-509` 가 settings·holiday·coworkerFieldId·`policyCtx` 를 루프 **밖 1회**로 조달해 프로젝트별 주입. 주석이 *"aggregateOneProject 안에서 로드하면 프로젝트 수 × KVS 왕복 = 성능 사고"* 라고 못박아 뒀다 — 모범 사례 | **통과** |
_workspace/perf-audit\BACKEND_2026-08-12.md:512:| **`resolvePrincipal` 조회 수** | 30초 L1 + KVS는 `permission` `findById` 1회, 팀 스코프 조회는 `isTeamLead \|\| TEAM_ONLY` 일 때만(`:151-158`), 두 프로젝트 id 조회는 `Promise.all`(`:402-404`) | **통과**(동시 진입 시 캐시 미적중은 A-6) |
_workspace/perf-audit\BACKEND_2026-08-12.md:513:| **`TeamTreeCache`** | 60초 TTL, 쓰기 경로만 `loadTeamIndexFresh`. 팀 100개 이하면 miss 시 KVS 1회 | **통과** |
_workspace/perf-audit\BACKEND_2026-08-12.md:529:| **TTL 있는 KVS 캐시** | `ProjectProgress`/`ProjectCost`(10분), `ResourceAnalysis`(5·10분), `WorklogService`(10분), 라이선스(1h/1분) 모두 TTL 지정 — 무한 누적 없음. `ProjectService.js:105·110` 이 프로젝트 삭제 시 파생 캐시 키를 명시 delete | **통과**(캐시 **효과**는 A-2) |
_workspace/perf-audit\BACKEND_2026-08-12.md:547:| KVS/SQL 왕복의 실제 지연(ms) | 호출 **횟수**만 셌다. "몇 초 빨라지는가"는 배포 환경 실측 필요 |
_workspace/perf-audit\FRONTEND_2026-08-12.md:318:**배수**: 공용 표 인스턴스 총 **65개**(`CommonTable` 37 + `ChartTableToggle` 24 + `CursorPagingTable` 3 + `PagingTable` 1).
_workspace/perf-audit\FRONTEND_2026-08-12.md:368:`pages/projectDetail/salary/SalaryManagementPage.jsx:135-136`. `projectKeys.salary(project_id)` 를 page 없이 부르면 **프리픽스**(`utils/queryKey/projectKeys.js:91-93`)라 캐시된 모든 페이지가 재조회되고, `projectKeys.cost` 는 KVS 10분 캐시로 보호되는 가장 무거운 원가 집계를 버린다. staleTime 이 없으니 `getUser` 10회 웨이브(P1-4)까지 따라온다.
_workspace/perf-audit\03_verify_stage12.md:98:**문제:** Forge 는 다중 인스턴스라 `invalidateDictionary` 는 **쓰기를 처리한 인스턴스에만** 적용된다. 저장 직후의 재조회가 다른(따뜻한) 인스턴스로 라우팅되면 **방금 추가/수정/삭제한 항목이 목록에 없다** — 최대 60초. 사용자에게는 "저장이 안 됐다"로 보이고, 다시 저장하면 이름 중복 검증(`checkDuplicated`, KVS 직접 조회)에 걸려 **"목록엔 없는데 저장은 거부"** 라는 최악의 조합이 된다.
_workspace/perf-audit\03_verify_stage12.md:175:- **쓰기 검증은 캐시 밖**: `checkDuplicated`(`findByWhere`)·`findById` 전부 KVS 직접 조회 확인.
_workspace/perf-audit\03_verify_stage12.md:207:| A-3 에서 KVS 공유 캐시를 기각하고 **메모리 + viewerId 키** | **타당.** 검색이 `as:'user'` 라 결과가 호출자 권한으로 필터링된다 — `projectId` 만으로 KVS 를 공유하면 가시 범위가 섞인다. `viewerId` 누락 시 캐시 미사용(fail-safe)까지 맞다 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:84:- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:398:- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:733:- **?깅뒫 ?꾨컲:** ?뚰겕濡쒓렇 ?ㅺ굔 議고쉶媛 怨듯넻 ?섏튂 寃쎈줈瑜??섏젙?덈뒗媛(湲덉?)? ?꾩슜 蹂묐젹 ?섏쿂 + `p-limit`?멸?? Resource 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆?멸??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:873:+         * `findByWhere` 는 `.limit()` 상한에서 잘리고 `nextCursor` 를 버린다 —
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:887:+                let cursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:891:+                    let query = kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:897:+                    if (cursor) query = query.cursor(cursor);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:902:+                    cursor = page?.nextCursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:905:+                    if (!cursor) break;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:924:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:936:  *   - 비admin: Jira 1 + users SQL 1 + KVS permission 1 + 팀 인덱스(60초 캐시)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1003:     //    ★ 팀 컨텍스트를 **계산하지 않는다.** KVS team.leaderAccountId 에 이 계정이 stale 하게
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1012:+/** 완료 판정 스캔의 페이지 크기 (KVS 쿼리 limit 상한) */
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1025:+ * **전부** 발행해서, job 하나의 KVS 읽기가 `B × (B+1) ≈ B²` 였다(U=5,000 업로드 → 62,750회).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1030:+ * 카운터를 따로 두지 않는다. Forge KVS 에는 트랜잭션도 원자적 증가도 없어서
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1393:| ?먯썝 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆(Forge SQL ?곸옱 諛곗젣) | ?섎룄??寃곗젙 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1453:## A-2. 吏꾩쿃?꽷룸퉬????쓽 10遺?KVS 罹먯떆媛 **Jira ?몄텧????嫄대룄 以꾩씠吏 紐삵븳??*
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1470:`issues[]`/`byIssue[]` 媛 KVS 媛??곹븳(240KiB) ?뚮Ц??罹먯떆?먯꽌 鍮좎졇 ?덇퀬, 洹멸구 ?ш뎄?깊븯?ㅻ㈃ 寃곌뎅 ?먮낯???ㅼ떆 ?섏튂?댁빞 ?섎뒗 援ъ“?? `ProjectCostService.js:70-71` 二쇱꽍???대? ?몄??섍퀬 ?덈떎 ??*"??寃쎈줈???대? ?뚰겕濡쒓렇쨌?댁뒋 ?꾨웾???ы럹移섑븯誘濡?*.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1476:- **?섏젙 諛⑺뼢**: (a) 罹먯떆 ??곸쓣 ?ㅼ쭛?붾떎 ??`issues[]`/`byIssue[]` 瑜?蹂꾨룄 KVS ?ㅻ줈 **泥?겕 遺꾪븷 ???*(240KiB ?곹븳 ?뚰뵾), ?먮뒗 (b) `ProjectRaw:{projectId}` 5遺?TTL 怨듭쑀 罹먯떆瑜??먭퀬 吏꾩쿃쨌鍮꾩슜쨌byIssue ?ш뎄?깆씠 **媛숈? ?먯떆 ?섏튂 寃곌낵 ?꾩뿉??怨꾩궛留?* ?쒕떎. (b)媛 ??媛?以묐났(B-14)源뚯? ?④퍡 ?놁븻??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1491:**URL??臾몄옄 ?⑥쐞濡?媛숇떎.** ???⑥닔??媛숈? ?곗씠?곕? 媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곸뼱? 吏묎퀎留??ㅻⅤ寃??쒕떎(?대떦?먮퀎 嫄댁닔 / ?댁뒋蹂?李몄뿬????. `getChartDataset`(`:176-211`)?????섏쓣 蹂꾧컻 `dataType`(`assignee` / `issue`)?쇰줈 遺꾧린?섎?濡????꾩젽??媛숈씠 ?볦씠硫?**媛숈? ?ㅼ틪??2踰?* ?섍컙?? ?뚰겕濡쒓렇 ?꾩젽留?10遺?KVS 罹먯떆媛 ?덇퀬(`WorklogService.js:26-47`) assignee/issue ?꾩젽?먮뒗 罹먯떆媛 **?녿떎**.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1494:  `level`/`role`/`team` ?꾩젽? 媛곴컖 KVS 留덉뒪???ъ쟾 ?ㅼ틪 1~2?뚯뵫(A-7怨?怨깊빐吏꾨떎).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1496:- **?섏젙 諛⑺뼢**: ??`getAssigneeStats`/`getIssueParticipantStats` 瑜?**1?⑥뒪 ?섏쿂 + 2吏묎퀎**濡??⑹튇??怨듯넻 ?섏쿂 寃⑸━ ?먯튃??留욊쾶 `projectDashboard` ?꾩슜 ?섏쿂 ?좎꽕). ???뚰겕濡쒓렇 ?꾩젽怨??숈씪?섍쾶 `Assignee:{projectId}` 10遺?KVS 罹먯떆瑜?遺숈뿬 ?꾩젽 媛꽷룹옱諛⑸Ц 媛?以묐났???≪닔?쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1498:## A-4. ???꾨즺 ?먯젙??諛곗튂留덈떎 ?꾨웾 fan-in ??KVS ?쎄린媛 諛곗튂 ?섏쓽 **?쒓낢**
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1513:- **鍮꾩슜**: `KVS_reads = B 횞 (B+1) ??B짼`
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1563:- **鍮꾩슜(罹먯떆 誘몄뒪 1?뚮떦)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1564:  `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? = Jira **6??* + SQL **6??* + KVS **12??*媛 ?쒖닔 媛??怨좎젙鍮?
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1573:`getTeamIndex()` 留?60珥?紐⑤뱢 TTL 罹먯떆瑜?媛뽯뒗??`backoffice/team/TeamTreeCache.js:95-104`). ?섎㉧吏???몄텧留덈떎 KVS瑜?移쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1575:| ?쒕퉬??| ?꾩튂 | 1??KVS 鍮꾩슜 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1584:- **鍮꾩슜 ??`/backoffice/users` 吏꾩엯**: `roleLevelMap()`(`UserService.js:151-171`)??`getUserListWithPaging`쨌`getUserMetaCount`(`:785`) ??寃쎈줈?먯꽌 媛곴컖 ?몄텧?섍퀬, ?꾨줎?멸? `getRoleList`/`getLevelList`/`getPermissionList` 瑜????낅┰ ?몄텧 ??**role 3 + level 3 + permission 3 = KVS 9??*(?꾩슂遺?3??.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1726:| ?먯썝 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆(Forge SQL ?곸옱 諛곗젣) | ?섎룄??寃곗젙 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1786:## A-2. 吏꾩쿃?꽷룸퉬????쓽 10遺?KVS 罹먯떆媛 **Jira ?몄텧????嫄대룄 以꾩씠吏 紐삵븳??*
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1803:`issues[]`/`byIssue[]` 媛 KVS 媛??곹븳(240KiB) ?뚮Ц??罹먯떆?먯꽌 鍮좎졇 ?덇퀬, 洹멸구 ?ш뎄?깊븯?ㅻ㈃ 寃곌뎅 ?먮낯???ㅼ떆 ?섏튂?댁빞 ?섎뒗 援ъ“?? `ProjectCostService.js:70-71` 二쇱꽍???대? ?몄??섍퀬 ?덈떎 ??*"??寃쎈줈???대? ?뚰겕濡쒓렇쨌?댁뒋 ?꾨웾???ы럹移섑븯誘濡?*.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1809:- **?섏젙 諛⑺뼢**: (a) 罹먯떆 ??곸쓣 ?ㅼ쭛?붾떎 ??`issues[]`/`byIssue[]` 瑜?蹂꾨룄 KVS ?ㅻ줈 **泥?겕 遺꾪븷 ???*(240KiB ?곹븳 ?뚰뵾), ?먮뒗 (b) `ProjectRaw:{projectId}` 5遺?TTL 怨듭쑀 罹먯떆瑜??먭퀬 吏꾩쿃쨌鍮꾩슜쨌byIssue ?ш뎄?깆씠 **媛숈? ?먯떆 ?섏튂 寃곌낵 ?꾩뿉??怨꾩궛留?* ?쒕떎. (b)媛 ??媛?以묐났(B-14)源뚯? ?④퍡 ?놁븻??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1824:**URL??臾몄옄 ?⑥쐞濡?媛숇떎.** ???⑥닔??媛숈? ?곗씠?곕? 媛곸옄 ?꾨웾 ?섏씠吏 猷⑦봽濡?湲곸뼱? 吏묎퀎留??ㅻⅤ寃??쒕떎(?대떦?먮퀎 嫄댁닔 / ?댁뒋蹂?李몄뿬????. `getChartDataset`(`:176-211`)?????섏쓣 蹂꾧컻 `dataType`(`assignee` / `issue`)?쇰줈 遺꾧린?섎?濡????꾩젽??媛숈씠 ?볦씠硫?**媛숈? ?ㅼ틪??2踰?* ?섍컙?? ?뚰겕濡쒓렇 ?꾩젽留?10遺?KVS 罹먯떆媛 ?덇퀬(`WorklogService.js:26-47`) assignee/issue ?꾩젽?먮뒗 罹먯떆媛 **?녿떎**.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1827:  `level`/`role`/`team` ?꾩젽? 媛곴컖 KVS 留덉뒪???ъ쟾 ?ㅼ틪 1~2?뚯뵫(A-7怨?怨깊빐吏꾨떎).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1829:- **?섏젙 諛⑺뼢**: ??`getAssigneeStats`/`getIssueParticipantStats` 瑜?**1?⑥뒪 ?섏쿂 + 2吏묎퀎**濡??⑹튇??怨듯넻 ?섏쿂 寃⑸━ ?먯튃??留욊쾶 `projectDashboard` ?꾩슜 ?섏쿂 ?좎꽕). ???뚰겕濡쒓렇 ?꾩젽怨??숈씪?섍쾶 `Assignee:{projectId}` 10遺?KVS 罹먯떆瑜?遺숈뿬 ?꾩젽 媛꽷룹옱諛⑸Ц 媛?以묐났???≪닔?쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1831:## A-4. ???꾨즺 ?먯젙??諛곗튂留덈떎 ?꾨웾 fan-in ??KVS ?쎄린媛 諛곗튂 ?섏쓽 **?쒓낢**
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1846:- **鍮꾩슜**: `KVS_reads = B 횞 (B+1) ??B짼`
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1896:- **鍮꾩슜(罹먯떆 誘몄뒪 1?뚮떦)**: Jira 1(`/mypermissions`) + SQL 1~4 + KVS 2(team index + permission set).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1897:  `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? = Jira **6??* + SQL **6??* + KVS **12??*媛 ?쒖닔 媛??怨좎젙鍮?
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1906:`getTeamIndex()` 留?60珥?紐⑤뱢 TTL 罹먯떆瑜?媛뽯뒗??`backoffice/team/TeamTreeCache.js:95-104`). ?섎㉧吏???몄텧留덈떎 KVS瑜?移쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1908:| ?쒕퉬??| ?꾩튂 | 1??KVS 鍮꾩슜 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1917:- **鍮꾩슜 ??`/backoffice/users` 吏꾩엯**: `roleLevelMap()`(`UserService.js:151-171`)??`getUserListWithPaging`쨌`getUserMetaCount`(`:785`) ??寃쎈줈?먯꽌 媛곴컖 ?몄텧?섍퀬, ?꾨줎?멸? `getRoleList`/`getLevelList`/`getPermissionList` 瑜????낅┰ ?몄텧 ??**role 3 + level 3 + permission 3 = KVS 9??*(?꾩슂遺?3??.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:1980:- **鍮꾩슜**: ?ㅽ뙣 1嫄?= KVS ?뷀듃由?1媛?**?곴뎄 ?붿〈**. 1,000紐??낅줈?쒖뿉??誘몄〈???대찓??5%硫??뚮떦 50嫄? 二?1???댁쁺?대㈃ ??2,600嫄?
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2042:    buildPeopleContext(),   // ???ъ슜??SQL + Jira bulk + KVS 6醫?+ ?ㅽ궗 留ㅽ븨 SQL
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2052:- **?섏젙 諛⑺뼢**: ?꾨줈???꾩슜 寃쎈웾 遺꾧린(`findUsersRepository({users:[accountId]})` + `SELECT_SKILL_IDS_BY_ACCOUNT`), `skillMap`(KVS)留?怨듭쑀. 以묐났 `getRoleListService()` ?쒓굅.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2067:## B-10. `onIssueCreated` ??援щ룆怨?臾닿????ъ씠?????댁뒋 ?앹꽦留덈떎 ?쇱씠?좎뒪 KVS 議고쉶媛 癒쇱? ?덈떎
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2073:if (await isLicenseBlocked()) return;                // 2) KVS get (+TTL 留뚮즺 ??License API)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2079:- **鍮꾩슜(誘몃ℓ移??댁뒋 1嫄대떦)**: KVS 1 + SQL 1~2(肄쒕뱶 isolate硫?`information_schema` 1??異붽? ??`TableReadiness.js:36-53` ??`readyTables` ??isolate ?섎챸 罹먯떆).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2080:  ?댁뒋 300嫄?????KVS 300 + SQL 300~600???? 2,000嫄????ъ씠?몃㈃ KVS 2,000 + SQL 理쒕? 4,000????
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2081:  ?쇱씠?좎뒪 API ?먯껜??KVS 罹먯떆 TTL(1h)濡???4???쇱씠??**UNAVAILABLE ??鍮좎?硫?TTL 60s????,440????+ 留ㅻ쾲 KVS write** 濡??대떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2117:findByAccountId(SQL) ??getBulkJiraUsersApi(Jira) ??getTeamIndex(KVS) ??resolveSalaryPolicySafe(KVS) ??getLevelListService(KVS)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2136:## B-15. ?곹깭 ??젣/?뺣젹??SQL쨌KVS N+1 ?쒖감 ???ш린??B-14媛 怨깊빐吏꾨떎
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2157:- **?섏젙 諛⑺뼢**: ??resolver瑜???吏꾩엯 ?⑥쐞濡??⑹튂嫄곕굹 `buildPeopleContext` 寃곌낵瑜?60珥?TTL KVS 罹먯떆濡?怨듭쑀?쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2172:| C-1 | `src\resolver\myWork\MyWorkService.jsx:18-22` | role/level/status瑜?**id留덈떎 媛쒕퀎 `findById`**(KVS N+1, ?숈떆???쒗븳 ?놁쓬, 3以?`Promise.all` 以묒꺽). ?꾨줈?앺듃 30媛쑣톎istinct 16醫낆씠硫?KVS get 16????紐⑸줉 ?쒕퉬??3?뚮㈃ 異⑸텇 | `getRoleListService`+`getLevelListService`+`getProjectStatusListService` 濡?援먯껜(`UserService.roleLevelMap()` 怨?媛숈? ?⑦꽩) |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2176:| C-5 | `src\utils\license\LicenseGuard.js:112-134` | `ResponseWrapper.js:7` ??紐⑤뱺 resolver瑜?媛먯떥誘濡?production?먯꽌 `context.license.active` 遺????**invoke 1嫄대떦 KVS get 1??*. `PrincipalResolver` ??媛숈? 臾몄젣瑜?30珥?L1濡?留됱븯?붾뜲 ?ш린??L1???녿떎 | KVS TTL??誘몃윭留곹븯??紐⑤뱢 ?ㅼ퐫??L1 異붽? |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2182:| C-11 | `src\queue\consumer.js:45-70` | ?ㅽ뙣 ??ぉ留덈떎 `await jobFailManager.save(...)` ?쒖감. 諛곗튂 20嫄??꾨웾 ?ㅽ뙣 ??KVS write 20??吏곷젹 | ?ㅽ뙣 紐⑸줉??紐⑥븘 `Promise.all` |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2205:| **諛곗튂??怨듯넻 ?먯썝 ?몄씠?ㅽ똿** | `PortfolioAggregator.js:490-509` 媛 settings쨌holiday쨌coworkerFieldId쨌`policyCtx` 瑜?猷⑦봽 **諛?1??*濡?議곕떖???꾨줈?앺듃蹂?二쇱엯. 二쇱꽍??*"aggregateOneProject ?덉뿉??濡쒕뱶?섎㈃ ?꾨줈?앺듃 ??횞 KVS ?뺣났 = ?깅뒫 ?ш퀬"* ?쇨퀬 紐삳컯???????紐⑤쾾 ?щ? | **?듦낵** |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2206:| **`resolvePrincipal` 議고쉶 ??* | 30珥?L1 + KVS??`permission` `findById` 1?? ? ?ㅼ퐫??議고쉶??`isTeamLead \|\| TEAM_ONLY` ???뚮쭔(`:151-158`), ???꾨줈?앺듃 id 議고쉶??`Promise.all`(`:402-404`) | **?듦낵**(?숈떆 吏꾩엯 ??罹먯떆 誘몄쟻以묒? A-6) |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2207:| **`TeamTreeCache`** | 60珥?TTL, ?곌린 寃쎈줈留?`loadTeamIndexFresh`. ? 100媛??댄븯硫?miss ??KVS 1??| **?듦낵** |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2223:| **TTL ?덈뒗 KVS 罹먯떆** | `ProjectProgress`/`ProjectCost`(10遺?, `ResourceAnalysis`(5쨌10遺?, `WorklogService`(10遺?, ?쇱씠?좎뒪(1h/1遺? 紐⑤몢 TTL 吏????臾댄븳 ?꾩쟻 ?놁쓬. `ProjectService.js:105쨌110` ???꾨줈?앺듃 ??젣 ???뚯깮 罹먯떆 ?ㅻ? 紐낆떆 delete | **?듦낵**(罹먯떆 **?④낵**??A-2) |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2241:| KVS/SQL ?뺣났???ㅼ젣 吏??ms) | ?몄텧 **?잛닔**留??뚮떎. "紐?珥?鍮⑤씪吏?붽?"??諛고룷 ?섍꼍 ?ㅼ륫 ?꾩슂 |
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2558:**諛곗닔**: 怨듭슜 ???몄뒪?댁뒪 珥?**65媛?*(`CommonTable` 37 + `ChartTableToggle` 24 + `CursorPagingTable` 3 + `PagingTable` 1).
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:2605:### P2-3. 湲됱뿬 ?몄쭛 1??= 湲됱뿬 ???섏씠吏 ?ъ“??+ ?먭? ?ъ쭛怨?`pages/projectDetail/salary/SalaryManagementPage.jsx:135-136`. `projectKeys.salary(project_id)` 瑜?page ?놁씠 遺瑜대㈃ **?꾨━?쎌뒪**(`utils/queryKey/projectKeys.js:91-93`)??罹먯떆??紐⑤뱺 ?섏씠吏媛 ?ъ“?뚮릺怨? `projectKeys.cost` ??KVS 10遺?罹먯떆濡?蹂댄샇?섎뒗 媛??臾닿굅???먭? 吏묎퀎瑜?踰꾨┛?? staleTime ???놁쑝??`getUser` 10???⑥씠釉?P1-4)源뚯? ?곕씪?⑤떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3064:  232: /** ?꾨즺 ?먯젙 ?ㅼ틪???섏씠吏 ?ш린 (KVS 荑쇰━ limit ?곹븳) */
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3077:  245:  * **?꾨?** 諛쒗뻾?댁꽌, job ?섎굹??KVS ?쎄린媛 `B 횞 (B+1) ??B짼` ???U=5,000 ?낅줈????62,750??.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3082:  250:  * 移댁슫?곕? ?곕줈 ?먯? ?딅뒗?? Forge KVS ?먮뒗 ?몃옖??뀡???먯옄??利앷????놁뼱??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3141:    1: import {Filter, FilterConditions, kvs, WhereConditions} from '@forge/kvs';
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3157:   17:                 await kvs.entity(entityName).set(id, {...data});
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3166:   26:                 await kvs.entity(entityName).set(id, {...data},{
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3180:   40:                 return await kvs.entity(entityName).get(id);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3189:   49:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3203:   63:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3217:   77:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3232:   92:          * ?? 100媛쒕? ?섍만 ???덉쑝誘濡?nextCursor 媛 ?놁쓣 ?뚭퉴吏 諛섎났 ?섏쭛?쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3233:   93:          * (@forge/kvs ????ㅼ륫: KvsQueryBuilder.cursor() ?낅젰 + ListResult.nextCursor 諛섑솚 吏??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3245:  105:                 let cursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3249:  109:                     let query = kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3254:  114:                     if (cursor) query = query.cursor(cursor);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3259:  119:                     cursor = page?.nextCursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3262:  122:                     if (!cursor) break;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3287:  147:          * `findByWhere` ??`.limit()` ?곹븳?먯꽌 ?섎━怨?`nextCursor` 瑜?踰꾨┛????
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3301:  161:                 let cursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3305:  165:                     let query = kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3311:  171:                     if (cursor) query = query.cursor(cursor);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3316:  176:                     cursor = page?.nextCursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3319:  179:                     if (!cursor) break;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3338:  198:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3354:  214:                 await kvs.entity(entityName).delete(id);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3388:   25:  *   - 鍮꼆dmin: Jira 1 + users SQL 1 + KVS permission 1 + ? ?몃뜳??60珥?罹먯떆)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3416:   53:  * SeedData 瑜?import ?섏? ?딅뒗 ?댁쑀: ?쒕뱶 ?ㅽ뻾 泥댁씤(KVS ?곌린 ?ы븿)??沅뚰븳 ?댁꽍 寃쎈줈???몃젮?⑤떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3436:   73:  *   `users` ?됱씠 ?뺤씤???ㅼ뿉留??몄텧?섎?濡? 諛깆삤?쇱뒪?먯꽌 ??젣???ъ슜?먭? KVS `team.leaderAccountId`
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3648:  285:     //    ??? 而⑦뀓?ㅽ듃瑜?**怨꾩궛?섏? ?딅뒗??** KVS team.leaderAccountId ????怨꾩젙??stale ?섍쾶
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3700:  337:              *    쨌 愿由ъ옄媛 ?꾨━?뗭쓣 吏?좊떎硫?KVS 議고쉶媛 null ??`mergeSetPages([])` 濡??꾨? false ??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3716:  353:     // 6) ?곸냽諛쏆쓣 ?명듃媛 ?놁쑝硫???由ъ냼??false (fail-close). KVS 議고쉶 ?먯껜瑜??섏? ?딅뒗??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3733:  370:     // 7) KVS permission ?명듃 ??移댄깉濡쒓렇 蹂묓빀
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3846:   10: const mockKvsPageReads = { count: 0 };
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3866:   30:                 mockKvsPageReads.count += 1;          // KVS ?뺣났 1??= ?섏씠吏 1??                results.push(...all.slice(i, i + pageLimit));
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:3928:   92:     mockKvsPageReads.count = 0;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:4003:  167:     test('KVS ?쎄린媛 諛곗튂 ?섏쓽 ?쒓낢???꾨땲???먯젙 1?뚮떦 1?섏씠吏??(A-4)', async () => {
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:4007:  171:         expect(mockKvsPageReads.count).toBe(TOTAL);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:4008:  172:         expect(mockKvsPageReads.count).toBeLessThan(TOTAL * (TOTAL + 1));
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6466:   77:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6481:   92:          * ?? 100媛쒕? ?섍만 ???덉쑝誘濡?nextCursor 媛 ?놁쓣 ?뚭퉴吏 諛섎났 ?섏쭛?쒕떎.
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6482:   93:          * (@forge/kvs ????ㅼ륫: KvsQueryBuilder.cursor() ?낅젰 + ListResult.nextCursor 諛섑솚 吏??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6494:  105:                 let cursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6498:  109:                     let query = kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6503:  114:                     if (cursor) query = query.cursor(cursor);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6508:  119:                     cursor = page?.nextCursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6511:  122:                     if (!cursor) break;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6536:  147:          * `findByWhere` ??`.limit()` ?곹븳?먯꽌 ?섎━怨?`nextCursor` 瑜?踰꾨┛????
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6550:  161:                 let cursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6554:  165:                     let query = kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6560:  171:                     if (cursor) query = query.cursor(cursor);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6565:  176:                     cursor = page?.nextCursor;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6568:  179:                     if (!cursor) break;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6587:  198:                 return await kvs.entity(entityName)
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6603:  214:                 await kvs.entity(entityName).delete(id);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6621:   10: const mockKvsPageReads = { count: 0 };
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6641:   30:                 mockKvsPageReads.count += 1;          // KVS ?뺣났 1??= ?섏씠吏 1??                results.push(...all.slice(i, i + pageLimit));
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6703:   92:     mockKvsPageReads.count = 0;
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6778:  167:     test('KVS ?쎄린媛 諛곗튂 ?섏쓽 ?쒓낢???꾨땲???먯젙 1?뚮떦 1?섏씠吏??(A-4)', async () => {
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6782:  171:         expect(mockKvsPageReads.count).toBe(TOTAL);
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6783:  172:         expect(mockKvsPageReads.count).toBeLessThan(TOTAL * (TOTAL + 1));
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:6934:   61:  * ?덈줈怨좎묠?댁빞 ?섍퀬, 吏꾪뻾瑜?湲곕줉(KVS)???몃뜲?놁씠 ?볦씤??
_workspace/perf-audit\CODEX_REVIEW_STAGE3.md:7326:"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n -i --glob '"'!node_modules/**'"' \"eventual|consistent|cursor|nextCursor|kvs.*query|KVS\" CLAUDE.md _workspace/perf-audit src/nosql src/queue static/ui/src | Select-Object -First 240; rg -n \"interface.*ListResult|type.*ListResult|getMany\\(\" node_modules/@forge/kvs node_modules/@forge/api -g '*.d.ts' -g '*.js' | Select-Object -First 120" in C:\CloudJira\moves-workforce
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:49:| **TTL 60초** | `TeamTreeCache.getTeamIndex` 관례. 같은 파일 계열의 워크로그 위젯 KVS 캐시(10분)보다 **10배 보수적**이다. stale 은 "담당자를 바꾼 뒤 차트 반영이 최대 60초 늦다" 하나뿐이다 |
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:50:| **KVS 가 아니라 프로세스 메모리** | 이 검색은 `as:'user'` 라 **결과가 호출자 권한으로 필터링**된다. `Assignee:{projectId}` 형태의 KVS 공유 캐시(감사 수정방향 ②)는 사용자 간 가시 범위를 섞을 수 있어 채택하지 않았다 |
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:65:## A-7. 마스터 사전 무캐시 KVS 스캔 (감사 6종 중 **5종 적용**, settings 제외)
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:108:- **쓰기 검증 경로는 캐시를 타지 않는다** — 이름 중복 판정(`checkDuplicated`)·`findById`·`updateSetting` 의 `prev` 읽기는 전부 KVS 직접 조회 그대로다(`loadTeamIndexFresh` 규약과 동형). stale 인덱스로 중복 판정을 하지 않는다.
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:133:두 파일은 **write 없이 KVS mock 반환값만 바꿔 가며** `getSettingDataService()` 를 반복 호출해서,
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:159:KVS 신규 속성 없음 → `manifest.yml` 변경 없음.
_workspace/perf-audit\FIX_STAGE2_BACKEND.md:230:  다시 저장하면 중복 검증(`checkDuplicated`, KVS 직접 조회)에 걸려 **"목록엔 없는데 저장은 거부"** 가 재현된다.
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:18:`manifest.yml` 무변경 — 새 KVS 속성·엔티티를 만들지 않았다(422 함정 회피). `job`/`job_batch` 스키마 그대로.
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:29:// before — KVS 읽기 = B × (B+1) ≈ B²
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:43:`JOB_BATCH_PAGE_LIMIT = 100` (KVS 쿼리 limit 상한).
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:47:**카운터를 도입하지 않았다.** Forge KVS 에는 트랜잭션도 원자적 증가도 없으므로 read-modify-write
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:86:B ≤ 100(=사용자 2,000명 / 구독 이슈 5,000건)이면 **판정 1회 = KVS 1회**로 완전 상수다.
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:174:| **KVS 읽기가 배치 수의 제곱이 아니라 판정 1회당 1페이지다** | B=5 소비 시 페이지 읽기 5회(=B), 종전 fan-in 이면 30회(=B×(B+1)) |
_workspace/perf-audit\FIX_STAGE3_BACKEND.md:184:  — 커서 페이징 2페이지 이상 경로가 실제 KVS 에서 도는지는 배포 후에만 검증 가능하다(테스트는 mock).
_workspace/perf-audit\FIX_STAGE2_FRONTEND.md:170:- 호출부 17곳 및 `CommonTable`/`PagingTable`/`CursorPagingTable` 공개 props: **무수정**.
_workspace/perf-audit\CODEX_REVIEW_RFC187.md:101:- **?깅뒫 ?꾨컲:** ?뚰겕濡쒓렇 ?ㅺ굔 議고쉶媛 怨듯넻 ?섏튂 寃쎈줈瑜??섏젙?덈뒗媛(湲덉?)? ?꾩슜 蹂묐젹 ?섏쿂 + `p-limit`?멸?? Resource 遺꾩꽍???꾨줈?앺듃 ?⑥쐞 1???섏튂 + KVS 罹먯떆?멸??
_workspace/perf-audit\CODEX_REVIEW_RFC187.md:155:- [[topics/forge-kvs-eventual-consistency-cache]] ??Custom Entity query??eventual consistency媛 mutation 吏곹썑 frontend refetch瑜??댁쟾 媛믪쑝濡??섎룎由????덈뒗 寃쎄퀎? ????⑦꽩.
_workspace/perf-audit\CODEX_REVIEW_RFC187.md:183:- **DB**: Forge SQL (MySQL/TiDB) + Forge KVS (NoSQL)
_workspace/perf-audit\CODEX_REVIEW_RFC187.md:185:- **諛깆뿏???섏〈??*: `@forge/api`, `@forge/sql`, `@forge/kvs`, `@forge/events`, `@forge/resolver`, `exceljs`(?묒? ?낅줈??
_workspace/perf-audit\CODEX_REVIEW_RFC187.md:280:- **NoSQL (KVS)**: `src/nosql/query/CustomEntityManager.js` ?ъ슜
node_modules/@forge/kvs\out\entity-query.js:53:        const { results } = await this.limit(1).getMany();
node_modules/@forge/kvs\out\entity-query.js:59:    async getMany() {
node_modules/@forge/kvs\out\interfaces\entity-query.d.ts:13:    getMany(): Promise<ListResult<T>>;
node_modules/@forge/kvs\out\query.js:24:        const { results } = await this.limit(1).getMany();
node_modules/@forge/kvs\out\query.js:30:    getMany() {
node_modules/@forge/kvs\out\interfaces\types.d.ts:49:export interface ListResult<T> {
node_modules/@forge/kvs\out\__test__\index.test.js:659:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:686:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:741:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:770:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:800:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:832:            .getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:941:        const rs = await sut.entity('employees').query().index('by-key').where(condition).getMany();
node_modules/@forge/kvs\out\__test__\index.test.js:1021:            .getMany();

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content 'node_modules/@forge/kvs/out/interfaces/types.d.ts'; Get-Content 'node_modules/@forge/kvs/out/entity-query.js'; Get-Content 'node_modules/@forge/kvs/out/interfaces/entity-query.d.ts'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE3_BACKEND.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE3_FRONTEND.md'; Get-Content -Raw '_workspace\\perf-audit\\FIX_STAGE3_BUNDLE.md'" in C:\CloudJira\moves-workforce
 succeeded in 1477ms:
export declare enum MetadataField {
    CREATED_AT = "CREATED_AT",
    UPDATED_AT = "UPDATED_AT",
    EXPIRE_TIME = "EXPIRE_TIME"
}
export interface GetOptions {
    metadataFields?: MetadataField[];
}
export interface QueryOptions {
    metadataFields?: MetadataField[];
}
export declare type TtlUnit = 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS';
export declare type Ttl = {
    value: number;
    unit: TtlUnit;
};
export interface SetOptions {
    ttl?: Ttl;
}
export interface GetResult<T> {
    key: string;
    value: T;
    createdAt?: number;
    updatedAt?: number;
    expireTime?: string;
}
export interface PolicySetOptions extends SetOptions {
    keyPolicy: 'OVERRIDE' | 'FAIL_IF_EXISTS';
}
export interface OverrideAndReturnSetOptions extends SetOptions {
    keyPolicy: 'OVERRIDE';
    returnValue: 'PREVIOUS' | 'LATEST';
    returnMetadataFields?: MetadataField[];
}
export declare function isOverrideAndReturnOptions(options?: ExtendedSetOptions): options is OverrideAndReturnSetOptions;
export declare type ExtendedSetOptions = PolicySetOptions | OverrideAndReturnSetOptions;
export interface SetResult<T> {
    key: string;
    value: T;
    createdAt?: number;
    updatedAt?: number;
    expireTime?: string;
}
export interface Result<T> {
    key: string;
    value: T;
    expireTime?: string;
}
export interface ListResult<T> {
    results: Result<T>[];
    nextCursor?: string;
}
export declare type BatchItemSuccess = {
    key: string;
    entityName?: string;
};
export declare type BatchItemError = {
    key: string;
    entityName?: string;
    error: {
        code: string;
        message: string;
    };
};
export interface BatchResult {
    successfulKeys: BatchItemSuccess[];
    failedKeys: BatchItemError[];
}
export interface BatchGetItemResult<T> {
    key: string;
    entityName?: string;
    value: T;
    createdAt?: number;
    updatedAt?: number;
    expireTime?: string;
}
export interface BatchGetResult<T> {
    successfulKeys: Array<BatchGetItemResult<T>>;
    failedKeys: BatchItemError[];
}
export declare enum Sort {
    ASC = "ASC",
    DESC = "DESC"
}
export declare type StringOrNumberOrBoolean = string | number | boolean;
export declare type StringOrNumber = string | number;
export interface BetweenClause<T extends StringOrNumber> {
    condition: 'BETWEEN';
    values: [T, T];
}
export interface BeginsWithClause {
    condition: 'BEGINS_WITH';
    values: [StringOrNumber];
}
export interface ExistsClause {
    condition: 'EXISTS';
    values: [true];
}
export interface NotExistsClause {
    condition: 'NOT_EXISTS';
    values: [true];
}
export interface GreaterThanClause {
    condition: 'GREATER_THAN';
    values: [StringOrNumber];
}
export interface GreaterThanEqualToClause {
    condition: 'GREATER_THAN_EQUAL_TO';
    values: [StringOrNumber];
}
export interface LessThanClause {
    condition: 'LESS_THAN';
    values: [StringOrNumber];
}
export interface LessThanEqualToClause {
    condition: 'LESS_THAN_EQUAL_TO';
    values: [StringOrNumber];
}
export interface ContainsClause {
    condition: 'CONTAINS';
    values: [string];
}
export interface NotContainsClause {
    condition: 'NOT_CONTAINS';
    values: [string];
}
export interface EqualToClause {
    condition: 'EQUAL_TO';
    values: [StringOrNumberOrBoolean];
}
export interface NotEqualToClause {
    condition: 'NOT_EQUAL_TO';
    values: [StringOrNumberOrBoolean];
}
export declare type FilterOperator = 'or' | 'and';
//# sourceMappingURL=types.d.ts.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterBuilder = exports.BaseFilter = exports.KvsIndexQueryBuilder = void 0;
class KvsIndexQueryBuilder {
    entityName;
    storageApi;
    options;
    constructor(entityName, storageApi, options) {
        this.entityName = entityName;
        this.storageApi = storageApi;
        this.options = options;
    }
    index(name, indexOptions) {
        return new KvsEntityQueryBuilder(this.storageApi, {
            ...this.options,
            entityName: this.entityName,
            indexName: name,
            partition: indexOptions?.partition,
            filters: []
        });
    }
}
exports.KvsIndexQueryBuilder = KvsIndexQueryBuilder;
class KvsEntityQueryBuilder {
    storageApi;
    queryOptions;
    constructor(storageApi, queryOptions) {
        this.storageApi = storageApi;
        this.queryOptions = queryOptions;
    }
    where(condition) {
        this.queryOptions.range = condition;
        return this;
    }
    filters(filter) {
        this.queryOptions.filters = filter.filters();
        this.queryOptions.filterOperator = filter.operator();
        return this;
    }
    sort(sort) {
        this.queryOptions.sort = sort;
        return this;
    }
    cursor(cursor) {
        this.queryOptions.cursor = cursor;
        return this;
    }
    limit(limit) {
        this.queryOptions.limit = limit;
        return this;
    }
    async getOne() {
        const { results } = await this.limit(1).getMany();
        if (results && results.length > 0) {
            return results[0];
        }
        return undefined;
    }
    async getMany() {
        const maybeOptions = {
            ...(this.queryOptions?.metadataFields ? { options: { metadataFields: this.queryOptions.metadataFields } } : {})
        };
        const { filters, filterOperator, metadataFields, ...rest } = this.queryOptions;
        if (filters && filterOperator && filters.length > 0) {
            return this.storageApi.queryEntity({
                ...rest,
                ...maybeOptions,
                filters: {
                    [filterOperator]: filters
                }
            });
        }
        return this.storageApi.queryEntity({ ...rest, ...maybeOptions });
    }
}
class BaseFilter {
    items;
    constructor(items = []) {
        this.items = items;
    }
    filters() {
        return this.items;
    }
    operator() {
        return this instanceof AndFilterBuilder ? 'and' : 'or';
    }
}
exports.BaseFilter = BaseFilter;
class FilterBuilder extends BaseFilter {
    and(field, condition) {
        return new AndFilterBuilder().and(field, condition);
    }
    or(field, condition) {
        return new OrFilterBuilder().or(field, condition);
    }
}
exports.FilterBuilder = FilterBuilder;
class AndFilterBuilder extends BaseFilter {
    and(field, condition) {
        this.items.push({ property: field, ...condition });
        return this;
    }
}
class OrFilterBuilder extends BaseFilter {
    or(field, condition) {
        this.items.push({ property: field, ...condition });
        return this;
    }
}
import { BeginsWithClause, BetweenClause, ContainsClause, EqualToClause, ExistsClause, FilterOperator, GreaterThanClause, GreaterThanEqualToClause, LessThanClause, LessThanEqualToClause, ListResult, MetadataField, NotContainsClause, NotEqualToClause, NotExistsClause, Result, Sort, StringOrNumber } from './types';
export declare type IndexOptions<T> = Pick<EntityQueryOptions<T>, 'partition'>;
export interface IndexQueryBuilder<T> {
    index(name: string, indexOptions?: IndexOptions<T>): EntityQueryBuilder<T>;
}
export interface EntityQueryBuilder<T> {
    where(condition: EntityWhereClauses): this;
    filters(filters: AndFilter<T> | OrFilter<T>): this;
    sort(sort: Sort): this;
    cursor(cursor: string): this;
    limit(limit: number): this;
    getOne(): Promise<Result<T> | undefined>;
    getMany(): Promise<ListResult<T>>;
}
export declare type FilterItem<T> = EntityFilterClauses & {
    property: keyof T;
};
export interface Filter<T> {
    and(field: keyof T, condition: EntityFilterClauses): AndFilter<T>;
    or(field: keyof T, condition: EntityFilterClauses): OrFilter<T>;
}
export interface AndFilter<T> {
    and(field: keyof T, condition: EntityFilterClauses): this;
}
export interface OrFilter<T> {
    or(field: keyof T, condition: EntityFilterClauses): this;
}
export declare type EntityFilterClauses = BetweenClause<StringOrNumber> | BeginsWithClause | ExistsClause | NotExistsClause | GreaterThanClause | GreaterThanEqualToClause | LessThanClause | LessThanEqualToClause | ContainsClause | NotContainsClause | EqualToClause | NotEqualToClause;
export declare type EntityWhereClauses = BetweenClause<StringOrNumber> | BeginsWithClause | EqualToClause | GreaterThanClause | GreaterThanEqualToClause | LessThanClause | LessThanEqualToClause;
export interface EntityQueryOptions<T> {
    sort?: Sort;
    entityName: string;
    indexName: string;
    partition?: Array<unknown>;
    range?: EntityWhereClauses;
    filters?: Array<FilterItem<T>>;
    filterOperator?: FilterOperator;
    cursor?: string;
    limit?: number;
    metadataFields?: MetadataField[];
}
//# sourceMappingURL=entity-query.d.ts.map
# ?깅뒫 媛먯궗 Stage 3 諛깆뿏???섏젙 ??A-4 쨌 A-6 (2026-08-12)

- 洹쇨굅 臾몄꽌: `_workspace/perf-audit/BACKEND_2026-08-12.md` 짠A-4, 짠A-6
- 踰붿쐞: **??2嫄대쭔.** 媛숈? 媛먯궗???ㅻⅨ ??ぉ(A-1쨌A-2쨌A-3쨌A-5쨌A-7쨌A-8, B/C ?꾩껜)? ?먮?吏 ?딆븯??
- 寃利? 猷⑦듃 `npm test` ??**71 suites / 1,117 tests ?꾨? ?듦낵**. `test/permission` ?⑤룆 **167/167 ?듦낵**.

---

## 蹂寃??뚯씪

| ?뚯씪 | ?쇱씤 | ?댁슜 |
|---|---|---|
| `src/nosql/query/CustomEntityManager.js` | +`findByWherePaged()` (湲곗〈 `findByFilterExists` 諛붾줈 ?? 144~194) | ?몃뜳???숇벑議곌굔 + 而ㅼ꽌 ?섏씠吏? `findByWhere`(limit ?곹븳?먯꽌 ?섎━怨?而ㅼ꽌 ?먭린)???섏씠吏?踰꾩쟾. **湲곗〈 硫붿꽌?쒕뒗 臾대?寃?* |
| `src/queue/consumer.js` | 232~292 (`JOB_BATCH_PAGE_LIMIT` + `checkJobCompletion`) | A-4. 諛곗튂 ?꾨웾 fan-in ??`jobId` ?몃뜳???섏씠吏 ?ㅼ틪 |
| `src/permission/PrincipalResolver.js` | 20~22(?ㅻ뜑), 219~249(`loadUserRows` + `buildPrincipal` 吏꾩엯), 285~286(援?2?④퀎 ?쒓굅) | A-6. `isAdministrator()` ??`getUserInfoService()` 蹂묐젹??|
| `src/queue/__test__/JobCompletion.test.js` | ?좉퇋 | A-4 硫깅벑?굿룹씫湲??잛닔 ?뚭? 怨좎젙 (7 耳?댁뒪) |

`manifest.yml` 臾대?寃?????KVS ?띿꽦쨌?뷀떚?곕? 留뚮뱾吏 ?딆븯??422 ?⑥젙 ?뚰뵾). `job`/`job_batch` ?ㅽ궎留?洹몃?濡?

---

## A-4. `checkJobCompletion` ??B짼 ??B

### 臾댁뾿??諛붽엥??
?댁쟾: 諛곗튂媛 ?섎굹 ?앸궇 ?뚮쭏??`findById(\`${appJobId}-batch-${i}\`)` 瑜?`i = 0..totalBatches-1` **?꾨?** 諛쒗뻾.

```js
// before ??KVS ?쎄린 = B 횞 (B+1) ??B짼
const batchResults = await Promise.all(
    Array.from({ length: totalBatches }, (_, i) =>
        jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
```

?댄썑: `job_batch` ??**`jobId` ?몃뜳??*(manifest ???대? ?좎뼵???덈떎)瑜?而ㅼ꽌 ?섏씠吏뺤쑝濡??묎퀬,
?곹븳??`totalBatches` 濡????먯젙???꾩슂??留뚰겮留??쎈뒗??

```js
// after ???먯젙 1?뚮떦 ceil(?꾨즺諛곗튂??/ 100) ?섏씠吏
const scan = await jobBatchManager.findByWherePaged('jobId', appJobId, JOB_BATCH_PAGE_LIMIT, total);
```

`JOB_BATCH_PAGE_LIMIT = 100` (KVS 荑쇰━ limit ?곹븳).

### 硫깅벑???쇱쬆 (?먮뒗 蹂묐젹쨌?ъ떆???뚮퉬??

**移댁슫?곕? ?꾩엯?섏? ?딆븯??** Forge KVS ?먮뒗 ?몃옖??뀡???먯옄??利앷????놁쑝誘濡?read-modify-write
移댁슫?곕뒗 ??諛⑺뼢 紐⑤몢濡?源⑥쭊????(a) ?숈떆 諛곗튂??**媛깆떊 ?좎떎**濡??꾨즺媛 ?곸쁺 ?ㅼ? ?딄굅??
(b) ?ъ떆??諛곗튂??**以묐났 利앷?**濡?4/5 ?곹깭?먯꽌 議곌린 ?꾧껐?쒕떎. ?뺥솗???곗꽑 吏?쒖뿉 ?곕씪 諛곗젣?덈떎.

???**諛곗튂 ?덉퐫???먯껜瑜?吏꾩떎???먯쿇**?쇰줈 ?쇰뒗?? ?깅┰ 洹쇨굅 3媛吏:

1. **誘몄셿猷??덉퐫?쒓? 議댁옱?섏? ?딅뒗??** `job_batch` ??泥섎━媛 ?앸궃 ??`done: true` 濡쒕쭔 ??λ맂??   (`consumer.js` ??`saveTTL` ?몄텧 3怨????낅줈???깃났 / 援щ룆 諛깊븘 ?깃났 / 援щ룆 stale ?먭린.
   `done:false` 瑜??곕뒗 寃쎈줈??肄붾뱶 ?꾩껜???녿떎). ?곸옱 ?쒖젏 ?ъ쟾 ?앹꽦???녿떎.
2. **?ㅺ? 諛곗튂留덈떎 ?좎씪?섎떎.** `${appJobId}-batch-${index}` ???ъ떆?꾨줈 媛숈? 諛곗튂媛 紐?踰???λ릺??   **媛숈? ?ㅻ? ??뼱?대떎.** ?곕씪??"?쒕줈 ?ㅻⅨ ?ㅼ쓽 done ?덉퐫???? = ?꾨즺 諛곗튂 ?섏씠硫?**?⑥“ 利앷?**?쒕떎.
   (異붽?濡??ㅼ틪 寃곌낵瑜?`key` 湲곗? `Set` ?쇰줈 ??踰???以묐났 ?쒓굅???섏씠吏 寃쎄퀎源뚯? 諛⑹뼱?덈떎.)
3. **?ㅻⅨ job ???욎씠吏 ?딅뒗??** `appJobId` ??job ?앹꽦 ?쒖젏????UUID ??   (`UserService.js:584`, `SubscriptionBackfill.js:142`) ??`jobId` ?몃뜳??議고쉶 寃곌낵媛 ??job 寃껊퓧?대떎.

寃곕줎: ??援ы쁽? **醫낆쟾怨?媛숈? ??吏묓빀???몃뒗 ?ㅻⅨ 諛⑸쾿**??肉먯씠?? ?먯젙 ?꾧퀎(`done < total ??return`)?
吏묎퀎??`processedCount`/`failCount` ??? 湲??洹몃?濡??좎??덉쑝誘濡??꾨즺 ?쒖젏쨌理쒖쥌 ?곹깭媛 諛붾뚯? ?딅뒗??

遺??議곌굔 2媛?
- **?ㅼ틪 ?ㅽ뙣???꾨즺濡??먯젙?섏? ?딅뒗??** `findByWherePaged` ?ㅽ뙣 ??濡쒓렇 ??`return` ???ㅼ쓬 諛곗튂(?먮뒗
  ?ъ떆??媛 ?ㅼ떆 ?먯젙?쒕떎. 醫낆쟾 `findById(...).catch(() => null)` ??"?대떦 諛곗튂 誘몄셿猷?濡?泥섎━??寃껉낵 媛숈?
  蹂댁닔??諛⑺뼢?대떎.
- **`totalBatches` ?좏슚??媛??異붽?.** `Number.isInteger(total) && total > 0` ???꾨땲硫?利됱떆 return.
  ??援ы쁽?먯꽌 ??媛믪씠 ?ㅼ틪 ?곹븳???낅젰?대씪 ?꾩슂?덈떎. 遺?섏쟻?쇰줈 醫낆쟾???좎옱 踰꾧렇??留됰뒗????  `totalBatches` 媛 `undefined` 硫?援?肄붾뱶??`0 < undefined === false` 濡??듦낵??**泥섎━??0?쇰줈 COMPLETED**
  瑜?李띿뿀?? (?뚯뒪?몃줈 怨좎젙)

### 鍮꾩슜

`B` = 諛곗튂 ?? ?먯젙 1??= `ceil(done/100)` ?섏씠吏, `done` ? 1..B 濡?利앷??섎?濡?job 1嫄?珥앺빀 ??`誇 ceil(k/100)`.

| ?쒕굹由ъ삤 | before (`B횞(B+1)`) | after | ?덇컧 |
|---|---|---|---|
| ?ъ슜???낅줈??U=1,000 (B=50) | 2,550 | **50** | ??8.0% |
| ?ъ슜???낅줈??U=5,000 (B=250) | 62,750 | **450** | ??9.3% |
| ?ъ슜???낅줈??U=10,000 (B=500) | 250,500 | **1,500** | ??9.4% |
| 援щ룆 諛깊븘 N=2,000 (B=40) | 1,640 | **40** | ??7.6% |
| 援щ룆 諛깊븘 N=10,000 (B=200) | 40,200 | **300** | ??9.3% |

B ??100(=?ъ슜??2,000紐?/ 援щ룆 ?댁뒋 5,000嫄??대㈃ **?먯젙 1??= KVS 1??*濡??꾩쟾 ?곸닔??

### ?곹뼢 踰붿쐞

`checkJobCompletion` ? `consumer.js` ?덉쓽 **?몄텧 5怨녹씠 怨듭쑀**?섎?濡????먭? ?④퍡 ?대뱷??蹂몃떎.

| ?몄텧遺 | 寃쎈줈 |
|---|---|
| `uploadUsers` `:36` | ?ъ떆?????대? done ??諛곗튂 ?ъ냼鍮?|
| `uploadUsers` `:93` | ?뺤긽 諛곗튂 ?꾨즺 |
| `backfillSubscription` `:154` | ?ъ떆?????대? done ??諛곗튂 ?ъ냼鍮?|
| `backfillSubscription` `:170` | 援щ룆 stale ?먭린 諛곗튂 |
| `backfillSubscription` `:215` | ?뺤긽 諛곗튂 ?꾨즺(`finally`) |

??**?묒? ?ъ슜???낅줈??+ RFC-171 援щ룆 諛깊븘 ?묒そ 紐⑤몢** 媛쒖꽑?쒕떎. ??寃쎈줈 紐⑤몢 諛곗튂 ???뺤떇怨?`jobId` ?띿꽦???숈씪??蹂꾨룄 遺꾧린媛 ?녿떎.

**resolver ?묐떟 怨꾩빟 蹂寃??놁쓬.** `getJobBatch`(`JobService.getJobBatchService`)??醫낆쟾 `findByWhere` 瑜?洹몃?濡??곌퀬 ?꾨줎???대쭅(`JobPollingManager` ??`getUploadJobStatus`)???쎈뒗 `job` ?덉퐫??shape??遺덈??대떎.

---

## A-6. 沅뚰븳 媛??怨좎젙鍮???吏곷젹 ?좏뻾 ?쒓굅

媛먯궗媛 吏紐⑺븳 **1?쒖쐞留?* ?곸슜?덈떎. 2?쒖쐞(L1 罹먯떆 in-flight dedup)??"Forge 而⑦뀒?대꼫 ?ъ궗???щ? 誘명솗??
?대씪 吏?쒕?濡?**?섏? ?딆븯??** 3?쒖쐞(admin ?먯젙 蹂꾨룄 TTL)??誘몄쟻??

```js
// before ??/mypermissions ?뺣났??users SQL ?욎뿉 吏곷젹濡??좊떎
const isAdmin = await isAdministrator();
if (isAdmin) { ... await getUserInfoService({ accountId }) ... }
...
dbUserInfo = (await getUserInfoService({ accountId }))?.rows ?? [];

// after ????寃쎈줈媛 **紐⑤몢** users ?됱쓣 ?곕?濡?蹂묐젹濡?臾띕뒗??(?뺣났 2????1??
const [isAdmin, dbUserInfo] = await Promise.all([
    isAdministrator(),
    loadUserRows(accountId),
]);
```

### ?먯젙 遺덈? ?쇱쬆

- **?몄텧 ?잛닔媛 洹몃?濡쒕떎.** admin 寃쎈줈??鍮꼆dmin 寃쎈줈???먮옒 `getUserInfoService` 瑜??뺥솗??1??遺瑜몃떎
  (admin ? ?쒖떆??? 而⑦뀓?ㅽ듃, 鍮꼆dmin ? 沅뚰븳 ?명듃/? 寃곗젙). 蹂묐젹?붾뒗 **?쒖젏留?* 諛붽씔??
- **`isAdministrator()` ??catch ?섏? ?딆븯??** ?ㅽ뙣??醫낆쟾怨??숈씪?섍쾶 `buildPrincipal` ??`resolvePrincipal`
  濡??꾪뙆??媛?쒓? **fail-close** ?쒕떎. `loadUserRows` ???덈? reject ?섏? ?딆쑝誘濡?  `Promise.all` ??unhandled rejection ??留뚮뱾吏 ?딅뒗??
- **users 議고쉶 ?ㅽ뙣 ?≪닔 諛⑺뼢??媛숇떎.** 醫낆쟾?먮룄 admin 寃쎈줈??`try/catch` ??? ?뺣낫 ?놁쓬,
  鍮꼆dmin 寃쎈줈??`try/catch` ??`rows=[]` ??誘몃벑濡?fail-close)?댁뿀?? ?댁젣 `loadUserRows` ??怨녹뿉??  `[]` 濡??≪닔?섍퀬 **?꾨옒 遺꾧린媛 洹몃?濡?媛숈? 寃곕줎**???꾨떖?쒕떎(濡쒓렇 臾멸뎄??`getUserInfoService error` 濡??듭씪).
- **遺꾧린 ?쒖꽌 遺덈?.** `admin ??誘몃벑濡???? 而⑦뀓?ㅽ듃 ??沅뚰븳 ?명듃 ???ㅼ퐫?? ?쒖꽌瑜???以꾨룄 諛붽씀吏 ?딆븯??
  ?뱁엳 `resolveTeamContext` ???ъ쟾??**users ???뺤씤 ?ㅼ뿉留?* ?몄텧?쒕떎 ??  stale `team.leaderAccountId` 濡????沅뚰븳??遺?쒗븯吏 ?딅뒗?ㅻ뒗 짠4-1 fail-close ?꾩젣媛 ?좎??쒕떎
  (`principalResolver.test.js` ??`expect(mockGetTeamIndex).not.toHaveBeenCalled()` 媛 ?대? 怨좎젙?섎ŉ ?듦낵).
- **?좎씪??愿痢?媛??李⑥씠**: `isAdministrator()` 媛 ?ㅽ뙣?섎뒗 寃쎌슦?먮룄 users SQL ???대? 諛쒗뻾???덈떎
  (踰꾨젮吏꾨떎). ?먯젙 寃곌낵쨌?먮윭 ?꾪뙆?먮뒗 ?곹뼢???녿떎.

### 鍮꾩슜

罹먯떆 誘몄뒪 1?뚮떦 ?뺣났??**2????1??*. `/backoffice/users` 吏꾩엯(?숈떆 invoke 6媛? 湲곗? 媛??吏?곗씠
`6 횞 (Jira RTT + SQL RTT)` ??`6 횞 max(Jira RTT, SQL RTT)` 濡?以꾩뼱?좊떎. **?몄텧 ?잛닔 ?먯껜??媛먯냼?섏? ?딅뒗??*
(洹멸굔 媛먯궗 2쨌3?쒖쐞??紐レ씠怨??대쾲 踰붿쐞 諛뽰씠??.

---

## ?뚯뒪??寃곌낵

```
npm test  (猷⑦듃, jest)
Test Suites: 71 passed, 71 total
Tests:       1117 passed, 1117 total
Time:        19.283 s

npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total     ??沅뚰븳 怨꾩빟 ?꾨웾 ?듦낵 (?덈? 議곌굔)
```

?좉퇋 `src/queue/__test__/JobCompletion.test.js` 7/7:

| 耳?댁뒪 | 怨좎젙?섎뒗 寃?|
|---|---|
| ?쇰? 諛곗튂留??앸굹硫?job ??理쒖쥌 ?곹깭濡??섍린吏 ?딅뒗??| ?먯젙 ?꾧퀎 遺덈? |
| ??諛곗튂媛 ?앸굹硫?COMPLETED 濡?吏묎퀎?쒕떎 | 吏묎퀎??遺덈? |
| Jira 誘멸???嫄댁씠 ?덉쑝硫?PARTIAL 濡?吏묎퀎?쒕떎 | `failCount` ?⑹궛 遺덈? |
| **?ъ떆?꾨줈 媛숈? 諛곗튂瑜??ㅼ떆 ?뚮퉬?대룄 ?꾨즺 ?섍? 遺?吏 ?딅뒗??* | **硫깅벑??* ??4/5 ?곹깭?먯꽌 諛곗튂 0쨌1 ?ъ냼鍮꾪빐??RUNNING ?좎?, 留덉?留?諛곗튂 ?꾩갑 ?쒖뿉留??꾧껐?섍퀬 `processed` 媛 以묐났 ?⑹궛?섏? ?딆쓬 |
| ?ъ떆?꾧? ?쇱뼱???대? done ??諛곗튂??Jira ?ъ“???놁씠 吏묎퀎留??ㅼ떆 ?쒕떎 | 湲곗〈 以묐났 泥섎━ 媛??臾댄쉶洹 |
| **KVS ?쎄린媛 諛곗튂 ?섏쓽 ?쒓낢???꾨땲???먯젙 1?뚮떦 1?섏씠吏??* | B=5 ?뚮퉬 ???섏씠吏 ?쎄린 5??=B), 醫낆쟾 fan-in ?대㈃ 30??=B횞(B+1)) |
| `totalBatches` 媛 ?좏슚?섏? ?딆쑝硫??꾨즺濡??먯젙?섏? ?딅뒗??| ??媛??|

---

## 諛고룷 ???뺤씤??寃?
- `manifest.yml` 蹂寃쎌씠 ?놁쑝誘濡??ㅽ궎留??щ같???댁뒋 ?놁쓬. `job_batch` ??`indexes: [jobId]` ??**?대? ?좎뼵??  ?덇퀬**(`manifest.yml:337-338`) 媛숈? ?몃뜳?ㅻ? `getJobBatchService` 媛 ?대? ?꾨줈?뺤뀡?먯꽌 ?곌퀬 ?덈떎.
- ?ㅽ솚寃??뺤씤 ?ъ씤?? ????낅줈??諛곗튂 100媛?珥덇낵) 1?뚮? ?뚮젮 job ??`COMPLETED`/`PARTIAL` 濡??뺤긽 ?꾩씠?섎뒗吏
  ??而ㅼ꽌 ?섏씠吏?2?섏씠吏 ?댁긽 寃쎈줈媛 ?ㅼ젣 KVS ?먯꽌 ?꾨뒗吏??諛고룷 ?꾩뿉留?寃利?媛?ν븯???뚯뒪?몃뒗 mock).

# FIX STAGE3 ???꾨줎?몄뿏??(P1-5, P1-2)

- ???媛먯궗: `_workspace/perf-audit/FRONTEND_2026-08-12.md`
- 踰붿쐞: **P1-5(媛꾪듃 ?몃씪???몄쭛 ?꾨웾 ?ъ“??**, **P1-2(?먯썝愿由??④? ???좊줈??** ??嫄대쭔
- 蹂묓뻾 ?묒뾽 ?뚰뵾: 踰덈뱾 遺꾨━(WorklogPage쨌FullCalendar쨌MarkdownEditor)쨌諛깆뿏??queue/permission) ?뚯씪? 誘몄젒珥?
---

## P1-5 ??媛꾪듃 ?몃씪???몄쭛 3醫낆쓽 ?꾨웾 ?ъ“???쒓굅 (?섏젙??

`static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`

| ??| ?쒓굅??寃?| ?泥?|
|----|-----------|------|
| `useUpdateAssignee` | `onSettled ??invalidateQueries(ganttKeys.data)` (援?:443-445) | 湲곗〈 ?숆? ?⑥튂瑜?理쒖쥌 ?곹깭濡? ?숆?媛믪씠 ?대? 媛꾪듃 怨꾩빟 shape(`{accountId, displayName, avatarUrl}`)?쇰줈 ?뺢퇋?붾뤌 ?덉뼱 "shape ?덉쟾留????꾩슂 ?녿떎 |
| `useUpdateCoworkers` | `onSettled ??invalidateQueries` (援?:511-513) | ?숆? ?⑥튂 ?좎?. **洹쒖빟 ?꾨컲 ?댁냼** ??write 寃쎈줈媛 `updateProjectIdField ??setAppFieldValueForIssues`(??而ㅼ뒪??꾨뱶)?닿퀬 `ganttKeys.data` ?ъ“?뚮뒗 JQL search ?? write 吏곹썑 invalidate ???몃뜳??吏?곗쑝濡???媛믪쓣 罹먯떆??諛뺤젣?쒕떎(GANTT.md 짠6 / CLAUDE.md) |
| `useUpdatePlannedMd` | `onSettled ??invalidateQueries` (援?:584-586) | ?숆?媛믪쓣 **?ㅼ젣濡?write ?섎뒗 ?쒓컙媛믪뿉????궛**?섎룄濡?蹂寃? ?좎꽕 ?ы띁 `plannedHours(md, rate)`(`:37-40`)瑜?mutationFn 怨?onMutate 媛 怨듭쑀 ??罹먯떆媛?= ?쒕쾭 ??κ컪 |

- `onMutate`(cancelQueries + prev ?ㅻ깄?? / `onError` **濡ㅻ갚 寃쎈줈??3媛?紐⑤몢 洹몃?濡?蹂댁〈**?덈떎.
- ?뺣젹 ???紐⑤쾾: 媛숈? ?뚯씪 `useSetParent`/`useSetLink`(?쒕쾭 ?뺤젙 ?묐떟 遺遺??⑥튂, invalidate 湲덉?)? `useGanttFolderMutations.js:16-21`.

### ?숆?媛믪씠 ?쒕쾭 ?묐떟???泥댄븷 ???덈뒗 洹쇨굅 (援먯감 ?뺤씤)

- **assignee**: `assignIssue`(Jira PUT)??蹂몃Ц??諛섑솚?섏? ?딅뒗??`''`) ???⑥튂???쒕쾭 ?묐떟 ?먯껜媛 ?녿떎. ?숆? 留ㅽ븨??`GanttMapper.js:134-140`???쒕쾭 shape怨??ㅺ? 媛숇떎.
- **coworkers**: `updateProjectIdFieldService`(`src/resolver/projectIssue/ProjectUsersService.js:272-288`)??**?꾨Т 媛믩룄 諛섑솚?섏? ?딅뒗??*(`content` ?놁쓬) ???쒕쾭 ?묐떟 ?⑥튂媛 遺덇??ν븯?? ????숆?媛?select ?듭뀡 value `{accountId, displayName, avatarUrls:{'24x24'}}`, `ProjectIssueAssignSelect.jsx:9-12`)???뚮퉬泥?`AvatarStack.jsx:25-26`???쎈뒗 ?ㅻ? 紐⑤몢 媛뽰떠 ?쒕쾭 shape怨?**?뚮뜑 ?숇벑**?꾩쓣 ?뺤씤?덈떎.
  - ?붿뿬 李⑥씠 1嫄?臾댄빐): ?쒕쾭 user 媛앹껜???덈뒗 `emailAddress`媛 ?숆?媛믪뿏 ?놁뼱 ?꾨컮? ?댄똻??蹂댁“以꾩씠 ?ㅼ쓬 ?먯뿰 ?ъ“???꾧퉴吏 鍮꾩뼱 蹂댁씤?? ?쒖떆 ??ぉ ?먯껜???숈씪.
- **plannedMd**: write ??`${round(md*rate*10)/10}h`, 湲곗〈 ?숆?? `round(md*rate*3600)`珥덈씪 0.1h 諛섏삱由쇰쭔??**?닿툔?????덉뿀??*(invalidate 媛 媛?ㅼ＜??遺遺?. ??媛믪쓣 `plannedHours` ?⑥씪 異쒖쿂濡?臾띠뼱 ?쒓굅?덈떎.
- ?뚯깮媛?泥섎━??`progressPercent`, `aggregateprogress`)? ?쒕쾭 ?ш퀎?곕텇?대씪 ?ㅼ쓬 ?먯뿰 ?ъ“?????ъ쭊???덈줈怨좎묠)?먯꽌 ?곕씪?⑤떎 ??`useSetParent`? ?숈씪 ?뺤콉.

### ?섎룄??invalidate ?붿〈 紐⑸줉

**`useGanttMutations.js` ?덉뿉???⑥? `invalidateQueries` 媛 0嫄댁씠??** 媛꾪듃 怨꾩뿴?먯꽌 ?섎룄?곸쑝濡??좎???invalidate ???꾨옒肉먯씠硫??대쾲 踰붿쐞? 臾닿??섎떎.

| ?꾩튂 | ?좎? ?ъ쑀 |
|------|-----------|
| `useGanttFolderMutations.js` ?대뜑 5醫??앹꽦/?섏젙/??젣/?대룞/留곹겕) | ??DB(Forge SQL) ?꾩슜 寃쎈줈??**Jira ?몃뜳??吏?곗씠 ?녿떎**. ?? ???뚯씪??`ganttKeys.data` ?꾨웾 invalidate ???곗? ?딄퀬 ?묐떟 湲곕컲 遺遺??⑥튂瑜??곗꽑?쒕떎(`:16-21`, `:79`) |
| `useSetParent` / `useSetLink` / `useSetFolderLink` / `useUpdateSchedule` | ?먮옒遺??invalidate ?놁쓬(?쒕쾭 ?뺤젙 ?묐떟 ?⑥튂) ??蹂寃??놁쓬 |

- 臾몄꽌 ?숆린?? `src/resolver/gantt/GANTT.md` 짠4-3 ?쒖쓽 "`onSettled` invalidate(shape ?덉쟾留?" ?됱쓣 ???뺤콉?쇰줈 媛깆떊(?대떦 ?뚯씪? `.gitignore:72`濡?誘몄텛??臾몄꽌).

---

## P1-2 ???먯썝愿由??④? ???좊줈??(**?ㅽ깘**: 肄붾뱶 ?섏젙 遺덊븘?? 洹쇨굅 怨좎젙)

媛먯궗 ?꾩젣 ??"Atlaskit `TabPanel` ??children ??臾댁“嫄??뚮뜑?섎?濡?4媛????낆씠 ?숈떆 ?ㅽ뻾?쒕떎" ????**?깅┰?섏? ?딅뒗??**

媛먯궗??`@atlaskit/tabs/dist/cjs/components/tab-panel.js` 留??뺤씤?덇퀬 ?곸쐞 `tabs.js` 瑜?蹂댁? ?딆븯?? `TabPanel` ? ?먭린媛 ?뚮뜑????children ??洹몃?濡??대낫?대뒗 寃?留욎?留? **`Tabs` 媛 諛⑸Ц???⑤꼸留??뚮뜑?쒕떎**:

`node_modules/@atlaskit/tabs/dist/esm/components/tabs.js:74-97`
```js
var visited = useRef(new Set([selected]));
if (!visited.current.has(selected)) visited.current.add(selected);
...
// If a panel has already been visited, don't unmount it
Array.from(visited.current).map(function (tabIndex) { ... tabPanels[tabIndex] ... })
```

利??붽뎄???숈옉(泥??좏깮 ??誘몃젋??+ 諛⑸Ц ???좎?, ?꾪솚 ???몃쭏?댄듃 ?놁쓬)??**?대? ?쇱씠釉뚮윭由?湲곕낯 ?숈옉**?대떎. ?ㅼ튂蹂몄? 18.3.4 ?⑥씪蹂몄씠??`npm ls @atlaskit/tabs` ??以묒꺽 ?ㅼ튂 ?놁쓬).

### ?ㅼ륫 寃利?
jsdom ?뚮뜑濡?吏곸젒 ?뺤씤?덈떎(議곌굔遺 ??쓣 ?쇱썙 `ResourcePage` ? ?숈씪 援ъ“濡?援ъ꽦):

- 吏꾩엯 ??留덉슫?? `['mount:overview']` ???④? ??3媛쒕뒗 **留덉슫?몃릺吏 ?딆쓬** ??`getPortfolioDashboard`쨌`getAssignmentProjectMetrics`쨌`getAssignmentProjectCards`쨌`getTeamAnalyticsScope` ??吏꾩엯 ???몄텧?섏? ?딅뒗?? ?④? ECharts 6媛쒕룄 ?앹꽦?섏? ?딅뒗??
- 4踰덉㎏ ??諛⑸Ц ??泥???蹂듦?: `['mount:overview','mount:assignment']` ??**?몃쭏?댄듃 ?대깽??0嫄?*. `ResizablePanels` ??룹뒪?щ· ???⑤꼸 ?곹깭??蹂댁〈?쒕떎(臾댄쉶洹).
- 議곌굔遺(`showTeamAnalytics`) ?⑤꼸??猿??덉뼱???몃뜳???뺣젹??留욌뒗??`Children.toArray` 媛 `false` 瑜?嫄몃윭 Tab/TabPanel ?쒖꽌媛 1:1 ?좎?).

`invoke` ?ㅽ뻾 寃쎈줈???ы솗?명뻽??????4媛?resolver ?몄텧? ?꾨? ?④? ??而댄룷?뚰듃 ?대? ??`teamAnalytics/hooks/useTeamAnalyticsData.js:68,85`, `assignment/useAssignmentProjectCards.js:21`, `assignment/useAssignmentProjectMetrics.js:23`)?먮쭔 ?덇퀬, `prefetchQuery` ?????꾩뿭??0嫄댁씠??

### 洹몃옒??????
?섎룞 `selected`/`visited` 寃뚯씠?몃? ?덈줈 援ы쁽?섎㈃ ?쇱씠釉뚮윭由??숈옉怨?以묐났??肉먯씠怨? 議곌굔遺 ???뚮Ц???몃뜳???뺣젹???먯쑝濡?留욎떠?????ㅽ엳???뚭? ?꾪뿕留??앷릿?? ???**?꾩젣瑜?怨좎젙**?덈떎.

- `static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js` (?좉퇋, 2 耳?댁뒪) ??Atlaskit ?낃렇?덉씠?쒕줈 ???숈옉??源⑥?硫?利됱떆 ?ㅽ뙣?쒕떎.
- `static/ui/src/pages/resource/ResourcePage.jsx:16-25` ?????섎룞 寃뚯씠?몃? ?먯? ?딅뒗吏 洹쇨굅 二쇱꽍(?ш컧????媛숈? ?ㅽ깘 諛섎났 諛⑹?).

> P1-2 ???뚭퇋紐??щ?濡??곹엺 `IssueAddModal.jsx:207-211`(紐⑤떖 ?ㅽ뵂留뚯쑝濡?`SubscriptionTab` 留덉슫??? **媛숈? ?먯씤???꾨땺 ???덈떎** ??洹??붾㈃? `Tabs` 瑜??듯븯吏 ?딆쓣 媛?μ꽦???덉쑝誘濡?蹂꾧굔?쇰줈 ?ы솗???꾩슂. ?대쾲 踰붿쐞 諛뽰씠???먮?吏 ?딆븯??

---

## 蹂寃??뚯씪

| ?뚯씪 | ?쇱씤 | ?댁슜 |
|------|------|------|
| `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` | `:37-40` | `plannedHours(md, rate)` ?ы띁 ?좎꽕(write 媛????숆?媛??⑥씪 異쒖쿂) |
| ??| `:385-398` | `useUpdateAssignee` ?꾨왂 二쇱꽍 媛깆떊 + `onSettled` ?쒓굅(援?:443-445) |
| ??| `:459-472` | `useUpdateCoworkers` ?꾨왂 二쇱꽍 媛깆떊(洹쒖빟 ?꾨컲 ?ъ쑀 紐낆떆) + `onSettled` ?쒓굅(援?:511-513) |
| ??| `:528-540`, `:551`, `:572-573` | `useUpdatePlannedMd` 二쇱꽍 媛깆떊 + `plannedHours` ?곸슜(write/?숆? ?묒そ) + `onSettled` ?쒓굅(援?:584-586) |
| `static/ui/src/pages/resource/ResourcePage.jsx` | `:19-27` | ?섎룞 lazy 寃뚯씠?몃? ?먯? ?딅뒗 洹쇨굅 二쇱꽍(肄붾뱶 ?숈옉 蹂寃??놁쓬) |
| `static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js` | ?좉퇋 | ??留덉슫??怨꾩빟 ?뚭? ?뚯뒪??2嫄?|
| `src/resolver/gantt/GANTT.md` | 짠4-3 ??| 3媛??낆쓽 ?숆? 媛깆떊 ?뺤콉 ??媛깆떊(誘몄텛??臾몄꽌) |

## 寃利?
- `cd static/ui && npx jest` ??**74 suites / 1237 tests ?꾨? ?듦낵** (?좉퇋 2嫄??ы븿)
- `cd static/ui && CI=true npm run build` ??**?깃났**. `bundle:check` = `{"file":"static/js/main.f75a3593.js","gzipBytes":432478,"budgetBytes":950000,"withinBudget":true}`
  - 鍮뚮뱶 ?몃━?먮뒗 蹂묓뻾 ?묒뾽(WorklogPage 踰덈뱾 遺꾨━)??蹂寃쎌씠 ?④퍡 ?ㅼ뼱 ?덉뿀????main gzip 432KB ??洹??묒뾽 ?④낵媛 諛섏쁺???섏튂??
- i18n: **?좉퇋 ???놁쓬** ??`npm run merge` 遺덊븘???? `prebuild` 媛 build ???먮룞 ?ㅽ뻾??

# FIX ??P1-1 踰덈뱾 ?좎텧: MDXEditor쨌FullCalendar쨌moment 瑜?main 諛뽰쑝濡?(2026-08-12)

- **???*: `_workspace/perf-audit/FRONTEND_2026-08-12.md` **P1-1 ?⑤룆**
- **?먯씤**: 湲곕낯 吏꾩엯 ?쇱슦??`App.jsx:23`, ?섎룄???뺤쟻 import)媛 `WorklogPage` ??`components/calendar/FullCalendar` / `modal/WorklogModal` ??`components/markdown/MarkdownEditor` 濡??댁뼱吏??**?뺤쟻 泥댁씤**???怨???臾닿굅???ㅽ깮??main ??怨좎젙?쒗궎怨??덉뿀??
- **諛⑹묠**: `WorklogPage` ??**?뺤쟻?쇰줈 ?좎?**(泥??붾㈃ ?뺣났 異붽? ?놁쓬), 洹??덉쓽 **???⑹뼱由щ쭔** lazy 濡??대┛??

---

## 寃곌낵 ??main 踰덈뱾

| | ?뚯씪 | ?먮낯(raw) | **gzip** | ?덉궛 |
|---|---|---|---|---|
| **??* | `main.bdfe475c.js` | 3,704,592 B | **899,163 B** | 950,000 B |
| **??* | `main.f75a3593.js` | 1,576,296 B | **432,478 B** | 950,000 B |
| **李⑥씠** | | **??,128,296 B (??7.5%)** | **??66,685 B (??1.9%)** | ?ъ쑀 50,837 ??**517,522 B** |

`bundle:check` **?듦낵**(`withinBudget: true`). CRA ??"The bundle size is significantly larger than recommended" 寃쎄퀬???щ씪議뚮떎.

CSS ???④퍡 鍮좎죱????`main.css` **156,007 B ??107,062 B**(??8,945 B, gzip 22,351 B). mdxeditor ?대옒?ㅒ?fc-*` 洹쒖튃??泥?겕 CSS 濡??대룞.

### ?덈줈 ?앷릿 泥?겕

| 泥?겕 | ?먮낯 | gzip | ?댁슜 | ?몄젣 諛쏅굹 |
|---|---|---|---|---|
| `918.5bea010f.chunk.js` (+ `918.c77d9290.chunk.css` 46,511 B) | 1,072,321 B | 331,009 B | `@mdxeditor/editor`(65) + `lexical` + `prismjs`(16) + `@codemirror/*` + `@radix-ui/*` | **?뚰겕濡쒓렇 紐⑤떖???щ뒗 ?쒓컙** |
| `7530.72170e3b.chunk.js` | 1,028,106 B | 127,498 B | `@fullcalendar/*`(7) + `moment-timezone`(2) + `moment`(1) | `/myWork` 罹섎┛??酉?留덉슫????|
| `9241.2dce79d7.chunk.js` | ?뚰삎 | ??| `adf-to-md` | 湲곗〈 肄붾찘?멸? ?덈뒗 ?뚰겕濡쒓렇瑜?**???뚮쭔** |
| (marklassian) | ?뚰삎 | ??| `markdownToAdf` | ?뚰겕濡쒓렇瑜?**??ν븷 ?뚮쭔** |

????泥?겕??gzip ??458,507 B)??main 媛먯냼遺?466,685 B)??**98%** 瑜??ㅻ챸?쒕떎 ??媛먯냼媛 ??蹂寃쎌뿉???섏삩 寃껋씠 ?섏튂濡??뺤씤?쒕떎.

### ?좎텧 ?ш?利?(鍮뚮뱶 ?곗텧臾?吏곸젒 寃??

`main.f75a3593.js` ?덉뿉??**?꾨? 0嫄?*: `Antarctica/Vostok`쨌`Asia/Seoul`(tz ?곗씠??, `fc-daygrid`, `mdxeditor`, `lexical`, `CodeMirror`, `marklassian`.
`main.3097e113.css` ?덉뿉?쒕룄 `mdxeditor`쨌`fc-` **0嫄?*.
?뚯뒪留?`sources` 洹?띿쑝濡쒕룄 `@fullcalendar`/`moment`/`moment-timezone`/`@mdxeditor`/`lexical`/`prismjs` 媛 main ??**??紐⑤뱢???⑥븘 ?덉? ?딅떎**.

**moment 寃쎈줈 ?뺤씤**: ???꾩뿭?먯꽌 `moment` 瑜?import ?섎뒗 怨녹? `components/calendar/FullCalendar.jsx:5` ??`@fullcalendar/moment-timezone` **?섎굹肉?*?대떎(`src` ?꾩껜 grep). ?ㅻⅨ ?뺤쟻 寃쎈줈媛 ?놁쑝誘濡?罹섎┛??寃쎄퀎媛 moment 瑜??듭㎏濡??곕젮媛꾨떎.

---

## 蹂寃??뚯씪

### ?좉퇋

**`static/ui/src/components/calendar/FullCalendarLazy.jsx`** (?좉퇋 99以?
- `React.lazy(() => import('./FullCalendar'))` + **?먯껜 Suspense 寃쎄퀎** + `ChunkErrorBoundary`
- `CalendarSkeleton` ???대컮 ??以?+ ?붿씪 癒몃━湲 + **6횞7 寃⑹옄**瑜?`height:100%` 濡?洹몃젮 罹섎┛???곸뿭??洹몃?濡?李⑥??쒕떎(?덉씠?꾩썐 ?먰봽 諛⑹?)
- `CustomFullCalendar` ? **?숈씪??props** 瑜??꾨떖 ???섑띁(`FullCalendar.jsx:28-40`)??`ResizeObserver` ??`getApi().updateSize()` ?숈옉? 洹몃?濡?蹂댁〈?쒕떎. `calendarRef` ??`ref` 媛 ?꾨땲???쇰컲 prop ?대씪 Suspense 瑜?洹몃?濡??듦낵?섍퀬, 泥?겕 ?꾩갑 ?쒖젏??`.current` 媛 梨꾩썙吏꾨떎.

**`static/ui/src/components/markdown/MarkdownEditorLazy.jsx`** (?좉퇋 67以?
- `React.lazy(() => import('./MarkdownEditor'))` + **?먯껜 Suspense 寃쎄퀎** + `ChunkErrorBoundary`
- `MarkdownEditorSkeleton` ???대컮 + 蹂몃Ц 200px(= `MarkdownEditor.css` ??`.my-custom-editor-scroll` 怨좎젙 ?믪씠? ?숈씪 媛??대씪 紐⑤떖 ?믪씠媛 ?吏 ?딅뒗??
???뚯씪 紐⑤몢 ???紐⑤뱢??**?뺤쟻 import ?섏? ?딅뒗??*(??以꾩씠?쇰룄 ?뺤쟻 李몄“媛 ?앷린硫?泥?겕媛 ?꾨줈 main ???⑹퀜吏꾨떎 ???뚯씪 二쇱꽍??紐낆떆).

### ?섏젙

**`static/ui/src/pages/myWork/WorklogPage.jsx`**
| ?쇱씤 | ?댁슜 |
|---|---|
| `:2-5` | `CustomFullCalendar` ?뺤쟻 import ??`LazyFullCalendar` (?뚭? 寃쎄퀬 二쇱꽍 ?ы븿) |
| `:495` | `<CustomFullCalendar>` ??`<LazyFullCalendar>` (props ?숈씪) |

洹???濡쒖쭅? ?먮?吏 ?딆븯???꾨Т ?쒖빟: import 吏???쒖젙).

**`static/ui/src/pages/myWork/modal/WorklogModal.jsx`**
| ?쇱씤 | ?댁슜 |
|---|---|
| `:22` | `MarkdownEditor` + `marklassian` + `adf-to-md` ?뺤쟻 import 3以???`LazyMarkdownEditor` 1以?|
| `:34-57` | `loadMarkdownToAdf()` / `loadAdfToMd()` ??紐⑤뱢 promise 罹먯떆???숈쟻 濡쒕뜑 |
| `:127-148` | ADF?믩쭏?щ떎??蹂??effect 瑜?鍮꾨룞湲고솕. **湲곗〈 肄붾찘?멸? ?놁쑝硫?蹂?섍린瑜??꾩삁 諛쏆? ?딅뒗??*(?좉퇋 ?깅줉 寃쎈줈). ??쾶 ?꾩갑??寃곌낵媛 ?ㅻⅨ ?뚰겕濡쒓렇瑜???? ?딅룄濡?`cancelled` 媛??異붽? |
| `:331-332`, `:344`, `:356` | `addWorklog`/`updateWorklog`/`addWorklogRange` 吏꾩엯遺?먯꽌 `await loadMarkdownToAdf()`. `addWorklogRange` ??猷⑦봽 **?욎뿉??* ??踰?await |
| `:656` | `<MarkdownEditor>` ??`<LazyMarkdownEditor>` |

`addWorklog` ??`value => {}` ??`async value => {}` 濡?諛붾뚯뿀???몄텧遺 `onSubmit` ???대? await ?쒕떎).

---

## #426 ?덉쟾??(?붽뎄?ы빆 1)

??lazy 吏??**媛곴컖**???먭린 Suspense 寃쎄퀎瑜?媛뽯뒗?????곸쐞 寃쎄퀎???섏〈?섏? ?딅뒗??

- **紐⑤떖(MDXEditor)**: `CommonModal.jsx:26` ??`isOpen` ???뚮쭔 children ??留덉슫?명븯誘濡?**紐⑤떖???щ뒗 ?대┃**??怨?suspend ?쒖젏?대떎. ?닿쾬???뺥솗??#426 ???섎뒗 "?숆린 ?낅젰 以?suspend" ?곹솴?닿퀬, 寃쎄퀎媛 諛붾줈 ??`MarkdownEditorLazy` ?대?)???덉뼱 ?먮윭 ????ㅼ펷?덊넠???щ떎.
- **罹섎┛??*: `/myWork` 理쒖큹 留덉슫?몄뿉??suspend ?쒕떎(珥덇린 `viewMode === "calendar"`). ?쒋넄罹섎┛???좉? ?쒖뿉???대? 泥?겕媛 濡쒕뱶???덉뼱 ??suspend ?섏? ?딆?留? 洹?寃쎈줈?먮룄 媛숈? 寃쎄퀎媛 ?덈떎.
- fallback ? ?꾨? **?ㅼ펷?덊넠**?대떎(?ㅽ뵾???놁쓬, RFC-178 洹쒖빟).
- 泥?겕 濡쒕뱶 **?ㅽ뙣**(諛고룷 吏곹썑 404 ????Suspense 媛 泥섎━?섏? 紐삵븯誘濡?媛?吏?먯뿉 `ChunkErrorBoundary` 瑜??④퍡 ??????ㅽ뙣?대룄 ?섏씠吏 ?꾩껜媛 ?꾨땲???대떦 ?곸뿭留??ъ떆???덈궡濡?諛붾먮떎.

## 嫄대뱶由ъ? ?딆? 寃?(?붽뎄?ы빆 5)

- `App.jsx` ??`WorklogPage` ??**?뺤쟻 import 洹몃?濡?*. ?쇱슦??lazy 紐⑸줉쨌Suspense 援ъ“ 臾대?寃?- `components/tabs/CommonTab.jsx` ??Suspense 寃쎄퀎, 泥????뺤쟻 ?먯튃 ??臾대?寃?- `components/calendar/FullCalendar.jsx` 蹂몃Ц ??臾대?寃?ResizeObserver쨌`updateSize`쨌`renderEventContent` 洹몃?濡?
- `components/markdown/MarkdownEditor.jsx` 蹂몃Ц ??臾대?寃?- `pages/projectDetail/calender/ProjectCalender.jsx` ??`FullCalendar` 瑜?怨꾩냽 ?뺤쟻 import ?쒕떎. ???붾㈃? ?대? lazy ?쇱슦??`ProjectDetailPage`) ?꾨옒??main ???곹뼢???녾퀬, ?댁젣 罹섎┛???ㅽ깮? ??async 寃쎈줈媛 怨듭쑀?섎뒗 泥?겕(`7530`)濡?紐⑥씤??- 蹂묐젹 ?묒뾽 以묒씠??`pages/resource/ResourcePage.jsx`, `pages/projectDetail/gantt/useGanttMutations.js` ??**?묎렐?섏? ?딆쓬**

## 寃利?
- `cd static/ui && CI=true npm test` ??**75 suites / 1,237 tests ?꾨? ?듦낵**(?ㅻ깄??1 ?ы븿)
- `cd static/ui && CI=true npm run build` ???깃났, `bundle:check` `{"gzipBytes":432478,"budgetBytes":950000,"withinBudget":true}`
- i18n: ?????놁쓬. ?ㅼ펷?덊넠 aria ?쇰꺼? **湲곗〈** `common.loading` ?ъ궗????`locales/kr`쨌`locales/en` 蹂寃??놁쓬(鍮뚮뱶 prebuild ??`merge` ???뺤긽 ?ㅽ뻾??

### 痢≪젙 二쇱쓽

痢≪젙 ??踰??ъ씠??**?ㅻⅨ ?먯씠?꾪듃媛 `ResourcePage.jsx`쨌`useGanttMutations.js` 瑜??숈떆 ?섏젙** 以묒씠?덈떎. ?ㅻ쭔 ???뚯씪 紐⑤몢 ?대? lazy ?쇱슦???꾨옒??main ???ㅻ━吏 ?딆쑝硫? ??"?좎텧 ?ш?利?(main ???щ낵 0嫄?怨?泥?겕 ?뚭퀎(??泥?겕 gzip ?⑹씠 媛먯냼遺꾩쓽 98%)媛 ??媛먯냼瑜?蹂?蹂寃쎌뿉 洹?띿떆?⑤떎.

## 李멸퀬 ??P1-1 ???덉륫??媛믨낵???議?
媛먯궗??gzip 湲곗? **250~300KB** 媛먯냼瑜??덉긽?덈떎. ?ㅼ륫? **466,685 B** 濡??덉긽???ш쾶 ?껊룉?? 李⑥씠??(a) ???ㅽ깮???뚭퀬 ?ㅻ뜕 `@radix-ui/*`쨌`micromark`/`mdast` 怨꾩뿴 怨듭슜 ?섏〈源뚯? ?④퍡 鍮좎죱怨? (b) `marklassian`/`adf-to-md` 瑜??숈쟻 import 濡??④퍡 ?대졇湲??뚮Ц?대떎.

## ?⑥? 寃?
??臾몄꽌??**P1-1 ?⑤룆** ?섏젙?대떎. P1-2쨌P1-3쨌P1-4 ???섎㉧吏 ??ぉ? 誘몄갑??
E2E 誘몄닔????諛고룷 ??`/myWork` 珥덇린 吏꾩엯(罹섎┛???ㅼ펷?덊넠 ??罹섎┛??怨??뚰겕濡쒓렇 紐⑤떖 ?닿린/???湲곗〈 肄붾찘?멸? ?덈뒗 ?뚰겕濡쒓렇??蹂몃Ц 濡쒕뱶 ?ы븿)???ㅼ젣 ?섍꼍?먯꽌 ??踰??뺤씤??寃?


hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
codex
현재까지 A-4에서 KVS 인덱스 조회의 일관성 경계와 “마지막 완료 이벤트 뒤 재판정이 없는” 경로를 별도로 추적 중입니다. 단위 테스트는 메모리 mock이라 이 종류의 저장소 지연·커서 동작을 재현하지 못하는 점을 염두에 두고 실제 호출 구조까지 대조하고 있습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/components/calendar/FullCalendarLazy.jsx' 1 180; Show-Range 'static/ui/src/components/markdown/MarkdownEditorLazy.jsx' 1 160; rg -n -C 4 \"ChunkErrorBoundary|class .*ErrorBoundary|componentDidCatch\" static/ui/src; Show-Range 'static/ui/src/components/calendar/FullCalendar.jsx' 1 180; Show-Range 'static/ui/src/components/markdown/MarkdownEditor.jsx' 1 200" in C:\CloudJira\moves-workforce
 succeeded in 1705ms:

--- static/ui/src/components/calendar/FullCalendarLazy.jsx:1-180 ---
    1: import React, {Suspense} from 'react';
    2: import AkSkeleton from '@atlaskit/skeleton';
    3: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
    4: import {useI18nStore} from '../../stores/useI18nStore';
    5: 
    6: /**
    7:  * 罹섎┛???ㅽ깮??main 踰덈뱾 諛뽰쑝濡??대낫?대뒗 寃쎄퀎.
    8:  *
    9:  * ???꾩슂?쒓?: `/myWork` ??湲곕낯 吏꾩엯 ?쇱슦?몃씪 `App.jsx` 媛 **?뺤쟻 import** 濡??붾떎(泥??붾㈃源뚯?
   10:  * 泥?겕 ?뺣났????踰????쒖슦吏 ?딄린 ?꾪빐). 洹몃윴??洹??섏씠吏媛 `components/calendar/FullCalendar`
   11:  * 瑜??뺤쟻?쇰줈 ?뚭퀬 ?ㅻ뒗 諛붾엺??`@fullcalendar/*` + `moment(-timezone)` 275KB(?먮낯)媛 main ?? * ?뚮윭?됱븘 ?덉뿀????肄붾뱶 ?ㅽ뵆由ы똿??紐⑹쟻(App.jsx:25-27 二쇱꽍)??????寃쎈줈?먯꽌 臾대젰?붾릱??
   12:  * ?섏씠吏 ?먯껜???뺤쟻?쇰줈 ?먭퀬 **罹섎┛???⑹뼱由щ쭔** ?ш린???대┛??
   13:  *
   14:  * ?뵶 lazy 媛 ?깅┰?섎뒗 議곌굔? ?꾨옒 **Suspense 寃쎄퀎**?? 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426
   15:  *    ("A component suspended while responding to synchronous input")???쒕떎. 猷⑦듃 `index.js` 媛
   16:  *    ReactDOM.render(legacy root)??startTransition ? ?대쾿???꾨땲????寃쎄퀎濡쒕쭔 留됲엺??
   17:  *
   18:  * ?????뚯씪? `./FullCalendar` 瑜?**?뺤쟻?쇰줈 import ?섏? ?딅뒗??*. ??以꾩씠?쇰룄 ?뺤쟻 李몄“媛
   19:  *   ?앷린硫?泥?겕媛 ?꾨줈 main ?쇰줈 ?⑹퀜吏꾨떎.
   20:  *
   21:  * `moment` ???ㅼ쭅 `@fullcalendar/moment-timezone` ???듯빐?쒕쭔 ?ㅼ뼱?⑤떎(???꾩뿭?먯꽌 ?ㅻⅨ
   22:  * `moment` import ???녿떎) ??利???寃쎄퀎媛 moment 源뚯? ?④퍡 ?곕젮媛꾨떎.
   23:  */
   24: const CustomFullCalendarChunk = React.lazy(() =>
   25:     import('./FullCalendar').then(m => ({default: m.CustomFullCalendar}))
   26: );
   27: 
   28: const WEEK_ROWS = 6;
   29: const WEEK_COLS = 7;
   30: 
   31: /**
   32:  * 罹섎┛???먮━ ?ㅼ펷?덊넠 ??泥?겕瑜?湲곕떎由щ뒗 ?숈븞 **?붽컙 酉곗? 媛숈? 怨④꺽**??洹몃┛??
   33:  * ?대컮 ??以?+ ?붿씪 癒몃━湲 + 6二?寃⑹옄濡??ㅼ젣 ?뚮뜑 ?꾩쓽 ?믪씠瑜?洹몃?濡?李⑥??섎?濡? * 濡쒕뱶媛 ?앸굹???덉씠?꾩썐???吏 ?딅뒗??遺紐④? `height:100%` 瑜?以??.
   34:  */
   35: export function CalendarSkeleton({label = 'Loading'}) {
   36:     return (
   37:         <div
   38:             role="status"
   39:             aria-label={label}
   40:             aria-busy="true"
   41:             style={{
   42:                 height: '100%',
   43:                 minHeight: 0,
   44:                 display: 'flex',
   45:                 flexDirection: 'column',
   46:                 gap: 12,
   47:                 paddingBottom: 4,
   48:             }}
   49:         >
   50:             {/* ?대컮 ??prev/today/next 쨌 ?쒕ぉ 쨌 ??二??꾪솚 */}
   51:             <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0}}>
   52:                 <AkSkeleton width={132} height={28} isShimmering />
   53:                 <AkSkeleton width={160} height={20} isShimmering />
   54:                 <AkSkeleton width={148} height={28} isShimmering />
   55:             </div>
   56: 
   57:             {/* ?붿씪 癒몃━湲 */}
   58:             <div style={{display: 'grid', gridTemplateColumns: `repeat(${WEEK_COLS}, 1fr)`, gap: 4, flexShrink: 0}}>
   59:                 {Array.from({length: WEEK_COLS}, (_, i) => (
   60:                     <AkSkeleton key={i} width="100%" height={12} isShimmering />
   61:                 ))}
   62:             </div>
   63: 
   64:             {/* 二?횞 ?붿씪 寃⑹옄 */}
   65:             <div
   66:                 style={{
   67:                     flex: '1 1 auto',
   68:                     minHeight: 0,
   69:                     display: 'grid',
   70:                     gridTemplateRows: `repeat(${WEEK_ROWS}, 1fr)`,
   71:                     gridTemplateColumns: `repeat(${WEEK_COLS}, 1fr)`,
   72:                     gap: 4,
   73:                 }}
   74:             >
   75:                 {Array.from({length: WEEK_ROWS * WEEK_COLS}, (_, i) => (
   76:                     <AkSkeleton key={i} width="100%" height="100%" isShimmering />
   77:                 ))}
   78:             </div>
   79:         </div>
   80:     );
   81: }
   82: 
   83: /**
   84:  * `CustomFullCalendar` ? **媛숈? props** 瑜?諛쏅뒗???섑띁??ResizeObserver쨌updateSize ?숈옉 ?ы븿).
   85:  * `calendarRef` ???쇰컲 prop ?대씪 洹몃?濡??꾨떖?섎ŉ, 泥?겕媛 ?꾩갑???ㅼ젣 罹섎┛?붽? 留덉슫?몃릺?? * ?쒖젏??`calendarRef.current` 媛 梨꾩썙吏꾨떎.
   86:  */
   87: export const LazyFullCalendar = (props) => {
   88:     const t = useI18nStore(s => s.t);
   89: 
   90:     return (
   91:         <ChunkErrorBoundary>
   92:             <Suspense fallback={<CalendarSkeleton label={t('common.loading')} />}>
   93:                 <CustomFullCalendarChunk {...props} />
   94:             </Suspense>
   95:         </ChunkErrorBoundary>
   96:     );
   97: };

--- static/ui/src/components/markdown/MarkdownEditorLazy.jsx:1-160 ---
    1: import React, {Suspense} from 'react';
    2: import AkSkeleton from '@atlaskit/skeleton';
    3: import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
    4: import {useI18nStore} from '../../stores/useI18nStore';
    5: 
    6: /**
    7:  * 留덊겕?ㅼ슫 ?먮뵒???ㅽ깮??main 踰덈뱾 諛뽰쑝濡??대낫?대뒗 寃쎄퀎.
    8:  *
    9:  * ???꾩슂?쒓?: `MarkdownEditor` ???뚰겕濡쒓렇 ?깅줉/?섏젙 **紐⑤떖 ?덉뿉?쒕쭔** ?곗씤?? 洹몃윴??洹?紐⑤떖?? * ?뚯쑀??`WorklogPage` 媛 湲곕낯 吏꾩엯 ?쇱슦???뺤쟻 import)?? `@mdxeditor/editor` + `lexical`
   10:  * + `@codemirror/*` + `prismjs` + `@radix-ui/*` 986KB(?먮낯)媛 main ???ㅻ젮 **?깅줉 踰꾪듉????踰덈룄
   11:  * ?꾨Ⅴ吏 ?딆? ?ъ슜?먭퉴吏** ?대젮諛쏄퀬 ?덉뿀?? ECharts 媛 ?대? 媛숈? 洹쒖튃?쇰줈 遺꾨━???덉쑝誘濡? * (`components/chart/echart/ThemedECharts.js`) 愿?됱쓣 ??怨녹뿉 留욎텛??蹂寃쎌씠??
   12:  *
   13:  * 寃쎄퀎媛 紐⑤떖 ?덉씠?쇰뒗 ?먯씠 以묒슂?섎떎 ??`CommonModal` ? `isOpen` ???뚮쭔 children ??留덉슫?명븯誘濡? * (`components/modal/CommonModal.jsx:26`) **紐⑤떖???щ뒗 ?쒓컙**??怨?泥?겕瑜?諛쏅뒗 ?쒖젏?대떎.
   14:  *
   15:  * ?뵶 lazy 媛 ?깅┰?섎뒗 議곌굔? ?꾨옒 **Suspense 寃쎄퀎**?? 寃쎄퀎 ?놁씠 suspend ?섎㈃ React error #426.
   16:  *    猷⑦듃媛 ReactDOM.render(legacy root)??startTransition ? ?대쾿???꾨땲??
   17:  *
   18:  * ?????뚯씪? `./MarkdownEditor` 瑜?**?뺤쟻?쇰줈 import ?섏? ?딅뒗??*. ?뺤쟻 李몄“媛 ?섎굹?쇰룄 ?앷린硫? *   泥?겕媛 ?꾨줈 main ?쇰줈 ?⑹퀜吏꾨떎.
   19:  */
   20: const MarkdownEditorChunk = React.lazy(() =>
   21:     import('./MarkdownEditor').then(m => ({default: m.MarkdownEditor}))
   22: );
   23: 
   24: /**
   25:  * ?먮뵒???먮━ ?ㅼ펷?덊넠 ???대컮 ??以?+ 蹂몃Ц.
   26:  * 蹂몃Ц ?믪씠 200px ? `MarkdownEditor.css` ??`.my-custom-editor-scroll` 怨좎젙 ?믪씠? 媛숈? 媛믪씠?? * 泥?겕媛 ?꾩갑?대룄 紐⑤떖 ?믪씠媛 ?吏 ?딅뒗?? (媛믪씠 諛붾뚮㈃ ?ш린??媛숈씠 ?먮킄???쒕떎.)
   27:  */
   28: export function MarkdownEditorSkeleton({label = 'Loading'}) {
   29:     return (
   30:         <div
   31:             role="status"
   32:             aria-label={label}
   33:             aria-busy="true"
   34:             style={{border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden'}}
   35:         >
   36:             <div style={{display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px'}}>
   37:                 {[40, 24, 96, 24, 28, 28].map((w, i) => (
   38:                     <AkSkeleton key={i} width={w} height={20} isShimmering />
   39:                 ))}
   40:             </div>
   41:             <div style={{display: 'flex', flexDirection: 'column', gap: 10, padding: 20, height: 200}}>
   42:                 <AkSkeleton width="100%" height={12} isShimmering />
   43:                 <AkSkeleton width="92%" height={12} isShimmering />
   44:                 <AkSkeleton width="96%" height={12} isShimmering />
   45:                 <AkSkeleton width="60%" height={12} isShimmering />
   46:             </div>
   47:         </div>
   48:     );
   49: }
   50: 
   51: /** `MarkdownEditor` ? 媛숈? props(`markdown`, `setMarkdown`)瑜?諛쏅뒗?? */
   52: export const LazyMarkdownEditor = (props) => {
   53:     const t = useI18nStore(s => s.t);
   54: 
   55:     return (
   56:         <ChunkErrorBoundary>
   57:             <Suspense fallback={<MarkdownEditorSkeleton label={t('common.loading')} />}>
   58:                 <MarkdownEditorChunk {...props} />
   59:             </Suspense>
   60:         </ChunkErrorBoundary>
   61:     );
   62: };
static/ui/src\App.jsx-15-import LicenseGuidePage from "./pages/license/LicenseGuidePage";
static/ui/src\App.jsx-16-import TrialExpiryBanner from "./pages/license/TrialExpiryBanner";
static/ui/src\App.jsx-17-import { PageSkeleton } from './components/skeleton/Skeleton';
static/ui/src\App.jsx-18-import AppLayout from "./layout/AppLayout";
static/ui/src\App.jsx:19:import ChunkErrorBoundary from "./components/error/ChunkErrorBoundary";
static/ui/src\App.jsx-20-
static/ui/src\App.jsx-21-// 기본 진입 라우트(`/` → `/myWork`)는 **정적 import** 로 둔다.
static/ui/src\App.jsx-22-// 첫 화면까지 청크 왕복을 한 번 더 태우면 초기 체감이 오히려 나빠진다.
static/ui/src\App.jsx-23-import WorklogPage from "./pages/myWork/WorklogPage";
--
static/ui/src\App.jsx-93-            {toast.FlagUI}
static/ui/src\App.jsx-94-            <JobPollingManager toast={toast}/>
static/ui/src\App.jsx-95-            <AppLayout>
static/ui/src\App.jsx-96-                <TrialExpiryBanner />
static/ui/src\App.jsx:97:                <ChunkErrorBoundary>
static/ui/src\App.jsx-98-                    <Suspense fallback={<PageSkeleton />}>
static/ui/src\App.jsx-99-                        <Routes>
static/ui/src\App.jsx-100-                            <Route path="/" element={<Navigate to="/myWork" replace />} />
static/ui/src\App.jsx-101-                            <Route path="/dashboard" element={<PortfolioDashboardPage />} />
--
static/ui/src\App.jsx-115-                            <Route path="/backoffice/storage" element={<StoragePage />} />
static/ui/src\App.jsx-116-                            <Route path="/project/:id" element={<ProjectDetailPage/>} />
static/ui/src\App.jsx-117-                        </Routes>
static/ui/src\App.jsx-118-                    </Suspense>
static/ui/src\App.jsx:119:                </ChunkErrorBoundary>
static/ui/src\App.jsx-120-            </AppLayout>
static/ui/src\App.jsx-121-        </MemoryRouter>
static/ui/src\App.jsx-122-    );
static/ui/src\App.jsx-123-}
--
static/ui/src\components\calendar\FullCalendarLazy.jsx-1-import React, {Suspense} from 'react';
static/ui/src\components\calendar\FullCalendarLazy.jsx-2-import AkSkeleton from '@atlaskit/skeleton';
static/ui/src\components\calendar\FullCalendarLazy.jsx:3:import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
static/ui/src\components\calendar\FullCalendarLazy.jsx-4-import {useI18nStore} from '../../stores/useI18nStore';
static/ui/src\components\calendar\FullCalendarLazy.jsx-5-
static/ui/src\components\calendar\FullCalendarLazy.jsx-6-/**
static/ui/src\components\calendar\FullCalendarLazy.jsx-7- * 캘린더 스택을 main 번들 밖으로 내보내는 경계.
--
static/ui/src\components\calendar\FullCalendarLazy.jsx-90-export const LazyFullCalendar = (props) => {
static/ui/src\components\calendar\FullCalendarLazy.jsx-91-    const t = useI18nStore(s => s.t);
static/ui/src\components\calendar\FullCalendarLazy.jsx-92-
static/ui/src\components\calendar\FullCalendarLazy.jsx-93-    return (
static/ui/src\components\calendar\FullCalendarLazy.jsx:94:        <ChunkErrorBoundary>
static/ui/src\components\calendar\FullCalendarLazy.jsx-95-            <Suspense fallback={<CalendarSkeleton label={t('common.loading')} />}>
static/ui/src\components\calendar\FullCalendarLazy.jsx-96-                <CustomFullCalendarChunk {...props} />
static/ui/src\components\calendar\FullCalendarLazy.jsx-97-            </Suspense>
static/ui/src\components\calendar\FullCalendarLazy.jsx:98:        </ChunkErrorBoundary>
static/ui/src\components\calendar\FullCalendarLazy.jsx-99-    );
static/ui/src\components\calendar\FullCalendarLazy.jsx-100-};
--
static/ui/src\components\error\ChunkErrorBoundary.jsx-13- *
static/ui/src\components\error\ChunkErrorBoundary.jsx-14- * ⚠ 재시도는 리렌더가 아니라 **리로드**여야 한다. webpack 은 실패한 import promise 를 캐시하므로
static/ui/src\components\error\ChunkErrorBoundary.jsx-15- *   같은 청크를 다시 요청해봐야 같은 실패를 반복한다. 새 manifest 를 받아야 풀린다.
static/ui/src\components\error\ChunkErrorBoundary.jsx-16- *
static/ui/src\components\error\ChunkErrorBoundary.jsx:17: * 클래스 컴포넌트인 이유: 에러 경계는 훅으로 만들 수 없다(getDerivedStateFromError/componentDidCatch 전용).
static/ui/src\components\error\ChunkErrorBoundary.jsx-18- * 그래서 t() 도 훅이 아니라 `useI18nStore.getState()` 로 꺼낸다.
static/ui/src\components\error\ChunkErrorBoundary.jsx-19- */
static/ui/src\components\error\ChunkErrorBoundary.jsx:20:export default class ChunkErrorBoundary extends React.Component {
static/ui/src\components\error\ChunkErrorBoundary.jsx-21-    state = {hasError: false};
static/ui/src\components\error\ChunkErrorBoundary.jsx-22-
static/ui/src\components\error\ChunkErrorBoundary.jsx-23-    static getDerivedStateFromError() {
static/ui/src\components\error\ChunkErrorBoundary.jsx-24-        return {hasError: true};
static/ui/src\components\error\ChunkErrorBoundary.jsx-25-    }
static/ui/src\components\error\ChunkErrorBoundary.jsx-26-
static/ui/src\components\error\ChunkErrorBoundary.jsx:27:    componentDidCatch(error) {
static/ui/src\components\error\ChunkErrorBoundary.jsx-28-        // Sentry 는 console.error 를 수집하도록 설정돼 있다(index.js consoleLoggingIntegration).
static/ui/src\components\error\ChunkErrorBoundary.jsx-29-        console.error('Failed to load a lazily-imported chunk.', error);
static/ui/src\components\error\ChunkErrorBoundary.jsx-30-    }
static/ui/src\components\error\ChunkErrorBoundary.jsx-31-
--
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-1-import React, {Suspense} from 'react';
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-2-import AkSkeleton from '@atlaskit/skeleton';
static/ui/src\components\markdown\MarkdownEditorLazy.jsx:3:import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-4-import {useI18nStore} from '../../stores/useI18nStore';
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-5-
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-6-/**
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-7- * 마크다운 에디터 스택을 main 번들 밖으로 내보내는 경계.
--
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-57-export const LazyMarkdownEditor = (props) => {
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-58-    const t = useI18nStore(s => s.t);
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-59-
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-60-    return (
static/ui/src\components\markdown\MarkdownEditorLazy.jsx:61:        <ChunkErrorBoundary>
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-62-            <Suspense fallback={<MarkdownEditorSkeleton label={t('common.loading')} />}>
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-63-                <MarkdownEditorChunk {...props} />
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-64-            </Suspense>
static/ui/src\components\markdown\MarkdownEditorLazy.jsx:65:        </ChunkErrorBoundary>
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-66-    );
static/ui/src\components\markdown\MarkdownEditorLazy.jsx-67-};
--
static/ui/src\components\tabs\CommonTab.jsx-2-import Tabs, { Tab, TabList } from '@atlaskit/tabs';
static/ui/src\components\tabs\CommonTab.jsx-3-import DropdownTab from './DropdownTab';
static/ui/src\components\tabs\CommonTab.jsx-4-import NoPermissionPage from '../../pages/nonPermission/NoPermissionPage';
static/ui/src\components\tabs\CommonTab.jsx-5-import { PageSkeleton } from '../skeleton/Skeleton';
static/ui/src\components\tabs\CommonTab.jsx:6:import ChunkErrorBoundary from '../error/ChunkErrorBoundary';
static/ui/src\components\tabs\CommonTab.jsx-7-
static/ui/src\components\tabs\CommonTab.jsx-8-const getFirstKey = (tabs) => {
static/ui/src\components\tabs\CommonTab.jsx-9-    return tabs[0]?.children?.[0]?.key ?? tabs[0]?.key;
static/ui/src\components\tabs\CommonTab.jsx-10-}
--
static/ui/src\components\tabs\CommonTab.jsx-77-                 * key={activeTab} — 경계는 한 번 에러를 잡으면 계속 에러 화면을 보여주므로,
static/ui/src\components\tabs\CommonTab.jsx-78-                 * 탭을 옮기면 새로 마운트돼 리셋되게 한다. 이게 없으면 청크 하나가 실패한 뒤
static/ui/src\components\tabs\CommonTab.jsx-79-                 * 멀쩡한 다른 탭까지 에러 화면이 된다.
static/ui/src\components\tabs\CommonTab.jsx-80-                 */
static/ui/src\components\tabs\CommonTab.jsx:81:                <ChunkErrorBoundary key={activeTab}>
static/ui/src\components\tabs\CommonTab.jsx-82-                    <Suspense fallback={<PageSkeleton />}>
static/ui/src\components\tabs\CommonTab.jsx-83-                        {canRender ? <ActivePage {...pageProps} /> : <NoPermissionPage />}
static/ui/src\components\tabs\CommonTab.jsx-84-                    </Suspense>
static/ui/src\components\tabs\CommonTab.jsx:85:                </ChunkErrorBoundary>
static/ui/src\components\tabs\CommonTab.jsx-86-            )}
static/ui/src\components\tabs\CommonTab.jsx-87-        </Tabs>
static/ui/src\components\tabs\CommonTab.jsx-88-    );
static/ui/src\components\tabs\CommonTab.jsx-89-}

--- static/ui/src/components/calendar/FullCalendar.jsx:1-180 ---
    1: import FullCalendar from '@fullcalendar/react'
    2: import dayGridPlugin from '@fullcalendar/daygrid'
    3: import {useI18nStore} from "../../stores/useI18nStore";
    4: import interactionPlugin from '@fullcalendar/interaction';
    5: import momentTimezonePlugin from '@fullcalendar/moment-timezone';
    6: import "./FullCalendar.css";
    7: import {router} from "@forge/bridge";
    8: import {formatToHHmm} from "../../utils/TimeUtils";
    9: import {Anchor, Flex} from "@atlaskit/primitives/compiled";
   10: import {useEffect, useRef} from "react";
   11: import {STATUS_COLOR_MAP} from "../../constants/statusColorMap";
   12: import {AvatarStack} from "../avatar/AvatarStack";
   13: 
   14: export const CustomFullCalendar = ({calendarRef, event, onEventClick,
   15:                                        onDatesSetChange, onEventDrop, onDateClick,
   16:                                        scheduleData, holidayDates, eventContent,settingData,
   17:                                        context, isEditable = true}) => {
   18:     const t = useI18nStore(s => s.t)
   19:     const containerRef = useRef(null);
   20: 
   21:     const dayCellClassNames = (arg) => {
   22:         if (!holidayDates?.size) return [];
   23:         const d = arg.date;
   24:         const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
   25:         return holidayDates.has(dateStr) ? ['fc-day-holiday'] : [];
   26:     };
   27: 
   28:     useEffect(() => {
   29:         const observer = new ResizeObserver(() => {
   30:             if (calendarRef?.current) {
   31:                 calendarRef.current.getApi().updateSize();
   32:             }
   33:         });
   34: 
   35:         if (containerRef.current) {
   36:             observer.observe(containerRef.current);
   37:         }
   38: 
   39:         return () => observer.disconnect();
   40:     }, []);
   41: 
   42:     return (
   43:         <div ref={containerRef} style={{height: '100%', minHeight: 0, paddingBottom: '4px'}}>
   44:             <FullCalendar
   45:                 ref={calendarRef}
   46:                 plugins={[dayGridPlugin, interactionPlugin, momentTimezonePlugin]}
   47:                 initialView='dayGridMonth'
   48:                 weekends={true}
   49:                 events={event}
   50:                 selectable={true}
   51:                 showNonCurrentDates={false}
   52:                 editable={isEditable}
   53:                 eventDurationEditable={false}
   54:                 eventDrop={onEventDrop}
   55:                 eventClick={onEventClick}
   56:                 datesSet={onDatesSetChange}
   57:                 timeZone={context?.timezone ?? 'UTC'}
   58:                 locale={context?.locale ?? 'en'}
   59:                 height="100%"
   60:                 contentHeight="calc(100% - 40px)"
   61:                 expandRows={true}
   62:                 dayMaxEvents={3}
   63:                 moreLinkClick="popover"
   64: 
   65:                 dayCellClassNames={dayCellClassNames}
   66:                 eventContent={eventContent ?? ((info) => renderEventContent(info, context))}
   67: 
   68:                 headerToolbar={{
   69:                     left: 'prev today next',
   70:                     center: 'title',
   71:                     right: 'dayGridMonth dayGridWeek'
   72:                 }}
   73: 
   74:                 buttonText={{
   75:                     today: t('common.calendar.today'),
   76:                     month: t('common.calendar.month'),
   77:                     week: t('common.calendar.week'),
   78:                     prev: '<',
   79:                     next: '>'
   80:                 }}
   81:                 dateClick={onDateClick}
   82:                 handleWindowResize={true}
   83:             />
   84:         </div>
   85:     )
   86: }
   87: 
   88: export const renderEventContent = (eventInfo, context) => {
   89: 
   90:     const eventType = eventInfo.event.extendedProps?.type;
   91: 
   92:     if (eventType === "holiday") {
   93:         return (
   94:             <div style={{
   95:                 padding: "2px 6px",
   96:                 fontSize: 11,
   97:                 fontWeight: 600,
   98:                 color: "#E53935",
   99:                 overflow: "hidden",
  100:                 whiteSpace: "nowrap",
  101:                 width: "100%",
  102:             }}>
  103:                 {eventInfo.event.title}
  104:             </div>
  105:         );
  106:     }
  107: 
  108:     if (eventType === "schedule") {
  109:         const {typeInfo} = eventInfo.event.extendedProps;
  110:         return (
  111:             <div
  112:                 style={{
  113:                     display: "flex",
  114:                     alignItems: "center",
  115:                     gap: 4,
  116:                     padding: "2px 6px",
  117:                     borderRadius: 4,
  118:                     backgroundColor: typeInfo?.backgroundColor,
  119:                     color: typeInfo?.color,
  120:                     fontSize: 11,
  121:                     overflow: "hidden",
  122:                     whiteSpace: "nowrap",
  123:                     width: "100%",
  124:                     fontWeight: 600
  125:                 }}
  126:             >
  127:                 <span>{typeInfo?.icon}</span>
  128:                 <span>{typeInfo?.label}</span>
  129:             </div>
  130:         );
  131:     }
  132: 
  133: 
  134: const {issue, worklog} = eventInfo.event.extendedProps;
  135:     const status = issue.fields?.status?.statusCategory;
  136:     const issueType = issue.fields?.issuetype;
  137: 
  138:     const color = STATUS_COLOR_MAP[status.colorName] || STATUS_COLOR_MAP["medium-gray"];
  139: 
  140:     const isAllDay = eventInfo.event.allDay;
  141:     const start = new Date(worklog.started);
  142:     const end = new Date(start.getTime() + worklog.timeSpentSeconds * 1000);
  143: 
  144:     const author = [worklog?.author];
  145: 
  146:     return (
  147:         <div style={{
  148:             display: "flex",
  149:             alignItems: "center",
  150:             gap: 4,
  151:             padding: "2px 6px",
  152:             borderRadius: 4,
  153:             backgroundColor: color.bg,
  154:             color: color.text,
  155:             fontSize: 11,
  156:             overflow: "hidden",
  157:             whiteSpace: "nowrap",
  158:             width: "100%"
  159:         }}>
  160: 
  161:             {issueType && (
  162:                 <img src={issueType?.iconUrl} alt="" style={{ width: 12, height: 12 }}/>
  163:             )}
  164: 
  165:                 <Anchor href="#" onClick={(e) => {
  166:                 e.stopPropagation();
  167:                 if (context?.siteUrl) router.open(`${context.siteUrl}/browse/${issue.key}`);
  168:             }}>
  169:                 <span style={{ opacity: 0.9 }}>{issue.key}</span>
  170:             </Anchor>
  171: 
  172:             {!isAllDay && (
  173:                 <span style={{ fontWeight: 600, flexShrink: 0 }}>
  174:                     {formatToHHmm(start)} ~ {formatToHHmm(end)}
  175:                 </span>
  176:             )}
  177:             <span style={{fontSize: 11, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis",}}>
  178:                 {worklog.timeSpent}
  179:             </span>
  180: 

--- static/ui/src/components/markdown/MarkdownEditor.jsx:1-200 ---
    1: import '@mdxeditor/editor/style.css'
    2: import {
    3:     MDXEditor,
    4:     headingsPlugin,
    5:     listsPlugin,
    6:     linkPlugin,
    7:     quotePlugin,
    8:     markdownShortcutPlugin, linkDialogPlugin, codeBlockPlugin, codeMirrorPlugin, toolbarPlugin, UndoRedo, Separator,
    9:     BlockTypeSelect, CreateLink, InsertCodeBlock
   10: } from '@mdxeditor/editor'
   11: import './MarkdownEditor.css'
   12: 
   13: const BoldItalicStrikethrough = () => {
   14:     return null;
   15: }
   16: 
   17: const allLanguages = {
   18:     js: 'JavaScript',
   19:     jsx: 'React (JSX)',
   20:     ts: 'TypeScript',
   21:     tsx: 'React (TSX)',
   22:     html: 'HTML',
   23:     css: 'CSS',
   24:     python: 'Python',
   25:     java: 'Java',
   26:     json: 'JSON',
   27:     bash: 'Bash/Shell',
   28:     sql: 'SQL',
   29:     markdown: 'Markdown',
   30:     yaml: 'YAML',
   31:     rust: 'Rust',
   32:     go: 'Go',
   33:     cpp: 'C++',
   34:     csharp: 'C#',
   35:     php: 'PHP'
   36: };
   37: 
   38: export const MarkdownEditor = ({markdown, setMarkdown}) => {
   39:     return <MDXEditor
   40:         markdown={markdown}
   41:         contentEditableClassName="my-custom-editor-scroll"
   42:         plugins={[
   43:             headingsPlugin(),
   44:             listsPlugin(),
   45:             quotePlugin(),
   46:             linkPlugin(),
   47:             linkDialogPlugin(),
   48:             codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }),
   49:             codeMirrorPlugin({ codeBlockLanguages: allLanguages }),
   50:             markdownShortcutPlugin(),
   51:             toolbarPlugin({
   52:                 toolbarContents: () => (
   53:                     <>
   54:                         <UndoRedo />
   55:                         <Separator />
   56:                         <BoldItalicStrikethrough />
   57:                         <Separator />
   58:                         <BlockTypeSelect /> {/* H1~H6, Paragraph, Quote ?대떦 */}
   59:                         <Separator />
   60:                         <CreateLink />
   61:                         <InsertCodeBlock />
   62:                     </>
   63:                 )
   64:             })
   65:         ]}
   66:         onChange={setMarkdown}
   67:     />
   68: }

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/myWork/modal/WorklogModal.jsx' 1 180; Show-Range 'static/ui/src/pages/myWork/modal/WorklogModal.jsx' 250 430; Show-Range 'static/ui/src/pages/myWork/modal/WorklogModal.jsx' 550 720; Show-Range 'static/ui/src/components/error/ChunkErrorBoundary.jsx' 1 160; Show-Range 'static/ui/src/pages/myWork/WorklogPage.jsx' 70 170; Show-Range 'static/ui/src/pages/myWork/WorklogPage.jsx' 430 530" in C:\CloudJira\moves-workforce
 succeeded in 7054ms:

--- static/ui/src/pages/myWork/modal/WorklogModal.jsx:1-180 ---
    1: import BaseModal from "../../../components/modal/CommonModal";
    2: import {ErrorMessage, Field} from "@atlaskit/form";
    3: import {DatePicker, TimePicker} from "@atlaskit/datetime-picker";
    4: import {view} from "@forge/bridge";
    5: import Button from "@atlaskit/button/new";
    6: import {useI18nStore} from "../../../stores/useI18nStore";
    7: import React, {useEffect, useMemo, useState} from "react";
    8: import Textfield from "@atlaskit/textfield";
    9: import Select from "@atlaskit/select";
   10: import Tooltip from "@atlaskit/tooltip";
   11: import {CustomFieldKey, MovesAlias} from "../../../constants/customField";
   12: import {executeRequest} from "../../../utils/jiraApi/requestJira";
   13: import {getIssueCoworkerIds} from "../../../utils/jiraApi/coworkerProperty";
   14: import {useUserInfos} from "../../../utils/jiraApi/users/getUserInfos";
   15: import {IssueComponent} from "../../../components/issue/IssueComponent";
   16: import {
   17:     convertTimeToSeconds, formatToHHmm,
   18:     getDateString,
   19:     getTimeISOString,
   20:     timeValidation
   21: } from "../../../utils/TimeUtils";
   22: import {LazyMarkdownEditor} from "../../../components/markdown/MarkdownEditorLazy";
   23: import {UserAvatar} from "../../../components/avatar/UserAvatar";
   24: import {AvatarStack} from "../../../components/avatar/AvatarStack";
   25: import {scheduleTypeOptions} from "../../../constants/scheduleTypeOptions";
   26: import Checkbox from "@atlaskit/checkbox";
   27: import {fetchJiraProjectPermissions, projectKeyOfIssue} from "../../../utils/jiraApi/useJiraEditGuards";
   28: import {useQueryClient} from "@tanstack/react-query";
   29: import {myWorkKeys} from "../../../utils/queryKey/myWorkKeys";
   30: import {calendarKeys} from "../../../utils/queryKey/logicalAuditKeys";
   31: 
   32: const context = await view.getContext();
   33: 
   34: /*
   35:  * 留덊겕?ㅼ슫?볾DF 蹂?섍린??留덊겕?ㅼ슫 ?뚯꽌(marked/mdast/micromark)瑜??듭㎏濡??뚭퀬 ?⑤떎.
   36:  * ??紐⑤떖???뚯쑀??`WorklogPage` 媛 湲곕낯 吏꾩엯 ?쇱슦???뺤쟻 import)?? ?뺤쟻?쇰줈 ?먮㈃ ?뚰겕濡쒓렇瑜?
   37:  * ??踰덈룄 ?댁? ?딅뒗 ?ъ슜?먭퉴吏 ?뚯꽌瑜??대젮諛쏅뒗?????먮뵒??`MarkdownEditorLazy`)瑜??대졇?붾뜲
   38:  * 蹂?섍린媛 ?⑥븘 ?덉쑝硫?遺꾨━ ?④낵媛 ?덈컲???쒕떎.
   39:  *
   40:  * 紐⑤뱢 promise 瑜?罹먯떆?섎?濡???踰덉㎏ ?몄텧遺?곕뒗 ?뺣났???녿떎(webpack ??媛숈? 泥?겕瑜??ъ궗?⑺븳??.
   41:  */
   42: let markdownToAdfPromise = null;
   43: const loadMarkdownToAdf = () => {
   44:     if (!markdownToAdfPromise) {
   45:         markdownToAdfPromise = import('marklassian').then(m => m.markdownToAdf);
   46:     }
   47:     return markdownToAdfPromise;
   48: };
   49: 
   50: let adfToMdPromise = null;
   51: const loadAdfToMd = () => {
   52:     if (!adfToMdPromise) {
   53:         adfToMdPromise = import('adf-to-md');
   54:     }
   55:     return adfToMdPromise;
   56: };
   57: 
   58: // executeRequest ???ㅽ뙣 ??throw ???{success:false} 諛섑솚 ??throw 濡??밴꺽??catch 濡??섎┝
   59: const ensureWorklogResult = (result) => {
   60:     if (result?.success === false) {
   61:         const err = new Error('worklog request failed');
   62:         err.cause = result.error;
   63:         throw err;
   64:     }
   65:     return result;
   66: };
   67: 
   68: export const WorklogModal = ({
   69:     selectedProjectIds, isOpen, closeModal, submitModal, worklogInfo,
   70:     clickedDate, coworkerFieldId, settingData, holidayDates, myScheduleList
   71: }) => {
   72:     const t = useI18nStore(s => s.t);
   73:     const queryClient = useQueryClient();
   74: 
   75:     // ?몄쭛 ?щ? / 留덊겕?ㅼ슫 蹂몃Ц
   76:     const [isEdit, setIsEdit] = useState(false);
   77:     const [markdown, setMarkdown] = useState('');
   78: 
   79:     // ?낅젰 紐⑤뱶: "simple" = ?좎쭨+?쒓컙 吏곸젒 ?낅젰, "range" = 湲곌컙 ?쇨큵 ?낅젰
   80:     const [inputMode, setInputMode] = useState("simple");
   81: 
   82:     // 湲곌컙 ?낅젰 紐⑤뱶??state
   83:     const [rangeStartTime, setRangeStartTime] = useState("09:00");
   84:     const [rangeEndTime, setRangeEndTime] = useState("17:00");
   85:     const [rangeStartDate, setRangeStartDate] = useState(clickedDate ?? getDateString(new Date()));
   86:     const [rangeEndDate, setRangeEndDate] = useState(clickedDate ?? getDateString(new Date()));
   87: 
   88:     // 鍮꾧렐臾댁씪 ?쒖쇅 ?듭뀡
   89:     const [skipWeekends, setSkipWeekends] = useState(false);
   90:     const [skipHolidays, setSkipHolidays] = useState(false);
   91:     const [skipSchedules, setSkipSchedules] = useState(false); // workRatio 0???ㅼ?以??곗감 ??
   92: 
   93:     // 湲곌컙 ?낅젰 ?쇨큵 ?깅줉 ?ㅽ뙣 硫붿떆吏
   94:     const [rangeError, setRangeError] = useState(null);
   95:     // ?깅줉/?섏젙/??젣 ?ㅽ뙣 硫붿떆吏 (Jira 沅뚰븳 嫄곕? ?ы븿, 紐⑤뱶 臾닿? ?쒖떆)
   96:     const [submitError, setSubmitError] = useState(null);
   97: 
   98:     const { issue, worklog } = worklogInfo || {};
   99:     const worklog_id = worklog?.id;
  100:     const issue_id = issue?.id;
  101: 
  102:     const defaultIssueOption = issue && {
  103:         label: <IssueComponent issueKey={issue.key} issueImage={issue.fields.issuetype.iconUrl} summary={issue?.fields?.summary}/>,
  104:         value: issue.id
  105:     };
  106: 
  107:     const [selectedIssue, setSelectedIssue] = useState(issue ?? null);
  108:     const [selectedWorklog, setSelectedWorklog] = useState(worklog ?? null);
  109: 
  110:     useEffect(() => {
  111:         setSelectedIssue(issue ?? null);
  112:         setSelectedWorklog(worklog ?? null);
  113:     }, [worklogInfo]);
  114: 
  115:     const assignee = selectedIssue?.fields.assignee;
  116:     const worklogAuthor = selectedWorklog?.author;
  117:     // coworker ???꾨줈?쇳떚(movesRms)??accountId[] ??useUserInfos(bulk) 濡?user 媛앹껜 resolve.
  118:     const coworkerIds = getIssueCoworkerIds(selectedIssue);
  119:     const { data: coworkerUsers } = useUserInfos(coworkerIds);
  120:     const coworkers = coworkerUsers;
  121: 
  122:     // 紐⑤떖???대┫ ?뚮쭏???몄쭛 ?щ? ?먮떒 諛?湲곕낯媛?珥덇린??
  123:     useEffect(() => {
  124:         setIsEdit(!!worklog_id);
  125:         setInputMode("simple");
  126:         setSubmitError(null);
  127: 
  128:         // 湲곗〈 肄붾찘?멸? ?놁쑝硫?蹂?섍린瑜??꾩삁 諛쏆? ?딅뒗???좉퇋 ?깅줉???遺遺꾩씠??.
  129:         const comment = worklog?.comment;
  130:         if (!comment) {
  131:             setMarkdown('');
  132:             return;
  133:         }
  134: 
  135:         // 蹂?섍린 濡쒕뱶媛 鍮꾨룞湲곕씪, 洹??ъ씠 ?ㅻⅨ ?뚰겕濡쒓렇瑜??대㈃ ??쾶 ?꾩갑??寃곌낵媛 ??뼱?????덈떎.
  136:         let cancelled = false;
  137:         loadAdfToMd()
  138:             .then(adf2md => {
  139:                 if (!cancelled) setMarkdown(adf2md.convert(comment)?.result || '');
  140:             })
  141:             .catch(() => {
  142:                 if (!cancelled) setMarkdown('');
  143:             });
  144:         return () => { cancelled = true; };
  145:     }, [worklogInfo]);
  146: 
  147:     // 蹂몄씤 ?뚰겕濡쒓렇?닿굅???묒꽦???뺣낫媛 ?놁쓣 ?뚮쭔 ?몄쭛 ?덉슜
  148:     const isEditable = !worklogAuthor || worklogAuthor.accountId === context.accountId;
  149:     const hourRate = settingData?.hourRate || 8;
  150: 
  151:     // ?쒖옉~醫낅즺 ?쒓컙 李⑥씠濡??섎（ ?묒뾽 ?쒓컙(h) 怨꾩궛
  152:     const calcHoursPerDay = (startTime, endTime) => {
  153:         if (!startTime || !endTime) return 0;
  154:         const [sh, sm] = startTime.split(':').map(Number);
  155:         const [eh, em] = endTime.split(':').map(Number);
  156:         return Math.max(((eh * 60 + em) - (sh * 60 + sm)) / 60, 0);
  157:     };
  158:     const hoursPerDay = calcHoursPerDay(rangeStartTime, rangeEndTime);
  159: 
  160:     // ?쒖쇅???좎쭨 Set: 怨듯쑕??+ workRatio 0???ㅼ?以??곗감 ?? ?좎쭨瑜??⑹궛
  161:     const skipDates = useMemo(() => {
  162:         const set = new Set();
  163:         if (skipHolidays && holidayDates) {
  164:             holidayDates.forEach(d => set.add(d));
  165:         }
  166:         if (skipSchedules && myScheduleList?.length) {
  167:             // workRatio媛 0??????곗감 ?????ㅼ?以??좎쭨留??섏쭛
  168:             const zeroRatioTypes = new Set(
  169:                 scheduleTypeOptions.filter(o => o.workRatio === 0).map(o => o.value)
  170:             );
  171:             myScheduleList.forEach(schedule => {
  172:                 if (zeroRatioTypes.has(schedule.schedule_type)) {
  173:                     const cur = new Date(schedule.schedule_start_date);
  174:                     const end = new Date(schedule.schedule_end_date);
  175:                     while (cur <= end) {
  176:                         set.add(getDateString(cur));
  177:                         cur.setDate(cur.getDate() + 1);
  178:                     }
  179:                 }
  180:             });

--- static/ui/src/pages/myWork/modal/WorklogModal.jsx:250-430 ---
  250:         return dates;
  251:     };
  252: 
  253:     const checkTimeReg = time => {
  254:         if (!time) return "REQUIRED";
  255:         if (!timeValidation.test(time)) return "NOT VALID";
  256:     };
  257:     const emptyValidate = value => { if (!value) return 'REQUIRED'; };
  258: 
  259:     const showErrorMsg = error => {
  260:         if (error === 'REQUIRED') return <ErrorMessage>{t('worklog.modal.field.error.required')}</ErrorMessage>;
  261:         if (error === 'NOT VALID') return <ErrorMessage>{t('worklog.modal.field.error.notvalid')}</ErrorMessage>;
  262:     };
  263: 
  264:     const onSubmit = async value => {
  265:         setRangeError(null);
  266:         setSubmitError(null);
  267: 
  268:         // 醫낅즺<=?쒖옉?대㈃ hoursPerDay 媛 0?대씪 timeSpentSeconds=0 ?쇰줈 ?쒖텧?섍퀬 Jira 媛 400 ?쇰줈
  269:         // 嫄곕??쒕떎. 誘몃━蹂닿린??hoursPerDay>0 議곌굔?대씪 ?붾㈃?먮뒗 ?꾨Т 寃쎄퀬媛 ?녿떎 ???ш린??留됰뒗??
  270:         // TimePicker ??timeIsEditable ?대씪 ?꾩쓽 臾몄옄?댁씠 ?ㅼ뼱?????덇퀬, 洹몃븣 hoursPerDay ??
  271:         // NaN ?대떎. `NaN <= 0` ? false ???ш린瑜?洹몃깷 ?듦낵??timeSpentSeconds: NaN ???섍컙??
  272:         if (inputMode === "range" && !(Number.isFinite(hoursPerDay) && hoursPerDay > 0)) {
  273:             setRangeError(t('worklog.error.rangeInvalidTime'));
  274:             return;
  275:         }
  276: 
  277:         // Jira 沅뚰븳 ?ъ쟾 泥댄겕 ???뺤젙 嫄곕?(false)留?李⑤떒, null(誘명솗??? ?쒕룄(?쒕쾭媛 理쒖쥌 嫄곕?)
  278:         const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(selectedIssue?.key));
  279:         if (worklog_id ? perms.canEditOwnWorklogs === false : perms.canWorkOnIssues === false) {
  280:             setSubmitError(t(worklog_id ? 'worklog.jiraPermission.edit' : 'worklog.jiraPermission.add'));
  281:             return;
  282:         }
  283: 
  284:         try {
  285:             if (inputMode === "range") {
  286:                 await addWorklogRange(value);
  287:             } else if (worklog_id) {
  288:                 await updateWorklog(value);
  289:             } else {
  290:                 await addWorklog(value);
  291:             }
  292:             submitModal();
  293:         } catch (e) {
  294:             // 湲곌컙 ?낅젰 以??ㅽ뙣 ??濡ㅻ갚 寃곌낵???곕씪 ?덈궡瑜?媛瑜몃떎(?⑥? ??ぉ???덉쑝硫?洹??ъ떎???뚮┛??
  295:             if (inputMode === "range") {
  296:                 if (e?.rollbackFailed) {
  297:                     // 痍⑥냼?섏? 紐삵븳 ??ぉ??紐⑸줉???쒕윭?섏빞 ?쒕떎 ???덈궡留??섍퀬 罹먯떆瑜??먮㈃ ?뺤씤??諛⑸쾿???녿떎.
  298:                     // ??紐⑤떖? ?꾨줈?앺듃 罹섎┛??ProjectCalender)?먯꽌???ъ궗?⑸릺怨?洹몄そ 罹먯떆??
  299:                     // calendarKeys 瑜??곕?濡? myWorkKeys 留?臾댄슚?뷀븯硫?洹??붾㈃?먯꽌??no-op ???쒕떎.
  300:                     queryClient.invalidateQueries({queryKey: myWorkKeys.calendarWorklogsAll});
  301:                     queryClient.invalidateQueries({queryKey: myWorkKeys.projectWorklogsAll});
  302:                     queryClient.invalidateQueries({queryKey: calendarKeys.all});
  303:                 }
  304:                 setRangeError(t(
  305:                     e?.rollbackFailed ? 'worklog.error.rangeRollbackFailed'
  306:                         : e?.nothingCreated ? 'worklog.error.saveFailed'
  307:                             : 'worklog.error.rangeRolledBack'
  308:                 ));
  309:             } else {
  310:                 setSubmitError(t('worklog.error.saveFailed'));
  311:             }
  312:         }
  313:     };
  314: 
  315:     const onDelete = async () => {
  316:         setSubmitError(null);
  317:         const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(selectedIssue?.key));
  318:         if (perms.canDeleteOwnWorklogs === false) {
  319:             setSubmitError(t('worklog.jiraPermission.delete'));
  320:             return;
  321:         }
  322:         try {
  323:             ensureWorklogResult(await executeRequest('deleteWorklog', {}, {issueIdOrKey: issue_id, id: worklog_id}));
  324:             submitModal();
  325:         } catch (e) {
  326:             setSubmitError(t('worklog.error.saveFailed'));
  327:         }
  328:     };
  329: 
  330:     // ?⑥씪 ?좎쭨 ?뚰겕濡쒓렇 異붽?
  331:     const addWorklog = async value => {
  332:         const markdownToAdf = await loadMarkdownToAdf();
  333:         const pathParams = { issueIdOrKey: value.issueKey.value };
  334:         const params = {
  335:             comment: markdownToAdf(markdown),
  336:             started: getTimeISOString(value.start_date, value.start_time, context.timezone),
  337:             timeSpentSeconds: convertTimeToSeconds(value.spent_time)
  338:         };
  339:         return executeRequest('addWorklog', params, pathParams).then(result => ensureWorklogResult(result).id);
  340:     };
  341: 
  342:     // ?⑥씪 ?뚰겕濡쒓렇 ?섏젙
  343:     const updateWorklog = async value => {
  344:         const markdownToAdf = await loadMarkdownToAdf();
  345:         const pathParams = { issueIdOrKey: value.issueKey.value, id: worklog_id };
  346:         const params = {
  347:             comment: markdownToAdf(markdown),
  348:             started: getTimeISOString(value.start_date, value.start_time, context.timezone),
  349:             timeSpentSeconds: convertTimeToSeconds(value.spent_time)
  350:         };
  351:         ensureWorklogResult(await executeRequest('updateWorklog', params, pathParams));
  352:     };
  353: 
  354:     // 湲곌컙 ?낅젰: ?좎쭨蹂??뚰겕濡쒓렇瑜??쒖감 ?앹꽦, 以묎컙 ?ㅽ뙣 ???깃났遺??꾩껜 濡ㅻ갚
  355:     const addWorklogRange = async value => {
  356:         const markdownToAdf = await loadMarkdownToAdf();
  357:         const issueIdOrKey = value.issueKey.value;
  358:         const dates = getWorkingDateList(value.range_start_date, value.range_end_date);
  359:         const timeSpentSeconds = hoursPerDay * 3600;
  360:         const createdIds = [];
  361:         try {
  362:             for (const dateStr of dates) {
  363:                 const id = await executeRequest('addWorklog', {
  364:                     comment: markdownToAdf(markdown),
  365:                     started: getTimeISOString(dateStr, rangeStartTime, context.timezone),
  366:                     timeSpentSeconds
  367:                 }, {issueIdOrKey}).then(r => ensureWorklogResult(r).id);
  368:                 createdIds.push(id);
  369:             }
  370:         } catch (e) {
  371:             /*
  372:              * ?대? ?앹꽦???뚰겕濡쒓렇瑜??섎룎由곕떎. ?대븣 ??젣 **寃곌낵瑜?諛섎뱶???뺤씤**?쒕떎 ??
  373:              * ?깅줉??留됱? ?먯씤(?ㅽ듃?뚰겕 ?⑥젅쨌沅뚰븳 ?뚯닔)??怨???젣??留됰뒗 ?먯씤?대씪,
  374:              * ?뺤씤?섏? ?딆쑝硫??뺤옉 濡ㅻ갚???ㅽ뙣???곹솴?먯꽌 "紐⑤몢 痍⑥냼???쇰줈 ?덈궡?섍쾶 ?쒕떎.
  375:              */
  376:             const rollbackOk = await Promise.all(
  377:                 createdIds.map(id =>
  378:                     executeRequest('deleteWorklog', {}, {issueIdOrKey, id})
  379:                         .then(r => r?.success !== false)
  380:                         .catch(() => false)
  381:                 )
  382:             );
  383:             const err = new Error('worklog range failed');
  384:             err.cause = e;
  385:             err.rollbackFailed = rollbackOk.some(ok => !ok);
  386:             // 泥??좎쭨遺???ㅽ뙣?섎㈃ ?섎룎由?寃껋씠 ?녿떎. ?대븣 "紐⑤몢 痍⑥냼?섏뿀?듬땲??濡??덈궡?섎㈃
  387:             // 留뚮뱾?댁죱???щ씪吏???ぉ???덈뒗 寃껋쿂???쏀엺??
  388:             err.nothingCreated = createdIds.length === 0;
  389:             throw err;
  390:         }
  391:     };
  392: 
  393:     const promiseOptions = async inputValue => {
  394:         // coworker JQL ? ?꾨줈?쇳떚 alias(movesRmsCoworkers)濡? projectId JQL ? ?꾪뻾 ?좎?(鍮꾨ぉ??.
  395:         let jql = `${CustomFieldKey.projectIdField} IS NOT EMPTY AND (${MovesAlias.coworkers} = currentUser() OR assignee = currentUser())`;
  396:         const projectIds = Array.isArray(selectedProjectIds) ? selectedProjectIds
  397:             : selectedProjectIds ? [selectedProjectIds] : [];
  398:         if (projectIds.length > 0) {
  399:             jql += ` AND (${projectIds.map(id => `moves_RMS_projectId = "${id}"`).join(" OR ")})`;
  400:         }
  401:         if (inputValue) jql += ` AND (textfields ~ "${inputValue}" OR workItemKey ~ "*${inputValue}*")`;
  402:         const result = await executeRequest('searchIssueWithJQL', {
  403:             jql, fields: ['*all'], properties: ['movesRms'], fieldsByKeys: true, maxResults: 100
  404:         });
  405:         return result.issues.map(issue => ({
  406:             label: <IssueComponent issueKey={issue.key} issueImage={issue.fields.issuetype.iconUrl} summary={issue?.fields?.summary}/>,
  407:             value: issue.id,
  408:             issue
  409:         }));
  410:     };
  411: 
  412:     return (
  413:         <BaseModal
  414:             isOpen={isOpen}
  415:             onClose={closeModal}
  416:             title={isEdit ? t('worklog.modal.title.edit') : t('worklog.modal.title.add')}
  417:             onSubmit={onSubmit}
  418:             submitText={isEdit ? t('common.button.edit') : t('common.button.add')}
  419:             footer={({ submitting, submitText }) => (
  420:                 <>
  421:                     <Button appearance="subtle" onClick={closeModal} isDisabled={submitting}>
  422:                         {t('common.button.close')}
  423:                     </Button>
  424:                     {isEditable && (
  425:                         <>
  426:                             {isEdit && worklogAuthor && (
  427:                                 <Button appearance="danger" onClick={onDelete}>
  428:                                     {t('common.button.delete')}
  429:                                 </Button>
  430:                             )}

--- static/ui/src/pages/myWork/modal/WorklogModal.jsx:550-720 ---
  550:                             {({ fieldProps, error }) => (
  551:                                 <>
  552:                                     <TimePicker {...fieldProps} isDisabled={!isEditable}
  553:                                         locale={context.locale} timeIsEditable />
  554:                                     {showErrorMsg(error)}
  555:                                 </>
  556:                             )}
  557:                         </Field>
  558:                     </div>
  559:                     <Field name="spent_time" validate={checkTimeReg}
  560:                            label={t('worklog.modal.field.spentTime')} isRequired
  561:                            defaultValue={worklog?.timeSpent || ''}>
  562:                         {({ fieldProps, error }) => (
  563:                             <Tooltip content={
  564:                                 <><p>{t('worklog.modal.spentTime.tooltip.1')}</p>
  565:                                 <ul><li>{t('worklog.modal.spentTime.tooltip.2')}</li>
  566:                                 <li>{t('worklog.modal.spentTime.tooltip.3')}</li></ul></>
  567:                             }>
  568:                                 {(tooltipProps) => (
  569:                                     <>
  570:                                         <Textfield {...fieldProps} {...tooltipProps} isDisabled={!isEditable} />
  571:                                         {showErrorMsg(error)}
  572:                                     </>
  573:                                 )}
  574:                             </Tooltip>
  575:                         )}
  576:                     </Field>
  577:                 </>
  578:             )}
  579: 
  580:             {/* ?? 湲곌컙 ?낅젰 紐⑤뱶 ?? */}
  581:             {inputMode === "range" && (
  582:                 <>
  583:                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  584:                         <Field name="range_start_date" label="?쒖옉?? validate={emptyValidate} isRequired
  585:                                defaultValue={rangeStartDate}>
  586:                             {({ fieldProps, error }) => (
  587:                                 <>
  588:                                     <DatePicker {...fieldProps}
  589:                                         value={rangeStartDate}
  590:                                         onChange={(val) => { fieldProps.onChange(val); setRangeStartDate(val); }}
  591:                                         shouldShowCalendarButton locale={context.locale} />
  592:                                     {showErrorMsg(error)}
  593:                                 </>
  594:                             )}
  595:                         </Field>
  596:                         <Field name="range_end_date" label="醫낅즺?? validate={emptyValidate} isRequired
  597:                                defaultValue={rangeEndDate}>
  598:                             {({ fieldProps, error }) => (
  599:                                 <>
  600:                                     <DatePicker {...fieldProps}
  601:                                         value={rangeEndDate}
  602:                                         onChange={(val) => { fieldProps.onChange(val); setRangeEndDate(val); }}
  603:                                         shouldShowCalendarButton locale={context.locale} />
  604:                                     {showErrorMsg(error)}
  605:                                 </>
  606:                             )}
  607:                         </Field>
  608:                     </div>
  609:                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
  610:                         <Field name="daily_start_time" label="?섎（ ?쒖옉 ?쒓컙" isRequired>
  611:                             {({ fieldProps }) => (
  612:                                 <TimePicker {...fieldProps}
  613:                                     value={rangeStartTime}
  614:                                     onChange={(val) => { fieldProps.onChange(val); setRangeStartTime(val); }}
  615:                                     locale={context.locale} timeIsEditable />
  616:                             )}
  617:                         </Field>
  618:                         <Field name="daily_end_time" label="?섎（ 醫낅즺 ?쒓컙" isRequired>
  619:                             {({ fieldProps }) => (
  620:                                 <TimePicker {...fieldProps}
  621:                                     value={rangeEndTime}
  622:                                     onChange={(val) => { fieldProps.onChange(val); setRangeEndTime(val); }}
  623:                                     locale={context.locale} timeIsEditable />
  624:                             )}
  625:                         </Field>
  626:                     </div>
  627: 
  628:                     {/* 鍮꾧렐臾댁씪 ?쒖쇅 ?듭뀡 */}
  629:                     <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
  630:                         <Checkbox isChecked={skipWeekends} onChange={e => setSkipWeekends(e.target.checked)} label="二쇰쭚 ?쒖쇅" />
  631:                         <Checkbox isChecked={skipHolidays} onChange={e => setSkipHolidays(e.target.checked)} label="怨듯쑕???쒖쇅" />
  632:                         <Checkbox isChecked={skipSchedules} onChange={e => setSkipSchedules(e.target.checked)} label="?곗감/?닿? ?쒖쇅" />
  633:                     </div>
  634: 
  635:                     {/* ?덉긽 ?앹꽦 ?뚰겕濡쒓렇 ??諛?珥??쒓컙 誘몃━蹂닿린 */}
  636:                     {hoursPerDay > 0 && rangeStartDate && rangeEndDate && (
  637:                         <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6,
  638:                             padding: '6px 10px', background: '#F3F4F6', borderRadius: 4 }}>
  639:                             ?뚰겕濡쒓렇 <strong>{previewWorkingDays}媛?/strong> ?앹꽦 &nbsp;쨌&nbsp;
  640:                             ?섎（ <strong>{hoursPerDay}h</strong> &nbsp;쨌&nbsp;
  641:                             珥?<strong>{(previewWorkingDays * hoursPerDay).toFixed(1)}h</strong>
  642:                         </div>
  643:                     )}
  644:                     {/* ?쇨큵 ?깅줉 ?ㅽ뙣 ??濡ㅻ갚 ?꾨즺 ?덈궡 */}
  645:                     {rangeError && (
  646:                         <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6,
  647:                             padding: '6px 10px', background: '#FEF2F2', borderRadius: 4 }}>
  648:                             {rangeError}
  649:                         </div>
  650:                     )}
  651:                 </>
  652:             )}
  653: 
  654:             <Field name="description" label={t('worklog.modal.field.description')}>
  655:                 {({ fieldProps }) => (
  656:                     <LazyMarkdownEditor markdown={markdown} setMarkdown={setMarkdown} />
  657:                 )}
  658:             </Field>
  659: 
  660:             {/* ?깅줉/?섏젙/??젣 ?ㅽ뙣 ?덈궡 (Jira 沅뚰븳 嫄곕? ?ы븿, ?낅젰 紐⑤뱶 臾닿?) */}
  661:             {submitError && (
  662:                 <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6,
  663:                     padding: '6px 10px', background: '#FEF2F2', borderRadius: 4 }}>
  664:                     {submitError}
  665:                 </div>
  666:             )}
  667:         </BaseModal>
  668:     );
  669: };

--- static/ui/src/components/error/ChunkErrorBoundary.jsx:1-160 ---
    1: import React from 'react';
    2: import EmptyState from '@atlaskit/empty-state';
    3: import Button from '@atlaskit/button/new';
    4: import {useI18nStore} from '../../stores/useI18nStore';
    5: 
    6: /**
    7:  * lazy 泥?겕 濡쒕뱶 ?ㅽ뙣瑜?諛쏅뒗 寃쎄퀎.
    8:  *
    9:  * ???꾩슂?쒓?: Suspense ??"?꾩쭅 ????寃???湲곕떎由?肉? ?숈쟻 import 媛 **reject** ?섎㈃ 泥섎━?섏? 紐삵븳??
   10:  * 洹??먮윭????猷⑦듃源뚯? ?꾪뙆???붾㈃???듭㎏濡?鍮덈떎. 媛???뷀븳 寃쎈줈??**諛고룷 吏곹썑** ??
   11:  * ?ъ슜?먭? ?댁뼱???몄뀡? ??asset-manifest 瑜??ㅺ퀬 ?덈뒗??洹?泥?겕媛 ?쒕쾭?먯꽌 ?щ씪吏??곹깭??
   12:  * 洹몃븣 ??씠???쇱슦?몃? ?꾨Ⅴ硫?泥?겕 ?붿껌??404 濡??ㅽ뙣?쒕떎.
   13:  *
   14:  * ???ъ떆?꾨뒗 由щ젋?붽? ?꾨땲??**由щ줈??*?ъ빞 ?쒕떎. webpack ? ?ㅽ뙣??import promise 瑜?罹먯떆?섎?濡?
   15:  *   媛숈? 泥?겕瑜??ㅼ떆 ?붿껌?대킄??媛숈? ?ㅽ뙣瑜?諛섎났?쒕떎. ??manifest 瑜?諛쏆븘???由곕떎.
   16:  *
   17:  * ?대옒??而댄룷?뚰듃???댁쑀: ?먮윭 寃쎄퀎???낆쑝濡?留뚮뱾 ???녿떎(getDerivedStateFromError/componentDidCatch ?꾩슜).
   18:  * 洹몃옒??t() ???낆씠 ?꾨땲??`useI18nStore.getState()` 濡?爰쇰궦??
   19:  */
   20: export default class ChunkErrorBoundary extends React.Component {
   21:     state = {hasError: false};
   22: 
   23:     static getDerivedStateFromError() {
   24:         return {hasError: true};
   25:     }
   26: 
   27:     componentDidCatch(error) {
   28:         // Sentry ??console.error 瑜??섏쭛?섎룄濡??ㅼ젙???덈떎(index.js consoleLoggingIntegration).
   29:         console.error('Failed to load a lazily-imported chunk.', error);
   30:     }
   31: 
   32:     handleRetry = () => {
   33:         window.location.reload();
   34:     };
   35: 
   36:     render() {
   37:         if (!this.state.hasError) return this.props.children;
   38: 
   39:         const t = useI18nStore.getState().t;
   40:         return (
   41:             <EmptyState
   42:                 header={t('common.error.chunkLoad.title')}
   43:                 description={t('common.error.chunkLoad.description')}
   44:                 headingLevel={2}
   45:                 primaryAction={
   46:                     <Button appearance="primary" onClick={this.handleRetry}>
   47:                         {t('common.button.retry')}
   48:                     </Button>
   49:                 }
   50:             />
   51:         );
   52:     }
   53: }

--- static/ui/src/pages/myWork/WorklogPage.jsx:70-170 ---
   70:     const [clickedDate, setClickedDate] = useState(null);
   71: 
   72:     const formatDate = (date) => getDateString(date);
   73: 
   74:     const startDate = formatDate(dateRange.start);
   75:     const endDate = formatDate(dateRange.end);
   76: 
   77:     const normalizedProjectIds = useMemo(
   78:         () => [...(selectedProjectIds ?? [])].sort(),
   79:         [selectedProjectIds]
   80:     );
   81:     // 1. ???뚰겕濡쒓렇 紐⑸줉 議고쉶 (?닿? ?묒꽦???뚰겕濡쒓렇留?
   82:     const {isLoading, myWorklogs,isFetching,coworkerFieldId}
   83:         = useMyWorklogList(
   84:             {
   85:                 context,
   86:                 selectedProjectIds:normalizedProjectIds,
   87:                 startDate,
   88:                 endDate,
   89:                 mine: true
   90:             });
   91: 
   92:     const {
   93:         data: myScheduleList,
   94:         isLoading: isScheduleLoading
   95:     } = useQuery({
   96:         queryKey: scheduleKeys.myList({startDate, endDate}),
   97:         queryFn: async () => {
   98:             const result = await invoke("getMyScheduleList", {
   99:                 startDate,
  100:                 endDate
  101:             });
  102:             if (!result?.success) {
  103:                 throw new Error(result?.error?.message ?? 'getMyScheduleList failed');
  104:             }
  105:             return result;
  106:         },
  107:         enabled: !!context?.accountId,
  108:         staleTime: 1000 * 60 * 5
  109:     });
  110: 
  111:     const summaryRange = useMemo(() => {
  112:         const now = new Date();
  113:         const start = new Date(now.getFullYear(), now.getMonth(), 1);
  114:         const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  115:         return {
  116:             startDate: formatDate(start),
  117:             endDate: formatDate(end)
  118:         };
  119:     }, []);
  120: 
  121:     /*
  122:      * ?붿빟? ??罹섎┛??荑쇰━(1) 寃곌낵?먯꽌 ?뚯깮?쒕떎 ??媛숈? resolver(`getMyCalendarWorklog`)瑜?
  123:      * ?좎쭨 踰붿쐞留??щ━????踰?移섎뜕 寃껋쓣 湲곕낯 吏꾩엯?먯꽌 1?뚮줈 以꾩씤??
  124:      *
  125:      * 湲곕낯 ?곹깭??罹섎┛??媛??踰붿쐞???대쾲 ?ъ쓣 ?듭㎏濡??ы븿?섎뒗 6二?援ш컙?대씪 ?붿빟???꾩슂??
  126:      * ?뚰겕濡쒓렇媛 ?대? ???ㅼ뼱? ?덈떎. 罹섎┛?붾? ?ㅻⅨ ?щ줈 ?섍꺼 ?대쾲 ?ъ쓣 ??? 紐삵븯寃??섎㈃
  127:      * (??寃쎄퀎 ?? 洹몃븣留??붿빟 ?꾩슜 荑쇰━瑜?耳좊떎.
  128:      * ???좎쭨??紐⑤몢 'YYYY-MM-DD' 臾몄옄?댁씠???ъ쟾??鍮꾧탳媛 怨??좎쭨 鍮꾧탳??
  129:      */
  130:     const calendarCoversSummary = !!startDate && !!endDate
  131:         && startDate <= summaryRange.startDate
  132:         && endDate >= summaryRange.endDate;
  133: 
  134:     const {
  135:         myWorklogs: summaryWorklogs
  136:     } = useMyWorklogList({
  137:         context,
  138:         selectedProjectIds: normalizedProjectIds,
  139:         startDate: summaryRange.startDate,
  140:         endDate: summaryRange.endDate,
  141:         mine: true,
  142:         enabled: !calendarCoversSummary
  143:     });
  144: 
  145:     // 罹섎┛??寃곌낵瑜????뚮뒗 ?붿빟 踰붿쐞濡??섎씪 ?ｋ뒗???쒕쾭媛 ?붿빟 ?꾩슜 荑쇰━???섎뜕 寃껉낵 媛숈? ?꾪꽣).
  146:     // author쨌?꾨줈?앺듃 ?좏깮 議곌굔? (1)??mine:true + 媛숈? normalizedProjectIds ???숈씪?섎떎.
  147:     const summarySource = useMemo(
  148:         () => (calendarCoversSummary
  149:             ? clipWorklogsToRange(myWorklogs, summaryRange.startDate, summaryRange.endDate)
  150:             : summaryWorklogs),
  151:         [calendarCoversSummary, myWorklogs, summaryWorklogs, summaryRange]
  152:     );
  153: 
  154:     const summary = useMyWorklogSummary({
  155:         myWorklogs: summarySource
  156:     });
  157: 
  158:     const {data:issueCountData} =useQuery({
  159:         queryKey: myWorkKeys.issueIds(normalizedProjectIds),
  160:         enabled: !!selectedProjectIds?.length,
  161:         queryFn: () =>
  162:             getUserIssueIds({
  163:                 selectedProjectIds: normalizedProjectIds,
  164:                 accountId: context.accountId,
  165:                 coworker: true
  166:             }),
  167:         staleTime: 1000 * 60 * 5,
  168:     });
  169: 
  170:     const {data:settingData} = useQuery(

--- static/ui/src/pages/myWork/WorklogPage.jsx:430-530 ---
  430:                                       * ???⑹뼱由ш? 蹂몃Ц泥섎읆 ?쏀삍?? ?꾩씠肄샕룰??먮? 媛숈? ?ㅼ쑝濡??뺥엳怨?
  431:                                       * ??ぉ ?ъ씠???щ갚?쇰줈留?媛瑜몃떎.
  432:                                       */}
  433:                                     <Box style={{
  434:                                         display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap",
  435:                                         fontSize: 12, color: token("color.text.subtlest", "#8993A4"),
  436:                                     }}>
  437:                                         {[
  438:                                             [CalendarPlusIcon, 'worklog.guide.date'],
  439:                                             [TasksIcon, 'worklog.guide.issue'],
  440:                                             [DiagramSymbolActionIcon, 'worklog.guide.item'],
  441:                                         ].map(([Icon, key]) => (
  442:                                             <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
  443:                                                 <Icon label="" size="small" color="currentColor" />
  444:                                                 {t(`${key}.title`)} 쨌 {t(`${key}.description`)}
  445:                                             </span>
  446:                                         ))}
  447:                                     </Box>
  448: 
  449:                                     {/*
  450:                                       * ?깅줉 吏꾩엯????媛?
  451:                                       * 罹섎┛???좎쭨瑜??대┃?대룄 ?뚰겕濡쒓렇瑜??????덉?留?洹멸굔 **?뚯븘??蹂댁씠??湲?*?대씪,
  452:                                       * ???붾㈃??二??됰룞(?뚰겕濡쒓렇 ?깅줉)? 踰꾪듉?쇰줈???몃떎.
  453:                                       * ?좎쭨 ?놁씠 ?꾨Ⅴ硫?紐⑤떖???ㅻ뒛濡??곕떎(`onDateClick` 怨?媛숈? ?곹깭 珥덇린??.
  454:                                       */}
  455:                                     {/* ?깃꺽???ㅻⅨ ???깅줉(?묒뾽 湲곕줉 / 媛쒖씤 ?쇱젙)?대씪 遺숈뿬 ?먯? ?딅뒗??
  456:                                         ??gap ? space ?좏겙留?諛쏅뒗????'gap.200' 媛숈? 媛믪? 議곗슜??臾댁떆??媛꾧꺽??0 ???쒕떎. */}
  457:                                     <Flex gap="space.100">
  458:                                         <Button
  459:                                             iconBefore={AddIcon}
  460:                                             appearance="primary"
  461:                                             onClick={() => {
  462:                                                 setClickedDate(getDateString(new Date()));
  463:                                                 setWorklogInfo(null);
  464:                                                 setIsWorklogOpen(true);
  465:                                             }}
  466:                                         >
  467:                                             {t('worklog.button.addWorklog')}
  468:                                         </Button>
  469: 
  470:                                         <Button
  471:                                             iconBefore={AddIcon}
  472:                                             onClick={() => {
  473:                                                 setClickedDate(null);
  474:                                                 setScheduleInfo(null);
  475:                                                 setIsScheduleOpen(true);
  476:                                             }}
  477:                                         >
  478:                                             {t('worklog.button.addSchedule')}
  479:                                         </Button>
  480:                                     </Flex>
  481: 
  482:                                 </Box>
  483:                             )}
  484: 
  485:                             <LoadingOverlay isLoading={isLoading || isFetching || isScheduleLoading}>
  486:                                 <Box
  487:                                     style={{
  488:                                         flex: "1 1 auto",
  489:                                         minHeight: 0,
  490:                                         height: '100%',
  491:                                         overflow: viewMode === "calendar" ? 'hidden' : 'auto'
  492:                                     }}
  493:                                 >
  494:                                     {viewMode === "calendar" ? (
  495:                                         <LazyFullCalendar
  496:                                             context={context}
  497:                                             event={mergedEvents}
  498:                                             onEventClick={onEventClick}
  499:                                             onDatesSetChange={onDatesSetChange}
  500:                                             calendarRef={calendarRef}
  501:                                             onEventDrop={onEventDrop}
  502:                                             onDateClick={onDateClick}
  503:                                             holidayDates={holidayDates}
  504:                                             settingData={settingData}
  505:                                         />
  506:                                     ) : (
  507:                                         <MyIssueTable
  508:                                             context={context}
  509:                                             selectedProjectIds={normalizedProjectIds}
  510:                                             onWorklogClick={(worklog) => {
  511:                                                 setWorklogInfo(worklog);
  512:                                                 setIsWorklogOpen(true);
  513:                                             }}
  514:                                             settingData={settingData}
  515:                                         />
  516:                                     )}
  517:                                 </Box>
  518:                             </LoadingOverlay>
  519:                         </Card>
  520:                     </Panel>
  521:                 </ResizablePanels>
  522:             </Stack>
  523: 
  524:             {/* Worklog Modal */}
  525:             <WorklogModal
  526:                 selectedProjectIds={normalizedProjectIds}
  527:                 isOpen={isWorklogOpen}
  528:                 closeModal={closeWorklogModal}
  529:                 worklogInfo={worklogInfo}
  530:                 submitModal={submitWorklogModal}

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/myWork/WorklogPage.jsx' 1 80; Show-Range 'static/ui/src/pages/myWork/WorklogPage.jsx' 250 430; Show-Range 'static/ui/src/components/modal/CommonModal.jsx' 1 160; rg -n \"<WorklogModal|closeWorklogModal|submitWorklogModal|isWorklogOpen|setIsWorklogOpen\" static/ui/src/pages/myWork/WorklogPage.jsx static/ui/src -g '*.jsx' -g '*.js'" in C:\CloudJira\moves-workforce
 succeeded in 11466ms:

--- static/ui/src/pages/myWork/WorklogPage.jsx:1-80 ---
    1: import React, {useEffect, useMemo, useRef, useState} from 'react';
    2: // ??罹섎┛?붾뒗 **lazy** ??`@fullcalendar/*` + moment 瑜?main 諛뽰쑝濡??대낫?대뒗 寃쎄퀎).
    3: //   ???섏씠吏??湲곕낯 吏꾩엯 ?쇱슦?몃씪 ?뺤쟻 import ?몃뜲, 洹??뺤쟻 寃쎈줈媛 罹섎┛???ㅽ깮源뚯?
    4: //   main ??怨좎젙?쒗궎怨??덉뿀?? ?뺤쟻 import 濡??섎룎由щ㈃ 洹??뚭?媛 洹몃?濡??щ컻?쒕떎.
    5: import {LazyFullCalendar} from "../../components/calendar/FullCalendarLazy";
    6: import {WorklogModal} from "./modal/WorklogModal";
    7: import {STATUS_COLOR_MAP} from "../../constants/statusColorMap";
    8: import {invoke, Modal, view} from "@forge/bridge";
    9: import {Flex, Stack} from "@atlaskit/primitives/compiled";
   10: import {executeRequest} from "../../utils/jiraApi/requestJira";
   11: import {useI18nStore} from "../../stores/useI18nStore";
   12: import {token} from "@atlaskit/tokens";
   13: import PageContainer from "../../components/layout/PageContainer";
   14: import {
   15:     addDaysToDateString,
   16:     formatToHHmm,
   17:     getDateString,
   18:     getTimeISOString
   19: } from "../../utils/TimeUtils";
   20: import {MyLogSummary} from "./MyLogSummary";
   21: import {Box} from "@atlaskit/primitives";
   22: import MyProjectList from "./myProject/MyProjectList";
   23: import Card from "../../components/card/Card";
   24: import ResizablePanels, {Panel, PanelToggleButton} from "../../components/layout/ResizablePanels";
   25: import CalendarPlusIcon from "@atlaskit/icon/core/calendar-plus";
   26: import TasksIcon from "@atlaskit/icon/core/tasks";
   27: import DiagramSymbolActionIcon from "@atlaskit/icon-lab/core/diagram-symbol-action";
   28: import CalendarIcon from "@atlaskit/icon/core/calendar";
   29: import TableIcon from "@atlaskit/icon/core/table";
   30: import {ViewModeToggle} from "../../components/toggle/ViewModeToggle";
   31: import { useQuery, useQueryClient} from "@tanstack/react-query";
   32: import {useMyWorklogList} from "./utils/useMyWorklogList";
   33: import LoadingOverlay from "../../components/feedback/LoadingOverlay";
   34: import MyIssueTable from "./table/MyIssueTable";
   35: import {clipWorklogsToRange, useMyWorklogSummary} from "./utils/useMyWorklogSummary";
   36: import { getUserIssueIds} from "../../utils/jiraApi/issue/getJqlIssue";
   37: import {ScheduleModal} from "./modal/ScheduleModal";
   38: import {scheduleTypeOptions} from "../../constants/scheduleTypeOptions";
   39: import Button from "@atlaskit/button/new";
   40: import AddIcon from "@atlaskit/icon/core/add";
   41: import {usePublicHolidayList} from "../../utils/usePublicHolidayList";
   42: import {scheduleKeys, settingKeys} from '../../utils/queryKey/logicalAuditKeys';
   43: import {myWorkKeys} from '../../utils/queryKey/myWorkKeys';
   44: const context = await view.getContext()
   45: 
   46: export default function WorklogPage() {
   47:     const t = useI18nStore(s => s.t);
   48: 
   49:     const calendarRef = useRef(null);
   50: 
   51:     const queryClient = useQueryClient();
   52: 
   53:     const [viewMode, setViewMode] = useState("calendar");
   54:     const [selectedProjectIds, setSelectedProjectIds] = useState([]);
   55:     const [projectCount, setProjectCount] = useState(0);
   56: 
   57:     const [dateRange, setDateRange] = useState({
   58:         start: new Date(),
   59:         end: new Date()
   60:     });
   61: 
   62:     // ?뚰겕濡쒓렇 紐⑤떖
   63:     const [isWorklogOpen, setIsWorklogOpen] = useState(false);
   64:     const [worklogInfo, setWorklogInfo] = useState(null);
   65: 
   66:     // ?쇱젙 紐⑤떖
   67:     const [isScheduleOpen, setIsScheduleOpen] = useState(false);
   68:     const [scheduleInfo, setScheduleInfo] = useState(null);
   69: 
   70:     const [clickedDate, setClickedDate] = useState(null);
   71: 
   72:     const formatDate = (date) => getDateString(date);
   73: 
   74:     const startDate = formatDate(dateRange.start);
   75:     const endDate = formatDate(dateRange.end);
   76: 
   77:     const normalizedProjectIds = useMemo(
   78:         () => [...(selectedProjectIds ?? [])].sort(),
   79:         [selectedProjectIds]
   80:     );

--- static/ui/src/pages/myWork/WorklogPage.jsx:250-430 ---
  250:             ...scheduleEvents,
  251:             ...holidayEvents
  252:         ];
  253: 
  254:     }, [worklogEvents, scheduleEvents, holidayEvents]);
  255: 
  256: 
  257:     const onEventClick = async (eventInfo) => {
  258: 
  259:         const {type} = eventInfo.event.extendedProps;
  260: 
  261:         // ?뚰겕濡쒓렇
  262:         if (type === "worklog") {
  263:             setWorklogInfo({
  264:                 ...eventInfo.event.extendedProps
  265:             });
  266:             setIsWorklogOpen(true);
  267: 
  268:             return;
  269:         }
  270: 
  271:         // ?쇱젙
  272:         if (type === "schedule") {
  273:             const {schedule} = eventInfo.event.extendedProps;
  274:             setScheduleInfo(schedule);
  275:             setIsScheduleOpen(true);
  276: 
  277:             return;
  278:         }
  279:     };
  280: 
  281:     const onDateClick = (dateInfo) => {
  282:         setClickedDate(dateInfo.dateStr);
  283:         setWorklogInfo(null);
  284:         setIsWorklogOpen(true);
  285:     };
  286: 
  287:     //?좎쭨 踰붿쐞 蹂寃?
  288:     const onDatesSetChange = (data) => {
  289: 
  290:         setDateRange({
  291:             start: data.start,
  292:             end: data.end
  293:         });
  294:     };
  295:     //Worklog Drag
  296:     const onEventDrop = async (eventInfo) => {
  297:         const {event} = eventInfo;
  298:         const {type} = event.extendedProps;
  299:         // ?쇱젙? ?쒕옒洹??덊븿
  300:         if (type !== "worklog") {
  301:             eventInfo.revert();
  302:             return;
  303:         }
  304:         const pathParams = {
  305:             issueIdOrKey: event.extendedProps.issue.key,
  306:             id: event.extendedProps.worklog.id
  307:         }
  308:         const started = getTimeISOString(getDateString(event.start),
  309:             formatToHHmm(new Date(event.extendedProps.worklog.started)), context.timezone)
  310:         const params = {
  311:             started: started,
  312:         }
  313:         const result = await executeRequest('updateWorklog', params, pathParams);
  314:         // executeRequest ???ㅽ뙣 ??{success:false} 諛섑솚 ???ㅽ뙣硫??쒕옒洹몃? ?먯쐞移섎줈 ?섎룎由곕떎(沅뚰븳 嫄곕? ?ы븿)
  315:         if (result?.success === false) {
  316:             eventInfo.revert();
  317:             return;
  318:         }
  319:         // 耳덈┛?붾쭔 ?몃꺼由щ뱶
  320:         await queryClient.invalidateQueries({
  321:             queryKey: myWorkKeys.calendarWorklogs(normalizedProjectIds, startDate, endDate)
  322:         });
  323:         event.setExtendedProp('worklog', result)
  324:     };
  325:     /*
  326:     * 紐⑤떖
  327:     * */
  328:     const closeWorklogModal = () => {
  329:         setIsWorklogOpen(false);
  330:         setWorklogInfo(null);
  331:     };
  332: 
  333:     const closeScheduleModal = () => {
  334:         setIsScheduleOpen(false);
  335:         setScheduleInfo(null);
  336:     };
  337: 
  338:     const submitWorklogModal = async () => {
  339:         closeWorklogModal();
  340:         await queryClient.invalidateQueries({queryKey: myWorkKeys.calendarWorklogsAll});
  341:         await queryClient.invalidateQueries({queryKey: myWorkKeys.projectWorklogsAll});
  342:     };
  343: 
  344:     const submitScheduleModal = async () => {
  345:         await queryClient.invalidateQueries({queryKey: scheduleKeys.all});
  346:         closeScheduleModal();
  347:     };
  348: 
  349:     return (
  350:         <PageContainer>
  351:             <Stack space="space.200">
  352:                 <MyLogSummary
  353:                     projectCount={projectCount}
  354:                     summary={summary}
  355:                     issueCount={issueCountData}
  356:                     settingData={settingData}
  357:                     holidayList={holidayList}
  358:                 />
  359: 
  360:                 {/*
  361:                   * 蹂몃Ц ?믪씠 ??`85vh` 怨좎젙?대뜕 寃껋쓣 **?꾩뿉????留뚰겮 類 媛?*?쇰줈 諛붽씔??
  362:                   *
  363:                   * 85vh ??酉고룷?몄쓽 85% 瑜???긽 ?붽뎄?섎뒗?? 洹??꾩뿉 ?대?
  364:                   *   app-main ?⑤뵫 48 + KPI ???~63 + Stack 媛꾧꺽 16 ??127px
  365:                   * ???뱁? ?덉뼱 ?⑹씠 100vh 瑜??섏뿀?????섏씠吏 ?ㅽ겕濡ㅼ씠 ?앷린怨?
  366:                   * 洹??덉뿉??罹섎┛?붽? ???ㅽ겕濡ㅻ뤌 ?댁쨷 ?ㅽ겕濡ㅼ씠 ?먮떎.
  367:                   *
  368:                   * ???곸닔 127 ? ????媛믪쓽 ?⑹씠?? ?곷떒 援ъ꽦??諛붾뚮㈃ 媛숈씠 ?먮킄???쒕떎.
  369:                   *   理쒖냼 ?믪씠瑜??ъ꽌 ?묒? ?붾㈃?먯꽌 罹섎┛?붽? 萸됯컻吏吏 ?딄쾶 ?쒕떎.
  370:                   */}
  371:                 {/*
  372:                   * 醫뚯슦 遺꾪븷? 怨듭슜 <ResizablePanels> ?뚯쑀(?묎린쨌?쒕옒洹??덈퉬 議곗젅쨌localStorage).
  373:                   * ??醫낆쟾 <Inline> + xcss({flex:'2'/'8'}) ??**raw flex 媛믪씠 議곗슜??臾댁떆**??
  374:                   *   ?ㅼ젣濡쒕뒗 2:8 ???꾨땲??hug + ?묐걹 ?뺣젹?댁뿀?? ?댁젣 肄붾뱶媛 ?섎룄??20:80 ???곸슜?쒕떎.
  375:                   */}
  376:                 <ResizablePanels
  377:                     storageKey="myWork.panels.layout"
  378:                     height="calc(100vh - 127px)"
  379:                     minHeight={520}
  380:                 >
  381:                     {/* ?꾨줈?앺듃 */}
  382:                     <Panel
  383:                         id="projects"
  384:                         title={t('worklog.layout.project')}
  385:                         defaultWeight={20}
  386:                         minWidth={260}
  387:                     >
  388:                         <Card
  389:                             title={t('worklog.layout.project')}
  390:                             headerRight={<PanelToggleButton panelId="projects" />}
  391:                         >
  392:                             <MyProjectList
  393:                                 context={context}
  394:                                 selectedProjectIds={selectedProjectIds}
  395:                                 onSelectProjects={setSelectedProjectIds}
  396:                                 onTotalCountChange={setProjectCount}
  397:                             />
  398:                         </Card>
  399:                     </Panel>
  400: 
  401:                     {/* 硫붿씤 */}
  402:                     <Panel
  403:                         id="main"
  404:                         title={t('worklog.layout.task')}
  405:                         defaultWeight={80}
  406:                         minWidth={880}
  407:                     >
  408:                         <Card title={t('worklog.layout.task')} headerRight={
  409:                                 <>
  410:                                     <ViewModeToggle
  411:                                         viewMode={viewMode}
  412:                                         onChange={(mode) => {
  413:                                             setViewMode(mode);
  414:                                         }}
  415:                                         items={[
  416:                                             {mode: "calendar", icon: <CalendarIcon label="" />, label: t('worklog.button.calender')},
  417:                                             {mode: "table", icon: <TableIcon label="" />, label: t('worklog.button.table')},
  418:                                         ]}
  419:                                     />
  420:                                     <PanelToggleButton panelId="main" />
  421:                                 </>
  422:                             }
  423:                         >
  424:                             {viewMode === "calendar" && (
  425:                                 <Box style={{flexShrink: 0, marginBottom: 8, display: "flex",
  426:                                     justifyContent: "space-between", alignItems: "center",gap: 12, flexWrap: "wrap"}}>
  427:                                     {/*
  428:                                       * 議곗옉 ?덈궡 ??留ㅼ씪 ?곕뒗 ?붾㈃?대씪 **?쏀엳??二쇱옣?섏? ?딄쾶** ?ㅼ쓣 ??텣??
  429:                                       * ?덉쟾???쒕ぉ??援듦쾶 ?섍퀬 肄쒕줎?쇰줈 ?댁뼱 遺숈뿬(`**?좎쭨 ?대┃**: ?뚰겕濡쒓렇 異붽?)
  430:                                       * ???⑹뼱由ш? 蹂몃Ц泥섎읆 ?쏀삍?? ?꾩씠肄샕룰??먮? 媛숈? ?ㅼ쑝濡??뺥엳怨?

--- static/ui/src/components/modal/CommonModal.jsx:1-160 ---
    1: import React from 'react';
    2: import Form from '@atlaskit/form';
    3: 
    4: import Modal, {
    5:     ModalBody,
    6:     ModalFooter,
    7:     ModalHeader,
    8:     ModalTitle,
    9:     ModalTransition,
   10: } from '@atlaskit/modal-dialog';
   11: 
   12: export default function BaseModal({
   13:                                       isOpen,
   14:                                       onClose,
   15:                                       title,
   16:                                       onSubmit,
   17:                                       submitText = 'Create',
   18:                                       children,
   19:                                       footer,
   20:                                       width='medium',
   21:                                       height
   22: 
   23:                                   }) {
   24:     return (
   25:         <ModalTransition>
   26:             {isOpen && (
   27:                 <Modal onClose={onClose} width ={width}  height={height} shouldScrollInViewport={true}>
   28:                     <ModalHeader hasCloseButton>
   29:                         <ModalTitle>{title}</ModalTitle>
   30:                     </ModalHeader>
   31:                     <Form
   32:                         onSubmit={onSubmit}>
   33:                         {({ formProps, submitting }) => (
   34:                             <form {...formProps}
   35:                                 onSubmit={(e)=>{
   36:                                 e.preventDefault();
   37:                                 e.stopPropagation();
   38:                                 formProps.onSubmit(e);
   39:                                 }}
   40:                                   onKeyDown={(e) => {
   41:                                       if (e.key === 'Enter') {
   42:                                           e.preventDefault();
   43:                                       }
   44:                                   }}
   45:                             >
   46:                                 {/*header*/}
   47:                                 {/*body*/}
   48:                                 <ModalBody>
   49:                                     {children}
   50:                                 </ModalBody>
   51:                                 {/*footer*/}
   52:                                 <ModalFooter>
   53:                                     {typeof footer === 'function'
   54:                                         ? footer({ submitting, submitText })
   55:                                         : footer}
   56:                                 </ModalFooter>
   57:                             </form>
   58:                         )}
   59:                     </Form>
   60:                 </Modal>
   61:             )}
   62:         </ModalTransition>
   63:     );
   64: }
static/ui/src/pages/myWork/WorklogPage.jsx:63:    const [isWorklogOpen, setIsWorklogOpen] = useState(false);
static/ui/src/pages/myWork/WorklogPage.jsx:266:            setIsWorklogOpen(true);
static/ui/src/pages/myWork/WorklogPage.jsx:284:        setIsWorklogOpen(true);
static/ui/src/pages/myWork/WorklogPage.jsx:328:    const closeWorklogModal = () => {
static/ui/src/pages/myWork/WorklogPage.jsx:329:        setIsWorklogOpen(false);
static/ui/src/pages/myWork/WorklogPage.jsx:338:    const submitWorklogModal = async () => {
static/ui/src/pages/myWork/WorklogPage.jsx:339:        closeWorklogModal();
static/ui/src/pages/myWork/WorklogPage.jsx:464:                                                setIsWorklogOpen(true);
static/ui/src/pages/myWork/WorklogPage.jsx:512:                                                setIsWorklogOpen(true);
static/ui/src/pages/myWork/WorklogPage.jsx:525:            <WorklogModal
static/ui/src/pages/myWork/WorklogPage.jsx:527:                isOpen={isWorklogOpen}
static/ui/src/pages/myWork/WorklogPage.jsx:528:                closeModal={closeWorklogModal}
static/ui/src/pages/myWork/WorklogPage.jsx:530:                submitModal={submitWorklogModal}
static/ui/src\pages\myWork\WorklogPage.jsx:63:    const [isWorklogOpen, setIsWorklogOpen] = useState(false);
static/ui/src\pages\myWork\WorklogPage.jsx:266:            setIsWorklogOpen(true);
static/ui/src\pages\myWork\WorklogPage.jsx:284:        setIsWorklogOpen(true);
static/ui/src\pages\myWork\WorklogPage.jsx:328:    const closeWorklogModal = () => {
static/ui/src\pages\myWork\WorklogPage.jsx:329:        setIsWorklogOpen(false);
static/ui/src\pages\myWork\WorklogPage.jsx:338:    const submitWorklogModal = async () => {
static/ui/src\pages\myWork\WorklogPage.jsx:339:        closeWorklogModal();
static/ui/src\pages\myWork\WorklogPage.jsx:464:                                                setIsWorklogOpen(true);
static/ui/src\pages\myWork\WorklogPage.jsx:512:                                                setIsWorklogOpen(true);
static/ui/src\pages\myWork\WorklogPage.jsx:525:            <WorklogModal
static/ui/src\pages\myWork\WorklogPage.jsx:527:                isOpen={isWorklogOpen}
static/ui/src\pages\myWork\WorklogPage.jsx:528:                closeModal={closeWorklogModal}
static/ui/src\pages\myWork\WorklogPage.jsx:530:                submitModal={submitWorklogModal}
static/ui/src\pages\projectDetail\calender\ProjectCalender.jsx:342:            <WorklogModal

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/projectDetail/gantt/useGanttMutations.js' 1 180; Show-Range 'static/ui/src/pages/projectDetail/gantt/useGanttMutations.js' 350 640; rg -n -C 3 \"function patchTask|const patchTask|useUpdateAssignee|useUpdateCoworkers|useUpdatePlannedMd\" static/ui/src/pages/projectDetail/gantt; rg -n -C 3 \"assignIssue|updateProjectIdField\" src static/ui/src/pages -g '*.js' -g '*.jsx' | Select-Object -First 300" in C:\CloudJira\moves-workforce
 succeeded in 2142ms:

--- static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:1-180 ---
    1: import { useMutation, useQueryClient } from '@tanstack/react-query';
    2: import { invoke } from '@forge/bridge';
    3: import { executeRequest } from '../../../utils/jiraApi/requestJira';
    4: import { useI18nStore } from '../../../stores/useI18nStore';
    5: import { ganttKeys } from '../../../utils/queryKey/projectKeys';
    6: import {jiraKeys} from '../../../utils/queryKey/jiraKeys';
    7: import {
    8:     fetchJiraProjectPermissions,
    9:     isTimeTrackingUnsupportedError,
   10:     buildTimetrackingPayload,
   11:     projectKeyOfIssue,
   12: } from '../../../utils/jiraApi/useJiraEditGuards';
   13: 
   14: /** Jira 沅뚰븳 ?뺤젙 嫄곕?(false) ???섏????먮윭 ??onError ?먯꽌 code 濡?硫붿떆吏 留ㅽ븨. null(誘명솗??? ?섏?吏 ?딅뒗?? */
   15: function jiraPermissionError() {
   16:     const err = new Error('jira permission denied');
   17:     err.cause = { code: 'JIRA_PERMISSION_DENIED' };
   18:     return err;
   19: }
   20: 
   21: /** 罹먯떆(getProjectGanttData ?묐떟)???뱀젙 task 瑜?patch ?섎뒗 ?숆????낅뜲?댄듃 ?ы띁.
   22:  *  old.content.tasks[] 以?key/id 留ㅼ묶 ??ぉ??patch 瑜?蹂묓빀????罹먯떆瑜?留뚮뱺?? */
   23: function patchTask(old, issueKey, patch) {
   24:     const tasks = old?.content?.tasks;
   25:     if (!Array.isArray(tasks)) return old;
   26:     return {
   27:         ...old,
   28:         content: {
   29:             ...old.content,
   30:             tasks: tasks.map((tk) =>
   31:                 tk.key === issueKey || tk.id === issueKey ? { ...tk, ...patch } : tk
   32:             ),
   33:         },
   34:     };
   35: }
   36: 
   37: /** 怨꾪쉷 ?묒뾽??MD) ??Jira originalEstimate ?쒓컙(0.1h 諛섏삱由?. write 媛믨낵 ?숆? 罹먯떆媛믪쓽 ?⑥씪 異쒖쿂. */
   38: function plannedHours(md, rate) {
   39:     return md > 0 ? Math.round(md * rate * 10) / 10 : 0;
   40: }
   41: 
   42: /**
   43:  * useUpdateSchedule ??留됰? ?쒕옒洹?由ъ궗?댁쫰 ?쇱젙 write-back (M2).
   44:  *
   45:  * 怨꾩빟(짠2): invoke('updateGanttSchedule', { projectId, issueKey, start, due })
   46:  *           ??result.content = { issueKey, start, due }
   47:  *
   48:  * ?꾨왂: ?숆????낅뜲?댄듃 + ?ㅽ뙣 濡ㅻ갚.
   49:  *  - onMutate: 罹먯떆???대떦 task start/end 瑜?利됱떆 諛섏쁺 ??留됰?媛 ?쒖옄由??좎?(?꾩껜 ?ъ“??jank ?놁쓬).
   50:  *  - onSuccess: ?깃났 ?좎뒪???쒖떆(?ъ슜??寃곗젙 2026-07-02 ???몄쭛 諛섏쁺 ?몄?. ?댁쟾 'R3 臾댄넗?ㅽ듃' ?뺤콉 ?먭린).
   51:  *  - onError: 罹먯떆瑜??댁쟾 ?ㅻ깄?룹쑝濡?濡ㅻ갚 ??留됰?媛 ?먮옒 ?쇱젙?쇰줈 ?섎룎?꾧컧 + ?먮윭 ?좎뒪??
   52:  *
   53:  * M3(useSetParent/useSetLink)??愿怨??몄쭛(WBS 遺紐?+ ?좏썑??留곹겕) write-back ???꾨옒??異붽?.
   54:  */
   55: export function useUpdateSchedule({ projectId, toast }) {
   56:     const t = useI18nStore((s) => s.t);
   57:     const queryClient = useQueryClient();
   58: 
   59:     return useMutation({
   60:         mutationFn: async ({ issueKey, start, due }) => {
   61:             // ?쇱젙 write ??asUser(?쒖옉??Edit Issues, 湲고븳=Schedule Issues) ???뺤젙 嫄곕?留?李⑤떒
   62:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
   63:             if (perms.canEditIssues === false || perms.canScheduleIssues === false) {
   64:                 throw jiraPermissionError();
   65:             }
   66:             const result = await invoke('updateGanttSchedule', {
   67:                 projectId,
   68:                 issueKey,
   69:                 start,
   70:                 due,
   71:             });
   72:             // responseWrapper: { success, content|error }
   73:             if (!result || result.success !== true) {
   74:                 const err = new Error('updateGanttSchedule failed');
   75:                 err.cause = result?.error;
   76:                 throw err;
   77:             }
   78:             return result.content ?? result;
   79:         },
   80: 
   81:         // ?숆???諛섏쁺: 罹먯떆(getProjectGanttData ?묐떟)???대떦 task ?쇱젙??利됱떆 媛깆떊.
   82:         onMutate: async ({ issueKey, start, due }) => {
   83:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
   84:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
   85:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
   86:                 const tasks = old?.content?.tasks;
   87:                 if (!Array.isArray(tasks)) return old;
   88:                 return {
   89:                     ...old,
   90:                     content: {
   91:                         ...old.content,
   92:                         tasks: tasks.map((tk) =>
   93:                             tk.key === issueKey || tk.id === issueKey
   94:                                 ? { ...tk, start: start ?? null, end: due ?? null }
   95:                                 : tk
   96:                         ),
   97:                     },
   98:                 };
   99:             });
  100:             return { prev };
  101:         },
  102: 
  103:         // ?깃났 ?뚮┝ ?꾩엯(?ъ슜??寃곗젙 2026-07-02): ?몄쭛 諛섏쁺 ?щ?瑜??몄??섎룄濡?吏㏃? ?깃났 ?좎뒪??
  104:         //   (ToastFlags 2.5珥??먮룞?쒓굅 + 理쒕? 3媛????몄씠利?遺???곸쓬.)
  105:         onSuccess: () => {
  106:             // ?쒕옒洹??곕컻 吏묎퀎 ???schedule) ??諛곗쿂媛 2.5珥?紐⑥븘 1嫄댁쑝濡?flush.
  107:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.scheduleSaved'), {
  108:                 batch: 'schedule',
  109:             });
  110:         },
  111: 
  112:         onError: (err, _vars, ctx) => {
  113:             // 濡ㅻ갚 ??留됰?媛 ?먮옒 ?쇱젙?쇰줈 蹂듦?.
  114:             if (ctx?.prev !== undefined) {
  115:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  116:             }
  117:             const code = err?.cause?.code;
  118:             const message =
  119:                 code === 'GANTT_INVALID_DATE_RANGE'
  120:                     ? t('gantt.error.dateRange')
  121:                     : code === 'JIRA_PERMISSION_DENIED'
  122:                         ? t('projectDetail.issue.jiraPermission.schedule')
  123:                         : t('gantt.error.saveFailed');
  124:             toast?.showError?.(t('common.toast.title.Fail'), message);
  125:         },
  126:     });
  127: }
  128: 
  129: /**
  130:  * 愿怨??몄쭛(M3) ?먮윭肄붾뱶 ??i18n ?좎뒪??硫붿떆吏 留ㅽ븨.
  131:  * 諛깆뿏??`result.error.code`(02_backend_report.md 짠6) ??gantt.json ??C-3 ??.
  132:  * 誘몄〈?????놁쓬(?꾨? M1?먯꽌 ?앹꽦?? ??merge 遺덊븘??
  133:  */
  134: function mapRelationError(t, code) {
  135:     switch (code) {
  136:         case 'GANTT_CYCLE_DETECTED':
  137:             return t('gantt.error.cycle');
  138:         case 'GANTT_SELF_REFERENCE':
  139:             return t('gantt.error.selfRef');
  140:         case 'GANTT_CROSS_PROJECT_REF':
  141:             return t('gantt.error.crossProject');
  142:         case 'JIRA_PERMISSION_DENIED':
  143:             return t('projectDetail.issue.jiraPermission.link');
  144:         default:
  145:             return t('gantt.error.saveFailed');
  146:     }
  147: }
  148: 
  149: /**
  150:  * useSetParent ??WBS 遺紐??ъ????댁젣 write-back (M3).
  151:  *
  152:  * 怨꾩빟(짠A): invoke('setGanttParent', { projectId, issueKey, parentKey })
  153:  *           ??result.content = { issueKey, parentKey, effectiveParent }
  154:  *           parentKey=null ??WBS override ?댁젣(effectiveParent??jiraParent濡??대갚?????덉쓬, 짠D-4).
  155:  *
  156:  * ?꾨왂(짠D-3 媛쒖젙, 2026-07-02 ?ъ슜??寃곗젙: ?쒕옒洹?諛섏쓳??: **?숆? + ?대씪 ?ъ씠??媛??+ ?쒕쾭 沅뚯쐞 ?뺤젙**.
  157:  *  - onMutate: 罹먯떆 task ??wbsParent/effectiveParent 瑜?利됱떆 諛섏쁺(?쒕옒洹맞룸え??諛섏쓳??. cancelQueries + prev ?ㅻ깄??
  158:  *    ?좑툘 ?대씪 ?ъ쟾 媛?? parentKey 媛 (a) ?먭린 ?먯떊?닿굅??(b) 罹먯떆 湲곗? ?먯떊???먯넀?대㈃ onMutate ?⑥튂瑜?**?ㅽ궢**?쒕떎
  159:  *       (臾댄슚 ?몃━ ?쒓컙 ?몄텧 諛⑹? ???먮옒 ?숆????쇳뻽???댁쑀). ?쒕쾭媛 理쒖쥌 嫄곕??섎㈃ 濡ㅻ갚(?ㅻ깄??洹몃?濡쒕씪 臾댄빐).
  160:  *  - onError: prev ?ㅻ깄??濡ㅻ갚 + ?먮윭 ?좎뒪??
  161:  *  - ?좑툘 onSettled 利됱떆 invalidate ???ъ쟾???곗? ?딅뒗?? 怨쇨굅 ?깊븘??write ?쒖젅??search ?몃뜳??吏?곗쑝濡?
  162:  *    吏곹썑 ?ъ“?뚭? ??媛믪쓣 諛뺤젣?섎뒗 踰꾧렇媛 ?덉뿀怨?"?곸쐞 吏?뺥빐???섏쐞濡????ㅼ뼱媛?), ?꾨줈?쇳떚(movesRms.wbsParent)
  163:  *    ?꾪솚 ?꾩뿉???쒕쾭 ?뺤젙 ?묐떟 湲곕컲 罹먯떆 ?⑥튂媛 ?ъ“?뚮낫??鍮좊Ⅴ怨??덉쟾?섎떎(遺덊븘???꾩껜 ?ъ“???뚰뵾).
  164:  *  - onSuccess: ?쒕쾭媛 寃利????뺤젙??{ issueKey, parentKey, effectiveParent } 瑜?罹먯떆 task ??吏곸젒 ?⑥튂.
  165:  *    ?숆?媛믨낵 諛⑺뼢??媛숈븘 ?쒓컖 蹂???놁쓬. ?대뙌??toSvarTasks)媛 effectiveParent 湲곗??쇰줈 summary ?밴꺽/?몃━ 以묒꺽??
  166:  *    ?ы뙋?뺥븯誘濡??몃━媛 利됱떆 媛깆떊?쒕떎. ?꾩껜 ?щ룞湲고솕???ㅼ쓬 ?먯뿰 ?ъ“?????ъ쭊???덈줈怨좎묠) ???몃뜳???곕씪?≪? ?ㅻ씪 ?덉쟾.
  167:  *  - onSuccess: ?깃났 ?좎뒪???쒖떆(2026-07-02, parentKey null ?щ?濡?蹂寃??댁젣 遺꾧린). ?ㅽ뙣 ?좎뒪?몃룄 ?좎?.
  168:  */
  169: export function useSetParent({ projectId, toast }) {
  170:     const t = useI18nStore((s) => s.t);
  171:     const queryClient = useQueryClient();
  172: 
  173:     return useMutation({
  174:         mutationFn: async ({ issueKey, parentKey }) => {
  175:             const result = await invoke('setGanttParent', {
  176:                 projectId,
  177:                 issueKey,
  178:                 parentKey,
  179:             });
  180:             // responseWrapper: { success, content|error }

--- static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:350-640 ---
  350: 
  351:         // ?쒕쾭 ?뺤젙 ?묐떟?쇰줈 ?대떦 target ??incoming 留곹겕留??ъ“???숆?媛믨낵 諛⑺뼢 ?숈씪 ??臾대???.
  352:         onSuccess: (data, variables) => {
  353:             if (data?.target) {
  354:                 queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  355:                     const links = old?.content?.links;
  356:                     if (!Array.isArray(links)) return old;
  357:                     const preds = Array.isArray(data.predecessors) ? data.predecessors : [];
  358:                     const others = links.filter((l) => l.target !== data.target);
  359:                     return { ...old, content: { ...old.content, links: [...others, ...preds] } };
  360:                 });
  361:             }
  362:             // ?깃났 ?뚮┝(2026-07-02): op 濡?異붽?/??젣 遺꾧린.
  363:             const msg =
  364:                 variables?.op === 'remove'
  365:                     ? t('gantt.toast.linkRemoved')
  366:                     : t('gantt.toast.linkAdded');
  367:             // 留곹겕 ?쒕옒洹??곕컻 吏묎퀎 ???link).
  368:             toast?.showSuccess?.(t('common.toast.title.success'), msg, { batch: 'link' });
  369:         },
  370: 
  371:         onError: (err, _vars, ctx) => {
  372:             // 濡ㅻ갚 ???숆??곸쑝濡?洹몃졇??吏?좊뜕 ?좎쓣 ?먯긽 蹂듦뎄.
  373:             if (ctx?.prev !== undefined) {
  374:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  375:             }
  376:             const message = mapRelationError(t, err?.cause?.code);
  377:             toast?.showError?.(t('common.toast.title.Fail'), message);
  378:         },
  379:     });
  380: }
  381: 
  382: /**
  383:  * useUpdateAssignee ??洹몃━???대떦???몃씪???몄쭛 write-back.
  384:  *
  385:  * 寃쎈줈: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 吏곸젒 ?몄텧, ProjectIssueTable.assignIssue ?숈씪)
  386:  * ?꾨왂: useUpdateSchedule ?⑦꽩 ???숆? ?⑥튂(task.assignee 援먯껜) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  387:  *       ?깃났 ?좎뒪???쒖떆(2026-07-02), ?ㅽ뙣??gantt.error.saveFailed.
  388:  *
  389:  * ?좑툘 怨쇨굅 onSettled invalidate("shape ?덉쟾留?)???쒓굅?덈떎(2026-08-12): ganttKeys.data ??
  390:  *    ?꾨줈?앺듃 ?댁뒋瑜?JQL 濡??꾨웾 ?섏씠吏??섏쭛?섎뒗 理쒓퀬鍮꾩슜 resolver ??? ?몄쭛 1?뚮떦 ?꾨웾 ?ъ“?뚭? 遺숈뿀怨?
  391:  *    JQL ?ъ“?뚮뒗 write 吏곹썑 ?몃뜳??吏?곗쑝濡???媛믪쓣 ?뚮젮以????덈떎(짠6 / CLAUDE.md).
  392:  *    ?숆? ?⑥튂媛 ?대? gantt 怨꾩빟 shape({accountId, displayName, avatarUrl})?쇰줈 ?뺢퇋?뷀븯誘濡??덉쟾留앸룄 遺덊븘?뷀븯??
  393:  *    ?꾩껜 ?щ룞湲고솕???ㅼ쓬 ?먯뿰 ?ъ“?????ъ쭊???덈줈怨좎묠) ??useSetParent/useSetLink ? ?숈씪 ?뺤콉.
  394:  *
  395:  * mutate ?몄옄: { issueKey, accountId(string|null), assigneeObj }
  396:  *  - assigneeObj: ?좏깮 ?듭뀡 value({ accountId, displayName, avatarUrls }) ???숆? ?쒖떆??gantt 怨꾩빟 assignee shape 濡?留ㅽ븨).
  397:  */
  398: export function useUpdateAssignee({ projectId, toast }) {
  399:     const t = useI18nStore((s) => s.t);
  400:     const queryClient = useQueryClient();
  401: 
  402:     return useMutation({
  403:         mutationFn: async ({ issueKey, accountId }) => {
  404:             // ?대떦??吏?뺤? asUser ??Assign Issues 沅뚰븳 ?뺤젙 嫄곕?留?李⑤떒
  405:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
  406:             if (perms.canAssignIssues === false) throw jiraPermissionError();
  407:             const result = await executeRequest(
  408:                 'assignIssue',
  409:                 { accountId: accountId || null },
  410:                 { issueIdOrKey: issueKey }
  411:             );
  412:             // executeRequest: ?깃났 ??'' ?먮뒗 JSON, ?ㅽ뙣 ??{ success:false, error }.
  413:             if (result && result.success === false) {
  414:                 const err = new Error('assignIssue failed');
  415:                 err.cause = result.error;
  416:                 throw err;
  417:             }
  418:             return result;
  419:         },
  420: 
  421:         onMutate: async ({ issueKey, accountId, assigneeObj }) => {
  422:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  423:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  424:             // gantt 怨꾩빟 assignee shape({ accountId, displayName, avatarUrl }) 濡?留ㅽ븨(?놁쑝硫??댁젣=null).
  425:             const nextAssignee =
  426:                 accountId && assigneeObj
  427:                     ? {
  428:                           accountId: assigneeObj.accountId ?? accountId,
  429:                           displayName: assigneeObj.displayName ?? null,
  430:                           avatarUrl: assigneeObj.avatarUrls?.['24x24'] ?? null,
  431:                       }
  432:                     : null;
  433:             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
  434:                 patchTask(old, issueKey, { assignee: nextAssignee })
  435:             );
  436:             return { prev };
  437:         },
  438: 
  439:         onSuccess: () => {
  440:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.assigneeSaved'));
  441:         },
  442: 
  443:         onError: (err, _vars, ctx) => {
  444:             if (ctx?.prev !== undefined) {
  445:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  446:             }
  447:             const message = err?.cause?.code === 'JIRA_PERMISSION_DENIED'
  448:                 ? t('projectDetail.issue.jiraPermission.assign')
  449:                 : t('gantt.error.saveFailed');
  450:             toast?.showError?.(t('common.toast.title.Fail'), message);
  451:         },
  452:     });
  453: }
  454: 
  455: /**
  456:  * useUpdateCoworkers ??洹몃━???묒뾽???ㅼ쨷) ?몃씪???몄쭛 write-back.
  457:  *
  458:  * 寃쎈줈: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker ?숈씪)
  459:  *  - customFieldId(coworkerFieldId)??useGanttData 媛 梨꾩슫 ['coworkerFieldId'] 荑쇰━ 罹먯떆瑜?怨듭쑀.
  460:  *  - issueId ???レ옄 Jira id(string) ??Task.issueId(?좉퇋 ?꾨뱶).
  461:  * ?꾨왂: ?숆? ?⑥튂(task.coworkers 援먯껜) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  462:  *
  463:  * ?좑툘 怨쇨굅 onSettled invalidate ??**洹쒖빟 ?꾨컲**?대씪 ?쒓굅?덈떎(2026-08-12). ???낆쓽 write 寃쎈줈
  464:  *    (updateProjectIdField ??setAppFieldValueForIssues)??**??而ㅼ뒪??꾨뱶 write** ?닿퀬,
  465:  *    ganttKeys.data ?ъ“?뚮뒗 JQL search ????write 吏곹썑 search ???몃뜳??吏?곗쑝濡???媛믪쓣 ?뚮젮二쇨퀬
  466:  *    洹?媛믪씠 staleTime 罹먯떆??諛뺤젣?쒕떎(짠6 ?똷rite 吏곹썑 search ?ъ“??湲덉??? CLAUDE.md).
  467:  *    ?숆? ?⑥튂媛 罹먯떆??理쒖쥌 ?곹깭?? user 媛앹껜??select ?듭뀡 value({accountId, displayName,
  468:  *    avatarUrls:{'24x24'}})濡?AvatarStack ???쎈뒗 ?ㅻ? 紐⑤몢 媛뽰텣???쒕쾭 shape 怨??뚮뜑 ?숇벑).
  469:  *
  470:  * mutate ?몄옄: { issueId, accountIds(string[]), coworkers }  (coworkers=?좏깮 ?듭뀡 value 諛곗뿴, ?숆? ?쒖떆??
  471:  */
  472: export function useUpdateCoworkers({ projectId, toast }) {
  473:     const t = useI18nStore((s) => s.t);
  474:     const queryClient = useQueryClient();
  475: 
  476:     return useMutation({
  477:         mutationFn: async ({ issueId, accountIds }) => {
  478:             const customFieldId = queryClient.getQueryData(jiraKeys.coworkerField());
  479:             const result = await invoke('updateProjectIdField', {
  480:                 issueId,
  481:                 value: Array.isArray(accountIds) ? accountIds : [],
  482:                 customFieldId,
  483:             });
  484:             if (!result || result.success !== true) {
  485:                 const err = new Error('updateProjectIdField failed');
  486:                 err.cause = result?.error;
  487:                 throw err;
  488:             }
  489:             return result.content ?? result;
  490:         },
  491: 
  492:         // ?숆?: task.coworkers 瑜??좏깮??user 媛앹껜 諛곗뿴濡?援먯껜(issueId 濡?留ㅼ묶 ??Task.issueId).
  493:         onMutate: async ({ issueId, coworkers }) => {
  494:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  495:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  496:             const nextCoworkers = Array.isArray(coworkers) ? coworkers : [];
  497:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  498:                 const tasks = old?.content?.tasks;
  499:                 if (!Array.isArray(tasks)) return old;
  500:                 return {
  501:                     ...old,
  502:                     content: {
  503:                         ...old.content,
  504:                         tasks: tasks.map((tk) =>
  505:                             tk.issueId === issueId ? { ...tk, coworkers: nextCoworkers } : tk
  506:                         ),
  507:                     },
  508:                 };
  509:             });
  510:             return { prev };
  511:         },
  512: 
  513:         onSuccess: () => {
  514:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.coworkerSaved'));
  515:         },
  516: 
  517:         onError: (_err, _vars, ctx) => {
  518:             if (ctx?.prev !== undefined) {
  519:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  520:             }
  521:             toast?.showError?.(t('common.toast.title.Fail'), t('gantt.error.saveFailed'));
  522:         },
  523:     });
  524: }
  525: 
  526: /**
  527:  * useUpdatePlannedMd ??洹몃━??"怨꾪쉷 ?묒뾽??(MD) ?몃씪???몄쭛 write-back.
  528:  *
  529:  * 寃쎈줈: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD ?숈씪)
  530:  *  - originalEstimate = `${plannedHours(md, hourRate)}h`
  531:  * ?꾨왂: ?숆? ?⑥튂(task.originalEstimateSeconds) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  532:  *
  533:  * ?좑툘 怨쇨굅 onSettled invalidate ???쒓굅?덈떎(2026-08-12) ??? ?몄쭛 1?뚮떦 理쒓퀬鍮꾩슜 resolver ?꾨웾 ?ъ“?뚯?怨?
  534:  *    JQL ?ъ“?뚮뒗 write 吏곹썑 ?몃뜳??吏???꾪뿕???덈떎(짠6). ????숆?媛믪쓣 **?ㅼ젣濡?write ?섎뒗 ?쒓컙媛?*?먯꽌
  535:  *    ??궛??plannedHours) 罹먯떆? ?쒕쾭 ?곹깭媛 ?닿툔?섏? ?딄쾶 ?쒕떎 ???닿쾬????invalidate ????븷?댁뿀??
  536:  *    (泥섎━??aggregate ?뚯깮媛믪? ?쒕쾭 ?ш퀎?곗씠???ㅼ쓬 ?먯뿰 ?ъ“?뚯뿉???곕씪?⑤떎.)
  537:  *
  538:  * mutate ?몄옄: { issueKey, md(number) }
  539:  */
  540: export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
  541:     const t = useI18nStore((s) => s.t);
  542:     const queryClient = useQueryClient();
  543:     const rate = hourRate > 0 ? hourRate : 8;
  544: 
  545:     return useMutation({
  546:         mutationFn: async ({ issueKey, md }) => {
  547:             // ?쒓컙 異붿쟻 媛???щ????ъ쟾 ?먯젙?섏? ?딅뒗??editmeta ?섑뵆 ?먯젙???ㅽ깘) ??
  548:             // ?ㅼ젣 400(timetracking) ?ㅽ뙣瑜?onError ?먯꽌 ?덈궡濡?留ㅽ븨.
  549:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
  550:             if (perms.canEditIssues === false) throw jiraPermissionError();
  551:             const originalEstimate = `${plannedHours(md, rate)}h`;
  552:             // 湲곗〈 remaining 議고쉶 ???④퍡 ?꾩넚 ???섏젙 ??remaining 誘몃룞遊됱씠硫?Jira 寃利?400
  553:             // (Task ?먮뒗 remaining ???놁뼱 ?④굔 GET 1?? buildTimetrackingPayload 李몄“)
  554:             const cur = await executeRequest('getIssue', { fields: 'timetracking' }, { issueIdOrKey: issueKey });
  555:             const remainingSeconds = cur?.fields?.timetracking?.remainingEstimateSeconds ?? null;
  556:             const result = await executeRequest(
  557:                 'updateIssue',
  558:                 { fields: { timetracking: buildTimetrackingPayload(originalEstimate, remainingSeconds) } },
  559:                 { issueIdOrKey: issueKey }
  560:             );
  561:             if (result && result.success === false) {
  562:                 const err = new Error('updateIssue(timetracking) failed');
  563:                 err.cause = result.error;
  564:                 throw err;
  565:             }
  566:             return result;
  567:         },
  568: 
  569:         onMutate: async ({ issueKey, md }) => {
  570:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  571:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  572:             // ?숆?媛믪? write ?섎뒗 ?쒓컙媛?0.1h 諛섏삱由??먯꽌 ??궛 ??罹먯떆媛 ?쒕쾭 ??κ컪怨?媛숈? ?섎? 媛뽯뒗??
  573:             const seconds = Math.round(plannedHours(md, rate) * 3600);
  574:             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
  575:                 patchTask(old, issueKey, { originalEstimateSeconds: seconds })
  576:             );
  577:             return { prev };
  578:         },
  579: 
  580:         onSuccess: () => {
  581:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.plannedMdSaved'));
  582:         },
  583: 
  584:         onError: (err, _vars, ctx) => {
  585:             if (ctx?.prev !== undefined) {
  586:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  587:             }
  588:             const code = err?.cause?.code;
  589:             // ?ㅼ젣 400 ?묐떟(timetracking ?몄쭛 遺덇?)留??쒓컙 異붿쟻 ?덈궡濡?留ㅽ븨 ???쒕룄 湲곕컲?대씪 ?ㅽ깘 ?놁쓬
  590:             const message =
  591:                 isTimeTrackingUnsupportedError(err)
  592:                     ? t('projectDetail.issue.timeTracking.disabled')
  593:                     : code === 'JIRA_PERMISSION_DENIED'
  594:                         ? t('projectDetail.issue.jiraPermission.edit')
  595:                         : t('gantt.error.saveFailed');
  596:             toast?.showError?.(t('common.toast.title.Fail'), message);
  597:         },
  598:     });
  599: }
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-335-    const closeAssigneeEditor = useCallback(() => setAssigneeTask(null), []);
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-336-    const handleAssigneeSubmit = useCallback(
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-337-        ({ accountIds, users }) => {
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:338:            // 단일: 첫 항목만(미선택=해제). 기존 write 경로 재사용(useUpdateAssignee 는 { issueKey, accountId, assigneeObj }).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-339-            onUpdateAssigneeRef.current?.({
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-340-                issueKey: assigneeTask?.id,
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-341-                accountId: accountIds?.[0] ?? null,
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-352-    const closeCoworkerEditor = useCallback(() => setCoworkerTask(null), []);
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-353-    const handleCoworkerSubmit = useCallback(
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-354-        ({ accountIds, users }) => {
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:355:            // 기존 write 경로 재사용(useUpdateCoworkers 는 { issueId, accountIds, coworkers }).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-356-            onUpdateCoworkersRef.current?.({
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-357-                issueId: coworkerTask?.issueId,
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-358-                accountIds,
--
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-12-    useUpdateSchedule,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-13-    useSetParent,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-14-    useSetLink,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:15:    useUpdateAssignee,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:16:    useUpdateCoworkers,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:17:    useUpdatePlannedMd,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-18-} from './useGanttMutations';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-19-import {
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-20-    useCreateFolder,
--
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-91-    const updateSchedule = useUpdateSchedule({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-92-    const setParent = useSetParent({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-93-    const setLink = useSetLink({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:94:    const updateAssignee = useUpdateAssignee({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:95:    const updateCoworkers = useUpdateCoworkers({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:96:    const updatePlannedMd = useUpdatePlannedMd({ projectId: project_id, toast: batchedToast, hourRate });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-97-    // 폴더 레이어 mutation(앱 DB 전용 → 성공 후 일반 invalidate).
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-98-    const createFolder = useCreateFolder({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-99-    const renameFolder = useRenameFolder({ projectId: project_id, toast: batchedToast });
--
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-9- *
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-10- * 인라인 편집(InlineEdit) 대신 모달로 통일해 Select 의 행 내 상하 클리핑을 원천 해소.
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-11- * 저장 경로는 기존 write 를 100% 재사용: onSubmit({ accountIds, users }) 만 호출하고
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx:12: * 상위(GanttChart)가 케이스별로 useUpdateAssignee/useUpdateCoworkers 로 흘린다.
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-13- *
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-14- * props:
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-15- *  - isOpen: 표시 여부
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-20-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-21-/** 캐시(getProjectGanttData 응답)의 특정 task 를 patch 하는 낙관적 업데이트 헬퍼.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-22- *  old.content.tasks[] 중 key/id 매칭 항목에 patch 를 병합해 새 캐시를 만든다. */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:23:function patchTask(old, issueKey, patch) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-24-    const tasks = old?.content?.tasks;
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-25-    if (!Array.isArray(tasks)) return old;
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-26-    return {
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-380-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-381-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-382-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:383: * useUpdateAssignee — 그리드 담당자 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-384- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-385- * 경로: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 직접 호출, ProjectIssueTable.assignIssue 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-386- * 전략: useUpdateSchedule 패턴 — 낙관 패치(task.assignee 교체) + onError 롤백. **invalidate 하지 않는다.**
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-395- * mutate 인자: { issueKey, accountId(string|null), assigneeObj }
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-396- *  - assigneeObj: 선택 옵션 value({ accountId, displayName, avatarUrls }) — 낙관 표시용(gantt 계약 assignee shape 로 매핑).
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-397- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:398:export function useUpdateAssignee({ projectId, toast }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-399-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-400-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-401-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-453-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-454-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-455-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:456: * useUpdateCoworkers — 그리드 협업자(다중) 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-457- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-458- * 경로: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-459- *  - customFieldId(coworkerFieldId)는 useGanttData 가 채운 ['coworkerFieldId'] 쿼리 캐시를 공유.
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-469- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-470- * mutate 인자: { issueId, accountIds(string[]), coworkers }  (coworkers=선택 옵션 value 배열, 낙관 표시용)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-471- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:472:export function useUpdateCoworkers({ projectId, toast }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-473-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-474-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-475-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-524-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-525-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-526-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:527: * useUpdatePlannedMd — 그리드 "계획 작업량"(MD) 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-528- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-529- * 경로: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-530- *  - originalEstimate = `${plannedHours(md, hourRate)}h`
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-537- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-538- * mutate 인자: { issueKey, md(number) }
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-539- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:540:export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-541-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-542-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-543-    const rate = hourRate > 0 ? hourRate : 8;
src\permission\PermissionMap.js-135-    removeProjectMemberByAccount: OR([['PROJECT', 'write'], ['RESOURCE_MANAGEMENT', 'write']], 'inherited'),
src\permission\PermissionMap.js-136-    updateProjectUsersByKey: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-137-    deleteProjectUsersByKey: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js:138:    updateProjectIdField: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-139-    deleteProjectIssue: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-140-    recordIssueAssignedDate: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-141-    // 코워커 전용 갱신(팀 관리형 이슈 프로퍼티 write) — payload 에 projectId 없어 상위 read scope 의존(§10-8)
--
src\permission\PermissionMap.js-345-    getTeamAnalyticsScope: OR([['REPORT', 'read'], ['RESOURCE_MANAGEMENT', 'read'], ['TEAM_MANAGEMENT', 'read']], 'none'),
src\permission\PermissionMap.js-346-
src\permission\PermissionMap.js-347-    // ── ProjectSubscription (ProjectSubscriptionController, 7) — RFC-171 ─────
src\permission\PermissionMap.js:348:    // 구독은 "이 프로젝트에 어떤 이슈가 자동 편입되는가"를 정하므로 작업 등록(updateProjectIdField)과
src\permission\PermissionMap.js-349-    // 같은 축이다 → PROJECT read/write.
src\permission\PermissionMap.js-350-    //   ★ project mode 는 전부 'detail' 이다('inherited' 아님). payload 에 projectId 가 항상 있으므로
src\permission\PermissionMap.js-351-    //     소속 검증을 강제할 수 있다. 특히 getSubscriptionSourceOptions 는 v1 설계에서 projectId 가
--
src\api\jira\issue\IssueApi.js-468- * @param accountId    지정할 accountId. null 이면 "미배정"으로 해제
src\api\jira\issue\IssueApi.js-469- * @param as           'user'(기본)
src\api\jira\issue\IssueApi.js-470- */
src\api\jira\issue\IssueApi.js:471:export const assignIssueApi = async (issueIdOrKey, accountId, as = 'user') => {
src\api\jira\issue\IssueApi.js-472-    return await putJiraJson({
src\api\jira\issue\IssueApi.js-473-        as,
src\api\jira\issue\IssueApi.js-474-        url: route`/rest/api/3/issue/${issueIdOrKey}/assignee`,
--
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-101-
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-102-    const runRegister = async () => {
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-103-        setTakeover(null)
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx:104:        await invoke('updateProjectIdField', {issueId: checkItems ,value: project_id, customFieldId: await getCustomFieldId(CustomFieldId.projectIdField)})
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-105-            .then(async (result) => {
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-106-                // 서버 실패(앱의 프로젝트 접근 권한 부재 등)를 성공으로 둔갑시키지 않는다
static/ui/src/pages\projectDetail\issue\IssueAddModal.jsx-107-                if (result?.success === false) {
--
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-207-        });
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-208-    }
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-209-
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx:210:    const assignIssue = async (issueIdOrKey, accountId, index) => {
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-211-        if (!ensureJiraPermission(jiraPermissions.canAssignIssues, 'projectDetail.issue.jiraPermission.assign')) return;
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx:212:        await executeRequest('assignIssue', {accountId: accountId || null}, {issueIdOrKey: issueIdOrKey})
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-213-            .then((result) => {
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-214-                if (result?.success === false) toast.showError(t('common.toast.title.Fail'), t('common.toast.description.error'));
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-215-                else toast.showSuccess(t('common.toast.title.success'), t('projectDetail.issue.toast.update.success'));
--
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-296-                                    value={changeAssignee.current}
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-297-                                    onConfirm={async () => {
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-298-                                        if (issue?.fields?.assignee?.accountId != changeAssignee.current) {
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx:299:                                            await assignIssue(issue.key, changeAssignee.current, index)
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-300-                                        }
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-301-                                    }}
static/ui/src/pages\projectDetail\issue\ProjectIssueTable.jsx-302-                                    hideActionButtons/>
--
src\resolver\gantt\GanttMapper.js-118-    return {
src\resolver\gantt\GanttMapper.js-119-        id: issue.key,
src\resolver\gantt\GanttMapper.js-120-        key: issue.key,
src\resolver\gantt\GanttMapper.js:121:        // 협업자 write(updateProjectIdField)가 숫자 Jira issue id 를 요구 → 원본 id 를 string 으로 노출.
src\resolver\gantt\GanttMapper.js-122-        issueId: issue.id ?? null,
src\resolver\gantt\GanttMapper.js-123-        summary: f.summary ?? '',
src\resolver\gantt\GanttMapper.js-124-        start,
--
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-193-            startText: task.start ?? '',
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-194-            endText: task.end ?? '', // 막대 hover 툴팁의 일정 범위 표시용(원본 ISO).
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-195-            // 인라인 편집/신규 컬럼 passthrough (경계면 계약 additive 3필드, 02_backend_report_grid_edit.md):
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js:196:            issueId: task.issueId ?? null, // 협업자 write(updateProjectIdField) 용 숫자 Jira id(string)
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-197-            originalEstimateSeconds: task.originalEstimateSeconds ?? null, // "계획 작업량"(MD) 산정 기준(초)
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-198-            progressPercent: task.progressPercent ?? null, // "처리율"(%) 읽기전용 컬럼
static/ui/src/pages\projectDetail\gantt\ganttAdapter.js-199-            wbsParent: task.wbsParent ?? null, // 폴더 드롭 시 WBS 해제 판단용(앱필드 override 존재 여부)
--
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-382-/**
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-383- * useUpdateAssignee — 그리드 담당자 인라인 편집 write-back.
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-384- *
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:385: * 경로: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 직접 호출, ProjectIssueTable.assignIssue 동일)
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-386- * 전략: useUpdateSchedule 패턴 — 낙관 패치(task.assignee 교체) + onError 롤백. **invalidate 하지 않는다.**
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-387- *       성공 토스트 표시(2026-07-02), 실패는 gantt.error.saveFailed.
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-388- *
--
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-405-            const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-406-            if (perms.canAssignIssues === false) throw jiraPermissionError();
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-407-            const result = await executeRequest(
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:408:                'assignIssue',
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-409-                { accountId: accountId || null },
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-410-                { issueIdOrKey: issueKey }
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-411-            );
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-412-            // executeRequest: 성공 시 '' 또는 JSON, 실패 시 { success:false, error }.
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-413-            if (result && result.success === false) {
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:414:                const err = new Error('assignIssue failed');
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-415-                err.cause = result.error;
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-416-                throw err;
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-417-            }
--
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-455-/**
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-456- * useUpdateCoworkers — 그리드 협업자(다중) 인라인 편집 write-back.
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-457- *
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:458: * 경로: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker 동일)
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-459- *  - customFieldId(coworkerFieldId)는 useGanttData 가 채운 ['coworkerFieldId'] 쿼리 캐시를 공유.
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-460- *  - issueId 는 숫자 Jira id(string) — Task.issueId(신규 필드).
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-461- * 전략: 낙관 패치(task.coworkers 교체) + onError 롤백. **invalidate 하지 않는다.**
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-462- *
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-463- * ⚠️ 과거 onSettled invalidate 는 **규약 위반**이라 제거했다(2026-08-12). 이 훅의 write 경로
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:464: *    (updateProjectIdField → setAppFieldValueForIssues)는 **앱 커스텀필드 write** 이고,
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-465- *    ganttKeys.data 재조회는 JQL search 다 — write 직후 search 는 인덱스 지연으로 옛 값을 돌려주고
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-466- *    그 값이 staleTime 캐시에 박제된다(§6 「write 직후 search 재조회 금지」, CLAUDE.md).
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-467- *    낙관 패치가 캐시의 최종 상태다. user 객체는 select 옵션 value({accountId, displayName,
--
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-476-    return useMutation({
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-477-        mutationFn: async ({ issueId, accountIds }) => {
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-478-            const customFieldId = queryClient.getQueryData(jiraKeys.coworkerField());
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:479:            const result = await invoke('updateProjectIdField', {
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-480-                issueId,
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-481-                value: Array.isArray(accountIds) ? accountIds : [],
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-482-                customFieldId,
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-483-            });
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-484-            if (!result || result.success !== true) {
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js:485:                const err = new Error('updateProjectIdField failed');
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-486-                err.cause = result?.error;
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-487-                throw err;
static/ui/src/pages\projectDetail\gantt\useGanttMutations.js-488-            }
--
src\resolver\workAssignment\WorkAssignmentWriter.js-12-
src\resolver\workAssignment\WorkAssignmentWriter.js-13-import { LogicalError } from '../../error/LogicalError';
src\resolver\workAssignment\WorkAssignmentWriter.js-14-import { ErrorCodes } from '../../utils/errors/ErrorCodes';
src\resolver\workAssignment\WorkAssignmentWriter.js:15:import { assignIssueApi, getIssueForAssignmentApi } from '../../api/jira/issue/IssueApi';
src\resolver\workAssignment\WorkAssignmentWriter.js-16-import { mergeIssueProperty } from '../../api/jira/issue/IssuePropertyApi';
src\resolver\workAssignment\WorkAssignmentWriter.js-17-// A-3 — 대시보드 참여자 통계 캐시. 담당자/협업자를 바꿨으면 무효화한다(인스턴스 한정).
src\resolver\workAssignment\WorkAssignmentWriter.js-18-import { invalidateProjectParticipantIssues } from '../../api/jira/issue/ProjectParticipantFetcher';
--
src\resolver\workAssignment\WorkAssignmentWriter.js-83-    const applied = { assignee: false, coworkers: false };
src\resolver\workAssignment\WorkAssignmentWriter.js-84-
src\resolver\workAssignment\WorkAssignmentWriter.js-85-    if (hasAssigneeChange) {
src\resolver\workAssignment\WorkAssignmentWriter.js:86:        await assignIssueApi(target, assigneeAccountId ?? null, 'user'); // 4xx → ForgeAPIError 전파
src\resolver\workAssignment\WorkAssignmentWriter.js-87-        applied.assignee = true;
src\resolver\workAssignment\WorkAssignmentWriter.js-88-    }
src\resolver\workAssignment\WorkAssignmentWriter.js-89-
--
src\resolver\projectIssue\ProjectUsersService.js-269- * @param value 등록 / 수정 하려는 value
src\resolver\projectIssue\ProjectUsersService.js-270- * @returns {Promise<void>}
src\resolver\projectIssue\ProjectUsersService.js-271- */
src\resolver\projectIssue\ProjectUsersService.js:272:export const updateProjectIdFieldService = async ({customFieldId, issueId, value}) => {
src\resolver\projectIssue\ProjectUsersService.js-273-    // ★ 앱 필드 write 는 AppFieldValueApi 가 유일 경로다(RFC-171). value 는 **직렬화 전 원본값**을
src\resolver\projectIssue\ProjectUsersService.js-274-    //   넘긴다 — 과거처럼 호출부가 JSON 조각 문자열을 조립하지 않는다.
src\resolver\projectIssue\ProjectUsersService.js-275-    //   coworker(user 컬렉션)는 [{accountId}], 그 외(projectId 등)는 문자열.
--
src\resolver\projectIssue\ProjectUsersService.js-401- * - 이슈 프로퍼티(movesRms)를 read-merge-write 해 coworkers(accountId[])만 교체한다.
src\resolver\projectIssue\ProjectUsersService.js-402- *   assignedAt/assignedAtIso/assignedById 등 다른 필드는 보존(merge). 빈 배열이면 해제(coworkers:[]).
src\resolver\projectIssue\ProjectUsersService.js-403- * - coworker 편집은 사용자 액션이므로 best-effort 가 아니라 실패를 전파(프론트 토스트).
src\resolver\projectIssue\ProjectUsersService.js:404: * - projectId 범용 필드 write(updateProjectIdFieldService)와 분리 — projectId 용도는 무변경.
src\resolver\projectIssue\ProjectUsersService.js-405- * @param issueId 대상 이슈 id(숫자) 또는 key
src\resolver\projectIssue\ProjectUsersService.js-406- * @param accountIds 협업자 accountId 배열
src\resolver\projectIssue\ProjectUsersService.js-407- * @returns {Promise<{content:{issueId, coworkers:string[]}}>}
--
src\resolver\projectIssue\ProjectUsersController.js-4-    deleteProjectUsersByKeyService,
src\resolver\projectIssue\ProjectUsersController.js-5-    findProjectusersByProjectIdService, getProjectUserWithScrollService, getProjectUserWitScrollService,
src\resolver\projectIssue\ProjectUsersController.js-6-    insertProjectusersService, searchProjectUserService, searchRegisteredJiraUsersService,
src\resolver\projectIssue\ProjectUsersController.js:7:    updateProjectIdFieldService,
src\resolver\projectIssue\ProjectUsersController.js-8-    updateProjectUsersByKeyService,
src\resolver\projectIssue\ProjectUsersController.js-9-    recordIssueAssignedDateService,
src\resolver\projectIssue\ProjectUsersController.js-10-    updateIssueCoworkersService,
--
src\resolver\projectIssue\ProjectUsersController.js-28-    guardedDefine(resolver, 'updateProjectUsersByKey', ({payload, context}) => updateProjectUsersByKeyService(payload, context));
src\resolver\projectIssue\ProjectUsersController.js-29-
src\resolver\projectIssue\ProjectUsersController.js-30-    /* app 권한으로 실행해야 해서 backend 로직에서 실행*/
src\resolver\projectIssue\ProjectUsersController.js:31:    guardedDefine(resolver, 'updateProjectIdField', ({payload}) => updateProjectIdFieldService(payload));
src\resolver\projectIssue\ProjectUsersController.js-32-
src\resolver\projectIssue\ProjectUsersController.js-33-    guardedDefine(resolver, 'deleteProjectIssue', ({payload}) => deleteProjectIssueService(payload));
src\resolver\projectIssue\ProjectUsersController.js-34-

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/projectDetail/gantt/useGanttMutations.js' 472 620; Show-Range 'src/resolver/projectIssue/ProjectUsersService.js' 250 330; Show-Range 'src/resolver/projectIssue/ProjectUsersService.js' 390 465; rg -n -C 3 \"useUpdateAssignee|useUpdateCoworkers|useUpdatePlannedMd\" static/ui/src/pages/projectDetail/gantt -g '*.jsx' -g '*.js'; rg -n -C 3 \"originalEstimateSeconds|plannedMd|plannedHours|originalEstimate\" src/resolver/gantt static/ui/src/pages/projectDetail/gantt -g '*.js' -g '*.jsx' | Select-Object -First 360" in C:\CloudJira\moves-workforce
 succeeded in 1695ms:

--- static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:472-620 ---
  472: export function useUpdateCoworkers({ projectId, toast }) {
  473:     const t = useI18nStore((s) => s.t);
  474:     const queryClient = useQueryClient();
  475: 
  476:     return useMutation({
  477:         mutationFn: async ({ issueId, accountIds }) => {
  478:             const customFieldId = queryClient.getQueryData(jiraKeys.coworkerField());
  479:             const result = await invoke('updateProjectIdField', {
  480:                 issueId,
  481:                 value: Array.isArray(accountIds) ? accountIds : [],
  482:                 customFieldId,
  483:             });
  484:             if (!result || result.success !== true) {
  485:                 const err = new Error('updateProjectIdField failed');
  486:                 err.cause = result?.error;
  487:                 throw err;
  488:             }
  489:             return result.content ?? result;
  490:         },
  491: 
  492:         // ?숆?: task.coworkers 瑜??좏깮??user 媛앹껜 諛곗뿴濡?援먯껜(issueId 濡?留ㅼ묶 ??Task.issueId).
  493:         onMutate: async ({ issueId, coworkers }) => {
  494:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  495:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  496:             const nextCoworkers = Array.isArray(coworkers) ? coworkers : [];
  497:             queryClient.setQueryData(ganttKeys.data(projectId), (old) => {
  498:                 const tasks = old?.content?.tasks;
  499:                 if (!Array.isArray(tasks)) return old;
  500:                 return {
  501:                     ...old,
  502:                     content: {
  503:                         ...old.content,
  504:                         tasks: tasks.map((tk) =>
  505:                             tk.issueId === issueId ? { ...tk, coworkers: nextCoworkers } : tk
  506:                         ),
  507:                     },
  508:                 };
  509:             });
  510:             return { prev };
  511:         },
  512: 
  513:         onSuccess: () => {
  514:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.coworkerSaved'));
  515:         },
  516: 
  517:         onError: (_err, _vars, ctx) => {
  518:             if (ctx?.prev !== undefined) {
  519:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  520:             }
  521:             toast?.showError?.(t('common.toast.title.Fail'), t('gantt.error.saveFailed'));
  522:         },
  523:     });
  524: }
  525: 
  526: /**
  527:  * useUpdatePlannedMd ??洹몃━??"怨꾪쉷 ?묒뾽??(MD) ?몃씪???몄쭛 write-back.
  528:  *
  529:  * 寃쎈줈: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD ?숈씪)
  530:  *  - originalEstimate = `${plannedHours(md, hourRate)}h`
  531:  * ?꾨왂: ?숆? ?⑥튂(task.originalEstimateSeconds) + onError 濡ㅻ갚. **invalidate ?섏? ?딅뒗??**
  532:  *
  533:  * ?좑툘 怨쇨굅 onSettled invalidate ???쒓굅?덈떎(2026-08-12) ??? ?몄쭛 1?뚮떦 理쒓퀬鍮꾩슜 resolver ?꾨웾 ?ъ“?뚯?怨?
  534:  *    JQL ?ъ“?뚮뒗 write 吏곹썑 ?몃뜳??吏???꾪뿕???덈떎(짠6). ????숆?媛믪쓣 **?ㅼ젣濡?write ?섎뒗 ?쒓컙媛?*?먯꽌
  535:  *    ??궛??plannedHours) 罹먯떆? ?쒕쾭 ?곹깭媛 ?닿툔?섏? ?딄쾶 ?쒕떎 ???닿쾬????invalidate ????븷?댁뿀??
  536:  *    (泥섎━??aggregate ?뚯깮媛믪? ?쒕쾭 ?ш퀎?곗씠???ㅼ쓬 ?먯뿰 ?ъ“?뚯뿉???곕씪?⑤떎.)
  537:  *
  538:  * mutate ?몄옄: { issueKey, md(number) }
  539:  */
  540: export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
  541:     const t = useI18nStore((s) => s.t);
  542:     const queryClient = useQueryClient();
  543:     const rate = hourRate > 0 ? hourRate : 8;
  544: 
  545:     return useMutation({
  546:         mutationFn: async ({ issueKey, md }) => {
  547:             // ?쒓컙 異붿쟻 媛???щ????ъ쟾 ?먯젙?섏? ?딅뒗??editmeta ?섑뵆 ?먯젙???ㅽ깘) ??
  548:             // ?ㅼ젣 400(timetracking) ?ㅽ뙣瑜?onError ?먯꽌 ?덈궡濡?留ㅽ븨.
  549:             const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
  550:             if (perms.canEditIssues === false) throw jiraPermissionError();
  551:             const originalEstimate = `${plannedHours(md, rate)}h`;
  552:             // 湲곗〈 remaining 議고쉶 ???④퍡 ?꾩넚 ???섏젙 ??remaining 誘몃룞遊됱씠硫?Jira 寃利?400
  553:             // (Task ?먮뒗 remaining ???놁뼱 ?④굔 GET 1?? buildTimetrackingPayload 李몄“)
  554:             const cur = await executeRequest('getIssue', { fields: 'timetracking' }, { issueIdOrKey: issueKey });
  555:             const remainingSeconds = cur?.fields?.timetracking?.remainingEstimateSeconds ?? null;
  556:             const result = await executeRequest(
  557:                 'updateIssue',
  558:                 { fields: { timetracking: buildTimetrackingPayload(originalEstimate, remainingSeconds) } },
  559:                 { issueIdOrKey: issueKey }
  560:             );
  561:             if (result && result.success === false) {
  562:                 const err = new Error('updateIssue(timetracking) failed');
  563:                 err.cause = result.error;
  564:                 throw err;
  565:             }
  566:             return result;
  567:         },
  568: 
  569:         onMutate: async ({ issueKey, md }) => {
  570:             await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
  571:             const prev = queryClient.getQueryData(ganttKeys.data(projectId));
  572:             // ?숆?媛믪? write ?섎뒗 ?쒓컙媛?0.1h 諛섏삱由??먯꽌 ??궛 ??罹먯떆媛 ?쒕쾭 ??κ컪怨?媛숈? ?섎? 媛뽯뒗??
  573:             const seconds = Math.round(plannedHours(md, rate) * 3600);
  574:             queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
  575:                 patchTask(old, issueKey, { originalEstimateSeconds: seconds })
  576:             );
  577:             return { prev };
  578:         },
  579: 
  580:         onSuccess: () => {
  581:             toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.plannedMdSaved'));
  582:         },
  583: 
  584:         onError: (err, _vars, ctx) => {
  585:             if (ctx?.prev !== undefined) {
  586:                 queryClient.setQueryData(ganttKeys.data(projectId), ctx.prev);
  587:             }
  588:             const code = err?.cause?.code;
  589:             // ?ㅼ젣 400 ?묐떟(timetracking ?몄쭛 遺덇?)留??쒓컙 異붿쟻 ?덈궡濡?留ㅽ븨 ???쒕룄 湲곕컲?대씪 ?ㅽ깘 ?놁쓬
  590:             const message =
  591:                 isTimeTrackingUnsupportedError(err)
  592:                     ? t('projectDetail.issue.timeTracking.disabled')
  593:                     : code === 'JIRA_PERMISSION_DENIED'
  594:                         ? t('projectDetail.issue.jiraPermission.edit')
  595:                         : t('gantt.error.saveFailed');
  596:             toast?.showError?.(t('common.toast.title.Fail'), message);
  597:         },
  598:     });
  599: }

--- src/resolver/projectIssue/ProjectUsersService.js:250-330 ---
  250:         throw new LogicalError('INVALID_SALARY_TYPE', `Invalid salary_type: ${salary_type}`);
  251:     }
  252: 
  253:     const params = [
  254:         salary,
  255:         salary,
  256:         salary_type,
  257:         salary_type,
  258:         accountId,
  259:         project_member_id,
  260:     ];
  261: 
  262:     return await updateSalaryByKeyRepository(params);
  263: };
  264: 
  265: /**
  266:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽 ?곗씠???깅줉 / ?섏젙
  267:  * @param customFieldId ?깅줉 / ?섏젙?섎젮??customFieldId => 李멸퀬 customField.js
  268:  * @param issueId ?깅줉 / ?섏젙 ?섎젮??issueId
  269:  * @param value ?깅줉 / ?섏젙 ?섎젮??value
  270:  * @returns {Promise<void>}
  271:  */
  272: export const updateProjectIdFieldService = async ({customFieldId, issueId, value}) => {
  273:     // ?????꾨뱶 write ??AppFieldValueApi 媛 ?좎씪 寃쎈줈??RFC-171). value ??**吏곷젹?????먮낯媛?*??
  274:     //   ?섍릿????怨쇨굅泥섎읆 ?몄텧遺媛 JSON 議곌컖 臾몄옄?댁쓣 議곕┰?섏? ?딅뒗??
  275:     //   coworker(user 而щ젆????[{accountId}], 洹???projectId ????臾몄옄??
  276:     const rawValue = Array.isArray(value)
  277:         ? value.map(accountId => ({accountId}))
  278:         : String(value ?? '');
  279: 
  280:     await setAppFieldValueForIssues({
  281:         fieldIdOrKey: customFieldId,
  282:         issueIds: issueId,
  283:         value: rawValue,
  284:     });
  285:     // A-3(O-1) ???댁뒋 ?몄엯(projectId 吏??? 李몄뿬???듦퀎??**紐⑥쭛???먯껜**瑜?諛붽씔?? 罹먯떆瑜?鍮꾩슫??
  286:     //   ???몄텧???몄뒪?댁뒪?먮쭔 ?곸슜?쒕떎(Forge ?ㅼ쨷 ?몄뒪?댁뒪) ???ㅻⅨ ?몄뒪?댁뒪??TTL(60珥? 留뚮즺源뚯? ??吏묎퀎??
  287:     invalidateProjectParticipantIssues();
  288: }
  289: 
  290: /**
  291:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽 ?곗씠????젣
  292:  * @param customFieldId ??젣?섎젮??customFieldId => 李멸퀬 customField.js
  293:  * @param issueId ??젣?섎젮??issueId
  294:  * @returns {Promise<void>}
  295:  */
  296: export const deleteProjectIssueService = async ({customFieldId, issueId}) => {
  297:     // 鍮?臾몄옄??= ?꾨뱶 媛??댁젣(湲곗〈 ?숈옉怨??숈씪: body ??value 媛 "")
  298:     await setAppFieldValueForIssues({
  299:         fieldIdOrKey: customFieldId,
  300:         issueIds: issueId,
  301:         value: '',
  302:     });
  303:     // A-3(O-1) ???댁뒋 ?댁젣??紐⑥쭛??蹂寃쎌씠?????몄엯怨?媛숈? ?댁쑀).
  304:     invalidateProjectParticipantIssues();
  305: }
  306: 
  307: /*
  308:  * A-3 ?????듦퀎??媛숈? 寃?됱쓣 1?⑥뒪濡?怨듭쑀?쒕떎(ProjectParticipantFetcher).
  309:  *   `viewerId`(?몄텧??accountId)??洹??섏쿂??**?몄뒪?댁뒪 罹먯떆 ??*濡쒕쭔 ?곗씤?? 寃?됱씠 `as:'user'` ??
  310:  *   寃곌낵媛 ?몄텧??沅뚰븳?쇰줈 ?꾪꽣留곷릺誘濡??ъ슜?먮퀎濡?媛덈씪??媛??踰붿쐞媛 ?욎씠吏 ?딅뒗??
  311:  *   ?꾨떖?섏? ?딆쑝硫?罹먯떆瑜??곗? ?딅뒗??fail-safe) ???묐떟 shape쨌吏묎퀎 寃곌낵??醫낆쟾怨??숈씪?섎떎.
  312:  */
  313: 
  314: // ?몃젰蹂??좊떦 ?댁뒋 媛쒖닔
  315: export const getAssigneeStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
  316:     return await getAssigneeStats({projectId, coworkerFieldId, includeCoworker, viewerId});
  317: }
  318: 
  319: // ?댁뒋蹂?李몄뿬 ?몄썝 媛쒖닔
  320: export const getIssueParticipantStatsService = async ({projectId, coworkerFieldId, includeCoworker = false, viewerId = null}) => {
  321:     return  await getIssueParticipantStats({projectId, coworkerFieldId, includeCoworker, viewerId});
  322: }
  323: 
  324: export const getProjectUserWithScrollService = async ({project_id, cursor = null, limit = 5}) => {
  325:     // 1. DB 議고쉶
  326:     const rows = await getProjectUserWithScrollRepository({project_id, cursor, limit});
  327: 
  328:     if (!rows || rows.length === 0) {
  329:         return {
  330:             data: [],

--- src/resolver/projectIssue/ProjectUsersService.js:390-465 ---
  390:     };
  391: }
  392: 
  393: const mapUser = (u) => ({
  394:     account_id: u.accountId,
  395:     displayName: u.displayName,
  396:     avatar: u?.avatarUrls?.['24x24'] ?? null
  397: });
  398: 
  399: /**
  400:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽(?댁뒋) 肄붿썙而??꾩슜 媛깆떊 (? 愿由ы삎 吏??.
  401:  * - ?댁뒋 ?꾨줈?쇳떚(movesRms)瑜?read-merge-write ??coworkers(accountId[])留?援먯껜?쒕떎.
  402:  *   assignedAt/assignedAtIso/assignedById ???ㅻⅨ ?꾨뱶??蹂댁〈(merge). 鍮?諛곗뿴?대㈃ ?댁젣(coworkers:[]).
  403:  * - coworker ?몄쭛? ?ъ슜???≪뀡?대?濡?best-effort 媛 ?꾨땲???ㅽ뙣瑜??꾪뙆(?꾨줎???좎뒪??.
  404:  * - projectId 踰붿슜 ?꾨뱶 write(updateProjectIdFieldService)? 遺꾨━ ??projectId ?⑸룄??臾대?寃?
  405:  * @param issueId ????댁뒋 id(?レ옄) ?먮뒗 key
  406:  * @param accountIds ?묒뾽??accountId 諛곗뿴
  407:  * @returns {Promise<{content:{issueId, coworkers:string[]}}>}
  408:  */
  409: export const updateIssueCoworkersService = async ({issueId, accountIds}) => {
  410:     const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
  411:     // ?묒뾽??吏?뺣쭏??2嫄댁뵫 李랁? 怨쇰떎. ?ㅽ뙣??mergeIssueProperty 媛 ?꾪뙆?쒕떎. ?꾩슂 ???댁젣.
  412:     // console.log('[MOVES][updateIssueCoworkers] req', JSON.stringify({issueId, count: ids.length}));
  413:     await mergeIssueProperty(issueId, {coworkers: ids}); // read-merge-write, ?ㅻⅨ ?꾨뱶 蹂댁〈
  414:     // A-3 ????쒕낫??李몄뿬???듦퀎 罹먯떆(60珥?瑜?鍮꾩슫?? ??鍮꾩슦硫?"??ν뻽?붾뜲 李몄뿬???섍? 洹몃?濡?媛 ?쒕떎.
  415:     //   ???몄텧???몄뒪?댁뒪?먮쭔 ?곸슜?쒕떎(Forge ?ㅼ쨷 ?몄뒪?댁뒪) ???ㅻⅨ ?몄뒪?댁뒪??TTL 留뚮즺源뚯? ??吏묎퀎??
  416:     invalidateProjectParticipantIssues();
  417:     // console.log('[MOVES][updateIssueCoworkers] OK', String(issueId));
  418:     return {content: {issueId, coworkers: ids}};
  419: };
  420: 
  421: /**
  422:  * ?꾨줈?앺듃 ?곸꽭 > ?묒뾽(?댁뒋) ?깅줉?셋룸벑濡앹옄 湲곕줉 (best-effort / 鍮꾩감?? ???댁뒋 ?꾨줈?쇳떚(movesRms) ?꾪솚.
  423:  * - 媛?쒕뒗 ?꾨줈?쇳떚 assignedAt 湲곗?: ?대? ?깅줉???덉쑝硫?skip(理쒖큹 ?깅줉 ?쒖젏쨌?깅줉???좎?).
  424:  *   ??? 愿由ы삎?먯꽌 留ㅻ쾲 ??뼱?곕뜕 遺?묒슜(?붽뎄?ы빆 짠4-2) ?댁냼.
  425:  * - assignedAt ? 諛섎뱶??date-only(slice(0,10)) 濡????date ?몃뜳???⑥젙 짠3-3). ISO ?먮낯? assignedAtIso.
  426:  * - coworkers ??湲곗〈 ?꾨줈?쇳떚 ?꾨뱶??merge 濡?蹂댁〈(...prev).
  427:  * - ?깅줉??accountId ??resolver context ?먯꽌 ?쒕쾭媛 痍⑤뱷(?꾨?議?諛⑹?).
  428:  * - 媛쒕퀎 read/write ?ㅽ뙣?대룄 throw ?섏? ?딄퀬 skip 吏묎퀎(?꾩껜 ?ㅽ뙣 ??recorded:0 源뚯? ?덉슜).
  429:  * - (湲곗〈 assignedDateFieldId/assignedByFieldId ?몄옄???꾨줎???명솚???꾪빐 payload 濡?怨꾩냽 ???臾댁떆?쒕떎.)
  430:  * @param issueIds ?깅줉???댁뒋 id 臾몄옄??諛곗뿴
  431:  * @param accountId ?깅줉??accountId (context 痍⑤뱷)
  432:  * @returns {Promise<{recorded: number, skipped: number}>}
  433:  */
  434: export const recordIssueAssignedDateService = async ({issueIds, accountId}) => {
  435:     // 濡쒖쭅 蹂몄껜??AssignedDateRecorder 濡?異붿텧?먮떎(援щ룆 ?몄엯 4寃쎈줈? 媛?쑣톗erge쨌date-only 洹쒖튃????踰뚮줈 怨듭쑀).
  436:     // ??寃쎈줈???뺤콉? 臾대?寃???assignedById 瑜?湲곕줉?섍퀬 assignedVia 留덉빱???곗? ?딅뒗??
  437:     const {recorded, skipped} = await recordAssignedDateOnce({
  438:         issueIds,
  439:         extra: (prev) => ({assignedById: accountId ?? prev?.assignedById ?? null}),
  440:         // ?섎룞 ?깅줉(紐⑤떖 ?ㅼ쨷 ?좏깮)? 諛곗튂 ?곹븳 ??곸씠 ?꾨땲?????붿껌??嫄??꾨? 湲곕줉?쒕떎.
  441:         maxPerRun: Infinity,
  442:         logPrefix: '[recordIssueAssignedDate] fail ??skip',
  443:     });
  444: 
  445:     return {recorded, skipped};  // ?묐떟 shape 遺덈?(capped ???몄텧?섏? ?딅뒗??
  446: };
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-12-    useUpdateSchedule,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-13-    useSetParent,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-14-    useSetLink,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:15:    useUpdateAssignee,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:16:    useUpdateCoworkers,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:17:    useUpdatePlannedMd,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-18-} from './useGanttMutations';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-19-import {
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-20-    useCreateFolder,
--
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-91-    const updateSchedule = useUpdateSchedule({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-92-    const setParent = useSetParent({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-93-    const setLink = useSetLink({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:94:    const updateAssignee = useUpdateAssignee({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:95:    const updateCoworkers = useUpdateCoworkers({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:96:    const updatePlannedMd = useUpdatePlannedMd({ projectId: project_id, toast: batchedToast, hourRate });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-97-    // 폴더 레이어 mutation(앱 DB 전용 → 성공 후 일반 invalidate).
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-98-    const createFolder = useCreateFolder({ projectId: project_id, toast: batchedToast });
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-99-    const renameFolder = useRenameFolder({ projectId: project_id, toast: batchedToast });
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-335-    const closeAssigneeEditor = useCallback(() => setAssigneeTask(null), []);
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-336-    const handleAssigneeSubmit = useCallback(
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-337-        ({ accountIds, users }) => {
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:338:            // 단일: 첫 항목만(미선택=해제). 기존 write 경로 재사용(useUpdateAssignee 는 { issueKey, accountId, assigneeObj }).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-339-            onUpdateAssigneeRef.current?.({
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-340-                issueKey: assigneeTask?.id,
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-341-                accountId: accountIds?.[0] ?? null,
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-352-    const closeCoworkerEditor = useCallback(() => setCoworkerTask(null), []);
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-353-    const handleCoworkerSubmit = useCallback(
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-354-        ({ accountIds, users }) => {
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:355:            // 기존 write 경로 재사용(useUpdateCoworkers 는 { issueId, accountIds, coworkers }).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-356-            onUpdateCoworkersRef.current?.({
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-357-                issueId: coworkerTask?.issueId,
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-358-                accountIds,
--
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-9- *
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-10- * 인라인 편집(InlineEdit) 대신 모달로 통일해 Select 의 행 내 상하 클리핑을 원천 해소.
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-11- * 저장 경로는 기존 write 를 100% 재사용: onSubmit({ accountIds, users }) 만 호출하고
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx:12: * 상위(GanttChart)가 케이스별로 useUpdateAssignee/useUpdateCoworkers 로 흘린다.
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-13- *
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-14- * props:
static/ui/src/pages/projectDetail/gantt\GanttUserModal.jsx-15- *  - isOpen: 표시 여부
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-380-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-381-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-382-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:383: * useUpdateAssignee — 그리드 담당자 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-384- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-385- * 경로: executeRequest('assignIssue', { accountId }, { issueIdOrKey })  (Jira 직접 호출, ProjectIssueTable.assignIssue 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-386- * 전략: useUpdateSchedule 패턴 — 낙관 패치(task.assignee 교체) + onError 롤백. **invalidate 하지 않는다.**
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-395- * mutate 인자: { issueKey, accountId(string|null), assigneeObj }
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-396- *  - assigneeObj: 선택 옵션 value({ accountId, displayName, avatarUrls }) — 낙관 표시용(gantt 계약 assignee shape 로 매핑).
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-397- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:398:export function useUpdateAssignee({ projectId, toast }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-399-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-400-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-401-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-453-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-454-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-455-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:456: * useUpdateCoworkers — 그리드 협업자(다중) 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-457- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-458- * 경로: invoke('updateProjectIdField', { issueId, value:accountIds[], customFieldId })  (ProjectIssueTable.updateCoworker 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-459- *  - customFieldId(coworkerFieldId)는 useGanttData 가 채운 ['coworkerFieldId'] 쿼리 캐시를 공유.
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-469- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-470- * mutate 인자: { issueId, accountIds(string[]), coworkers }  (coworkers=선택 옵션 value 배열, 낙관 표시용)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-471- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:472:export function useUpdateCoworkers({ projectId, toast }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-473-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-474-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-475-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-524-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-525-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-526-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:527: * useUpdatePlannedMd — 그리드 "계획 작업량"(MD) 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-528- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-529- * 경로: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-530- *  - originalEstimate = `${plannedHours(md, hourRate)}h`
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-537- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-538- * mutate 인자: { issueKey, md(number) }
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-539- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:540:export function useUpdatePlannedMd({ projectId, toast, hourRate = 8 }) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-541-    const t = useI18nStore((s) => s.t);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-542-    const queryClient = useQueryClient();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-543-    const rate = hourRate > 0 ? hourRate : 8;
src/resolver/gantt\GanttMapper.js-59-/**
src/resolver/gantt\GanttMapper.js-60- * timetracking 기반 진행률 근사(0~1) — M4 진행률 오버레이 전 임시값.
src/resolver/gantt\GanttMapper.js-61- *  - statusCategory done → 1
src/resolver/gantt\GanttMapper.js:62: *  - originalEstimate 있으면 min(timeSpent/original, 1)
src/resolver/gantt\GanttMapper.js-63- *  - 그 외 null (산출 불가)
src/resolver/gantt\GanttMapper.js-64- */
src/resolver/gantt\GanttMapper.js-65-export const computeProgress = (fields) => {
--
src/resolver/gantt\GanttMapper.js-67-    if (statusKey === 'done') return 1;
src/resolver/gantt\GanttMapper.js-68-
src/resolver/gantt\GanttMapper.js-69-    const tt = fields?.timetracking || {};
src/resolver/gantt\GanttMapper.js:70:    const orig = tt.originalEstimateSeconds;
src/resolver/gantt\GanttMapper.js-71-    const spent = tt.timeSpentSeconds;
src/resolver/gantt\GanttMapper.js-72-    if (orig != null && orig > 0 && spent != null) {
src/resolver/gantt\GanttMapper.js-73-        return Math.round(Math.min(spent / orig, 1) * 100) / 100;
--
src/resolver/gantt\GanttMapper.js-142-        statusCategory,
src/resolver/gantt\GanttMapper.js-143-        coworkers,
src/resolver/gantt\GanttMapper.js-144-        // 그리드 "계획 작업량"(MD) 컬럼 산정 기준(초). progress 막대와 무관한 별도 원시값.
src/resolver/gantt\GanttMapper.js:145:        originalEstimateSeconds: f.timetracking?.originalEstimateSeconds ?? null,
src/resolver/gantt\GanttMapper.js-146-        // 그리드 "처리율"(%) 컬럼 전용 읽기값. 막대 채움용 progress(0~1)와 절대 혼동 금지.
src/resolver/gantt\GanttMapper.js-147-        progressPercent: f.aggregateprogress?.percent ?? null,
src/resolver/gantt\GanttMapper.js-148-        // 내부 계산용(응답 직전 제거): 이 이슈가 관여한 Blocks 링크 간선 후보 [{ source, target }]
--
src/resolver/gantt\__test__\GanttMapper.test.js-60-    test('done → 1', () => {
src/resolver/gantt\__test__\GanttMapper.test.js-61-        expect(computeProgress({ statusCategory: { key: 'done' } })).toBe(1);
src/resolver/gantt\__test__\GanttMapper.test.js-62-    });
src/resolver/gantt\__test__\GanttMapper.test.js:63:    test('originalEstimate 기반 근사', () => {
src/resolver/gantt\__test__\GanttMapper.test.js-64-        expect(computeProgress({
src/resolver/gantt\__test__\GanttMapper.test.js-65-            statusCategory: { key: 'indeterminate' },
src/resolver/gantt\__test__\GanttMapper.test.js:66:            timetracking: { originalEstimateSeconds: 100, timeSpentSeconds: 40 },
src/resolver/gantt\__test__\GanttMapper.test.js-67-        })).toBe(0.4);
src/resolver/gantt\__test__\GanttMapper.test.js-68-    });
src/resolver/gantt\__test__\GanttMapper.test.js-69-    test('spent>original → 1 로 클램프', () => {
src/resolver/gantt\__test__\GanttMapper.test.js-70-        expect(computeProgress({
src/resolver/gantt\__test__\GanttMapper.test.js-71-            statusCategory: { key: 'indeterminate' },
src/resolver/gantt\__test__\GanttMapper.test.js:72:            timetracking: { originalEstimateSeconds: 100, timeSpentSeconds: 250 },
src/resolver/gantt\__test__\GanttMapper.test.js-73-        })).toBe(1);
src/resolver/gantt\__test__\GanttMapper.test.js-74-    });
src/resolver/gantt\__test__\GanttMapper.test.js-75-    test('estimate 없으면 null', () => {
--
src/resolver/gantt\__test__\GanttMapper.test.js-90-                statusCategory: { key: 'indeterminate' },
src/resolver/gantt\__test__\GanttMapper.test.js-91-                assignee: { accountId: 'a1', displayName: 'Tom' },
src/resolver/gantt\__test__\GanttMapper.test.js-92-                parent: { key: 'PROJ-3' },
src/resolver/gantt\__test__\GanttMapper.test.js:93:                timetracking: { originalEstimateSeconds: 28800 },
src/resolver/gantt\__test__\GanttMapper.test.js-94-                aggregateprogress: { percent: 40 },
src/resolver/gantt\__test__\GanttMapper.test.js-95-            },
src/resolver/gantt\__test__\GanttMapper.test.js-96-            properties: { movesRms: { wbsParent: 'PROJ-8' } },
--
src/resolver/gantt\__test__\GanttMapper.test.js-107-        expect(t.wbsParent).toBe('PROJ-8');
src/resolver/gantt\__test__\GanttMapper.test.js-108-        expect(t.assignee).toEqual({ accountId: 'a1', displayName: 'Tom', avatarUrl: null });
src/resolver/gantt\__test__\GanttMapper.test.js-109-        expect(t.statusKey).toBe('indeterminate');
src/resolver/gantt\__test__\GanttMapper.test.js:110:        expect(t.originalEstimateSeconds).toBe(28800);
src/resolver/gantt\__test__\GanttMapper.test.js-111-        expect(t.progressPercent).toBe(40);
src/resolver/gantt\__test__\GanttMapper.test.js-112-    });
src/resolver/gantt\__test__\GanttMapper.test.js-113-
--
src/resolver/gantt\__test__\GanttMapper.test.js-119-        expect(t.wbsParent).toBeNull();
src/resolver/gantt\__test__\GanttMapper.test.js-120-        expect(t.assignee).toBeNull();
src/resolver/gantt\__test__\GanttMapper.test.js-121-        expect(t.issueId).toBeNull();
src/resolver/gantt\__test__\GanttMapper.test.js:122:        expect(t.originalEstimateSeconds).toBeNull();
src/resolver/gantt\__test__\GanttMapper.test.js-123-        expect(t.progressPercent).toBeNull();
src/resolver/gantt\__test__\GanttMapper.test.js-124-    });
src/resolver/gantt\__test__\GanttMapper.test.js-125-});
--
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-194-            endText: task.end ?? '', // 막대 hover 툴팁의 일정 범위 표시용(원본 ISO).
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-195-            // 인라인 편집/신규 컬럼 passthrough (경계면 계약 additive 3필드, 02_backend_report_grid_edit.md):
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-196-            issueId: task.issueId ?? null, // 협업자 write(updateProjectIdField) 용 숫자 Jira id(string)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:197:            originalEstimateSeconds: task.originalEstimateSeconds ?? null, // "계획 작업량"(MD) 산정 기준(초)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-198-            progressPercent: task.progressPercent ?? null, // "처리율"(%) 읽기전용 컬럼
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-199-            wbsParent: task.wbsParent ?? null, // 폴더 드롭 시 WBS 해제 판단용(앱필드 override 존재 여부)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-200-            // 폴더 롤업 계산용(실제 스케줄 Date; 미일정=null). placeholder 위치(svar.start)와 구분. SVAR 는 무시.
--
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-246- *  - 폴더 노드 id = `folder:<uuid>`, type='summary', folder:true. 부모=parentFolderId(있으면 `folder:`).
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-247- *  - 기간 롤업: 가시 자손 이슈(직속 폴더-소속 이슈 + WBS 서브트리 + 하위폴더 subtree)의 실제 스케줄 min~max.
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-248- *  - 수행율(progress 0~100): 자손 leaf 이슈의 MD 가중 평균(Σ(pct×w)/Σw, w=plannedMD, MD 없으면 1).
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:249: *  - 계획MD 합계(originalEstimateSeconds): 자손 leaf 실제 estimate 초 합(없으면 null='-').
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-250- *  - 빈 폴더도 렌더(리더 지시). 단 open 은 렌더 자식(직속 이슈/하위폴더)이 있을 때만 부여
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-251- *    (leaf+open:true → SVAR null.forEach 크래시 방지 — 검증된 규칙).
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-252- */
--
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-340-            let pwSum = 0;
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-341-            let secTotal = 0;
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-342-            for (const leaf of leaves) {
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:343:                const sec = leaf.originalEstimateSeconds;
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-344-                const md = typeof sec === 'number' && sec > 0 ? sec / (rate * 3600) : 0;
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-345-                const w = md > 0 ? md : 1; // MD 없는 leaf 는 1MD 등가(확정 규칙 §6-3)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-346-                const pct = typeof leaf.progressPercent === 'number' ? leaf.progressPercent : 0;
--
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-366-            parent: f.parentFolderId ? folderNodeId(f.parentFolderId) : 0,
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-367-            progress: progress ?? 0, // 막대 채움(0~100)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-368-            progressPercent: progress, // 처리율 컬럼(null → '-')
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:369:            originalEstimateSeconds: secSum, // 계획MD 합계 컬럼(null → '-')
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-370-            key: null,
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-371-            assigneeObj: null,
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-372-            coworkers: [],
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-138-        tk.duration != null ? `${tk.duration}${tr('gantt.durationUnit', 'd')}` : '-';
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-139-    // 계획 작업량(MD) / 처리율(%) — 그리드 컬럼과 동일 산식(passthrough 필드 소비).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-140-    const rate = hourRate > 0 ? hourRate : 8;
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:141:    const plannedMd =
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:142:        tk.originalEstimateSeconds != null
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:143:            ? `${Math.round((tk.originalEstimateSeconds / (rate * 3600)) * 10) / 10} MD`
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-144-            : '-';
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-145-    const progressText = tk.progressPercent != null ? `${tk.progressPercent}%` : '-';
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-146-    const rows = [
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-155-        ],
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-156-        [tr('gantt.tooltip.period', 'Schedule'), period],
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-157-        [tr('gantt.col.duration', 'Duration'), duration],
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:158:        [tr('gantt.col.plannedMd', 'Planned (MD)'), plannedMd],
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-159-        [tr('gantt.col.progress', 'Progress'), progressText],
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-160-    ];
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-161-
--
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-700-            { id: 'startText', header: tr('gantt.col.start', 'Start'), width: 120, align: 'center', resize: true, sort: false, cell: StartCellRender },
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-701-            { id: 'duration', header: tr('gantt.col.duration', 'Duration'), width: 80, align: 'center', resize: true, sort: false, cell: DurationCellRender },
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-702-            // 계획 작업량(MD, 편집)·처리율(%, 읽기전용) — 기간 뒤·상위 지정 앞.
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx:703:            { id: 'plannedMd', header: tr('gantt.col.plannedMd', 'Planned (MD)'), width: 100, align: 'center', resize: true, sort: false, cell: PlannedMdCellRender },
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-704-            { id: 'progressPercent', header: tr('gantt.col.progress', 'Progress'), width: 80, align: 'center', resize: true, sort: false, cell: ProgressCell },
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-705-            // 상위 지정 컬럼은 editable일 때만 노출(무권한이면 컬럼 자체 미표시).
static/ui/src/pages/projectDetail/gantt\GanttChart.jsx-706-            ...(editable
--
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-290-
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-291-    const rate = hourRate > 0 ? hourRate : 8;
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-292-    const md =
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx:293:        row?.originalEstimateSeconds != null
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx:294:            ? Math.round((row.originalEstimateSeconds / (rate * 3600)) * 10) / 10
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-295-            : null;
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-296-
static/ui/src/pages/projectDetail/gantt\GanttGridEditCells.jsx-297-    // 폴더 행(집계 합계) 또는 무권한 → 읽기전용(§4-4: 하위 leaf plannedMD 합계, 편집 불가).
--
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-13- *
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-14- * 집계 대상(호출부가 3번째 인자 `{ batch: <category> }` 로 표시):
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-15- *   schedule(일정) / link(연결) / parent(상위 지정) / issueFolder(폴더 소속) / folderMove(폴더 이동).
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js:16: * 집계 제외(즉시): 그 외 성공 토스트(folderCreated/Renamed/Deleted, assignee/coworker/plannedMd) + **모든 에러**.
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-17- *   → 배처는 `showSuccess(title, desc, meta)` 에서 meta.batch 가 없으면 즉시 통과, showError/showInfo 는 항상 즉시.
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-18- */
static/ui/src/pages/projectDetail/gantt\ganttToastBatcher.js-19-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-34-    };
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-35-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-36-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:37:/** 계획 작업량(MD) → Jira originalEstimate 시간(0.1h 반올림). write 값과 낙관 캐시값의 단일 출처. */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:38:function plannedHours(md, rate) {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-39-    return md > 0 ? Math.round(md * rate * 10) / 10 : 0;
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-40-}
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-41-
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-526-/**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-527- * useUpdatePlannedMd — 그리드 "계획 작업량"(MD) 인라인 편집 write-back.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-528- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:529: * 경로: executeRequest('updateIssue', { fields:{ timetracking:{ originalEstimate } } }, { issueIdOrKey })  (ProjectIssueTable.updatePlannedMD 동일)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:530: *  - originalEstimate = `${plannedHours(md, hourRate)}h`
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:531: * 전략: 낙관 패치(task.originalEstimateSeconds) + onError 롤백. **invalidate 하지 않는다.**
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-532- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-533- * ⚠️ 과거 onSettled invalidate 는 제거했다(2026-08-12) — 셀 편집 1회당 최고비용 resolver 전량 재조회였고,
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-534- *    JQL 재조회는 write 직후 인덱스 지연 위험이 있다(§6). 대신 낙관값을 **실제로 write 하는 시간값**에서
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:535: *    역산해(plannedHours) 캐시와 서버 상태가 어긋나지 않게 한다 — 이것이 옛 invalidate 의 역할이었다.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-536- *    (처리율/aggregate 파생값은 서버 재계산이라 다음 자연 재조회에서 따라온다.)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-537- *
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-538- * mutate 인자: { issueKey, md(number) }
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-548-            // 실제 400(timetracking) 실패를 onError 에서 안내로 매핑.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-549-            const perms = await fetchJiraProjectPermissions(projectKeyOfIssue(issueKey));
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-550-            if (perms.canEditIssues === false) throw jiraPermissionError();
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:551:            const originalEstimate = `${plannedHours(md, rate)}h`;
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-552-            // 기존 remaining 조회 후 함께 전송 — 수정 시 remaining 미동봉이면 Jira 검증 400
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-553-            // (Task 에는 remaining 이 없어 단건 GET 1회. buildTimetrackingPayload 참조)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-554-            const cur = await executeRequest('getIssue', { fields: 'timetracking' }, { issueIdOrKey: issueKey });
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-555-            const remainingSeconds = cur?.fields?.timetracking?.remainingEstimateSeconds ?? null;
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-556-            const result = await executeRequest(
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-557-                'updateIssue',
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:558:                { fields: { timetracking: buildTimetrackingPayload(originalEstimate, remainingSeconds) } },
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-559-                { issueIdOrKey: issueKey }
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-560-            );
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-561-            if (result && result.success === false) {
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-570-            await queryClient.cancelQueries({ queryKey: ganttKeys.data(projectId) });
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-571-            const prev = queryClient.getQueryData(ganttKeys.data(projectId));
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-572-            // 낙관값은 write 하는 시간값(0.1h 반올림)에서 역산 — 캐시가 서버 저장값과 같은 수를 갖는다.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:573:            const seconds = Math.round(plannedHours(md, rate) * 3600);
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-574-            queryClient.setQueryData(ganttKeys.data(projectId), (old) =>
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:575:                patchTask(old, issueKey, { originalEstimateSeconds: seconds })
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-576-            );
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-577-            return { prev };
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-578-        },
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-579-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-580-        onSuccess: () => {
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:581:            toast?.showSuccess?.(t('common.toast.title.success'), t('gantt.toast.plannedMdSaved'));
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-582-        },
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-583-
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-584-        onError: (err, _vars, ctx) => {

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/projectDetail/gantt/GanttGridEditCells.jsx' 260 360; Show-Range 'static/ui/src/pages/projectDetail/gantt/GanttChart.jsx' 320 385; Show-Range 'static/ui/src/pages/projectDetail/gantt/GanttPage.jsx' 70 125; rg -n -C 2 \"function buildTimetrackingPayload|const buildTimetrackingPayload|originalEstimate\" static/ui/src/utils/jiraApi/useJiraEditGuards.js src/api/jira src/resolver -g '*.js' | Select-Object -First 200" in C:\CloudJira\moves-workforce
 succeeded in 1758ms:

--- static/ui/src/pages/projectDetail/gantt/GanttGridEditCells.jsx:260-360 ---
  260:                     type="number"
  261:                     min="1"
  262:                     value={value}
  263:                     onWheel={(e) => e.target.blur()}
  264:                     onChange={(e) => setValue(e.target.value)}
  265:                     onKeyDown={(e) => {
  266:                         if (e.key === 'Enter') {
  267:                             e.preventDefault();
  268:                             commit();
  269:                         } else if (e.key === 'Escape') {
  270:                             e.preventDefault();
  271:                             setEditing(false);
  272:                         }
  273:                     }}
  274:                 />
  275:             ) : (
  276:                 <div style={{ cursor: 'pointer' }} onClick={enterEdit}>
  277:                     {readText}
  278:                 </div>
  279:             )}
  280:         </div>
  281:     );
  282: }
  283: 
  284: /** 怨꾪쉷 ?묒뾽??MD) ??`${md} MD` ??Textfield(number, step 0.5, min 0). md=珥?(hourRate*3600). */
  285: export function PlannedMdCell({ row, editable, hourRate, onSave, t }) {
  286:     const wrapRef = useRef(null);
  287:     const [editing, setEditing] = useState(false);
  288:     const [value, setValue] = useState('');
  289:     useOutsideCancel(editing, wrapRef, () => setEditing(false));
  290: 
  291:     const rate = hourRate > 0 ? hourRate : 8;
  292:     const md =
  293:         row?.originalEstimateSeconds != null
  294:             ? Math.round((row.originalEstimateSeconds / (rate * 3600)) * 10) / 10
  295:             : null;
  296: 
  297:     // ?대뜑 ??吏묎퀎 ?⑷퀎) ?먮뒗 臾닿텒?????쎄린?꾩슜(짠4-4: ?섏쐞 leaf plannedMD ?⑷퀎, ?몄쭛 遺덇?).
  298:     if (!editable || row?.folder) return <CellWrap>{<span>{md != null ? `${md} MD` : '-'}</span>}</CellWrap>;
  299: 
  300:     const enterEdit = () => {
  301:         setValue(md != null ? String(md) : '');
  302:         setEditing(true);
  303:     };
  304:     const commit = () => {
  305:         setEditing(false);
  306:         const n = parseFloat(value);
  307:         const next = Number.isNaN(n) ? 0 : n;
  308:         if (next !== md) onSave?.({ issueKey: row.key, md: next });
  309:     };
  310: 
  311:     return (
  312:         <div
  313:             ref={wrapRef}
  314:             className="gantt-edit-cell"
  315:             style={{ width: '100%' }}
  316:             onClick={stop}
  317:             onMouseDown={stop}
  318:         >
  319:             {editing ? (
  320:                 <Textfield
  321:                     autoFocus
  322:                     autoComplete="off"
  323:                     inputMode="decimal"
  324:                     type="number"
  325:                     min="0"
  326:                     step="0.5"
  327:                     value={value}
  328:                     onWheel={(e) => e.target.blur()}
  329:                     onChange={(e) => setValue(e.target.value)}
  330:                     onKeyDown={(e) => {
  331:                         if (e.key === 'Enter') {
  332:                             e.preventDefault();
  333:                             commit();
  334:                         } else if (e.key === 'Escape') {
  335:                             e.preventDefault();
  336:                             setEditing(false);
  337:                         }
  338:                     }}
  339:                     elemAfterInput={
  340:                         <span style={{ fontSize: 12, color: '#6B7280', paddingRight: 6 }}>MD</span>
  341:                     }
  342:                 />
  343:             ) : (
  344:                 <div style={{ cursor: 'pointer' }} onClick={enterEdit}>
  345:                     {md != null ? `${md} MD` : '-'}
  346:                 </div>
  347:             )}
  348:         </div>
  349:     );
  350: }
  351: 
  352: /** 泥섎━??%) ???쎄린?꾩슜. progressPercent(0~100, aggregateprogress.percent). null='-'. */
  353: export function ProgressCell({ row }) {
  354:     return <span>{row?.progressPercent != null ? `${row.progressPercent}%` : '-'}</span>;
  355: }

--- static/ui/src/pages/projectDetail/gantt/GanttChart.jsx:320-385 ---
  320:     }, []);
  321: 
  322:     // ?? ?곸쐞 吏??紐⑤떖(紐낆떆??UI ???쒕옒洹??泥??뺤떎 寃쎈줈) ??
  323:     // ?쒕옒洹?move-task) ????됰퀎 "?곸쐞 吏?? 踰꾪듉 ??紐⑤떖?먯꽌 遺紐??좏깮/?댁젣 ??onSetParent ?ъ궗??
  324:     const [parentTask, setParentTask] = useState(null);
  325:     const openParentEditor = useCallback((row) => setParentTask(row), []);
  326:     const closeParentEditor = useCallback(() => setParentTask(null), []);
  327:     const handleParentSubmit = useCallback(({ issueKey, parentKey }) => {
  328:         onSetParentRef.current?.({ issueKey, parentKey });
  329:         setParentTask(null);
  330:     }, []);
  331: 
  332:     // ?? ?대떦??吏??紐⑤떖(?몃씪??Select ?쒓굅 ???묒뾽?먯? ?듭씪) ??
  333:     const [assigneeTask, setAssigneeTask] = useState(null);
  334:     const openAssigneeEditor = useCallback((row) => setAssigneeTask(row), []);
  335:     const closeAssigneeEditor = useCallback(() => setAssigneeTask(null), []);
  336:     const handleAssigneeSubmit = useCallback(
  337:         ({ accountIds, users }) => {
  338:             // ?⑥씪: 泥???ぉ留?誘몄꽑???댁젣). 湲곗〈 write 寃쎈줈 ?ъ궗??useUpdateAssignee ??{ issueKey, accountId, assigneeObj }).
  339:             onUpdateAssigneeRef.current?.({
  340:                 issueKey: assigneeTask?.id,
  341:                 accountId: accountIds?.[0] ?? null,
  342:                 assigneeObj: users?.[0] ?? null,
  343:             });
  344:             setAssigneeTask(null);
  345:         },
  346:         [assigneeTask]
  347:     );
  348: 
  349:     // ?? ?묒뾽??吏??紐⑤떖(?몃씪??Select ?대━???뚰뵾 ??紐⑤떖濡?遺꾨━) ??
  350:     const [coworkerTask, setCoworkerTask] = useState(null);
  351:     const openCoworkerEditor = useCallback((row) => setCoworkerTask(row), []);
  352:     const closeCoworkerEditor = useCallback(() => setCoworkerTask(null), []);
  353:     const handleCoworkerSubmit = useCallback(
  354:         ({ accountIds, users }) => {
  355:             // 湲곗〈 write 寃쎈줈 ?ъ궗??useUpdateCoworkers ??{ issueId, accountIds, coworkers }).
  356:             onUpdateCoworkersRef.current?.({
  357:                 issueId: coworkerTask?.issueId,
  358:                 accountIds,
  359:                 coworkers: users,
  360:             });
  361:             setCoworkerTask(null);
  362:         },
  363:         [coworkerTask]
  364:     );
  365: 
  366:     // ?? 而ㅼ뒪? ?몃줈???ㅻ쾭?덉씠 (R1 ?泥? ??
  367:     // SVAR 臾대즺鍮뚮뱶??markers(?몃줈??瑜??뚮뜑?섏? ?딆쑝誘濡?PRO ?꾩슜), 李⑦듃 ?꾩뿉 吏곸젒 洹몃┛??
  368:     // apiRef: init(api) 濡?諛쏆? SVAR api(getState 濡?_scales/cellWidth/scrollLeft ?몄텧).
  369:     const hostRef = useRef(null);
  370:     const apiRef = useRef(null);
  371:     const overlayInnerRef = useRef(null);
  372:     const [overlayBox, setOverlayBox] = useState(null); // { left, top, width, height }
  373:     const [overlayLines, setOverlayLines] = useState([]); // [{ key, x, css, text }]
  374: 
  375:     // ?? ?숈쟻 ?몄뒪???믪씠 (?쇰뱶諛? ?섎떒 ?섎┝) ??
  376:     // 怨좎젙 640 ???酉고룷???섎떒源뚯? 梨꾩슫?? height = max(400, innerHeight - hostTop - HOST_BOTTOM_RESERVE).
  377:     // ?좑툘 ???믪씠媛 ?ㅼ젣濡?癒뱀쑝?ㅻ㈃ gantt.css ??`.gantt-svar-host > .wx-theme{height:100%}` 媛 ?꾩슂?섎떎
  378:     //    (SVAR ?뚮쭏 ?섑띁媛 ?믪씠 泥댁씤???딅뒗????洹?洹쒖튃 ?놁씠???ш린??萸?怨꾩궛?섎뱺 臾댁떆?쒕떎).
  379:     const [hostHeight, setHostHeight] = useState(640);
  380: 
  381:     // ?? ?몃━ ?묎린/?쇱튂湲?open) ?곹깭 蹂댁〈 ??
  382:     // ?대뙌?곕뒗 留??뚮뜑 summary ??open:true 瑜?媛뺤젣?섎?濡? ?ъ“?????ъ슜?먭? ?묒? ?곹깭媛 ?由곕떎.
  383:     // SVAR open-task ?대깽??{id, mode})瑜?ref ??湲곕줉?대몢怨? tasks ?ш퀎????洹?媛믪쑝濡???뼱???묎린 ?좎?.
  384:     // (泥?濡쒕뱶 = 湲곕줉 ?놁쓬 ???대뙌?곗쓽 珥덇린 open:true 議댁쨷 = ?쇱묠. leaf ??open 誘몃??ъ씠誘濡?嫄대뱶由ъ? ?딆쓬.)
  385:     const openStateRef = useRef(new Map());

--- static/ui/src/pages/projectDetail/gantt/GanttPage.jsx:70-125 ---
   70:             else next.add(key);
   71:             return next;
   72:         });
   73:     }, []);
   74:     const onProjectToggle = filter?.onProjectToggle ?? toggleLocalProject;
   75:     const onProjectClear = filter?.onProjectClear ?? (() => setLocalProjectKeys(new Set()));
   76: 
   77:     // settings ??hourRate (怨꾪쉷 ?묒뾽??MD ?섏궛 湲곗?. ?묐떟? content ?섑븨 ?놁씠 猷⑦듃 吏곸젒).
   78:     const { data: settingData } = useQuery({
   79:         queryKey: settingKeys.detail(),
   80:         queryFn: async () => await invoke('getSettingData'),
   81:         staleTime: 1000 * 60 * 30,
   82:     });
   83:     const hourRate = settingData?.hourRate || 8;
   84: 
   85:     const { tasks, links, meta, folders, folderIssues, folderLinks, isLoading, isError } =
   86:         useGanttData(project_id);
   87:     // ???깃났 ?좎뒪???붾컮?댁뒪 吏묎퀎(2026-07-07): ?쒕옒洹몄꽦 ?곕컻 ?깃났 ?뚮┝留?2.5珥?紐⑥븘 1嫄댁쑝濡?flush.
   88:     //   mutation ?낅뱾???먮낯 toast ???諛곗쿂瑜??대젮以??吏묎퀎 ??곸? 3踰덉㎏ ?몄옄 { batch } 濡??쒖떆,
   89:     //   洹????먮윭??利됱떆 ?듦낵). ?먮낯 toast(FlagUI)쨌ToastFlags ?숈옉? 臾대?寃?
   90:     const batchedToast = useGanttToastBatcher(toast);
   91:     const updateSchedule = useUpdateSchedule({ projectId: project_id, toast: batchedToast });
   92:     const setParent = useSetParent({ projectId: project_id, toast: batchedToast });
   93:     const setLink = useSetLink({ projectId: project_id, toast: batchedToast });
   94:     const updateAssignee = useUpdateAssignee({ projectId: project_id, toast: batchedToast });
   95:     const updateCoworkers = useUpdateCoworkers({ projectId: project_id, toast: batchedToast });
   96:     const updatePlannedMd = useUpdatePlannedMd({ projectId: project_id, toast: batchedToast, hourRate });
   97:     // ?대뜑 ?덉씠??mutation(??DB ?꾩슜 ???깃났 ???쇰컲 invalidate).
   98:     const createFolder = useCreateFolder({ projectId: project_id, toast: batchedToast });
   99:     const renameFolder = useRenameFolder({ projectId: project_id, toast: batchedToast });
  100:     const moveFolder = useMoveFolder({ projectId: project_id, toast: batchedToast });
  101:     const deleteFolder = useDeleteFolder({ projectId: project_id, toast: batchedToast });
  102:     const setIssueFolder = useSetIssueFolder({ projectId: project_id, toast: batchedToast });
  103:     // ?대뜑 ?좏썑??FS) 留곹겕 ?앹꽦/??젣(R2 ???숆? ?⑥튂 content.folderLinks, invalidate 湲덉?).
  104:     const setFolderLink = useSetFolderLink({ projectId: project_id, toast: batchedToast });
  105: 
  106:     // ?대뜑 紐⑤떖 ?곹깭(GanttPage 媛 ?뚯쑀 ???대컮/李⑦듃 ?묒そ 吏꾩엯?먯쓣 ??怨녹뿉???뚮뜑).
  107:     //  nameModal: { mode:'create'|'addChild'|'rename', parentFolderId?, folderId?, initialName? }
  108:     const [nameModal, setNameModal] = useState(null);
  109:     const [assignModal, setAssignModal] = useState(null); // issue row task
  110:     const [moveModal, setMoveModal] = useState(null); // { folderId, name, parentFolderId }
  111:     const [deleteModal, setDeleteModal] = useState(null); // { folderId, name }
  112: 
  113:     // ?ㅻ뒛 + ?꾨줈?앺듃 ?쒖옉/醫낅즺 ?몃줈 留덉빱 (??SVAR markers)
  114:     const markers = useMemo(() => {
  115:         const list = [];
  116:         // ?ㅻ뒛 (濡쒖뺄 ?먯젙) ???붾㈃ 以묒븰沅뚯씠??媛????蹂댁씠??湲곗???
  117:         const now = new Date();
  118:         const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  119:         list.push({ start: today, text: t('gantt.marker.today'), css: 'gantt-marker-today' });
  120: 
  121:         const s = parseISODate(meta?.projectStart);
  122:         const e = parseISODate(meta?.projectEnd);
  123:         if (s) {
  124:             list.push({
  125:                 start: s,
static/ui/src/utils/jiraApi/useJiraEditGuards.js-94-/**
static/ui/src/utils/jiraApi/useJiraEditGuards.js-95- * 계획 공수 저장용 timetracking 페이로드.
static/ui/src/utils/jiraApi/useJiraEditGuards.js:96: * ⚠️ remaining/worklog 가 이미 있는 이슈에 originalEstimate 만 보내면 Jira 가
static/ui/src/utils/jiraApi/useJiraEditGuards.js-97- *    "timetracking_remainingestimate" 검증 400 을 낸다(실측 — 최초 입력만 성공하고 수정은 실패하는 원인).
static/ui/src/utils/jiraApi/useJiraEditGuards.js-98- *    기존 remainingEstimateSeconds 를 분 단위로 함께 보내 기존 잔여치를 보존한다(Jira UI 동작과 동일).
static/ui/src/utils/jiraApi/useJiraEditGuards.js-99- */
static/ui/src/utils/jiraApi/useJiraEditGuards.js:100:export const buildTimetrackingPayload = (originalEstimate, remainingEstimateSeconds) => {
static/ui/src/utils/jiraApi/useJiraEditGuards.js:101:    const timetracking = { originalEstimate };
static/ui/src/utils/jiraApi/useJiraEditGuards.js-102-    if (remainingEstimateSeconds != null) {
static/ui/src/utils/jiraApi/useJiraEditGuards.js-103-        timetracking.remainingEstimate = `${Math.round(remainingEstimateSeconds / 60)}m`;
--
src/resolver\issueAnalysis\IssueAnalysisService.js-52-
src/resolver\issueAnalysis\IssueAnalysisService.js-53-    const issues = rawIssues.map(issue => {
src/resolver\issueAnalysis\IssueAnalysisService.js:54:        const originalEstimateSeconds = issue.fields.timetracking?.originalEstimateSeconds ?? null;
src/resolver\issueAnalysis\IssueAnalysisService.js-55-        // Jira가 워크로그 합산을 자동으로 timeSpentSeconds 에 유지해 줌
src/resolver\issueAnalysis\IssueAnalysisService.js-56-        const timeSpentSeconds = issue.fields.timetracking?.timeSpentSeconds ?? 0;
src/resolver\issueAnalysis\IssueAnalysisService.js-57-
src/resolver\issueAnalysis\IssueAnalysisService.js:58:        const plannedMd = originalEstimateSeconds != null
src/resolver\issueAnalysis\IssueAnalysisService.js:59:            ? Math.round(originalEstimateSeconds / (hourRate * 3600) * 10) / 10
src/resolver\issueAnalysis\IssueAnalysisService.js-60-            : null;
src/resolver\issueAnalysis\IssueAnalysisService.js-61-        const actualMd = Math.round(timeSpentSeconds / (hourRate * 3600) * 10) / 10;
--
src/resolver\issueAnalysis\IssueAnalysisService.js-98-            actualMd,
src/resolver\issueAnalysis\IssueAnalysisService.js-99-            estimatedEndDate,
src/resolver\issueAnalysis\IssueAnalysisService.js:100:            originalEstimateSeconds,
src/resolver\issueAnalysis\IssueAnalysisService.js-101-            timeSpentSeconds,
src/resolver\issueAnalysis\IssueAnalysisService.js-102-        };
--
src/resolver\issueAnalysis\IssueAnalysisService.js-195-
src/resolver\issueAnalysis\IssueAnalysisService.js-196-    const rows = allIssues.map(issue => {
src/resolver\issueAnalysis\IssueAnalysisService.js:197:        const originalEstimateSeconds = issue.fields.timetracking?.originalEstimateSeconds ?? null;
src/resolver\issueAnalysis\IssueAnalysisService.js-198-        const timeSpentSeconds = issue.fields.timetracking?.timeSpentSeconds ?? 0;
src/resolver\issueAnalysis\IssueAnalysisService.js-199-
src/resolver\issueAnalysis\IssueAnalysisService.js:200:        const plannedMd = originalEstimateSeconds != null
src/resolver\issueAnalysis\IssueAnalysisService.js:201:            ? Math.round(originalEstimateSeconds / (hourRate * 3600) * 10) / 10
src/resolver\issueAnalysis\IssueAnalysisService.js-202-            : null;
src/resolver\issueAnalysis\IssueAnalysisService.js-203-        const actualMd = Math.round(timeSpentSeconds / (hourRate * 3600) * 10) / 10;
--
src/resolver\gantt\GanttMapper.js-60- * timetracking 기반 진행률 근사(0~1) — M4 진행률 오버레이 전 임시값.
src/resolver\gantt\GanttMapper.js-61- *  - statusCategory done → 1
src/resolver\gantt\GanttMapper.js:62: *  - originalEstimate 있으면 min(timeSpent/original, 1)
src/resolver\gantt\GanttMapper.js-63- *  - 그 외 null (산출 불가)
src/resolver\gantt\GanttMapper.js-64- */
--
src/resolver\gantt\GanttMapper.js-68-
src/resolver\gantt\GanttMapper.js-69-    const tt = fields?.timetracking || {};
src/resolver\gantt\GanttMapper.js:70:    const orig = tt.originalEstimateSeconds;
src/resolver\gantt\GanttMapper.js-71-    const spent = tt.timeSpentSeconds;
src/resolver\gantt\GanttMapper.js-72-    if (orig != null && orig > 0 && spent != null) {
--
src/resolver\gantt\GanttMapper.js-143-        coworkers,
src/resolver\gantt\GanttMapper.js-144-        // 그리드 "계획 작업량"(MD) 컬럼 산정 기준(초). progress 막대와 무관한 별도 원시값.
src/resolver\gantt\GanttMapper.js:145:        originalEstimateSeconds: f.timetracking?.originalEstimateSeconds ?? null,
src/resolver\gantt\GanttMapper.js-146-        // 그리드 "처리율"(%) 컬럼 전용 읽기값. 막대 채움용 progress(0~1)와 절대 혼동 금지.
src/resolver\gantt\GanttMapper.js-147-        progressPercent: f.aggregateprogress?.percent ?? null,
--
src/resolver\gantt\__test__\GanttMapper.test.js-61-        expect(computeProgress({ statusCategory: { key: 'done' } })).toBe(1);
src/resolver\gantt\__test__\GanttMapper.test.js-62-    });
src/resolver\gantt\__test__\GanttMapper.test.js:63:    test('originalEstimate 기반 근사', () => {
src/resolver\gantt\__test__\GanttMapper.test.js-64-        expect(computeProgress({
src/resolver\gantt\__test__\GanttMapper.test.js-65-            statusCategory: { key: 'indeterminate' },
src/resolver\gantt\__test__\GanttMapper.test.js:66:            timetracking: { originalEstimateSeconds: 100, timeSpentSeconds: 40 },
src/resolver\gantt\__test__\GanttMapper.test.js-67-        })).toBe(0.4);
src/resolver\gantt\__test__\GanttMapper.test.js-68-    });
--
src/resolver\gantt\__test__\GanttMapper.test.js-70-        expect(computeProgress({
src/resolver\gantt\__test__\GanttMapper.test.js-71-            statusCategory: { key: 'indeterminate' },
src/resolver\gantt\__test__\GanttMapper.test.js:72:            timetracking: { originalEstimateSeconds: 100, timeSpentSeconds: 250 },
src/resolver\gantt\__test__\GanttMapper.test.js-73-        })).toBe(1);
src/resolver\gantt\__test__\GanttMapper.test.js-74-    });
--
src/resolver\gantt\__test__\GanttMapper.test.js-91-                assignee: { accountId: 'a1', displayName: 'Tom' },
src/resolver\gantt\__test__\GanttMapper.test.js-92-                parent: { key: 'PROJ-3' },
src/resolver\gantt\__test__\GanttMapper.test.js:93:                timetracking: { originalEstimateSeconds: 28800 },
src/resolver\gantt\__test__\GanttMapper.test.js-94-                aggregateprogress: { percent: 40 },
src/resolver\gantt\__test__\GanttMapper.test.js-95-            },
--
src/resolver\gantt\__test__\GanttMapper.test.js-108-        expect(t.assignee).toEqual({ accountId: 'a1', displayName: 'Tom', avatarUrl: null });
src/resolver\gantt\__test__\GanttMapper.test.js-109-        expect(t.statusKey).toBe('indeterminate');
src/resolver\gantt\__test__\GanttMapper.test.js:110:        expect(t.originalEstimateSeconds).toBe(28800);
src/resolver\gantt\__test__\GanttMapper.test.js-111-        expect(t.progressPercent).toBe(40);
src/resolver\gantt\__test__\GanttMapper.test.js-112-    });
--
src/resolver\gantt\__test__\GanttMapper.test.js-120-        expect(t.assignee).toBeNull();
src/resolver\gantt\__test__\GanttMapper.test.js-121-        expect(t.issueId).toBeNull();
src/resolver\gantt\__test__\GanttMapper.test.js:122:        expect(t.originalEstimateSeconds).toBeNull();
src/resolver\gantt\__test__\GanttMapper.test.js-123-        expect(t.progressPercent).toBeNull();
src/resolver\gantt\__test__\GanttMapper.test.js-124-    });
--
src/resolver\projectProgress\__test__\ProgressCalculator.test.js-22-        statusCategory: { key: statusKey, name: statusKey },
src/resolver\projectProgress\__test__\ProgressCalculator.test.js-23-        timetracking: {
src/resolver\projectProgress\__test__\ProgressCalculator.test.js:24:            originalEstimateSeconds: plannedSeconds,
src/resolver\projectProgress\__test__\ProgressCalculator.test.js-25-            timeSpentSeconds: actualSeconds ?? 0,
src/resolver\projectProgress\__test__\ProgressCalculator.test.js-26-        },
--
src/resolver\projectProgress\ProgressCalculator.js-11-/**
src/resolver\projectProgress\ProgressCalculator.js-12- * 이슈 단위 정규화. (MD 변환은 하지 않고 초 단위 유지 — #8 누적오차 방지)
src/resolver\projectProgress\ProgressCalculator.js:13: * - plannedSeconds: originalEstimateSeconds (null 가능)
src/resolver\projectProgress\ProgressCalculator.js-14- * - actualSeconds : timeSpentSeconds (Jira가 워크로그 합산 자동 유지)
src/resolver\projectProgress\ProgressCalculator.js-15- * - statusKey     : statusCategory.key (new/indeterminate/done)
--
src/resolver\projectProgress\ProgressCalculator.js-17-export const normalizeIssue = (issue) => {
src/resolver\projectProgress\ProgressCalculator.js-18-    const f = issue.fields || {};
src/resolver\projectProgress\ProgressCalculator.js:19:    const plannedSeconds = f.timetracking?.originalEstimateSeconds ?? null;
src/resolver\projectProgress\ProgressCalculator.js-20-    const actualSeconds = f.timetracking?.timeSpentSeconds ?? 0;
src/resolver\projectProgress\ProgressCalculator.js-21-    const statusKey = f.statusCategory?.key ?? f.status?.statusCategory?.key ?? null;
--
src/resolver\projectSubscription\DefaultEstimateApplier.js-3- *
src/resolver\projectSubscription\DefaultEstimateApplier.js-4- * ── 왜 Jira 필드에 쓰는가 ─────────────────────────────────────────────────
src/resolver\projectSubscription\DefaultEstimateApplier.js:5: * 진척률·MM 계산이 이미 `timetracking.originalEstimate` 를 읽는다. 앱 전용 값으로 두면
src/resolver\projectSubscription\DefaultEstimateApplier.js-6- * 계산 경로를 전부 고쳐야 하고, 정작 Jira 화면에서는 여전히 비어 보인다.
src/resolver\projectSubscription\DefaultEstimateApplier.js-7- *
src/resolver\projectSubscription\DefaultEstimateApplier.js-8- * ── 절대 덮어쓰지 않는다 ──────────────────────────────────────────────────
src/resolver\projectSubscription\DefaultEstimateApplier.js-9- * 사람이 넣은 추정치를 앱이 갈아엎으면 안 된다. **값이 없는 이슈만** 대상이다.
src/resolver\projectSubscription\DefaultEstimateApplier.js:10: * 판정은 추측하지 않고 이슈를 다시 읽어 확인한다(`originalEstimateSeconds` 존재 여부).
src/resolver\projectSubscription\DefaultEstimateApplier.js-11- *
src/resolver\projectSubscription\DefaultEstimateApplier.js-12- * ── 실패는 비치명 ─────────────────────────────────────────────────────────
--
src/resolver\projectSubscription\DefaultEstimateApplier.js-58-
src/resolver\projectSubscription\DefaultEstimateApplier.js-59-        const chunk = ids.slice(i, i + 50);
src/resolver\projectSubscription\DefaultEstimateApplier.js:60:        const jql = `id in (${chunk.join(',')}) AND originalEstimate IS EMPTY`;
src/resolver\projectSubscription\DefaultEstimateApplier.js-61-
src/resolver\projectSubscription\DefaultEstimateApplier.js-62-        const data = await requestJiraJson({
--
src/resolver\projectSubscription\DefaultEstimateApplier.js-106-                as: 'app',
src/resolver\projectSubscription\DefaultEstimateApplier.js-107-                url: route`/rest/api/3/issue/${issueId}`,
src/resolver\projectSubscription\DefaultEstimateApplier.js:108:                body: { fields: { timetracking: { originalEstimate: duration } } },
src/resolver\projectSubscription\DefaultEstimateApplier.js-109-                logPrefix: '[SUBSCRIPTION ESTIMATE]',
src/resolver\projectSubscription\DefaultEstimateApplier.js-110-            });
--
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-79-        coworkers: [],
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-80-        dueDate: null,
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js:81:        originalEstimateSeconds: 3600,
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-82-        remainingEstimateSeconds: 3600,
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-83-    };
--
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-116-    test('추정·잔여 모두 0 → NO_ESTIMATE', () => {
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-117-        const flags = computeQueueFlags(
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js:118:            { ...base, originalEstimateSeconds: 0, remainingEstimateSeconds: 0 }, opts);
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-119-        expect(flags).toContain('NO_ESTIMATE');
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-120-    });
--
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-122-    test('잔여만 0(추정 있음) → NO_ESTIMATE 아님', () => {
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-123-        const flags = computeQueueFlags(
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js:124:            { ...base, originalEstimateSeconds: 3600, remainingEstimateSeconds: 0 }, opts);
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-125-        expect(flags).not.toContain('NO_ESTIMATE');
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-126-    });
--
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-131-            coworkers: [],
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-132-            dueDate: '2026-07-01',
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js:133:            originalEstimateSeconds: 0,
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-134-            remainingEstimateSeconds: 0,
src/resolver\workAssignment\__test__\WorkAssignmentRules.test.js-135-        }, opts);
--
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-112-        statusCategoryKey: f.statusCategory?.key ?? f.status?.statusCategory?.key ?? null,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-113-        dueDate: f.duedate ?? null,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js:114:        originalEstimateSeconds: tt.originalEstimateSeconds ?? 0,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-115-        remainingEstimateSeconds: tt.remainingEstimateSeconds ?? 0,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-116-        timeSpentSeconds: tt.timeSpentSeconds ?? 0,
--
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-154-        statusCategoryKey: n.statusCategoryKey,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-155-        dueDate: n.dueDate,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js:156:        originalEstimateSeconds: n.originalEstimateSeconds,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-157-        remainingEstimateSeconds: n.remainingEstimateSeconds,
src/resolver\workAssignment\WorkAssignmentIssueFetcher.js-158-        timeSpentSeconds: n.timeSpentSeconds,
--
src/resolver\workAssignment\AssignmentMetricsFetcher.js-47-        }
src/resolver\workAssignment\AssignmentMetricsFetcher.js-48-        const n = normalizeIssue(issue);
src/resolver\workAssignment\AssignmentMetricsFetcher.js:49:        // computeQueueFlags 는 { assignee, coworkers, dueDate, originalEstimateSeconds,
src/resolver\workAssignment\AssignmentMetricsFetcher.js-50-        //   remainingEstimateSeconds } 를 본다. NO_ESTIMATE 는 카드 지표에서 세지 않는다.
src/resolver\workAssignment\AssignmentMetricsFetcher.js-51-        const flags = computeQueueFlags(
--
src/resolver\workAssignment\AssignmentMetricsFetcher.js-54-                coworkers: n.coworkerAccountIds,
src/resolver\workAssignment\AssignmentMetricsFetcher.js-55-                dueDate: n.dueDate,
src/resolver\workAssignment\AssignmentMetricsFetcher.js:56:                originalEstimateSeconds: n.originalEstimateSeconds,
src/resolver\workAssignment\AssignmentMetricsFetcher.js-57-                remainingEstimateSeconds: n.remainingEstimateSeconds,
src/resolver\workAssignment\AssignmentMetricsFetcher.js-58-            },
--
src/resolver\workAssignment\WorkAssignmentRules.js-53- *   OVERDUE    : dueDate != null AND dueDate < todayYmd
src/resolver\workAssignment\WorkAssignmentRules.js-54- *   DUE_SOON   : dueDate != null AND todayYmd <= dueDate <= todayYmd + dueSoonDays
src/resolver\workAssignment\WorkAssignmentRules.js:55: *   NO_ESTIMATE: originalEstimateSeconds === 0 AND remainingEstimateSeconds === 0
src/resolver\workAssignment\WorkAssignmentRules.js-56- *
src/resolver\workAssignment\WorkAssignmentRules.js-57- * @param {{assignee:Object|null, coworkers:Array, dueDate:string|null,
src/resolver\workAssignment\WorkAssignmentRules.js:58: *          originalEstimateSeconds:number, remainingEstimateSeconds:number}} item
src/resolver\workAssignment\WorkAssignmentRules.js-59- * @param {{todayYmd:string, dueSoonDays:number}} opts
src/resolver\workAssignment\WorkAssignmentRules.js-60- * @returns {string[]} ['UNASSIGNED'|'OVERDUE'|'DUE_SOON'|'NO_ESTIMATE']
--
src/resolver\workAssignment\WorkAssignmentRules.js-77-    }
src/resolver\workAssignment\WorkAssignmentRules.js-78-
src/resolver\workAssignment\WorkAssignmentRules.js:79:    if ((item.originalEstimateSeconds ?? 0) === 0 && (item.remainingEstimateSeconds ?? 0) === 0) {
src/resolver\workAssignment\WorkAssignmentRules.js-80-        flags.push('NO_ESTIMATE');
src/resolver\workAssignment\WorkAssignmentRules.js-81-    }

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "rg -n --glob '*test*' --glob '*.test.*' \"useGanttMutations|plannedHours|useUpdatePlannedMd|coworkerSaved|assigneeSaved\" static/ui/src; Get-Content 'static/ui/package.json'; Get-Content 'package.json'" in C:\CloudJira\moves-workforce
 succeeded in 1569ms:
{
  "name": "jira-global-page-custom-ui-static",
  "version": "0.1.62",
  "private": true,
  "homepage": ".",
  "dependencies": {
    "@atlaskit/avatar": "^25.7.3",
    "@atlaskit/badge": "^18.4.0",
    "@atlaskit/banner": "^14.0.26",
    "@atlaskit/breadcrumbs": "^15.3.16",
    "@atlaskit/button": "^23.9.5",
    "@atlaskit/checkbox": "^17.3.3",
    "@atlaskit/css": "^0.19.1",
    "@atlaskit/css-reset": "^6.6.2",
    "@atlaskit/datetime-picker": "^17.4.3",
    "@atlaskit/dropdown-menu": "^16.4.1",
    "@atlaskit/dynamic-table": "^18.3.12",
    "@atlaskit/empty-state": "^10.1.12",
    "@atlaskit/flag": "^17.8.1",
    "@atlaskit/form": "^15.3.0",
    "@atlaskit/heading": "^5.3.0",
    "@atlaskit/icon": "^30.0.0",
    "@atlaskit/icon-lab": "^5.18.0",
    "@atlaskit/image": "^3.0.7",
    "@atlaskit/inline-edit": "^15.6.1",
    "@atlaskit/link": "^3.3.3",
    "@atlaskit/menu": "^8.4.17",
    "@atlaskit/modal-dialog": "^14.10.0",
    "@atlaskit/navigation-system": "^6.0.0",
    "@atlaskit/pagination": "^16.2.2",
    "@atlaskit/primitives": "^17.1.1",
    "@atlaskit/range": "^9.3.6",
    "@atlaskit/section-message": "^8.12.7",
    "@atlaskit/select": "^21.7.1",
    "@atlaskit/side-nav-items": "^1.4.1",
    "@atlaskit/skeleton": "^2.1.5",
    "@atlaskit/spinner": "^19.0.9",
    "@atlaskit/table-tree": "^12.3.0",
    "@atlaskit/tabs": "^18.3.4",
    "@atlaskit/textarea": "^8.2.2",
    "@atlaskit/textfield": "^8.2.1",
    "@atlaskit/toggle": "^15.2.12",
    "@atlaskit/tokens": "^10.0.1",
    "@atlaskit/tooltip": "^20.14.3",
    "@compiled/react": "^0.19.0",
    "@forge/bridge": "5.10.2",
    "@fullcalendar/core": "^6.1.20",
    "@fullcalendar/daygrid": "^6.1.20",
    "@fullcalendar/interaction": "^6.1.20",
    "@fullcalendar/list": "^6.1.20",
    "@fullcalendar/moment-timezone": "^6.1.20",
    "@fullcalendar/react": "^6.1.20",
    "@mdxeditor/editor": "^3.52.4",
    "@sentry/react": "^10.45.0",
    "@svar-ui/react-gantt": "^2.7.1",
    "@tanstack/react-query": "^5.95.2",
    "@tanstack/react-query-devtools": "^5.95.2",
    "@xyflow/react": "^12.10.1",
    "adf-to-md": "^1.2.1",
    "dayjs": "^1.11.19",
    "echarts": "^6.1.0",
    "echarts-for-react": "^3.0.6",
    "marklassian": "^1.2.0",
    "moment-timezone": "^0.5.40",
    "p-limit": "^7.3.0",
    "picomatch": "^2.3.2",
    "react": "^18.3.1",
    "react-apexcharts": "^2.1.0",
    "react-dom": "^18.3.1",
    "react-grid-layout": "^2.2.3",
    "react-kanban-kit": "^0.0.2-beta.6",
    "react-router-dom": "^7.13.1",
    "yarn": "^1.22.22",
    "zustand": "^5.0.11"
  },
  "devDependencies": {
    "@babel/preset-react": "^7.28.5",
    "@compiled/babel-plugin": "^0.38.1",
    "@compiled/babel-plugin-strip-runtime": "^0.38.0",
    "@craco/craco": "^7.1.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "jest": "^27.5.1",
    "jest-environment-jsdom": "^27.5.1",
    "patch-package": "^8.0.1",
    "react-scripts": "^5.0.1"
  },
  "scripts": {
    "merge": "node ../../locales/script/merge.js",
    "prebuild": "npm run merge",
    "start": "craco start",
    "build": "npm run build:app && npm run bundle:check",
    "build:app": "craco build",
    "bundle:check": "node scripts/check-bundle-budget.js",
    "build:budget": "npm run bundle:check",
    "eject": "react-scripts eject",
    "test": "jest",
    "postinstall": "patch-package"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}
{
  "name": "jira-global-page-custom-ui",
  "version": "1.1.17",
  "main": "index.js",
  "license": "MIT",
  "private": true,
  "devDependencies": {
    "@babel/preset-env": "^7.29.0",
    "@babel/preset-react": "^7.28.5",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "babel-jest": "^30.2.0",
    "eslint": "^8.56.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "jest": "^30.2.0",
    "jest-environment-jsdom": "^30.2.0",
    "react-test-renderer": "^19.2.4"
  },
  "scripts": {
    "test": "jest"
  },
  "dependencies": {
    "@forge/api": "^7.0.0",
    "@forge/events": "^2.0.18",
    "@forge/kvs": "^1.6.1",
    "@forge/resolver": "1.7.1",
    "@forge/sql": "^3.0.15",
    "@sentry/react": "^10.45.0",
    "crypto": "^1.0.1",
    "exceljs": "^4.4.0",
    "p-limit": "3.1.0"
  }
}

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'src/permission/PrincipalResolver.js' 1 440; rg -n --glob '*test*' --glob '*.test.*' \"resolvePrincipal|isAdministrator|getUserInfoService|admin\" test src/permission; git -c safe.directory=C:/CloudJira/moves-workforce show HEAD:src/permission/PrincipalResolver.js | Select-Object -First 340" in C:\CloudJira\moves-workforce
 succeeded in 3438ms:

--- src/permission/PrincipalResolver.js:1-440 ---
    1: /**
    2:  * PrincipalResolver ???몄텧???좎썝/沅뚰븳 ?댁꽍 (permission-hardening ?졖룐몿).
    3:  *
    4:  * 媛??permissionGuard)? userPermissionCheckService 媛 怨듭쑀?섎뒗 ?⑥씪 ?댁꽍湲?SSOT 짠4-C).
    5:  *
    6:  * 諛섑솚(P1 ?뺤옣 ??湲곗〈 8?꾨뱶???꾨? 遺덈?):
    7:  *   湲곗〈: accountId, isAdmin, isUser, name, pages, resourceMap, projectScope, memberProjectIds
    8:  *   ?좉퇋: teamKey, teamName, teamPath, leadingTeamKeys, isTeamLead,
    9:  *         scopeTeamKeys, leadingScopeTeamKeys, teamScopeAccountIds, leadingScopeAccountIds,
   10:  *         permissionSource('personal'|'team'|'team-default'|'none')
   11:  *           쨌 team         : ?(?먮뒗 ?곸쐞 ?)??吏?뺣맂 沅뚰븳 ?명듃瑜??곸냽
   12:  *           쨌 team-default : ?곸냽???명듃媛 ?놁뼱 ???????꾨━?뗭쓣 諛붾떏媛믪쑝濡??곸슜(2026-08-05)
   13:  *
   14:  * `memberProjectIds` ??**?꾨뱶紐낆쓣 ?좎???梨??섎?留??뺤옣**?쒕떎(?뚮퉬??臾대?寃?:
   15:  *   MEMBER_ONLY ??蹂몄씤??projectusers ???덈뒗 project_id
   16:  *   TEAM_ONLY   ??(scopeTeamKeys ??먮뱾??projectusers ???덈뒗 project_id)
   17:  *                 **??* (scopeTeamKeys 媛 project_team ???대떦 諛곗젙??project_id)   ??P2-a ?먯꽌 ?⑹쭛???꾩꽦
   18:  *   洹???      ??null
   19:  *
   20:  * ?깅뒫(짠4):
   21:  *   - accountId ??context ?먯꽌 痍⑤뱷(Jira /myself 遺덊븘??.
   22:  *   - admin ?먯젙(Jira /mypermissions)怨?users ??議고쉶(SQL)??**蹂묐젹**?대떎(2026-08-12, 媛먯궗 A-6).
   23:  *     ?몄텧 ?잛닔??醫낆쟾怨?媛숆퀬 ?뺣났留?2????1?? ?먯젙 ?쒖꽌쨌fail-close ?숈옉? 遺덈?.
   24:  *   - admin  : Jira /mypermissions 1??(+ ?쒖떆??users SQL 1 + ? ?몃뜳??罹먯떆)
   25:  *   - 鍮꼆dmin: Jira 1 + users SQL 1 + KVS permission 1 + ? ?몃뜳??60珥?罹먯떆)
   26:  *              (+ ???TEAM_ONLY ??users SQL 1, + MEMBER_ONLY/TEAM_ONLY ??projectusers SQL 1)
   27:  *   - L1 in-memory TTL(30珥? 罹먯떆: warm 而⑦뀒?대꼫?먯꽌 媛숈? accountId ?꾩냽 媛?쒕뒗 議고쉶 0??
   28:  *     ?뺥솗?깆? 罹먯떆???섏〈?섏? ?딆쓬(?쒖닔 理쒖쟻??. 沅뚰븳 蹂寃?理쒕? ~30珥?吏???꾪뙆(?섏슜).
   29:  *   - ??? ?몃뜳??TeamTreeCache) TTL 60珥덇? ?뷀빐??**? 愿??沅뚰븳 蹂寃쎌? 理쒕? 90珥?stale** ???섏슜?쒕떎.
   30:  *     (????댁젣쨌? ?대룞쨌? 沅뚰븳?명듃 蹂寃? 利됱떆 ?뚯닔??Jira 怨꾩젙 鍮꾪솢?깊솕媛 1李??듭젣?대ŉ 罹먯떆瑜??吏 ?딅뒗??)
   31:  */
   32: 
   33: import { checkAdministerPermission } from '../api/jira/user/UserApi';
   34: import { getUserInfoService } from '../resolver/backoffice/user/UserService';
   35: import {
   36:     findProjectIdsByAccountRepository,
   37:     findProjectIdsByAccountsRepository,
   38: } from '../resolver/projectIssue/ProjectUsersRepository';
   39: import { findAccountTeamPairsByTeamKeys } from '../resolver/backoffice/team/TeamRepository';
   40: import { findProjectIdsByTeamKeysSafe } from '../resolver/projectTeam/ProjectTeamRepository';
   41: import { getTeamIndex } from '../resolver/backoffice/team/TeamTreeCache';
   42: import { descendantsOf, nearestAncestorWith } from '../resolver/backoffice/team/TeamTree';
   43: import { customEntityManager } from '../nosql/query/CustomEntityManager';
   44: import { getSeedPages, mergeSetPages, pagesToResourceMap, RESOURCE_KEYS } from './ResourceCatalog';
   45: import { normalizeScope } from './ProjectScope';
   46: import { PermissionError } from '../error/PermissionError';
   47: import { ErrorCodes } from '../utils/errors/ErrorCodes';
   48: 
   49: const PERMISSION_ENTITY = 'permission';
   50: 
   51: /*
   52:  * ? 湲곕낯 ?명듃 id ??`SeedData.js` ??`PRESET_PERMISSION_SETS` ? **媛숈? 媛믪씠?댁빞 ?쒕떎.**
   53:  * SeedData 瑜?import ?섏? ?딅뒗 ?댁쑀: ?쒕뱶 ?ㅽ뻾 泥댁씤(KVS ?곌린 ?ы븿)??沅뚰븳 ?댁꽍 寃쎈줈???몃젮?⑤떎.
   54:  * ???`__test__/TeamDefaultPermission.test.js` 媛 ???뚯씪??id ?쇱튂瑜?怨좎젙?쒕떎.
   55:  */
   56: const TEAM_LEAD_PRESET_ID = 'permission-TeamLead';
   57: const TEAM_MEMBER_PRESET_ID = 'permission-TeamMember';
   58: const CACHE_TTL_MS = 30 * 1000; // 30珥?
   59: 
   60: /** teamScopeAccountIds 愿痢??곹븳 ??罹≪씠 ?꾨땲???좏샇(珥덇낵?대룄 ?숈옉? 怨꾩냽?쒕떎) */
   61: const TEAM_SCOPE_WARN_THRESHOLD = 2000;
   62: 
   63: // 紐⑤뱢 ?ㅼ퐫??L1 罹먯떆 (best-effort). key: accountId
   64: const cache = new Map();
   65: 
   66: const allFalsePages = () =>
   67:     RESOURCE_KEYS.map(key => ({ pageId: key, value: { read: false, write: false } }));
   68: 
   69: /**
   70:  * ? 愿??principal ?꾨뱶??湲곕낯媛?(P1).
   71:  *
   72:  * ??**`leadingTeamKeys: []` 媛 fail-close ???듭떖?대떎.** ?꾨옒 `resolveTeamContext` ??
   73:  *   `users` ?됱씠 ?뺤씤???ㅼ뿉留??몄텧?섎?濡? 諛깆삤?쇱뒪?먯꽌 ??젣???ъ슜?먭? KVS `team.leaderAccountId`
   74:  *   ??stale ?섍쾶 ?⑥븘 ?덉뼱??**???沅뚰븳??遺?쒗븯吏 ?딅뒗??*(Jira 怨꾩젙? ?댁븘 ?덉뼱 濡쒓렇?몄? ?쒕떎).
   75:  */
   76: const emptyTeamContext = () => ({
   77:     teamKey: null,
   78:     teamName: null,
   79:     teamPath: [],
   80:     leadingTeamKeys: [],
   81:     isTeamLead: false,
   82:     scopeTeamKeys: [],
   83:     leadingScopeTeamKeys: [],
   84:     teamScopeAccountIds: null,
   85:     leadingScopeAccountIds: null,
   86: });
   87: 
   88: const isAdministrator = async () => {
   89:     const result = await checkAdministerPermission();
   90:     return result?.permissions?.ADMINISTER?.havePermission ?? false;
   91: };
   92: 
   93: /**
   94:  * ? 而⑦뀓?ㅽ듃 ?댁꽍 (P1).
   95:  *
   96:  * **?몄텧 ?꾩젣: ?몄텧?먭? `users` ??議댁옱瑜??대? ?뺤씤?덈떎.** ???꾩젣媛 源⑥?硫?stale
   97:  * `team.leaderAccountId` 濡????沅뚰븳???덉뼱 ?섍컙??짠4-1 fail-open). ?꾩젣瑜?肄붾뱶濡?媛뺤젣?????놁쑝誘濡?
   98:  * ?몄텧 吏?먯쓣 buildPrincipal ??2怨녹쑝濡??쒖젙?섍퀬, ?뚯뒪?몃줈 怨좎젙?쒕떎.
   99:  *
  100:  * @param {string} accountId
  101:  * @param {string|null} teamKey users.team_key
  102:  * @returns {Promise<object>} emptyTeamContext() ? 媛숈? ?뺥깭 (+ teamIndex)
  103:  */
  104: const resolveTeamContext = async (accountId, teamKey) => {
  105:     let index = null;
  106:     try {
  107:         // ?쎄린 寃쎈줈 ??60珥?罹먯떆(? CRUD ?붾㈃怨??щ━ ?ш린??沅뚰븳 ?먯젙?대씪 stale ??紐낆떆?곸쑝濡??섏슜?쒕떎)
  108:         index = await getTeamIndex();
  109:     } catch (e) {
  110:         console.error('[PrincipalResolver] team index load error:', e);
  111:         return { ...emptyTeamContext(), teamIndex: null };
  112:     }
  113: 
  114:     const myTeamKey = teamKey && index.byKey.has(teamKey) ? teamKey : null;
  115: 
  116:     // ?닿? 由щ뜑???(吏곸냽) ??users ?됱씠 ?덈뒗 ?ъ슜?먯뿉 ??댁꽌留?怨꾩궛?쒕떎(???꾩젣 李몄“)
  117:     const leadingTeamKeys = [...index.byKey.values()]
  118:         .filter(t => t.leaderAccountId && t.leaderAccountId === accountId)
  119:         .map(t => t.teamKey);
  120: 
  121:     // ?닿? 由щ뜑??? + 洹??꾩넀 ??**write ?먯젙 ?꾩슜**.
  122:     //   scopeTeamKeys ???뚯냽 ?源뚯? ?ы븿?섎?濡?write ???곕㈃ ?먭린 ? ?꾩껜??write 媛 ?대젮 怨쇰??섎떎.
  123:     const leadingScopeTeamKeys = [...new Set(
  124:         leadingTeamKeys.flatMap(key => descendantsOf(index, key, { includeSelf: true })),
  125:     )];
  126: 
  127:     // (?먭린 ? + ?꾩넀) ??(???? + ?꾩넀) ???쎄린 ?ㅼ퐫??
  128:     const scopeTeamKeys = [...new Set([
  129:         ...(myTeamKey ? descendantsOf(index, myTeamKey, { includeSelf: true }) : []),
  130:         ...leadingScopeTeamKeys,
  131:     ])];
  132: 
  133:     return {
  134:         teamKey: myTeamKey,
  135:         teamName: myTeamKey ? index.byKey.get(myTeamKey)?.name ?? null : null,
  136:         teamPath: myTeamKey ? index.pathOf.get(myTeamKey) ?? [] : [],
  137:         leadingTeamKeys,
  138:         isTeamLead: leadingTeamKeys.length > 0,
  139:         scopeTeamKeys,
  140:         leadingScopeTeamKeys,
  141:         teamScopeAccountIds: null,      // ?꾨옒?먯꽌 議곌굔遺濡?梨꾩슫??
  142:         leadingScopeAccountIds: null,
  143:         teamIndex: index,
  144:     };
  145: };
  146: 
  147: /**
  148:  * ? ?ㅼ퐫?????accountId 吏묓빀??梨꾩슫??(SQL 1??.
  149:  *
  150:  * `isTeamLead === true` ?먮뒗 `projectScope === 'TEAM_ONLY'` ???뚮쭔 議고쉶?쒕떎.
  151:  * ??吏묓빀(?쎄린???꾩껜 / ???write ?꾩슜)??**team_key 瑜??④퍡 諛쏆븘 JS ?먯꽌 遺꾪븷**?쒕떎.
  152:  */
  153: const fillTeamScopeAccounts = async (teamCtx, projectScope, accountId) => {
  154:     const needed = teamCtx.isTeamLead || projectScope === 'TEAM_ONLY';
  155:     if (!needed) return teamCtx;
  156: 
  157:     // 鍮?吏묓빀?대㈃ 荑쇰━ ?먯껜瑜?諛쒗뻾?섏? ?딅뒗??Repository 媛?쒖? ?댁쨷 諛⑹뼱) ?????0紐?= fail-close
  158:     if (!teamCtx.scopeTeamKeys.length) {
  159:         return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
  160:     }
  161: 
  162:     let pairs = [];
  163:     try {
  164:         pairs = await findAccountTeamPairsByTeamKeys(teamCtx.scopeTeamKeys);
  165:     } catch (e) {
  166:         console.error('[PrincipalResolver] team scope accounts load error:', e);
  167:         // 議고쉶 ?ㅽ뙣 ??鍮?吏묓빀(????놁쓬). ?볧엳吏 ?딅뒗??
  168:         return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
  169:     }
  170: 
  171:     /*
  172:      * ?뵶 ???蹂몄씤???먭린 ? ?몄썝 吏묓빀???ｋ뒗????"??λ룄 洹?????쇱썝"(2026-08-05).
  173:      *
  174:      *   ??`pairs` ??SQL `users.team_key` 湲곕컲?대씪, ?뚯냽??鍮꾩뼱 ?덈뒗 ??μ? ?ш린 ?섑??섏? ?딅뒗??
  175:      *   紐낆떆?곸쑝濡??뷀븯吏 ?딆쑝硫??뚮퉬 痢≪씠 ??吏묓빀?쇰줈 **?ш탳吏묓빀**???????蹂몄씤???꾨줈 鍮좎쭊????
  176:      *   `MyTeamAnalysisService` ??"???" 紐⑸줉?먯꽌 ??μ씠 ?щ씪吏??寃쎈줈媛 ?뺥솗???닿쾬?대떎.
  177:      *   ??議고쉶 ?ㅽ뙣 寃쎈줈(??catch)?먮뒗 ?뷀븯吏 ?딅뒗?? ?ㅽ뙣??鍮?吏묓빀 = fail-close 濡??좎??쒕떎.
  178:      */
  179:     const withSelf = (ids) => (teamCtx.isTeamLead && accountId ? [...new Set([...ids, accountId])] : ids);
  180: 
  181:     const leadingSet = new Set(teamCtx.leadingScopeTeamKeys);
  182:     const teamScopeAccountIds = withSelf([...new Set(pairs.map(p => p.accountId))]);
  183:     const leadingScopeAccountIds = withSelf([...new Set(
  184:         pairs.filter(p => leadingSet.has(p.teamKey)).map(p => p.accountId),
  185:     )]);
  186: 
  187:     if (teamScopeAccountIds.length > TEAM_SCOPE_WARN_THRESHOLD) {
  188:         // 罹≪씠 ?꾨땲??愿痢??좏샇 ???ш린???섎씪?대㈃ 沅뚰븳??議곗슜??醫곸븘吏꾨떎.
  189:         console.warn(`[PrincipalResolver] teamScopeAccountIds=${teamScopeAccountIds.length} (> ${TEAM_SCOPE_WARN_THRESHOLD})`);
  190:     }
  191: 
  192:     return { ...teamCtx, teamScopeAccountIds, leadingScopeAccountIds };
  193: };
  194: 
  195: /**
  196:  * ?좎썝/沅뚰븳 ?댁꽍. 罹먯떆 ?덊듃 ??議고쉶 0??
  197:  * @param {object} context resolver req.context (accountId ?ы븿)
  198:  * @returns {Promise<object>} principal
  199:  */
  200: export const resolvePrincipal = async (context) => {
  201:     const accountId = context?.accountId;
  202:     if (!accountId) {
  203:         throw new PermissionError(
  204:             ErrorCodes.PERMISSION_PRINCIPAL_UNRESOLVED,
  205:             'Principal accountId is not available in context',
  206:         );
  207:     }
  208: 
  209:     const cached = cache.get(accountId);
  210:     if (cached && cached.expireAt > Date.now()) {
  211:         return cached.value;
  212:     }
  213: 
  214:     const principal = await buildPrincipal(accountId);
  215:     cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });
  216:     return principal;
  217: };
  218: 
  219: /**
  220:  * users ??議고쉶 ???ㅽ뙣??醫낆쟾怨?媛숈씠 "???놁쓬"?쇰줈 ?≪닔?쒕떎(?볧엳吏 ?딅뒗??.
  221:  * 議고쉶 寃곌낵??admin/鍮꼆dmin ??寃쎈줈媛 **紐⑤몢** ?꾩슂濡??쒕떎:
  222:  *   admin  ???쒖떆??? 而⑦뀓?ㅽ듃(+ stale leaderAccountId fail-close ?꾩젣)
  223:  *   鍮꼆dmin ??沅뚰븳 ?명듃/? 寃곗젙
  224:  */
  225: const loadUserRows = async (accountId) => {
  226:     try {
  227:         return (await getUserInfoService({ accountId }))?.rows ?? [];
  228:     } catch (e) {
  229:         console.error('[PrincipalResolver] getUserInfoService error:', e);
  230:         return [];
  231:     }
  232: };
  233: 
  234: const buildPrincipal = async (accountId) => {
  235:     /*
  236:      * ?깅뒫 (2026-08-12 媛먯궗 A-6) ??admin ?먯젙(Jira `/mypermissions`)怨?users ??議고쉶(SQL)??
  237:      * ?쒕줈 ?낅┰?몃뜲 吏곷젹濡?以꾩꽭?뚯졇 ?덉뿀?? ??寃쎈줈 紐⑤몢 users ?됱쓣 ?곕?濡?蹂묐젹濡?臾띠뼱??
  238:      * **?몄텧 ?잛닔??洹몃?濡?*?닿퀬 ?뺣났留?2????1?⑥씠 ?쒕떎(媛?쒕뒗 紐⑤뱺 resolver 吏꾩엯留덈떎 ?덈떎).
  239:      *
  240:      * ???먯젙 遺덈? 議곌굔
  241:      *   쨌 `isAdministrator()` ??catch ?섏? ?딅뒗?????ㅽ뙣??醫낆쟾泥섎읆 throw ?섏뼱 媛?쒓? fail-close ?쒕떎.
  242:      *     (`loadUserRows` ???덈? reject ?섏? ?딆쑝誘濡?Promise.all ??unhandled rejection ??留뚮뱾吏 ?딅뒗??)
  243:      *   쨌 users 議고쉶 ?ㅽ뙣??醫낆쟾泥섎읆 rows=[] 濡??≪닔 ??admin ? ? ?뺣낫 ?놁쓬, 鍮꼆dmin ? 誘몃벑濡?泥섎━.
  244:      *   쨌 ?꾨옒 遺꾧린 ?쒖꽌(admin ??誘몃벑濡???? ???명듃)??洹몃?濡쒕떎. 媛믪씠 ?몄젣 ?꾩갑?섎뒗吏留??щ씪吏꾨떎.
  245:      */
  246:     const [isAdmin, dbUserInfo] = await Promise.all([
  247:         isAdministrator(),
  248:         loadUserRows(accountId),
  249:     ]);
  250: 
  251:     // 1) Jira ADMINISTER ???꾧텒 Admin (??긽 projectScope ALL)
  252:     if (isAdmin) {
  253:         const pages = getSeedPages('admin');
  254: 
  255:         // ? ?뺣낫??best-effort 濡쒕쭔 梨꾩슫????沅뚰븳 ?먯젙?먮뒗 ?곗씠吏 ?딄퀬(admin ? ?꾧텒 諛붿씠?⑥뒪),
  256:         //   /my-page "???" ?뱀뀡 ?몄텧 媛숈? **?쒖떆 ?⑸룄**?? ?ㅽ뙣?대룄 admin ?숈옉???곹뼢???녿떎.
  257:         //   ???ш린?쒕룄 users ?됱씠 ?덉뼱????μ쑝濡??몄젙?쒕떎(stale leaderAccountId fail-close ?쇨?).
  258:         let teamCtx = emptyTeamContext();
  259:         try {
  260:             if (dbUserInfo.length > 0) {
  261:                 const { teamIndex, ...ctx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);
  262:                 teamCtx = ctx;
  263:             }
  264:         } catch (e) {
  265:             console.error('[PrincipalResolver] admin team context error:', e);
  266:         }
  267: 
  268:         return {
  269:             accountId,
  270:             isAdmin: true,
  271:             isUser: true,
  272:             name: 'Admin',
  273:             pages,
  274:             resourceMap: pagesToResourceMap(pages),
  275:             projectScope: 'ALL',
  276:             memberProjectIds: null,
  277:             ...teamCtx,
  278:             permissionSource: 'personal',
  279:         };
  280:     }
  281: 
  282:     // 2) users DB 議고쉶 寃곌낵(?꾩뿉??admin ?먯젙怨?蹂묐젹濡??대? 諛쏆븘 ??? ??permission_key / team_key
  283: 
  284:     // 3) 誘몃벑濡??ъ슜?????꾨? false (fail-close)
  285:     //    ??? 而⑦뀓?ㅽ듃瑜?**怨꾩궛?섏? ?딅뒗??** KVS team.leaderAccountId ????怨꾩젙??stale ?섍쾶
  286:     //      ?⑥븘 ?덉뼱??leadingTeamKeys=[] ??isTeamLead=false 濡?怨좎젙?쒕떎(짠4-1 fail-open 李⑤떒).
  287:     if (!dbUserInfo || dbUserInfo.length === 0) {
  288:         const pages = allFalsePages();
  289:         return {
  290:             accountId,
  291:             isAdmin: false,
  292:             isUser: false,
  293:             name: 'undefined',
  294:             pages,
  295:             resourceMap: pagesToResourceMap(pages),
  296:             projectScope: 'ALL',
  297:             memberProjectIds: null,
  298:             ...emptyTeamContext(),
  299:             permissionSource: 'none',
  300:         };
  301:     }
  302: 
  303:     // 4) ? 而⑦뀓?ㅽ듃 (users ???뺤씤 ?꾩뿉留?怨꾩궛 ????3) 二쇱꽍 李몄“)
  304:     const { teamIndex, ...baseTeamCtx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);
  305: 
  306:     // 5) 沅뚰븳 ?명듃 寃곗젙 ??**媛쒖씤 ?ㅻ쾭?쇱씠????? ?곸냽 fallback** (R2. ?⑹쭛???꾨떂)
  307:     //    ??踰덉뿉 ?섎굹???명듃留??곸슜?섎?濡?projectScope 媛 ??異쒖쿂?먯꽌 ?욎씠??寃쎌슦媛 ?먯쿇 李⑤떒?쒕떎.
  308:     let permissionKey = dbUserInfo[0].permission_key ?? null;
  309:     let permissionSource = 'personal';
  310: 
  311:     if (!permissionKey) {
  312:         /*
  313:          * ?곸냽 ?쒖옉?? ?뚯냽 ? ???놁쑝硫?**?대걚???**.
  314:          *   "??λ룄 洹?????쇱썝"?대?濡? ?뚯냽??鍮꾩뼱 ?덈뒗 ??λ룄 ?먭린 ?(怨??곸쐞)??沅뚰븳 ?명듃瑜??곸냽?댁빞 ?쒕떎.
  315:          *   ?닿쾶 ?놁쑝硫?????명듃媛 吏?뺣뤌 ?덈뒗?곕룄 怨㏓컮濡??꾨━??諛붾떏媛믪쑝濡??⑥뼱??
  316:          *   `媛쒖씤 ??? ?곸냽 ??湲곕낯媛? ?쒖꽌媛 ?ㅼ쭛?뚮떎.
  317:          */
  318:         const inheritFrom = baseTeamCtx.teamKey ?? baseTeamCtx.leadingTeamKeys?.[0] ?? null;
  319:         const inherited = (inheritFrom && teamIndex)
  320:             ? nearestAncestorWith(teamIndex, inheritFrom, t => !!t.permissionKey)
  321:             : null;
  322: 
  323:         if (inherited) {
  324:             permissionKey = inherited.permissionKey;
  325:             permissionSource = 'team';
  326:         } else {
  327:             /*
  328:              * ? 湲곕낯 ?명듃 (2026-08-05) ??媛쒖씤 沅뚰븳???녾퀬 ??먯꽌 ?곸냽諛쏆쓣 ?명듃???놁쓣 ?뚯쓽 諛붾떏媛?
  329:              *
  330:              * ?댁쟾?먮뒗 怨㏓컮濡???由ъ냼??false ??? 洹?寃곌낵 "??먮뒗 ?랁빐 ?덈뒗???꾨Т寃껊룄 紐?蹂대뒗" ?몄썝??
  331:              * ?앷꼈怨? 愿由ъ옄媛 ??紐낆뵫 ?명듃瑜?吏?뺥븯湲??꾧퉴吏 ?깆씠 ?ъ떎??鍮꾩뼱 蹂댁???
  332:              *
  333:              * ?뵶 fail-close 瑜?**?섎룄?곸쑝濡??꾪솕**?섎뒗 吏?먯씠?? ?ㅻ쭔 臾댁젣???꾪솕媛 ?꾨땲??
  334:              *    쨌 ? 而⑦뀓?ㅽ듃媛 ?덈뒗 ?щ엺留?諛쏅뒗????????녾퀬 ??λ룄 ?꾨땲硫?醫낆쟾?濡???由ъ냼??false.
  335:              *    쨌 ???꾨━??紐⑤몢 `projectScope: 'TEAM_ONLY'` + WORKFORCE ?쎄린 ?꾩슜?닿퀬,
  336:              *      PROJECT_COST(?щТ)???ロ? ?덈떎(`SeedData.js` PRESET_PERMISSION_SETS).
  337:              *    쨌 愿由ъ옄媛 ?꾨━?뗭쓣 吏?좊떎硫?KVS 議고쉶媛 null ??`mergeSetPages([])` 濡??꾨? false ??
  338:              *      利??명듃媛 ?놁쑝硫??먮룞?쇰줈 醫낆쟾 ?숈옉(fail-close)?쇰줈 ?뚯븘媛꾨떎.
  339:              */
  340:             const preset = baseTeamCtx.isTeamLead
  341:                 ? TEAM_LEAD_PRESET_ID
  342:                 : (baseTeamCtx.teamKey ? TEAM_MEMBER_PRESET_ID : null);
  343: 
  344:             if (preset) {
  345:                 permissionKey = preset;
  346:                 permissionSource = 'team-default';
  347:             } else {
  348:                 permissionSource = 'none';
  349:             }
  350:         }
  351:     }
  352: 
  353:     // 6) ?곸냽諛쏆쓣 ?명듃媛 ?놁쑝硫???由ъ냼??false (fail-close). KVS 議고쉶 ?먯껜瑜??섏? ?딅뒗??
  354:     if (permissionSource === 'none') {
  355:         const pages = allFalsePages();
  356:         return {
  357:             accountId,
  358:             isAdmin: false,
  359:             isUser: true,
  360:             name: 'undefined',
  361:             pages,
  362:             resourceMap: pagesToResourceMap(pages),
  363:             projectScope: 'ALL',
  364:             memberProjectIds: null,
  365:             ...baseTeamCtx,
  366:             permissionSource,
  367:         };
  368:     }
  369: 
  370:     // 7) KVS permission ?명듃 ??移댄깉濡쒓렇 蹂묓빀
  371:     let set = null;
  372:     try {
  373:         set = await customEntityManager(PERMISSION_ENTITY).findById(permissionKey);
  374:     } catch (e) {
  375:         console.error('[PrincipalResolver] permission set load error:', e);
  376:     }
  377: 
  378:     /*
  379:      * ?뵶 ? 湲곕낯 ?명듃濡?怨좊Ⅸ ?꾨━?뗭씠 **?ㅼ젣濡??놁쑝硫?* 醫낆쟾?濡???由ъ냼??false 濡??뚯븘媛꾨떎.
  380:      *
  381:      *   `mergeSetPages([])` ????κ컪???녿뒗 ?ㅼ뿉 `defaultForNew` 瑜??곸슜?쒕떎(ResourceCatalog.js:110).
  382:      *   利?"?명듃 ?놁쓬"? "沅뚰븳 ?놁쓬"???꾨땲???????대갚???놁쑝硫?愿由ъ옄媛 ?꾨━?뗭쓣 吏???쒓컙
  383:      *   ? ?뚯냽 ?꾩썝?먭쾶 defaultForNew 媛 議곗슜???대┛?? ?꾨━?뗭? "理쒖큹 1?뚮쭔 ?앹꽦"?대씪
  384:      *   (SeedData.js) 吏?뚯쭊 ?곹깭媛 ?뺤긽 ?댁쁺 以묒뿉??議댁옱?????덈떎.
  385:      */
  386:     if (!set && permissionSource === 'team-default') {
  387:         const pages = allFalsePages();
  388:         return {
  389:             accountId,
  390:             isAdmin: false,
  391:             isUser: true,
  392:             name: 'undefined',
  393:             pages,
  394:             resourceMap: pagesToResourceMap(pages),
  395:             projectScope: 'ALL',
  396:             memberProjectIds: null,
  397:             ...baseTeamCtx,
  398:             permissionSource: 'none',
  399:         };
  400:     }
  401: 
  402:     const pages = mergeSetPages(set?.pages ?? []);
  403:     const projectScope = normalizeScope(set?.projectScope);
  404: 
  405:     // 8) ? ?ㅼ퐫?????accountId 吏묓빀(議곌굔遺 SQL 1??
  406:     const teamCtx = await fillTeamScopeAccounts(baseTeamCtx, projectScope, accountId);
  407: 
  408:     // 9) ?꾨줈?앺듃 ?ㅼ퐫?꾨퀎 ?뚯냽 ?꾨줈?앺듃 id lazy 議고쉶
  409:     let memberProjectIds = null;
  410:     if (projectScope === 'MEMBER_ONLY') {
  411:         try {
  412:             memberProjectIds = await findProjectIdsByAccountRepository(accountId);
  413:         } catch (e) {
  414:             console.error('[PrincipalResolver] memberProjectIds load error:', e);
  415:             memberProjectIds = []; // 議고쉶 ?ㅽ뙣 ???덉쟾?섍쾶 鍮??뚯냽(=鍮꾩냼??泥섎━)
  416:         }
  417:     } else if (projectScope === 'TEAM_ONLY') {
  418:         // P2-a ?먯꽌 **?⑹쭛?⑹씠 ?꾩꽦**?먮떎(P1 ? projectusers 寃쎈줈留??곕뒗 怨쇰룄湲곗???:
  419:         //   ??scopeTeamKeys ?뚯냽 ??먮뱾??projectusers ???덈뒗 ?꾨줈?앺듃
  420:         //   ??scopeTeamKeys 媛 project_team ??**?대떦 諛곗젙**???꾨줈?앺듃
  421:         // ?↔? ?뷀빐吏硫댁꽌 ?ㅼ퐫?꾧? **?볦뼱吏꾨떎** ??P1 ??醫곸? ?곹깭???섎룄??fail-close ?怨?
  422:         // ?ш린???ㅺ퀎 ?섎룄(짠R3)???꾨떖?쒕떎.
  423:         //   ?????낅젰??紐⑤몢 鍮?諛곗뿴?대㈃ Repository 媛?쒓? 荑쇰━瑜?留됯퀬 [] 瑜??뚮젮以????0嫄?
  424:         //     `whereIn([])` / `generateInClause(0)` 濡??꾩궗媛 ?덈뒗 寃쎈줈媛 ?녿떎(C3쨌L3).
  425:         try {
  426:             const [byMembers, byTeams] = await Promise.all([
  427:                 findProjectIdsByAccountsRepository(teamCtx.teamScopeAccountIds ?? []),
  428:                 findProjectIdsByTeamKeysSafe(teamCtx.scopeTeamKeys ?? []),
  429:             ]);
  430:             memberProjectIds = [...new Set([...byMembers, ...byTeams])];
  431:         } catch (e) {
  432:             console.error('[PrincipalResolver] team memberProjectIds load error:', e);
  433:             memberProjectIds = [];
  434:         }
  435:     }
  436: 
  437:     return {
  438:         accountId,
  439:         isAdmin: false,
  440:         isUser: true,
test\permission\guardTeamLead.integration.test.js:14:    resolvePrincipal: (...a) => mockResolvePrincipal(...a),
test\permission\guardTeamLead.integration.test.js:51:    test('admin 은 통과하고 payload 가 원본 그대로다', async () => {
test\permission\permissionMap.contract.test.js:229:        test('admin 은 전권 바이패스', () => {
test\permission\permissionMap.contract.test.js:230:            const admin = { isAdmin: true };
test\permission\permissionMap.contract.test.js:231:            expect(isSatisfied(admin, PERMISSION_MAP.assignWorkItem)).toBe(true);
test\permission\principalResolver.test.js:30:    getUserInfoService: (...a) => mockGetUserInfo(...a),
test\permission\principalResolver.test.js:47:const { resolvePrincipal, scopedProjectIds, clearPrincipalCache } = require('../../src/permission/PrincipalResolver');
test\permission\principalResolver.test.js:93:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:105:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:116:        await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:134:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:146:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:161:        const p = await resolvePrincipal({ accountId: 'lead-1' });
test\permission\principalResolver.test.js:178:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:189:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:203:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:222:        const p = await resolvePrincipal({ accountId: 'lead-1' });
test\permission\principalResolver.test.js:239:        const p = await resolvePrincipal({ accountId: 'lead-1' });   // KVS 상 dev 팀의 리더
test\permission\principalResolver.test.js:257:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:269:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:282:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:295:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:314:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:332:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:343:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:362:        const p = await resolvePrincipal({ accountId });
test\permission\principalResolver.test.js:368:    test('admin 은 어떤 스코프에서도 null (전권 바이패스, 무변경)', async () => {
test\permission\principalResolver.test.js:370:        setUser({ account_id: 'admin-1', permission_key: 'p', team_key: 'dev' });
test\permission\principalResolver.test.js:372:        const p = await resolvePrincipal({ accountId: 'admin-1' });
test\permission\principalResolver.test.js:379:    test('admin 도 users 행이 없으면 팀장이 되지 않는다 (stale 참조 일관 처리)', async () => {
test\permission\principalResolver.test.js:383:        const p = await resolvePrincipal({ accountId: 'lead-1' });
test\permission\principalResolver.test.js:390:    test('admin 은 users 행이 있으면 표시용 팀 정보를 갖는다 (/my-page "내 팀" 노출용)', async () => {
test\permission\principalResolver.test.js:394:        const p = await resolvePrincipal({ accountId: 'lead-1' });
test\permission\principalResolver.test.js:406:        const p = await resolvePrincipal({ accountId: nextAccount() });
test\permission\principalResolver.test.js:417:        await expect(resolvePrincipal({})).rejects.toMatchObject({
test\permission\userPermissionCheck.test.js:18:    resolvePrincipal: (...a) => mockResolvePrincipal(...a),
/**
 * PrincipalResolver — 호출자 신원/권한 해석 (permission-hardening ①·④).
 *
 * 가드(permissionGuard)와 userPermissionCheckService 가 공유하는 단일 해석기(SSOT §4-C).
 *
 * 반환(P1 확장 — 기존 8필드는 전부 불변):
 *   기존: accountId, isAdmin, isUser, name, pages, resourceMap, projectScope, memberProjectIds
 *   신규: teamKey, teamName, teamPath, leadingTeamKeys, isTeamLead,
 *         scopeTeamKeys, leadingScopeTeamKeys, teamScopeAccountIds, leadingScopeAccountIds,
 *         permissionSource('personal'|'team'|'team-default'|'none')
 *           · team         : 팀(또는 상위 팀)에 지정된 권한 세트를 상속
 *           · team-default : 상속할 세트가 없어 팀장/팀원 프리셋을 바닥값으로 적용(2026-08-05)
 *
 * `memberProjectIds` 는 **필드명을 유지한 채 의미만 확장**한다(소비자 무변경):
 *   MEMBER_ONLY → 본인이 projectusers 에 있는 project_id
 *   TEAM_ONLY   → (scopeTeamKeys 팀원들이 projectusers 에 있는 project_id)
 *                 **∪** (scopeTeamKeys 가 project_team 에 담당 배정된 project_id)   ← P2-a 에서 합집합 완성
 *   그 외       → null
 *
 * 성능(§4):
 *   - accountId 는 context 에서 취득(Jira /myself 불필요).
 *   - admin  : Jira /mypermissions 1회 (+ 표시용 users SQL 1 + 팀 인덱스 캐시)
 *   - 비admin: Jira 1 + users SQL 1 + KVS permission 1 + 팀 인덱스(60초 캐시)
 *              (+ 팀장/TEAM_ONLY 시 users SQL 1, + MEMBER_ONLY/TEAM_ONLY 시 projectusers SQL 1)
 *   - L1 in-memory TTL(30초) 캐시: warm 컨테이너에서 같은 accountId 후속 가드는 조회 0회.
 *     정확성은 캐시에 의존하지 않음(순수 최적화). 권한 변경 최대 ~30초 지연 전파(수용).
 *   - ⚠ 팀 인덱스(TeamTreeCache) TTL 60초가 더해져 **팀 관련 권한 변경은 최대 90초 stale** 을 수용한다.
 *     (팀장 해제·팀 이동·팀 권한세트 변경. 즉시 회수는 Jira 계정 비활성화가 1차 통제이며 캐시를 타지 않는다.)
 */

import { checkAdministerPermission } from '../api/jira/user/UserApi';
import { getUserInfoService } from '../resolver/backoffice/user/UserService';
import {
    findProjectIdsByAccountRepository,
    findProjectIdsByAccountsRepository,
} from '../resolver/projectIssue/ProjectUsersRepository';
import { findAccountTeamPairsByTeamKeys } from '../resolver/backoffice/team/TeamRepository';
import { findProjectIdsByTeamKeysSafe } from '../resolver/projectTeam/ProjectTeamRepository';
import { getTeamIndex } from '../resolver/backoffice/team/TeamTreeCache';
import { descendantsOf, nearestAncestorWith } from '../resolver/backoffice/team/TeamTree';
import { customEntityManager } from '../nosql/query/CustomEntityManager';
import { getSeedPages, mergeSetPages, pagesToResourceMap, RESOURCE_KEYS } from './ResourceCatalog';
import { normalizeScope } from './ProjectScope';
import { PermissionError } from '../error/PermissionError';
import { ErrorCodes } from '../utils/errors/ErrorCodes';

const PERMISSION_ENTITY = 'permission';

/*
 * 팀 기본 세트 id — `SeedData.js` 의 `PRESET_PERMISSION_SETS` 와 **같은 값이어야 한다.**
 * SeedData 를 import 하지 않는 이유: 시드 실행 체인(KVS 쓰기 포함)이 권한 해석 경로에 딸려온다.
 * 대신 `__test__/TeamDefaultPermission.test.js` 가 두 파일의 id 일치를 고정한다.
 */
const TEAM_LEAD_PRESET_ID = 'permission-TeamLead';
const TEAM_MEMBER_PRESET_ID = 'permission-TeamMember';
const CACHE_TTL_MS = 30 * 1000; // 30초

/** teamScopeAccountIds 관측 상한 — 캡이 아니라 신호(초과해도 동작은 계속한다) */
const TEAM_SCOPE_WARN_THRESHOLD = 2000;

// 모듈 스코프 L1 캐시 (best-effort). key: accountId
const cache = new Map();

const allFalsePages = () =>
    RESOURCE_KEYS.map(key => ({ pageId: key, value: { read: false, write: false } }));

/**
 * 팀 관련 principal 필드의 기본값 (P1).
 *
 * ★ **`leadingTeamKeys: []` 가 fail-close 의 핵심이다.** 아래 `resolveTeamContext` 는
 *   `users` 행이 확인된 뒤에만 호출되므로, 백오피스에서 삭제된 사용자가 KVS `team.leaderAccountId`
 *   에 stale 하게 남아 있어도 **팀장 권한이 부활하지 않는다**(Jira 계정은 살아 있어 로그인은 된다).
 */
const emptyTeamContext = () => ({
    teamKey: null,
    teamName: null,
    teamPath: [],
    leadingTeamKeys: [],
    isTeamLead: false,
    scopeTeamKeys: [],
    leadingScopeTeamKeys: [],
    teamScopeAccountIds: null,
    leadingScopeAccountIds: null,
});

const isAdministrator = async () => {
    const result = await checkAdministerPermission();
    return result?.permissions?.ADMINISTER?.havePermission ?? false;
};

/**
 * 팀 컨텍스트 해석 (P1).
 *
 * **호출 전제: 호출자가 `users` 행 존재를 이미 확인했다.** 이 전제가 깨지면 stale
 * `team.leaderAccountId` 로 팀장 권한이 새어 나간다(§4-1 fail-open). 전제를 코드로 강제할 수 없으므로
 * 호출 지점을 buildPrincipal 안 2곳으로 한정하고, 테스트로 고정한다.
 *
 * @param {string} accountId
 * @param {string|null} teamKey users.team_key
 * @returns {Promise<object>} emptyTeamContext() 와 같은 형태 (+ teamIndex)
 */
const resolveTeamContext = async (accountId, teamKey) => {
    let index = null;
    try {
        // 읽기 경로 — 60초 캐시(팀 CRUD 화면과 달리 여기는 권한 판정이라 stale 을 명시적으로 수용한다)
        index = await getTeamIndex();
    } catch (e) {
        console.error('[PrincipalResolver] team index load error:', e);
        return { ...emptyTeamContext(), teamIndex: null };
    }

    const myTeamKey = teamKey && index.byKey.has(teamKey) ? teamKey : null;

    // 내가 리더인 팀(직속) — users 행이 있는 사용자에 대해서만 계산된다(위 전제 참조)
    const leadingTeamKeys = [...index.byKey.values()]
        .filter(t => t.leaderAccountId && t.leaderAccountId === accountId)
        .map(t => t.teamKey);

    // 내가 리더인 팀 + 그 후손 — **write 판정 전용**.
    //   scopeTeamKeys 는 소속 팀까지 포함하므로 write 에 쓰면 자기 팀 전체에 write 가 열려 과대하다.
    const leadingScopeTeamKeys = [...new Set(
        leadingTeamKeys.flatMap(key => descendantsOf(index, key, { includeSelf: true })),
    )];

    // (자기 팀 + 후손) ∪ (팀장 팀 + 후손) — 읽기 스코프
    const scopeTeamKeys = [...new Set([
        ...(myTeamKey ? descendantsOf(index, myTeamKey, { includeSelf: true }) : []),
        ...leadingScopeTeamKeys,
    ])];

    return {
        teamKey: myTeamKey,
        teamName: myTeamKey ? index.byKey.get(myTeamKey)?.name ?? null : null,
        teamPath: myTeamKey ? index.pathOf.get(myTeamKey) ?? [] : [],
        leadingTeamKeys,
        isTeamLead: leadingTeamKeys.length > 0,
        scopeTeamKeys,
        leadingScopeTeamKeys,
        teamScopeAccountIds: null,      // 아래에서 조건부로 채운다
        leadingScopeAccountIds: null,
        teamIndex: index,
    };
};

/**
 * 팀 스코프 대상 accountId 집합을 채운다 (SQL 1회).
 *
 * `isTeamLead === true` 또는 `projectScope === 'TEAM_ONLY'` 일 때만 조회한다.
 * 두 집합(읽기용 전체 / 팀장 write 전용)을 **team_key 를 함께 받아 JS 에서 분할**한다.
 */
const fillTeamScopeAccounts = async (teamCtx, projectScope, accountId) => {
    const needed = teamCtx.isTeamLead || projectScope === 'TEAM_ONLY';
    if (!needed) return teamCtx;

    // 빈 집합이면 쿼리 자체를 발행하지 않는다(Repository 가드와 이중 방어) → 대상 0명 = fail-close
    if (!teamCtx.scopeTeamKeys.length) {
        return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
    }

    let pairs = [];
    try {
        pairs = await findAccountTeamPairsByTeamKeys(teamCtx.scopeTeamKeys);
    } catch (e) {
        console.error('[PrincipalResolver] team scope accounts load error:', e);
        // 조회 실패 → 빈 집합(대상 없음). 넓히지 않는다.
        return { ...teamCtx, teamScopeAccountIds: [], leadingScopeAccountIds: [] };
    }

    /*
     * 🔴 팀장 본인을 자기 팀 인원 집합에 넣는다 — "팀장도 그 팀의 일원"(2026-08-05).
     *
     *   위 `pairs` 는 SQL `users.team_key` 기반이라, 소속이 비어 있는 팀장은 여기 나타나지 않는다.
     *   명시적으로 더하지 않으면 소비 측이 이 집합으로 **재교집합**할 때 팀장 본인이 도로 빠진다 —
     *   `MyTeamAnalysisService` 의 "내 팀" 목록에서 팀장이 사라지던 경로가 정확히 이것이다.
     *   ⚠ 조회 실패 경로(위 catch)에는 더하지 않는다. 실패는 빈 집합 = fail-close 로 유지한다.
     */
    const withSelf = (ids) => (teamCtx.isTeamLead && accountId ? [...new Set([...ids, accountId])] : ids);

    const leadingSet = new Set(teamCtx.leadingScopeTeamKeys);
    const teamScopeAccountIds = withSelf([...new Set(pairs.map(p => p.accountId))]);
    const leadingScopeAccountIds = withSelf([...new Set(
        pairs.filter(p => leadingSet.has(p.teamKey)).map(p => p.accountId),
    )]);

    if (teamScopeAccountIds.length > TEAM_SCOPE_WARN_THRESHOLD) {
        // 캡이 아니라 관측 신호 — 여기서 잘라내면 권한이 조용히 좁아진다.
        console.warn(`[PrincipalResolver] teamScopeAccountIds=${teamScopeAccountIds.length} (> ${TEAM_SCOPE_WARN_THRESHOLD})`);
    }

    return { ...teamCtx, teamScopeAccountIds, leadingScopeAccountIds };
};

/**
 * 신원/권한 해석. 캐시 히트 시 조회 0회.
 * @param {object} context resolver req.context (accountId 포함)
 * @returns {Promise<object>} principal
 */
export const resolvePrincipal = async (context) => {
    const accountId = context?.accountId;
    if (!accountId) {
        throw new PermissionError(
            ErrorCodes.PERMISSION_PRINCIPAL_UNRESOLVED,
            'Principal accountId is not available in context',
        );
    }

    const cached = cache.get(accountId);
    if (cached && cached.expireAt > Date.now()) {
        return cached.value;
    }

    const principal = await buildPrincipal(accountId);
    cache.set(accountId, { value: principal, expireAt: Date.now() + CACHE_TTL_MS });
    return principal;
};

const buildPrincipal = async (accountId) => {
    const isAdmin = await isAdministrator();

    // 1) Jira ADMINISTER → 전권 Admin (항상 projectScope ALL)
    if (isAdmin) {
        const pages = getSeedPages('admin');

        // 팀 정보는 best-effort 로만 채운다 — 권한 판정에는 쓰이지 않고(admin 은 전권 바이패스),
        //   /my-page "내 팀" 섹션 노출 같은 **표시 용도**다. 실패해도 admin 동작에 영향이 없다.
        //   ★ 여기서도 users 행이 있어야 팀장으로 인정한다(stale leaderAccountId fail-close 일관).
        let teamCtx = emptyTeamContext();
        try {
            const rows = (await getUserInfoService({ accountId }))?.rows ?? [];
            if (rows.length > 0) {
                const { teamIndex, ...ctx } = await resolveTeamContext(accountId, rows[0].team_key ?? null);
                teamCtx = ctx;
            }
        } catch (e) {
            console.error('[PrincipalResolver] admin team context error:', e);
        }

        return {
            accountId,
            isAdmin: true,
            isUser: true,
            name: 'Admin',
            pages,
            resourceMap: pagesToResourceMap(pages),
            projectScope: 'ALL',
            memberProjectIds: null,
            ...teamCtx,
            permissionSource: 'personal',
        };
    }

    // 2) users DB 조회 → permission_key / team_key
    let dbUserInfo = [];
    try {
        dbUserInfo = (await getUserInfoService({ accountId }))?.rows ?? [];
    } catch (e) {
        console.error('[PrincipalResolver] getUserInfoService error:', e);
    }

    // 3) 미등록 사용자 → 전부 false (fail-close)
    //    ★ 팀 컨텍스트를 **계산하지 않는다.** KVS team.leaderAccountId 에 이 계정이 stale 하게
    //      남아 있어도 leadingTeamKeys=[] → isTeamLead=false 로 고정된다(§4-1 fail-open 차단).
    if (!dbUserInfo || dbUserInfo.length === 0) {
        const pages = allFalsePages();
        return {
            accountId,
            isAdmin: false,
            isUser: false,
            name: 'undefined',
            pages,
            resourceMap: pagesToResourceMap(pages),
            projectScope: 'ALL',
            memberProjectIds: null,
            ...emptyTeamContext(),
            permissionSource: 'none',
        };
    }

    // 4) 팀 컨텍스트 (users 행 확인 후에만 계산 — 위 3) 주석 참조)
    const { teamIndex, ...baseTeamCtx } = await resolveTeamContext(accountId, dbUserInfo[0].team_key ?? null);

    // 5) 권한 세트 결정 — **개인 오버라이드 → 팀 상속 fallback** (R2. 합집합 아님)
    //    한 번에 하나의 세트만 적용되므로 projectScope 가 두 출처에서 섞이는 경우가 원천 차단된다.
    let permissionKey = dbUserInfo[0].permission_key ?? null;
    let permissionSource = 'personal';

    if (!permissionKey) {
        /*
         * 상속 시작점: 소속 팀 → 없으면 **이끄는 팀**.
         *   "팀장도 그 팀의 일원"이므로, 소속이 비어 있는 팀장도 자기 팀(과 상위)의 권한 세트를 상속해야 한다.
         *   이게 없으면 팀에 세트가 지정돼 있는데도 곧바로 프리셋 바닥값으로 떨어져
         *   `개인 → 팀 상속 → 기본값` 순서가 뒤집힌다.
         */
        const inheritFrom = baseTeamCtx.teamKey ?? baseTeamCtx.leadingTeamKeys?.[0] ?? null;
        const inherited = (inheritFrom && teamIndex)
            ? nearestAncestorWith(teamIndex, inheritFrom, t => !!t.permissionKey)
            : null;

        if (inherited) {
            permissionKey = inherited.permissionKey;
            permissionSource = 'team';
        } else {
            /*
             * 팀 기본 세트 (2026-08-05) — 개인 권한도 없고 팀에서 상속받을 세트도 없을 때의 바닥값.
             *
             * 이전에는 곧바로 전 리소스 false 였다. 그 결과 "팀에는 속해 있는데 아무것도 못 보는" 인원이
             * 생겼고, 관리자가 한 명씩 세트를 지정하기 전까지 앱이 사실상 비어 보였다.
             *
             * 🔴 fail-close 를 **의도적으로 완화**하는 지점이다. 다만 무제한 완화가 아니다:
             *    · 팀 컨텍스트가 있는 사람만 받는다 — 팀도 없고 팀장도 아니면 종전대로 전 리소스 false.
             *    · 두 프리셋 모두 `projectScope: 'TEAM_ONLY'` + WORKFORCE 읽기 전용이고,
             *      PROJECT_COST(재무)는 닫혀 있다(`SeedData.js` PRESET_PERMISSION_SETS).
             *    · 관리자가 프리셋을 지웠다면 KVS 조회가 null → `mergeSetPages([])` 로 전부 false 다.
             *      즉 세트가 없으면 자동으로 종전 동작(fail-close)으로 돌아간다.
             */
            const preset = baseTeamCtx.isTeamLead
                ? TEAM_LEAD_PRESET_ID
                : (baseTeamCtx.teamKey ? TEAM_MEMBER_PRESET_ID : null);

            if (preset) {
                permissionKey = preset;
                permissionSource = 'team-default';
            } else {
                permissionSource = 'none';
            }
        }
    }

    // 6) 상속받을 세트가 없으면 전 리소스 false (fail-close). KVS 조회 자체를 하지 않는다.
    if (permissionSource === 'none') {
        const pages = allFalsePages();
        return {
            accountId,
            isAdmin: false,
            isUser: true,
            name: 'undefined',
            pages,
            resourceMap: pagesToResourceMap(pages),
            projectScope: 'ALL',
            memberProjectIds: null,

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js' 1 360; Get-Content 'static/ui/node_modules/@atlaskit/tabs/dist/esm/components/tabs.js' | Select-Object -First 180; Get-Content 'static/ui/node_modules/@atlaskit/tabs/dist/cjs/components/tabs.js' | Select-Object -First 180; rg -n -C 3 \"@atlaskit/tabs\" static/ui/package-lock.json static/ui/node_modules/@atlaskit/tabs/package.json package-lock.json" in C:\CloudJira\moves-workforce
 succeeded in 2891ms:

--- static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js:1-360 ---
    1: /**
    2:  * ResourcePage ??留덉슫??怨꾩빟 ??@atlaskit/tabs ??"諛⑸Ц???⑤꼸留?留덉슫?? 諛⑸Ц ???좎?" ?숈옉 怨좎젙.
    3:  *
    4:  * 諛곌꼍(2026-08-12 ?깅뒫 媛먯궗 P1-2 ?먯젙): `TabPanel` ?먯껜??children ??臾댁“嫄??뚮뜑?섏?留?
    5:  * ?곸쐞 `Tabs`(18.3.4)媛 `visited` Set ???덈뒗 ?⑤꼸留??뚮뜑?쒕떎(`dist/esm/components/tabs.js`).
    6:  * ?곕씪??`ResourcePage` ???④? ??? 遺꾩꽍/?꾨줈?앺듃 諛곗젙)? **留덉슫?몃릺吏 ?딄퀬 invoke ??諛쒖깮?섏? ?딅뒗??* ?? * 蹂꾨룄??lazy 寃뚯씠?몃? ?먯쑝濡?留뚮뱾 ?꾩슂媛 ?녿떎. ???뚯뒪?몃뒗 Atlaskit ?낃렇?덉씠?쒕줈 洹??꾩젣媛
    7:  * 源⑥?硫?= ?④? ??씠 留덉슫?몃릺湲??쒖옉?섎㈃) 利됱떆 ?ㅽ뙣?쒗궎湲??꾪븳 寃껋씠??
    8:  */
    9: import React, { act } from 'react';
   10: import { createRoot } from 'react-dom/client';
   11: import Tabs, { Tab, TabList, TabPanel } from '@atlaskit/tabs';
   12: 
   13: // ??猷⑦듃??legacy ReactDOM.render 吏留? ??留덉슫???숈옉? 猷⑦듃 紐⑤뱶? 臾닿??섎떎.
   14: // ?뚯뒪?몃뒗 createRoot 瑜??⑥꽌 React 18 寃쎄퀬 ?몄씠利??놁씠 ?뺤씤?쒕떎.
   15: global.IS_REACT_ACT_ENVIRONMENT = true;
   16: 
   17: const renderTabs = (events) => {
   18:     const Probe = ({ name }) => {
   19:         React.useEffect(() => {
   20:             events.push(`mount:${name}`);
   21:             return () => events.push(`unmount:${name}`);
   22:         }, [name]);
   23:         return <div>{name}</div>;
   24:     };
   25:     const container = document.createElement('div');
   26:     document.body.appendChild(container);
   27:     const root = createRoot(container);
   28:     act(() => {
   29:         root.render(
   30:             <Tabs id="resource-tabs">
   31:                 <TabList>
   32:                     <Tab>overview</Tab>
   33:                     <Tab>organization</Tab>
   34:                     {/* ResourcePage ? ?숈씪?섍쾶 議곌굔遺 ??쓣 ?쇱썙 ?몃뜳???뺣젹???④퍡 寃利?*/}
   35:                     {true && <Tab>teamAnalytics</Tab>}
   36:                     <Tab>assignment</Tab>
   37:                 </TabList>
   38:                 <TabPanel><Probe name="overview" /></TabPanel>
   39:                 <TabPanel><Probe name="organization" /></TabPanel>
   40:                 {true && <TabPanel><Probe name="teamAnalytics" /></TabPanel>}
   41:                 <TabPanel><Probe name="assignment" /></TabPanel>
   42:             </Tabs>
   43:         );
   44:     });
   45:     return container;
   46: };
   47: 
   48: test('吏꾩엯 ??泥???쭔 留덉슫?몃맂??(?④? ??invoke ?놁쓬)', () => {
   49:     const events = [];
   50:     renderTabs(events);
   51:     expect(events).toEqual(['mount:overview']);
   52: });
   53: 
   54: test('???꾪솚 ??諛⑸Ц???⑤꼸? ?몃쭏?댄듃?섏? ?딅뒗??(?⑤꼸 ?곹깭쨌?ㅽ겕濡?蹂댁〈)', () => {
   55:     const events = [];
   56:     const container = renderTabs(events);
   57:     const tabs = container.querySelectorAll('[role="tab"]');
   58:     act(() => tabs[3].dispatchEvent(new MouseEvent('click', { bubbles: true })));
   59:     act(() => tabs[0].dispatchEvent(new MouseEvent('click', { bubbles: true })));
   60: 
   61:     // 議곌굔遺 ???ㅼ쓽 'assignment'(index 3) 媛 ?뺥솗??留ㅼ묶?섍퀬, ?섎룎?꾩????щ쭏?댄듃媛 ?녿떎.
   62:     expect(events).toEqual(['mount:overview', 'mount:assignment']);
   63: });
/* tabs.tsx generated by @compiled/babel-plugin v0.38.1 */
import _defineProperty from "@babel/runtime/helpers/defineProperty";
import _toArray from "@babel/runtime/helpers/toArray";
import _slicedToArray from "@babel/runtime/helpers/slicedToArray";
import "./tabs.compiled.css";
import * as React from 'react';
import { ax, ix } from "@compiled/react/runtime";
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
import { Children, Fragment, useCallback, useRef, useState } from 'react';
import { usePlatformLeafEventHandler } from '@atlaskit/analytics-next/usePlatformLeafEventHandler';
import { TabListContext, TabPanelContext } from '../internal/context';
var baseStyles = null;
var tabsStyles = null;
var analyticsAttributes = {
  componentName: 'tabs',
  packageName: "@atlaskit/tabs",
  packageVersion: "0.0.0-development"
};
var getTabPanelWithContext = function getTabPanelWithContext(_ref) {
  var tabPanel = _ref.tabPanel,
    index = _ref.index,
    isSelected = _ref.isSelected,
    tabsId = _ref.tabsId;
  return (
    // Ensure tabPanel exists in case it has been removed
    tabPanel && /*#__PURE__*/React.createElement(TabPanelContext.Provider, {
      value: {
        role: 'tabpanel',
        id: "".concat(tabsId, "-").concat(index, "-tab"),
        hidden: isSelected ? undefined : true,
        'aria-labelledby': "".concat(tabsId, "-").concat(index),
        tabIndex: isSelected ? 0 : -1
      },
      key: index
    }, tabPanel)
  );
};

/**
 * __Tabs__
 *
 * Tabs acts as a container for all Tab components.
 *
 * - [Examples](https://atlassian.design/components/tabs/examples)
 * - [Code](https://atlassian.design/components/tabs/code)
 * - [Usage](https://atlassian.design/components/tabs/usage)
 */
var Tabs = function Tabs(props) {
  var _props$shouldUnmountT = props.shouldUnmountTabPanelOnChange,
    shouldUnmountTabPanelOnChange = _props$shouldUnmountT === void 0 ? false : _props$shouldUnmountT,
    SelectedType = props.selected,
    defaultSelected = props.defaultSelected,
    onChangeProp = props.onChange,
    id = props.id,
    analyticsContext = props.analyticsContext,
    children = props.children,
    testId = props.testId;
  var _useState = useState(SelectedType || defaultSelected || 0),
    _useState2 = _slicedToArray(_useState, 2),
    selectedState = _useState2[0],
    setSelected = _useState2[1];
  var selected = SelectedType === undefined ? selectedState : SelectedType;
  var childrenArray = Children.toArray(children)
  // Don't include any conditional children
  .filter(function (child) {
    return Boolean(child);
  });
  // First child should be a tabList followed by tab panels
  var _childrenArray = _toArray(childrenArray),
    tabList = _childrenArray[0],
    tabPanels = _childrenArray.slice(1);

  // Keep track of visited and add to a set
  var visited = useRef(new Set([selected]));
  if (!visited.current.has(selected)) {
    visited.current.add(selected);
  }
  var onChange = useCallback(function (index, analyticsEvent) {
    if (onChangeProp) {
      onChangeProp(index, analyticsEvent);
    }
    setSelected(index);
  }, [onChangeProp]);
  var onChangeAnalytics = usePlatformLeafEventHandler(_objectSpread({
    fn: onChange,
    action: 'clicked',
    analyticsData: analyticsContext
  }, analyticsAttributes));
  var tabPanelsWithContext = shouldUnmountTabPanelOnChange ? getTabPanelWithContext({
    tabPanel: tabPanels[selected],
    index: selected,
    isSelected: true,
    tabsId: id
  }) :
  // If a panel has already been visited, don't unmount it
  Array.from(visited.current).map(function (tabIndex) {
    return getTabPanelWithContext({
      tabPanel: tabPanels[tabIndex],
      index: tabIndex,
      isSelected: tabIndex === selected,
      tabsId: id
    });
  });
  return /*#__PURE__*/React.createElement("div", {
    "data-testid": testId,
    className: ax(["_1e0c1txw _p12f1osq _1tkeidpf _i0dl1osq _2lx21bp4 _16jlkb7n", "_1c3y1txw _ftfaidpf _18i0kb7n _185bglyw"])
  }, /*#__PURE__*/React.createElement(TabListContext.Provider, {
    value: {
      selected: selected,
      onChange: onChangeAnalytics,
      tabsId: id
    }
  }, tabList), /*#__PURE__*/React.createElement(Fragment, null, tabPanelsWithContext));
};
export default Tabs;
/* tabs.tsx generated by @compiled/babel-plugin v0.38.1 */
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _typeof = require("@babel/runtime/helpers/typeof");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
require("./tabs.compiled.css");
var _react = _interopRequireWildcard(require("react"));
var React = _react;
var _runtime = require("@compiled/react/runtime");
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _toArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toArray"));
var _slicedToArray2 = _interopRequireDefault(require("@babel/runtime/helpers/slicedToArray"));
var _usePlatformLeafEventHandler = require("@atlaskit/analytics-next/usePlatformLeafEventHandler");
var _context = require("../internal/context");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f; })(e, t); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { (0, _defineProperty2.default)(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
var baseStyles = null;
var tabsStyles = null;
var analyticsAttributes = {
  componentName: 'tabs',
  packageName: "@atlaskit/tabs",
  packageVersion: "0.0.0-development"
};
var getTabPanelWithContext = function getTabPanelWithContext(_ref) {
  var tabPanel = _ref.tabPanel,
    index = _ref.index,
    isSelected = _ref.isSelected,
    tabsId = _ref.tabsId;
  return (
    // Ensure tabPanel exists in case it has been removed
    tabPanel && /*#__PURE__*/React.createElement(_context.TabPanelContext.Provider, {
      value: {
        role: 'tabpanel',
        id: "".concat(tabsId, "-").concat(index, "-tab"),
        hidden: isSelected ? undefined : true,
        'aria-labelledby': "".concat(tabsId, "-").concat(index),
        tabIndex: isSelected ? 0 : -1
      },
      key: index
    }, tabPanel)
  );
};

/**
 * __Tabs__
 *
 * Tabs acts as a container for all Tab components.
 *
 * - [Examples](https://atlassian.design/components/tabs/examples)
 * - [Code](https://atlassian.design/components/tabs/code)
 * - [Usage](https://atlassian.design/components/tabs/usage)
 */
var Tabs = function Tabs(props) {
  var _props$shouldUnmountT = props.shouldUnmountTabPanelOnChange,
    shouldUnmountTabPanelOnChange = _props$shouldUnmountT === void 0 ? false : _props$shouldUnmountT,
    SelectedType = props.selected,
    defaultSelected = props.defaultSelected,
    onChangeProp = props.onChange,
    id = props.id,
    analyticsContext = props.analyticsContext,
    children = props.children,
    testId = props.testId;
  var _useState = (0, _react.useState)(SelectedType || defaultSelected || 0),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    selectedState = _useState2[0],
    setSelected = _useState2[1];
  var selected = SelectedType === undefined ? selectedState : SelectedType;
  var childrenArray = _react.Children.toArray(children)
  // Don't include any conditional children
  .filter(function (child) {
    return Boolean(child);
  });
  // First child should be a tabList followed by tab panels
  var _childrenArray = (0, _toArray2.default)(childrenArray),
    tabList = _childrenArray[0],
    tabPanels = _childrenArray.slice(1);

  // Keep track of visited and add to a set
  var visited = (0, _react.useRef)(new Set([selected]));
  if (!visited.current.has(selected)) {
    visited.current.add(selected);
  }
  var onChange = (0, _react.useCallback)(function (index, analyticsEvent) {
    if (onChangeProp) {
      onChangeProp(index, analyticsEvent);
    }
    setSelected(index);
  }, [onChangeProp]);
  var onChangeAnalytics = (0, _usePlatformLeafEventHandler.usePlatformLeafEventHandler)(_objectSpread({
    fn: onChange,
    action: 'clicked',
    analyticsData: analyticsContext
  }, analyticsAttributes));
  var tabPanelsWithContext = shouldUnmountTabPanelOnChange ? getTabPanelWithContext({
    tabPanel: tabPanels[selected],
    index: selected,
    isSelected: true,
    tabsId: id
  }) :
  // If a panel has already been visited, don't unmount it
  Array.from(visited.current).map(function (tabIndex) {
    return getTabPanelWithContext({
      tabPanel: tabPanels[tabIndex],
      index: tabIndex,
      isSelected: tabIndex === selected,
      tabsId: id
    });
  });
  return /*#__PURE__*/React.createElement("div", {
    "data-testid": testId,
    className: (0, _runtime.ax)(["_1e0c1txw _p12f1osq _1tkeidpf _i0dl1osq _2lx21bp4 _16jlkb7n", "_1c3y1txw _ftfaidpf _18i0kb7n _185bglyw"])
  }, /*#__PURE__*/React.createElement(_context.TabListContext.Provider, {
    value: {
      selected: selected,
      onChange: onChangeAnalytics,
      tabsId: id
    }
  }, tabList), /*#__PURE__*/React.createElement(_react.Fragment, null, tabPanelsWithContext));
};
var _default = exports.default = Tabs;
static/ui/node_modules/@atlaskit/tabs/package.json-1-{
static/ui/node_modules/@atlaskit/tabs/package.json:2:	"name": "@atlaskit/tabs",
static/ui/node_modules/@atlaskit/tabs/package.json-3-	"version": "18.3.4",
static/ui/node_modules/@atlaskit/tabs/package.json-4-	"description": "Tabs are used to organize content by grouping similar information on the same page.",
static/ui/node_modules/@atlaskit/tabs/package.json-5-	"publishConfig": {
--
static/ui/package-lock.json-41-        "@atlaskit/skeleton": "^2.1.5",
static/ui/package-lock.json-42-        "@atlaskit/spinner": "^19.0.9",
static/ui/package-lock.json-43-        "@atlaskit/table-tree": "^12.3.0",
static/ui/package-lock.json:44:        "@atlaskit/tabs": "^18.3.4",
static/ui/package-lock.json-45-        "@atlaskit/textarea": "^8.2.2",
static/ui/package-lock.json-46-        "@atlaskit/textfield": "^8.2.1",
static/ui/package-lock.json-47-        "@atlaskit/toggle": "^15.2.12",
--
static/ui/package-lock.json-4188-        "react": ">=18.0.0"
static/ui/package-lock.json-4189-      }
static/ui/package-lock.json-4190-    },
static/ui/package-lock.json:4191:    "node_modules/@atlaskit/tabs": {
static/ui/package-lock.json-4192-      "version": "18.3.4",
static/ui/package-lock.json:4193:      "resolved": "https://registry.npmjs.org/@atlaskit/tabs/-/tabs-18.3.4.tgz",
static/ui/package-lock.json-4194-      "integrity": "sha512-fuTB92DM8sfUIQtN+E3LA2L2jipBPMJ35ZQe2bC4GFRalgurWgcfOSw7zcl2fkIl7TXsGSoV4CwbU+fe0y4TvA==",
static/ui/package-lock.json-4195-      "license": "Apache-2.0",
static/ui/package-lock.json-4196-      "dependencies": {
--
static/ui/package-lock.json-4206-        "react": "^18.2.0"
static/ui/package-lock.json-4207-      }
static/ui/package-lock.json-4208-    },
static/ui/package-lock.json:4209:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/app-provider": {
static/ui/package-lock.json-4210-      "version": "4.1.0",
static/ui/package-lock.json-4211-      "resolved": "https://registry.npmjs.org/@atlaskit/app-provider/-/app-provider-4.1.0.tgz",
static/ui/package-lock.json-4212-      "integrity": "sha512-n6M1QVOxa+lDO9bPnxNmLhDUkUxAspkMd9/COPieg8qge3eb1qi498MI2+pUyx+PpG02E1HyLivVJDHYhmuCFg==",
--
static/ui/package-lock.json-4223-        "react": "^18.2.0"
static/ui/package-lock.json-4224-      }
static/ui/package-lock.json-4225-    },
static/ui/package-lock.json:4226:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/ds-lib": {
static/ui/package-lock.json-4227-      "version": "5.3.0",
static/ui/package-lock.json-4228-      "resolved": "https://registry.npmjs.org/@atlaskit/ds-lib/-/ds-lib-5.3.0.tgz",
static/ui/package-lock.json-4229-      "integrity": "sha512-j3DLHqBACSJsG3XqSgCIwZqvJhYkpSC8i+24n/JYCRjIxYEJMsuSXOtdeu0qBajREwgzmAFP6AVfVZh1zAWG/A==",
--
static/ui/package-lock.json-4239-        "react": "^18.2.0"
static/ui/package-lock.json-4240-      }
static/ui/package-lock.json-4241-    },
static/ui/package-lock.json:4242:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/primitives": {
static/ui/package-lock.json-4243-      "version": "18.0.0",
static/ui/package-lock.json-4244-      "resolved": "https://registry.npmjs.org/@atlaskit/primitives/-/primitives-18.0.0.tgz",
static/ui/package-lock.json-4245-      "integrity": "sha512-1NJvzJHN9d7I2w3Yp9AYJN/55FFZcQUhxlvVU9UxIiiSqejCZ4URLWRwBg107J4+mfULBjaajpGXHzyBaK177g==",
--
static/ui/package-lock.json-4263-        "react": "^18.2.0"
static/ui/package-lock.json-4264-      }
static/ui/package-lock.json-4265-    },
static/ui/package-lock.json:4266:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/theme": {
static/ui/package-lock.json-4267-      "version": "21.0.3",
static/ui/package-lock.json-4268-      "resolved": "https://registry.npmjs.org/@atlaskit/theme/-/theme-21.0.3.tgz",
static/ui/package-lock.json-4269-      "integrity": "sha512-wUzlf1isVAo+uXaHaEs7yRC2lqcRRoL4qDsJuK92pw+nDOvzaK5wF2mR1J3lSEmCMB8M1Fhu55XoJ2sIswiadQ==",
--
static/ui/package-lock.json-4277-        "react": "^18.2.0"
static/ui/package-lock.json-4278-      }
static/ui/package-lock.json-4279-    },
static/ui/package-lock.json:4280:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/theme/node_modules/@atlaskit/tokens": {
static/ui/package-lock.json-4281-      "version": "9.1.2",
static/ui/package-lock.json-4282-      "resolved": "https://registry.npmjs.org/@atlaskit/tokens/-/tokens-9.1.2.tgz",
static/ui/package-lock.json-4283-      "integrity": "sha512-3JXke1jwMUUWF5nW0YGUEmQa9byg1h6yjF4m5gL4sKJJ0qt6Q/jmaugIFpPyuptwZGov+mBZlVbuwcoMVJDKow==",
--
static/ui/package-lock.json-4294-        "react": "^18.2.0"
static/ui/package-lock.json-4295-      }
static/ui/package-lock.json-4296-    },
static/ui/package-lock.json:4297:    "node_modules/@atlaskit/tabs/node_modules/@atlaskit/tokens": {
static/ui/package-lock.json-4298-      "version": "11.0.0",
static/ui/package-lock.json-4299-      "resolved": "https://registry.npmjs.org/@atlaskit/tokens/-/tokens-11.0.0.tgz",
static/ui/package-lock.json-4300-      "integrity": "sha512-uAej+DW3Oujh2sdEK7NqzQtKof0XQzfRx5cX9wBvag/rYQwAclYWLQ17LqNzJhwaF7SQykFnWKucsL3Y4Cmo3Q==",
--
static/ui/package-lock.json-4311-        "react": "^18.2.0"
static/ui/package-lock.json-4312-      }
static/ui/package-lock.json-4313-    },
static/ui/package-lock.json:4314:    "node_modules/@atlaskit/tabs/node_modules/@compiled/react": {
static/ui/package-lock.json-4315-      "version": "0.18.6",
static/ui/package-lock.json-4316-      "resolved": "https://registry.npmjs.org/@compiled/react/-/react-0.18.6.tgz",
static/ui/package-lock.json-4317-      "integrity": "sha512-Mt6sJOwykeoToEBFbOUNR4xABi2gOr/+X5QSGqGEYiCBMh+XPDAclG2UX94zveiYJXO4AUJIQBCVwa4/lwPMBA==",
--
static/ui/package-lock.json-34741-        }
static/ui/package-lock.json-34742-      }
static/ui/package-lock.json-34743-    },
static/ui/package-lock.json:34744:    "@atlaskit/tabs": {
static/ui/package-lock.json-34745-      "version": "18.3.4",
static/ui/package-lock.json:34746:      "resolved": "https://registry.npmjs.org/@atlaskit/tabs/-/tabs-18.3.4.tgz",
static/ui/package-lock.json-34747-      "integrity": "sha512-fuTB92DM8sfUIQtN+E3LA2L2jipBPMJ35ZQe2bC4GFRalgurWgcfOSw7zcl2fkIl7TXsGSoV4CwbU+fe0y4TvA==",
static/ui/package-lock.json-34748-      "requires": {
static/ui/package-lock.json-34749-        "@atlaskit/analytics-next": "^11.1.0",

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
web search: 
web search: site:developer.atlassian.com Forge KVS custom entity query eventual consistency get strong consistency ...
hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force '.container-service-assets' | Select-Object Name,Length,Mode,LastWriteTime; Get-ChildItem -Force '.container-service-assets' -Recurse -File | Measure-Object Length -Sum | Select-Object Count,Sum; Get-Item 'du.exe.stackdump' | Select-Object Name,Length,LastWriteTime; Get-Content -TotalCount 80 'du.exe.stackdump'; Get-Content -Raw '.gitignore'; git -c safe.directory=C:/CloudJira/moves-workforce ls-files --others --exclude-standard" in C:\CloudJira\moves-workforce
 succeeded in 2289ms:

.container-service-assets/local-account
du.exe.stackdump
src/queue/__test__/JobCompletion.test.js
static/ui/src/components/calendar/FullCalendarLazy.jsx
static/ui/src/components/markdown/MarkdownEditorLazy.jsx
static/ui/src/pages/projectDetail/work/WORK_VIEWS.md
static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js
Name             Length Mode   LastWriteTime        
----             ------ ----   -------------        
local-account       830 -a---- 2026-08-12 오전 9:13:43
                                                    
du.exe.stackdump   1699        2026-08-04 오전 9:25:24
Stack trace:
Frame         Function      Args
0007FFFFBF80  000210060304 (000000000002, 0007FFFFCE00, 000000000000, 0007FFFFDC10) msys-2.0.dll+0x20304
FFFFFFFFFFFEFEDF  00021006237D (0007FFFFC930, 000700000000, 00000000059C, 000000000000) msys-2.0.dll+0x2237D
0007FFFFC690  0002100C1394 (00021021C6E7, 000800020CB0, 000000000003, 000000000000) msys-2.0.dll+0x81394
000000000006  0002100BCE39 (8080808080808080, 004000000010, 000000000000, 0003000000FF) msys-2.0.dll+0x7CE39
000000000001  0002100BD23A (000A00002970, 000000000003, 000000000001, 000A00010360) msys-2.0.dll+0x7D23A
000000000001  0002102130B8 (000000000003, 000000000001, 000A00010360, 00001822BEDD) msys-2.0.dll+0x1D30B8
000000000001  0001004203DB (000A00000003, 00010042B0C0, 00000000000B, 00010042B0C0) du.exe+0x203DB
000000000001  00010040ED25 (000430B475F0, 0007FFFFCB50, 00010042B0C0, 0007FFFFCB60) du.exe+0xED25
000000000001  00010041F750 (0002100455E0, 0000007B4380, 000000000150, 000000000000) du.exe+0x1F750
0007FFFFCD30  000210047F01 (000000000000, 000000000000, 000000000000, 000000000000) msys-2.0.dll+0x7F01
000000000000  000210045AC3 (000000000000, 000000000000, 000000000000, 000000000000) msys-2.0.dll+0x5AC3
0007FFFFFFF0  000210045B74 (000000000000, 000000000000, 000000000000, 000000000000) msys-2.0.dll+0x5B74
End of stack trace
Loaded modules:
000100400000 du.exe
7FFE62CE0000 ntdll.dll
7FFE617D0000 KERNEL32.DLL
7FFE60050000 KERNELBASE.dll
000430B30000 msys-intl-8.dll
000210040000 msys-2.0.dll
0005603F0000 msys-iconv-2.dll
7FFE61E90000 advapi32.dll
7FFE60B60000 msvcrt.dll
7FFE61B70000 sechost.dll
7FFE618A0000 RPCRT4.dll
7FFE5F3A0000 CRYPTBASE.DLL
7FFE607F0000 bcryptPrimitives.dll
# These are some examples of commonly ignored file patterns.
# You should customize this list as applicable to your project.
# Learn more about .gitignore:
#     https://www.atlassian.com/git/tutorials/saving-changes/gitignore

# Node artifact files
node_modules/
dist/

# Compiled Java class files
*.class

# Compiled Python bytecode
*.py[cod]

# Log files
*.log

# Package files
*.jar

# Maven
target/
dist/

# JetBrains IDE
.idea/

# Unit test reports
TEST*.xml

# Generated by MacOS
.DS_Store

# Generated by Windows
Thumbs.db

# Applications
*.app
*.exe
*.war

# Large media files
*.mp4
*.tiff
*.avi
*.flv
*.mov
*.wmv
*.toml

#forge
/.forge/

#locales merge
/locales/*.json

#feature-harness ?묒뾽 ?곗텧臾??ㅺ퀎?쑣룸━?ы듃 ??scratch)
/_workspace/

#?곕え ?쒕뜑 ??肄붾뱶 ?꾩껜 而ㅻ컠 ?쒖쇅 (?쒖뿰???꾩떆 ?꾧뎄, manifest.yml ??demo-seed-trigger 蹂寃쎈텇??而ㅻ컠 ???쒖쇅??寃?
/scripts/demo-seed/
/src/trigger/demoSeed.js

#臾몄꽌쨌?명듃쨌?섎꽕???ㅼ젙 (肄붾뱶留?而ㅻ컠)
/CLAUDE.md
/.claude/
/2026-*.md
/src/resolver/projectProgress/CALCULATION.md
/Moves_Workforce_*.md
/?쇱씠?좎뒪_?뺤콉_援ы쁽.md
/src/resolver/gantt/GANTT.md

/.agents/*


/Moves_Workforce_?ъ슜??留ㅻ돱??*



hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -Raw '.container-service-assets/local-account'; git -c safe.directory=C:/CloudJira/moves-workforce check-ignore -v '.container-service-assets/local-account' 'du.exe.stackdump' 'static/ui/src/pages/projectDetail/work/WORK_VIEWS.md' 'src/resolver/gantt/GANTT.md'" in C:\CloudJira\moves-workforce
 succeeded in 2122ms:
eyJhbGciOiJSUzI1NiIsImtpZCI6ImZvcmdlL3Byb3h5LXRva2VuL3dmLTAyNzA5ZjYyLTU0OWYtNDQ2ZS1iN2QwLWQwNzQyZWNlNDI2ZSJ9.eyJpc1R1bm5lbFRva2VuIjp0cnVlLCJlbnZpcm9ubWVudElkIjoiNmE0MjkxMzMtMTAzNC00M2NjLTgyMDEtNzFmZDA1NGIxNDk3IiwiYXBwSWQiOiJmODk2MmYxNy05ZjEyLTQzZDAtOTFmNS03ZjNhNjI2YzFiYmYiLCJpc3MiOiJmb3JnZS9wcm94eS10b2tlbiIsImF1ZCI6WyJ4ZW4taW52b2NhdGlvbi1zZXJ2aWNlIl0sImlhdCI6MTc4NjQ5MzYyMywibmJmIjoxNzg2NDkzNjIzLCJleHAiOjE3ODY0OTcxMjMsImp0aSI6IjAwNjY3YTAwMTZlZGNiZmI1OWUxMTgzZTNhZTA3ZjA4NjMyN2ExNzcifQ.NdgTPErMP6Bz75x_kRIdk7CgNGe8owopKRIiiM_ycto_Xd1RoKKWCYG1ae6PQ45W9QjdS6HkQtH3eDca-q1en8t5xstRlTT9s1agKx7MWKnzWeT6Bbr6yKlH_oisICdBNm7F2Vu3rNFZuUJmg6Jvfao1dWuDgLPbazY0Zl50t35ksnUXJP2Uws_c3yPSi6RRT5aYxCFwyCLxdoAAO2CIGVO4lvoPigInA-pi7fSx-BbYDFyYF-nmy7p7k6WwLfDWlcHwfKVUM1gQpfqKU-ynPEaFIy6J5WUTKkU1jnvbygF5rlHhlaftopHCjLmCBIWlqcx75CbQftD4jU1q7mXmDA
.gitignore:72:/src/resolver/gantt/GANTT.md	src/resolver/gantt/GANTT.md

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
codex
프론트에서는 invalidate 제거 자체보다, 동일 gantt 캐시에 대한 동시 mutation의 전체-snapshot 롤백이 성공한 다른 편집을 되돌릴 수 있는지를 확인했습니다. 이어서 신규 테스트를 실제로 실행하고, 번들 lazy 경계의 실패 경로까지 마무리 점검하겠습니다.
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm test -- --runInBand --no-cache src/queue/__test__/JobCompletion.test.js; Set-Location static/ui; npm test -- --runInBand --no-cache src/pages/resource/__test__/resourceTabsLazyMount.test.js' in C:\CloudJira\moves-workforce
2026-08-12T09:59:08.389001Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 1.4 seconds
Output:
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:1
+ npm test -- --runInBand --no-cache src/queue/__test__/JobCompletion.t ...
+ ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:102
+ ... e/__test__/JobCompletion.test.js; Set-Location static/ui; npm test -- ...
+                                                               ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

 exited 1 in 1442ms:
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:1
+ npm test -- --runInBand --no-cache src/queue/__test__/JobCompletion.t ...
+ ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess
npm : 이 시스템에서 스크립트를 실행할 수 없으므로 C:\nvm4w\nodejs\npm.ps1 파일을 로드할 수 없습니다. 자세한 내용은 about_Execution_Policies(https://go.micr
osoft.com/fwlink/?LinkID=135170)를 참조하십시오.
위치 줄:2 문자:102
+ ... e/__test__/JobCompletion.test.js; Set-Location static/ui; npm test -- ...
+                                                               ~~~
    + CategoryInfo          : 보안 오류: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'npm.cmd test -- --runInBand --no-cache src/queue/__test__/JobCompletion.test.js; Set-Location static/ui; npm.cmd test -- --runInBand --no-cache src/pages/resource/__test__/resourceTabsLazyMount.test.js' in C:\CloudJira\moves-workforce
2026-08-12T09:59:18.587982Z ERROR codex_core::tools::router: error=Exit code: 1
Wall time: 6.1 seconds
Output:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand --no-cache src/queue/__test__/JobCompletion.test.js


> jira-global-page-custom-ui-static@0.1.62 test
> jest --runInBand --no-cache src/pages/resource/__test__/resourceTabsLazyMount.test.js

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)
Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e9df8be017b4b6dd6f37fd6b22c4c02f-1794e7a9bc289ea1dc38906c1ff72879-ba19decd084fb9c831572aaae0361611'
    at Object.openSync (node:fs:560:18)
    at Object.writeFileSync (node:fs:2451:35)
    at Object.writeFileSync (C:\CloudJira\moves-workforce\static\ui\node_modules\jest-serializer\build\index.js:100:15)
    at HasteMap._persist (C:\CloudJira\moves-workforce\static\ui\node_modules\jest-haste-map\build\index.js:847:31)
    at C:\CloudJira\moves-workforce\static\ui\node_modules\jest-haste-map\build\index.js:461:16
    at async C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:245:9
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:227:20)
    at async _run10000 (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:305:41)
    at async runCLI (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:173:3)

 exited 1 in 6087ms:

> jira-global-page-custom-ui@1.1.17 test
> jest --runInBand --no-cache src/queue/__test__/JobCompletion.test.js


> jira-global-page-custom-ui-static@0.1.62 test
> jest --runInBand --no-cache src/pages/resource/__test__/resourceTabsLazyMount.test.js

Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e4b078f4f1c39cefebd935f88c719534-4ed08feba65e805510c02c88ea2edee3-4b1b402037519a563ee00e5c1161109a'
    at Object.openSync (node:fs:560:18)
    at writeFileSync (node:fs:2451:35)
    at HasteMap._persist (C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2743:37)
    at C:\CloudJira\moves-workforce\node_modules\jest-haste-map\build\index.js:2480:16
    at async C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1487:48
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1476:20)
    at async _run10000 (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1538:7)
    at async runCLI (C:\CloudJira\moves-workforce\node_modules\@jest\core\build\index.js:1444:3)
    at async Object.run (C:\CloudJira\moves-workforce\node_modules\jest-cli\build\index.js:656:9)
Error: EPERM: operation not permitted, open 'C:\Users\DMOVE\AppData\Local\Temp\jest\haste-map-e9df8be017b4b6dd6f37fd6b22c4c02f-1794e7a9bc289ea1dc38906c1ff72879-ba19decd084fb9c831572aaae0361611'
    at Object.openSync (node:fs:560:18)
    at Object.writeFileSync (node:fs:2451:35)
    at Object.writeFileSync (C:\CloudJira\moves-workforce\static\ui\node_modules\jest-serializer\build\index.js:100:15)
    at HasteMap._persist (C:\CloudJira\moves-workforce\static\ui\node_modules\jest-haste-map\build\index.js:847:31)
    at C:\CloudJira\moves-workforce\static\ui\node_modules\jest-haste-map\build\index.js:461:16
    at async C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:245:9
    at async Promise.all (index 0)
    at async buildContextsAndHasteMaps (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:227:20)
    at async _run10000 (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:305:41)
    at async runCLI (C:\CloudJira\moves-workforce\static\ui\node_modules\@jest\core\build\cli\index.js:173:3)

hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'src/resolver/gantt/GanttMapper.js' 50 170; rg -n -C 3 \"computeProgress\\(|progress:\" src/resolver/gantt/GanttMapper.js static/ui/src/pages/projectDetail/gantt" in C:\CloudJira\moves-workforce
 succeeded in 1415ms:

--- src/resolver/gantt/GanttMapper.js:50-170 ---
   50:             }
   51:             if (lk.inwardIssue?.key) {
   52:                 index.set(`${lk.inwardIssue.key}->${issue.key}`, lk.id);
   53:             }
   54:         }
   55:     }
   56:     return index;
   57: };
   58: 
   59: /**
   60:  * timetracking 湲곕컲 吏꾪뻾瑜?洹쇱궗(0~1) ??M4 吏꾪뻾瑜??ㅻ쾭?덉씠 ???꾩떆媛?
   61:  *  - statusCategory done ??1
   62:  *  - originalEstimate ?덉쑝硫?min(timeSpent/original, 1)
   63:  *  - 洹???null (?곗텧 遺덇?)
   64:  */
   65: export const computeProgress = (fields) => {
   66:     const statusKey = fields?.statusCategory?.key ?? fields?.status?.statusCategory?.key ?? null;
   67:     if (statusKey === 'done') return 1;
   68: 
   69:     const tt = fields?.timetracking || {};
   70:     const orig = tt.originalEstimateSeconds;
   71:     const spent = tt.timeSpentSeconds;
   72:     if (orig != null && orig > 0 && spent != null) {
   73:         return Math.round(Math.min(spent / orig, 1) * 100) / 100;
   74:     }
   75:     return null;
   76: };
   77: 
   78: /**
   79:  * Jira raw issue ??Task 湲곕낯 媛앹껜.
   80:  * effectiveParent/type ???섏튂 吏묓빀 ?꾩껜媛 ?꾩슂?섎?濡?buildTasksAndLinks ?먯꽌 理쒖쥌 ?뺤젙?쒕떎.
   81:  * @param issue    Jira raw issue
   82:  * @param fieldIds { coworkerUserMap }
   83:  */
   84: export const normalizeIssue = (issue, fieldIds = {}) => {
   85:     const f = issue.fields || {};
   86:     const { coworkerUserMap } = fieldIds;
   87: 
   88:     // WBS 遺紐? ?댁뒋 ?꾨줈?쇳떚(movesRms.wbsParent)?먯꽌 read(? 愿由ы삎 吏??. ?댁젣=null, 鍮덈Ц?먥넂null ?뺢퇋???좎?.
   89:     const wbsParentRaw = issue?.properties?.[MOVES_PROPERTY_KEY]?.wbsParent ?? null;
   90:     const wbsParent = (typeof wbsParentRaw === 'string' && wbsParentRaw.trim()) ? wbsParentRaw.trim() : null;
   91: 
   92:     const jiraParent = f.parent?.key || null;
   93:     const start = f.customfield_10015 || null;
   94:     const end = f.duedate || null;
   95: 
   96:     // ?곹깭: ?묒뾽愿由?UI(StatusComponent)媛 colorName/name ?쇰줈 ?됰같吏瑜?洹몃━誘濡?移댄뀒怨좊━ 媛앹껜濡?諛섑솚.
   97:     const sc = f.statusCategory ?? f.status?.statusCategory ?? null;
   98:     const statusKey = sc?.key ?? null;
   99:     const statusCategory = sc
  100:         ? { key: sc.key ?? null, name: sc.name ?? null, colorName: sc.colorName ?? null }
  101:         : null;
  102:     // ?꾨줈?앺듃(ProjectComponent: avatar + name).
  103:     const project = f.project
  104:         ? {
  105:               id: f.project.id ?? null,
  106:               key: f.project.key ?? null,
  107:               name: f.project.name ?? null,
  108:               avatarUrl: f.project.avatarUrls?.['16x16'] ?? null,
  109:           }
  110:         : null;
  111:     // ?묒뾽??AvatarStack): ?댁뒋 ?꾨줈?쇳떚(movesRms) accountId[] ??GanttService 媛 resolve ??user 留듭쑝濡?蹂듭썝.
  112:     //   ?묐떟 怨꾩빟(coworkers = user 媛앹껜 諛곗뿴)? 臾댄쉶洹 ?좎?. 留?誘몄젣怨??⑥쐞?뚯뒪???? ??鍮?諛곗뿴.
  113:     const coworkerIds = issue?.properties?.[MOVES_PROPERTY_KEY]?.coworkers ?? [];
  114:     const coworkers = coworkerUserMap
  115:         ? coworkerIds.map(id => coworkerUserMap.get(id)).filter(Boolean)
  116:         : [];
  117: 
  118:     return {
  119:         id: issue.key,
  120:         key: issue.key,
  121:         // ?묒뾽??write(updateProjectIdField)媛 ?レ옄 Jira issue id 瑜??붽뎄 ???먮낯 id 瑜?string ?쇰줈 ?몄텧.
  122:         issueId: issue.id ?? null,
  123:         summary: f.summary ?? '',
  124:         start,
  125:         end,
  126:         type: 'task', // buildTasksAndLinks ?먯꽌 ?먯떇 ?좊Т쨌milestone ?먯젙?쇰줈 媛깆떊
  127:         issueType: f.issuetype?.name ?? null,
  128:         issueTypeIcon: f.issuetype?.iconUrl ?? null,
  129:         project,
  130:         jiraParent,
  131:         wbsParent,
  132:         effectiveParent: null, // buildTasksAndLinks ?먯꽌 ?뺤젙(짠6)
  133:         progress: computeProgress(f),
  134:         assignee: f.assignee
  135:             ? {
  136:                   accountId: f.assignee.accountId,
  137:                   displayName: f.assignee.displayName,
  138:                   avatarUrl: f.assignee.avatarUrls?.['24x24'] ?? null,
  139:               }
  140:             : null,
  141:         statusKey,
  142:         statusCategory,
  143:         coworkers,
  144:         // 洹몃━??"怨꾪쉷 ?묒뾽??(MD) 而щ읆 ?곗젙 湲곗?(珥?. progress 留됰?? 臾닿???蹂꾨룄 ?먯떆媛?
  145:         originalEstimateSeconds: f.timetracking?.originalEstimateSeconds ?? null,
  146:         // 洹몃━??"泥섎━??(%) 而щ읆 ?꾩슜 ?쎄린媛? 留됰? 梨꾩???progress(0~1)? ?덈? ?쇰룞 湲덉?.
  147:         progressPercent: f.aggregateprogress?.percent ?? null,
  148:         // ?대? 怨꾩궛???묐떟 吏곸쟾 ?쒓굅): ???댁뒋媛 愿?ы븳 Blocks 留곹겕 媛꾩꽑 ?꾨낫 [{ source, target }]
  149:         _links: buildLinksFromIssueLinks(issue),
  150:     };
  151: };
  152: 
  153: /**
  154:  * Jira raw issue 諛곗뿴 ??{ tasks, links }.
  155:  *  - effectiveParent = wbsParent ?? jiraParent ?? null. ?? 媛由ы궎???댁뒋媛 ?섏튂 吏묓빀???놁쑝硫?
  156:  *    臾댁떆?섍퀬 ?ㅼ쓬 ?꾨낫(?먮뒗 猷⑦듃). 援먯감/?좎떎 李몄“ 諛⑹뼱(짠6).
  157:  *  - type: ?먯떇 ?덉쑝硫?'summary', start==end(????議댁옱)硫?'milestone', 洹???'task'.
  158:  *  - links: 媛??댁뒋??Blocks ?댁뒋留곹겕(_links)瑜??쇱퀜 { source, target, type:'FS', lag:0 } ?⑹꽦.
  159:  *    (?ㅼ씠?곕툕 留곹겕??FS/lag 瑜????紐삵븯誘濡?type/lag ? ?쒖떆??怨좎젙媛?)
  160:  *    source/target ???섏튂 吏묓빀???놁쑝硫?dangling ?쇰줈 ?쒖쇅, self/以묐났 ?쒓굅.
  161:  * @param issues   Jira raw issue 諛곗뿴
  162:  * @param fieldIds { coworkerUserMap } (wbsParent ???댁뒋 ?꾨줈?쇳떚?먯꽌 吏곸젒 read)
  163:  */
  164: export const buildTasksAndLinks = (issues, fieldIds = {}) => {
  165:     const normalized = (issues || []).map((i) => normalizeIssue(i, fieldIds));
  166:     const keySet = new Set(normalized.map((t) => t.key));
  167: 
  168:     // 1) effectiveParent ?뺤젙 (?섏튂 吏묓빀 硫ㅻ쾭??寃利?
  169:     for (const t of normalized) {
  170:         if (t.wbsParent && keySet.has(t.wbsParent)) {
src/resolver/gantt/GanttMapper.js-130-        jiraParent,
src/resolver/gantt/GanttMapper.js-131-        wbsParent,
src/resolver/gantt/GanttMapper.js-132-        effectiveParent: null, // buildTasksAndLinks 에서 확정(§6)
src/resolver/gantt/GanttMapper.js:133:        progress: computeProgress(f),
src/resolver/gantt/GanttMapper.js-134-        assignee: f.assignee
src/resolver/gantt/GanttMapper.js-135-            ? {
src/resolver/gantt/GanttMapper.js-136-                  accountId: f.assignee.accountId,
--
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-364-            type: 'summary',
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-365-            folder: true,
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-366-            parent: f.parentFolderId ? folderNodeId(f.parentFolderId) : 0,
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:367:            progress: progress ?? 0, // 막대 채움(0~100)
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-368-            progressPercent: progress, // 처리율 컬럼(null → '-')
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-369-            originalEstimateSeconds: secSum, // 계획MD 합계 컬럼(null → '-')
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-370-            key: null,

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/projectDetail/gantt/ganttAdapter.js' 250 390; rg -n -C 4 \"function toSvarTasks|const toSvarTasks|toSvarTasks\" static/ui/src/pages/projectDetail/gantt; rg -n -C 3 \"updateIssue\" static/ui/src/utils/jiraApi src -g '*.js' | Select-Object -First 300; Show-Range 'static/ui/src/utils/jiraApi/requestJira.js' 1 250" in C:\CloudJira\moves-workforce
 succeeded in 1691ms:

--- static/ui/src/pages/projectDetail/gantt/ganttAdapter.js:250-390 ---
  250:  *  - 鍮??대뜑???뚮뜑(由щ뜑 吏??. ??open ? ?뚮뜑 ?먯떇(吏곸냽 ?댁뒋/?섏쐞?대뜑)???덉쓣 ?뚮쭔 遺??
  251:  *    (leaf+open:true ??SVAR null.forEach ?щ옒??諛⑹? ??寃利앸맂 洹쒖튃).
  252:  */
  253: export function synthesizeFolderNodes(folders, issueNodes, hourRate = 8, placeholderStart = null) {
  254:     const rate = hourRate > 0 ? hourRate : 8;
  255:     const emptyStart =
  256:         placeholderStart instanceof Date && !Number.isNaN(placeholderStart.getTime())
  257:             ? placeholderStart
  258:             : todayLocalDate();
  259:     const folderNodeId = (fid) => `folder:${fid}`;
  260: 
  261:     // ?? R1: ?대뜑 ?곸뒪 怨꾩궛(1-base) ??parentFolderId 泥댁씤 湲몄씠 ??
  262:     // depth1=猷⑦듃 ?대뜑, depth2=洹??섏쐞, ??(?곸뒪蹂?蹂대씪 ?띾룄 ?됱긽? GanttChart+gantt.css 媛 遺??.
  263:     // raw depth 瑜?洹몃?濡?遺李?3+ 罹≪? GanttChart ?먯꽌). ?먯긽 ?쒗솚? guard 濡?諛⑹뼱(compute/isFolderDescendant ?숈씪 ?ъ긽).
  264:     const parentById = new Map((Array.isArray(folders) ? folders : []).map((f) => [f.id, f.parentFolderId ?? null]));
  265:     const depthOf = (fid) => {
  266:         let d = 1;
  267:         let cur = parentById.get(fid) ?? null;
  268:         let guard = 0;
  269:         while (cur != null && guard++ < 1000) {
  270:             d++;
  271:             cur = parentById.get(cur) ?? null;
  272:         }
  273:         return d;
  274:     };
  275: 
  276:     // ?댁뒋 parent ?몃뜳??parent 媛???[issueNode]). parent = ?댁뒋id | `folder:id` | 0.
  277:     const issueChildrenByParent = new Map();
  278:     for (const n of issueNodes) {
  279:         const arr = issueChildrenByParent.get(n.parent);
  280:         if (arr) arr.push(n);
  281:         else issueChildrenByParent.set(n.parent, [n]);
  282:     }
  283:     // ?섏쐞?대뜑 ?몃뜳??parentFolderId|null ??[folder]).
  284:     const childFoldersByParent = new Map();
  285:     for (const f of folders) {
  286:         const p = f.parentFolderId ?? null;
  287:         const arr = childFoldersByParent.get(p);
  288:         if (arr) arr.push(f);
  289:         else childFoldersByParent.set(p, [f]);
  290:     }
  291: 
  292:     const cache = new Map(); // fid ??{ descIssues, leaves, start, end }
  293:     function compute(fid, guard) {
  294:         if (cache.has(fid)) return cache.get(fid);
  295:         if (guard.has(fid)) return { descIssues: [], leaves: [], start: null, end: null }; // ?먯긽 ?쒗솚 諛⑹뼱
  296:         guard.add(fid);
  297:         const directIssues = issueChildrenByParent.get(folderNodeId(fid)) || [];
  298:         // 吏곸냽 ?댁뒋 + WBS ?쒕툕?몃━(?댁뒋留?.
  299:         const descIssues = [];
  300:         const stack = [...directIssues];
  301:         while (stack.length) {
  302:             const iss = stack.pop();
  303:             descIssues.push(iss);
  304:             const kids = issueChildrenByParent.get(iss.id);
  305:             if (kids && kids.length) stack.push(...kids);
  306:         }
  307:         // ?섏쐞?대뜑 subtree 蹂묓빀.
  308:         let all = descIssues.slice();
  309:         for (const cf of childFoldersByParent.get(fid) || []) {
  310:             all = all.concat(compute(cf.id, guard).descIssues);
  311:         }
  312:         guard.delete(fid);
  313:         // leaf = ?댁뒋 ?먯떇 ?녿뒗 ?댁뒋.
  314:         const leaves = all.filter((iss) => {
  315:             const kids = issueChildrenByParent.get(iss.id);
  316:             return !kids || kids.length === 0;
  317:         });
  318:         // ?좎쭨 濡ㅼ뾽(?ㅼ젣 ?ㅼ?以꾨쭔).
  319:         let mn = null;
  320:         let mx = null;
  321:         for (const iss of all) {
  322:             if (iss.__realStart && (!mn || iss.__realStart < mn)) mn = iss.__realStart;
  323:             if (iss.__realEnd && (!mx || iss.__realEnd > mx)) mx = iss.__realEnd;
  324:         }
  325:         const info = { descIssues: all, leaves, start: mn, end: mx };
  326:         cache.set(fid, info);
  327:         return info;
  328:     }
  329: 
  330:     const sorted = [...folders].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  331:     const nodes = [];
  332:     for (const f of sorted) {
  333:         const info = compute(f.id, new Set());
  334:         const leaves = info.leaves;
  335:         // MD 媛以??섑뻾??+ 怨꾪쉷MD ?⑷퀎(leaf ?놁쑝硫?null ??而щ읆 '-').
  336:         let progress = null;
  337:         let secSum = null;
  338:         if (leaves.length > 0) {
  339:             let wSum = 0;
  340:             let pwSum = 0;
  341:             let secTotal = 0;
  342:             for (const leaf of leaves) {
  343:                 const sec = leaf.originalEstimateSeconds;
  344:                 const md = typeof sec === 'number' && sec > 0 ? sec / (rate * 3600) : 0;
  345:                 const w = md > 0 ? md : 1; // MD ?녿뒗 leaf ??1MD ?깃?(?뺤젙 洹쒖튃 짠6-3)
  346:                 const pct = typeof leaf.progressPercent === 'number' ? leaf.progressPercent : 0;
  347:                 wSum += w;
  348:                 pwSum += pct * w;
  349:                 if (typeof sec === 'number' && sec > 0) secTotal += sec;
  350:             }
  351:             progress = wSum > 0 ? Math.round(pwSum / wSum) : 0;
  352:             secSum = secTotal > 0 ? secTotal : null;
  353:         }
  354:         const hasRenderedChildren =
  355:             (issueChildrenByParent.get(folderNodeId(f.id)) || []).length > 0 ||
  356:             (childFoldersByParent.get(f.id) || []).length > 0;
  357: 
  358:         const node = {
  359:             id: folderNodeId(f.id),
  360:             folderId: f.id, // ?≪뀡 肄쒕갚??plain UUID
  361:             folderParentId: f.parentFolderId ?? null,
  362:             folderDepth: depthOf(f.id), // R1: ?곸뒪蹂??됱긽 ?대옒??1-base). GanttChart 媛 3+ 罹????대옒???좉?.
  363:             text: f.name,
  364:             type: 'summary',
  365:             folder: true,
  366:             parent: f.parentFolderId ? folderNodeId(f.parentFolderId) : 0,
  367:             progress: progress ?? 0, // 留됰? 梨꾩?(0~100)
  368:             progressPercent: progress, // 泥섎━??而щ읆(null ??'-')
  369:             originalEstimateSeconds: secSum, // 怨꾪쉷MD ?⑷퀎 而щ읆(null ??'-')
  370:             key: null,
  371:             assigneeObj: null,
  372:             coworkers: [],
  373:             statusCategory: null,
  374:             startText: info.start ? formatISODate(info.start) : '',
  375:             endText: info.end ? formatISODate(info.end) : '',
  376:         };
  377:         if (hasRenderedChildren) {
  378:             // ?먯떇(吏곸냽 ?댁뒋/?섏쐞?대뜑) 蹂댁쑀 ??open 遺?? ?ㅼ?以??먯넀 ?덉쑝硫?濡ㅼ뾽 留됰?, ?놁쑝硫?留됰? ?놁쓬(?먯떇???덉쑝誘濡?SVAR OK).
  379:             node.open = true;
  380:             if (info.start) {
  381:                 node.start = info.start;
  382:                 node.duration = diffDays(info.start, info.end || info.start);
  383:             }
  384:         } else {
  385:             // ??鍮??대뜑(媛???먯떇 0): SVAR ??"?먯떇 ?녿뒗 summary ??start/end 媛뺤젣"(?놁쑝硫????꾩껜 ?щ옒??.
  386:             //   ??placeholder ?좎쭨(1??瑜?媛뺤젣 遺?ы빐 ?щ옒?쒕? 留됯퀬, 留됰???GanttChart 媛 folderEmpty 濡?
  387:             //     `gantt-folder-empty-bar` ?대옒?ㅻ? 遺숈뿬 CSS 濡??④릿???ъ슜??寃곗젙: 鍮??대뜑??留됰? ?놁씠 ?대쫫留?.
  388:             //   open 誘몃????먯떇 0 ??leaf ?щ옒??媛??.
  389:             node.start = emptyStart;
  390:             node.duration = 1;
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-97-/**
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-98- * 계약 Task[] → SVAR task[].
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-99- * effectiveParent → SVAR parent (부모 id가 집합에 없으면 루트(0) 처리).
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-100- */
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js:101:export function toSvarTasks(tasks, options = {}) {
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-102-    if (!Array.isArray(tasks)) return [];
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-103-    const idSet = new Set(tasks.map((t) => t.id ?? t.key));
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-104-
static/ui/src/pages/projectDetail/gantt\ganttAdapter.js-105-    // ── 폴더 레이어 입력(2026-07-02) ──
--
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-23-    useDeleteFolder,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-24-    useSetIssueFolder,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-25-    useSetFolderLink,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-26-} from './useGanttFolderMutations';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:27:import { toSvarTasks, toSvarLinks, parseISODate } from './ganttAdapter';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-28-import { deriveProjectOptions, matchesProjectKeys } from '../../../components/filter/projectSpace';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-29-import { useGanttToastBatcher } from './ganttToastBatcher';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-30-import GanttToolbar from './GanttToolbar';
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-31-import GanttChart from './GanttChart';
--
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-201-        );
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-202-
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-203-        // 미일정 이슈 placeholder 막대는 프로젝트 시작일에 놓는다(없으면 어댑터가 오늘로 폴백).
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-204-        //  폴더 노드는 필터된(가시) 이슈 기준으로 롤업 기간/수행율을 어댑터가 재계산(빈 폴더도 표시).
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx:205:        const svarTasks = toSvarTasks(filtered, {
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-206-            placeholderStart: parseISODate(meta?.projectStart),
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-207-            folders,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-208-            folderIssues,
static/ui/src/pages/projectDetail/gantt\GanttPage.jsx-209-            hourRate,
--
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-161- *  - ⚠️ onSettled 즉시 invalidate 는 여전히 쓰지 않는다: 과거 앱필드 write 시절엔 search 인덱스 지연으로
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-162- *    직후 재조회가 옛 값을 박제하는 버그가 있었고("상위 지정해도 하위로 안 들어감"), 프로퍼티(movesRms.wbsParent)
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-163- *    전환 후에도 서버 확정 응답 기반 캐시 패치가 재조회보다 빠르고 안전하다(불필요 전체 재조회 회피).
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-164- *  - onSuccess: 서버가 검증 후 확정한 { issueKey, parentKey, effectiveParent } 를 캐시 task 에 직접 패치.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js:165: *    낙관값과 방향이 같아 시각 변화 없음. 어댑터(toSvarTasks)가 effectiveParent 기준으로 summary 승격/트리 중첩을
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-166- *    재판정하므로 트리가 즉시 갱신된다. 전체 재동기화는 다음 자연 재조회(탭 재진입/새로고침) — 인덱스 따라잡은 뒤라 안전.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-167- *  - onSuccess: 성공 토스트 표시(2026-07-02, parentKey null 여부로 변경/해제 분기). 실패 토스트도 유지.
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-168- */
static/ui/src/pages/projectDetail/gantt\useGanttMutations.js-169-export function useSetParent({ projectId, toast }) {
--
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-16- * 무효화 전략(2026-07-02 개정): **서버 응답 기반 캐시 부분 패치**(전체 invalidate 금지).
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-17- *  - 사유: 폴더는 앱 DB 전용(Jira write 0)이라 인덱스 지연이 없어 응답이 곧 권위. 반면 `invalidate` 는
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-18- *    getProjectGanttData 전체 재조회(이슈 Jira search 포함 수 초)를 유발 → 폴더 이동/소속이 느리게 반영됨.
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-19- *  - 따라서 onSuccess 에서 캐시(ganttKeys.data)의 `content.folders`/`content.folderIssues` 만 응답값으로
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js:20: *    갱신하고 tasks/links/meta 는 불변 유지 → 어댑터(toSvarTasks)가 즉시 폴더 트리를 재합성(체감 즉시).
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-21- *  - 낙관(onMutate)은 불요(앱 DB 단건 응답이 빠름). 실패 시 기존 에러 토스트.
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-22- */
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-23-
static/ui/src/pages/projectDetail/gantt\useGanttFolderMutations.js-24-/**
static/ui/src/utils/jiraApi\requestJira.js-57-        url: '/rest/api/3/issue/{issueIdOrKey}'
static/ui/src/utils/jiraApi\requestJira.js-58-    },
static/ui/src/utils/jiraApi\requestJira.js-59-    //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put
static/ui/src/utils/jiraApi\requestJira.js:60:    updateIssue: {
static/ui/src/utils/jiraApi\requestJira.js-61-        type: TYPE_MAP.PUT,
static/ui/src/utils/jiraApi\requestJira.js-62-        url: '/rest/api/3/issue/{issueIdOrKey}'
static/ui/src/utils/jiraApi\requestJira.js-63-    },
--
src\permission\PermissionMap.js-139-    deleteProjectIssue: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-140-    recordIssueAssignedDate: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-141-    // 코워커 전용 갱신(팀 관리형 이슈 프로퍼티 write) — payload 에 projectId 없어 상위 read scope 의존(§10-8)
src\permission\PermissionMap.js:142:    updateIssueCoworkers: W('PROJECT', 'inherited'),
src\permission\PermissionMap.js-143-    findProjectusersByProjectId: R('PROJECT', 'detail'),
src\permission\PermissionMap.js-144-    getProjectUserWithScroll: R('PROJECT', 'detail'),
src\permission\PermissionMap.js-145-    searchProjectUser: R('PROJECT', 'detail'),
--
src\permission\PermissionMap.js-309-    // 전사 인력 풀 확장 — 자원관리 read 필수 + 프로젝트 스코프 검증
src\permission\PermissionMap.js-310-    getWorkAssignmentPool: R('RESOURCE_MANAGEMENT', 'detail'),
src\permission\PermissionMap.js-311-    // 배정 실행 — payload 에 projectId 를 반드시 포함시켜 inherited scope 검증이 실제로 걸리게 한다
src\permission\PermissionMap.js:312:    // (updateIssueCoworkers 의 §10-8 한계를 이 경로에서는 해소)
src\permission\PermissionMap.js-313-    //   [resource-assignment-merge 2026-07-23] 자원관리 write 보유자도 배정 실행 가능하도록 OR 확장.
src\permission\PermissionMap.js-314-    //   ★ read 가 아니라 write 요구 — 조회 전용 자원관리자(read만)는 배정 불가(최소 권한). Jira ASSIGN_ISSUES 가 최종 판정.
src\permission\PermissionMap.js-315-    //   project mode 'inherited' 유지 → 스코프 검증 불변.
--
src\resolver\gantt\GanttService.js-3-
src\resolver\gantt\GanttService.js-4-import {
src\resolver\gantt\GanttService.js-5-    getProjectGanttIssues,
src\resolver\gantt\GanttService.js:6:    updateIssueFields,
src\resolver\gantt\GanttService.js-7-    createIssueLink,
src\resolver\gantt\GanttService.js-8-    deleteIssueLink,
src\resolver\gantt\GanttService.js-9-} from '../../api/jira/issue/IssueApi';
--
src\resolver\gantt\GanttService.js-155-        duedate: normDue,
src\resolver\gantt\GanttService.js-156-    };
src\resolver\gantt\GanttService.js-157-
src\resolver\gantt\GanttService.js:158:    await updateIssueFields(issueKey, fields);
src\resolver\gantt\GanttService.js-159-
src\resolver\gantt\GanttService.js-160-    return {
src\resolver\gantt\GanttService.js-161-        content: {
--
src\api\jira\issue\IssueApi.js-392- * @param fields    { [fieldId]: value } 갱신 필드맵
src\api\jira\issue\IssueApi.js-393- * @param as        'user'(기본)
src\api\jira\issue\IssueApi.js-394- */
src\api\jira\issue\IssueApi.js:395:export const updateIssueFields = async (issueKey, fields, as = 'user') => {
src\api\jira\issue\IssueApi.js-396-    return await putJiraJson({
src\api\jira\issue\IssueApi.js-397-        as,
src\api\jira\issue\IssueApi.js-398-        url: route`/rest/api/3/issue/${issueKey}`,
--
src\resolver\projectIssue\ProjectUsersService.js-406- * @param accountIds 협업자 accountId 배열
src\resolver\projectIssue\ProjectUsersService.js-407- * @returns {Promise<{content:{issueId, coworkers:string[]}}>}
src\resolver\projectIssue\ProjectUsersService.js-408- */
src\resolver\projectIssue\ProjectUsersService.js:409:export const updateIssueCoworkersService = async ({issueId, accountIds}) => {
src\resolver\projectIssue\ProjectUsersService.js-410-    const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
src\resolver\projectIssue\ProjectUsersService.js-411-    // 협업자 지정마다 2건씩 찍혀 과다. 실패는 mergeIssueProperty 가 전파한다. 필요 시 해제.
src\resolver\projectIssue\ProjectUsersService.js:412:    // console.log('[MOVES][updateIssueCoworkers] req', JSON.stringify({issueId, count: ids.length}));
src\resolver\projectIssue\ProjectUsersService.js-413-    await mergeIssueProperty(issueId, {coworkers: ids}); // read-merge-write, 다른 필드 보존
src\resolver\projectIssue\ProjectUsersService.js-414-    // A-3 — 대시보드 참여자 통계 캐시(60초)를 비운다. 안 비우면 "저장했는데 참여자 수가 그대로"가 된다.
src\resolver\projectIssue\ProjectUsersService.js-415-    //   ⚠ 호출된 인스턴스에만 적용된다(Forge 다중 인스턴스) — 다른 인스턴스는 TTL 만료까지 옛 집계다.
src\resolver\projectIssue\ProjectUsersService.js-416-    invalidateProjectParticipantIssues();
src\resolver\projectIssue\ProjectUsersService.js:417:    // console.log('[MOVES][updateIssueCoworkers] OK', String(issueId));
src\resolver\projectIssue\ProjectUsersService.js-418-    return {content: {issueId, coworkers: ids}};
src\resolver\projectIssue\ProjectUsersService.js-419-};
src\resolver\projectIssue\ProjectUsersService.js-420-
--
src\resolver\projectIssue\ProjectUsersController.js-7-    updateProjectIdFieldService,
src\resolver\projectIssue\ProjectUsersController.js-8-    updateProjectUsersByKeyService,
src\resolver\projectIssue\ProjectUsersController.js-9-    recordIssueAssignedDateService,
src\resolver\projectIssue\ProjectUsersController.js:10:    updateIssueCoworkersService,
src\resolver\projectIssue\ProjectUsersController.js-11-    getProjectSalaryListService,
src\resolver\projectIssue\ProjectUsersController.js-12-    updateProjectMemberSalaryService,
src\resolver\projectIssue\ProjectUsersController.js-13-    removeProjectMemberByAccountService
--
src\resolver\projectIssue\ProjectUsersController.js-33-    guardedDefine(resolver, 'deleteProjectIssue', ({payload}) => deleteProjectIssueService(payload));
src\resolver\projectIssue\ProjectUsersController.js-34-
src\resolver\projectIssue\ProjectUsersController.js-35-    /* 코워커 전용 갱신(팀 관리형): 이슈 프로퍼티 read-merge-write. app 권한 필요 → backend 로직 실행 */
src\resolver\projectIssue\ProjectUsersController.js:36:    guardedDefine(resolver, 'updateIssueCoworkers', ({payload}) => updateIssueCoworkersService(payload));
src\resolver\projectIssue\ProjectUsersController.js-37-
src\resolver\projectIssue\ProjectUsersController.js-38-    /* 등록일·등록자 기록: 등록자 accountId 는 payload 가 아니라 context 에서 서버가 취득(위변조 방지) */
src\resolver\projectIssue\ProjectUsersController.js-39-    guardedDefine(resolver, 'recordIssueAssignedDate', ({payload, context}) =>
--
src\resolver\workAssignment\WorkAssignmentWriter.js-6-//
src\resolver\workAssignment\WorkAssignmentWriter.js-7-// ★ 컨텍스트 정책:
src\resolver\workAssignment\WorkAssignmentWriter.js-8-//   - assignee write : as:'user' (asApp 지양 [[feedback-no-asapp]]) → 호출자에게 Jira ASSIGN_ISSUES 필요
src\resolver\workAssignment\WorkAssignmentWriter.js:9://   - coworker write : mergeIssueProperty 기본값 as:'app' 유지 (기존 updateIssueCoworkersService 와 동일 정책)
src\resolver\workAssignment\WorkAssignmentWriter.js-10-//
src\resolver\workAssignment\WorkAssignmentWriter.js-11-// 응답은 프론트 캐시 패치 계약(§2.3) — { issueId, issueKey, applied, item, previous }.
src\resolver\workAssignment\WorkAssignmentWriter.js-12-
--
src\resolver\workAssignment\WorkAssignmentWriter.js-68-    if (!ISSUE_KEY_RE.test(String(target))) {
src\resolver\workAssignment\WorkAssignmentWriter.js-69-        throw new LogicalError(ErrorCodes.ASSIGNMENT_ISSUE_REQUIRED, 'invalid issue key/id format');
src\resolver\workAssignment\WorkAssignmentWriter.js-70-    }
src\resolver\workAssignment\WorkAssignmentWriter.js:71:    // 프로퍼티 write 는 숫자 id 를 선호(기존 updateIssueCoworkersService 와 동일)하나 key 도 허용된다.
src\resolver\workAssignment\WorkAssignmentWriter.js-72-    const propertyTarget = issueId ?? issueKey;
src\resolver\workAssignment\WorkAssignmentWriter.js-73-
src\resolver\workAssignment\WorkAssignmentWriter.js-74-    // 1) previous 확보 — write 전 단건 GET(검색 인덱스 무관)

--- static/ui/src/utils/jiraApi/requestJira.js:1-250 ---
    1: import {requestJira} from "@forge/bridge";
    2: 
    3: /** frontend?먯꽌 requestJira ?몄텧 怨듯넻 js ?낅땲??
    4:  * 1. REQUEST_MAP??key?ㅼ젙 諛??몄텧 ?섎뒗 API??type怨?url ?낅젰
    5:  * 2. executeRequest硫붿꽌?쒖뿉 REQUEST_MAP??key媛믨낵 param??媛숈씠 ?섍꺼以띾땲?? (POST ?뺤떇??寃쎌슦 body ?곗씠??
    6:  * @type {{getUser: {type: {method: string, headers: Headers}, url: string}}}
    7:  */
    8: 
    9: const TYPE_MAP = {
   10:     GET: {
   11:         method: "GET",
   12:         headers: new Headers({"Accept": "application/json"})
   13:     },
   14:     POST: {
   15:         method: "POST",
   16:         headers: new Headers({"Content-Type": "application/json"}, {"Accept": "application/json"})
   17:     },
   18:     PUT: {
   19:         method: "PUT",
   20:         headers: new Headers({"Content-Type": "application/json"}, {"Accept": "application/json"})
   21:     },
   22:     DELETE : {
   23:         method: "DELETE",
   24:         headers: new Headers()
   25:     },
   26: }
   27: 
   28: const REQUEST_MAP = {
   29:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-user-get
   30:     getUser : {
   31:         type: TYPE_MAP.GET,
   32:         url: '/rest/api/3/user'
   33:     },
   34:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-users/#api-rest-api-3-user-bulk-get
   35:     getBulkUser : {
   36:         type: TYPE_MAP.GET,
   37:         url: '/rest/api/3/user/bulk'
   38:     },
   39:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-assignable-search-get
   40:     getUsersAssignableToIssue : {
   41:         type: TYPE_MAP.GET,
   42:         url: '/rest/api/3/user/assignable/search'
   43:     },
   44:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-assignee-put
   45:     assignIssue: {
   46:         type: TYPE_MAP.PUT,
   47:         url: '/rest/api/3/issue/{issueIdOrKey}/assignee'
   48:     },
   49:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post
   50:     searchIssueWithJQL: {
   51:         type: TYPE_MAP.POST,
   52:         url: '/rest/api/3/search/jql'
   53:     },
   54:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
   55:     getIssue: {
   56:         type: TYPE_MAP.GET,
   57:         url: '/rest/api/3/issue/{issueIdOrKey}'
   58:     },
   59:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put
   60:     updateIssue: {
   61:         type: TYPE_MAP.PUT,
   62:         url: '/rest/api/3/issue/{issueIdOrKey}'
   63:     },
   64:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/#api-rest-api-3-project-search-get
   65:     getProjects: {
   66:         type: TYPE_MAP.GET,
   67:         url: '/rest/api/3/project/search'
   68:     },
   69:     //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-group-and-user-picker/#api-rest-api-3-groupuserpicker-get
   70:     getUsersGroups: {
   71:         type: TYPE_MAP.GET,
   72:         url: '/rest/api/3/groupuserpicker'
   73:     },
   74:     //reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-post
   75:     addWorklog: {
   76:         type: TYPE_MAP.POST,
   77:         url: '/rest/api/3/issue/{issueIdOrKey}/worklog'
   78:     },
   79:     //reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-id-put
   80:     updateWorklog: {
   81:         type: TYPE_MAP.PUT,
   82:         url: '/rest/api/3/issue/{issueIdOrKey}/worklog/{id}'
   83:     },
   84:     //reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-id-delete
   85:     deleteWorklog: {
   86:         type: TYPE_MAP.DELETE,
   87:         url: '/rest/api/3/issue/{issueIdOrKey}/worklog/{id}'
   88:     },
   89:     //reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/#api-rest-api-3-issue-issueidorkey-worklog-get
   90:     getIssueWorklogs: {
   91:         type: TYPE_MAP.GET,
   92:         url: '/rest/api/3/issue/{issueIdOrKey}/worklog'
   93:     },
   94:     //reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-permissions/#api-rest-api-3-mypermissions-get
   95:     getMyPermissions: {
   96:         type: TYPE_MAP.GET,
   97:         url: '/rest/api/3/mypermissions'
   98:     }
   99: }
  100: 
  101: /**
  102:  * Frontend?먯꽌 requestJira ?몄텧 ??諛쒖깮?섎뒗 ?먮윭 Handling
  103:  */
  104: class RequestJiraError extends Error {
  105:     constructor(code, message, error) {
  106:         super(message);
  107:         this.code = code;
  108:         this.name = 'RequestJiraError'; //forge ?먯껜 ?대? ?뷀샇?붾줈 ?명븳 ?섎뱶 肄붾뵫
  109:         this.cause = error;
  110:     }
  111: }
  112: 
  113: const requestUrl = (request, param, urlParam, queryParam) => {
  114:     let url = replaceUrl(request.url, urlParam);
  115:     if(request.type === TYPE_MAP.GET) {
  116:         return `${url}?${toQueryString(param)}`
  117:     } else if (queryParam && Object.keys(queryParam).length > 0) {
  118:         return `${url}?${toQueryString(queryParam)}`
  119:     } else {
  120:         return url
  121:     }
  122: }
  123: 
  124: const requestOption = (request, param) => {
  125:     const option = {
  126:         method: request.type.method,
  127:         headers: request.type.headers
  128:     }
  129:     if(request.type !== TYPE_MAP.GET) {
  130:         option.body = JSON.stringify(param);
  131:     }
  132: 
  133:     return option;
  134: }
  135: 
  136: const toQueryString = params => {
  137:     const searchParams = new URLSearchParams();
  138:     for (const [key, value] of Object.entries(params)) {
  139:         if (Array.isArray(value)) {
  140:             value.forEach(v => searchParams.append(key, v));
  141:         } else {
  142:             searchParams.append(key, value);
  143:         }
  144:     }
  145:     return searchParams.toString();
  146: }
  147: 
  148: const getRequest = key => {
  149:     const request = REQUEST_MAP?.[key]
  150:     if(!request) throw new RequestJiraError("Request key is not valid");
  151:     return request
  152: }
  153: 
  154: const replaceUrl = (url, param) => {
  155:     // {key} ?뺥깭??臾몄옄?댁쓣 李얜뒗 ?뺢퇋?쒗쁽??
  156:     return url.replaceAll(/{(\w+)}/g, (match, key) => {
  157:         if (param.hasOwnProperty(key) && param?.[key] !== undefined && param?.[key] !== null) {
  158:             return param?.[key];
  159:         } else {
  160:             throw new RequestJiraError(`Missing key: "${key}" in urlParam for replacing url: "${url}"`);
  161:         }
  162:     });
  163: }
  164: 
  165: export const executeRequest = async (key, param, urlParam, queryParam) => {
  166:     try {
  167:         const request = getRequest(key);
  168:         const response = await requestJira(requestUrl(request, param, urlParam, queryParam), requestOption(request, param))
  169:         if(response.status === 204) {
  170:             // no contents ?덉쇅 泥섎━
  171:             return ''
  172:         }
  173:         if(response.status >= 400) {
  174:             const text = await response.text();
  175:             throw new RequestJiraError(response.status, text, response)
  176:         }
  177:         return await response.json()
  178:     } catch (error) {
  179:         const e = new RequestJiraError(error?.code ?? 'Internal Error', `key: ${key}, param: ${JSON.stringify(param)}, urlParam: ${JSON.stringify(urlParam)}`, error)
  180:         return {
  181:             success: false,
  182:             error: {
  183:                 name: e.name, // 諛쒖깮??Error name
  184:                 code: e.code || 'UNKNOWN_ERROR', // 諛쒖깮??error code
  185:                 message: e.message || 'UNKNOWN_ERROR', // 諛쒖깮??error message
  186:                 cause: e?.cause || '', // ?곸쐞 諛쒖깮??Error??????뺣낫
  187:             },
  188:         }
  189:     }
  190: }

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
hook: PreToolUse
hook: PreToolUse
hook: PreToolUse Completed
hook: PreToolUse Failed
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command 'function Show-Range($p,$a,$b){"`n--- ${p}:${a}-${b} ---";$n=0;Get-Content $p|ForEach-Object{$n++;if($n -ge $a -and $n -le $b){'"'{0,5}: {1}' -f "'$n,$_}}}; Show-Range '"'static/ui/src/pages/projectDetail/gantt/ganttAdapter.js' 95 250; Show-Range 'static/ui/src/pages/projectDetail/gantt/GanttPage.jsx' 180 230" in C:\CloudJira\moves-workforce
 succeeded in 1549ms:

--- static/ui/src/pages/projectDetail/gantt/ganttAdapter.js:95-250 ---
   95: }
   96: 
   97: /**
   98:  * 怨꾩빟 Task[] ??SVAR task[].
   99:  * effectiveParent ??SVAR parent (遺紐?id媛 吏묓빀???놁쑝硫?猷⑦듃(0) 泥섎━).
  100:  */
  101: export function toSvarTasks(tasks, options = {}) {
  102:     if (!Array.isArray(tasks)) return [];
  103:     const idSet = new Set(tasks.map((t) => t.id ?? t.key));
  104: 
  105:     // ?? ?대뜑 ?덉씠???낅젰(2026-07-02) ??
  106:     // folders/folderIssues ??additive. 誘몄＜????湲곗〈 ?숈옉(?대뜑 ?몃뱶 0媛?怨??숈씪.
  107:     const folders = Array.isArray(options.folders) ? options.folders : [];
  108:     const folderIssuesMap =
  109:         options.folderIssues && typeof options.folderIssues === 'object'
  110:             ? options.folderIssues
  111:             : {};
  112:     const hourRate = options.hourRate > 0 ? options.hourRate : 8;
  113:     // dangling 諛⑹뼱: 議댁옱?섎뒗 ?대뜑 id 留??좊ː(??젣??folderId 李몄“ 臾댁떆 ??짠7-4).
  114:     const folderIdSet = new Set(folders.map((f) => f.id));
  115:     // issueKey ??folderId (議댁옱 ?대뜑留?. ?댁뒋 遺紐??대갚???ъ슜.
  116:     const validFolderIssues = new Map();
  117:     for (const [issueKey, fid] of Object.entries(folderIssuesMap)) {
  118:         if (fid && folderIdSet.has(fid)) validFolderIssues.set(issueKey, fid);
  119:     }
  120:     const folderNodeId = (fid) => `folder:${fid}`;
  121: 
  122:     // ???⑥젙(2026-07-02 ?щ옒??: 諛깆뿏??type('summary')? ?꾩껜 ?댁뒋 湲곗? ?먯젙?대씪,
  123:     //   ?대떦???곹깭 ?꾪꽣濡??먯떇???꾨? 嫄몃윭吏?summary 媛 ??(遺遺꾩쭛?? tasks ???⑥쑝硫?
  124:     //   open:true + ?먯떇 0 ??SVAR toArray 媛 null.forEach 濡??щ옒?쒗븳??
  125:     //   ???꾨떖諛쏆?(?대? ?꾪꽣?? tasks 湲곗??쇰줈 ?ㅼ젣 ?먯떇 蹂댁쑀 ?щ?瑜??ш퀎?고븳??
  126:     // ???ъ슜??寃곗젙(2026-07-02): "?ы븿(濡ㅼ뾽 ?붿빟留됰?)" 媛쒕뀗? **Jira ?ㅼ씠?곕툕 ?섏쐞 ?댁뒋(jiraParent)** 愿怨꾩뿉留??곸슜.
  127:     //   ?깆뿉???뺤쓽??WBS(wbsParent, ?곸쐞 吏?? 愿怨꾨뒗 ?몃━ ?쒖떆留??섍퀬 遺紐⑤룄 **?낅┰ ?묒뾽 留됰?**(task) ?좎?.
  128:     //   ??遺紐⑤? ??吏묓빀?쇰줈 援щ텇: anyParentSet(?몃━ ?좉??? / nativeParentSet(summary ?밴꺽?????ㅼ씠?곕툕 ?먯떇 蹂댁쑀).
  129:     const anyParentSet = new Set();
  130:     const nativeParentSet = new Set();
  131:     for (const t of tasks) {
  132:         const eff = t.effectiveParent;
  133:         if (!eff || !idSet.has(eff)) continue;
  134:         anyParentSet.add(eff);
  135:         // ???먯떇??WBS(wbsParent) 寃쎌쑀濡?遺숈뿀?붽?? (짠6 蹂묓빀洹쒖튃: wbsParent ?곗꽑, 臾댄슚 ??jiraParent ?대갚)
  136:         const viaWbs = t.wbsParent && idSet.has(t.wbsParent) && t.wbsParent === eff;
  137:         if (!viaWbs && t.jiraParent === eff) nativeParentSet.add(eff);
  138:     }
  139: 
  140:     // 誘몄씪???댁뒋 placeholder 留됰? 湲곕낯 ?쒖옉?? ?꾨줈?앺듃 ?쒖옉???듭뀡) ???놁쑝硫??ㅻ뒛(濡쒖뺄 ?먯젙).
  141:     const ps = options.placeholderStart;
  142:     const placeholderStart =
  143:         ps instanceof Date && !Number.isNaN(ps.getTime()) ? ps : todayLocalDate();
  144: 
  145:     const issueNodes = tasks.map((task) => {
  146:         const id = task.id ?? task.key;
  147:         const issueKey = task.key ?? id;
  148:         const hasChildren = anyParentSet.has(id);
  149:         // type ?먯젙 (諛깆뿏??type='summary' ??臾댁떆?섍퀬 ?ш린???ы뙋??:
  150:         //   ?ㅼ씠?곕툕(jiraParent) ?먯떇 蹂댁쑀 ??'summary'(?ы븿 媛쒕뀗: 珥덈줉 濡ㅼ뾽 留됰?)
  151:         //   WBS ?먯떇留?蹂댁쑀 ??'task'(?낅┰ 留됰? + ?몃━ ?좉?留?  ???ъ슜??寃곗젙 2026-07-02
  152:         //   洹?????milestone(?쒖옉=醫낅즺) / task. WBS 遺紐⑥뿉??濡ㅼ뾽 ?곸슜?좎???異뷀썑 ?쇱쓽(GANTT.md 짠7).
  153:         let type;
  154:         if (nativeParentSet.has(id)) type = 'summary';
  155:         else if (task.type === 'milestone') type = 'milestone';
  156:         else type = 'task';
  157: 
  158:         let start = parseISODate(task.start);
  159:         let end = parseISODate(task.end);
  160:         // ?쒖そ ?좎쭨留??덉쑝硫??ㅻⅨ 履쎌쑝濡?蹂댁젙.
  161:         if (start && !end) end = start;
  162:         if (end && !start) start = end;
  163:         if (start && end && end < start) end = start;
  164: 
  165:         // 遺紐??곗꽑?쒖쐞(짠5-1): ?댁뒋-遺紐?effectiveParent, 吏묓빀 ?? > ?대뜑-?뚯냽(folderIssues) > 猷⑦듃(0).
  166:         //   effectiveParent 媛 ?덉쑝硫??대뜑 ?뚯냽? ?쒓컖 臾댄슚(臾몄꽌?붾맂 ?쒓퀎 ???쒕툕?몃━ 猷⑦듃留??대뜑???닿?).
  167:         //   ?먭린李몄“ 諛⑹?. SVAR 臾몄꽌: 猷⑦듃=parent 0.
  168:         const parentKey = task.effectiveParent;
  169:         let parent;
  170:         if (parentKey && parentKey !== id && idSet.has(parentKey)) {
  171:             parent = parentKey;
  172:         } else {
  173:             const fid = validFolderIssues.get(issueKey);
  174:             parent = fid ? folderNodeId(fid) : 0;
  175:         }
  176: 
  177:         const progress =
  178:             typeof task.progress === 'number' ? Math.round(task.progress * 100) : 0;
  179: 
  180:         const svar = {
  181:             id,
  182:             text: task.summary ?? id,
  183:             type,
  184:             parent,
  185:             progress,
  186:             // 洹몃━??而щ읆 ?쒖떆??passthrough (?묒뾽愿由?UI 而댄룷?뚰듃媛 ?뚮퉬, SVAR ITask ???꾩쓽 ?꾨뱶 ?덉슜).
  187:             key: id,
  188:             issueTypeIcon: task.issueTypeIcon ?? null,
  189:             project: task.project ?? null,
  190:             statusCategory: task.statusCategory ?? null,
  191:             assigneeObj: task.assignee ?? null,
  192:             coworkers: Array.isArray(task.coworkers) ? task.coworkers : [],
  193:             startText: task.start ?? '',
  194:             endText: task.end ?? '', // 留됰? hover ?댄똻???쇱젙 踰붿쐞 ?쒖떆???먮낯 ISO).
  195:             // ?몃씪???몄쭛/?좉퇋 而щ읆 passthrough (寃쎄퀎硫?怨꾩빟 additive 3?꾨뱶, 02_backend_report_grid_edit.md):
  196:             issueId: task.issueId ?? null, // ?묒뾽??write(updateProjectIdField) ???レ옄 Jira id(string)
  197:             originalEstimateSeconds: task.originalEstimateSeconds ?? null, // "怨꾪쉷 ?묒뾽??(MD) ?곗젙 湲곗?(珥?
  198:             progressPercent: task.progressPercent ?? null, // "泥섎━??(%) ?쎄린?꾩슜 而щ읆
  199:             wbsParent: task.wbsParent ?? null, // ?대뜑 ?쒕∼ ??WBS ?댁젣 ?먮떒???깊븘??override 議댁옱 ?щ?)
  200:             // ?대뜑 濡ㅼ뾽 怨꾩궛???ㅼ젣 ?ㅼ?以?Date; 誘몄씪??null). placeholder ?꾩튂(svar.start)? 援щ텇. SVAR ??臾댁떆.
  201:             __realStart: start,
  202:             __realEnd: end,
  203:         };
  204: 
  205:         // ??SVAR toArray ??`open===true` ?몃뱶留?data(?먯떇)濡??ш??섎뒗??leaf ??data ??null.
  206:         //   ?곕씪??open ? (?꾩옱 遺遺꾩쭛??湲곗?) ?먯떇 ?덈뒗 ?몃뱶?먮쭔 遺?ы븳??leaf ??open:true ??null.forEach ?щ옒??.
  207:         //   type 怨?臾닿? ??WBS 遺紐⑤뒗 ?낅┰ task 留됰?瑜??좎??섎㈃???몃━ ?좉?(????留?媛뽯뒗??
  208:         if (hasChildren) svar.open = true;
  209: 
  210:         if (type === 'summary') {
  211:             // ?ㅼ씠?곕툕 ?섏쐞 ?댁뒋 蹂댁쑀(?ы븿 媛쒕뀗): ?좎쭨 ?덉쑝硫??ъ슜, ?놁쑝硫?SVAR 媛 ?먯떇?먯꽌 濡ㅼ뾽(placeholder 湲덉?).
  212:             if (start) {
  213:                 svar.start = start;
  214:                 svar.duration = diffDays(start, end);
  215:             }
  216:         } else if (start) {
  217:             // ?쇱젙 ?덈뒗 ?몃뱶: start + duration (SVAR 臾몄꽌: end쨌duration ?숈떆 吏??湲덉?). WBS 遺紐⑤룄 ?먭린 ?쇱젙 洹몃?濡?
  218:             svar.start = start;
  219:             svar.duration = type === 'milestone' ? 1 : diffDays(start, end);
  220:         } else {
  221:             // ?쇱젙 誘몄꽕??leaf: SVAR ?ㅼ씠?곕툕 unscheduled(留됰? ?놁쓬) ????쒕옒洹?媛?ν븳 placeholder 留됰?濡??뚮뜑?쒕떎.
  222:             //   ?꾩튂=?꾨줈?앺듃 ?쒖옉???놁쑝硫??ㅻ뒛), 湲곌컙=湲곕낯 3?? placeholder:true ???뚯깋 ?먯꽑 ?ㅽ???+
  223:             //   ?쒖옉??而щ읆 '?쇱젙 ?ㅼ젙' 踰꾪듉???④퍡 ?몄텧(?뺣? ?낅젰 蹂묓뻾 寃쎈줈).
  224:             //   start/end(?먮낯 ISO=startText/endText)??鍮꾩슫 梨꾨줈 ???댄똻/而щ읆? '誘몄꽕?????좎??섍퀬 諛깆뿏?쒕룄 臾대?寃?
  225:             //   ?ъ슜?먭? 留됰?瑜??쒕옒洹?由ъ궗?댁쫰?섎㈃ update-task ??M2 write-back ?쇰줈 ?ㅼ젣 ?쇱젙????λ릺怨?
  226:             //   ?ъ“????start/end 媛 梨꾩썙???먮룞?쇰줈 ?쇰컲 留됰?濡??꾪솚?쒕떎.
  227:             svar.start = placeholderStart;
  228:             svar.duration = PLACEHOLDER_DURATION;
  229:             svar.placeholder = true;
  230:         }
  231:         return svar;
  232:     });
  233: 
  234:     if (folders.length === 0) return issueNodes;
  235: 
  236:     // ?대뜑 ?몃뱶 ?⑹꽦(濡ㅼ뾽 湲곌컙 + MD 媛以??섑뻾??. ?댁뒋 ?몃뱶 ?ㅼ뿉 append(?뺤젣 ?쒖꽌??sortOrder).
  237:     const folderNodes = synthesizeFolderNodes(folders, issueNodes, hourRate, placeholderStart);
  238:     return issueNodes.concat(folderNodes);
  239: }
  240: 
  241: /**
  242:  * ?대뜑 ?몃뱶 ?⑹꽦(짠5쨌짠6) ???쒖닔 ?⑥닔.
  243:  * folders(諛곗뿴) + ?대? 留뚮뱾?댁쭊 issueNodes(遺紐?寃곗젙 ?꾨즺, __realStart/__realEnd 蹂댁쑀) ??SVAR ?대뜑 task[].
  244:  *
  245:  * 洹쒖튃:
  246:  *  - ?대뜑 ?몃뱶 id = `folder:<uuid>`, type='summary', folder:true. 遺紐?parentFolderId(?덉쑝硫?`folder:`).
  247:  *  - 湲곌컙 濡ㅼ뾽: 媛???먯넀 ?댁뒋(吏곸냽 ?대뜑-?뚯냽 ?댁뒋 + WBS ?쒕툕?몃━ + ?섏쐞?대뜑 subtree)???ㅼ젣 ?ㅼ?以?min~max.
  248:  *  - ?섑뻾??progress 0~100): ?먯넀 leaf ?댁뒋??MD 媛以??됯퇏(誇(pct횞w)/誇w, w=plannedMD, MD ?놁쑝硫?1).
  249:  *  - 怨꾪쉷MD ?⑷퀎(originalEstimateSeconds): ?먯넀 leaf ?ㅼ젣 estimate 珥????놁쑝硫?null='-').
  250:  *  - 鍮??대뜑???뚮뜑(由щ뜑 吏??. ??open ? ?뚮뜑 ?먯떇(吏곸냽 ?댁뒋/?섏쐞?대뜑)???덉쓣 ?뚮쭔 遺??

--- static/ui/src/pages/projectDetail/gantt/GanttPage.jsx:180-230 ---
  180:         [tasks],
  181:     );
  182: 
  183:     // ?꾪꽣 ?곸슜 ??SVAR 紐⑤뜽 蹂??
  184:     // ?좑툘 ?대뜑??tasks ???녿떎 ???댁뒋 task 湲곗? ?꾪꽣(?대떦???곹깭/?꾨줈?앺듃)???대뜑瑜?嫄대뱶由ъ? ?딄퀬,
  185:     //    ?대뜑???댁븘?⑥? ?먯떇 ?댁뒋濡?濡ㅼ뾽?쒕떎(鍮??대뜑???대뙌?곌? ?쒖떆). ?대떦???곹깭? ?숈씪 洹쒖튃.
  186:     const { svarTasks, svarLinks } = useMemo(() => {
  187:         const assigneeIds = new Set(selectedAssignees.map((o) => o.value));
  188:         const statusKeys = new Set(selectedStatuses.map((o) => o.value));
  189: 
  190:         const filtered = tasks.filter((task) => {
  191:             if (assigneeIds.size && !assigneeIds.has(task.assignee?.accountId)) return false;
  192:             if (statusKeys.size && !statusKeys.has(task.statusKey)) return false;
  193:             if (!matchesProjectKeys(task.project?.key, selectedProjectKeys)) return false;
  194:             return true;
  195:         });
  196: 
  197:         const visibleIds = new Set(filtered.map((task) => task.id ?? task.key));
  198:         // ?댁뒋 留곹겕: ???앹젏??媛???댁뒋???뚮쭔(湲곗〈 洹쒖튃, 臾대?寃?.
  199:         const visibleIssueLinks = links.filter(
  200:             (l) => visibleIds.has(l.source) && visibleIds.has(l.target)
  201:         );
  202: 
  203:         // 誘몄씪???댁뒋 placeholder 留됰????꾨줈?앺듃 ?쒖옉?쇱뿉 ?볥뒗???놁쑝硫??대뙌?곌? ?ㅻ뒛濡??대갚).
  204:         //  ?대뜑 ?몃뱶???꾪꽣??媛?? ?댁뒋 湲곗??쇰줈 濡ㅼ뾽 湲곌컙/?섑뻾?⑥쓣 ?대뙌?곌? ?ш퀎??鍮??대뜑???쒖떆).
  205:         const svarTasks = toSvarTasks(filtered, {
  206:             placeholderStart: parseISODate(meta?.projectStart),
  207:             folders,
  208:             folderIssues,
  209:             hourRate,
  210:         });
  211: 
  212:         // ?대뜑 留곹겕(R2): ???앹젏???ㅼ젣 ?뚮뜑?섎뒗 SVAR ?몃뱶(?댁뒋 id + folder:<uuid> ?대뜑 ?몃뱶)???뚮쭔.
  213:         //   dangling 諛⑹뼱(짠6-4 D7): ??젣???댁뒋/?대뜑瑜?媛由ы궎??留곹겕??nodeIdSet 援먯감濡?臾댁떆.
  214:         const nodeIdSet = new Set(svarTasks.map((tk) => tk.id));
  215:         const visibleFolderLinks = (Array.isArray(folderLinks) ? folderLinks : []).filter(
  216:             (l) => nodeIdSet.has(l.source) && nodeIdSet.has(l.target)
  217:         );
  218: 
  219:         return {
  220:             svarTasks,
  221:             // ?댁뒋 留곹겕 + ?대뜑 留곹겕 蹂묓빀(媛곸옄 媛?쒖꽦 洹쒖튃?쇰줈 ?꾪꽣). toSvarLinks ???섏쓣 ?숉삎?쇰줈 泥섎━.
  222:             svarLinks: toSvarLinks([...visibleIssueLinks, ...visibleFolderLinks]),
  223:         };
  224:     }, [
  225:         tasks,
  226:         links,
  227:         folderLinks,
  228:         selectedAssignees,
  229:         selectedStatuses,
  230:         meta,

hook: PostToolUse
hook: PostToolUse
hook: PostToolUse Completed
hook: PostToolUse Failed
context compacted
hook: SessionStart
hook: SessionStart Completed
codex
코드·테스트·실제 의존성 구현을 교차 확인했습니다. 특히 A-4에는 Forge Custom Entity의 일관성 특성 때문에 완료 판정이 영구히 멈출 수 있는 경로가 확인됐고, 프런트에서는 invalidate 제거 후 롤백과 파생값 불일치가 지속될 수 있습니다.
codex
검토 결과: **승인 보류**입니다. 치명 2건, 중요 3건, 사소 1건을 확인했습니다.

- **치명** — [src/queue/consumer.js:268](/C:/CloudJira/moves-workforce/src/queue/consumer.js:268)  
  `jobId` 인덱스 조회로 완료 수를 세는데, Forge Custom Entity의 `query()`는 eventual consistency입니다. 마지막 done 배치 저장 직후 인덱스에 그 레코드가 아직 반영되지 않으면 `totalBatches - 1`로 반환되고, 이후 재시도/새 이벤트가 없으면 job은 `RUNNING`에 영구 잔류합니다. 기존 개별 `get()` 방식은 strict consistency였으므로 이 회귀가 새로 생겼습니다. 테스트의 in-memory `Map`은 즉시 가시성이므로 이 경우를 포착하지 못합니다. [Atlassian Custom Entity Store 문서](https://developer.atlassian.com/platform/forge/storage-reference/entities/)

- **치명** — [.container-service-assets/local-account:1](/C:/CloudJira/moves-workforce/.container-service-assets/local-account:1)  
  미추적 파일에 Forge tunnel/proxy 인증 토큰이 들어 있으며 ignore되지 않았습니다. `git add -A` 또는 미추적 파일 일괄 커밋 시 자격 증명이 저장소에 유출됩니다. 토큰 폐기·재발급 및 파일 제거/ignore가 필요합니다.

- **중요** — [useGanttMutations.js:443](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:443), [517](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:517), [584](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:584)  
  세 mutation이 전체 query snapshot을 롤백합니다. M1의 assignee 변경 후 M2의 planned MD 변경이 성공하고 M1만 실패하면, M1의 늦은 `onError`가 M2의 성공한 낙관값까지 이전 snapshot으로 덮어씁니다. invalidate도 제거되어 잘못된 화면 상태가 자연 refetch 전까지 유지됩니다.

- **중요** — [useGanttMutations.js:574](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:574)  
  planned MD 낙관 패치는 `originalEstimateSeconds`만 바꾸고 서버 파생값인 `progress`를 갱신하지 않습니다. 예를 들어 4시간 작업/8시간 계획인 task를 4시간 계획으로 변경하면 서버는 progress를 100%로 반환하지만, 화면의 간트 바는 기존 50%로 남습니다. 기존 invalidate가 이를 복구했지만 이제는 지속됩니다.

- **중요** — [WorklogModal.jsx:137](/C:/CloudJira/moves-workforce/static/ui/src/pages/myWork/modal/WorklogModal.jsx:137)  
  기존 worklog comment의 ADF→Markdown 비동기 변환 중에도 Submit이 가능하고, `cancelled`는 모달 종료·대상 변경만 막습니다. 청크 로드가 느린 상태에서 저장하면 빈 `markdown`이 서버로 전송되어 기존 comment를 지울 수 있으며, 변환 import 실패도 빈 문자열로 처리되어 같은 데이터 손실 경로가 됩니다. `MarkdownEditorLazy`의 `ChunkErrorBoundary`는 이 converter import 실패를 보호하지 않습니다.

- **사소** — [du.exe.stackdump:1](/C:/CloudJira/moves-workforce/du.exe.stackdump:1)  
  미추적 crash dump가 ignore되지 않았습니다. 일괄 staging 시 무관한 진단 정보가 포함될 수 있습니다.

확인된 항목:

1. **A-6** — admin 판정 실패는 계속 전파되어 fail-close이고, users SQL 실패·미등록 사용자의 principal 결과도 기존 분기와 동일합니다. 병렬화 자체의 권한 완화는 없습니다.
2. **P1-1 일부** — `calendarRef` 전달은 보존됐고, FullCalendar/MarkdownEditor 각각의 내부 `Suspense`와 `ChunkErrorBoundary` 배치는 legacy `ReactDOM.render` 환경의 lazy 경계를 적절히 분리합니다.
3. **P1-2** — 오탐 판정은 타당합니다. Atlaskit Tabs 18.3.4는 `visited Set`으로 방문 전 panel을 mount하지 않으며, 추가 테스트도 최초 미방문 panel 비마운트와 재방문 후 유지라는 전제를 고정합니다.

새 Jest 테스트는 read-only 환경에서 Jest 임시 캐시 쓰기가 `EPERM`으로 차단돼 실행 전 실패했습니다. 따라서 테스트 통과 및 bundle gzip 수치는 수정 리포트 외에 독립 재현하지 못했습니다.
hook: Stop
hook: Stop
hook: Stop Completed
hook: Stop Failed
tokens used
277,431
검토 결과: **승인 보류**입니다. 치명 2건, 중요 3건, 사소 1건을 확인했습니다.

- **치명** — [src/queue/consumer.js:268](/C:/CloudJira/moves-workforce/src/queue/consumer.js:268)  
  `jobId` 인덱스 조회로 완료 수를 세는데, Forge Custom Entity의 `query()`는 eventual consistency입니다. 마지막 done 배치 저장 직후 인덱스에 그 레코드가 아직 반영되지 않으면 `totalBatches - 1`로 반환되고, 이후 재시도/새 이벤트가 없으면 job은 `RUNNING`에 영구 잔류합니다. 기존 개별 `get()` 방식은 strict consistency였으므로 이 회귀가 새로 생겼습니다. 테스트의 in-memory `Map`은 즉시 가시성이므로 이 경우를 포착하지 못합니다. [Atlassian Custom Entity Store 문서](https://developer.atlassian.com/platform/forge/storage-reference/entities/)

- **치명** — [.container-service-assets/local-account:1](/C:/CloudJira/moves-workforce/.container-service-assets/local-account:1)  
  미추적 파일에 Forge tunnel/proxy 인증 토큰이 들어 있으며 ignore되지 않았습니다. `git add -A` 또는 미추적 파일 일괄 커밋 시 자격 증명이 저장소에 유출됩니다. 토큰 폐기·재발급 및 파일 제거/ignore가 필요합니다.

- **중요** — [useGanttMutations.js:443](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:443), [517](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:517), [584](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:584)  
  세 mutation이 전체 query snapshot을 롤백합니다. M1의 assignee 변경 후 M2의 planned MD 변경이 성공하고 M1만 실패하면, M1의 늦은 `onError`가 M2의 성공한 낙관값까지 이전 snapshot으로 덮어씁니다. invalidate도 제거되어 잘못된 화면 상태가 자연 refetch 전까지 유지됩니다.

- **중요** — [useGanttMutations.js:574](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/gantt/useGanttMutations.js:574)  
  planned MD 낙관 패치는 `originalEstimateSeconds`만 바꾸고 서버 파생값인 `progress`를 갱신하지 않습니다. 예를 들어 4시간 작업/8시간 계획인 task를 4시간 계획으로 변경하면 서버는 progress를 100%로 반환하지만, 화면의 간트 바는 기존 50%로 남습니다. 기존 invalidate가 이를 복구했지만 이제는 지속됩니다.

- **중요** — [WorklogModal.jsx:137](/C:/CloudJira/moves-workforce/static/ui/src/pages/myWork/modal/WorklogModal.jsx:137)  
  기존 worklog comment의 ADF→Markdown 비동기 변환 중에도 Submit이 가능하고, `cancelled`는 모달 종료·대상 변경만 막습니다. 청크 로드가 느린 상태에서 저장하면 빈 `markdown`이 서버로 전송되어 기존 comment를 지울 수 있으며, 변환 import 실패도 빈 문자열로 처리되어 같은 데이터 손실 경로가 됩니다. `MarkdownEditorLazy`의 `ChunkErrorBoundary`는 이 converter import 실패를 보호하지 않습니다.

- **사소** — [du.exe.stackdump:1](/C:/CloudJira/moves-workforce/du.exe.stackdump:1)  
  미추적 crash dump가 ignore되지 않았습니다. 일괄 staging 시 무관한 진단 정보가 포함될 수 있습니다.

확인된 항목:

1. **A-6** — admin 판정 실패는 계속 전파되어 fail-close이고, users SQL 실패·미등록 사용자의 principal 결과도 기존 분기와 동일합니다. 병렬화 자체의 권한 완화는 없습니다.
2. **P1-1 일부** — `calendarRef` 전달은 보존됐고, FullCalendar/MarkdownEditor 각각의 내부 `Suspense`와 `ChunkErrorBoundary` 배치는 legacy `ReactDOM.render` 환경의 lazy 경계를 적절히 분리합니다.
3. **P1-2** — 오탐 판정은 타당합니다. Atlaskit Tabs 18.3.4는 `visited Set`으로 방문 전 panel을 mount하지 않으며, 추가 테스트도 최초 미방문 panel 비마운트와 재방문 후 유지라는 전제를 고정합니다.

새 Jest 테스트는 read-only 환경에서 Jest 임시 캐시 쓰기가 `EPERM`으로 차단돼 실행 전 실패했습니다. 따라서 테스트 통과 및 bundle gzip 수치는 수정 리포트 외에 독립 재현하지 못했습니다.
