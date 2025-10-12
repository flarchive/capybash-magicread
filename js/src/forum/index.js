import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';

function getTextarea(ctx) {
  if (!ctx || !ctx.attrs || !ctx.attrs.composer || !ctx.attrs.composer.editor) return null;
  return ctx.attrs.composer.editor.el || null;
}

function createCounterLi() {
  var li = document.createElement('li');
  li.className = 'item-magicread-counter';
  var span = document.createElement('span');
  span.className = 'MagicRead-CharCounter';
  span.textContent = '0';
  span.setAttribute('aria-live', 'polite');
  li.appendChild(span);
  return { li: li, span: span };
}

function mountCounterLeft(ctx) {
  var ta = getTextarea(ctx);
  if (!ta) return null;
  var composer = ta.closest('.Composer');
  if (!composer) return null;
  var controls = composer.querySelector('.Composer-controls');
  if (!controls) return null;
  var li = controls.querySelector('li.item-magicread-counter');
  var span = null;
  if (li) {
    span = li.querySelector('.MagicRead-CharCounter');
  } else {
    var nodes = createCounterLi();
    li = nodes.li;
    span = nodes.span;
    controls.insertAdjacentElement('afterbegin', li);
  }
  return span;
}

var PER_PAGE = 20;
var pagerUpdate = null;
var mo = null;
var routeTimer = null;
var resizeTimer = null;
var winListenersBound = false;

function isDiscussionPage() {
  return !!document.querySelector('.DiscussionPage');
}

function isMobile() {
  return window.matchMedia('(max-width: 800px)').matches;
}

function paginationEnabled() {
  var v = app.forum.attribute('magicread_enable_pagination');
  return v !== false;
}

function getDiscussion() {
  if (!app.current) return null;
  if (typeof app.current.get === 'function') return app.current.get('discussion') || null;
  return null;
}

function getStream() {
  if (!app.current) return null;
  var s = null;
  if (typeof app.current.get === 'function') s = app.current.get('stream');
  if (!s && app.current && app.current.stream) s = app.current.stream;
  if (!s) {
    var el = document.querySelector('.DiscussionPage .PostStream');
    if (el && el.__stream) s = el.__stream;
  }
  return s || null;
}

function totalPages() {
  var d = getDiscussion();
  var total = d && typeof d.commentCount === 'function' ? d.commentCount() : 0;
  var pages = Math.ceil((total || 0) / PER_PAGE);
  return pages > 0 ? pages : 1;
}

function currentPage() {
  var s = getStream();
  var idx = s && typeof s.index === 'number' ? s.index : 0;
  var p = Math.floor(idx / PER_PAGE) + 1;
  return p > 0 ? p : 1;
}

function gotoPage(n) {
  var all = totalPages();
  var num = parseInt(n, 10);
  if (!num || num < 1) num = 1;
  if (num > all) num = all;
  var s = getStream();
  var byIndex = (num - 1) * PER_PAGE;
  var byNumber = byIndex + 1;
  if (s && typeof s.goToNumber === 'function') {
    s.goToNumber(byNumber);
  } else if (s && typeof s.goToIndex === 'function') {
    s.goToIndex(byIndex);
  }
}

function ensurePagerHost() {
  var scrubber = document.querySelector('.DiscussionPage .PostStreamScrubber');
  if (!scrubber) return null;
  var host = scrubber.parentElement ? scrubber.parentElement.querySelector(':scope > .MagicRead-TimelinePagerHost') : null;
  if (!host) {
    host = document.createElement('div');
    host.className = 'MagicRead-TimelinePagerHost';
    scrubber.insertAdjacentElement('afterend', host);
  }
  return host;
}

function digits(n) {
  var v = parseInt(n, 10);
  if (isNaN(v) || v < 0) v = 0;
  return String(v).length;
}

function fitWidth(el, n, padCh) {
  var ch = digits(n) + (padCh || 0);
  el.style.width = ch + 'ch';
}

function buildPagerDom(host) {
  host.textContent = '';
  var wrap = document.createElement('div');
  wrap.className = 'MagicRead-TimelinePager';
  var input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.className = 'MagicRead-Input';
  var sep = document.createElement('span');
  sep.className = 'MagicRead-Sep';
  sep.textContent = '/';
  var total = document.createElement('span');
  total.className = 'MagicRead-Total';
  wrap.appendChild(input);
  wrap.appendChild(sep);
  wrap.appendChild(total);
  host.appendChild(wrap);
  function sanitize() {
    var v = input.value.replace(/[^\d]/g, '');
    input.value = v;
    fitWidth(input, v || 0, 0.5);
  }
  function commit() {
    var v = input.value;
    if (!v) v = '1';
    gotoPage(v);
  }
  input.addEventListener('input', sanitize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') commit();
  });
  input.addEventListener('blur', commit);
  function sync() {
    var cur = currentPage();
    var all = totalPages();
    input.value = String(cur);
    total.textContent = String(all);
    fitWidth(input, cur, 0.5);
    fitWidth(total, all, 0.5);
  }
  sync();
  return sync;
}

function mountPager() {
  if (!isDiscussionPage()) return;
  if (isMobile()) return;
  if (!paginationEnabled()) {
    unmountPager();
    return;
  }
  var host = ensurePagerHost();
  if (!host) return;
  pagerUpdate = buildPagerDom(host);
  var streamNode = document.querySelector('.DiscussionPage .PostStream');
  if (streamNode) {
    if (mo) mo.disconnect();
    mo = new MutationObserver(function () {
      if (pagerUpdate) pagerUpdate();
    });
    mo.observe(streamNode, { childList: true, subtree: true });
  }
  if (!winListenersBound) {
    window.addEventListener('popstate', handleRouteChange, { passive: true });
    window.addEventListener('hashchange', handleRouteChange, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    winListenersBound = true;
  }
}

function unmountPager() {
  if (mo) {
    mo.disconnect();
    mo = null;
  }
  var host = document.querySelector('.MagicRead-TimelinePagerHost');
  if (host && host.parentNode) host.parentNode.removeChild(host);
  pagerUpdate = null;
}

function handleRouteChange() {
  if (routeTimer) clearTimeout(routeTimer);
  routeTimer = setTimeout(function () {
    if (!isDiscussionPage() || isMobile() || !paginationEnabled()) {
      unmountPager();
    } else {
      mountPager();
      if (pagerUpdate) pagerUpdate();
    }
  }, 60);
}

function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    handleRouteChange();
  }, 120);
}

app.initializers.add('capybash-magicread', function () {
  function counterEnabled() {
    var v = app.forum.attribute('magicread_enable_counter');
    return v !== false;
  }

  var oldCreate = TextEditor.prototype.oncreate;
  TextEditor.prototype.oncreate = function (vnode) {
    if (oldCreate) oldCreate.call(this, vnode);
    if (!counterEnabled()) return;
    var span = mountCounterLeft(this);
    this.magicReadCounterEl = span;
    var self = this;
    this.magicReadUpdate = function () {
      var ta = getTextarea(self);
      var val = ta && typeof ta.value === 'string' ? ta.value.length : 0;
      if (self.magicReadCounterEl) self.magicReadCounterEl.textContent = String(val);
    };
    var ta = getTextarea(this);
    if (ta) {
      ta.addEventListener('input', this.magicReadUpdate);
      this.magicReadUpdate();
    }
  };

  var oldUpdate = TextEditor.prototype.onupdate;
  TextEditor.prototype.onupdate = function (vnode) {
    if (oldUpdate) oldUpdate.call(this, vnode);
    if (!counterEnabled()) return;
    if (!this.magicReadCounterEl || !document.body.contains(this.magicReadCounterEl)) {
      this.magicReadCounterEl = mountCounterLeft(this);
      if (this.magicReadUpdate) this.magicReadUpdate();
    }
  };

  var oldRemove = TextEditor.prototype.onremove;
  TextEditor.prototype.onremove = function (vnode) {
    try {
      var ta = getTextarea(this);
      if (ta && this.magicReadUpdate) ta.removeEventListener('input', this.magicReadUpdate);
      var li = this.magicReadCounterEl ? this.magicReadCounterEl.closest('.item-magicread-counter') : null;
      if (li && li.parentNode) li.parentNode.removeChild(li);
    } catch (e) {}
    if (oldRemove) oldRemove.call(this, vnode);
  };

  document.addEventListener('DOMContentLoaded', function () {
    handleRouteChange();
  });
  setTimeout(handleRouteChange, 0);
});