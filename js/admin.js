'use strict';

/* หน้าผู้ดูแลระบบ (index.html#admin)
   แก้ไขการตั้งค่าทั้งหมดบนสำเนา (draft) แล้วกด "บันทึก" จึงมีผลกับหน้าหลัก
   ส่งออก/นำเข้าเป็นไฟล์ JSON เพื่อสำรองหรือย้ายไปใช้เครื่องอื่น */

const ADMIN_TABS = [
  ['general', 'ทั่วไป'],
  ['cases', 'กรณีการเลือกตั้ง'],
  ['orgs', 'ตำแหน่ง / ประเภท อปท.'],
  ['zones', 'จำนวนเขตเลือกตั้ง'],
  ['rules', 'กำหนดการ'],
  ['colors', 'สีช่อง'],
  ['holidays', 'วันหยุด'],
  ['backup', 'สำรอง / นำเข้า'],
];

const admin = { draft: null, dirty: false, tab: 'general', ruleCase: null, status: null, focusNew: false };

// เรียกจาก route() ก่อนออกจากหน้าผู้ดูแลระบบ
function adminCanLeave() {
  if (!admin.dirty) return true;
  if (!confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?')) return false;
  admin.draft = null;
  admin.dirty = false;
  return true;
}

window.addEventListener('beforeunload', (e) => {
  if (admin.dirty) e.preventDefault();
});

function openAdmin() {
  if (!admin.draft) {
    admin.draft = clone(state.config);
    admin.dirty = false;
    admin.status = null;
  }
  renderAdmin();
}

function markDirty() {
  admin.dirty = true;
  admin.status = null;
  renderAdminStatus();
}

/* ---------------- สร้าง DOM ---------------- */

const hint =(text) => h('p', { class: 'hint' }, text);

// ช่องกรอกที่ผูกกับ obj[key]
function field(label, obj, key, { type = 'text', min, max, help, wide } = {}) {
  const input = h('input', {
    type, min, max, value: obj[key] ?? '',
    oninput: (e) => {
      obj[key] = type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
      markDirty();
    },
  });
  return h('label', { class: `field${wide ? ' span-2' : ''}` }, label, input, help ? h('small', { class: 'hint' }, help) : null);
}

/* ---------------- ตารางแก้ไขได้ ----------------
   columns: [{ key, label, type: text|number|select|checkbox|color, options?, nullable?, min?, max?, width?, paint? }] */

function cellInput(col, row) {
  const set = (v) => { row[col.key] = v; markDirty(); };
  const label = col.label;
  if (col.type === 'checkbox') {
    return h('input', { type: 'checkbox', checked: !!row[col.key], 'aria-label': label, onchange: (e) => set(e.target.checked) });
  }
  if (col.type === 'select') {
    const sel = h('select', { 'aria-label': label },
      col.options(row).map(([v, t]) => h('option', { value: v }, t)));
    sel.value = row[col.key] ?? '';
    const paint = () => {
      if (!col.paint) return;
      const p = paletteOf(admin.draft, sel.value);
      sel.style.background = p ? p.fill : '';
      sel.style.color = p && p.dark ? '#fff' : '';
    };
    sel.addEventListener('change', () => { set(sel.value); paint(); });
    paint();
    return sel;
  }
  if (col.type === 'color') {
    return h('input', {
      type: 'color', value: row[col.key] || '#CCCCCC', 'aria-label': label,
      oninput: (e) => { set(e.target.value.toUpperCase()); col.onColor?.(e.target); },
    });
  }
  if (col.type === 'number') {
    return h('input', {
      type: 'number', class: 'num', min: col.min, max: col.max, value: row[col.key] ?? '', placeholder: col.nullable ? '—' : null, 'aria-label': label,
      oninput: (e) => set(e.target.value === '' ? (col.nullable ? null : 0) : Number(e.target.value)),
    });
  }
  return h('input', { type: 'text', value: row[col.key] ?? '', placeholder: col.placeholder, 'aria-label': label, oninput: (e) => set(e.target.value) });
}

function editTable({ columns, rows, newRow, addLabel, minRows = 0, reorder = false, onRemove, removeRow, extra }) {
  const iconBtn = (text, title, onclick, disabled) => h('button', { type: 'button', class: 'icon-btn', title, 'aria-label': title, disabled, onclick }, text);
  const rerender = () => renderAdminTab();
  const body = rows.map((row, i) => h('tr', {},
    columns.map((col) => h('td', { style: col.width ? `width:${col.width}` : null }, cellInput(col, row))),
    extra ? h('td', {}, extra(row)) : null,
    h('td', { class: 'row-actions' },
      reorder ? iconBtn('↑', 'เลื่อนขึ้น', () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; markDirty(); rerender(); }, i === 0) : null,
      reorder ? iconBtn('↓', 'เลื่อนลง', () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; markDirty(); rerender(); }, i === rows.length - 1) : null,
      iconBtn('✕', 'ลบรายการ', () => {
        if (removeRow) removeRow(rows, row);
        else rows.splice(i, 1);
        onRemove?.(row);
        markDirty();
        rerender();
      }, rows.length <= minRows))));

  const table = h('table', { class: 'edit-table' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', {}, c.label)), extra ? h('th', {}, 'ตัวอย่าง') : null, h('th', {}, h('span', { class: 'sr-only' }, 'จัดการ')))),
    h('tbody', {}, body));

  const add = h('button', {
    type: 'button', class: 'btn add-btn',
    onclick: () => {
      rows.push(newRow());
      admin.focusNew = true;
      markDirty();
      rerender();
    },
  }, `+ ${addLabel}`);
  return h('div', {}, h('div', { class: 'table-wrap' }, table), add);
}

/* ---------------- หมวดการตั้งค่า ---------------- */

function tabGeneral(d) {
  const g = d.general;
  return [
    h('h2', { class: 'card-title' }, 'ทั่วไป'),
    h('div', { class: 'form-grid' },
      field('ชื่อระบบ (หัวหน้าเว็บ)', g, 'appTitle', { wide: true }),
      field('คำอธิบายใต้ชื่อระบบ', g, 'appSubtitle', { wide: true })),
    h('div', { class: 'form-grid' },
      field('ข้อความนำหน้าหัวตาราง', g, 'tablePrefix', { wide: true, help: 'เช่น "ตารางควบคุมการจัดให้มี" + "การเลือกตั้งสมาชิกสภา..."' })),
    h('div', { class: 'form-grid' },
      field('ตารางช่วงที่ 1 จบที่นับถอยหลัง (วัน)', g, 'split', { type: 'number', min: 1, max: 365, help: 'ค่าเดิม 25 → ช่วงที่ 2 เริ่มที่ 24' }),
      field('แสดงต่อหลังวันเลือกตั้ง (วัน)', g, 'afterDays', { type: 'number', min: 0, max: 60 }),
      field('เวลาเปิดหีบ', g, 'pollOpen', { type: 'time' }),
      field('เวลาปิดหีบ', g, 'pollClose', { type: 'time' })),
  ];
}

function tabCases(d) {
  return [
    h('h2', { class: 'card-title' }, 'กรณีการเลือกตั้ง'),
    hint('กำหนดชื่อกรณีและระยะเวลาที่ต้องจัดให้มีการเลือกตั้ง แต่ละกรณีมีกำหนดการแยกกัน (แก้ได้ที่หมวด "กำหนดการ")'),
    editTable({
      rows: d.cases,
      minRows: 1,
      addLabel: 'เพิ่มกรณี',
      columns: [
        { key: 'name', label: 'ชื่อกรณี (แสดงในหัวตาราง)', placeholder: 'เช่น กรณียุบสภา' },
        { key: 'days', label: 'ภายใน (วัน)', type: 'number', min: 1, max: 365, width: '110px' },
        { key: 'start', label: 'ชื่อวันเริ่มนับ', placeholder: 'เช่น วันที่ยุบสภา' },
      ],
      newRow: () => {
        const id = newId('case');
        d.rulesByCase[id] = clone(d.rulesByCase[d.cases[0].id] || []); // เริ่มจากกำหนดการของกรณีแรก
        return { id, name: '', days: 45, start: 'วันเริ่มต้น' };
      },
      onRemove: (row) => { delete d.rulesByCase[row.id]; },
    }),
  ];
}

function tabOrgs(d) {
  return [
    h('h2', { class: 'card-title' }, 'ตำแหน่ง'),
    hint('ชื่อที่แสดงในช่อง "ตำแหน่ง" ของหน้าหลัก (ผู้ใช้พิมพ์ตำแหน่งอื่นเองได้)'),
    h('div', { class: 'form-grid' },
      field('สมาชิกสภา', d.positions, 'member'),
      field('ผู้บริหาร (นายก)', d.positions, 'chief')),
    h('h2', { class: 'card-title admin-sub' }, 'ประเภท อปท.'),
    hint('ชื่อตำแหน่งจะต่อกับชื่อ อปท. เช่น "สมาชิกสภาเทศบาลตำบล" + "เมืองนะ" · เทศบาลตำบล 2 เขต เมือง 3 เขต นคร 4 เขต · อบต. ใช้จำนวนหมู่บ้านของตำบล และ อบจ. ใช้ข้อมูล ECT รายจังหวัดโดยอัตโนมัติ · แก้เฉพาะแห่งได้ที่หมวด "จำนวนเขตเลือกตั้ง"'),
    editTable({
      rows: d.orgTypes,
      minRows: 1,
      addLabel: 'เพิ่มประเภท อปท.',
      reorder: true,
      columns: [
        { key: 'name', label: 'ชื่อประเภท', placeholder: 'เช่น เมืองพัทยา' },
        { key: 'member', label: 'ตำแหน่งสมาชิกสภา', placeholder: 'เช่น สมาชิกสภาเมืองพัทยา' },
        { key: 'chief', label: 'ตำแหน่งนายก', placeholder: 'เช่น นายกเมืองพัทยา' },
        { key: 'zones', label: 'จำนวนเขต', type: 'number', min: 0, max: 200, width: '100px' },
        { key: 'useProvince', label: 'ใช้ชื่อจังหวัด', type: 'checkbox', width: '100px' },
      ],
      newRow: () => ({ id: newId('org'), name: '', member: '', chief: '', zones: 0, useProvince: false }),
    }),
  ];
}

// แปลงชื่อประเภทจากไฟล์ เช่น "อบต." "องค์การบริหารส่วนตำบล" "ทต." → id ประเภท
const ORG_ABBR = { 'ทต.': 'tt', 'ทม.': 'tm', 'ทน.': 'tn', 'อบต.': 'abt', 'อบจ.': 'abj' };
function orgTypeIdFromText(d, text) {
  const v = String(text || '').trim();
  const byName = d.orgTypes.find((t) => t.id === v || t.name === v);
  if (byName) return byName.id;
  const abbr = ORG_ABBR[v] || ORG_ABBR[`${v}.`];
  return abbr && d.orgTypes.some((t) => t.id === abbr) ? abbr : null;
}

function tabZones(d) {
  const area = h('textarea', {
    class: 'holidays', rows: 5,
    placeholder: 'เชียงใหม่\tเชียงดาว\tอบต.\tปิงโค้ง\t12\nเชียงใหม่\t\tอบจ.\t\t42',
  });
  const result = h('p', { class: 'hint' });
  const importLines = () => {
    let added = 0;
    const bad = [];
    area.value.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      const cols = line.split(/\t|\||,/).map((s) => s.trim());
      const [province, district, typeText, orgName, zonesText] = cols;
      const orgType = orgTypeIdFromText(d, typeText);
      const zones = parseInt(zonesText, 10);
      if (!province || !orgType || !(zones > 0)) { bad.push(i + 1); return; }
      setZoneCount(d, { province, district, orgType, orgName }, Math.min(zones, 200));
      added++;
    });
    if (added) markDirty();
    area.value = '';
    renderAdminTab();
    document.getElementById('zone-import-result').textContent = `เพิ่ม/แก้ ${added} รายการ${bad.length ? ` · อ่านไม่ได้บรรทัดที่ ${bad.join(', ')}` : ''}`;
  };
  result.id = 'zone-import-result';

  return [
    h('h2', { class: 'card-title' }, 'จำนวนเขตเลือกตั้ง'),
    hint('รายการนี้ใช้แก้จำนวนเขตเฉพาะแห่ง ช่อง "เขตเลือกตั้งที่" จะมีตัวเลือก 1 ถึงจำนวนนี้ · ถ้าไม่มีในรายการ อบต. ใช้จำนวนหมู่บ้านของตำบล อบจ. ใช้ข้อมูล ECT รายจังหวัด และเทศบาลใช้จำนวนเขตตามประเภท · ลบรายการเพื่อกลับไปใช้ข้อมูลอัตโนมัติ · อบจ. ไม่ต้องใส่อำเภอและชื่อ'),
    editTable({
      rows: d.zoneCounts,
      addLabel: 'เพิ่ม อปท.',
      columns: [
        { key: 'province', label: 'จังหวัด', placeholder: 'เช่น เชียงใหม่' },
        { key: 'district', label: 'อำเภอ', placeholder: 'เช่น เชียงดาว' },
        { key: 'orgType', label: 'ประเภท', type: 'select', options: () => d.orgTypes.map((t) => [t.id, t.name]) },
        { key: 'orgName', label: 'ชื่อ อปท.', placeholder: 'เช่น ปิงโค้ง' },
        { key: 'zones', label: 'จำนวนเขต', type: 'number', min: 1, max: 200, width: '100px' },
      ],
      newRow: () => ({ province: '', district: '', orgType: d.orgTypes[0].id, orgName: '', zones: 1 }),
    }),
    h('h2', { class: 'card-title admin-sub' }, 'เพิ่มหลายรายการจาก Excel'),
    hint('คัดลอก 5 คอลัมน์จาก Excel มาวาง (จังหวัด · อำเภอ · ประเภท · ชื่อ อปท. · จำนวนเขต) บรรทัดละ 1 แห่ง ประเภทใช้ชื่อเต็มหรือตัวย่อ ทต. ทม. ทน. อบต. อบจ. ได้ ถ้ามีอยู่แล้วจะแก้จำนวนเขตให้'),
    area,
    h('div', { class: 'admin-actions' }, h('button', { type: 'button', class: 'btn', onclick: importLines }, 'เพิ่มจากข้อความที่วาง')),
    result,
  ];
}

function tabRules(d) {
  if (!d.cases.some((c) => c.id === admin.ruleCase)) admin.ruleCase = d.cases[0].id;
  const c = d.cases.find((x) => x.id === admin.ruleCase);
  if (!Array.isArray(d.rulesByCase[c.id])) d.rulesByCase[c.id] = [];
  const rows = d.rulesByCase[c.id];
  const builtIn = DEFAULT_CONFIG.rulesByCase[c.id];

  const picker = h('div', { class: 'seg', role: 'group', 'aria-label': 'เลือกกรณี' },
    d.cases.map((x) => h('button', {
      type: 'button', 'aria-pressed': String(x.id === c.id),
      onclick: () => { admin.ruleCase = x.id; renderAdminTab(); },
    }, x.name || '(ไม่มีชื่อ)')));

  return [
    h('h2', { class: 'card-title' }, 'กำหนดการ'),
    picker,
    hint(`นับวันจากวันเลือกตั้ง, นับจาก${c.start || 'วันเริ่มต้น'} (วันรุ่งขึ้น = 1) หรือนับจากวันสิ้นสุดของกิจกรรมอื่น (เลือกในช่อง "อ้างอิงกิจกรรม" แล้วกิจกรรมนี้จะเลื่อนตามอัตโนมัติ เช่น ตรวจสอบคุณสมบัติ 1–7 วันหลังรับสมัคร) · ช่อง "ถึง" ใช้เมื่อเป็นช่วงหลายวัน · กิจกรรมวันเดียวกันด้านเดียวกันจะรวมเป็นกลุ่มเดียว ลำดับในตารางนี้คือลำดับที่แสดง`),
    editTable({
      rows,
      addLabel: 'เพิ่มกิจกรรม',
      reorder: true,
      removeRow: removeRule, // กิจกรรมที่ผูกอยู่จะเลิกผูกแต่คงวันที่เดิม
      columns: [
        { key: 'text', label: 'กิจกรรม', placeholder: 'ชื่อกิจกรรม' },
        { key: 'note', label: 'หมายเหตุ (บรรทัดที่ 2)', placeholder: '—' },
        { key: 'from', label: 'วันที่', type: 'number', min: -999, max: 999, width: '80px' },
        { key: 'to', label: 'ถึง', type: 'number', min: -999, max: 999, nullable: true, width: '80px' },
        {
          key: 'anchor', label: 'นับจาก', type: 'select',
          options: () => [['before', 'วันก่อนวันเลือกตั้ง'], ['after', 'วันหลังวันเลือกตั้ง'], ['vacancy', `วันหลัง${c.start || 'วันเริ่มต้น'}`], ['rule', 'วันหลังสิ้นสุดกิจกรรม →']],
        },
        {
          key: 'ref', label: 'อ้างอิงกิจกรรม', type: 'select',
          options: (row) => [['', '—'], ...rows.filter((x) => x !== row).map((x) => [x.id, x.text || '(ไม่มีชื่อ)'])],
        },
        { key: 'color', label: 'สีช่อง', type: 'select', paint: true, options: () => [['', 'ไม่มีสี'], ...d.palette.map((p) => [p.id, p.name])] },
        { key: 'side', label: 'ข้อความ', type: 'select', options: () => [['up', 'บน'], ['down', 'ล่าง']], width: '90px' },
      ],
      newRow: () => ({ id: newId('r'), text: '', note: '', anchor: 'before', ref: null, from: 0, to: null, color: '', side: 'down' }),
    }),
    h('div', { class: 'admin-actions' },
      h('button', {
        type: 'button', class: 'btn ghost',
        onclick: () => {
          if (!confirm(`คืนกำหนดการของ "${c.name}" เป็นค่าเริ่มต้น?`)) return;
          d.rulesByCase[c.id] = clone(builtIn || DEFAULT_CONFIG.rulesByCase.vacancy);
          markDirty();
          renderAdminTab();
        },
      }, 'คืนค่าเริ่มต้นของกรณีนี้')),
  ];
}

function tabColors(d) {
  return [
    h('h2', { class: 'card-title' }, 'สีช่อง'),
    hint('สีที่เลือกได้ในกำหนดการ ใช้ระบายช่องวันที่ในตาราง (สีเข้มจะใช้ตัวอักษรสีขาวอัตโนมัติ)'),
    editTable({
      rows: d.palette,
      addLabel: 'เพิ่มสี',
      reorder: true,
      columns: [
        { key: 'name', label: 'ชื่อสี' },
        {
          key: 'fill', label: 'สี', type: 'color', width: '90px',
          // อัปเดตเฉพาะช่องตัวอย่าง ไม่วาดตารางใหม่ (หน้าต่างเลือกสีจะได้ไม่ปิด)
          onColor: (input) => {
            const sw = input.closest('tr').querySelector('.swatch-cell');
            sw.style.background = input.value;
            sw.style.color = isDarkColor(input.value) ? '#fff' : INK;
          },
        },
      ],
      extra: (row) => {
        const dark = isDarkColor(row.fill || '#CCCCCC');
        return h('span', { class: 'swatch-cell', style: `background:${row.fill};color:${dark ? '#fff' : INK}` }, '24');
      },
      newRow: () => ({ id: newId('color'), name: 'สีใหม่', fill: '#CCCCCC' }),
    }),
  ];
}

function tabHolidays(d) {
  const area = h('textarea', {
    class: 'holidays', rows: 18, value: d.holidays,
    oninput: (e) => { d.holidays = e.target.value; markDirty(); count(); },
  });
  const info = h('p', { class: 'hint' });
  const count = () => {
    const lines = d.holidays.split(/\r?\n/).filter((l) => /^\s*\d{1,4}[/.-]\d{1,2}/.test(l));
    info.textContent = `พบ ${lines.length} รายการ`;
  };
  count();
  return [
    h('h2', { class: 'card-title' }, 'วันหยุด'),
    hint('บรรทัดละ 1 วัน · "วว/ดด ชื่อ" = วันหยุดทุกปี · "วว/ดด/ปปปป ชื่อ" = เฉพาะปีนั้น (พ.ศ. หรือ ค.ศ.) · วันหยุดที่ตรงกับเสาร์-อาทิตย์จะมีวันหยุดชดเชยอัตโนมัติ · ควรตรวจสอบวันหยุดทางพุทธศาสนากับประกาศคณะรัฐมนตรีทุกปี'),
    area,
    info,
  ];
}

function tabBackup(d) {
  const file = h('input', {
    type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'import-file',
    onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        admin.draft = normalizeConfig(data && data.config ? data.config : data);
        admin.dirty = true;
        admin.status = ['ok', `นำเข้า "${f.name}" แล้ว ตรวจสอบแล้วกด "บันทึก" เพื่อใช้งาน`];
        renderAdmin();
      } catch {
        admin.status = ['error', 'อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ JSON ที่ส่งออกจากระบบนี้'];
        renderAdminStatus();
      }
    },
  });
  return [
    h('h2', { class: 'card-title' }, 'สำรอง / นำเข้า'),
    hint('การตั้งค่าเก็บไว้ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ส่งออกเป็นไฟล์เพื่อสำรอง หรือนำไปนำเข้าในเครื่องอื่น'),
    h('div', { class: 'admin-actions' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const payload = { app: 'election-control-table', version: 1, exportedAt: new Date().toISOString(), config: normalizeConfig(d) };
          downloadFile(`ตั้งค่าตารางควบคุมการเลือกตั้ง_${toISO(TODAY)}.json`, JSON.stringify(payload, null, 2), 'application/json');
        },
      }, 'ส่งออกการตั้งค่า (JSON)'),
      file,
      h('label', { class: 'btn', for: 'import-file' }, 'นำเข้าการตั้งค่า…')),
    h('h2', { class: 'card-title admin-sub' }, 'คืนค่าเริ่มต้นทั้งหมด'),
    hint('ล้างการตั้งค่าทุกหมวดกลับเป็นค่าเริ่มต้นของระบบ (มีผลเมื่อกด "บันทึก")'),
    h('div', { class: 'admin-actions' },
      h('button', {
        type: 'button', class: 'btn ghost',
        onclick: () => {
          if (!confirm('คืนค่าเริ่มต้นทั้งหมด?')) return;
          admin.draft = normalizeConfig(clone(DEFAULT_CONFIG));
          markDirty();
          renderAdmin();
        },
      }, 'คืนค่าเริ่มต้นทั้งหมด')),
  ];
}

const TAB_RENDERERS = { general: tabGeneral, cases: tabCases, orgs: tabOrgs, zones: tabZones, rules: tabRules, colors: tabColors, holidays: tabHolidays, backup: tabBackup };

/* ---------------- ตรวจและบันทึก ---------------- */

function validateDraft(d) {
  const problems = [];
  if (d.cases.some((c) => !String(c.name || '').trim())) problems.push('กรุณากรอกชื่อกรณีให้ครบ');
  if (d.cases.some((c) => !(Number(c.days) >= 1))) problems.push('จำนวนวันของกรณีต้องมากกว่า 0');
  if (d.orgTypes.some((t) => !String(t.name || '').trim())) problems.push('กรุณากรอกชื่อประเภท อปท. ให้ครบ');
  if (d.zoneCounts.some((z) => !String(z.province || '').trim() || !(Number(z.zones) >= 1))) problems.push('จำนวนเขตเลือกตั้ง: กรุณากรอกจังหวัดและจำนวนเขต (อย่างน้อย 1) ให้ครบ');
  if (!(Number(d.general.split) >= 1)) problems.push('ช่วงที่ 1 ต้องจบที่นับถอยหลังอย่างน้อย 1');
  const blank = Object.values(d.rulesByCase).flat().filter((r) => !String(r.text || '').trim()).length;
  if (blank) problems.push(`มีกิจกรรมที่ไม่มีชื่อ ${blank} รายการ (กรอกชื่อหรือลบออก)`);
  Object.values(d.rulesByCase).forEach((rules) => {
    rules.filter((r) => r.anchor === 'rule').forEach((r) => {
      if (!r.ref) problems.push(`"${r.text}" นับจากกิจกรรมอื่น แต่ยังไม่ได้เลือกกิจกรรมที่อ้างอิง`);
      else if (rulePos(r, rules).orphan) problems.push(`"${r.text}" อ้างอิงกิจกรรมที่ไม่มีอยู่ หรืออ้างอิงวนกัน`);
    });
  });
  return problems;
}

function saveAdmin() {
  const problems = validateDraft(admin.draft);
  if (problems.length) {
    admin.status = ['error', problems.join(' · ')];
    renderAdminStatus();
    return;
  }
  const next = normalizeConfig(admin.draft);
  if (!saveConfig(next)) {
    admin.status = ['error', 'บันทึกไม่สำเร็จ: เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล'];
    renderAdminStatus();
    return;
  }
  state.config = next;
  admin.draft = clone(next);
  admin.dirty = false;
  admin.status = ['ok', 'บันทึกแล้ว · กลับหน้าหลักเพื่อดูผล'];
  applyConfig();
  renderAdmin();
}

/* ---------------- แสดงผล ---------------- */

function renderAdminStatus() {
  const el = document.getElementById('admin-status');
  if (!el) return;
  const [type, msg] = admin.status || (admin.dirty ? ['warn', 'มีการแก้ไขที่ยังไม่บันทึก'] : ['', 'ไม่มีการแก้ไข']);
  el.className = `admin-status ${type}`;
  el.textContent = msg;
  document.getElementById('admin-revert').disabled = !admin.dirty;
}

function renderAdminTab() {
  const panel = document.getElementById('admin-panel');
  const scrollY = window.scrollY;
  panel.replaceChildren(...TAB_RENDERERS[admin.tab](admin.draft));
  document.querySelectorAll('.admin-nav [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === admin.tab)));
  if (admin.focusNew) {
    admin.focusNew = false;
    const rows = panel.querySelectorAll('.edit-table tbody tr');
    rows[rows.length - 1]?.querySelector('input, select')?.focus();
  } else {
    window.scrollTo(0, scrollY);
  }
}

function renderAdmin() {
  const view = document.getElementById('admin-view');
  view.replaceChildren(
    h('div', { class: 'admin-layout' },
      h('nav', { class: 'admin-nav', role: 'tablist', 'aria-label': 'หมวดการตั้งค่า' },
        ADMIN_TABS.map(([id, label]) => h('button', {
          type: 'button', role: 'tab', 'data-tab': id, 'aria-controls': 'admin-panel',
          onclick: () => { admin.tab = id; renderAdminTab(); },
        }, label))),
      h('section', { class: 'card admin-panel', id: 'admin-panel', role: 'tabpanel' })),
    h('div', { class: 'admin-bar' },
      h('span', { id: 'admin-status', class: 'admin-status', role: 'status' }),
      h('span', { class: 'spacer' }),
      h('button', {
        type: 'button', class: 'btn', id: 'admin-revert',
        onclick: () => {
          if (!confirm('ยกเลิกการแก้ไขทั้งหมดที่ยังไม่บันทึก?')) return;
          admin.draft = clone(state.config);
          admin.dirty = false;
          admin.status = null;
          renderAdmin();
        },
      }, 'ยกเลิกการแก้ไข'),
      h('button', { type: 'button', class: 'btn primary', onclick: saveAdmin }, 'บันทึก')),
  );
  renderAdminTab();
  renderAdminStatus();
}
