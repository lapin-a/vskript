import { workspace, window, Uri } from 'vscode';
import * as FileSystem from 'fs';
import * as Path from 'path';
import { SkriptDocument, SkriptPath } from './SkriptDocument';

export const DOCUMENTS = new Array<SkriptDocument>();

/** 스크립트 활성화 시 워크스페이스 전체 스캔 */
export async function onSkriptEnable() {
    // 기존 리스트 초기화 (중복 방지)
    DOCUMENTS.length = 0;

    // 1. VS Code API를 사용하여 모든 .sk 파일 찾기 (기존의 복잡한 재귀함수 대체)
    // 제외 패턴: node_modules 등 불필요한 폴더
    const files = await workspace.findFiles('**/*.sk', '**/node_modules/**');

    if (files.length > 0) {
        for (const fileUri of files) {
            try {
                // 2. 각 파일의 경로 정보 생성
                const workspaceFolder = workspace.getWorkspaceFolder(fileUri);
                if (!workspaceFolder) continue;

                const rootPath = workspaceFolder.uri.fsPath;
                const relativePath = Path.relative(rootPath, fileUri.fsPath);
                const skPath = new SkriptPath(rootPath, relativePath);

                // 3. 파일 내용 읽기 및 문서 객체 생성
                const content = FileSystem.readFileSync(fileUri.fsPath, { encoding: 'UTF-8' });
                const skDocument = new SkriptDocument(skPath, content);
                
                DOCUMENTS.push(skDocument);
            } catch (error) {
                console.error(`파일 로드 실패: ${fileUri.fsPath}`, error);
            }
        }
        window.showInformationMessage(`버킷에서 ${DOCUMENTS.length}개의 스크립트 파일을 성공적으로 로드했습니다.`);
    }
}

/** 경로와 일치하는 SkriptDocument 찾기 */
export function find(fsPath: string): SkriptDocument | undefined {
    return DOCUMENTS.find(doc => doc.skPath.fsPath === fsPath);
}

// 기존의 복잡했던 _getSkriptPaths 함수는 이제 필요 없으므로 제거해도 됩니다.