// Every navigation.navigate(...) target used by a screen must be a route or tab the navigator defines.
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

test('navigate() targets exist in RootNavigator', () => {
  const navigator = read('src/navigation/RootNavigator.js');
  const defined = new Set([
    ...[...navigator.matchAll(/name: "([A-Za-z]+)"/g)].map((m) => m[1]),
    ...[...navigator.matchAll(/<Tab\.Screen name="([A-Za-z]+)"/g)].map((m) => m[1]),
    ...[...navigator.matchAll(/<AuthStack\.Screen name="([A-Za-z]+)"/g)].map((m) => m[1]),
  ]);
  const used = new Set();
  for (const file of walk(path.join(__dirname, '..', 'src', 'screens'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/navigation\.navigate\("([A-Za-z]+)"(?:,\s*\{\s*screen:\s*"([A-Za-z]+)")?/g)) {
      used.add(match[1]);
      if (match[2]) used.add(match[2]);
    }
  }
  expect(used.size).toBeGreaterThan(5);
  const missing = [...used].filter((name) => !defined.has(name));
  expect(missing).toEqual([]);
});

test('every screen file referenced by the navigator exists and exports what is imported', () => {
  const navigator = read('src/navigation/RootNavigator.js');
  for (const match of navigator.matchAll(/import (\{[^}]+\}|[A-Za-z]+) from "(\.\.\/screens\/[^"]+)";/g)) {
    const file = path.join(__dirname, '..', 'src', 'navigation', `${match[2]}.js`);
    expect(fs.existsSync(file)).toBe(true);
    const source = fs.readFileSync(file, 'utf8');
    if (match[1].startsWith('{')) {
      for (const name of match[1].replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean)) {
        expect(source).toMatch(new RegExp(`export (function|const) ${name}\\b`));
      }
    } else {
      expect(source).toMatch(/export default/);
    }
  }
});
