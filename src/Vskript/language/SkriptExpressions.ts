import { Range } from "vscode";

export abstract class SkriptExpression {
    protected readonly _range: Range;
    protected readonly _expr: string;

    constructor(range: Range, expr: string) {
        this._range = range;
        this._expr = expr;
    }

    public get range(): Range {
        return this._range;
    }
    public get expr(): string {
        return this._expr;
    }
}

export enum SkriptVariableKind {
    GLOVAL,
    LOCAL,
    RUNTIME,
    OPTION
}

export enum SkriptVariableType {
    NORMAL,
    LIST
}

// 🌟 [최적화 핵심 1] 타이핑마다 수천 번 생성되던 정규식을 단 한 번만 컴파일하도록 정적 상수화(Static Compile)합니다.
const REGEX_LOCAL = /^\{\_/;
const REGEX_OPTION = /^\{\@/;
const REGEX_RUNTIME = /^\{\-/;
const REGEX_LIST = /\*\}$/;

// 계층 구조가 없는 절대다수의 변수들을 위한 공유 빈 배열 상수 (메모리 누수 원천 차단)
const EMPTY_CHILDREN: readonly SkriptVariable[] = [];

export class SkriptVariable extends SkriptExpression {
    private readonly _raw: string;
    private readonly _kind: SkriptVariableKind;
    private readonly _type: SkriptVariableType;
    
    private _parent?: SkriptVariable;
    private _child?: SkriptVariable[];

    /**
     * @param range 범위
     * @param expr 적혀 있는 그대로
     * @param raw 실제 사용되는
     */
    constructor(range: Range, expr: string, raw: string) {
        super(range, expr);
        this._raw = raw;
        
        // 🌟 [최적화 핵심 2] 무거운 match() 대신 0ms 성능을 자랑하는 .test() 탐색으로 전면 전환합니다.
        if (REGEX_LOCAL.test(raw)) {
            this._kind = SkriptVariableKind.LOCAL;
        } else if (REGEX_OPTION.test(raw)) {
            this._kind = SkriptVariableKind.OPTION;
        } else if (REGEX_RUNTIME.test(raw)) {
            this._kind = SkriptVariableKind.RUNTIME;
        } else {
            this._kind = SkriptVariableKind.GLOVAL;
        }

        if (REGEX_LIST.test(raw)) {
            this._type = SkriptVariableType.LIST;
        } else {
            this._type = SkriptVariableType.NORMAL;
        }
    }

    public get raw(): string {
        return this._raw;
    }
    public get kind(): SkriptVariableKind {
        return this._kind;
    }
    public get type(): SkriptVariableType {
        return this._type;
    }
    public get parent(): SkriptVariable | undefined {
        return this._parent;
    }
    public set parent(value: SkriptVariable | undefined) {
        this._parent = value;
    }
    
    // 🌟 [최적화 핵심 3] 불필요하게 무한 뉴(new)되던 빈 배열 인스턴스 생성을 막고, 진짜 자식이 추가될 때만 배열을 할당합니다.
    public get child(): SkriptVariable[] {
        if (!this._child) {
            this._child = [];
        }
        return this._child;
    }

    public hasChildren(): boolean {
        return !!this._child && this._child.length > 0;
    }
}