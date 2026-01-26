const SETTINGS_KEY = 'storyweave-settings-v1';
const MATERIALS_DIR = 'materials'; // 静态服务中的 materials 文件夹路径
const STORY_JSON_FILE = 'story.json'; // story.json 文件名

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

// 导入导出功能已移除

let pendingLocalMedia = null; // { filePath, type, fileName }

// 通过 API 上传文件到服务器并返回相对路径
async function saveMediaFile(file, type) {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '上传文件失败');
    }

    const result = await response.json();
    console.log(`文件已上传到服务器：${result.fileName}`);
    
    return result.filePath; // 返回 /materials/filename
  } catch (error) {
    console.error('上传文件失败：', error);
    throw error;
  }
}

// 获取媒体文件的完整 URL 路径
function getMediaUrl(filePath) {
  if (!filePath) return null;
  // 如果是绝对 URL（http/https），直接返回
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  // 相对路径，确保以 / 开头（相对于网站根目录）
  return filePath.startsWith('/') ? filePath : `/${filePath}`;
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

// 通过 API 保存故事数据到服务器
async function saveStoryToFile() {
  try {
    const payload = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      pages: storyState.pages.map((p) => {
        const pageData = {
          id: p.id,
          type: p.type,
          durationSec: p.durationSec || undefined,
        };

        if (p.type === 'text') {
          pageData.text = p.text;
        } else if (p.type === 'image' || p.type === 'video') {
          if (p.filePath) {
            // 只保存文件名（相对路径）
            const fileName = p.filePath.split('/').pop();
            pageData.fileName = fileName;
          }
          if (p.url) {
            pageData.url = p.url;
          }
        }

        return pageData;
      }),
    };

    const response = await fetch('/api/story', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '保存失败');
    }

    const result = await response.json();
    console.log('story.json 已保存到服务器');
  } catch (error) {
    console.error('保存 story.json 失败：', error);
    alert(`保存失败：${error.message}`);
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

// 通过 API 从服务器读取故事数据
async function loadStoryFromFile() {
  try {
    const response = await fetch('/api/story');
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('未找到 story.json，将使用默认故事');
        return false;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // 如果返回的是空故事（没有页面），返回 false
    if (!data.pages || !Array.isArray(data.pages) || data.pages.length === 0) {
      console.log('story.json 为空，将使用默认故事');
      return false;
    }

    // 解析页面数据
    storyState.pages = data.pages.map((p) => {
      const page = {
        id: p.id || crypto.randomUUID(),
        type: p.type,
        durationSec: p.durationSec,
      };

      if (p.type === 'text') {
        page.text = p.text;
      } else if (p.type === 'image' || p.type === 'video') {
        if (p.fileName) {
          // 构建相对路径
          page.filePath = `${MATERIALS_DIR}/${p.fileName}`;
        }
        if (p.url) {
          page.url = p.url;
        }
      }

      return page;
    });

    storyState.currentIndex = 0; // 重置到第一页
    console.log(`已从服务器加载 ${storyState.pages.length} 个页面`);
    return true;
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('Failed to fetch')) {
      console.log('无法连接到服务器或未找到 story.json，将使用默认故事');
      return false;
    }
    console.warn('读取 story.json 失败：', error);
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
    if (page.filePath) {
      img.src = getMediaUrl(page.filePath);
    } else if (page.url) {
      img.src = page.url;
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
    video.muted = false; // 允许音频播放
    let srcUrl = null;
    if (page.filePath) {
      srcUrl = getMediaUrl(page.filePath);
    } else if (page.url) {
      srcUrl = page.url;
    }
    if (srcUrl) {
      const source = document.createElement('source');
      source.src = srcUrl;
      source.type = 'video/mp4';
      video.appendChild(source);
    }
    // 视频加载完成后自动播放
    video.addEventListener(
      'canplay',
      () => {
        video
          .play()
          .catch((err) => {
            // 如果自动播放被阻止（浏览器策略），提示用户
            console.warn('视频自动播放被阻止，需要用户交互：', err);
            // 可以显示一个提示，让用户点击播放
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
      if (nextPage.filePath) {
        img.src = getMediaUrl(nextPage.filePath);
      } else if (nextPage.url) {
        img.src = nextPage.url;
      }
    } else if (nextPage.type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata'; // 预加载元数据即可，不预加载整个视频
      video.muted = false;
      let srcUrl = null;
      if (nextPage.filePath) {
        srcUrl = getMediaUrl(nextPage.filePath);
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
  // 翻页不需要保存 story.json（只有编辑内容时才保存）
  renderPage();
}

function goToPrev() {
  if (!storyState.pages.length) return;
  storyState.currentIndex =
    (storyState.currentIndex - 1 + storyState.pages.length) %
    storyState.pages.length;
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  // 翻页不需要保存 story.json（只有编辑内容时才保存）
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
    textContentLabel.classList.remove('hidden');
    mediaUrlLabel.classList.remove('hidden');
    // 切换类型时，如果有 pendingLocalMedia，保持显示
    if (!pendingLocalMedia) {
      mediaUrlInput.value = '';
      mediaUrlInput.style.color = ''; // 重置颜色
    }
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
    url: undefined,
    durationSec,
  };

  // 优先使用 pendingLocalMedia（本地文件）
  if (pendingLocalMedia && pendingLocalMedia.type === type) {
    result.filePath = pendingLocalMedia.filePath;
  } else {
    // 否则使用 URL（如果输入框中的值不是显示文本）
    const urlValue = mediaUrlInput.value.trim();
    // 检查是否是显示文本（以 [ 开头），如果不是则作为 URL
    if (urlValue && !urlValue.startsWith('[')) {
      result.url = urlValue;
    }
  }

  return result;
}

addPageBtn.addEventListener('click', async () => {
  const form = readPageForm();

  if (form.type === 'text' && !form.text) {
    alert('请填写文字内容');
    return;
  }
  if (
    (form.type === 'image' || form.type === 'video') &&
    !form.url &&
    !form.filePath
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
  await saveStoryToFile();
  pendingLocalMedia = null;
  renderPage();
});

replaceCurrentBtn.addEventListener('click', async () => {
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
    !form.filePath
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
  await saveStoryToFile();
  pendingLocalMedia = null;
  renderPage();
});

deleteCurrentBtn.addEventListener('click', async () => {
  if (!storyState.pages.length) return;
  if (!confirm('确定要删除当前页面吗？')) return;

  storyState.pages.splice(storyState.currentIndex, 1);
  if (storyState.currentIndex >= storyState.pages.length) {
    storyState.currentIndex = Math.max(0, storyState.pages.length - 1);
  }
  syncFormWithCurrentPage();
  restartAutoPlayTimer();
  await saveStoryToFile();
  renderPage();
});

mediaFileInput.addEventListener('change', async () => {
  const file = mediaFileInput.files && mediaFileInput.files[0];
  if (!file) {
    pendingLocalMedia = null;
    mediaUrlInput.style.color = ''; // 重置颜色
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
    const filePath = await saveMediaFile(file, pageType);
    pendingLocalMedia = {
      filePath,
      type: pageType,
      fileName: file.name,
    };
    // 在输入框中显示文件信息，让用户知道文件已选择
    mediaUrlInput.value = `[已选择] ${file.name} (${filePath})`;
    mediaUrlInput.style.color = '#4CAF50'; // 绿色表示已选择
    console.log(`文件已保存到 materials 文件夹：${filePath}`);
    } catch (error) {
    console.error(error);
    alert(`上传文件失败：${error.message}\n\n请确保：\n1. 后端服务器正在运行（npm start）\n2. 或者直接使用 URL 方式`);
    pendingLocalMedia = null;
    mediaUrlInput.style.color = ''; // 重置颜色
    mediaFileInput.value = '';
  }
});

function syncFormWithCurrentPage() {
  const page = storyState.pages[storyState.currentIndex];
  if (!page) {
    textContentInput.value = '';
    mediaUrlInput.value = '';
    mediaUrlInput.style.color = ''; // 重置颜色
    pageDurationInput.value = '';
    return;
  }

  pageTypeSelect.value = page.type;
  if (page.type === 'text') {
    textContentLabel.classList.remove('hidden');
    mediaUrlLabel.classList.add('hidden');
    textContentInput.value = page.text || '';
    mediaUrlInput.value = '';
    mediaUrlInput.style.color = ''; // 重置颜色
  } else {
    textContentLabel.classList.add('hidden');
    mediaUrlLabel.classList.remove('hidden');
    // 如果有 filePath，显示文件路径；否则显示 URL
    if (page.filePath) {
      mediaUrlInput.value = `[本地文件] ${page.filePath}`;
      mediaUrlInput.style.color = '#4CAF50'; // 绿色表示本地文件
    } else {
      mediaUrlInput.value = page.url || '';
      mediaUrlInput.style.color = ''; // 默认颜色
    }
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

// 导入导出功能已移除 - 故事数据直接从 materials/story.json 读取和保存

async function init() {
  // 直接从 HTTP 读取 materials/story.json
  const loaded = await loadStoryFromFile();
  if (!loaded) {
    initSampleStory();
    console.log('使用默认故事，编辑后可通过下载保存到 materials 文件夹');
  }
  
  loadSettingsFromStorage();
  autoPlayToggle.checked = storyState.autoPlay;
  autoPlayIntervalInput.value = storyState.autoPlayIntervalSec;
  syncFormWithCurrentPage();
  renderPage();
}

init();

