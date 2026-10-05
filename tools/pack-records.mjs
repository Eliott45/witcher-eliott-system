// Foundry LevelDB stores embedded Documents separately, referenced by ID on their parent.
// EmbeddedData (for example prototypeToken) remains inline.
const collections={Actor:"actors",Item:"items",Macro:"macros",ActiveEffect:"effects"};
const embedded={Actor:{items:"Item",effects:"ActiveEffect"},Item:{effects:"ActiveEffect"}};
export function packRecords(type,documents,sublevel=collections[type],prefix="") {
  const records=[];
  for(const document of documents) {
    const value=structuredClone(document),key=prefix?`${prefix}.${value._id}`:value._id;
    for(const [field,childType] of Object.entries(embedded[type]??{})) {
      if(!Array.isArray(value[field]))continue;
      records.push(...packRecords(childType,value[field],`${sublevel}.${field}`,key));
      value[field]=value[field].map(child=>child._id);
    }
    records.push({sublevel,key,value});
  }
  return records;
}
export async function expandPackRecord(type,document,read,sublevel=collections[type],prefix="") {
  const result=structuredClone(document),key=prefix?`${prefix}.${result._id}`:result._id;
  for(const [field,childType] of Object.entries(embedded[type]??{}))if(Array.isArray(result[field])) {
    result[field]=await Promise.all(result[field].map(async id=>{
      if(typeof id!=="string")throw new Error(`Embedded ${sublevel}.${field} must contain IDs`);
      const child=await read(`${sublevel}.${field}`,`${key}.${id}`);
      if(!child)throw new Error(`Missing embedded document ${key}.${id}`);
      return expandPackRecord(childType,child,read,`${sublevel}.${field}`,key);
    }));
  }
  return result;
}
