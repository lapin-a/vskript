export type Class<T> = { new (...args: any[]): T };

export class JavaObject {
    public equals(obj: any): boolean {
        if (this === obj) return true;
        if (!obj || Object.keys(this).length !== Object.keys(obj).length) return false;
        
        for (const field in this) {
            if (this[field] !== obj[field]) return false;
        }
        return true;
    }

    public toString() {
        const array: string[] = [];
        for (const field in this) {
            const value = typeof this[field] === 'string' ? `"${this[field]}"` : this[field];
            array.push(`${field}=${value}`);
        }
        return `${this.constructor.name}[${array.join(', ')}]`;
    }
}

export class StringBuilder {
    // 🌟 [최적화] 대량 가비지를 유발하던 문자열 쪼개기(split)를 제거하고, 고성능 문자열 버퍼 축적 배열로 선회합니다.
    private readonly _strings = new Array<string>();

    constructor(string?: string) {
        if (string) this.append(string);
    }

    public get length(): number {
        return this.toString().length;
    }

    public append(string: string, start?: number, length?: number): StringBuilder {
        if (start !== undefined && length !== undefined) {
            string = string.substr(start, length);
        }
        this._strings.push(string);
        return this;
    }

    public setLength(length: number) {
        let currentStr = this.toString();
        this._strings.length = 0;
        this._strings.push(currentStr.substring(0, length));
    }

    public toString(): string {
        return this._strings.join('');
    }
}

export interface Comparator<T> {
    compare(o1: T, o2: T): number;
}

export class Stream<T> extends JavaObject {
    protected readonly _values: T[];

    constructor(values: T[]) {
        super();
        // 🌟 [안전화] 외부의 원본 데이터 파괴(유실 버그)를 방지하기 위해 안전한 복사본을 주머니에 가둡니다.
        this._values = [...values];
    }

    public get values(): T[] {
        return this._values;
    }

    // 🌟 [안전화] 원본 배열 요소를 강제로 잘라내어 다른 데이터를 망가뜨리던 splice 기법을 완전히 걷어내고, 불변 청정 필터를 적용합니다.
    public filter(predicate: (value: T, index: number, array: T[]) => boolean, thisArg?: any): Stream<T> {
        const context = thisArg || this;
        const result = this._values.filter((v, i, a) => predicate.call(context, v, i, a));
        return new Stream<T>(result);
    }

    public map<R>(mapper: (value: T) => R, thisArg?: any): Stream<R> {
        const context = thisArg || this;
        const result = this._values.map(v => {
            try {
                return mapper.call(context, v);
            } catch (error) {
                return undefined as any;
            }
        }).filter(v => v !== undefined);
        return new Stream<R>(result);
    }

    public peek(action: (value: T) => void, thisArg?: any): Stream<T> {
        const context = thisArg || this;
        const len = this._values.length;
        for (let i = 0; i < len; i++) {
            try {
                action.call(context, this._values[i]);
            } catch (error) {}
        }
        return this;
    }

    public comparate(comparator: (value1: T, value2: T) => number): ComparableStream<T> {
        return new ComparableStream<T>(this, comparator);
    }
}

export class ComparableStream<T> extends Stream<T> {
    protected _comparator: ((v1: T, v2: T) => number);

    constructor(stream: Stream<T>, comparator: (v1: T, v2: T) => number) {
        super(stream.values);
        this._comparator = comparator;
    }

    public min(): T | undefined {
        if (this._values.length === 0) return undefined;
        let result = this._values[0];
        const len = this._values.length;
        for (let i = 1; i < len; i++) {
            const v = this._values[i];
            try {
                if (this._comparator.call(this, result, v) > 0) result = v;
            } catch (error) {
                return undefined;
            }
        }
        return result;
    }

    public max(): T | undefined {
        if (this._values.length === 0) return undefined;
        let result = this._values[0];
        const len = this._values.length;
        for (let i = 1; i < len; i++) {
            const v = this._values[i];
            try {
                if (this._comparator.call(this, result, v) < 0) result = v;
            } catch (error) {
                return undefined;
            }
        }
        return result;
    }

    public sort(): ComparableStream<T> {
        this._values.sort(this._comparator);
        return this;
    }
}