'use strict';

/* ช่องเลือกแบบค้นหาได้ (combobox)
   พิมพ์เพื่อกรอง · ↑↓ เลื่อน · Enter เลือก · Esc ยกเลิก
   allowFree: พิมพ์ค่าที่ไม่มีในรายการได้ (true/false หรือฟังก์ชัน; freeText กำหนดข้อความของตัวเลือกนั้น)
   commitOnBlur: ออกจากช่องแล้วใช้ข้อความที่พิมพ์ค้างไว้ (false = ทิ้งข้อความ)
   getItems() คืน [{ value, label, group? }] ทุกครั้งที่เปิดรายการ จึงได้ตัวเลือกล่าสุดเสมอ */

let comboSeq = 0;

function createCombo(input, {
  getItems, onSelect, allowFree = false, commitOnBlur = true, emptyText = 'ไม่พบรายการ',
  freeText = (q) => `ใช้ “${q}” (พิมพ์เอง)`,
}) {
  const id = `combo${++comboSeq}`;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'combo-btn';
  btn.tabIndex = -1;
  btn.setAttribute('aria-label', 'แสดงรายการ');
  btn.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.append(btn, list);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.autocomplete = 'off';
  input.spellcheck = false;

  let value = '';
  let label = '';
  let items = [];
  let shown = [];   // รายการที่แสดง (รวมตัวเลือก "ใช้ข้อความที่พิมพ์")
  let active = -1;

  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');
  const canFree = () => (typeof allowFree === 'function' ? allowFree() : allowFree);

  function highlight(text, q) {
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return esc(text);
    return `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
  }

  function render(q) {
    const query = q.trim();
    const nq = norm(query);
    shown = nq ? items.filter((it) => norm(it.label).includes(nq)) : items.slice();
    if (canFree() && query && !items.some((it) => norm(it.label) === nq)) {
      shown.push({ value: query, label: query, free: true });
    }
    let html = '';
    let group = null;
    shown.forEach((it, i) => {
      if (!it.free && it.group && it.group !== group) {
        group = it.group;
        html += `<li class="combo-group" role="presentation">${esc(group)}</li>`;
      }
      const sel = !it.free && it.value === value;
      html += `<li id="${id}-o${i}" role="option" class="combo-opt${it.free ? ' free' : ''}" data-i="${i}" aria-selected="${sel}">`
        + (it.free ? esc(freeText(it.label)) : highlight(it.label, query))
        + '</li>';
    });
    list.innerHTML = html || `<li class="combo-empty">${esc(emptyText)}</li>`;
    active = shown.findIndex((it) => !it.free && it.value === value);
    if (active < 0 && nq && shown.length) active = 0;
    paint();
  }

  function paint() {
    list.querySelectorAll('.combo-opt').forEach((li) => li.classList.toggle('active', Number(li.dataset.i) === active));
    const li = active >= 0 ? list.querySelector(`[data-i="${active}"]`) : null;
    if (li) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function open(showAll) {
    if (input.disabled) return;
    items = getItems();
    render(showAll ? '' : input.value);
    list.hidden = false;
    wrap.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    wrap.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function choose(it) {
    value = it.value;
    label = it.label;
    input.value = label;
    close();
    onSelect(value, !!it.free);
  }

  // ออกจากช่องหรือกด Enter โดยไม่ได้เลือกจากรายการ
  function commitTyped() {
    const text = input.value.trim();
    if (text === label) return;
    if (!items.length) items = getItems();
    const exact = items.find((it) => norm(it.label) === norm(text));
    if (exact) choose(exact);
    else if (canFree()) choose({ value: text, label: text, free: true });
    else input.value = label;
  }

  input.addEventListener('focus', () => {
    input.select();
    open(true);
  });
  input.addEventListener('click', () => { if (list.hidden) open(true); });
  input.addEventListener('input', () => { if (list.hidden) open(false); else render(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) { open(true); return; }
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      paint();
    } else if (e.key === 'Enter') {
      if (list.hidden) return;
      e.preventDefault();
      if (active >= 0 && shown[active]) choose(shown[active]);
      else { commitTyped(); close(); }
    } else if (e.key === 'Escape') {
      if (list.hidden) return;
      e.preventDefault();
      input.value = label;
      close();
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement === input) return;
      if (commitOnBlur) commitTyped();
      else input.value = label;
      close();
    }, 150);
  });

  list.addEventListener('mousedown', (e) => e.preventDefault()); // คงโฟกัสไว้ที่ช่องพิมพ์
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.combo-opt');
    if (li) choose(shown[Number(li.dataset.i)]);
  });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    if (!list.hidden) close();
    else if (document.activeElement === input) open(true);
    else input.focus(); // focus เปิดรายการให้เอง
  });

  return {
    set(v, l = v) {
      value = v;
      label = l;
      if (document.activeElement !== input || list.hidden) input.value = l;
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      btn.disabled = disabled;
      wrap.classList.toggle('disabled', disabled);
      if (disabled) close();
    },
  };
}
