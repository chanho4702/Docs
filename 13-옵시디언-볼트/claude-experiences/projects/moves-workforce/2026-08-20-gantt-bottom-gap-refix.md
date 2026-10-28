# 2026-08-20 간트 하단 밀착 재발 수정 (wx-theme 이중 래퍼)

## 증상
간트 차트가 페이지 바닥에 딱 붙음(하단 여백 소멸) + 페이지/간트 세로 스크롤 이상. 08-12에 `.gantt-svar-host > .wx-theme{height:100%}`로 고쳤던 것과 동일 증상 재발.

## 근본 원인
SVAR(@svar-ui/react-gantt 2.7.1)의 `.wx-theme` 래퍼가 **두 겹** — `<Willow>`가 한 겹, `<Gantt>` 내부가 한 겹 더 만든다. 기존 선택자(`>` 직계 1단)는 바깥 래퍼만 이어서:

```
호스트 407px → wx-theme① 383px (100% 적용됨)
              → wx-theme② 1684px (규칙 없음 → auto → 콘텐츠 높이)
                → wx-gantt 1684px (height:100%가 auto 부모라 무효)
```

안쪽 래퍼가 콘텐츠 높이로 성장해 호스트를 **overflow로 뚫고** 나온다. **넘친 자손에는 호스트의 margin-bottom(48)이 적용되지 않으므로** 스크롤 끝 = 간트 바닥 = 페이지 바닥. `appMain scrollH=1967` → 수정 후 `794(=clientH)`.

## 해결
`gantt.css` 선택자를 두 단으로 확장:
```css
.gantt-svar-host > .wx-theme,
.gantt-svar-host > .wx-theme > .wx-theme { height: 100%; }
```

## 진단 방법 교훈 (Forge iframe 디버깅)
- Forge 앱 iframe은 크로스오리진(localhost:8000) → 브라우저 확장의 javascript_tool·콘솔 리더가 **내부 DOM에 접근 불가**(콘솔도 "current domain only").
- 유효했던 방법: 코드에 **position:fixed 디버그 오버레이**(rect/computed height/부모 체인)를 임시 렌더 → 스크린샷으로 수치를 읽는다. 확인 후 제거.
- `forge tunnel`은 manifest에 tunnel port가 없으면 **static/ui/build 산출물**을 서빙 → 소스 수정 확인마다 `npm run build` 필요(핫리로드 없음).
- Atlaskit 탭은 원격 클릭이 안 먹을 때 **hover 후 click**으로 해결됨.

관련: [[2026-07-02-issue-link-gantt]], 메모리 project_svar_gantt.md
