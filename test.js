import axios from 'axios';
import * as cheerio from 'cheerio';

async function test() {
  const loginPageRes = await axios.get(`https://accesscenter.roundrockisd.org/HomeAccess/Account/LogOn`);
  const $ = cheerio.load(loginPageRes.data);
  const inputs = {};
  $('input').each((i, el) => {
    inputs[$(el).attr('name')] = $(el).attr('value');
  });
  console.log('Inputs:', inputs);
}
test();
