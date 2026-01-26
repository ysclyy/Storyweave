const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const MATERIALS_DIR = path.join(__dirname, 'materials');
const STORY_JSON_FILE = path.join(MATERIALS_DIR, 'story.json');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 提供静态文件服务
app.use('/materials', express.static(MATERIALS_DIR)); // 提供 materials 文件夹的静态服务

// 确保 materials 文件夹存在
async function ensureMaterialsDir() {
  try {
    await fs.mkdir(MATERIALS_DIR, { recursive: true });
    console.log('materials 文件夹已准备就绪');
  } catch (error) {
    console.error('创建 materials 文件夹失败：', error);
  }
}

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureMaterialsDir();
    cb(null, MATERIALS_DIR);
  },
  filename: (req, file, cb) => {
    // 保持原始文件名或使用 UUID
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 9);
    cb(null, `${name}_${timestamp}_${randomStr}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB 限制
  }
});

// API: 读取 story.json
app.get('/api/story', async (req, res) => {
  try {
    const data = await fs.readFile(STORY_JSON_FILE, 'utf-8');
    const story = JSON.parse(data);
    res.json(story);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 文件不存在，返回空故事
      res.json({ version: '1.0', pages: [] });
    } else {
      console.error('读取 story.json 失败：', error);
      res.status(500).json({ error: '读取故事数据失败' });
    }
  }
});

// API: 保存 story.json
app.post('/api/story', async (req, res) => {
  try {
    await ensureMaterialsDir();
    const storyData = req.body;
    
    // 验证数据格式
    if (!storyData.pages || !Array.isArray(storyData.pages)) {
      return res.status(400).json({ error: '无效的故事数据格式' });
    }

    // 添加更新时间
    storyData.updatedAt = new Date().toISOString();
    if (!storyData.version) {
      storyData.version = '1.0';
    }

    // 保存到文件
    await fs.writeFile(STORY_JSON_FILE, JSON.stringify(storyData, null, 2), 'utf-8');
    
    console.log(`story.json 已保存，共 ${storyData.pages.length} 个页面`);
    res.json({ success: true, message: '故事数据已保存' });
  } catch (error) {
    console.error('保存 story.json 失败：', error);
    res.status(500).json({ error: '保存故事数据失败' });
  }
});

// API: 上传媒体文件
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const fileName = req.file.filename;
    const filePath = `/materials/${fileName}`;
    
    console.log(`媒体文件已上传：${fileName}`);
    res.json({ 
      success: true, 
      fileName: fileName,
      filePath: filePath,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('上传文件失败：', error);
    res.status(500).json({ error: '上传文件失败' });
  }
});

// 启动服务器
async function startServer() {
  await ensureMaterialsDir();
  
  app.listen(PORT, () => {
    console.log(`\n服务器已启动！`);
    console.log(`访问地址: http://localhost:${PORT}`);
    console.log(`API 文档:`);
    console.log(`  GET  /api/story      - 读取故事数据`);
    console.log(`  POST /api/story      - 保存故事数据`);
    console.log(`  POST /api/upload     - 上传媒体文件`);
    console.log(`\nmaterials 文件夹: ${MATERIALS_DIR}\n`);
  });
}

startServer().catch(console.error);
