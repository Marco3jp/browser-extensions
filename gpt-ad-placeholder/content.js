(() => {
  const ID_PREFIX = 'div-gpt-ad-';
  const PLACEHOLDER_CLASS = '__gpt_ad_placeholder__';
  const STATE_ATTR = 'data-ad-state';
  const LABEL_ATTR = 'data-ad-label';
  const GPT_STATUS_ATTR = 'data-gpt-ad-status';
  const STYLE_ID = '__gpt_ad_placeholder_style__';
  const INDICATOR_CLASS = '__gpt_ad_placeholder_indicator__';
  const INDICATOR_FOR_ATTR = 'data-gpt-ad-indicator-for';
  const TRACKED_CLASS = '__gpt_ad_slot_tracked__';

  const css = `
    .${PLACEHOLDER_CLASS} {
      position: relative !important;
      display: block !important;
      visibility: visible !important;
      min-width: 120px !important;
      min-height: 60px !important;
      box-sizing: border-box;
      color: #2b1d00;
      font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    }
    .${PLACEHOLDER_CLASS}[${STATE_ATTR}="empty"] {
      /* GPT の collapseEmptyDivs で display:none を当てられても見えるように */
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      height: auto !important;
    }
    .${PLACEHOLDER_CLASS}[${STATE_ATTR}="waiting"] {
      background: repeating-linear-gradient(45deg,#fff2c4,#fff2c4 10px,#ffd866 10px,#ffd866 20px) !important;
      outline: 2px dashed #b8860b !important;
      outline-offset: -2px;
    }
    .${PLACEHOLDER_CLASS}[${STATE_ATTR}="requested"] {
      background: repeating-linear-gradient(45deg,#dde7ff,#dde7ff 10px,#7aa0ff 10px,#7aa0ff 20px) !important;
      outline: 2px dashed #1f4fd4 !important;
      outline-offset: -2px;
      color: #0b1a4d;
    }
    .${PLACEHOLDER_CLASS}[${STATE_ATTR}="empty"] {
      background: repeating-linear-gradient(45deg,#ffd9d9,#ffd9d9 10px,#ff6f6f 10px,#ff6f6f 20px) !important;
      outline: 2px dashed #b00020 !important;
      outline-offset: -2px;
      color: #4d0010;
    }
    .${PLACEHOLDER_CLASS}::before {
      content: attr(${LABEL_ATTR}) '\\A' attr(data-ad-id);
      white-space: pre-wrap;
      word-break: break-all;
      text-align: center;
      padding: 6px 8px;
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.6);
      pointer-events: none;
    }
    .${TRACKED_CLASS} {
      /* slot 自体に stacking context を作って、indicator の z-index:-1 が
         document root まで突き抜けないようにする。
         position:relative + z-index:0 はレイアウト自体には影響しない。
         min-width/min-height は slot が 0x0 に潰れた時に indicator を
         flow 内で表示するためのもの。absolute な indicator 側に min を
         置くと slot は 0x0 のまま indicator だけが浮いて隣接要素に被るので、
         min は必ず slot 側に。 */
      position: relative !important;
      z-index: 0 !important;
      min-width: 120px !important;
      min-height: 60px !important;
    }
    .${INDICATOR_CLASS} {
      position: absolute !important;
      inset: 0 !important;
      width: auto !important;
      height: auto !important;
      z-index: -1 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 6px 8px !important;
      background: repeating-linear-gradient(45deg,#dff5d8,#dff5d8 10px,#9bd97e 10px,#9bd97e 20px) !important;
      outline: 2px dashed #2e7d32 !important;
      outline-offset: -2px;
      color: #1b3d1d !important;
      font: 600 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
      word-break: break-all;
      white-space: pre-wrap;
      pointer-events: none;
    }
  `;

  const LABELS = {
    waiting: '広告枠 待機中',
    requested: '広告リクエスト中',
    empty: '未落札 (No Fill)',
  };
  const RENDERED_LABEL = '広告表示中（のはず）';

  const injectStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };
  injectStyle();

  // MAIN world 側のフックは manifest.json の content_scripts (world: "MAIN") で
  // page-hook.js として並行ロードされる。ここでは slot 要素に書き込まれる
  // data-gpt-ad-status 属性の変化を観測するだけ。
  const decorated = new WeakSet();
  const innerObservers = new WeakMap();

  const findIndicatorChild = (el) => {
    for (const child of el.children) {
      if (
        child.classList &&
        child.classList.contains(INDICATOR_CLASS) &&
        child.getAttribute(INDICATOR_FOR_ATTR) === el.id
      ) {
        return child;
      }
    }
    return null;
  };

  const removeIndicator = (el) => {
    const ind = findIndicatorChild(el);
    if (ind) ind.remove();
  };

  const showRenderedIndicator = (el) => {
    // slot を stacking context にして、indicator を inset:0 + z-index:-1 で
    // 広告 iframe の裏に敷く。広告が正常表示されてる時は iframe に覆われて見えず、
    // 何かの理由で iframe が空・透明な時だけ透けて見える「フォールバック表示」。
    //
    // 重要: ページ側に「slot.firstChild = 広告コンテナ」とみなして
    // サイズを当てるスクリプトが居るサイトがあるため、
    // 必ず末尾に appendChild する。先頭に挿入すると本物の広告コンテナの代わりに
    // indicator がサイズ対象になり、広告が崩れる。
    // z-index 順は CSS の z-index:-1 で担保しているので DOM 順は末尾で問題ない。
    el.classList.add(TRACKED_CLASS);
    let ind = findIndicatorChild(el);
    if (!ind) {
      ind = document.createElement('div');
      ind.className = INDICATOR_CLASS;
      ind.setAttribute(INDICATOR_FOR_ATTR, el.id);
      el.appendChild(ind);
    } else if (ind !== el.lastElementChild) {
      // refresh などで何かが間に入っても常に末尾になるよう貼り直す
      el.appendChild(ind);
    }
    ind.textContent = `${RENDERED_LABEL}\n${el.id}`;
  };

  const clearPlaceholder = (el, opts) => {
    el.classList.remove(PLACEHOLDER_CLASS);
    el.removeAttribute(STATE_ATTR);
    el.removeAttribute(LABEL_ATTR);
    el.removeAttribute('data-ad-id');
    if (!opts || !opts.keepObserver) {
      const ob = innerObservers.get(el);
      if (ob) {
        ob.disconnect();
        innerObservers.delete(el);
      }
    }
  };

  const setState = (el, state) => {
    if (state === 'rendered' || state === 'loaded') {
      // モック自体は外して広告を見せつつ、直下に「表示中（のはず）」の帯を出す。
      // 後で何かあった時に状態が再変化することもあるので observer は維持する。
      clearPlaceholder(el, { keepObserver: true });
      showRenderedIndicator(el);
      return;
    }
    if (!LABELS[state]) return;
    removeIndicator(el);
    el.classList.add(PLACEHOLDER_CLASS);
    el.setAttribute(STATE_ATTR, state);
    el.setAttribute(LABEL_ATTR, LABELS[state]);
    if (!el.hasAttribute('data-ad-id')) el.setAttribute('data-ad-id', el.id);
  };

  const reactToGptStatus = (el) => {
    const status = el.getAttribute(GPT_STATUS_ATTR);
    if (!status) return;
    if (status === 'rendered') {
      setState(el, 'rendered');
    } else if (status === 'requested' || status === 'empty') {
      setState(el, status);
    }
  };

  const applyInitial = (el) => {
    if (decorated.has(el)) return;
    if (!hasIdPrefix(el)) return;
    decorated.add(el);

    // 既に GPT 側で属性が付いていれば優先
    if (el.hasAttribute(GPT_STATUS_ATTR)) {
      reactToGptStatus(el);
    } else {
      setState(el, 'waiting');
    }

    // 個別 slot の属性変化を監視
    const inner = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === GPT_STATUS_ATTR) {
          reactToGptStatus(el);
        }
      }
    });
    inner.observe(el, { attributes: true, attributeFilter: [GPT_STATUS_ATTR] });
    innerObservers.set(el, inner);
  };

  const hasIdPrefix = (el) => {
    // SVGElement の .id は SVGAnimatedString で startsWith を持たない。
    // また form 要素は子の name="id" が .id を上書きすることがある。
    // 念のため文字列であることを確認してから判定する。
    const id = el && el.id;
    return typeof id === 'string' && id.startsWith(ID_PREFIX);
  };

  const scan = (root) => {
    if (!root) return;
    if (root.nodeType === 1) {
      if (hasIdPrefix(root)) applyInitial(root);
      if (root.querySelectorAll) {
        root.querySelectorAll(`[id^="${ID_PREFIX}"]`).forEach(applyInitial);
      }
    } else if (root.nodeType === 9) {
      root.querySelectorAll(`[id^="${ID_PREFIX}"]`).forEach(applyInitial);
    }
  };

  scan(document);

  const outer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) scan(n);
      });
    }
  });
  outer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('readystatechange', () => {
    injectStyle();
    scan(document);
  });
})();
