// Insert local Chrome 61 fallbacks while preserving modern enhancement declarations.
export function compatibilityCss() {
  return {
    postcssPlugin: 'minitool-chrome61',
    Once(root) {
      root.walkRules(rule => {
        if (rule.selector.includes(':focus-visible')) {
          rule.cloneBefore({ selector: rule.selectors.map(selector => {
            const focus = selector.replaceAll(':focus-visible', ':focus');
            return /^(html|:root)(?=[\s.#:[>+~]|$)/.test(focus)
              ? focus.replace(/^(html|:root)/, '$1.mini-keyboard-focus')
              : 'html.mini-keyboard-focus ' + focus;
          }).join(', ') });
        }
        // Custom properties are reset per rule only when it declares an actual gap.
      });
      root.walkDecls(decl => {
        const { prop, value } = decl;
        const add = (property, fallback) => decl.cloneBefore({ prop: property, value: fallback });
        if (prop === 'grid-template-columns' && value.includes('min(100%, var(--filter-min-width))')) {
          add(prop, value.replace('min(100%, var(--filter-min-width))', 'var(--filter-min-width)'));
        }
        if (prop === 'gap') {
          const parts = value.trim().split(/\s+/);
          add('grid-gap', value); add('--mini-row-gap', parts[0]); add('--mini-column-gap', parts[1] || parts[0]);
        }
        if (prop === 'row-gap' || prop === 'column-gap') { add('grid-' + prop, value); add('--mini-' + prop, value); }
        if (prop === 'inset') {
          const p = value.split(/\s+(?![^()]*\))/);
          ['top','right','bottom','left'].forEach((side, i) => add(side, [p[0], p[1] || p[0], p[2] || p[0], p[3] || p[1] || p[0]][i]));
        }
        if (/^(padding|margin)-(inline|block)$/.test(prop)) {
          const [kind, axis] = prop.split('-'), p = value.split(/\s+/);
          const sides = axis === 'inline' ? ['left','right'] : ['top','bottom'];
          sides.forEach((side, i) => add(kind + '-' + side, p[i] || p[0]));
        }
        if (prop === 'inset-inline-end') add('right', value.replace(/^max\(0px, (.*)\)$/, '$1'));
        if (/\d(?:dvh|svh|lvh)\b/.test(value)) add(prop, value.replace(/(?:dvh|svh|lvh)\b/g, 'vh'));
        if (value.includes('color-mix(')) add(prop, 'var(--parchment)');
        if (value.includes('clamp(')) add(prop, value.match(/clamp\(([^,]+)/)[1]);
        if (value.startsWith('min(') && /^(width|max-width)$/.test(prop)) {
          const match = value.match(/^min\((\d+px), (.*)\)$/);
          if (match) { add(prop, match[2]); add('max-width', match[1]); }
          else if (value === 'min(100%, 320px)') { add(prop, '100%'); add('max-width', '320px'); }
          else throw Error('Review CSS min fallback: ' + value);
        }
        if (value.includes('env(safe-area-inset-')) {
          const basic = value.replace(/max\((\d+px),\s*env\(safe-area-inset-\w+\)\)/g, '$1')
            .replace(/env\((safe-area-inset-\w+)(?:,\s*[^)]+)?\)/g, 'var(--$1, 0px)');
          add(prop, basic);
          decl.value = value.replace(/env\((safe-area-inset-\w+)(?:,\s*[^)]+)?\)/g, 'var(--$1, env($1, 0px))');
        }
        if (value.includes('anywhere')) add(prop, value.replaceAll('anywhere','break-word'));
      });
    },
  };
}
