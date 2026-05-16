export enum SkriptLanguageType {
    ATTRIBUTE_TYPE = "attribute type",
    BIOME = "biome",
    BLOCK = "block",
    BLOCK_DATA = "block data",
    BOOLEAN = "boolean",
    CAT_TYPE = "cat type",
    CHUNK = "chunk",
    CLICK_TYPE = "click type",
    COLOUR = "colour",
    COMMAND_SENDER = "command sender",
    DAMAGE_CAUSE = "damage cause",
    DATE = "date",
    DIFFICULTY = "difficulty",
    DIRECTION = "direction",
    ENCHANTMENT = "enchantment",
    ENCHANTMENT_TYPE = "enchantment type",
    ENTITY = "entity",
    ENTITY_TYPE = "entity type",
    EXPERIENCE = "experience",
    FIREWORK_EFFECT = "firework effect",
    FIREWORK_TYPE = "firework type",
    GAME_MODE = "game mode",
    GAMERULE = "gamerule",
    GAMERULE_VALUE = "gamerule value",
    GENE = "gene",
    HEAL_REASON = "heal reason",
    INVENTORY = "inventory",
    INVENTORY_ACTION = "inventory action",
    INVENTORY_SLOT = "inventory slot",
    INVENTORY_TYPE = "inventory type",
    ITEM = "item",
    ITEM_TYPE = "item type",
    LIVING_ENTITY = "living entity",
    LOCATION = "location",
    METADATA_HOLDER = "metadata holder",
    MONEY = "money",
    NUMBER = "number",
    OBJECT = "object",
    OFFLINE_PLAYER = "offline player",
    PLAYER = "player",
    POTION_EFFECT = "potion effect",
    POTION_EFFECT_TYPE = "potion effect type",
    PROJECTILE = "projectile",
    REGION = "region",
    RESOURCE_PACK_STATE = "resource pack state",
    SERVER_ICON = "server icon",
    SOUND_CATEGORY = "sound category",
    SPAWN_REASON = "spawn reason",
    TELEPORT_CAUSE = "teleport cause",
    TEXT = "text",
    TIME = "time",
    TIMEPERIOD = "timeperiod",
    TIMESPAN = "timespan",
    TREE_TYPE = "tree type",
    TYPE = "type",
    VECTOR = "vector",
    
    UNDEFINED = "undefined"
}

// 🌟 [최적화 & 안전성 보정] 정규식 연산 없이 대다수의 기본 타입을 O(1) 단 한 번에 찾아내는 초고속 하이패스 캐시 맵
// 현재 Enum 스펙에 INTEGER가 없으므로 integer 관련 명칭도 NUMBER로 안전하게 유도합니다.
const FAST_TYPE_MAP = new Map<string, SkriptLanguageType>([
    ['text', SkriptLanguageType.TEXT],
    ['string', SkriptLanguageType.TEXT],
    ['integer', SkriptLanguageType.NUMBER], 
    ['int', SkriptLanguageType.NUMBER],
    ['number', SkriptLanguageType.NUMBER],
    ['num', SkriptLanguageType.NUMBER],
    ['boolean', SkriptLanguageType.BOOLEAN],
    ['bool', SkriptLanguageType.BOOLEAN],
    ['player', SkriptLanguageType.PLAYER],
    ['object', SkriptLanguageType.OBJECT],
    ['item', SkriptLanguageType.ITEM],
    ['block', SkriptLanguageType.BLOCK],
    ['location', SkriptLanguageType.LOCATION],
    ['vector', SkriptLanguageType.VECTOR],
    ['biome', SkriptLanguageType.BIOME],
    ['entity', SkriptLanguageType.ENTITY],
    ['time', SkriptLanguageType.TIME],
    ['timespan', SkriptLanguageType.TIMESPAN]
]);

const TYPE_REGEXP: Map<RegExp, SkriptLanguageType> = (() => {
    let map = new Map<RegExp, SkriptLanguageType>();
    map.set(/^attribute\s?types?$/i, SkriptLanguageType.ATTRIBUTE_TYPE);
    map.set(/^biomes?$/i, SkriptLanguageType.BIOME);
    map.set(/^blocks?$/i, SkriptLanguageType.BLOCK);
    map.set(/^block\s?datas?$/i, SkriptLanguageType.BLOCK_DATA);
    map.set(/^booleans?$/i, SkriptLanguageType.BOOLEAN);
    map.set(/^cat\s?types?$/i, SkriptLanguageType.CAT_TYPE);
    map.set(/^chunks?$/i, SkriptLanguageType.CHUNK);
    map.set(/^click\s?types?$/i, SkriptLanguageType.CLICK_TYPE);
    map.set(/^colou?rs?$/i, SkriptLanguageType.COLOUR);
    map.set(/^(?:command\s?)?senders?$/i, SkriptLanguageType.COMMAND_SENDER);
    map.set(/^damage\scauses?$/i, SkriptLanguageType.DAMAGE_CAUSE);
    map.set(/^dates?$/i, SkriptLanguageType.DATE);
    map.set(/^difficult(?:y|ys|ies)$/i, SkriptLanguageType.DIFFICULTY);
    map.set(/^directions?$/i, SkriptLanguageType.DIRECTION);
    map.set(/^enchantments?$/i, SkriptLanguageType.ENCHANTMENT);
    map.set(/^enchantment\s?types?$/i, SkriptLanguageType.ENCHANTMENT_TYPE);
    map.set(/^entit(?:y|ys|ies)$/i, SkriptLanguageType.ENTITY);
    map.set(/^entity\s?types?$/i, SkriptLanguageType.ENTITY_TYPE);
    map.set(/^experiences?$/i, SkriptLanguageType.EXPERIENCE);
    map.set(/^firework\s?effects?$/i, SkriptLanguageType.FIREWORK_EFFECT);
    map.set(/^firework\s?types?$/i, SkriptLanguageType.FIREWORK_TYPE);
    map.set(/^game\s?modes?$/i, SkriptLanguageType.GAME_MODE);
    map.set(/^gamerules?$/i, SkriptLanguageType.GAMERULE);
    map.set(/^gamerule\s?values?$/i, SkriptLanguageType.GAMERULE_VALUE);
    map.set(/^gene$/i, SkriptLanguageType.GENE);
    map.set(/^heal\s?reasons?$/i, SkriptLanguageType.HEAL_REASON);
    map.set(/^inventor(?:y|ys|ies)$/i, SkriptLanguageType.INVENTORY);
    map.set(/^inventory\s?actions?$/i, SkriptLanguageType.INVENTORY_ACTION);
    map.set(/^inventory\s?slots?$/i, SkriptLanguageType.INVENTORY_SLOT);
    map.set(/^inventory\s?types?$/i, SkriptLanguageType.INVENTORY_TYPE);
    map.set(/^items?$/i, SkriptLanguageType.ITEM);
    map.set(/^item\s?types?$/i, SkriptLanguageType.ITEM_TYPE);
    map.set(/^living\s?entit(?:y|ys|ies)$/i, SkriptLanguageType.LIVING_ENTITY);
    map.set(/^locations?$/i, SkriptLanguageType.LOCATION);
    map.set(/^metadata\s?holders?$/i, SkriptLanguageType.METADATA_HOLDER);
    map.set(/^mone(?:y|ys|ies)$/i, SkriptLanguageType.MONEY);
    map.set(/^numbers?$/i, SkriptLanguageType.NUMBER);
    map.set(/^objects?$/i, SkriptLanguageType.OBJECT);
    map.set(/^offline\s?players?$/i, SkriptLanguageType.OFFLINE_PLAYER);
    map.set(/^players?$/i, SkriptLanguageType.PLAYER);
    map.set(/^potion\s?effects?$/i, SkriptLanguageType.POTION_EFFECT);
    map.set(/^potion\s?effect\s?types?$/i, SkriptLanguageType.POTION_EFFECT_TYPE);
    map.set(/^projectiles?$/i, SkriptLanguageType.PROJECTILE);
    map.set(/^regions?$/i, SkriptLanguageType.REGION);
    map.set(/^resource\s?pack\s?states?$/i, SkriptLanguageType.RESOURCE_PACK_STATE);
    map.set(/^server\s?icons?$/i, SkriptLanguageType.SERVER_ICON);
    map.set(/^sound\s?categor(?:y|ys|ies)$/i, SkriptLanguageType.SOUND_CATEGORY);
    map.set(/^spawn\s?reasons?$/i, SkriptLanguageType.SPAWN_REASON);
    map.set(/^teleport\s?causes?$/i, SkriptLanguageType.TELEPORT_CAUSE);
    map.set(/^texts?$/i, SkriptLanguageType.TEXT);
    map.set(/^times?$/i, SkriptLanguageType.TIME);
    map.set(/^timeperiods?$/i, SkriptLanguageType.TIMEPERIOD);
    map.set(/^timespans?$/i, SkriptLanguageType.TIMESPAN);
    map.set(/^tree\s?types?$/i, SkriptLanguageType.TREE_TYPE);
    map.set(/^types?$/i, SkriptLanguageType.TYPE);
    map.set(/^vectors?$/i, SkriptLanguageType.VECTOR);
    return map;
})();

export class SkriptType {

    public static create(type: string): SkriptType {
        if (!type) return new SkriptType(SkriptLanguageType.UNDEFINED);
        
        const cleanType = type.trim().toLowerCase();
        
        // 🌟 [최적화 핵심 2] 단일 단어 완벽 일치 하이패스 필터링 (루프 회피율 90% 이상)
        const fastMatch = FAST_TYPE_MAP.get(cleanType);
        if (fastMatch) {
            return new SkriptType(fastMatch, false);
        }

        // 복수형 판정 정밀 분석 및 전처리
        let isList = false;
        let baseType = cleanType;

        if (cleanType.endsWith('ies')) {
            isList = true;
            baseType = cleanType.slice(0, -3) + 'y'; // 예: entities -> entity
        } 
        // 🌟 [완벽 마감] 'timespan', 'progress', 'gargantuan_boss' 처럼 단어 자체에 s/ss가 붙은 특수 명칭들을 안전하게 구출합니다.
        else if (cleanType.endsWith('s') && !cleanType.endsWith('ss') && !cleanType.endsWith('span')) { 
            isList = true;
            baseType = cleanType.slice(0, -1); // 예: players -> player
        }

        // 복수형 접미사를 탈출시킨 베이스 단어도 하이패스 맵에서 2차 검사
        const fastBaseMatch = FAST_TYPE_MAP.get(baseType);
        if (fastBaseMatch) {
            return new SkriptType(fastBaseMatch, true);
        }

        // 🌟 [최적화 핵심 3] 특수 매칭이나 복잡한 정규식에 걸리는 소수 케이스만 제한적으로 루프 진입
        for (const regex of TYPE_REGEXP.keys()) {
            if (regex.test(cleanType)) {
                const skLangType = TYPE_REGEXP.get(regex)!;
                return new SkriptType(skLangType, isList);
            }
        }
        
        return new SkriptType(SkriptLanguageType.UNDEFINED);
    }
    
    private readonly _type: SkriptLanguageType;
    private readonly _isList: boolean;

    constructor(skLangType: SkriptLanguageType)
    constructor(skLangType: SkriptLanguageType, isList: boolean)
    constructor(skLangType: SkriptLanguageType, isList?: boolean) {
        this._type = skLangType;
        this._isList = isList ?? false;
    }

    get type(): SkriptLanguageType {
        return this._type;
    }
    
    get isList(): boolean {
        return this._isList;
    }
    
    get text(): string {
        let name = this._type.toString();
        if (this._isList) {
            if (name.endsWith('y')) {
                name = name.slice(0, -1) + 'ies';
            } else {
                name += 's';
            }
        }
        return name;
    }
}