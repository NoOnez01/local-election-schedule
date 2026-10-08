'use strict';

/* การตั้งค่าทั้งหมดของระบบ แก้ไขได้ที่หน้าผู้ดูแลระบบ (index.html#admin)
   เก็บใน localStorage ของเบราว์เซอร์ และส่งออก/นำเข้าเป็นไฟล์ JSON ได้ */

const KEYS = {
  config: 'elx.config.v1',
  form: 'elx.form.v1',
  // ข้อมูลจากรุ่นก่อน ย้ายเข้า config ครั้งแรกที่เปิด
  oldRules: 'elx.rules.v2',
  legacyRules: 'elx.rules.v1',
  oldHolidays: 'elx.holidays.v1',
};

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// สร้าง element: h('button', { class: 'btn', onclick }, 'ข้อความ')
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'hidden', 'type', 'min', 'max', 'rows', 'placeholder', 'title'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => { if (c != null && c !== false) el.append(c instanceof Node ? c : String(c)); });
  return el;
}

/* กำหนดการ:
   anchor before  = วันก่อนวันเลือกตั้ง, after = วันหลังวันเลือกตั้ง
          vacancy = วันหลังวันเริ่มต้น (ไม่นับวันเริ่มต้น: ลาออกวันที่ 7 → วันรุ่งขึ้นวันที่ 8 คือ vacancy + 1)
          rule    = วันหลังวันสิ้นสุดของกิจกรรม ref (เลื่อนตามกิจกรรมนั้นอัตโนมัติ)
   from/to: จำนวนวัน (to ใช้เมื่อเป็นช่วง)   side: up = เขียนเหนือตาราง, down = ใต้ตาราง */
const DEFAULT_RULES = [
  { id: 'report', text: 'รายงานตำแหน่งว่าง', anchor: 'vacancy', from: 1, side: 'down' },
  { id: 'resign', text: 'ส.ท. ลาออก', anchor: 'vacancy', from: 1, side: 'down' },
  { id: 'nominate', text: 'เสนอรายชื่อ กกต.ท้องถิ่น', anchor: 'vacancy', from: 2, side: 'up' },
  { id: 'draft', text: 'ผอ.กต.ท้องถิ่น เสนอร่างประกาศ ส.ถ.1/1', anchor: 'before', from: 54, side: 'up' },
  { id: 'approve', text: 'ผอ.กต.จว. ให้ความเห็นชอบร่างประกาศ ส.ถ.1/1', anchor: 'before', from: 52, side: 'up' },
  { id: 'committee', text: 'กกต.ท้องถิ่น ปฏิบัติหน้าที่', anchor: 'before', from: 52, side: 'down' },
  { id: 'proclaim', text: 'ผอ.กต.ท้องถิ่น ประกาศ ส.ถ.1/1', anchor: 'before', from: 51, side: 'up' },
  { id: 'register', text: 'รับสมัคร', note: 'ไม่น้อยกว่า 5 วัน', anchor: 'before', from: 48, to: 44, color: 'tan', side: 'up' },
  { id: 'check', text: 'ตรวจสอบคุณสมบัติ', note: 'ภายใน 7 วันนับแต่วันปิดรับสมัคร', anchor: 'rule', ref: 'register', from: 1, to: 7, color: 'green', side: 'up' },
  { id: 'announce', text: 'วันสุดท้ายประกาศรายชื่อผู้สมัคร', note: 'ภายหลังการตรวจสอบคุณสมบัติ', anchor: 'rule', ref: 'check', from: 0, side: 'up' },
  { id: 'objection', text: 'ผู้สมัครมีสิทธิยื่นคำร้องคัดค้านสิทธิการสมัคร', note: 'ภายใน 3 วัน นับแต่วันประกาศรายชื่อผู้มีสิทธิสมัคร', anchor: 'rule', ref: 'announce', from: 1, to: 3, color: 'pink', side: 'up' },
  { id: 'ballots', text: 'รายงานการสั่งซื้อบัตรเลือกตั้ง', anchor: 'before', from: 30, side: 'up' },
  { id: 'voterlist', text: 'วันสุดท้ายประกาศบัญชีรายชื่อผู้มีสิทธิเลือกตั้ง', anchor: 'before', from: 26, side: 'down' },
  { id: 'units', text: 'วันสุดท้ายประกาศกำหนดหน่วยเลือกตั้ง/ที่เลือกตั้ง', note: 'ก่อนวันเลือกตั้งไม่น้อยกว่า 25 วัน', anchor: 'before', from: 26, side: 'down' },
  { id: 'voterobj', text: 'วันสุดท้ายผู้มีสิทธิเลือกตั้งยื่นคำร้องคัดค้านผู้สมัคร', note: 'ก่อนวันเลือกตั้งไม่น้อยกว่า 20 วัน', anchor: 'before', from: 21, color: 'navy', side: 'down' },
  { id: 'officials', text: 'วันสุดท้ายแต่งตั้ง กปน./รปภ.', anchor: 'before', from: 21, side: 'down' },
  { id: 'notify', text: 'วันสุดท้ายแจ้งรายชื่อผู้มีสิทธิไปยังเจ้าบ้าน', note: 'ก่อนวันเลือกตั้งไม่น้อยกว่า 15 วัน', anchor: 'before', from: 16, color: 'sky', side: 'down' },
  { id: 'addname', text: 'วันสุดท้ายการเพิ่มชื่อ/ถอนชื่อ', anchor: 'before', from: 11, color: 'salmon', side: 'down' },
  { id: 'unitchange', text: 'วันสุดท้ายเปลี่ยนแปลงเขตของหน่วยเลือกตั้ง', note: 'ก่อนวันเลือกตั้งไม่น้อยกว่า 10 วัน', anchor: 'before', from: 11, side: 'down' },
  { id: 'agents', text: 'วันสุดท้ายแต่งตั้งตัวแทนผู้สมัคร', note: 'ไม่น้อยกว่า 7 วันก่อนวันเลือกตั้ง', anchor: 'before', from: 8, color: 'yellow', side: 'up' },
  { id: 'absentfirst', text: 'วันแรกแจ้งเหตุที่ทำให้ไม่อาจไปใช้สิทธิเลือกตั้ง', note: 'ภายใน 7 วัน ก่อนวันเลือกตั้ง', anchor: 'before', from: 7, color: 'slate', side: 'down' },
  { id: 'training', text: 'อบรม กปน.', anchor: 'before', from: 4, color: 'sky', side: 'down' },
  { id: 'boxes', text: 'จัดอุปกรณ์ฯ ลงหีบ', anchor: 'before', from: 4, side: 'down' },
  { id: 'ready', text: 'รายงานความพร้อมก่อนวันเลือกตั้ง', anchor: 'before', from: 2, color: 'gold', side: 'up' },
  { id: 'supplies', text: 'วันสุดท้ายจ่ายวัสดุ/อุปกรณ์ที่เลือกตั้ง', note: 'ก่อนวันเลือกตั้ง 1 วัน', anchor: 'before', from: 1, color: 'slate', side: 'down' },
  { id: 'absentlast', text: 'วันสุดท้ายแจ้งเหตุที่ทำให้ไม่อาจไปใช้สิทธิเลือกตั้ง', note: 'ภายใน 7 วันนับแต่วันเลือกตั้ง', anchor: 'after', from: 7, color: 'green', side: 'down' },
];

// กิจกรรมที่เลื่อนตามกิจกรรมก่อนหน้า [ลูก, แม่] ใช้แปลงกำหนดการที่บันทึกไว้จากรุ่นก่อน
const RULE_CHAIN = [
  ['ตรวจสอบคุณสมบัติ', 'รับสมัคร'],
  ['วันสุดท้ายประกาศรายชื่อผู้สมัคร', 'ตรวจสอบคุณสมบัติ'],
  ['ผู้สมัครมีสิทธิยื่นคำร้องคัดค้านสิทธิการสมัคร', 'วันสุดท้ายประกาศรายชื่อผู้สมัคร'],
];

// กรณีครบวาระเริ่มจากกำหนดการเดียวกัน แต่ไม่มีรายการของตำแหน่งว่าง
const VACANCY_ONLY = ['รายงานตำแหน่งว่าง', 'ส.ท. ลาออก'];

// วว/ดด = ทุกปี, วว/ดด/ปปปป = เฉพาะปีนั้น
const RECURRING_HOLIDAYS = [
  '1/1 วันขึ้นปีใหม่',
  '6/4 วันจักรี',
  '13/4 วันสงกรานต์',
  '14/4 วันสงกรานต์',
  '15/4 วันสงกรานต์',
  '4/5 วันฉัตรมงคล',
  '3/6 วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี',
  '28/7 วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว',
  '12/8 วันแม่แห่งชาติ',
  '13/10 วันนวมินทรมหาราช',
  '23/10 วันปิยมหาราช',
  '5/12 วันพ่อแห่งชาติ',
  '10/12 วันรัฐธรรมนูญ',
  '31/12 วันสิ้นปี',
];
const DEFAULT_HOLIDAYS = [
  ...RECURRING_HOLIDAYS,
  '3/3/2569 วันมาฆบูชา',
  '31/5/2569 วันวิสาขบูชา',
  '29/7/2569 วันอาสาฬหบูชา',
  '30/7/2569 วันเข้าพรรษา',
].join('\n');

const CONFIG_VERSION = 2;

const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  general: {
    appTitle: 'ระบบสร้างตารางควบคุมการจัดให้มีการเลือกตั้ง',
    appSubtitle: 'เลือกวันเลือกตั้ง ระบบจะคำนวณกำหนดการทุกกิจกรรมและสร้างตารางนับถอยหลังให้อัตโนมัติ',
    tablePrefix: 'ตารางควบคุมการจัดให้มี',
    split: 25,       // ตารางช่วงที่ 1 จบที่นับถอยหลัง 25 ช่วงที่ 2 เริ่มที่ 24
    afterDays: 7,    // แสดงต่อหลังวันเลือกตั้ง
    pollOpen: '08:00',
    pollClose: '17:00',
  },
  positions: { member: 'สมาชิกสภาท้องถิ่น', chief: 'ผู้บริหารท้องถิ่น (นายก)' },
  cases: [
    { id: 'vacancy', name: 'กรณีแทนตำแหน่งว่าง', days: 60, start: 'วันที่ตำแหน่งว่าง' },
    { id: 'term', name: 'กรณีครบวาระ', days: 45, start: 'วันที่ครบวาระ' },
  ],
  orgTypes: [
    { id: 'tt', name: 'เทศบาลตำบล', member: 'สมาชิกสภาเทศบาลตำบล', chief: 'นายกเทศมนตรีตำบล', zones: 2, useProvince: false },
    { id: 'tm', name: 'เทศบาลเมือง', member: 'สมาชิกสภาเทศบาลเมือง', chief: 'นายกเทศมนตรีเมือง', zones: 3, useProvince: false },
    { id: 'tn', name: 'เทศบาลนคร', member: 'สมาชิกสภาเทศบาลนคร', chief: 'นายกเทศมนตรีนคร', zones: 4, useProvince: false },
    // อบต. อ่านจำนวนหมู่บ้านต่อตำบล · อบจ. อ่านจำนวนเขตจาก ECT · 0 = ยังไม่ทราบ
    { id: 'abt', name: 'องค์การบริหารส่วนตำบล', member: 'สมาชิกสภาองค์การบริหารส่วนตำบล', chief: 'นายกองค์การบริหารส่วนตำบล', zones: 0, useProvince: false },
    { id: 'abj', name: 'องค์การบริหารส่วนจังหวัด', member: 'สมาชิกสภาองค์การบริหารส่วนจังหวัด', chief: 'นายกองค์การบริหารส่วนจังหวัด', zones: 0, useProvince: true },
  ],
  // จำนวนเขตเลือกตั้งจริงของแต่ละ อปท. (อบจ. ใช้เฉพาะจังหวัด)
  zoneCounts: [],
  palette: [
    { id: 'tan', name: 'ส้มอ่อน', fill: '#F8D9A8' },
    { id: 'green', name: 'เขียว', fill: '#A9D08E' },
    { id: 'pink', name: 'ชมพู', fill: '#F4B9B9' },
    { id: 'navy', name: 'น้ำเงิน', fill: '#4472C4' },
    { id: 'sky', name: 'ฟ้า', fill: '#9DC3E6' },
    { id: 'salmon', name: 'ส้มแซลมอน', fill: '#F4B183' },
    { id: 'yellow', name: 'เหลือง', fill: '#FFE699' },
    { id: 'slate', name: 'เทาน้ำเงิน', fill: '#8497B0' },
    { id: 'gold', name: 'ทอง', fill: '#FFC000' },
    { id: 'purple', name: 'ม่วง', fill: '#CDB8E8' },
  ],
  holidays: DEFAULT_HOLIDAYS,
  rulesByCase: {
    vacancy: DEFAULT_RULES,
    term: DEFAULT_RULES.filter((r) => !VACANCY_ONLY.includes(r.text)),
  },
};

/* ---------------- ตรวจและเติมค่าที่ขาด (ใช้ตอนโหลดและตอนนำเข้าไฟล์) ---------------- */

const asText = (v, d = '') => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : d);
const asInt = (v, d, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const asTime = (v, d) => {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : d;
};
const asHex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toUpperCase() : d);
const PROVINCE_PREFIX = ['จังหวัด', 'จ.'];
const DISTRICT_PREFIX = ['อำเภอ', 'อ.'];
function cleanPlace(s, prefixes) {
  let v = asText(s);
  prefixes.forEach((p) => { if (v.startsWith(p)) v = v.slice(p.length).trim(); });
  return v;
}
const asId = (v, prefix) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : newId(prefix));

function uniqueById(list) {
  const seen = new Set();
  return list.filter((x) => !seen.has(x.id) && seen.add(x.id));
}

function normalizeRule(r) {
  if (!r || typeof r !== 'object') return null;
  const text = asText(r.text);
  if (!text) return null;
  const hasTo = r.to !== null && r.to !== undefined && r.to !== '';
  const linked = r.anchor === 'rule' && typeof r.ref === 'string' && r.ref !== '';
  const anchor = linked || ['before', 'after', 'vacancy'].includes(r.anchor) ? r.anchor : 'before';
  const min = linked ? -999 : 0; // กิจกรรมที่ผูกกับกิจกรรมอื่น อยู่ก่อนวันสิ้นสุดของกิจกรรมนั้นได้
  return {
    id: asId(r.id, 'r'),
    text,
    note: asText(r.note),
    anchor,
    ref: linked ? r.ref : null,
    from: asInt(r.from, 0, min, 999),
    to: hasTo ? asInt(r.to, null, min, 999) : null,
    color: asText(r.color),
    side: r.side === 'up' ? 'up' : 'down',
  };
}

// กำหนดการรุ่นก่อนไม่มี id และนับทุกกิจกรรมจากวันเลือกตั้ง → ผูกกิจกรรมตาม RULE_CHAIN โดยวันที่เท่าเดิม
function linkRuleChain(rules) {
  if (!Array.isArray(rules) || rules.every((r) => !r || r.id)) return rules;
  const list = rules.map((r) => (r && typeof r === 'object' ? { ...r, id: r.id || newId('r') } : r));
  const beforeSpan = (r) => {
    const a = Number(r.from) || 0;
    const b = r.to == null || r.to === '' ? a : Number(r.to);
    return { first: Math.max(a, b), last: Math.min(a, b) }; // นับถอยหลัง: วันแรกมีค่ามากกว่า
  };
  const changes = RULE_CHAIN.map(([childText, parentText]) => {
    const child = list.find((r) => r && r.text === childText && r.anchor === 'before');
    const parent = list.find((r) => r && r.text === parentText && r.anchor === 'before');
    if (!child || !parent) return null;
    const p = beforeSpan(parent);
    const c = beforeSpan(child);
    const single = child.to == null || child.to === '';
    return { child, ref: parent.id, from: p.last - c.first, to: single ? null : p.last - c.last };
  });
  changes.forEach((ch) => { if (ch) Object.assign(ch.child, { anchor: 'rule', ref: ch.ref, from: ch.from, to: ch.to }); });
  return list;
}

/* ตำแหน่งวันของกิจกรรม = ฐาน + จำนวนวัน (ฐาน E = วันเลือกตั้ง, V = วันเริ่มต้น)
   ไม่ต้องรู้วันที่จริง จึงใช้ได้ทั้งตอนคำนวณตารางและตอนแปลงรูปแบบการนับ */
function rulePos(r, rules, seen = new Set()) {
  const span = (base, a, b) => (b == null ? { base, s: a, e: a } : { base, s: Math.min(a, b), e: Math.max(a, b) });
  const to = r.to == null ? null : r.to;
  if (r.anchor === 'rule') {
    const ref = rules.find((x) => x.id === r.ref);
    if (ref && ref !== r && !seen.has(ref)) {
      seen.add(r);
      const p = rulePos(ref, rules, seen);
      return span(p.base, p.e + r.from, to == null ? null : p.e + to);
    }
    return { ...span('E', -r.from, to == null ? null : -to), orphan: true }; // ไม่พบกิจกรรมที่อ้างอิง
  }
  if (r.anchor === 'after') return span('E', r.from, to);
  if (r.anchor === 'vacancy') return span('V', r.from, to);
  return span('E', -r.from, to == null ? null : -to);
}

// เลิกผูกกับกิจกรรมอื่น โดยวันที่คงเดิม (ใช้ก่อนลบกิจกรรมที่มีกิจกรรมอื่นผูกอยู่)
function detachRule(r, rules) {
  const p = rulePos(r, rules);
  const single = p.s === p.e;
  r.ref = null;
  if (p.base === 'V') {
    Object.assign(r, { anchor: 'vacancy', from: Math.max(0, p.s), to: single ? null : Math.max(0, p.e) });
  } else if (p.s > 0) {
    Object.assign(r, { anchor: 'after', from: p.s, to: single ? null : p.e });
  } else {
    Object.assign(r, { anchor: 'before', from: -p.s, to: single ? null : -Math.min(p.e, 0) });
  }
}

// ลบกิจกรรม: กิจกรรมที่ผูกอยู่กับกิจกรรมนี้จะเลิกผูกแต่คงวันที่เดิม
function removeRule(rules, r) {
  rules.filter((x) => x.anchor === 'rule' && x.ref === r.id).forEach((x) => detachRule(x, rules));
  const i = rules.indexOf(r);
  if (i >= 0) rules.splice(i, 1);
}

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_CONFIG;
  const g = c.general && typeof c.general === 'object' ? c.general : {};
  const p = c.positions && typeof c.positions === 'object' ? c.positions : {};

  const general = {
    appTitle: asText(g.appTitle) || d.general.appTitle,
    appSubtitle: asText(g.appSubtitle, d.general.appSubtitle),
    tablePrefix: asText(g.tablePrefix, d.general.tablePrefix),
    split: asInt(g.split, d.general.split, 1, 365),
    afterDays: asInt(g.afterDays, d.general.afterDays, 0, 60),
    pollOpen: asTime(g.pollOpen, d.general.pollOpen),
    pollClose: asTime(g.pollClose, d.general.pollClose),
  };
  const positions = { member: asText(p.member) || d.positions.member, chief: asText(p.chief) || d.positions.chief };

  let cases = Array.isArray(c.cases) ? c.cases.filter((x) => x && typeof x === 'object').map((x) => ({
    id: asId(x.id, 'case'),
    name: asText(x.name),
    days: asInt(x.days, 60, 1, 365),
    start: asText(x.start) || 'วันเริ่มต้น',
  })).filter((x) => x.name) : [];
  cases = uniqueById(cases);
  if (!cases.length) cases = clone(d.cases);

  const oldVersion = asInt(c.version, 1, 1, 999) < CONFIG_VERSION;
  let orgTypes = Array.isArray(c.orgTypes) ? c.orgTypes.filter((x) => x && typeof x === 'object').map((x) => ({
    id: asId(x.id, 'org'),
    name: asText(x.name),
    member: asText(x.member),
    chief: asText(x.chief),
    zones: asInt(x.zones, 0, 0, 200),
    useProvince: x.useProvince === true,
  })).filter((x) => x.name) : [];
  orgTypes = uniqueById(orgTypes).map((x) => ({ ...x, member: x.member || `สมาชิกสภา${x.name}`, chief: x.chief || `นายก${x.name}` }));
  if (!orgTypes.length) orgTypes = clone(d.orgTypes);
  // รุ่นก่อนตั้ง อบต. 40 / อบจ. 60 ไว้เป็นค่าสูงสุดชั่วคราว → เปลี่ยนเป็นระบุราย อปท.
  if (oldVersion) {
    orgTypes.forEach((t) => {
      if ((t.id === 'abt' && t.zones === 40) || (t.id === 'abj' && t.zones === 60)) t.zones = 0;
    });
  }

  const zoneCounts = Array.isArray(c.zoneCounts) ? c.zoneCounts.filter((z) => z && typeof z === 'object').map((z) => ({
    province: cleanPlace(z.province, PROVINCE_PREFIX),
    district: cleanPlace(z.district, DISTRICT_PREFIX),
    orgType: asText(z.orgType),
    orgName: asText(z.orgName),
    zones: asInt(z.zones, 0, 0, 200),
  })).filter((z) => z.province && z.orgType && z.zones > 0) : [];

  const palette = Array.isArray(c.palette)
    ? uniqueById(c.palette.filter((x) => x && typeof x === 'object').map((x) => ({
      id: asId(x.id, 'color'),
      name: asText(x.name) || 'สี',
      fill: asHex(x.fill, null),
    })).filter((x) => x.fill))
    : clone(d.palette);

  const rulesByCase = {};
  const savedRules = c.rulesByCase && typeof c.rulesByCase === 'object' ? c.rulesByCase : {};
  cases.forEach(({ id }) => {
    const src = Array.isArray(savedRules[id]) ? savedRules[id] : d.rulesByCase[id] || [];
    rulesByCase[id] = linkRuleChain(src).map(normalizeRule).filter(Boolean);
  });

  return {
    version: CONFIG_VERSION,
    general,
    positions,
    cases,
    orgTypes,
    zoneCounts,
    palette,
    holidays: typeof c.holidays === 'string' ? c.holidays : d.holidays,
    rulesByCase,
  };
}

// กำหนดการรุ่นก่อนนับรายการตำแหน่งว่างตั้งแต่วันที่ตำแหน่งว่าง → เลื่อนเป็นวันรุ่งขึ้น
const shiftVacancy = (rules) => rules.map((r) => (r && r.anchor === 'vacancy'
  ? { ...r, from: (Number(r.from) || 0) + 1, to: r.to == null || r.to === '' ? r.to : Number(r.to) + 1 }
  : r));

function loadConfig() {
  const saved = store.get(KEYS.config, null);
  if (saved) return normalizeConfig(saved);

  // ครั้งแรก: ย้ายกำหนดการและวันหยุดที่บันทึกไว้จากรุ่นก่อน
  const cfg = clone(DEFAULT_CONFIG);
  const oldRules = store.get(KEYS.oldRules, null);
  const legacy = store.get(KEYS.legacyRules, null);
  if (oldRules && typeof oldRules === 'object') {
    ['vacancy', 'term'].forEach((k) => {
      if (Array.isArray(oldRules[k])) cfg.rulesByCase[k] = oldRules._v === 3 ? oldRules[k] : shiftVacancy(oldRules[k]);
    });
  } else if (Array.isArray(legacy)) {
    cfg.rulesByCase.vacancy = shiftVacancy(legacy);
  }
  const oldHolidays = store.get(KEYS.oldHolidays, null);
  if (typeof oldHolidays === 'string') cfg.holidays = [...RECURRING_HOLIDAYS, oldHolidays].join('\n');
  return normalizeConfig(cfg);
}

const saveConfig = (cfg) => store.set(KEYS.config, cfg);

/* ---------------- ตัวช่วยอ่านค่า ---------------- */

const caseById = (cfg, id) => cfg.cases.find((c) => c.id === id) || cfg.cases[0];
const orgTypeById = (cfg, id) => cfg.orgTypes.find((t) => t.id === id) || cfg.orgTypes[0];

/* ---------------- จำนวนเขตเลือกตั้ง ----------------
   ค่าที่ระบุราย อปท. ก่อน แล้วอ่านจำนวนหมู่บ้าน (อบต.) / ECT (อบจ.)
   เทศบาลใช้ค่าตามประเภท · 0 = ยังไม่ทราบ */

function zoneOrgName(type, value) {
  return type.id === 'abt' ? cleanPlace(value, ['องค์การบริหารส่วนตำบล', 'อบต.', 'ตำบล', 'ต.']) : asText(value);
}

function zoneEntryMatches(z, place, t) {
  if (z.orgType !== t.id || z.province !== cleanPlace(place.province, PROVINCE_PREFIX)) return false;
  if (t.useProvince) return true; // อบจ.: ทั้งจังหวัด
  return z.district === cleanPlace(place.district, DISTRICT_PREFIX) && zoneOrgName(t, z.orgName) === zoneOrgName(t, place.orgName);
}

function zoneCountFor(cfg, place) {
  const type = orgTypeById(cfg, place.orgType);
  const entry = cfg.zoneCounts.find((z) => zoneEntryMatches(z, place, type));
  if (entry) return { n: entry.zones, source: 'org', type };
  const province = cleanPlace(place.province, PROVINCE_PREFIX);
  if (type.id === 'abt') {
    const district = cleanPlace(place.district, DISTRICT_PREFIX);
    const tambon = zoneOrgName(type, place.orgName);
    const n = window.THAI_VILLAGES?.[province]?.[district]?.[tambon];
    return { n: Number.isInteger(n) && n > 0 ? n : 0, source: Number.isInteger(n) && n > 0 ? 'villages' : null, type };
  }
  if (type.id === 'abj') {
    const n = window.PAO_ZONES?.[province];
    return { n: Number.isInteger(n) && n > 0 ? n : 0, source: Number.isInteger(n) && n > 0 ? 'ect' : null, type };
  }
  return { n: type.zones, source: type.zones > 0 ? 'type' : null, type };
}

// ตั้งจำนวนเขตของ อปท. นี้ (0 = ลบ กลับไปใช้ข้อมูลอัตโนมัติ)
function setZoneCount(cfg, place, n) {
  const type = orgTypeById(cfg, place.orgType);
  const i = cfg.zoneCounts.findIndex((z) => zoneEntryMatches(z, place, type));
  if (i >= 0) cfg.zoneCounts.splice(i, 1);
  if (n > 0) {
    cfg.zoneCounts.push({
      province: cleanPlace(place.province, PROVINCE_PREFIX),
      district: type.useProvince ? '' : cleanPlace(place.district, DISTRICT_PREFIX),
      orgType: type.id,
      orgName: type.useProvince ? '' : zoneOrgName(type, place.orgName),
      zones: n,
    });
  }
}
const startShort = (c) => c.start.replace(/^วันที่\s*/, '') || c.start;

// สีเข้มใช้ตัวอักษรสีขาว
function isDarkColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.6;
}

function paletteOf(cfg, id) {
  const p = id && cfg.palette.find((x) => x.id === id);
  return p ? { fill: p.fill, dark: isDarkColor(p.fill), name: p.name } : null;
}
