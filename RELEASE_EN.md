# Update v0.1.1
> **Requires VS Code 1.120 or later.** (previously 1.56)

1. Server environment detection
	- Finds the `plugins` folder automatically and reads Skript/addon names and versions from `plugin.yml` inside each jar
	- New settings `vskript.serverPath`, `vskript.skriptVersion`, `vskript.addons` (e.g. `SkBee@3.5.0`). Settings take priority over detection; a one-time notice is shown when they differ
	- Status bar shows the Skript version and addon count
	- New commands `VSkript: 서버 환경 보기` (Show Server Environment) and `VSkript: 서버 환경 다시 감지 및 구문 데이터 동기화` (Re-detect and sync syntax data)
	- Re-detects automatically when jars are added/removed or settings change
2. Automatic syntax data download
	- Downloads syntax data for your Skript and addons from [vskript-database](https://github.com/lapin-a/vskript-database) (only changed packs; uses the cache when offline)
	- New settings `vskript.database.autoDownload`, `vskript.database.url`
3. Completion
	- Suggests only syntax available in your Skript/addon versions
	- Suggests syntax from installed addons
	- Skript version priority: header comment (`# version: 2.10`, `# mc: 1.20`) > server environment
	- Typing `{@` suggests only option variables
4. Hover
	- Hovering over a statement shows its description, patterns and supported version (with a warning if it is not available in your version)
	- Shows Korean descriptions when `vskript.language` is `ko` (1,219 core Skript syntaxes translated)
5. Removed
	- The `# addons:` file comment (it worked without real data). Specify addons via server detection or the `vskript.addons` setting
6. Fixed
	- The v0.1.0 source did not compile
	- Opening a new unsaved document caused an error
	- Code snippets were not registered

# Update v0.1.0
1. Diagnostics
	- Missing colon (`:`) at the end of event, command, function and options lines
	- Indentation checks (mixed tabs/spaces, indentation depth under a section)
2. Completion
	- Core Skript syntax completion
	- Option variable completion after `{@`
3. Hover
	- Hovering over `{@option}` shows its value
	- Setting `vskript.hoverContentMode`: function hover shows the Docs comment (`description`) or the function body (`code`)
4. Go to Definition
	- `F12` also works for functions in files that are not open
5. New setting `vskript.language` (`en` / `ko`)
6. The extension activates as soon as a workspace containing `.sk` files is opened

# Updata v0.0.9
1. Syntax Highlight
	- support Skript 2.8
	- add white theme

# Updata v0.0.8
1. Syntax Highlight
	- add skript-reflect addon pattern

# Update v0.0.7
1. Syntax Highlight
	- Display all kinds of color tags in "Text" (&7, §7, \<grey\> 등) (https://skriptlang.github.io/Skript/text.html)
	- Option Variable is highlighted in "Text"
	- Syntax highlighting is applied to value in the Options section.
	- Exit, Continue Effect has control statement style applied
	- Boolean is number styled
	- 'parse if' and 'do while' are syntactically styled. (new syntax in script 2.6)
2. Fixed
	- String is highlighted in the type of function parameter.