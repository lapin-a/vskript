import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readPluginDescriptor, PluginDescriptor } from './JarReader';
import { resolveEnvironment, mismatchSignature, EnvironmentResult, Mismatch, SKRIPT_NAME } from './Environment';
import { DataPackClient, DEFAULT_DATABASE_URL, LoadedPack, SyncReport } from './DataPackClient';
import { initLogger, log } from '../Logger';

// ============================================================
// 서버 환경 감지 + 설정 병합 + DataPack 동기화 (vscode 연동부)
//
//   1) plugins 폴더를 찾는다 (vskript.serverPath → 없으면 워크스페이스/열린 .sk 파일의 상위 폴더 탐색)
//   2) jar의 plugin.yml에서 이름/버전을 읽는다
//   3) 설정(vskript.skriptVersion, vskript.addons)으로 덮어쓴다
//   4) 감지값과 설정값이 다르면 알림을 "같은 내용에 대해 한 번만" 띄운다
//   5) 필요한 애드온의 DataPack을 내려받는다 (바뀐 것만)
// ============================================================

const MISMATCH_STATE_KEY = 'vskript.environment.lastMismatchSignature';

export interface EnvironmentState {
    pluginsFolder: string | null;
    detected: PluginDescriptor[] | null;
    result: EnvironmentResult;
    packs: LoadedPack[];
    sync: SyncReport | null;
    updatedAt: Date;
}

let state: EnvironmentState | null = null;
const changeEmitter = new vscode.EventEmitter<EnvironmentState>();
/** 환경(버전/애드온/DataPack)이 갱신될 때 발생 */
export const onDidChangeEnvironment = changeEmitter.event;

export function getEnvironment(): EnvironmentState | null {
    return state;
}

/** 진단 등에서 쓰는 "현재 Skript 버전" (없으면 null) */
export function getEffectiveSkriptVersion(): string | null {
    return state?.result.skriptVersion ?? null;
}

function hasJars(dir: string): boolean {
    try {
        return fs.readdirSync(dir).some(f => f.toLowerCase().endsWith('.jar'));
    } catch {
        return false;
    }
}

/** 디렉터리에서 위로 올라가며 plugins 폴더를 찾는다 (스크립트는 보통 plugins/Skript/scripts/ 아래에 있음) */
function findPluginsUpwards(start: string): string | null {
    let dir = start;
    for (let depth = 0; depth < 12; depth++) {
        if (path.basename(dir).toLowerCase() === 'plugins' && hasJars(dir)) {return dir;}
        const child = path.join(dir, 'plugins');
        if (hasJars(child)) {return child;}
        const parent = path.dirname(dir);
        if (parent === dir) {break;}
        dir = parent;
    }
    return null;
}

export function findPluginsFolder(): string | null {
    const config = vscode.workspace.getConfiguration('vskript');
    const serverPath = (config.get<string>('serverPath') || '').trim();
    if (serverPath) {
        const base = path.isAbsolute(serverPath) || !vscode.workspace.workspaceFolders?.length
            ? serverPath
            : path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, serverPath);
        if (path.basename(base).toLowerCase() === 'plugins') {return fs.existsSync(base) ? base : null;}
        const child = path.join(base, 'plugins');
        return fs.existsSync(child) ? child : null;
    }

    const starts: string[] = [];
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file') {starts.push(path.dirname(active.uri.fsPath));}
    for (const folder of vscode.workspace.workspaceFolders || []) {starts.push(folder.uri.fsPath);}

    for (const s of starts) {
        const found = findPluginsUpwards(s);
        if (found) {return found;}
    }
    return null;
}

function detectPlugins(folder: string): PluginDescriptor[] {
    const result: PluginDescriptor[] = [];
    for (const f of fs.readdirSync(folder)) {
        if (!f.toLowerCase().endsWith('.jar')) {continue;}
        const full = path.join(folder, f);
        try {
            if (!fs.statSync(full).isFile()) {continue;}
        } catch {
            continue;
        }
        result.push(readPluginDescriptor(full));
    }
    return result;
}

function describeMismatch(m: Mismatch): string {
    if (m.kind === 'version') {return `${m.name}: 설정 ${m.setting} / 감지 ${m.detected}`;}
    return `${m.name}: 설정에 있지만 plugins 폴더에서 감지되지 않음`;
}

export class ServerEnvironmentManager implements vscode.Disposable {
    private readonly output: vscode.LogOutputChannel;
    private readonly statusBar: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];
    private jarWatcher: vscode.FileSystemWatcher | null = null;
    private watchedFolder: string | null = null;
    private refreshTimer: NodeJS.Timeout | undefined;
    private running: Promise<void> | null = null;
    /** 감지 중에 들어온 재감지 요청 (진행 중인 감지가 끝나면 실행) */
    private rerun: Promise<void> | null = null;
    private rerunUserInitiated = false;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.output = initLogger(context); // 확장 전체가 쓰는 'VSkript' 로그 채널 (해제는 로거가 담당)
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBar.command = 'vskript.showEnvironment';

        this.disposables.push(
            this.statusBar,
            vscode.commands.registerCommand('vskript.refreshEnvironment', () => this.refresh({ userInitiated: true })),
            vscode.commands.registerCommand('vskript.showEnvironment', () => this.show()),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (['serverPath', 'skriptVersion', 'addons', 'database'].some(k => e.affectsConfiguration(`vskript.${k}`))) {
                    this.scheduleRefresh();
                }
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.scheduleRefresh()),
        );
    }

    dispose() {
        if (this.refreshTimer) {clearTimeout(this.refreshTimer);}
        this.jarWatcher?.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    /** 연속 이벤트(jar 여러 개 교체, 설정 연타)를 1초 디바운스 */
    scheduleRefresh() {
        if (this.refreshTimer) {clearTimeout(this.refreshTimer);}
        this.refreshTimer = setTimeout(() => this.refresh(), 1000);
    }

    /**
     * 환경을 다시 감지한다. 반환된 Promise는 "호출 시점의 설정이 반영된" 감지가 끝나면 완료된다.
     * 이미 감지 중이면 그 감지는 호출 전 설정으로 시작됐을 수 있으므로, 끝나는 즉시 한 번 더 감지하고
     * 그 재감지가 끝날 때 완료한다. (감지 중 여러 번 호출돼도 재감지는 한 번만)
     */
    refresh(opts: { userInitiated?: boolean } = {}): Promise<void> {
        if (this.running) {
            this.rerunUserInitiated ||= opts.userInitiated === true;
            if (!this.rerun) {
                // 진행 중인 감지가 실패해도 재감지는 한다
                this.rerun = this.running.catch(() => undefined).then(() => {
                    this.rerun = null;
                    const userInitiated = this.rerunUserInitiated;
                    this.rerunUserInitiated = false;
                    return this.refresh({ userInitiated });
                });
            }
            return this.rerun;
        }
        // finally가 먼저 실행되므로, 위의 then 시점에는 running이 이미 null이다
        this.running = this.doRefresh(opts).finally(() => {
            this.running = null;
        });
        return this.running;
    }

    private async doRefresh(opts: { userInitiated?: boolean }) {
        const config = vscode.workspace.getConfiguration('vskript');
        const pluginsFolder = findPluginsFolder();
        this.watchJars(pluginsFolder);

        let detected: PluginDescriptor[] | null = null;
        if (pluginsFolder) {
            try {
                detected = detectPlugins(pluginsFolder);
            } catch (err) {
                log.error(`plugins 폴더 읽기 실패: ${pluginsFolder}`, err);
            }
        }

        const result = resolveEnvironment({
            detected: detected ? detected.map(d => ({ name: d.name, version: d.version })) : null,
            settingSkriptVersion: config.get<string>('skriptVersion') || null,
            settingAddons: config.get<string[]>('addons') || [],
        });

        this.log(`환경 감지: plugins=${pluginsFolder ?? '(찾지 못함)'} | Skript=${result.skriptVersion ?? '(미지정)'} | 애드온 ${result.addons.length}개`);
        await this.notifyMismatchOnce(result.mismatches, opts.userInitiated === true);

        let packs: LoadedPack[] = state?.packs ?? [];
        let sync: SyncReport | null = state?.sync ?? null;
        if (config.get<boolean>('database.autoDownload', true)) {
            const url = (config.get<string>('database.url') || '').trim() || DEFAULT_DATABASE_URL;
            const client = new DataPackClient(this.context.globalStorageUri.fsPath, url);
            const names = [SKRIPT_NAME, ...result.addons.map(a => a.name)];
            sync = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Window, title: 'VSkript: 구문 데이터 동기화' },
                () => client.sync(names),
            );
            packs = sync.loaded;
            this.logSync(sync, result);
        }

        state = { pluginsFolder, detected, result, packs, sync, updatedAt: new Date() };
        this.updateStatusBar();
        changeEmitter.fire(state);
    }

    private watchJars(folder: string | null) {
        if (folder === this.watchedFolder) {return;}
        this.jarWatcher?.dispose();
        this.jarWatcher = null;
        this.watchedFolder = folder;
        if (!folder) {return;}
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '*.jar'));
        watcher.onDidCreate(() => this.scheduleRefresh());
        watcher.onDidDelete(() => this.scheduleRefresh());
        watcher.onDidChange(() => this.scheduleRefresh());
        this.jarWatcher = watcher;
    }

    /** 같은 불일치 내용에 대해서는 한 번만 알린다 (내용이 바뀌면 다시 알림). 명령으로 직접 실행하면 항상 알림. */
    private async notifyMismatchOnce(mismatches: Mismatch[], force: boolean) {
        const signature = mismatchSignature(mismatches);
        const last = this.context.workspaceState.get<string>(MISMATCH_STATE_KEY, '');
        if (mismatches.length === 0) {
            if (last) {await this.context.workspaceState.update(MISMATCH_STATE_KEY, '');}
            return;
        }
        for (const m of mismatches) {log.warn(`불일치 — ${describeMismatch(m)}`);}
        if (!force && signature === last) {return;}
        await this.context.workspaceState.update(MISMATCH_STATE_KEY, signature);

        const detail = mismatches.slice(0, 3).map(describeMismatch).join(', ') + (mismatches.length > 3 ? ` 외 ${mismatches.length - 3}건` : '');
        // 알림 응답을 기다리지 않는다 (감지/다운로드를 막지 않도록)
        vscode.window.showWarningMessage(
            `VSkript: 서버 폴더 감지 결과와 설정이 다릅니다 — ${detail}. 설정값을 우선 적용합니다.`,
            '설정 열기',
            '감지 결과 보기',
        ).then(choice => {
            if (choice === '설정 열기') {vscode.commands.executeCommand('workbench.action.openSettings', 'vskript.');}
            else if (choice === '감지 결과 보기') {this.show();}
        });
    }

    private logSync(sync: SyncReport, result: EnvironmentResult) {
        if (!sync.online) {log.warn(`데이터베이스 연결 실패 — 캐시 사용: ${sync.indexError}`);}
        const downloaded = sync.loaded.filter(p => p.from === 'downloaded').map(p => p.name);
        const cached = sync.loaded.filter(p => p.from === 'cache').map(p => p.name);
        this.log(`DataPack: 새로 받음 ${downloaded.length}개${downloaded.length ? ` (${downloaded.join(', ')})` : ''}, 캐시 ${cached.length}개`);
        for (const e of sync.errors) {log.warn(`DataPack 오류 — ${e.name}: ${e.message}`);}
        // 설정에 직접 적었는데 데이터베이스에 없는 애드온만 알린다 (일반 플러그인은 원래 없음)
        const settingOnly = new Set(result.addons.filter(a => a.origin !== 'detected').map(a => a.name.toLowerCase()));
        const missing = sync.unknown.filter(n => settingOnly.has(n.toLowerCase()));
        if (missing.length) {this.log(`데이터베이스에 없는 애드온 (설정값): ${missing.join(', ')}`);}
    }

    /** 상태 표시줄 문구 (테스트·진단용) */
    get statusBarText(): string {
        return this.statusBar.text;
    }

    private updateStatusBar() {
        if (!state) {return;}
        const { result, packs, sync } = state;
        const addonPacks = packs.filter(p => p.name.toLowerCase() !== SKRIPT_NAME.toLowerCase());
        this.statusBar.text = `$(server) Skript ${result.skriptVersion ?? '?'}${addonPacks.length ? ` · 애드온 ${addonPacks.length}` : ''}${sync && !sync.online ? ' $(cloud-offline)' : ''}${result.mismatches.length ? ' $(warning)' : ''}`;
        const md = new vscode.MarkdownString(undefined, true);
        md.appendMarkdown(`**VSkript 서버 환경**\n\n`);
        md.appendMarkdown(`- Skript: ${result.skriptVersion ?? '미지정'}${result.skriptVersionOrigin ? ` (${originLabel(result.skriptVersionOrigin)})` : ''}\n`);
        md.appendMarkdown(`- 구문 데이터: ${packs.length ? packs.map(p => p.name).join(', ') : '없음'}\n`);
        if (result.mismatches.length) {md.appendMarkdown(`- ⚠️ 설정과 감지 결과 불일치 ${result.mismatches.length}건\n`);}
        md.appendMarkdown(`\n클릭하면 상세 정보를 표시합니다.`);
        this.statusBar.tooltip = md;
        this.statusBar.show();
    }

    private show() {
        if (!state) {
            this.output.show(true);
            return;
        }
        const { pluginsFolder, detected, result, packs, sync } = state;
        const lines: string[] = [];
        lines.push('=== VSkript 서버 환경 ===');
        lines.push(`plugins 폴더: ${pluginsFolder ?? '(찾지 못함 — vskript.serverPath 설정 가능)'}`);
        lines.push(`Skript 버전: ${result.skriptVersion ?? '(미지정)'}${result.skriptVersionOrigin ? ` [${originLabel(result.skriptVersionOrigin)}]` : ''}`);
        lines.push('');
        lines.push(`적용 애드온 (${result.addons.length}):`);
        for (const a of result.addons) {
            const pack = packs.find(p => p.name.toLowerCase() === a.name.toLowerCase());
            lines.push(`  - ${a.name} ${a.version ?? '(버전 미상)'} [${originLabel(a.origin)}]${pack ? ` — 구문 ${pack.pack.item_count}개` : ''}`);
        }
        if (detected) {
            lines.push('');
            lines.push(`감지된 jar (${detected.length}):`);
            for (const d of detected) {lines.push(`  - ${d.name} ${d.version ?? '?'} ← ${path.basename(d.file)} (${d.source})`);}
        }
        if (result.mismatches.length) {
            lines.push('');
            lines.push('불일치 (설정값 우선 적용):');
            for (const m of result.mismatches) {lines.push(`  - ${describeMismatch(m)}`);}
        }
        if (sync) {
            lines.push('');
            lines.push(`데이터베이스: ${sync.online ? '연결됨' : `오프라인 (캐시 사용) — ${sync.indexError}`}`);
        }
        this.output.appendLine(lines.join('\n'));
        this.output.show(true);
    }

    private log(message: string) {
        this.output.info(message); // 로그 채널이 시각을 붙인다
    }
}

function originLabel(origin: string): string {
    return origin === 'detected' ? '감지' : origin === 'setting' ? '설정' : '감지=설정';
}
