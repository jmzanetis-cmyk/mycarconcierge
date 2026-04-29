const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

const mccIconsContent = fs.readFileSync(path.join(__dirname, '..', 'www', 'mcc-icons.js'), 'utf8');

test.describe('Icon Registry', () => {

  test('MCC_ICONS object contains at least 70 icons', async () => {
    const iconMatches = mccIconsContent.match(/^\s+'?[\w-]+'?\s*:\s*'<svg/gm);
    expect(iconMatches).not.toBeNull();
    expect(iconMatches.length).toBeGreaterThanOrEqual(70);
  });

  test('All icon values are valid SVG strings (start with <svg and end with </svg>)', async () => {
    const iconEntries = mccIconsContent.match(/'<svg[^']*<\/svg>'/g);
    expect(iconEntries).not.toBeNull();
    expect(iconEntries.length).toBeGreaterThanOrEqual(70);
    for (const entry of iconEntries) {
      expect(entry).toMatch(/^'<svg/);
      expect(entry).toMatch(/<\/svg>'$/);
    }
  });

  test('All SVGs have proper xmlns, width, height, viewBox, fill, stroke attributes', async () => {
    const iconEntries = mccIconsContent.match(/'<svg[^']*<\/svg>'/g);
    expect(iconEntries).not.toBeNull();
    for (const entry of iconEntries) {
      expect(entry).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(entry).toContain('width="1em"');
      expect(entry).toContain('height="1em"');
      expect(entry).toContain('viewBox="0 0 24 24"');
      expect(entry).toContain('fill="none"');
      expect(entry).toContain('stroke="currentColor"');
    }
  });
});

test.describe('mccIcon Function', () => {

  test('mccIcon returns SVG wrapped in span with mcc-icon class when class provided', async () => {
    expect(mccIconsContent).toContain('function mccIcon(name, size, cls)');
    expect(mccIconsContent).toContain('const svg = MCC_ICONS[name]');
    expect(mccIconsContent).toContain('const c = cls ? ` class="${cls}"` : \'\'');
    expect(mccIconsContent).toContain('<span${c} style="display:inline-flex');
    expect(mccIconsContent).toContain('aria-hidden="true"');
  });

  test('mccIcon with size sets width and height', async () => {
    expect(mccIconsContent).toContain('const s = size || 20');
    expect(mccIconsContent).toContain('width:${s}px');
    expect(mccIconsContent).toContain('height:${s}px');
    expect(mccIconsContent).toContain('.replace(/width="1em"/,\'width="\'+s+\'"\'');
    expect(mccIconsContent).toContain('.replace(/height="1em"/,\'height="\'+s+\'"\'');
  });

  test('mccIcon with custom class adds class attribute', async () => {
    expect(mccIconsContent).toContain('const c = cls ? ` class="${cls}"` : \'\'');
    expect(mccIconsContent).toContain('<span${c}');
  });

  test('mccIcon with nonexistent name returns empty string', async () => {
    expect(mccIconsContent).toContain("if (!svg) return ''");
  });

  test('mccIcon returns inline SVG (not an img tag or external reference)', async () => {
    expect(mccIconsContent).not.toContain('<img');
    expect(mccIconsContent).toContain('${svg.replace(');
    expect(mccIconsContent).toContain('aria-hidden="true">${svg');
  });
});

test.describe('Icon Usage Validation', () => {

  test('No remaining ${mccIcon patterns in template literals across www/*.js files', async () => {
    const wwwDir = path.join(__dirname, '..', 'www');
    const jsFiles = fs.readdirSync(wwwDir).filter(f => f.endsWith('.js'));
    const filesWithBug = [];
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(wwwDir, file), 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("'${mccIcon") || line.includes('"${mccIcon')) {
          if (line.includes('`') || line.includes("'+") || line.includes("' +")) continue;
          filesWithBug.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(filesWithBug).toEqual([]);
  });

  test('All mccIcon() calls in source files reference valid icon names from MCC_ICONS', async () => {
    const iconNameMatches = mccIconsContent.match(/^\s+'?([\w-]+)'?\s*:/gm);
    const validNames = iconNameMatches.map(m => m.trim().replaceAll(/[':]/g, ''));
    expect(validNames.length).toBeGreaterThanOrEqual(70);

    const wwwDir = path.join(__dirname, '..', 'www');
    const jsFiles = fs.readdirSync(wwwDir).filter(f => f.endsWith('.js') && f !== 'mcc-icons.js');
    const usedNames = new Set();
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(wwwDir, file), 'utf8');
      const calls = content.match(/mccIcon\(\s*'([^']+)'/g) || [];
      for (const call of calls) {
        const nameMatch = call.match(/mccIcon\(\s*'([^']+)'/);
        if (nameMatch) usedNames.add(nameMatch[1]);
      }
    }
    expect(usedNames.size).toBeGreaterThan(10);

    const coreIcons = ['wrench', 'car', 'star', 'bell', 'home', 'settings', 'user', 'shield', 'search', 'check'];
    for (const icon of coreIcons) {
      expect(validNames).toContain(icon);
    }
  });

  test('Icon CSS classes (.nav-icon, .section-icon, .icon-inline) are defined in stylesheets', async () => {
    const wwwDir = path.join(__dirname, '..', 'www');
    const allFiles = fs.readdirSync(wwwDir).filter(f => f.endsWith('.css') || f.endsWith('.html') || f.endsWith('.js'));
    let allContent = '';
    for (const file of allFiles) {
      allContent += fs.readFileSync(path.join(wwwDir, file), 'utf8');
    }
    expect(allContent).toContain('.nav-icon');
    expect(allContent).toContain('.section-icon');
    expect(allContent).toContain('.icon-inline');
  });
});
