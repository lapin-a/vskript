class NamespacedKey {
    private readonly _namespace: string;
    private readonly _key: string;

    constructor(namespace: string, key: string) {
        this._namespace = namespace;
        this._key = key;
    }

    get namespace(): string {
        return this._namespace;
    }
    get key(): string {
        return this._key;
    }
    public toString(): string {
        return this._namespace + ':' + this._key;
    }
}

export class SkriptLanguageEffect {
    private readonly _namespacedKey: NamespacedKey;
    private readonly _patterns: string[];
    
    constructor(namespacedKey: NamespacedKey, ...patterns: string[]) {
        this._namespacedKey = namespacedKey;
        this._patterns = patterns;
    }

    get key(): NamespacedKey {
        return this._namespacedKey;
    }
    get patterns(): string[] {
        return this._patterns;
    }

    // 🌟 [정돈] 의미 없는 빈 for 루프 연산을 제거하고, 향후 구문 파싱 확장성을 위한 통로로 리팩토링합니다.
    public next(code: string): string {
        const trimmedCode = code.trim();
        const len = this._patterns.length;
        
        for (let i = 0; i < len; i++) {
            if (trimmedCode.startsWith(this._patterns[i])) {
                return this._patterns[i];
            }
        }
        return 'a';
    }
}

export const EFFECTS: SkriptLanguageEffect[] = [
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffActionBar'),
        'send [the] action bar [with text] %text% to %players%'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffBan'),
        'ban %texts/offline players% [(by reason of|because [of]|on account of|due to) %text%] [for %time span%]',
        'unban %texts/offline players%',
        'ban %players% by IP [(by reason of|because [of]|on account of|due to) %text%] [for %time span%]',
        'unban %players% by IP',
        'IP(-| )ban %players% [(by reason of|because [of]|on account of|due to) %text%] [for %time span%]',
        '(IP(-| )unban|un[-]IP[-]ban) %players%'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffBreakNaturally'),
        'break %blocks% [naturally] [using %item type%]'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffBroadcast'),
        'broadcast %objects% [(to|in) %worlds%]'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffCancelCooldown'),
        '(cancel|ignore) [the] [current] [command] cooldown',
        'un(cancel|ignore) [the] [current] [command] cooldown'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffCancelDrops'),
        '(cancel|clear|delete) [the] drops [of (items|[e]xp[erience][s])]',
        '(cancel|clear|delete) [the] (item|[e]xp[erience]) drops'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffCancelEvent'),
        'cancel [the] event',
        'uncancel [the] event'
    ),
    new SkriptLanguageEffect(new NamespacedKey('skript', 'EffChange'),
        '(add|give) %objects% to %~objects%',
        'increase %~objects% by %objects%',
        'give %~objects% %objects%',
        'set %~objects% to %objects%',
        'remove (all|every) %objects% from %~objects%',
        '(remove|subtract) %objects% from %~objects%',
        'reduce %~objects% by %objects%',
        '(delete|clear) %~objects%',
        'reset %~objects%'
    )
];