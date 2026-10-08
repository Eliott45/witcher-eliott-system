// Previous stock values only; current replacements come from bestiarySources().
// null denotes a formerly absent field (Foundry initializes these strings to '').
// Item entries contain [type, index into BESTIARY_V4_ITEM_FIELDS].
export const BESTIARY_V4_ITEM_FIELDS = [
  [
    [
      "system.description",
      "<p>Существо уязвимо к огню, включая состояние «Горение». Учитывается ведущим при применении урона.</p>"
    ]
  ],
  [
    [
      "system.description",
      "<p>Обычное стальное оружие наносит половину урона; серебряное действует полностью. Серебро добавляет указанный у оружия серебряный урон. Исключения описываются в свойствах оружия. Учитывается после брони при ручном применении урона.</p>"
    ]
  ],
  [
    [
      "system.damageType",
      null
    ],
    [
      "system.ruleId",
      null
    ]
  ],
  [
    [
      "system.ruleId",
      "creature.wraith.6"
    ]
  ],
  [
    [
      "system.ruleId",
      "creature.wraith.7"
    ]
  ],
  [
    [
      "system.ruleId",
      "creature.noonwraith.4"
    ]
  ],
  [
    [
      "system.ruleId",
      "creature.noonwraith.9"
    ]
  ],
  [
    [
      "system.damageType",
      null
    ],
    [
      "system.source",
      "Базовая книга, стр. 288"
    ],
    [
      "system.ruleId",
      null
    ]
  ]
];
export const BESTIARY_V4_PREVIOUS = {
  "bestiaryDrowner1": {"items":{"beastA0000000004":["ability",0],"beastA0000000007":["ability",1]}},
  "bstr000000000003": {"items":{"bst003i000000001":["weapon",2],"bst003i000000002":["weapon",2],"bst003i000000005":["ability",1]}},
  "bstr000000000004": {"items":{"bst004i000000001":["weapon",2],"bst004i000000002":["weapon",2],"bst004i000000003":["weapon",2],"bst004i000000005":["ability",1]}},
  "bstr000000000005": {"items":{"bst005i000000001":["weapon",2],"bst005i000000002":["weapon",2],"bst005i000000004":["ability",1],"bst005i000000007":["ability",3],"bst005i000000008":["ability",4]}},
  "bstr000000000006": {"fields":[["system.creature.resistances","яд, кровотечение"],["system.creature.lore",[{"name":"Предрассудки простолюдинов","skill":"education","dc":16,"text":"Полуденницы — души девушек, погибших перед свадьбой; в белом бродят по полям в полдень, губят встречных и могут заставить плясать до смерти."},{"name":"Знания ведьмаков","skill":"monsterLore","dc":14,"text":"Могущественный мстительный дух, неуязвимый для физических атак, пока не пойман Ирденом или «Лунной пылью». Получив урон, начинает танец с копиями, вытягивающими жизнь, — уничтожайте их сразу. Лучше биться ближе к закату; сожжённая у могилы любимая вещь почти всегда призывает её ночью."}]]],"items":{"bst006i000000001":["weapon",2],"bst006i000000002":["ability",1],"bst006i000000005":["ability",5],"bst006i000000010":["ability",6]}},
  "bstr000000000007": {"items":{"bst007i000000001":["weapon",2]}},
  "bstr000000000008": {"fields":[["system.creature.source","Базовая книга, стр. 287–288"]],"items":{"bst008i000000001":["weapon",7]}},
  "bstr000000000009": {"items":{"bst009i000000001":["weapon",2],"bst009i000000002":["weapon",2],"bst009i000000004":["ability",1]}},
  "bstr000000000010": {"items":{"bst010i000000001":["weapon",2],"bst010i000000002":["weapon",2],"bst010i000000004":["ability",1]}},
  "bstr000000000011": {"items":{"bst011i000000001":["weapon",2],"bst011i000000002":["weapon",2],"bst011i000000005":["ability",1]}},
  "bstr000000000012": {"items":{"bst012i000000001":["weapon",2],"bst012i000000004":["ability",1]}},
  "bstr000000000013": {"items":{"bst013i000000001":["weapon",2],"bst013i000000002":["weapon",2],"bst013i000000005":["ability",1]}},
  "bstr000000000014": {"items":{"bst014i000000001":["weapon",2],"bst014i000000002":["weapon",2],"bst014i000000005":["ability",1]}},
  "bstr000000000015": {"items":{"bst015i000000001":["weapon",2],"bst015i000000002":["weapon",2],"bst015i000000005":["ability",1]}},
  "bstr000000000016": {"items":{"bst016i000000001":["weapon",2],"bst016i000000004":["ability",1]}},
  "bstr000000000017": {"items":{"bst017i000000001":["weapon",2],"bst017i000000002":["weapon",2],"bst017i000000003":["weapon",2],"bst017i000000005":["ability",1]}},
  "bstr000000000018": {"items":{"bst018i000000001":["weapon",2],"bst018i000000003":["ability",1]}},
  "bstr000000000019": {"items":{"bst019i000000001":["weapon",2],"bst019i000000003":["ability",1]}},
  "bstr000000000020": {"items":{"bst020i000000001":["weapon",2],"bst020i000000002":["weapon",2],"bst020i000000003":["ability",1]}},
  "bstr000000000021": {"items":{"bst021i000000001":["weapon",2],"bst021i000000002":["weapon",2],"bst021i000000003":["weapon",2],"bst021i000000004":["weapon",2],"bst021i000000006":["ability",1]}},
  "bstr000000000022": {"items":{"bst022i000000001":["weapon",2],"bst022i000000002":["weapon",2],"bst022i000000004":["ability",1],"bst022i000000005":["ability",0]}},
  "bstr000000000023": {"items":{"bst023i000000001":["weapon",2],"bst023i000000002":["weapon",2]}},
  "bstr000000000024": {"items":{"bst024i000000001":["weapon",2]}},
  "bstr000000000025": {"items":{"bst025i000000001":["weapon",2]}},
  "bstr000000000026": {"items":{"bst026i000000001":["weapon",2]}},
  "bstr000000000027": {"items":{"bst027i000000001":["weapon",2]}},
  "bstr000000000028": {"items":{"bst028i000000001":["weapon",2]}},
  "bstr000000000029": {"items":{"bst029i000000001":["weapon",2],"bst029i000000002":["weapon",2]}},
  "bstr000000000030": {"items":{"bst030i000000001":["weapon",2]}}
};
export const ARCHER_V4_HARVEST = [
  {
    "id": "scoiatael-archer-0",
    "uuid": "Compendium.witcher-eliott-system.equipment.Item.armo000000000002",
    "quantity": 1,
    "formula": "",
    "skill": "",
    "dc": 0,
    "attempted": false
  },
  {
    "id": "scoiatael-archer-1",
    "uuid": "Compendium.witcher-eliott-system.equipment.Item.armo000000000011",
    "quantity": 1,
    "formula": "",
    "skill": "",
    "dc": 0,
    "attempted": false
  },
  {
    "id": "scoiatael-archer-2",
    "uuid": "Compendium.witcher-eliott-system.equipment.Item.armo000000000020",
    "quantity": 1,
    "formula": "",
    "skill": "",
    "dc": 0,
    "attempted": false
  }
];
