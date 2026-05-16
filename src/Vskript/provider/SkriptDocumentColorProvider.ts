import { Color, ColorInformation, ColorPresentation, DocumentColorProvider, Position, Range, TextDocument, TextEdit } from 'vscode'

export class SkriptDocumentColorProvider implements DocumentColorProvider {
    public provideDocumentColors(document: TextDocument): ColorInformation[] {
        const array: ColorInformation[] = [];
        const text = document.getText();
        
        // 🌟 [메모리 최적화] split() 없이 통문자열에서 정규식 global exec 루프로 초고속 저격 탐색합니다.
        const regex = /\<\#\#[0-9a-fA-F]{6}\>/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const tag = match[0];
            const startOffset = match.index;
            
            const startPos = document.positionAt(startOffset);
            const endPos = document.positionAt(startOffset + tag.length);
            const range = new Range(startPos, endPos);
            
            const cleanHex = tag.replace(/[<#>]/g, '');
            const color = this.hexToColor(cleanHex);
            if (color) {
                array.push(new ColorInformation(range, color));
            }
        }
        return array;
    }

    public provideColorPresentations(color: Color, context: { document: TextDocument; range: Range; }) {
        const hex = '<##' + this.colorToHex(color) + '>';
        return [{
            label: hex,
            textEdit: new TextEdit(context.range, hex)
        }];
    }

    private hexToColor(hex: string): Color | null {
        const match = hex.match(/.{1,2}/g);
        return match && match.length >= 3 ? new Color(
            parseInt(match[0], 16) / 255,
            parseInt(match[1], 16) / 255,
            parseInt(match[2], 16) / 255,
            1
        ) : null;
    }

    private colorToHex(color: Color): string {
        return ((1 << 24)
            + (Math.floor(color.red * 255) << 16)
            + (Math.floor(color.green * 255) << 8)
            + Math.floor(color.blue * 255)).toString(16).slice(1);
    }
}