'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function loadApp(savedForm) {
  const context = vm.createContext({ window: { addEventListener() {} }, document: { addEventListener() {} }, localStorage: { getItem(key) { return savedForm && key === 'elx.form.v1' ? JSON.stringify(savedForm) : null; }, setItem() {} } });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [, src] of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    if (src === 'js/editor.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return vm.runInContext('({ config: state.config, form: state.form, zoneCountFor, setZoneCount, allZonesCount, addMemberElection, removeMemberElection, printElectionsFor })', context);
}
const abt = { position: 'member', orgType: 'abt', province: 'เชียงใหม่', district: 'เชียงดาว', orgName: 'เมืองนะ', zone: 'all' };
// Exercises real page scripts: missing data or wrong place keys break the count.
test('อบต. uses villages for the selected tambon and changes with the tambon', () => {
  const app = loadApp();
  assert.equal(app.zoneCountFor(app.config, abt).n, 14);
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgName: 'เมืองคอง' }).n, 6);
  assert.equal(app.allZonesCount(abt), 14);
  assert.equal(app.allZonesCount({ ...abt, position: 'chief' }), 0);
});
test('อบต. accepts prefixes used in imported and typed place names', () => {
  const app = loadApp();
  assert.equal(app.zoneCountFor(app.config, { ...abt, province: 'จังหวัดเชียงใหม่', district: 'อำเภอเชียงดาว', orgName: 'อบต. เมืองนะ' }).n, 14);
});
test('อบจ. uses the ECT province count independently of district and org name', () => {
  const app = loadApp();
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgType: 'abj' }).n, 42);
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgType: 'abj', province: 'จังหวัดนครราชสีมา', district: '', orgName: '' }).n, 48);
});
test('missing อบต./อบจ. data remains unknown rather than a generic type count', () => {
  const app = loadApp();
  app.config.orgTypes.find((t) => t.id === 'abt').zones = 40;
  app.config.orgTypes.find((t) => t.id === 'abj').zones = 60;
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgName: 'ตำบลที่ไม่มีข้อมูล' }).n, 0);
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgType: 'abj', province: 'กรุงเทพมหานคร' }).n, 0);
});
test('a local correction can be removed to restore the automatic source', () => {
  const app = loadApp();
  app.setZoneCount(app.config, abt, 15);
  assert.equal(app.zoneCountFor(app.config, abt).n, 15);
  assert.equal(app.zoneCountFor(app.config, { ...abt, orgName: 'เมืองคอง' }).n, 6);
  app.setZoneCount(app.config, abt, 0);
  assert.equal(app.zoneCountFor(app.config, abt).n, 14);
  for (const [orgType, n] of [['tt', 2], ['tm', 3], ['tn', 4]]) assert.equal(app.zoneCountFor(app.config, { ...abt, orgType }).n, n);
});
test('อบต. corrections match the same tambon with or without a prefix', () => {
  const app = loadApp();
  const prefixed = { ...abt, orgName: 'อบต. เมืองนะ' };
  app.setZoneCount(app.config, abt, 15);
  assert.equal(app.zoneCountFor(app.config, prefixed).n, 15);
  app.setZoneCount(app.config, prefixed, 16);
  assert.equal(app.config.zoneCounts.length, 1);
  assert.equal(app.zoneCountFor(app.config, abt).n, 16);
  app.setZoneCount(app.config, prefixed, 0);
  assert.equal(app.zoneCountFor(app.config, abt).n, 14);
  // Existing imported overrides can still contain prefixes.
  app.config.zoneCounts.push({ ...abt, orgName: 'ตำบลเมืองนะ', zones: 17 });
  assert.equal(app.zoneCountFor(app.config, abt).n, 17);
});
test('adding members retains the chief and prints the chief plus every selected zone', () => {
  const app = loadApp();
  const chief = { ...abt, position: 'chief', members: [] };
  const member = app.addMemberElection(chief);
  assert.equal(chief.position, 'chief');
  assert.equal(chief.orgName, 'เมืองนะ');
  assert.equal(member.position, 'member');
  assert.equal(member.orgName, 'เมืองนะ');
  assert.equal(member.zone, 'all');
  const pages = app.printElectionsFor(chief);
  assert.equal(pages.length, 15);
  assert.equal(pages[0].position, 'chief');
  assert.equal(pages[1].position, 'member');
  assert.equal(pages[1].zone, '1');
  assert.equal(pages[14].zone, '14');
  assert.equal(member.zone, 'all');
});
test('member rows print their own chosen zone and can be removed independently', () => {
  const app = loadApp();
  const chief = { ...abt, position: 'chief', members: [] };
  const first = app.addMemberElection(chief);
  first.zone = '2';
  const second = app.addMemberElection(chief);
  second.orgName = 'เมืองคอง';
  second.zone = '6';
  const pages = app.printElectionsFor(chief);
  assert.equal(pages.length, 3);
  assert.equal(pages[1].orgName, 'เมืองนะ');
  assert.equal(pages[1].zone, '2');
  assert.equal(pages[2].orgName, 'เมืองคอง');
  assert.equal(pages[2].zone, '6');
  app.removeMemberElection(chief, first.id);
  assert.equal(chief.members.length, 1);
  assert.equal(chief.members[0].id, second.id);
  app.removeMemberElection(chief, second.id);
  assert.equal(app.printElectionsFor(chief).length, 1);
});
test('saved members survive reload and unknown counts do not select all zones', () => {
  const saved = { ...abt, position: 'chief', members: [{ id: 'member_saved', position: 'member', orgType: 'abt', province: 'เชียงใหม่', district: 'เชียงดาว', orgName: 'เมืองคอง', zone: '6' }] };
  const app = loadApp(saved);
  assert.equal(app.form.members[0].orgName, 'เมืองคอง');
  assert.equal(app.printElectionsFor(app.form).length, 2);
  const unknown = { ...abt, orgName: 'ไม่มีข้อมูล', members: [] };
  assert.equal(app.addMemberElection(unknown).zone, '');
});
