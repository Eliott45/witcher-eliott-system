export function learningFields() {
  const {SchemaField,StringField,NumberField}=foundry.data.fields;
  const text=()=>new StringField({required:true,nullable:false,initial:"",blank:true});
  const count=()=>new NumberField({required:true,nullable:false,integer:true,min:0,initial:0});
  return new SchemaField({id:text(),sourceUuid:text(),sourceName:text(),teacher:text(),skill:text(),
    cost:count(),baseDays:count(),dc:count(),required:count(),days:count(),successes:count(),failures:count(),regularSpent:count(),magicSpent:count()});
}
