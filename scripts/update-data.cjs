const fs = require('fs');
const path = require('path');
const API = 'https://programacao.claro.com.br/gatekeeper';
const HERE = __dirname;
const DAYS = 11;

function isoDate(date) { return date.toISOString().slice(0, 10); }
function saoPauloToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
}
async function getJson(route, params) {
  const url = new URL(API + route);
  for (const [key, value] of params) url.searchParams.append(key, value);
  const response = await fetch(url, {headers:{'user-agent':'Grade-Claro-Barra-Mansa/1.0'}});
  if (!response.ok) throw new Error(`${response.status} ao consultar ${route}`);
  const json = await response.json();
  if (!json.response || !Array.isArray(json.response.docs)) throw new Error(`Resposta inválida em ${route}`);
  return json;
}
async function channels(city) {
  return getJson('/canal/select', [['q',`id_cidade:${city}`],['wt','json'],['rows','1000'],['start','0'],['sort','cn_canal asc'],['fl','id_canal st_canal cn_canal nome url_imagem id_cidade id_categoria'],['fq','nome:*']]);
}
async function programs(city, date) {
  return getJson('/exibicao/select', [['q',`id_cidade:${city}`],['wt','json'],['rows','100000'],['start','0'],['sort','id_canal asc,dh_inicio asc'],['fl','dh_fim dh_inicio st_titulo titulo id_programa id_canal id_cidade'],['fq',`dh_inicio:[${date}T00:00:00Z TO ${date}T23:59:59Z]`]]);
}
async function main() {
  const start = saoPauloToday();
  const dates = Array.from({length:DAYS}, (_,i) => { const d=new Date(start); d.setUTCDate(d.getUTCDate()+i); return isoDate(d); });
  const [barraMansa, saoPaulo] = await Promise.all([channels('165'), channels('1')]);
  fs.writeFileSync(path.join(HERE,'barra_mansa_channels.json'),JSON.stringify(barraMansa));
  fs.writeFileSync(path.join(HERE,'channels.json'),JSON.stringify(saoPaulo));
  const espn6=[], history2=[];
  for (const date of dates) {
    const [local,sp,national] = await Promise.all([programs('165',date),programs('1',date),programs('2000',date)]);
    if (!local.response.docs.length) throw new Error(`Fonte oficial sem programação local para ${date}`);
    fs.writeFileSync(path.join(HERE,`barra_mansa_programs_${date}.json`),JSON.stringify(local));
    fs.writeFileSync(path.join(HERE,`programs_${date}.json`),JSON.stringify(sp));
    espn6.push(...national.response.docs.filter(p=>String(p.id_canal)==='1091'));
    history2.push(...national.response.docs.filter(p=>String(p.id_canal)==='1329'));
  }
  fs.writeFileSync(path.join(HERE,'programs_channel_1091.json'),JSON.stringify({response:{docs:espn6}}));
  fs.writeFileSync(path.join(HERE,'programs_channel_1329.json'),JSON.stringify({response:{docs:history2}}));
  try {
    const jp=await fetch('https://jovempan.com.br/programacao/',{headers:{'user-agent':'Mozilla/5.0'}});
    if (jp.ok) fs.writeFileSync(path.join(HERE,'jovem_pan_programacao.html'),await jp.text());
  } catch (error) { console.warn('Jovem Pan indisponível; mantendo a última grade semanal validada:',error.message); }
  fs.writeFileSync(path.join(HERE,'update-manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),cityId:165,city:'Barra Mansa-RJ',dates},null,2));
  console.log(`Coleta concluída: ${barraMansa.response.docs.length} canais locais, ${dates.length} dias.`);
}
main().catch(error=>{console.error(error);process.exit(1)});
