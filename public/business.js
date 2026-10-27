export const business = {
  name: 'BW Bilpleje',
  area: 'Slotsbjergby, Slagelse og omegn',
  phone: '42 30 01 68',
  pageId: '61595933881305',
  messenger: 'https://m.me/61595933881305',
  packages: [
    {id:'basis', name:'BASIS', price:'349 kr.', includes:[
      'Grundig støvsugning af sæder, gulve og bagagerum',
      'Rengøring af instrumentbord og midterkonsol',
      'Aftørring af dørpaneler og øvrige plastoverflader',
      'Rengøring af kopholdere og indvendige ruder',
      'Rengøring af gummimåtter / støvsugning af stofmåtter'
    ]},
    {id:'grundig', name:'GRUNDIG', price:'549 kr.', includes:[
      'Alt fra BASIS',
      'Ekstra grundig rengøring af sprækker og svært tilgængelige områder',
      'Rens af plastik og interiørdetaljer',
      'Let pletbehandling af stofsæder og let rens af stofmåtter',
      'Pleje af indvendige plastoverflader, hvor materialet egner sig'
    ]},
    {id:'dybderens', name:'DYBDERENS', price:'fra 849 kr.', includes:[
      'Alt fra GRUNDIG',
      'Dybderens af almindelige stofsæder med tæpperenser',
      'Rens af gulvtæpper og stofmåtter',
      'Grundig behandling af almindeligt snavs og pletter',
      'Ekstra grundig rengøring af hele kabinen'
    ]}
  ],
  extras: ['Meget dyrehår: fra +149 kr.', 'Sæderens separat: fra 299 kr.', 'Genstridige eller meget slemme pletter: fra +99 kr.', 'Store biler / 7-personers: pristillæg efter aftale'],
  travel: 'Aflever bilen hos mig, eller få mig ud til dig. Udkørsel koster 100 kr. inden for 15 km fra Slotsbjergby. Over 15 km: 100 kr. + 5 kr. pr. ekstra kilometer. Afstanden beregnes én vej fra Slotsbjergby til din adresse. Ved udkørsel skal der være adgang til strøm.',
  terms: 'Priserne gælder almindelige personbiler i normal stand. Meget beskidte biler vurderes ud fra billeder inden opgaven. Genstridige pletter vurderes individuelt; fuldstændig fjernelse kan ikke garanteres. Læder, Alcantara og andre følsomme materialer behandles med egnede metoder. Sæder og tekstiler kan kræve tørretid efter dybderens. Der udføres ikke udvendig bilvask.'
};

export function makePost(topic = 'overview', name = business.name, area = business.area) {
  const chosen = business.packages.find(p => p.id === topic);
  const headline = chosen ? `✨ ${chosen.name} – ${chosen.price}` : '🚗 Trænger din bil til en grundig indvendig rengøring?';
  const packages = chosen ? [chosen] : business.packages;
  return `${headline}\n\n${name} tilbyder omhyggelig indvendig bilrengøring i ${area}. Jeg bruger kvalitetsprodukter fra blandt andet Koch Chemie og tilpasser rengøringen til bilens materialer.\n\n${packages.map(p => `${p.name} – ${p.price}\n${p.includes.map(line => '✓ ' + line).join('\n')}`).join('\n\n')}\n\nTILVALG\n${business.extras.join('\n')}\n\n📍 ${business.travel}\n\nℹ️ ${business.terms}\n\n📞 Bestil på ${business.phone}\n💬 Messenger: ${business.messenger}\nSend din bilmodel og gerne billeder af kabinen, så finder vi en pris og en tid.\n\nFør- og efterbilleder tages kun med din tilladelse.`;
}
