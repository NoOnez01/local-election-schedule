'use strict';

/* สร้าง data/thai-admin.js (จังหวัด → อำเภอ → ตำบล) สำหรับ dropdown ในหน้าเว็บ
   ข้อมูลต้นทาง: https://github.com/kongvut/thai-province-data (MIT License)
   ไฟล์ api/latest/province_with_district_and_sub_district.json

   ใช้งาน: node tools/build-admin-data.js <ไฟล์ต้นทาง.json> data/thai-admin.js */

const fs = require('fs');

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/build-admin-data.js <province_with_district_and_sub_district.json> <out.js>');
  process.exit(1);
}

const th = (a, b) => a.localeCompare(b, 'th');
const alive = (x) => x && !x.deleted_at && x.name && x.name.th;

const provinces = JSON.parse(fs.readFileSync(src, 'utf8'))
  .filter(alive)
  .map((p) => [
    p.name.th.trim(),
    (p.districts || []).filter(alive).map((d) => [
      d.name.th.trim(),
      [...new Set((d.sub_districts || []).filter(alive).map((s) => s.name.th.trim()))].sort(th),
    ]).sort((a, b) => th(a[0], b[0])),
  ])
  .sort((a, b) => th(a[0], b[0]));

const counts = provinces.reduce((c, [, ds]) => {
  c.d += ds.length;
  ds.forEach(([, ss]) => { c.s += ss.length; });
  return c;
}, { d: 0, s: 0 });

const header = '/* จังหวัด → อำเภอ → ตำบล สร้างจาก kongvut/thai-province-data (MIT License)\n'
  + `   ${provinces.length} จังหวัด ${counts.d} อำเภอ/เขต ${counts.s} ตำบล/แขวง · สร้างด้วย tools/build-admin-data.js */\n`;
fs.writeFileSync(out, `${header}window.THAI_ADMIN = ${JSON.stringify(provinces)};\n`);
console.log(`wrote ${out}: ${provinces.length} provinces, ${counts.d} districts, ${counts.s} subdistricts`);
