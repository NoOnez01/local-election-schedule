'use strict';

/* แตะที่ตารางเพื่อแก้กำหนดการของวันนั้น
   แก้บนสำเนาของกำหนดการแล้วกด "บันทึก"
   ปกติมีผลเฉพาะการเลือกตั้งนี้ (state.form.customRules ตามกรณี)
   ติ๊ก "ใช้เป็นกำหนดการมาตรฐาน" เพื่อบันทึกลงการตั้งค่าของกรณีนั้นแทน */

const dayEd = { day: null, rules: null, shown: [], initial: '', combo: null };

const dayDlg = document.getElementById('day-dlg');
const newRule = () => ({ id: newId('r'), text: '', note: '', anchor: 'before', ref: null, from: 0, to: null, color: '', side: 'down' });
const rangeOf = (r) => ruleRange(r, lastCtx.E, lastCtx.vEff, dayEd.rules);
const moveRule = (r, s, e) => setRuleRange(r, s, e, lastCtx.E, lastCtx.vEff, dayEd.rules);
const covers = (r, day) => { const [s, e] = rangeOf(r); return s <= day && day <= e; };

function dayLabel(day) {
  const { E } = lastCtx;
  if (day < E) return `นับถอยหลัง ${E - day} วัน`;
  if (day === E) return 'วันเลือกตั้ง';
  return `หลังวันเลือกตั้ง ${day - E} วัน`;
}

function openDayEditor(day) {
  if (!lastCtx) return;
  dayEd.day = day;
  dayEd.rules = clone(rulesOf(state.form));
  dayEd.initial = JSON.stringify(dayEd.rules);
  // อ้างอิงตัววัตถุ เพื่อให้รายการยังแสดงอยู่แม้แก้วันที่ออกไปจากวันนี้แล้ว
  dayEd.shown = dayEd.rules.filter((r) => covers(r, day));
  document.getElementById('day-default').checked = false;
  renderDayEditor();
  if (!dayDlg.open) dayDlg.showModal();
}

// บรรทัดบอกการผูก: เลื่อนตามกิจกรรมใด และกิจกรรมใดเลื่อนตามกิจกรรมนี้
function linkInfo(r, rerenderWith) {
  const ref = r.anchor === 'rule' ? dayEd.rules.find((x) => x.id === r.ref) : null;
  const followers = dayEd.rules.filter((x) => x.anchor === 'rule' && x.ref === r.id);
  if (!ref && !followers.length) return null;
  return h('div', { class: 'day-link' },
    ref ? h('span', {},
      `เลื่อนตาม "${ref.text}" (${r.from === 0 && r.to == null ? 'วันเดียวกับวันสิ้นสุด' : `${r.from}${r.to != null ? `–${r.to}` : ''} วันหลังวันสิ้นสุด`}) `,
      h('button', { type: 'button', class: 'link-btn', onclick: rerenderWith(() => detachRule(r, dayEd.rules)) }, 'เลิกผูก')) : null,
    followers.length ? h('span', {}, `กิจกรรมที่เลื่อนตาม: ${followers.map((x) => x.text).join(', ')}`) : null);
}

function dayCard(r) {
  const { E } = lastCtx;
  const [s, e] = rangeOf(r);
  const moved = !covers(r, dayEd.day);
  const rerenderWith = (fn) => (ev) => { fn(ev); renderDayEditor(); };

  const color = h('select', { 'aria-label': 'สีช่อง' },
    h('option', { value: '' }, 'ไม่มีสี'),
    cfg().palette.map((p) => h('option', { value: p.id }, p.name)));
  color.value = paletteOf(cfg(), r.color) ? r.color : '';
  const paint = () => {
    const p = paletteOf(cfg(), color.value);
    color.style.background = p ? p.fill : '';
    color.style.color = p && p.dark ? '#fff' : '';
  };
  color.addEventListener('change', () => { r.color = color.value; paint(); });
  paint();

  const side = h('select', { 'aria-label': 'ตำแหน่งข้อความ', onchange: (ev) => { r.side = ev.target.value; } },
    h('option', { value: 'up' }, 'เหนือตาราง'),
    h('option', { value: 'down' }, 'ใต้ตาราง'));
  side.value = r.side === 'up' ? 'up' : 'down';

  return h('div', { class: `day-card${moved ? ' moved' : ''}` },
    h('div', { class: 'day-card-head' },
      h('span', { class: 'day-when' }, `${fmtRange(s, e)} · ${cdText(E, s, e)}`, moved ? ' · ย้ายออกจากวันนี้แล้ว' : ''),
      h('button', {
        type: 'button', class: 'btn ghost small',
        onclick: rerenderWith(() => {
          removeRule(dayEd.rules, r); // กิจกรรมที่ผูกอยู่จะเลิกผูกแต่คงวันที่เดิม
          dayEd.shown.splice(dayEd.shown.indexOf(r), 1);
        }),
      }, 'ลบ')),
    linkInfo(r, rerenderWith),
    h('div', { class: 'day-grid' },
      h('label', { class: 'field span-2' }, 'กิจกรรม',
        h('input', { type: 'text', value: r.text, placeholder: 'ชื่อกิจกรรม', oninput: (ev) => { r.text = ev.target.value; } })),
      h('label', { class: 'field span-2' }, 'หมายเหตุ (บรรทัดที่ 2)',
        h('input', { type: 'text', value: r.note || '', placeholder: '—', oninput: (ev) => { r.note = ev.target.value; } })),
      h('label', { class: 'field' }, 'วันที่',
        h('input', {
          type: 'date', value: toISO(s),
          onchange: rerenderWith((ev) => {
            if (!isISO(ev.target.value)) return;
            const ns = toDayNum(ev.target.value);
            const [cs, ce] = rangeOf(r);
            moveRule(r, ns, ns + (ce - cs)); // ย้ายทั้งช่วง คงจำนวนวันเดิม
          }),
        })),
      h('label', { class: 'field' }, 'ถึงวันที่ (ถ้าเป็นช่วง)',
        h('input', {
          type: 'date', value: e > s ? toISO(e) : '', min: toISO(s),
          onchange: rerenderWith((ev) => {
            const [cs] = rangeOf(r);
            const ne = isISO(ev.target.value) ? toDayNum(ev.target.value) : cs;
            moveRule(r, cs, Math.max(ne, cs));
          }),
        })),
      h('label', { class: 'field' }, 'สีช่อง', color),
      h('label', { class: 'field' }, 'ข้อความ', side)));
}

function renderDayEditor() {
  const { E, deadline, holidays, caseInfo } = lastCtx;
  const day = dayEd.day;
  document.getElementById('day-title').textContent = fmtFull(day);
  const facts = [dayLabel(day), caseInfo.name];
  if (holidays.has(day)) facts.push(holidays.get(day));
  if (day === deadline) facts.push('วันสุดท้ายที่ต้องจัดให้มีการเลือกตั้ง');
  document.getElementById('day-sub').textContent = facts.join(' · ');

  const list = document.getElementById('day-list');
  const cards = dayEd.shown.map(dayCard);
  list.replaceChildren(
    ...(day === E ? [h('p', { class: 'day-note' }, 'วันนี้คือวันเลือกตั้ง (เปลี่ยนได้ที่ช่อง "วันเลือกตั้ง" ด้านบน)')] : []),
    ...(cards.length ? cards : [h('p', { class: 'day-empty' }, 'ยังไม่มีกิจกรรมในวันนี้ เพิ่มได้จากช่องด้านบน')]),
  );
  document.getElementById('day-count').textContent = `กิจกรรมในวันนี้ (${dayEd.shown.filter((r) => covers(r, day)).length})`;
}

function closeDayEditor() {
  const changed = JSON.stringify(dayEd.rules) !== dayEd.initial;
  if (changed && !confirm('ยกเลิกการแก้ไขในวันนี้?')) return false;
  dayDlg.close();
  return true;
}

function saveDayEditor() {
  const f = state.form;
  const caseId = caseOf(f).id;
  const rules = dayEd.rules.map(normalizeRule).filter(Boolean); // ไม่มีชื่อ = ไม่บันทึก
  if (document.getElementById('day-default').checked) {
    state.config.rulesByCase[caseId] = rules;
    saveConfig(state.config);
    if (f.customRules) delete f.customRules[caseId];
    if (typeof admin !== 'undefined' && !admin.dirty) admin.draft = null;
  } else if (JSON.stringify(rules) === JSON.stringify(cfg().rulesByCase[caseId] || [])) {
    if (f.customRules) delete f.customRules[caseId]; // แก้แล้วเหมือนกำหนดการมาตรฐาน
  } else {
    f.customRules = { ...(f.customRules || {}), [caseId]: rules };
  }
  saveForm();
  dayDlg.close();
  render();
}

// ช่องเพิ่มกิจกรรม: เลือกกิจกรรมเดิมเพื่อย้ายมาวันนี้ หรือพิมพ์ชื่อใหม่
dayEd.combo = createCombo(document.getElementById('day-add-input'), {
  allowFree: true,
  commitOnBlur: false,
  emptyText: 'พิมพ์ชื่อกิจกรรมใหม่',
  freeText: (q) => `+ เพิ่มกิจกรรมใหม่ “${q}”`,
  getItems: () => dayEd.rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.text && !covers(r, dayEd.day))
    .map(({ r, i }) => {
      const [s, e] = rangeOf(r);
      return { value: String(i), label: `${r.text} · ${fmtRange(s, e)}`, group: 'ย้ายกิจกรรมมาวันนี้' };
    }),
  onSelect: (v, free) => {
    const day = dayEd.day;
    if (free) {
      const r = { ...newRule(), text: v };
      moveRule(r, day, day);
      dayEd.rules.push(r);
      dayEd.shown.push(r);
    } else {
      const r = dayEd.rules[Number(v)];
      const [s, e] = rangeOf(r);
      moveRule(r, day, day + (e - s));
      if (!dayEd.shown.includes(r)) dayEd.shown.push(r);
    }
    dayEd.combo.set('', '');
    renderDayEditor();
  },
});

document.getElementById('day-close').addEventListener('click', closeDayEditor);
document.getElementById('day-cancel').addEventListener('click', closeDayEditor);
document.getElementById('day-save').addEventListener('click', saveDayEditor);
dayDlg.addEventListener('cancel', (e) => { // กด Esc
  e.preventDefault();
  closeDayEditor();
});
