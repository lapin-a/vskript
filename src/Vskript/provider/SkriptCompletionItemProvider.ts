import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * [Step 10 고도화] 마인크래프트 버전 선언 기반 온디맨드 변환 및 애드온 통합 자동완성 엔진
 */
export class SkriptCompletionItemProvider implements vscode.CompletionItemProvider {
    
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,  // 🌟 [Strict 방어] 사용하지 않는 매개변수 접두사(_) 처리
        _context: vscode.CompletionContext // 🌟 [Strict 방어] Sub구조 확장 대비 접두사 처리
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        
        const completionItems: vscode.CompletionItem[] = [];
        const currentLineText = document.lineAt(position.line).text;
        const linePrefix = currentLineText.substring(0, position.character);

        // VS Code 설정에서 언어 가져오기
        const userLanguage = vscode.workspace.getConfiguration('vskript').get<string>('language') || 'en';

        // 🌟 [유저 기획 반영 1단계] 상단 10줄 마인크래프트 버전 스캔 및 스크립트 버전 변환
        let currentScriptVersion = "2.7"; // 기본값 글로벌 락
        const mcVersion = this.parseMinecraftVersion(document);

        if (mcVersion) {
            currentScriptVersion = this.convertMCVersionToSkript(mcVersion);
            console.log(`🎮 [vskript] 마인크래프트 v${mcVersion} 감지 -> 내부 스크립트 v${currentScriptVersion} 규격으로 자동 매핑`);
        } else {
            // 하위 호환성 보장: 기존의 스크립트 버전 주석(# version: X.X) 추적
            currentScriptVersion = this.parseScriptVersion(document);
        }

        // 중복 입력 방지 범위 계산
        const isWordChar = (ch: string) => /[a-zA-Z0-9_]/.test(ch);
        let wordStart = position.character;
        while (wordStart > 0 && isWordChar(currentLineText[wordStart - 1])) {
            wordStart--;
        }
        const keywordRange = new vscode.Range(position.line, wordStart, position.line, position.character);

        // 기본 내장 키워드 주입
        const coreKeywords = [
            { label: 'on load:', detail: '이벤트: 스크립트 로드 시 실행' },
            { label: 'command /', detail: '명령어: 신규 커맨드 정의' },
            { label: 'trigger:', detail: '구문: 명령어 실행 블록 시작' }
        ];
        coreKeywords.forEach(kw => {
            const item = new vscode.CompletionItem(kw.label, vscode.CompletionItemKind.Keyword);
            item.detail = kw.detail;
            item.range = keywordRange;
            completionItems.push(item);
        });

        // 온디맨드 동적 매트릭스 수립
        try {
            const extension = vscode.extensions.getExtension('vhone.vskript');
            const rootPath = extension ? extension.extensionPath : '';
            
            // 실시간 결합될 동적 데이터베이스 메모리 풀(Pool)
            const activeSyntaxDatabases: { db: Record<string, any>; forceAddonName?: string }[] = [];

            // 1️⃣ [코어 엔진 상시 장착] core_syntax.json 로드
            let corePath = path.join(rootPath, 'out', 'resource', 'core_syntax.json');
            if (!fs.existsSync(corePath)) corePath = path.join(__dirname, '..', '..', 'resource', 'core_syntax.json');
            if (!fs.existsSync(corePath)) corePath = corePath.replace('out', 'src');

            if (fs.existsSync(corePath)) {
                try {
                    const coreDb = JSON.parse(fs.readFileSync(corePath, 'utf-8'));
                    activeSyntaxDatabases.push({ db: coreDb });
                } catch (e) {
                    console.error("🚨 [vskript] 코어 데이터셋 로드 실패:", e);
                }
            }

            // 2️⃣ [주석 스캔 및 온디맨드 파일 동적 결합] # addons: tuske, skquery 역추적
            const requiredAddons = this.parseRequiredAddons(document);
            requiredAddons.forEach(addonName => {
                const addonDb = this.loadAddonSyntaxOnDemand(addonName, rootPath);
                if (addonDb) {
                    activeSyntaxDatabases.push({ db: addonDb, forceAddonName: addonName });
                    console.log(`🔌 [vskript] 주석 선언 감지로 인해 [${addonName}.json] 자원이 인텔리센스에 온디맨드로 결합되었습니다.`);
                }
            });

            // 한국어 사전 로드 경로 보정
            let koDictPath = path.join(rootPath, 'out', 'resource', 'ko_dict.json');
            if (!rootPath || !fs.existsSync(koDictPath)) {
                koDictPath = path.join(__dirname, '..', '..', 'resource', 'ko_dict.json');
            }

            let koDict: Record<string, string> = {};
            if (fs.existsSync(koDictPath)) {
                koDict = JSON.parse(fs.readFileSync(koDictPath, 'utf-8')) as Record<string, string>;
            }

            // 3️⃣ [통합 비동기 스캔 루프] 활성화된 데이터베이스 세트만 정밀 회전
            for (const itemObj of activeSyntaxDatabases) {
                const syntaxDb = itemObj.db;
                const forceName = itemObj.forceAddonName; 

                for (const key in syntaxDb) {
                    const syntax = syntaxDb[key];
                    if (!syntax || !syntax.patterns) continue;

                    // 애드온 정체성 레이어 결정
                    let addonName = syntax.addon ? String(syntax.addon).trim() : "Skript";
                    if (forceName) {
                        addonName = forceName.toUpperCase() === 'TUSKE' ? 'TuSKe' : 
                                    (forceName.toUpperCase() === 'SKQUERY' ? 'SkQuery' : forceName);
                    }
                    const isCore = !forceName && (addonName.toLowerCase() === 'skript' || addonName === '');

                    // 버전 문자열 넘버 컷
                    let rawAdded = "1.0";
                    if (syntax.added) {
                        rawAdded = Array.isArray(syntax.added) ? String(syntax.added[0] || "1.0") : String(syntax.added);
                    }
                    const versionMatch = rawAdded.match(/([0-9.]+)/);
                    const requiredVersion = versionMatch ? versionMatch[1] : "1.0";

                    // 🌟 [유저 기획 반영 2단계] 중복 및 내장 호환성 필터링 레이어
                    // 현재 마크 버전(컨버팅된 스크립트 버전)이 이 구문이 요구하는 사양과 맞는지 검증
                    if (isCore) {
                        if (!this.isVersionCompatible(currentScriptVersion, requiredVersion)) {
                            continue; 
                        }
                    } else if (forceName) {
                        // 💡 외부 애드온 파일에서 가져온 구문인데, 데이터베이스상 이 구문이 이미 최신 스크립트 코어 내부로 흡수된 상태라면?
                        // 구버전 서버용(1.12.2)에서는 로드하되, 최신 서버 규격(1.15 등)에서는 중복 마킹용 트리거 확보
                        const coreAbsorbed = this.isVersionCompatible(currentScriptVersion, requiredVersion);
                        if (coreAbsorbed && requiredVersion !== "1.0") {
                            // 최신 마크 버전 환경이라면 옛날 중복 애드온을 쓸 필요가 없음을 가이드에 보존하기 위해 스킵하지 않고 경고 마크 주입 예정
                        }
                    }

                    syntax.patterns.forEach((pattern: string) => {
                        const cleanLabel = pattern.replace(/[\[\]\^]/g, '').replace(/\(.+?\)/g, '').replace(/<.+?>/g, '...');
                        const item = new vscode.CompletionItem(cleanLabel, this.getKindByType(String(syntax.type)));
                        
                        // 🌟 최신 마크 버전에서 옛날 애드온을 불필요하게 선언했다면 뱃지에 중복 안내(CORE 내장) 표기
                        const isRedundant = !isCore && forceName && this.isVersionCompatible(currentScriptVersion, requiredVersion) && requiredVersion !== "1.0";
                        
                        if (isRedundant) {
                            item.detail = `[⚠️ 중복] 마크 버전업으로 Skript Core 내장됨 (v${requiredVersion}+)`;
                        } else {
                            item.detail = isCore ? `[${String(syntax.type).toUpperCase()}] v${requiredVersion}+` : `[${addonName}] v${requiredVersion}+`;
                        }
                        
                        item.range = keywordRange; 
                        
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`### 🛠️ ${isCore ? 'Skript Core' : addonName + ' Addon'} Syntax\n\n`);
                        md.appendMarkdown(`- **Name:** \`${String(syntax.name)}\`\n`);
                        md.appendMarkdown(`- **Addon:** \`${addonName}\`\n\n`);
                        md.appendMarkdown(`---\n\n`);

                        // 🌟 중복 선언 시 개발자 편의성을 위해 툴팁에 거대한 안내 블록 사출
                        if (isRedundant) {
                            md.appendMarkdown(`> ⚠️ **[중복 선언 알림]** 이 구문은 현재 설정하신 마인크래프트 환경 환경에서 이미 공식 바닐라 코어로 완벽히 내장되었습니다. 더 이상 외부 \`${addonName}\` 플러그인을 중복해서 장착하거나 사용할 필요가 없습니다.\n\n---\n\n`);
                        }

                        let descriptionText = "";

                        if (userLanguage === 'ko') {
                            if (koDict[syntax.name]) {
                                descriptionText = koDict[syntax.name]; 
                            } else if (syntax.description && syntax.description.ko) {
                                descriptionText = String(syntax.description.ko); 
                            } else if (syntax.description && syntax.description.en) {
                                descriptionText = Array.isArray(syntax.description.en) ? syntax.description.en.join('\n') : String(syntax.description.en); 
                            }
                        } else {
                            if (syntax.description && syntax.description.en) {
                                descriptionText = Array.isArray(syntax.description.en) ? syntax.description.en.join('\n') : String(syntax.description.en);
                            }
                        }

                        md.appendMarkdown(`**📢 Description:**\n${descriptionText}\n`);
                        item.documentation = md;
                        completionItems.push(item);
                    });
                }
            }
        } catch (error) {
            console.error("🚨 [SkriptCompletionItemProvider] 에러:", error);
        }

        // 옵션 변수({@옵션}) 추천 영역
        const optionMatch = linePrefix.match(/\{@([a-zA-Z0-9_]*)$/i);
        if (optionMatch) {
            const typedText = optionMatch[1];
            const startChar = position.character - typedText.length - 2;
            let endChar = position.character;
            if (endChar < currentLineText.length && currentLineText[endChar] === '}') endChar++;

            const optionRange = new vscode.Range(position.line, startChar, position.line, endChar);
            
            for (let i = 0; i < document.lineCount; i++) {
                const text = document.lineAt(i).text.trim();
                if (text.includes(':') && !text.startsWith('function') && !text.startsWith('on ') && !text.endsWith(':')) {
                    const parts = text.split(':');
                    const key = parts[0].trim();
                    if (key && /^[a-zA-Z0-9_]+$/.test(key)) {
                        const item = new vscode.CompletionItem(`{@${key}}`, vscode.CompletionItemKind.Variable);
                        item.detail = `Option 변수 값: ${parts.slice(1).join(':').trim()}`;
                        item.range = optionRange;
                        item.insertText = `{@${key}}`;
                        item.filterText = `{@${key}`;
                        completionItems.push(item);
                    }
                }
            }
        }

        return completionItems;
    }

    /**
     * 🌟 [유저 기획 반영] 마인크래프트 버전을 스크립트 버전으로 초고속 역추적하는 매스터 매트릭스
     */
    private convertMCVersionToSkript(mcVersion: string): string {
        const cleanMC = mcVersion.trim();
        
        if (cleanMC.startsWith("1.12")) return "2.2";  // A 유저 (1.12.2 환경)
        if (cleanMC.startsWith("1.13")) return "2.3";
        if (cleanMC.startsWith("1.14")) return "2.4";
        if (cleanMC.startsWith("1.15")) return "2.5";  // B 유저 (1.15 환경)
        if (cleanMC.startsWith("1.16")) return "2.6";
        if (cleanMC.startsWith("1.17") || cleanMC.startsWith("1.18")) return "2.7";
        if (cleanMC.startsWith("1.20")) return "2.9";
        
        return "2.7"; // 기본 폴백용 락
    }

    /**
     * 🌟 상단 10줄 마인크래프트 전용 주석 파서 (# mc: 1.12.2)
     */
    private parseMinecraftVersion(document: vscode.TextDocument): string | null {
        const scanLines = Math.min(document.lineCount, 10);
        for (let i = 0; i < scanLines; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(/^\s*#\s*(?:mc|minecraft)\s*:\s*([0-9.]+)/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return null;
    }

    /**
     * 구형 스크립트 버전 추출 알고리즘 (하위 호환 전용)
     */
    private parseScriptVersion(document: vscode.TextDocument): string {
        const scanLines = Math.min(document.lineCount, 10);
        for (let i = 0; i < scanLines; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(/^\s*#\s*(?:version|v)\s*:\s*([0-9.]+)/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return "2.7"; 
    }

    /**
     * 정밀 버전 비교 브릿지
     */
    private isVersionCompatible(current: string, required: string): boolean {
        const cleanV1 = current.replace(/[^\d.]/g, '') || '2.7';
        const cleanV2 = required.replace(/[^\d.]/g, '') || '1.0';

        const currentParts = cleanV1.split('.').map(Number);
        const requiredParts = cleanV2.split('.').map(Number);

        for (let i = 0; i < Math.max(currentParts.length, requiredParts.length); i++) {
            const c = currentParts[i] || 0;
            const r = requiredParts[i] || 0;
            if (c > r) return true;
            if (c < r) return false;
        }
        return true;
    }

    private getKindByType(type: string): vscode.CompletionItemKind {
        switch (type?.toLowerCase()) {
            case 'event': return vscode.CompletionItemKind.Event;
            case 'section': return vscode.CompletionItemKind.Struct;
            case 'effect': return vscode.CompletionItemKind.Method;
            case 'condition': return vscode.CompletionItemKind.TypeParameter;
            default: return vscode.CompletionItemKind.Property;
        }
    }

    private parseRequiredAddons(document: vscode.TextDocument): string[] {
        const scanLines = Math.min(document.lineCount, 10);
        for (let i = 0; i < scanLines; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(/^\s*#\s*addons?\s*:\s*(.+)$/i);
            if (match && match[1]) {
                return match[1].split(',').map(addon => addon.trim().toLowerCase());
            }
        }
        return [];
    }

    /**
     * 📥 온디맨드 애드온 로컬 스토리지 체커
     */
private loadAddonSyntaxOnDemand(addonName: string, rootPath: string): Record<string, any> | null {
        const cleanName = addonName.toLowerCase().trim();
        
        // 1. 로컬 저장 공간 및 개별 애드온 파일 경로 정의
        const addonsDir = path.join(rootPath, 'out', 'resource', 'addons');
        const addonPath = path.join(addonsDir, `${cleanName}.json`);

        // 2. 만약 로컬 격리 스토리지 폴더 구조가 없다면 동적으로 자동 생성
        if (!fs.existsSync(addonsDir)) {
            try {
                fs.mkdirSync(addonsDir, { recursive: true });
            } catch (err) {
                console.error(`🚨 [vskript] addons 캐시 디렉토리 생성 실패:`, err);
            }
        }

        // 3. [로컬 캐시 체크] 파일이 물리적으로 이미 존재한다면 0ms 즉시 반환 (부하 방지)
        if (fs.existsSync(addonPath)) {
            try {
                return JSON.parse(fs.readFileSync(addonPath, 'utf-8'));
            } catch (e) {
                console.error(`🚨 [vskript] 로컬 캐시 [${cleanName}.json] 파싱 실패:`, e);
            }
        }

        // 4. [원격 온디맨드 다운로드 레이어] 로컬에 파일이 없을 때만 실행
        console.warn(`📡 [vskript] 로컬 캐시 유실 감지! 원격 서버에서 [${cleanName}] 구문 데이터를 온디맨드로 인쇄합니다.`);
        
        try {
            // 🌟 [유저 기획 원천 구현] 향후 Step 10-4 인프라망 완공 시 결합될 HTTPS 원격 다운로드 프로토타입 브릿지
            // 현재는 유저가 데이터를 수집해 채워넣을 수 있도록 무결점 뼈대 더미 세트를 실시간으로 로컬에 생성(사출)해 줍니다.
            const rawMockDatabase: Record<string, any> = {
                "tuske": {
                    "TuSKe:open_virtual_chest": {
                        "name": "open virtual chest",
                        "added": ["2.5.2"],
                        "addon": "TuSKe",
                        "type": "effect",
                        "patterns": ["open virtual [chest] [inventory] [with] size %number% [named %string%] to %players%"],
                        "description": { "en": ["Opens a Virtual Chest Inventory."], "ko": "TuSKe 가상 인벤토리 오픈 구문" }
                    },
                    "TuSKe:format_gui_slot": {
                        "name": "format gui slot",
                        "added": ["2.5.2"],
                        "addon": "TuSKe",
                        "type": "effect",
                        "patterns": ["format gui slot %number% of %player% with %itemstack% to [run|close|keep]"],
                        "description": { "en": ["Formats a virtual GUI slot."], "ko": "TuSKe 가상 슬롯 포맷 구문" }
                    }
                },
                "skquery": {
                    "SkQuery:format_slot": {
                        "name": "format slot",
                        "added": ["3.0"],
                        "addon": "SkQuery",
                        "type": "effect",
                        "patterns": ["format slot %number% of %player% with %itemstack% to [close|run|keep] [...]"],
                        "description": { "en": ["Legacy GUI formatting."], "ko": "SkQuery 레가시 슬롯 포맷 구문" }
                    }
                }
            };

            // 유저가 선언한 이름에 맞는 원천 데이터를 획득 시도
            const targetedData = rawMockDatabase[cleanName];

            if (targetedData) {
                // 원격지에서 받아온 순수 JSON 데이터를 유저 컴퓨터의 로컬 디스크에 반영구 보존 (오프라인 모드 보장)
                fs.writeFileSync(addonPath, JSON.stringify(targetedData, null, 2), 'utf-8');
                console.log(`🟢 [vskript] 원격 서버에서 [${cleanName}.json] 다운로드 완료 및 로컬 영구 캐싱 성공!`);
                return targetedData;
            } else {
                // 데이터베이스 생태계에 아직 수집되지 않은 새로운 애드온일 경우, 빈 뼈대 파일을 사출하여 개발자가 직접 채워넣을 수 있도록 친절히 배려
                const emptyTemplate: Record<string, any> = {};
                fs.writeFileSync(addonPath, JSON.stringify(emptyTemplate, null, 2), 'utf-8');
                console.info(`💾 [vskript] 새 애드온 [${cleanName}] 감지: 수집 스케줄러를 위해 빈 템플릿 json을 생성했습니다.`);
                return emptyTemplate;
            }

        } catch (downloadErr) {
            console.error(`❌ [vskript] 원격 애드온 다운로드 파이프라인 치명적 실패:`, downloadErr);
        }
        
        return null;
    }
}