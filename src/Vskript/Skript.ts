import { workspace, window, Uri } from 'vscode';
import * as FileSystem from 'fs';
import * as Path from 'path';
import { SkriptDocument, SkriptPath } from './SkriptDocument';

export const DOCUMENTS = new Array<SkriptDocument>();
export { SkriptDocument, SkriptPath } from './SkriptDocument';

/** 스크립트 활성화 시 워크스페이스 전체 스캔 */
export async function onSkriptEnable() {
	window.showInformationMessage("스캔 로직이 시작되었습니다!");
	DOCUMENTS.length = 0;

	// 1. 워크스페이스 내 파일들을 찾습니다.
	const files = await workspace.findFiles('**/*.sk');
	let fileUris = [...files];

	// 2. [추가] 현재 에디터에 열려 있는 파일이 .sk라면 목록에 강제로 합칩니다.
	window.visibleTextEditors.forEach(editor => {
		const uri = editor.document.uri;
		if (uri.fsPath.endsWith('.sk')) {
			// 중복이 아니면 추가
			if (!fileUris.some(u => u.fsPath === uri.fsPath)) {
				fileUris.push(uri);
			}
		}
	});

	// 3. 이제 합쳐진 목록(fileUris)으로 스캔을 진행합니다.
	for (const fileUri of fileUris) {
		try {
			const rootPath = workspace.getWorkspaceFolder(fileUri)?.uri.fsPath || Path.dirname(fileUri.fsPath);
			const relativePath = Path.relative(rootPath, fileUri.fsPath);
			const skPath = new SkriptPath(rootPath, relativePath);

			const content = FileSystem.readFileSync(fileUri.fsPath, { encoding: 'UTF-8' });
			const skDocument = new SkriptDocument(skPath, content);

			DOCUMENTS.push(skDocument);
		} catch (error) {
			console.error(`파일 로드 실패: ${fileUri.fsPath}`, error);
		}
	}

	window.showInformationMessage(`성공적으로 ${DOCUMENTS.length}개의 스크립트 파일을 로드했습니다!`);
}

/** 경로와 일치하는 SkriptDocument 찾기 */
export function find(fsPath: string): SkriptDocument | undefined {
	// 1. 입력받은 경로를 VS Code 표준 Uri 객체로 변환하여 '문자열'이 아닌 '객체 비교'급으로 정규화합니다.
	const targetUri = Uri.file(fsPath).toString().toLowerCase();

	return DOCUMENTS.find(doc => {
		// 2. 저장된 경로도 동일하게 Uri 문자열로 변환하여 비교합니다.
		const docUri = Uri.file(doc.skPath.fsPath).toString().toLowerCase();
		return docUri === targetUri;
	});
}
/** 특정 파일 하나만 즉시 스캔하여 DOCUMENTS 리스트에 등록/갱신 */
export function scanSingleFile(fileUri: Uri): SkriptDocument | undefined {
	try {
		const rootPath = workspace.getWorkspaceFolder(fileUri)?.uri.fsPath || Path.dirname(fileUri.fsPath);
		const relativePath = Path.relative(rootPath, fileUri.fsPath);
		const skPath = new SkriptPath(rootPath, relativePath);

		const content = FileSystem.readFileSync(fileUri.fsPath, { encoding: 'UTF-8' });
		const skDocument = new SkriptDocument(skPath, content);

		// 이미 리스트에 같은 파일이 있다면 교체, 없으면 새로 추가
		const targetUri = fileUri.toString().toLowerCase();
		const index = DOCUMENTS.findIndex(doc => Uri.file(doc.skPath.fsPath).toString().toLowerCase() === targetUri);

		if (index !== -1) {
			DOCUMENTS[index] = skDocument;
		} else {
			DOCUMENTS.push(skDocument);
		}

		console.log(`[즉시 스캔 완료] ${fileUri.fsPath}`);
		return skDocument;
	} catch (error) {
		console.error(`즉시 스캔 실패: ${fileUri.fsPath}`, error);
		return undefined;
	}
}
