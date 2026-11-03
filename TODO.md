# TODO

향후 개선이 필요한 항목을 정리한 목록입니다. (최종 갱신: 2026-11-03)

## 1. 버전 호환성 진단 데이터 소스 명확화 / 실제 서버 동기화 구현

- **현재 상태**: `SkriptHubClient.ts`에 `syncWithServer()`, `syncAddonData()` 메서드가 구현되어 있으나 어디서도 호출되지 않음. 실제로는 `core_syntax.json`(로컬 번들 데이터)만 사용 중.
- **해야 할 일**:
  - [ ] README의 "버전 호환성 진단" 설명을 "Skript Hub 동기화 데이터 기반"이 아닌 "**내장된 로컬 구문 데이터베이스 기반**"으로 정정
  - [ ] 실제로 원격 동기화 기능을 사용할 계획이라면, `activate()` 또는 별도 명령(Command)에서 `syncWithServer()` 호출부 연결
  - [ ] 원격 동기화를 쓰지 않을 계획이라면, 죽은 코드(`syncWithServer`, `syncAddonData`, `API_URL`)와 `axios` 의존성 제거 검토

## 2. 코드 스니펫 기능 등록

- **현재 상태**: `package.json`의 `contributes.snippets`에 `snippets.code-snippets` 등록 완료.
- **해야 할 일**:
  - [x] `package.json`의 `contributes`에 스니펫 등록
  - [ ] 등록 후 실제 동작 확인 (`_func`, `_funcr` 등 prefix 테스트)
  - [ ] 정상 동작 확인되면 README 기능(Features) 섹션에 "코드 스니펫" 항목 추가

## 3. 사용되지 않는 코드/리소스 정리

- **현재 상태**: 아래 파일들은 어디서도 import/참조되지 않음.
  - 코드: `src/Java.ts`, `src/Vskript/patchLogger.ts`
  - 리소스: `assets/ko_dict.json`, `src/resource/addon_syntax.json`, `src/resource/lang/default.lang`
- **해야 할 일**:
  - [x] `src/resource/lang/default copy.lang` 삭제 (`default.lang`과 완전히 동일한 사본)
  - [x] 중복 devDependency `copyfile` 제거 (`copyfiles`만 사용)
  - [ ] 위 미참조 파일들을 연결할지 삭제할지 결정 (`ko_dict.json`은 `vskript.language: ko` 설정과 연결 의도로 보임)

## 4. 전역 `console.log` 가로채기 개선

- **현재 상태**: `extension.ts`의 `activate()`에서 `console.log`/`console.info`를 전역으로 덮어씀. 같은 확장 호스트의 다른 확장 로그에도 영향을 주며, `deactivate()`에서 복원하지 않음.
- **해야 할 일**:
  - [ ] `vscode.window.createOutputChannel('VSkript')` 기반 전용 로거로 교체하고 전역 패치 제거

## 5. 진단(Diagnostics) 병합 로직 정리

- **현재 상태**: `updateAllDiagnostics()`가 `refreshDiagnostics()`가 설정한 결과를 다시 읽어 버전 경고를 덧붙인 뒤 덮어씀. `setTimeout`으로 지연 실행되어 연속 호출 시 결과가 섞일 수 있음.
- **해야 할 일**:
  - [ ] 구문 진단과 버전 진단을 각각 배열로 계산한 뒤 한 번만 `set` 하도록 변경
  - [ ] 문서별 디바운스 적용

## 6. 테스트 / 린트

- **현재 상태**: `npm test`가 `out/test/runTest.js`를 실행하지만 테스트 코드가 없음. `npm run lint` 결과 오류 0, 경고 200건(대부분 `curly`, 125건 `--fix`로 자동 수정 가능).
- **해야 할 일**:
  - [ ] 최소한의 확장 활성화 테스트 추가 또는 `test`/`pretest` 스크립트 정리
  - [ ] `eslint --fix`로 자동 수정 가능한 경고 정리

## 완료된 항목

- [x] **빌드 깨짐 수정**: 커밋 `a7c4ff1`에서 `SkriptCompletionItemProvider.ts`가 `SkriptDocumentSymbolProvider`와 거의 동일한 코드로 덮어써져 `tsc` 컴파일이 실패하던 문제 → 직전 버전(`a7c4ff1^`)으로 복원. 자동완성 쪽에서 의도했던 변경이 있었다면 다시 적용 필요.
- [x] **VS Code 버전 불일치 수정**: `engines.vscode`(`^1.56.0`)와 `@types/vscode`(`^1.120.0`)가 달라 `vsce package`가 거부되던 문제 → 기준을 1.120.0으로 통일 (`engines.vscode`는 `^1.120.0`, `@types/vscode`는 `~1.120.0`으로 고정 — `^`로 두면 1.144가 설치되어 vsce가 다시 거부함). VS Code 1.120 미만은 더 이상 지원하지 않음.
