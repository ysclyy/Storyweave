const STORAGE_KEY = 'storyweave-story-v1';
const SETTINGS_KEY = 'storyweave-settings-v1';
const DB_NAME = 'storyweave-media-db';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';

const storyState = {
  pages: [],
  currentIndex: 0,
  autoPlay: false,
  autoPlayIntervalSec: 5,
  timerId: null,
};

const storyFrame = document.getElementById('storyFrame');
const storySlide = document.getElementById('storySlide');
const pageIndicator = document.getElementById('pageIndicator');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const ratioButtons = document.querySelectorAll('.ratio-btn');

const autoPlayToggle = document.getElementById('autoPlayToggle');
const autoPlayIntervalInput = document.getElementById('autoPlayInterval');

const textSizeControl = document.getElementById('textSizeControl');

const pageTypeSelect = document.getElementById('pageType');
const textContentLabel = document.getElementById('textContentLabel');
const textContentInput = document.getElementById('textContent');
const mediaUrlLabel = document.getElementById('mediaUrlLabel');
const mediaUrlInput = document.getElementById('mediaUrl');
const pageDurationInput = document.getElementById('pageDuration');

const addPageBtn = document.getElementById('addPageBtn');
const replaceCurrentBtn = document.getElementById('replaceCurrentBtn');
const deleteCurrentBtn = document.getElementById('deleteCurrentBtn');
const pageList = document.getElementById('pageList');

const mediaFileInput = document.getElementById('mediaFile');

let pendingLocalMedia = null; // { id, type, fileName }

function openMediaDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持 IndexedDB，本地文件将无法持久保存。'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error || new Error('打开数据库失败'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveMediaFile(file, type) {
  const id = crypto.randomUUID();
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const data = {
      id,
      type,
      fileName: file.name,
      mime: file.type,
      createdAt: Date.now(),
      blob: file,
    };
    const req = store.add(data);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error || new Error('保存媒体失败'));
  });
}

async function getMediaBlob(mediaId) {
  if (!mediaId) return null;
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_STORE);
    const req = store.get(mediaId);
    req.onsuccess = () => {
      if (!req.result) {
        resolve(null);
      } else {
        resolve(req.result.blob || null);
      }
    };
    req.onerror = () => reject(req.error || new Error('读取媒体失败'));
  });
}

function saveStoryToStorage() {
  try {
    const payload = {
      pages: storyState.pages.map((p) => ({
        id: p.id,
        type: p.type,
        text: p.text || undefined,
        url: p.url || undefined,
        mediaId: p.mediaId || undefined,
        durationSec: p.durationSec || undefined,
      })),
      currentIndex: storyState.currentIndex,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('保存故事数据到本地失败：', e);
  }
}

function saveSettingsToStorage() {
  try {
    const payload = {
      autoPlay: storyState.autoPlay,
      autoPlayIntervalSec: storyState.autoPlayIntervalSec,
      textSize: textSizeControl
        ? Number(textSizeControl.value) || 18
        : 18,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('保存设置到本地失败：', e);
  }
}

function loadStoryFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.pages)) return false;
    storyState.pages = data.pages.map((p) => ({
      id: p.id || crypto.randomUUID(),
      type: p.type,
      text: p.text,
      url: p.url,
      mediaId: p.mediaId,
      durationSec: p.durationSec,
    }));
    storyState.currentIndex =
      typeof data.currentIndex === 'number'
        ? Math.min(Math.max(0, data.currentIndex), storyState.pages.length - 1)
        : 0;
    return true;
  } catch (e) {
    console.warn('读取本地故事数据失败：', e);
    return false;
  }
}

function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.autoPlay === 'boolean') {
      storyState.autoPlay = data.autoPlay;
    }
    if (typeof data.autoPlayIntervalSec === 'number') {
      storyState.autoPlayIntervalSec = data.autoPlayIntervalSec;
    }
    if (typeof data.textSize === 'number' && textSizeControl) {
      textSizeControl.value = String(data.textSize);
      document.documentElement.style.setProperty(
        '--story-text-size',
        `${data.textSize}px`
      );
    }
  } catch (e) {
    console.warn('读取本地设置失败：', e);
  }
}

function initSampleStory() {
  if (storyState.pages.length) return;

  storyState.pages = [
    {
      id: crypto.randomUUID(),
      type: 'text',
      text: '欢迎来到 Storyweave。\n\n向左滑动或点击下一页按钮，开始你的故事旅程。',
      durationSec: 5,
    },
  ];

  storyState.currentIndex = 0;
}

async function renderPage() {
  const page = storyState.pages[storyState.currentIndex];
  storySlide.innerHTML = '';

  if (!page) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'slide-inner';
    emptyDiv.textContent = '还没有任何页面，请在右侧编辑器中添加。';
    storySlide.appendChild(emptyDiv);
    renderPageIndicator();
    renderPageList();
    return;
  }

  const slideInner = document.createElement('div');
  slideInner.className = 'slide-inner';

  if (page.type === 'text') {
    const textBox = document.createElement('div');
    textBox.className = 'slide-text';
    textBox.innerText = page.text || '';
    slideInner.appendChild(textBox);
  } else if (page.type === 'image') {
    const wrapper = document.createElement('div');
    wrapper.className = 'slide-media';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '故事图片';
    try {
      if (page.mediaId) {
        const blob = await getMediaBlob(page.mediaId);
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          img.src = objectUrl;
        }
      } else if (page.url) {
        img.src = page.url;
      }
    } catch (e) {
      console.warn('加载本地图片失败：', e);
    }
    wrapper.appendChild(img);
    slideInner.appendChild(wrapper);
  } else if (page.type === 'video') {
    const wrapper = document.createElement('div');
    wrapper.className = 'slide-media';
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;
    try {
      let srcUrl = null;
      if (page.mediaId) {
        const blob = await getMediaBlob(page.mediaId);
        if (blob) {
          srcUrl = URL.createObjectURL(blob);
        }
      } else if (page.url) {
        srcUrl = page.url;
      }
      if (srcUrl) {
        const source = document.createElement('source');
        source.src = srcUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
      }
    } catch (e) {
      console.warn('加载本地视频失败：', e);
    }
    video.addEventListener(
      'canplay',
      () => {
        video
          .play()
          .catch(() => {
            // 忽略自动播放被阻止的错误
          });
      },
      { once: true }
    );
    wrapper.appendChild(video);
    slideInner.appendChild(wrapper);
  }

  storySlide.appendChild(slideInner);

  preloadNextMedia();
  renderPageIndicator();
  renderPageList();
}

function renderPageIndicator() {
  pageIndicator.innerHTML = '';
  const total = storyState.pages.length;
  if (!total) return;

  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement('div');
    dot.className = 'page-dot';
    if (i === storyState.currentIndex) {
      dot.classList.add('active');
      const fill = document.createElement('div');
      fill.className = 'page-dot-active-fill';
      dot.appendChild(fill);

      const durationMs = (getCurrentDurationSec() || storyState.autoPlayIntervalSec) * 1000;
      if (storyState.autoPlay) {
        requestAnimationFrame(() => {
          fill.style.transition = `transform ${durationMs}ms linear`;
          fill.style.transform = 'scaleX(1)';
        });
      }
    }
    pageIndicator.appendChild(dot);
  }
}

function renderPageList() {
  pageList.innerHTML = '';

  storyState.pages.forEach((page, index) => {
    const li = document.createElement('li');
    li.className = 'page-item';
    if (index === storyState.currentIndex) {
      li.classList.add('active');
    }

    const main = document.createElement('div');
    main.className = 'page-item-main';

    const indexPill = document.createElement('div');
    indexPill.className = 'page-index-pill';
    indexPill.textContent = index + 1;

    const typePill = document.createElement('div');
    typePill.className = 'page-type-pill';
    typePill.textContent =
      page.type === 'text' ? '文字' : page.type === 'image' ? '图片' : '视频';

    main.appendChild(indexPill);
    main.appendChild(typePill);

    const meta = document.createElement('div');
    meta.className = 'page-meta';
    const durationText = page.durationSec
      ? `${page.durationSec}s`
      : `${storyState.autoPlayIntervalSec}s(全局)`;
    meta.textContent = durationText;

    li.appendChild(main);
    li.appendChild(meta);

    li.addEventListener('click', () => {
      storyState.currentIndex = index;
      syncFormWithCurrentPage();
      restartAutoPlayTimer();
      renderPage();
    });

    pageList.appendChild(li);
  });
}

function getCurrentDurationSec() {
  const page = storyState.pages[storyState.currentIndex];
  return page?.durationSec;
}

async function preloadNextMedia() {
  const nextIndex =
    storyState.pages.length > 0
      ? (storyState.currentIndex + 1) % storyState.pages.length
      : 0;
  const nextPage = storyState.pages[nextIndex];
  if (!nextPage) return;

  try {
    if (nextPage.type === 'image') {
      const img = new Image();
      img.loading = 'lazy';
      if (nextPage.mediaId) {
        const blob = await getMediaBlob(nextPage.mediaId);
        if (blob) {
          img.src = URL.createObjectURL(blob);
        }
      } else if (nextPage.url) {
        img.src = nextPage.url;
      }
    } else if (nextPage.type === 'video') {
      const video = document.createElement('video');
      video.preload = 'auto';
      let srcUrl = null;
      if (nextPage.mediaId) {
        const blob = await getMediaBlob(nextPage.mediaId);
        if (blob) {
          srcUrl = URL.createObjectURL(blob);
        }
      } else if (nextPage.url) {
        srcUrl = nextPage.url;
      }
      if (srcUrl) {
        const source = document.createElement('source');
        source.src = srcUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
      }
    }
  } catch (e) {
    console.warn('预加载媒体失败：', e);
  }
}

function goToNext() {
  if (!storyState.pages.length) return;
  storyState.currentIndex =
    (storyState.currentIndex + 1) % storyState.pages.length;
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  saveStoryToStorage();
  renderPage();
}

function goToPrev() {
  if (!storyState.pages.length) return;
  storyState.currentIndex =
    (storyState.currentIndex - 1 + storyState.pages.length) %
    storyState.pages.length;
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  saveStoryToStorage();
  renderPage();
}

prevBtn.addEventListener('click', () => {
  goToPrev();
});
nextBtn.addEventListener('click', () => {
  goToNext();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    goToNext();
  } else if (e.key === 'ArrowLeft') {
    goToPrev();
  }
});

let touchStartX = 0;
let touchStartY = 0;

storyFrame.addEventListener(
  'touchstart',
  (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  },
  { passive: true }
);

storyFrame.addEventListener(
  'touchend',
  (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
      if (dx < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  },
  { passive: true }
);

ratioButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    ratioButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const ratio = btn.getAttribute('data-ratio');
    if (ratio === 'pc') {
      storyFrame.classList.remove('mobile');
      storyFrame.classList.add('pc');
    } else {
      storyFrame.classList.remove('pc');
      storyFrame.classList.add('mobile');
    }
  });
});

autoPlayToggle.addEventListener('change', () => {
  storyState.autoPlay = autoPlayToggle.checked;
  restartAutoPlayTimer();
  saveSettingsToStorage();
  renderPageIndicator();
});

autoPlayIntervalInput.addEventListener('change', () => {
  const value = Number(autoPlayIntervalInput.value);
  if (Number.isFinite(value) && value > 0) {
    storyState.autoPlayIntervalSec = value;
    restartAutoPlayTimer();
    saveSettingsToStorage();
    renderPageIndicator();
  } else {
    autoPlayIntervalInput.value = storyState.autoPlayIntervalSec;
  }
});

if (textSizeControl) {
  textSizeControl.addEventListener('input', () => {
    const value = Number(textSizeControl.value);
    if (!Number.isFinite(value)) return;
    document.documentElement.style.setProperty(
      '--story-text-size',
      `${value}px`
    );
    saveSettingsToStorage();
  });
}

pageTypeSelect.addEventListener('change', () => {
  const type = pageTypeSelect.value;
  if (type === 'text') {
    textContentLabel.classList.remove('hidden');
    mediaUrlLabel.classList.add('hidden');
  } else {
    textContentLabel.classList.add('hidden');
    mediaUrlLabel.classList.remove('hidden');
  }
});

function readPageForm() {
  const type = pageTypeSelect.value;
  const durationSec = Number(pageDurationInput.value) || undefined;

  if (type === 'text') {
    return {
      type,
      text: textContentInput.value.trim(),
      durationSec,
    };
  }

  const result = {
    type,
    url: mediaUrlInput.value.trim(),
    durationSec,
  };

  if (pendingLocalMedia && pendingLocalMedia.type === type) {
    result.mediaId = pendingLocalMedia.id;
    result.url = undefined;
  }

  return result;
}

addPageBtn.addEventListener('click', () => {
  const form = readPageForm();

  if (form.type === 'text' && !form.text) {
    alert('请填写文字内容');
    return;
  }
  if (
    (form.type === 'image' || form.type === 'video') &&
    !form.url &&
    !form.mediaId
  ) {
    alert('请填写图片 / 视频 URL 或选择本地文件');
    return;
  }

  const newPage = {
    id: crypto.randomUUID(),
    ...form,
  };

  storyState.pages.push(newPage);
  storyState.currentIndex = storyState.pages.length - 1;
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  saveStoryToStorage();
  pendingLocalMedia = null;
  renderPage();
});

replaceCurrentBtn.addEventListener('click', () => {
  if (!storyState.pages.length) {
    alert('当前没有页面，请先添加。');
    return;
  }

  const form = readPageForm();
  if (form.type === 'text' && !form.text) {
    alert('请填写文字内容');
    return;
  }
  if (
    (form.type === 'image' || form.type === 'video') &&
    !form.url &&
    !form.mediaId
  ) {
    alert('请填写图片 / 视频 URL 或选择本地文件');
    return;
  }

  const currentPage = storyState.pages[storyState.currentIndex];
  storyState.pages[storyState.currentIndex] = {
    ...currentPage,
    ...form,
  };
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  saveStoryToStorage();
  pendingLocalMedia = null;
  renderPage();
});

deleteCurrentBtn.addEventListener('click', () => {
  if (!storyState.pages.length) return;
  if (!confirm('确定要删除当前页面吗？')) return;

  storyState.pages.splice(storyState.currentIndex, 1);
  if (storyState.currentIndex >= storyState.pages.length) {
    storyState.currentIndex = Math.max(0, storyState.pages.length - 1);
  }
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  saveStoryToStorage();
  renderPage();
});

mediaFileInput.addEventListener('change', async () => {
  const file = mediaFileInput.files && mediaFileInput.files[0];
  if (!file) {
    pendingLocalMedia = null;
    return;
  }
  const currentType = pageTypeSelect.value;
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    alert('仅支持图片或视频文件');
    mediaFileInput.value = '';
    pendingLocalMedia = null;
    return;
  }

  const pageType = isImage ? 'image' : 'video';
  if (currentType !== pageType) {
    pageTypeSelect.value = pageType;
    if (pageType === 'text') {
      textContentLabel.classList.remove('hidden');
      mediaUrlLabel.classList.add('hidden');
    } else {
      textContentLabel.classList.add('hidden');
      mediaUrlLabel.classList.remove('hidden');
    }
  }

  try {
    const id = await saveMediaFile(file, pageType);
    pendingLocalMedia = {
      id,
      type: pageType,
      fileName: file.name,
    };
    mediaUrlInput.value = '';
  } catch (e) {
    console.error(e);
    alert('保存本地文件失败，可能是浏览器不支持或存储空间不足。');
    pendingLocalMedia = null;
    mediaFileInput.value = '';
  }
});

function syncFormWithCurrentPage() {
  const page = storyState.pages[storyState.currentIndex];
  if (!page) {
    textContentInput.value = '';
    mediaUrlInput.value = '';
    pageDurationInput.value = '';
    return;
  }

  pageTypeSelect.value = page.type;
  if (page.type === 'text') {
    textContentLabel.classList.remove('hidden');
    mediaUrlLabel.classList.add('hidden');
    textContentInput.value = page.text || '';
    mediaUrlInput.value = '';
  } else {
    textContentLabel.classList.add('hidden');
    mediaUrlLabel.classList.remove('hidden');
    mediaUrlInput.value = page.url || '';
    textContentInput.value = '';
  }

  pageDurationInput.value = page.durationSec || '';
}

function restartAutoPlayTimer() {
  if (storyState.timerId !== null) {
    clearTimeout(storyState.timerId);
    storyState.timerId = null;
  }
  if (!storyState.autoPlay || !storyState.pages.length) return;

  const durationSec = getCurrentDurationSec() || storyState.autoPlayIntervalSec;
  storyState.timerId = window.setTimeout(() => {
    goToNext();
  }, durationSec * 1000);
}

function init() {
  loadSettingsFromStorage();
  const loaded = loadStoryFromStorage();
  if (!loaded) {
    initSampleStory();
  }
  autoPlayToggle.checked = storyState.autoPlay;
  autoPlayIntervalInput.value = storyState.autoPlayIntervalSec;
  syncFormWithCurrentPage();
  renderPage();
}

init();

