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

const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');

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

async function getMediaInfo(mediaId) {
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
        resolve({
          blob: req.result.blob,
          fileName: req.result.fileName,
          mime: req.result.mime,
        });
      }
    };
    req.onerror = () => reject(req.error || new Error('读取媒体信息失败'));
  });
}

function getFileExtensionFromMime(mime, defaultExt) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
  };
  return mimeMap[mime] || defaultExt;
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

async function exportStory() {
  if (!storyState.pages.length) {
    alert('当前没有故事内容可导出');
    return;
  }

  try {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      pages: [],
    };

    const mediaFiles = [];

    for (let i = 0; i < storyState.pages.length; i += 1) {
      const page = storyState.pages[i];
      const pageData = {
        id: page.id,
        type: page.type,
        durationSec: page.durationSec || undefined,
      };

      if (page.type === 'text') {
        pageData.text = page.text;
      } else if (page.type === 'image' || page.type === 'video') {
        if (page.mediaId) {
          try {
            const mediaInfo = await getMediaInfo(page.mediaId);
            if (mediaInfo && mediaInfo.blob) {
              const ext = getFileExtensionFromMime(
                mediaInfo.mime,
                page.type === 'image' ? 'jpg' : 'mp4'
              );
              const fileName = `media_${page.id}.${ext}`;
              pageData.fileName = fileName;
              mediaFiles.push({
                fileName,
                blob: mediaInfo.blob,
                type: page.type,
              });
            } else {
              console.warn(`页面 ${page.id} 的媒体文件不存在`);
              if (page.url) {
                pageData.url = page.url;
              }
            }
          } catch (e) {
            console.error(`导出页面 ${page.id} 的媒体文件失败：`, e);
            if (page.url) {
              pageData.url = page.url;
            }
          }
        } else if (page.url) {
          pageData.url = page.url;
        }
      }

      exportData.pages.push(pageData);
    }

    const jsonStr = JSON.stringify(exportData, null, 2);
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });

    if (window.showDirectoryPicker) {
      try {
        console.log('开始导出，选择文件夹...');
        const dirHandle = await window.showDirectoryPicker();
        console.log('已选择文件夹：', dirHandle.name);

        console.log('写入 story.json...');
        const storyFileHandle = await dirHandle.getFileHandle('story.json', {
          create: true,
        });
        const writable = await storyFileHandle.createWritable();
        await writable.write(jsonBlob);
        await writable.close();
        console.log('story.json 写入完成');

        if (mediaFiles.length > 0) {
          console.log(`准备导出 ${mediaFiles.length} 个媒体文件...`);
          const materialsDirHandle = await dirHandle.getDirectoryHandle(
            'materials',
            { create: true }
          );

          for (let i = 0; i < mediaFiles.length; i += 1) {
            const media = mediaFiles[i];
            console.log(`导出媒体文件 ${i + 1}/${mediaFiles.length}: ${media.fileName}`);
            const fileHandle = await materialsDirHandle.getFileHandle(
              media.fileName,
              { create: true }
            );
            const writable = await fileHandle.createWritable();
            await writable.write(media.blob);
            await writable.close();
          }
          console.log('所有媒体文件导出完成');
        }

        alert(
          `导出成功！\n已保存到：${dirHandle.name}/story.json\n${
            mediaFiles.length > 0
              ? `媒体文件已保存到：${dirHandle.name}/materials/（共 ${mediaFiles.length} 个文件）`
              : '（无媒体文件）'
          }`
        );
      } catch (e) {
        if (e.name === 'AbortError') {
          console.log('用户取消了导出');
          return;
        }
        console.error('导出过程中出错：', e);
        throw e;
      }
    } else {
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const a = document.createElement('a');
      a.href = jsonUrl;
      a.download = 'story.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(jsonUrl);

      alert(
        `JSON 文件已下载。\n由于浏览器限制，媒体文件需要手动从 IndexedDB 导出。\n建议使用支持 File System Access API 的浏览器（如 Chrome 88+）以获得完整导出功能。`
      );
    }
  } catch (e) {
    console.error('导出失败：', e);
    alert(`导出失败：${e.message}`);
  }
}

async function importStory() {
  // 优先使用目录选择器，将 story.json 和 materials 当作一个整体导入
  if (window.showDirectoryPicker) {
    try {
      console.log('开始导入，选择文件夹...');
      const dirHandle = await window.showDirectoryPicker();
      console.log('已选择文件夹：', dirHandle.name);

      console.log('读取 story.json...');
      const storyFileHandle = await dirHandle.getFileHandle('story.json');
      const storyFile = await storyFileHandle.getFile();
      const text = await storyFile.text();
      const data = JSON.parse(text);
      console.log('story.json 解析完成，共', data.pages?.length || 0, '页');

      if (!Array.isArray(data.pages)) {
        throw new Error('无效的 story.json 文件格式');
      }

      if (
        !confirm(
          `确定要从该目录导入故事吗？\n这将替换当前的所有页面（共 ${data.pages.length} 页）。`
        )
      ) {
        return;
      }

      let materialsDirHandle = null;
      const hasFilePages = data.pages.some((p) => p.fileName);
      if (hasFilePages) {
        try {
          console.log('查找 materials 文件夹...');
          materialsDirHandle = await dirHandle.getDirectoryHandle('materials');
          console.log('找到 materials 文件夹');
        } catch (e) {
          console.warn('未找到 materials 文件夹，仅导入文字和 URL 页面。', e);
        }
      }

      const importedPages = [];
      let mediaLoadedCount = 0;
      let mediaFailedCount = 0;

      for (let i = 0; i < data.pages.length; i += 1) {
        const pageData = data.pages[i];
        console.log(`处理页面 ${i + 1}/${data.pages.length}: ${pageData.type}`);
        const page = {
          id: pageData.id || crypto.randomUUID(),
          type: pageData.type,
          durationSec: pageData.durationSec,
        };

        if (pageData.type === 'text') {
          page.text = pageData.text;
        } else if (pageData.type === 'image' || pageData.type === 'video') {
          if (pageData.fileName && materialsDirHandle) {
            try {
              console.log(`  加载媒体文件: ${pageData.fileName}`);
              const fileHandle = await materialsDirHandle.getFileHandle(
                pageData.fileName
              );
              const file = await fileHandle.getFile();
              const mediaId = await saveMediaFile(file, pageData.type);
              page.mediaId = mediaId;
              mediaLoadedCount += 1;
              console.log(`  ✓ 媒体文件加载成功`);
            } catch (err) {
              console.warn(
                `  ✗ 无法加载媒体文件 ${pageData.fileName}：`,
                err
              );
              mediaFailedCount += 1;
              if (pageData.url) {
                page.url = pageData.url;
                console.log(`  使用备用 URL`);
              }
            }
          } else if (pageData.url) {
            // 没有 materials 或找不到文件时，退回使用远程 URL
            page.url = pageData.url;
            console.log(`  使用 URL: ${pageData.url}`);
          } else if (pageData.fileName && !materialsDirHandle) {
            console.warn(`  页面需要媒体文件 ${pageData.fileName}，但未找到 materials 文件夹`);
          }
        }

        importedPages.push(page);
      }

      storyState.pages = importedPages;
      storyState.currentIndex = 0;
      saveStoryToStorage();
      syncFormWithCurrentPage();
      renderPage();

      console.log('导入完成');
      const mediaSummary =
        mediaLoadedCount > 0 || mediaFailedCount > 0
          ? `\n媒体文件：成功 ${mediaLoadedCount} 个${
              mediaFailedCount > 0 ? `，失败 ${mediaFailedCount} 个` : ''
            }`
          : '';
      alert(
        `导入成功！\n共导入 ${importedPages.length} 个页面。${mediaSummary}\n来源目录：${dirHandle.name}`
      );
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('用户取消了导入');
        return;
      }
      console.error('导入失败：', e);
      alert(`导入失败：${e.message}\n\n请检查：\n1. 是否选择了包含 story.json 的文件夹\n2. story.json 格式是否正确\n3. 浏览器控制台查看详细错误信息`);
    }
  } else {
    // 旧浏览器降级为仅通过 JSON 文件导入（无法自动导入本地媒体文件）
    importFileInput.click();
  }
}

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data.pages)) {
      throw new Error('无效的故事文件格式');
    }

    if (
      !confirm(
        `确定要导入这个故事吗？\n这将替换当前的所有页面（共 ${data.pages.length} 页）。`
      )
    ) {
      importFileInput.value = '';
      return;
    }

    const importedPages = [];

    for (const pageData of data.pages) {
      const page = {
        id: pageData.id || crypto.randomUUID(),
        type: pageData.type,
        durationSec: pageData.durationSec,
      };

      if (pageData.type === 'text') {
        page.text = pageData.text;
      } else if (pageData.type === 'image' || pageData.type === 'video') {
        if (pageData.fileName) {
          // 通过单独 JSON 导入时，无法自动从本地文件夹读取媒体文件，
          // 这里只能提示用户稍后在编辑器中手动重新上传对应媒体。
          alert(
            `页面 "${pageData.fileName}" 关联了本地媒体文件。\n通过单独 JSON 导入时无法自动恢复本地媒体，请稍后在编辑器中手动重新上传。`
          );
          if (pageData.url) {
            page.url = pageData.url;
          }
        } else if (pageData.url) {
          page.url = pageData.url;
        }
      }

      importedPages.push(page);
    }

    storyState.pages = importedPages;
    storyState.currentIndex = 0;
    saveStoryToStorage();
    syncFormWithCurrentPage();
    renderPage();

    alert(`导入成功！共导入 ${importedPages.length} 个页面。`);
  } catch (e) {
    console.error('导入失败：', e);
    alert(`导入失败：${e.message}`);
  } finally {
    importFileInput.value = '';
  }
});

if (exportBtn) {
  exportBtn.addEventListener('click', exportStory);
}

if (importBtn) {
  importBtn.addEventListener('click', importStory);
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

