'use strict';

/* สร้างข้อมูลจำนวนเขตเลือกตั้งสำหรับช่อง "เขตเลือกตั้งที่"

   1) data/village-counts.js  จำนวนหมู่บ้านต่อตำบล → จำนวนเขต อบต. (เขตละ 1 หมู่บ้าน)
      ต้นทาง: กรมการพัฒนาชุมชน ข้อมูลพื้นฐานระดับหมู่บ้าน (กชช.2ค) Open Data Common
      https://gdcatalog.go.th/dataset/gdpublish-nrd2c
      (CDD_NRD2C_indicator3.csv มีเฉพาะหมู่บ้านในชนบท คือนอกเขตเทศบาล ตรงกับพื้นที่ อบต.)

   2) data/pao-zones.js  จำนวนเขตเลือกตั้ง ส.อบจ. ต่อจังหวัด (เขตละ 1 คน)
      ต้นทาง: ECT หนังสือ 27 ปี กกต. หน้า 62–63 (หน้า PDF 63–64)
      ตารางประกาศแบ่งเขตเลือกตั้งสมาชิกสภา อบจ. 76 จังหวัด สำหรับการเลือกตั้ง 1 ก.พ. 2568
      ถอดเฉพาะคอลัมน์จังหวัดและเขตเลือกตั้งใน data/pao-zones-ect-2568.csv

   ใช้งาน: node tools/build-zone-data.js <CDD_NRD2C_indicator3.csv|-> <pao-zones-ect-2568.csv>
   ใช้ - เพื่อปรับข้อมูล ECT อย่างเดียว โดยคงไฟล์จำนวนหมู่บ้านเดิม */

const fs = require('fs');
const path = require('path');

const [villageCsv, ectCsv] = process.argv.slice(2);
if (!villageCsv || !ectCsv) {
  console.error('usage: node tools/build-zone-data.js <CDD_NRD2C_indicator3.csv|-> <pao-zones-ect-2568.csv>');
  process.exit(1);
}
const root = path.join(__dirname, '..');

// ชื่อจังหวัด/อำเภอ/ตำบลของระบบ (data/thai-admin.js)
const sandbox = { window: {} };
new Function('window', fs.readFileSync(path.join(root, 'data/thai-admin.js'), 'utf8'))(sandbox.window);
const ADMIN = sandbox.window.THAI_ADMIN;

const clean = (s) => String(s || '').trim().replace(/^(จังหวัด|อำเภอ|ตำบล)\s*/, '').replace(/\s+/g, '');

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/* ---------- 1) จำนวนหมู่บ้านต่อตำบล ---------- */

if (villageCsv !== '-') {
const lines = fs.readFileSync(villageCsv, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const head = lines[0].split(',');
const col = (name) => head.indexOf(name);
const [cP, cD, cT, cM] = ['province', 'district', 'sub_district', 'moo'].map(col);
const moos = new Map();
lines.slice(1).forEach((line) => {
  const r = line.split(',');
  const key = [clean(r[cP]), clean(r[cD]), clean(r[cT])].join('|');
  if (!moos.has(key)) moos.set(key, new Set());
  moos.get(key).add(String(r[cM]).trim());
});

// จับคู่กับชื่อในระบบ: ตรงกันก่อน ถ้าไม่ตรง (สะกดต่างกันเล็กน้อย) ใช้ชื่อที่ใกล้ที่สุดในอำเภอเดียวกัน
const villages = {};
const unmatched = [];
let fuzzy = 0;
moos.forEach((set, key) => {
  const [p, d, t] = key.split('|');
  const prov = ADMIN.find(([n]) => clean(n) === p);
  const dist = prov && prov[1].find(([n]) => clean(n) === d);
  if (!dist) { unmatched.push(key); return; }
  let name = dist[1].find((n) => clean(n) === t);
  if (!name) {
    const best = dist[1].map((n) => [n, levenshtein(clean(n), t)]).sort((a, b) => a[1] - b[1])[0];
    if (best && best[1] <= 2) { name = best[0]; fuzzy++; } else { unmatched.push(key); return; }
  }
  ((villages[prov[0]] ||= {})[dist[0]] ||= {})[name] = set.size;
});
const vTotal = Object.values(villages).flatMap((d) => Object.values(d)).flatMap((t) => Object.values(t));
fs.writeFileSync(path.join(root, 'data/village-counts.js'),
  '/* จำนวนหมู่บ้านนอกเขตเทศบาลต่อตำบล (= จำนวนเขตเลือกตั้ง อบต.)\n'
  + '   ที่มา: กรมการพัฒนาชุมชน ข้อมูลพื้นฐานระดับหมู่บ้าน (กชช.2ค) https://gdcatalog.go.th/dataset/gdpublish-nrd2c (Open Data Common)\n'
  + `   ${vTotal.length} ตำบล ${vTotal.reduce((a, b) => a + b, 0)} หมู่บ้าน · สร้างด้วย tools/build-zone-data.js */\n`
  + `window.THAI_VILLAGES = ${JSON.stringify(villages)};\n`);
console.log(`villages: ${vTotal.length} subdistricts (${fuzzy} matched by similar spelling), unmatched ${unmatched.length}`, unmatched);
}

/* ---------- 2) จำนวนเขต ส.อบจ. ต่อจังหวัด ---------- */

const source = {
  title: '27 ปี กกต. · ประกาศแบ่งเขตเลือกตั้งสมาชิกสภา อบจ. 76 จังหวัด',
  url: 'https://www.ect.go.th/mini/web-upload/38x012f0575ae60054c957e56c3d727e971/202506/m_news/2335/52672/file_download/7c0e2f915e58f7d844bce746852d5490.pdf',
  pages: '62–63 (หน้า PDF 63–64)',
  electionDate: '2025-02-01',
  checkedDate: '2026-10-08',
};
const ectRows = fs.readFileSync(ectCsv, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
if (ectRows.shift() !== 'province,zones') throw new Error('ECT CSV header must be province,zones');
const pao = {};
ectRows.forEach((line) => {
  const [province, zones] = line.split(',');
  const name = ADMIN.find(([n]) => clean(n) === clean(province));
  const count = Number(zones);
  if (!name || name[0] === 'กรุงเทพมหานคร' || !Number.isInteger(count) || count <= 0 || count > 200) throw new Error(`Invalid ECT row: ${line}`);
  if (Object.hasOwn(pao, name[0])) throw new Error(`Duplicate ECT province: ${province}`);
  pao[name[0]] = count;
});
const paoTotal = Object.values(pao).reduce((a, b) => a + b, 0);
if (Object.keys(pao).length !== 76 || paoTotal !== 2316) throw new Error('ECT 2568 table must contain 76 provinces and 2,316 zones');
fs.writeFileSync(path.join(root, 'data/pao-zones.js'),
  '/* จำนวนเขตเลือกตั้งสมาชิกสภา อบจ. ต่อจังหวัด (เขตละ 1 คน)\n'
  + `   ที่มา: ECT ${source.title} หน้า ${source.pages}\n`
  + `   ${source.url}\n`
  + `   เลือกตั้ง 1 ก.พ. 2568 · ${Object.keys(pao).length} จังหวัด รวม ${paoTotal} เขต · ตรวจต้นฉบับ ${source.checkedDate}\n`
  + '   สร้างด้วย tools/build-zone-data.js จาก data/pao-zones-ect-2568.csv */\n'
  + `window.PAO_ZONES_SOURCE = ${JSON.stringify(source)};\n`
  + `window.PAO_ZONES = ${JSON.stringify(pao)};\n`);
console.log(`pao: ${Object.keys(pao).length} provinces, total ${paoTotal} zones`);
