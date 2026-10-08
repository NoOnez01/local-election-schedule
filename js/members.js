'use strict';

/* เพิ่มการเลือกตั้งสมาชิก ใช้วันเลือกตั้ง/กำหนดการเดียวกับแถวหลัก
   แต่เก็บพื้นที่และเขตของแต่ละแถวแยกกัน */

function normalizeMemberElections(f) {
  const seen = new Set();
  f.members = (Array.isArray(f.members) ? f.members : [])
    .filter((m) => m && typeof m === 'object' && !Array.isArray(m))
    .map((m) => {
      let id = asId(m.id, 'member');
      if (seen.has(id)) id = newId('member');
      seen.add(id);
      return {
        id, position: 'member',
        orgType: asText(m.orgType, f.orgType),
        province: cleanPlace(m.province, PROVINCE_PREFIX),
        district: cleanPlace(m.district, DISTRICT_PREFIX),
        orgName: asText(m.orgName), zone: asText(m.zone),
      };
    });
}

function addMemberElection(f) {
  const member = {
    id: newId('member'), position: 'member',
    orgType: f.orgType, province: f.province,
    district: f.district, orgName: f.orgName,
    zone: zoneCountFor(cfg(), f).n > 0 ? 'all' : '',
  };
  if (!Array.isArray(f.members)) f.members = [];
  f.members.push(member);
  return member;
}

function removeMemberElection(f, id) {
  f.members = (f.members || []).filter((m) => m.id !== id);
}

// คืนแต่ละหน้าที่จะพิมพ์โดยไม่เปลี่ยนค่าทุกเขตที่ผู้ใช้เลือกไว้
function printElectionsFor(f) {
  const elections = [f, ...(f.members || []).map((m) => ({ ...f, ...m, position: 'member' }))];
  return elections.flatMap((election) => {
    const n = allZonesCount(election);
    return n > 0
      ? Array.from({ length: n }, (_, i) => ({ ...election, zone: String(i + 1) }))
      : [{ ...election }];
  });
}

const memberControls = new Map();

function createMemberControls(member) {
  const inputs = {};
  const fields = [
    ['position', 'ตำแหน่ง'], ['orgType', 'ประเภท อปท.'],
    ['province', 'จังหวัด'], ['district', 'อำเภอ'],
    ['orgName', 'ชื่อ อปท.'], ['zone', 'เขตเลือกตั้งที่'],
  ];
  const hint = h('small', { class: 'hint', 'aria-live': 'polite' });
  const preview = h('p', { class: 'hint office-preview' });
  const title = h('span', { class: 'member-row-title' });
  const grid = h('div', { class: 'form-grid' }, fields.map(([key, label]) => {
    const id = `${member.id}-${key}`;
    inputs[key] = h('input', { id, readonly: key === 'position', placeholder: key === 'zone' ? 'เลือกเขต' : `เลือกหรือพิมพ์${label}` });
    return h('div', { class: 'field' }, h('label', { for: id }, label), inputs[key], key === 'zone' ? hint : null);
  }));
  const remove = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
    removeMemberElection(state.form, member.id);
    saveForm();
    syncOrgControls();
    scheduleRender();
    $('#btn-add-member').focus();
  } }, 'ลบแถว');
  const row = h('div', { class: 'member-row', role: 'group' },
    h('div', { class: 'member-row-head' }, title, remove), grid, preview);
  const changed = () => { saveForm(); syncOrgControls(); scheduleRender(); };
  const controls = {};
  controls.orgType = createCombo(inputs.orgType, {
    getItems: () => cfg().orgTypes.map((t) => ({ value: t.id, label: t.name })),
    onSelect: (v) => { member.orgType = v; changed(); },
  });
  controls.province = createCombo(inputs.province, {
    allowFree: !ADMIN.length,
    getItems: () => ADMIN.map(([n]) => ({ value: n, label: n })),
    onSelect: (v) => {
      if (v === member.province) return;
      member.province = v; member.district = ''; member.orgName = '';
      changed();
    },
  });
  controls.district = createCombo(inputs.district, {
    allowFree: !ADMIN.length,
    emptyText: 'ไม่พบอำเภอ (เลือกจังหวัดก่อน)',
    getItems: () => districtsOf(member.province).map(([n]) => ({ value: n, label: n })),
    onSelect: (v) => {
      if (v === member.district) return;
      member.district = v; member.orgName = '';
      changed();
    },
  });
  controls.orgName = createCombo(inputs.orgName, {
    allowFree: true,
    getItems: () => {
      const tambons = tambonsOf(member.province, member.district);
      const others = [...new Set([member.district, member.province].filter((n) => n && !tambons.includes(n)))];
      return [
        ...tambons.map((n) => ({ value: n, label: n, group: `ตำบลในอำเภอ${member.district}` })),
        ...others.map((n) => ({ value: n, label: n, group: 'ชื่ออำเภอ / จังหวัด' })),
      ];
    },
    onSelect: (v) => { member.orgName = v; changed(); },
  });
  controls.zone = createCombo(inputs.zone, {
    allowFree: () => zoneCountFor(cfg(), member).n === 0,
    emptyText: 'พิมพ์เขตเลือกตั้ง หรือระบุจำนวนเขตด้านล่าง',
    getItems: () => {
      const { n } = zoneCountFor(cfg(), member);
      return n ? [
        { value: '', label: '— ไม่ระบุเขต —' },
        { value: 'all', label: `ทุกเขต (1–${n})` },
        ...Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
      ] : [];
    },
    onSelect: (v) => { member.zone = v; changed(); },
  });
  return { row, inputs, controls, hint, preview, title, remove };
}

function syncAdditionalMembers() {
  const box = $('#member-rows');
  const members = state.form.members;
  for (const [id, controls] of memberControls) {
    if (!members.some((m) => m.id === id)) { controls.row.remove(); memberControls.delete(id); }
  }
  let corrected = false;
  members.forEach((member, i) => {
    if (!memberControls.has(member.id)) {
      const controls = createMemberControls(member);
      memberControls.set(member.id, controls);
      box.append(controls.row);
    }
    const c = memberControls.get(member.id);
    const type = orgTypeOf(member);
    if (member.orgType !== type.id) { member.orgType = type.id; corrected = true; }
    c.title.textContent = `${cfg().positions.member} ${i + 1}`;
    c.row.setAttribute('aria-label', `สมาชิกสภาท้องถิ่น ${i + 1}`);
    c.remove.setAttribute('aria-label', `ลบแถวสมาชิกสภาท้องถิ่น ${i + 1}`);
    c.inputs.position.value = cfg().positions.member;
    c.controls.orgType.set(type.id, type.name);
    c.controls.province.set(member.province);
    c.controls.district.set(member.district);
    c.controls.district.setDisabled(!member.province && ADMIN.length > 0);
    c.controls.orgName.set(type.useProvince ? '' : member.orgName, type.useProvince ? member.province : member.orgName);
    c.controls.orgName.setDisabled(type.useProvince);
    const { n } = zoneCountFor(cfg(), member);
    const valid = member.zone === 'all' ? n > 0 : !member.zone || !n || (/^\d+$/.test(member.zone) && Number(member.zone) >= 1 && Number(member.zone) <= n);
    if (!valid) { member.zone = ''; corrected = true; }
    c.controls.zone.set(member.zone, member.zone === 'all' ? `ทุกเขต (1–${n})` : member.zone);
    renderZoneHint(false, member, c.hint);
    c.preview.textContent = `หัวตาราง: ${electionTitle({ ...state.form, ...member, position: 'member' })}`;
  });
  if (corrected) saveForm();
}

function bindAdditionalMembers() {
  $('#btn-add-member').setAttribute('aria-describedby', 'add-member-hint');
  $('#btn-add-member').addEventListener('click', () => {
    const member = addMemberElection(state.form);
    saveForm();
    syncOrgControls();
    scheduleRender();
    memberControls.get(member.id).inputs.zone.focus();
  });
}
