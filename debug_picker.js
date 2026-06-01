import fs from 'fs';
import * as cheerio from 'cheerio';

const pickerHtml = fs.readFileSync('picker_get.html', 'utf8');
const $ = cheerio.load(pickerHtml);

let formAction = $('form').first().attr('action') || `/HomeAccess/Frame/StudentPicker`;
const baseUrl = 'https://accesscenter.roundrockisd.org/HomeAccess';
const postUrlObj = new URL(formAction, baseUrl + '/');
const postUrl = postUrlObj.href;

console.log('formAction:', formAction);
console.log('baseUrl + "/":', baseUrl + '/');
console.log('postUrl:', postUrl);
