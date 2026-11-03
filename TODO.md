# TODO

향후 개선이 필요한 항목을 **위험도(중요도) 순**으로 정리한 목록입니다. (최종 갱신: 2026-11-03)

| 등급 | 기준 |
|---|---|
| 🔴 높음 | 보안 취약점, 사용자 환경/다른 확장에 영향, 기능 고장 가능성 |
| 🟠 중간 | 잘못된 결과·문서 불일치, 유지보수 부담 |
| 🟢 낮음 | 코드 품질, 정리 작업 |

---

## 🔴 높음

(없음)

---

## 🟠 중간

### M4. 옵션 값의 색상 코드가 강조되지 않음 (릴리스 노트와 범위 차이)

- **현재 상태**: 릴리스 노트 v0.0.7 "Option의 값 영역에 하이라이트 적용". 실제로는 옵션 값에 문자열(`#sentence`)·헥사 색상 규칙만 적용되어, 숫자 같은 표현식은 강조되지만 Skript에서 흔한 **따옴표 없는 값**(`prefix: &a[Test]`)의 색상 코드 `&a`에는 색이 붙지 않음 (TextMate 토큰 확인: scope 없음).
- **해야 할 일**:
  - [ ] `themes/vskript.tmLanguage.json`의 options 값 패턴에 색상 코드(`&[0-9a-fk-or]`, `§…`, `<색 이름>`) 규칙 추가
  - [ ] 또는 릴리스 노트 문구를 실제 범위에 맞게 정정
  - [ ] `src/test/unit/grammar.test.ts`에 따옴표 없는 옵션 값의 색상 코드 테스트 추가

---

## 🟢 낮음

### L4. v0.0.9 "2.8 버전 컬러 테마 지원"의 의미 확인

- **현재 상태**: 릴리스 노트(원작자 작성)에 설명이 없어 무엇을 가리키는지 확인 불가 (Skript 2.8 구문 색상인지, 테마 이름인지). 테마 등록·파일 유효성만 테스트로 확인함.
- **해야 할 일**:
  - [ ] 원작자 커밋(`c14f929`)의 문법·테마 변경 내용을 보고 의미를 정리해 릴리스 노트에 구체적으로 적거나, 확인할 수 없으면 문구 정리

### L5. 실제 화면 색상 수동 확인

- **현재 상태**: 구문 강조는 토큰 scope와 테마 규칙(예: `vskript.grammar` 굵게 주황색)까지만 자동 확인. 렌더링된 색은 눈으로 본 적 없음.
- **해야 할 일**:
  - [ ] VSkript - Dark+ / light+ 테마로 `src/test/fixtures/workspace/lib.sk`를 열어 색상 확인 (색상 코드, 제어문, 이벤트, 옵션)

### L6. 저장하지 않은 문서 열기 오류의 회귀 테스트가 간접적

- **현재 상태**: v0.1.1에서 고친 "저장하지 않은 새 문서를 열면 오류" 문제는 이벤트 처리기 안의 예외라 테스트가 직접 잡지 못함 (다른 테스트가 untitled 문서를 열어도 실패하지 않음).
- **해야 할 일**:
  - [ ] 확장 로그(`Logger`)에 기록된 오류를 테스트 API로 노출하거나, 이벤트 처리기 예외를 기록·조회할 수 있게 한 뒤 "untitled 문서를 열어도 오류 0건" 테스트 추가

### L7. ".sk 작업 공간이면 활성화" 런타임 확인이 약함

- **현재 상태**: VS Code 테스트 환경은 작업 공간이 없어도 개발 중인 확장을 미리 활성화함. 그래서 `release.test.ts`의 활성화 테스트는 사실상 항상 통과하고, 실제 보장은 package.json `activationEvents` 확인뿐.
- **해야 할 일**:
  - [ ] `.sk`가 없는 작업 공간으로 별도 테스트 실행(`.vscode-test.mjs`에 두 번째 설정)을 만들어 활성화되지 않음 → `.sk` 작업 공간에서 활성화됨을 비교하거나, 현재 수준으로 충분하다고 판단되면 항목 종료

---

## 완료된 항목

- [x] **릴리스 노트 기능 전수 확인** (2026-11-03): RELEASE_KR.md 항목별 자동 테스트 62개 (`test/unit/grammar.test.ts`, `test/unit/datapack.test.ts`, `test/suite/release.test.ts`). 확인 중 발견·수정: 문서 분석 오류(`50ef177`)로 아웃라인 하위 항목·Aliases·의미 강조가 전부 동작하지 않던 문제, 함수 Docs 툴팁 호버 미표시, `#>>` Docs 생성 실패, code 모드 호버에 다음 함수 주석 혼입, 아웃라인 함수 이름 중복, 다른 드라이브의 `.sk` 파일 경로 오류. 완전히 확인하지 못한 항목은 M4, L4~L7

- [x] **M3. 스니펫 동작 확인** (2026-11-03): 통합 테스트로 확인 — `_func`, `_funcr`, `_fx`, `_fxr`이 자동완성에 스니펫으로 나오고, `myscript.sk`에서 `function myscript_Name():` 등 파일 이름이 들어간 코드로 펼쳐짐(들여쓰기는 사용자 편집기 설정을 따름). README 기능에 "9. 코드 스니펫" 추가
- [x] **M2. 버전 호환성 진단 활성화** (2026-11-03): 기존 줄 단위 매칭은 `<.+>`, `%objects% is %objects%` 같은 패턴이 **아무 줄에나 맞아** 어떤 버전으로 검사해도 경고 0건(사실상 무의미)이었음. `SyntaxRegistry.findVersionIssue`로 교체: 문장 단위 구문(effect/condition/event/section/structure)만, 현재 버전 쪽은 고정 글자 1자 이상, 경고 근거는 6자 이상 패턴, `if`/`else if`/`while` 접두사 제거, 줄 결과 캐시. Skript 2.15.4 공식 테스트(475파일, 12,576줄)로 측정: 2.15.4 기준 경고 0건(오탐 0), 2.10 기준 135건 전부 2.11~2.14 구문. 설정 `vskript.diagnostics.versionCheck`(기본 켬). 테스트 중 발견한 버그 수정: 진단·문서 갱신 타이머가 예약 시점의 문서 객체를 붙잡고 있어, 닫힌 뒤 같은 uri로 다시 열린 문서(untitled 재사용, 닫았다 다시 열기)의 진단을 지우던 문제 → 실행 시점에 uri로 열린 문서를 찾음
- [x] **M1. 진단 병합 로직 / 경쟁 조건** (2026-11-03): 진단 계산(`computeDiagnostics`)은 배열만 반환하고, `scheduleDiagnostics`가 문서별 타이머로 예약해 **한 번만** `set` (기존: 설정한 결과를 다시 읽어 덧붙인 뒤 또 설정). 빈 배열만 반환하던 `checkVersionCompatibility` 제거. 추가로 발견한 버그 수정: 문서 변경 디바운스 타이머가 전체에 하나뿐이라 A를 고친 뒤 350ms 안에 B를 고치면 **A의 모델·진단 갱신이 취소**되던 문제 → 문서별 타이머. 구문 데이터·설정 변경 시 활성 편집기만이 아니라 열린 모든 Skript 문서를 갱신, 문서를 닫으면 진단 삭제. 테스트 추가(옛 코드에서 실패 확인)
- [x] **H3. 자동완성/호버 실제 사용 환경 검증** (2026-11-03): 통합 테스트 `src/test/suite/environment.test.ts`로 자동화 — 임시 서버 폴더(`plugins/Skript.jar`, Skript 2.10.0) 감지 → GitHub에서 DataPack 다운로드 → 감지 버전으로 자동완성 필터 → `vskript.language: ko` 한국어 호버 (오프라인이면 건너뜀). 이 과정에서 버그 발견·수정: 감지가 진행 중일 때(예: 시작 직후 첫 DataPack 다운로드) "다시 감지" 명령이 **옛 설정으로 시작된 결과**를 돌려주던 문제 → 진행 중인 감지가 끝나면 바로 한 번 더 감지하고 그 결과로 완료
  - `a7c4ff1`("use DocumentSymbol") 분석: 아웃라인(`SkriptDocumentSymbolProvider.ts`)에 넣으려던 변경 2개가 자동완성 파일에 잘못 덮어써진 것으로 판단 → 아웃라인에 적용. ① 함수 매개변수 타입이 `[object Object]`로 표시되던 버그 수정(`p.type.text`) ② 수정 중인 문서도 아웃라인 캐시 재사용(모델은 350ms 디바운스 때 갱신되므로 결과 동일, 계산만 줄어듦). 아웃라인 테스트 추가
- [x] **H2. 전역 `console.log` 가로채기 제거** (2026-11-03): `activate()`의 전역 `console.log`/`console.info` 덮어쓰기와 미사용 `patchLogger.ts` 삭제. 새 `src/Vskript/Logger.ts`가 출력 패널의 "VSkript" 로그 채널(`LogOutputChannel`) 하나에 기록하며 `ServerEnvironment`도 같은 채널을 씀(같은 이름의 채널이 두 개 생기던 문제 해소). 타이핑·스캔마다 찍히던 기록은 debug 수준으로 내림(출력 패널에서 수준 변경 가능). 재발 방지: eslint `no-restricted-syntax`로 `console.* =` 대입을 **오류** 처리 → `npm test`(린트 포함)에서 실패. 런타임 테스트는 테스트 실행기가 console을 계속 다시 감싸서 함수 비교가 불가능해 쓰지 않음
- [x] **L3. 개발 도구 의존성 업그레이드** (2026-11-03): typescript 4 → 6.0(typescript-eslint가 `<6.1`까지 지원해 7.x는 보류), eslint 7 → 10 + typescript-eslint 8(`.eslintrc.json` → `eslint.config.mjs`), `vscode-test` → `@vscode/test-cli` + `@vscode/test-electron`, mocha 8 → 11, `@types/node` 12 → 22, `copyfiles` → `fs.cpSync`, 미사용 `glob`/`@types/glob` 제거. 런타임 의존성 취약점 0건. 남은 `npm audit` 17건은 전부 테스트 도구(mocha, @vscode/test-cli) 하위 의존성이며 상위 수정판 없음
- [x] **L2. 테스트 / 린트** (2026-11-03): `npm test` = 컴파일 → 린트 → VS Code 1.120 통합 테스트(단위 5 + 통합 4). VS Code 없이 빠르게 돌리는 `npm run test:unit`. 린트 경고 190 → 0 (`--fix`, `naming-convention`은 외부 JSON 필드명 snake_case·enum UPPER_CASE 허용, `eqeqeq`는 `== null` 허용, 나머지 지역 변수명 정리)
- [x] **L1. 미사용 코드/리소스 삭제** (2026-11-03): `src/Java.ts`(실제로는 `Class<T>` 타입 하나만 쓰여 `SkriptDocument.ts`로 이동), `language/Materials.ts`, `language/SkriptEffects.ts`, `assets/ko_dict.json`, `src/resource/addon_syntax.json`, `src/resource/lang/default.lang`
- [x] **저장되지 않은 문서 열기 오류 수정** (2026-11-03): untitled `.sk` 문서를 열면 디스크 스캔이 ENOENT 예외를 내던 문제 (통합 테스트에서 발견)
- [x] **H1. 내려받은 DataPack을 자동완성/호버/진단에 연결** (2026-11-03): `src/Vskript/syntax/`
  - `SyntaxRegistry`: 번들 `core_syntax.json` + DataPack을 하나로 합친 구문 저장소. Skript DataPack이 있으면 번들 core 대신 사용(번들은 오프라인·캐시 없음일 때 폴백). 자동완성·호버·진단은 이것만 봄 → `SkriptHubClient` 삭제(쓰이지 않던 `globalStorage/syntax_db.json` 쓰기도 제거)
  - 버전 필터(`SyntaxVersion`): `valid_from_addon_version_parsed`(+`valid_until_*`) 기준, 비교 규칙은 vskript-database `version.js`의 `compareVersions`와 동일. 설치 버전을 모르거나 시작 버전이 부정확(`before`/`or_earlier`/`unknown`)하면 숨기지 않음. Skript 버전 = 파일 주석 > 서버 환경, 애드온 버전 = 서버 환경
  - 호버: 옵션·함수 다음으로 구문 호버 추가. `vskript.language: ko`이고 번역이 있으면 `guide.description`(stale이면 표시), 아니면 원문. 현재 버전에서 못 쓰는 구문이면 경고 표시
  - `onDidChangeEnvironment` → 레지스트리 재로딩 → `onDidReload` → 진단 갱신
  - `SkriptPattern`: Skript 패턴(`[]`, `(|)`, `%%`, `<>`, `1¦`, `tag:`)을 정규식·자동완성 레이블로 변환
  - 자동완성에서 제거: `ko_dict` 읽기, 가짜 "온디맨드 애드온"(확장 설치 폴더에 mock JSON을 쓰던 코드)과 이에만 연결돼 있던 `# addons:` 주석. 구문 설명은 `resolveCompletionItem`에서 지연 생성
- [x] **서버 환경 감지 + DataPack 다운로드** (2026-11-03): `src/Vskript/env/`
  - `plugins` 폴더 자동 탐색(`vskript.serverPath`로 지정 가능) → jar 안의 `plugin.yml`/`paper-plugin.yml`에서 이름·버전 읽기 (실패 시 파일명 추정)
  - 설정 `vskript.skriptVersion`, `vskript.addons`(`이름@버전`)가 감지 결과를 덮어씀. 감지값과 다르면 **같은 불일치당 알림 1회** (내용이 바뀌면 다시 알림, 명령 실행 시 항상 알림)
  - vskript-database DataPack을 `content_hash` 비교로 바뀐 애드온만 내려받고 해시 검증 후 `globalStorageUri`에 캐시. 오프라인이면 캐시 사용
  - 상태 표시줄(Skript 버전·애드온 수·불일치 표시), 명령 `VSkript: 서버 환경 보기` / `서버 환경 다시 감지 및 구문 데이터 동기화`, jar 변경·설정 변경 시 자동 재감지
  - 진단의 Skript 버전 = 파일 주석 > 서버 환경 > 기본 2.7 (기존: 주석 > 2.7)
- [x] **`axios` 제거** (2026-11-03): 호출되지 않던 `syncWithServer`/`syncAddonData`와 함께 삭제. 다운로드는 내장 `fetch` 사용. 런타임 의존성 취약점 0건

- [x] **빌드 깨짐 수정**: 커밋 `a7c4ff1`에서 `SkriptCompletionItemProvider.ts`가 `SkriptDocumentSymbolProvider`와 거의 동일한 코드로 덮어써져 `tsc` 컴파일이 실패하던 문제 → 직전 버전으로 복원 (동작 검증은 H3)
- [x] **VS Code 버전 불일치 수정**: 기준을 1.120.0으로 통일 (`engines.vscode`는 `^1.120.0`, `@types/vscode`는 `~1.120.0`으로 고정 — `^`로 두면 1.144가 설치되어 vsce가 패키징을 거부함). VS Code 1.120 미만은 더 이상 지원하지 않음.
- [x] **스니펫 등록**: `package.json`의 `contributes.snippets`에 추가 (동작 검증은 M3)
- [x] `src/resource/lang/default copy.lang` 삭제 (`default.lang`과 완전히 동일한 사본)
- [x] 중복 devDependency `copyfile` 제거
