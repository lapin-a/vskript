<img src="img/cover.png" width="128">

# VSkript

![version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![vscode](https://img.shields.io/badge/VSCode-%5E1.56.0-brightgreen.svg)
![license](https://img.shields.io/badge/license-MIT-lightgrey.svg)

Minecraft(Java Edition)의 Skript 플러그인 스크립트(.sk)를 위한 VSCode 확장 프로그램입니다.
A VSCode extension for writing Minecraft(Java Edition) Skript plugin scripts (.sk).

<br>

> **📌 원작자 안내**
> 이 프로젝트는 [vhone](https://github.com/vhone)님이 개발한 [VSkript](https://github.com/vhone/vskript)를 포크(fork)하여 이어가는 저장소입니다.
> 원본 프로젝트의 코드와 아이디어에 감사드립니다.
>
> **Original Author Notice**
> This repository is a fork of the original [VSkript](https://github.com/vhone/vskript) created by [vhone](https://github.com/vhone).
> All credit for the original work goes to the original author.

<br>

## 목차 / Table of Contents

- [소개](#소개)
- [설치](#설치)
- [사전 준비](#사전-준비)
- [기능](#기능)
- [설정](#설정)
- [개발 / 빌드](#개발--빌드)
- [기여 및 이슈 제보](#기여-및-이슈-제보)
- [업데이트 내역](#업데이트-내역)
- [라이선스](#라이선스)

<br>

## 소개

VSkript는 Skript 스크립트의 함수를 보다 편리하게 작성하고 관리할 수 있도록 도와주는 VSCode 확장 프로그램입니다.
구문 강조, 컬러 미리보기, 아웃라인, 툴팁, 자동완성, 심볼 검색, 정의로 이동, 버전 호환성 진단 등의 기능을 제공합니다.

VSkript is a VSCode extension designed to make writing and managing Skript functions more convenient.
It provides syntax highlighting, a color preview, an outline view, tooltips, auto-completion, symbol search, go-to-definition, and version compatibility diagnostics.

<br>

## 설치

### 마켓플레이스에서 설치

VSCode 확장 마켓플레이스에서 `VSkript`를 검색하여 설치할 수 있습니다.

### From Marketplace

You can search for `VSkript` in the VSCode Extension Marketplace and install it.

### VSIX 파일로 수동 설치

1. [Releases](https://github.com/lapin-a/vskript/releases) 페이지 또는 빌드 결과물에서 `.vsix` 파일을 받습니다.
2. VSCode에서 `확장(Extensions)` 뷰 → `...` 메뉴 → `VSIX에서 설치...`를 선택합니다.
3. 다운로드한 `.vsix` 파일을 선택합니다.

### Manual install via .vsix

1. Download the `.vsix` file from the [Releases](https://github.com/lapin-a/vskript/releases) page or from a local build.
2. In VSCode, open the `Extensions` view → `...` menu → `Install from VSIX...`.
3. Select the downloaded `.vsix` file.

<br>

## 사전 준비

VSkript는 스크립트가 정상적으로 인식되기 위해 다음 조건이 반드시 충족되어야 합니다.

- **작업 공간(workspace) 루트는 반드시 `scripts` 폴더여야 합니다.**
  
  plugins/Skript/scripts   ← 이 폴더를 VSCode 작업 공간으로 열어야 합니다.
  
- **비활성화(주석 `#` 처리)된 스크립트는 코드 하이라이트를 제외한 대부분의 기능이 동작하지 않습니다.**

### Prerequisites

The following conditions must be met for VSkript to recognize scripts correctly.

- **The workspace root must be the `scripts` folder.**
  
  plugins/Skript/scripts   ← Open this folder as the VSCode workspace.
  
- **Disabled scripts (commented out with `#`) do not work with most features except code highlighting.**

<br>

## 기능

### 1. 코드 하이라이트

![code_highlight](img/code_highlight.gif)

Skript 전용 구문, 색상 코드, 중첩 표현식 등을 하이라이트합니다.

**Code Highlight**
Highlights Skript-specific syntax, color codes, and nested expressions.

### 2. 컬러 미리보기 / 피커

![color_picker](img/color_picker.gif)

`<##000000>` 형태의 헥사코드에 마우스 커서를 올리면 컬러 피커가 나타나며, 피커를 통해 값을 변경할 수 있습니다.

**Color Provider**
Hovering over a hex code in the form `<##000000>` shows a color picker, which can be used to change the value.

### 3. 아웃라인

![outline](img/outline.png)

Options, Aliases, Command, Event, Function이 아웃라인에 등록됩니다.

**Outline**
Options, Aliases, Command, Event, and Function are registered in the outline view.

### 4. 툴팁

![tooltip](img/tooltip.gif)

Option, Alias, Function 위에 마우스 커서를 올리면 툴팁이 표시됩니다. Function은 Docs 주석을 통해 추가 정보를 표시할 수 있습니다.

**Tooltip**
Hovering over an Option, Alias, or Function displays a tooltip. Functions can show additional information via Docs comments.

### 5. 함수 확장

**함수 Docs 주석**

![function_docs](img/function_docs.gif)

함수 위쪽에 `#>>`를 입력하면 Docs 주석이 생성되며, MarkDown 문법으로 툴팁 내용을 작성할 수 있습니다.

**Function Docs**
Typing `#>>` above a function generates a Docs comment block, which supports MarkDown for writing the tooltip content.

**자동완성**

![function_completion](img/function_completion.gif)

단축키 `Ctrl+Space`로 함수 자동완성 목록을 사용할 수 있습니다.

**Completion**
Use the `Ctrl+Space` shortcut to bring up the function auto-completion list.

**심볼 검색**

![symbol_search](img/symbol_search.gif)

- `Ctrl+T` : 전체 문서에서 스크립트 요소 검색
- `Ctrl+Shift+.` : 현재 열린 문서에서 스크립트 요소 검색
- Docs 주석에 `@invisible`을 추가하면 해당 요소는 검색 및 자동완성에서 제외됩니다.

**Symbol Search**
- `Ctrl+T`: Search script elements across all documents.
- `Ctrl+Shift+.`: Search script elements in the current document.
- Adding `@invisible` to a Docs comment excludes that element from search and auto-completion.

**정의로 이동**

![goto_definition](img/goto_definition.gif)

`Ctrl+클릭` 또는 커서가 함수 위에 있을 때 `F12`를 눌러 함수가 정의된 위치로 이동할 수 있습니다.

**Go to Definition**
`Ctrl+Click`, or pressing `F12` while the cursor is on a function, navigates to where the function is defined.

### 6. 버전 호환성 진단

Skript Hub 동기화 데이터를 기반으로 사용 중인 문법의 버전 호환성을 진단합니다.

**Version Compatibility Diagnostics**
Diagnoses the version compatibility of used syntax based on Skript Hub sync data.

<br>

## 설정

| 설정 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `vskript.language` | `string` (`en` \| `ko`) | `en` | 인텔리센스(자동완성, 호버)에 표시될 가이드의 기본 언어를 설정합니다. |
| `vskript.hoverContentMode` | `string` (`description` \| `code`) | `description` | 호버 시 표시할 콘텐츠 형식을 선택합니다. `description`은 함수 상단 Docs 주석을, `code`는 함수의 실제 소스 코드를 표시합니다. |

### Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `vskript.language` | `string` (`en` \| `ko`) | `en` | Sets the default language for the guide shown in IntelliSense (auto-completion, hover). |
| `vskript.hoverContentMode` | `string` (`description` \| `code`) | `description` | Selects the content format shown on hover. `description` shows the function's Docs comment; `code` shows the function's actual source code. |

<br>

## 개발 / 빌드

# 의존성 설치
npm install

# 컴파일
npm run compile

# 변경 감지 컴파일
npm run watch

# 린트 검사
npm run lint


### Development / Build

# Install dependencies
npm install

# Compile
npm run compile

# Compile in watch mode
npm run watch

# Lint
npm run lint


<br>

## 기여 및 이슈 제보

버그 제보, 기능 제안, 기여는 언제나 환영합니다.

- 이슈 등록: [GitHub Issues](https://github.com/lapin-a/vskript/issues)
- Pull Request도 자유롭게 보내주세요.

### Contributing & Issues

Bug reports, feature requests, and contributions are always welcome.

- Report an issue: [GitHub Issues](https://github.com/lapin-a/vskript/issues)
- Feel free to open a Pull Request as well.

<br>

## 업데이트 내역

자세한 업데이트 내역은 아래 파일에서 확인하실 수 있습니다.

- [RELEASE_KR.md](RELEASE_KR.md) (한국어)
- [RELEASE_EN.md](RELEASE_EN.md) (English)

### Changelog

Detailed update history is available in the files above.

<br>

## 라이선스

이 프로젝트는 MIT 라이선스를 따르며, 원본 프로젝트([vhone/vskript](https://github.com/vhone/vskript))의 저작권을 존중합니다. 자세한 내용은 [LICENSE.md](LICENSE.md) 파일을 참고해주세요.

### License

This project is licensed under the MIT License and respects the copyright of the original project ([vhone/vskript](https://github.com/vhone/vskript)). See [LICENSE.md](LICENSE.md) for details.
