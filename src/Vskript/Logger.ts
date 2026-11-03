import * as vscode from 'vscode';

// ============================================================
// VSkript 전용 로거.
//   출력 패널의 "VSkript" 로그 채널 하나에만 기록한다.
//   (예전처럼 전역 console.log를 덮어쓰면 같은 확장 호스트의 다른 확장 로그까지 바뀌므로 쓰지 않는다)
//   로그 수준은 출력 패널의 톱니바퀴(또는 "Developer: Set Log Level")에서 고를 수 있다.
//   initLogger() 전에는 아무것도 기록하지 않는다.
// ============================================================

let channel: vscode.LogOutputChannel | null = null;

export function initLogger(context: vscode.ExtensionContext): vscode.LogOutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('VSkript', { log: true });
        const created = channel;
        context.subscriptions.push(created, { dispose: () => { if (channel === created) {channel = null;} } });
    }
    return channel;
}

/** 출력 채널 (initLogger 전이면 null) */
export function getLogChannel(): vscode.LogOutputChannel | null {
    return channel;
}

function format(message: string, error?: unknown): string {
    if (error === undefined) {return message;}
    const detail = error instanceof Error ? (error.stack || error.message) : String(error);
    return `${message} ${detail}`;
}

export const log = {
    /** 타이핑마다 생기는 잦은 기록 (기본 수준에서는 보이지 않음) */
    debug(message: string) { channel?.debug(message); },
    info(message: string) { channel?.info(message); },
    warn(message: string, error?: unknown) { channel?.warn(format(message, error)); },
    error(message: string, error?: unknown) { channel?.error(format(message, error)); },
};
