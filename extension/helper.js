(() => {
  'use strict';
  const route = location.pathname.match(/^\/(?:learnPage|singleCourse\/knowledgeStudy)\/(\d+)\/(?:\d+\/)?(\d+)\/?$/);
  if (!route) return;
  const COURSE_ID = route[1];
  const COURSE = '/learnPage/' + COURSE_ID + '/';
  const CATALOG = '/singleCourse/knowledgeStudy/' + COURSE_ID + '/' + route[2];
  let catalogSignature = '';
  let catalogStableSince = 0;
  const DESIRED_RATE = 1.5;
  if (!location.pathname.startsWith(COURSE) && location.pathname !== CATALOG) return;
  if (document.getElementById('local-course-continuation')) return;
  const KEY = 'course-helper:' + COURSE_ID + ':enabled';
  const RECHECK_KEY = 'course-helper:' + COURSE_ID + ':end-recheck';
  const RETRY_KEY = 'course-helper:' + COURSE_ID + ':normal-replay';
  const VERIFIED_KEY = 'course-helper:' + COURSE_ID + ':verified-points';
  let verifiedPoints = new Set();
  try { verifiedPoints = new Set(JSON.parse(sessionStorage.getItem(VERIFIED_KEY) || '[]')); } catch (_) {}
  let retry = null;
  try { retry = JSON.parse(sessionStorage.getItem(RETRY_KEY) || 'null'); } catch (_) {}
  function clearRetry() {
    retry = null;
    try { sessionStorage.removeItem(RETRY_KEY); } catch (_) {}
  }
  let recheck = null;
  try { recheck = JSON.parse(sessionStorage.getItem(RECHECK_KEY) || 'null'); } catch (_) {}
  function clearRecheck() {
    recheck = null;
    try { sessionStorage.removeItem(RECHECK_KEY); } catch (_) {}
  }
  const host = document.createElement('div');
  host.id = 'local-course-continuation';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647';
  const ui = host.attachShadow({ mode: 'open' });
  ui.innerHTML = `<style>:host{font:14px/1.5 system-ui;color:#172438}section{width:300px;background:white;border:2px solid #486cf5;border-radius:12px;padding:14px;box-shadow:0 4px 24px #0003}b{display:block}p{margin:8px 0;white-space:pre-wrap}button{padding:6px 12px;margin-right:7px;cursor:pointer}small{color:#546078}</style><section><b>课程连续学习助手</b><p id="status"></p><button id="start">开始／继续</button><button id="pause">暂停</button><button id="stop">停止</button><p><small>资源切换时保持 1.5 倍速，不修改完成记录。文档、答题、验证需本人处理。</small></p></section>`;
  document.documentElement.append(host);
  function readEnabled() {
    try {
      const persisted = localStorage.getItem(KEY) === 'yes';
      const legacy = sessionStorage.getItem(KEY) === 'yes';
      if (persisted || legacy) {
        localStorage.setItem(KEY, 'yes');
        return true;
      }
    } catch (_) {}
    return false;
  }
  function writeEnabled(value) {
    try {
      if (value) localStorage.setItem(KEY, 'yes');
      else localStorage.removeItem(KEY);
      if (value) sessionStorage.setItem(KEY, 'yes');
      else sessionStorage.removeItem(KEY);
    } catch (_) {}
  }
  let enabled = readEnabled();
  let awaitingDocument = '';
  let pending = null;
  let lastKey = '';
  let endedKey = '';
  let endedSince = 0;
  let stopped = false;
  let loadingSince = Date.now();
  let videoLoadingSince = 0;
  let resumeInFlight = false;
  let catalogPending = null;
  const bound = new WeakSet();
  const text = e => (e?.textContent || '').replace(/\s+/g, ' ').trim();
  const status = s => { ui.querySelector('#status').textContent = s; };
  function pause(reason, documentKey = '') {
    enabled = false;
    awaitingDocument = documentKey;
    pending = null;
    writeEnabled(false);
    status(reason);
  }
  const cards = () => [...document.querySelectorAll('.resources-list .basic-info-video-card-container')];
  const title = e => text(e?.querySelector('h5'));
  const durationSeconds = e => {
    const m = text(e?.querySelector('.page-num') || e).match(/\b(?:(\d+):)?(\d{2}):(\d{2})\b/);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  };
  const isVideoCard = e => durationSeconds(e) !== null;
  const matchesVideo = (e, video) => {
    const expected = durationSeconds(e);
    return expected !== null && !!video && Number.isFinite(video.duration) && video.duration > 0 && Math.abs(video.duration - expected) <= 2;
  };
  const selectedCard = (list, video) => {
    const marked = list.find(e => e.classList.contains('active'));
    // A mounted old video must not override the selected document card.
    if (marked && !isVideoCard(marked) && !video) return marked;
    const matches = list.filter(e => matchesVideo(e, video));
    const matched = matches.length === 1 ? matches[0] : null;
    if (matched && (!marked || !matchesVideo(marked, video))) return matched;
    return marked || matched;
  };
  const done = e => !!e?.querySelector('.finished-icon') && /已完成/.test(text(e));
  const pointId = () => location.pathname.startsWith(COURSE)
    ? location.pathname.slice(COURSE.length).split('/')[0] : '';
  const catalogCards = () => [...document.querySelectorAll('.item-content[knowledgeid]')];
  const catalogProgress = e => {
    const value = text(e.querySelector('.progress-num'));
    const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
    return match ? Number(match[1]) : null;
  };
  const currentKey = () => {
    const list = cards();
    const video = document.querySelector('#vjs_videoContStudy video');
    return location.pathname + '|' + title(selectedCard(list, video));
  };
  const visible = e => !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  function guard() {
    if (!location.pathname.startsWith(COURSE) && location.pathname !== CATALOG) return '已离开本课程，助手暂停。';
    const dialogs = [...document.querySelectorAll('[role="dialog"],.el-overlay,.el-message-box')].filter(visible);
    if (dialogs.length) return '检测到弹窗，请先自行处理，再点继续。';
    const body = document.body.innerText;
    if (/请重新登录|登录已失效|请先登录|安全验证|拖动滑块|图形验证码|人机验证|人脸识别/.test(body)) return '需要登录或验证，助手已暂停，请本人处理。';
    return '';
  }
  function openCard(card) {
    pending = { type: 'card', target: title(card), node: card, since: Date.now() };
    card.click();
    status('正在打开：' + pending.target);
  }
  function nextPoint() {
    const id = pointId();
    if (!id) return pause('未识别当前知识点编号，已暂停。');
    verifiedPoints.add(id);
    try { sessionStorage.setItem(VERIFIED_KEY, JSON.stringify([...verifiedPoints])); } catch (_) {}
    status('本知识点必学资源已完成，正在核对课程总目录…');
    location.assign(CATALOG);
  }
  function visitCatalog() {
    const list = catalogCards();
    const ids = new Set(list.map(e => e.getAttribute('knowledgeid')));
    const signature = [...ids].join('|');
    if (signature !== catalogSignature) {
      catalogSignature = signature;
      catalogStableSince = Date.now();
    }
    const busy = [...document.querySelectorAll('[aria-busy="true"],.el-loading-mask')].some(visible);
    if (!list.length || busy || list.some(e => catalogProgress(e) === null) || Date.now() - catalogStableSince < 3000) {
      if (Date.now() - loadingSince > 20000) return pause('课程总目录未能稳定加载，已暂停；请检查网页。');
      return status('等待课程总目录加载：已识别 ' + ids.size + ' 个知识点');
    }
    loadingSince = 0;
    if (catalogPending) {
      if (Date.now() - catalogPending.since > 20000) return pause('进入知识点超时，已暂停；请检查网页。');
      return status('正在进入知识点：' + catalogPending.title);
    }
    const next = list.find(e => catalogProgress(e) < 100 && !verifiedPoints.has(e.getAttribute('knowledgeid')));
    if (!next) {
      const unresolved = list.filter(e => catalogProgress(e) < 100);
      return pause(unresolved.length
        ? '已核对当前目录的 ' + ids.size + ' 个知识点；仍有 ' + unresolved.length + ' 个学习进度未同步到 100%，请检查网站记录。'
        : '当前目录的 ' + ids.size + ' 个知识点均显示 100%；请另行核对其他目录、作业和练习。');
    }
    catalogPending = { title: text(next.querySelector('.item-title')), since: Date.now() };
    next.click();
    status('正在进入知识点：' + catalogPending.title);
  }
  function tick() {
    if (stopped) return;
    try {
      if (location.pathname === CATALOG) {
        if (!enabled) return;
        const reason = guard();
        if (reason) return pause(reason);
        return visitCatalog();
      }
      const key = currentKey();
      if (key !== lastKey) { lastKey = key; endedKey = ''; endedSince = 0; }
      for (const v of document.querySelectorAll('video')) {
        if (!bound.has(v)) {
          bound.add(v);
          v.addEventListener('ended', () => { endedKey = currentKey(); endedSince = Date.now(); });
        }
      }
      if (!enabled) {
        if (!awaitingDocument || awaitingDocument !== key || guard()) return;
        const completedDocument = selectedCard(cards(), document.querySelector('#vjs_videoContStudy video'));
        if (!done(completedDocument)) return;
        awaitingDocument = '';
        enabled = true;
        writeEnabled(true);
      }
      const reason = guard();
      if (reason) return pause(reason);
      const list = cards();
      const video = document.querySelector('#vjs_videoContStudy video');
      const active = selectedCard(list, video);
      if (pending) {
        const selectedPoint = text(document.querySelector('.section-item-collapse-info.active .title-text'));
        const marked = list.find(e => e.classList.contains('active'));
        const ready = pending.type === 'card'
          ? (marked === pending.node || title(marked) === pending.target || (isVideoCard(pending.node) && matchesVideo(pending.node, video)))
          : (pending.node.classList.contains('active') || selectedPoint === pending.target) && location.pathname !== pending.path && list.length > 0;
        // Completion arriving during navigation makes the card request obsolete.
        if (pending.type === 'card' && list.length && list.every(done)) pending = null;
        if (!pending) return;
        if (!ready) {
          if (Date.now() - pending.since > 20000) pause('导航未得到页面确认，已暂停；请检查网页。');
          return;
        }
        // 等待页面资源区域稳定；此计时不作为完成判据。
        if (Date.now() - pending.since < 1800) return;
        pending = null;
      }
      if (!list.length) {
        if (!loadingSince) loadingSince = Date.now();
        if (Date.now() - loadingSince > 20000) return pause('资源列表加载超时，已暂停；请检查网页。');
        status('等待课程资源加载…');
        return;
      }
      loadingSince = 0;
      if (retry && (retry.path !== location.pathname || list.some(e => title(e) === retry.title && done(e)))) clearRetry();
      if (recheck) {
        if (recheck.path !== location.pathname) clearRecheck();
        else {
          const checked = list.find(e => title(e) === recheck.title);
          if (!checked) return status('等待刷新后的资源列表确认…');
          clearRecheck();
          if (!done(checked)) {
            if (retry && retry.path === location.pathname && retry.title === title(checked)) {
              return pause('正常重播后网站仍显示' + text(checked.querySelector('.finished-icon')) + '：' + title(checked) + '。请核对网站学习记录；助手不会跳过此资源。');
            }
            retry = { path: location.pathname, title: title(checked) };
            try { sessionStorage.setItem(RETRY_KEY, JSON.stringify(retry)); }
            catch (_) { return pause('无法保存恢复状态，请手动打开未完成的视频。'); }
            endedKey = ''; endedSince = 0;
            openCard(checked);
            status('网站仍未确认完成，重新打开并正常播放一次：' + title(checked));
            return;
          }
        }
      }
      if (list.every(done)) return nextPoint();
      if (!active || done(active)) return openCard(list.find(e => !done(e)));
      const videoCard = isVideoCard(active);
      if (!videoCard) return pause('非视频资源：' + title(active) + '\n请按网站要求阅读或作答；网站确认已完成后自动继续。', key);
      if (!video) {
        if (!videoLoadingSince) videoLoadingSince = Date.now();
        if (Date.now() - videoLoadingSince > 20000) return pause('视频播放器加载超时，助手已暂停；请检查网页后点继续。');
        status('等待视频播放器加载：' + title(active));
        return;
      }
      videoLoadingSince = 0;
      // Reopening the same resource creates a fresh player but keeps the same
      // page/title key. Clear the previous end marker once that fresh player
      // has actually rewound, otherwise Start/Continue immediately pauses it.
      if (endedKey === key && !video.ended && Number.isFinite(video.duration) && video.currentTime < video.duration - 1) {
        endedKey = '';
        endedSince = 0;
      }
      if (video.ended || endedKey === key) {
        if (!endedSince) endedSince = Date.now();
        if (Date.now() - endedSince > 15000) {
          try {
            sessionStorage.setItem(RECHECK_KEY, JSON.stringify({path: location.pathname, title: title(active)}));
            writeEnabled(true);
            status('视频已真实结束，正在刷新一次核对网站完成记录…');
            location.reload();
          } catch (_) { pause('无法保存刷新核对状态，请手动刷新核对学习记录。'); }
          return;
        }
        status('视频已结束，等待网页写入完成状态：' + title(active));
        return;
      }
      if (video.playbackRate !== DESIRED_RATE) {
        const rateButton = document.querySelector('[rate="1.5"]');
        if (rateButton) rateButton.click();
        else video.playbackRate = DESIRED_RATE;
        status('已设为 1.5 倍速：' + title(active) + '\n等待页面确认已完成后切换。');
        return;
      }
      if (video.paused) {
        if (!resumeInFlight) {
          resumeInFlight = true;
          const attempt = video.play();
          if (attempt && typeof attempt.then === 'function') {
            attempt.then(() => { resumeInFlight = false; }).catch(() => {
              resumeInFlight = false;
              pause('视频自动恢复失败，可能需要浏览器允许播放；请本人点击播放后继续。');
            });
          } else {
            resumeInFlight = false;
          }
        }
        status('检测到视频暂停，正在自动恢复（1.5 倍速）：' + title(active));
        return;
      }
      status('运行中（1.5 倍速）：' + title(active) + '\n等待页面确认已完成后切换。');
    } catch (error) { pause('页面结构变化或读取失败，助手已暂停。'); }
  }
  ui.querySelector('#start').onclick = () => {
    awaitingDocument = '';
    enabled = true; writeEnabled(true); pending = null; endedKey = ''; endedSince = 0; resumeInFlight = false; loadingSince = Date.now(); tick();
  };
  ui.querySelector('#pause').onclick = () => pause('助手已暂停；当前视频可继续正常播放。');
  const timer = setInterval(tick, 1500);
  ui.querySelector('#stop').onclick = () => {
    pause('已停止'); stopped = true; clearInterval(timer); host.remove();
  };
  status(enabled ? '正在恢复本标签页的连续学习…' : '尚未开始。点击开始，等待真实完成状态。');
  tick();
})();

