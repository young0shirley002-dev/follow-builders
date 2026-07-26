#!/usr/bin/env node
/**
 * 企微群推送脚本
 * 读取 follow-builders 的 feed 数据，格式化为企微 Markdown 消息并推送到群
 */

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ 错误: 未设置 WECHAT_WEBHOOK_URL 环境变量');
  console.error('请在 GitHub Secrets 中配置 WECHAT_WEBHOOK_URL');
  process.exit(1);
}

// ========== 读取 Feed 数据 ==========
function loadFeed(filename) {
  const filePath = path.join(__dirname, '..', filename);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.warn(`⚠️  无法读取 ${filename}: ${e.message}`);
    return null;
  }
}

// ========== 格式化为企微 Markdown ==========
function formatDigest() {
  const feedX = loadFeed('feed-x.json');
  const feedPodcasts = loadFeed('feed-podcasts.json');
  const feedBlogs = loadFeed('feed-blogs.json');
  const stateFeed = loadFeed('state-feed.json');

  // 获取日期
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  let content = `### 🤖 AI Builders 每日摘要\n`;
  content += `> **${today}**\n\n`;

  // X/Twitter 动态
  if (feedX && Array.isArray(feedX) && feedX.length > 0) {
    content += `#### 📱 X/Twitter 热门动态\n\n`;
    const topPosts = feedX.slice(0, 8); // 取前8条
    topPosts.forEach((post, i) => {
      const author = post.author || post.username || '未知';
      const text = (post.text || post.content || '').substring(0, 150);
      const url = post.url || post.link || '';
      content += `${i + 1}. **${author}**: ${text}${text.length >= 150 ? '...' : ''}\n`;
      if (url) content += `   🔗 [查看原文](${url})\n`;
    });
    content += `\n`;
  }

  // 播客更新
  if (feedPodcasts && Array.isArray(feedPodcasts) && feedPodcasts.length > 0) {
    content += `#### 🎙️ 播客更新\n\n`;
    feedPodcasts.slice(0, 5).forEach((podcast, i) => {
      const title = podcast.title || podcast.name || '未知标题';
      const show = podcast.show || podcast.podcast || '';
      const summary = (podcast.summary || podcast.description || '').substring(0, 120);
      const url = podcast.url || podcast.link || '';
      content += `${i + 1}. **${title}** ${show ? `(${show})` : ''}\n`;
      content += `   > ${summary}${summary.length >= 120 ? '...' : ''}\n`;
      if (url) content += `   🔗 [收听](${url})\n`;
    });
    content += `\n`;
  }

  // 博客文章
  if (feedBlogs && Array.isArray(feedBlogs) && feedBlogs.length > 0) {
    content += `#### 📝 博客精选\n\n`;
    feedBlogs.slice(0, 5).forEach((blog, i) => {
      const title = blog.title || '未知标题';
      const source = blog.source || blog.blog || '';
      const summary = (blog.summary || blog.description || blog.excerpt || '').substring(0, 120);
      const url = blog.url || blog.link || '';
      content += `${i + 1}. **${title}** ${source ? `(${source})` : ''}\n`;
      content += `   > ${summary}${summary.length >= 120 ? '...' : ''}\n`;
      if (url) content += `   🔗 [阅读](${url})\n`;
    });
    content += `\n`;
  }

  // 统计信息
  const stats = [];
  if (feedX?.length) stats.push(`X动态 ${feedX.length} 条`);
  if (feedPodcasts?.length) stats.push(`播客 ${feedPodcasts.length} 期`);
  if (feedBlogs?.length) stats.push(`博客 ${feedBlogs.length} 篇`);
  if (stats.length > 0) {
    content += `---\n📊 今日统计: ${stats.join(' | ')}`;
  }

  content += `\n\n> 由 **Follow Builders** 自动生成 | [GitHub](https://github.com/zarazhangrui/follow-builders)`;

  return content;
}

// ========== 推送到企微 ==========
async function pushToWechat(markdownContent) {
  const payload = {
    msgtype: 'markdown',
    markdown: {
      content: markdownContent
    }
  };

  console.log('📤 正在推送到企微群...');
  console.log(`--- 消息预览 ---`);
  console.log(markdownContent.substring(0, 500) + '...');
  console.log(`---`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.errcode === 0) {
      console.log('✅ 推送成功！');
    } else {
      console.error(`❌ 推送失败: ${result.errcode} - ${result.errmsg}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ 请求失败: ${error.message}`);
    process.exit(1);
  }
}

// ========== 主流程 ==========
async function main() {
  console.log('🚀 开始生成 AI Builders 摘要...\n');

  const digest = formatDigest();

  if (!digest.includes('####')) {
    console.warn('⚠️  没有找到可推送的内容，跳过');
    process.exit(0);
  }

  await pushToWechat(digest);
}

main();
