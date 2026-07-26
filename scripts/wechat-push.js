#!/usr/bin/env node
/**
 * 企微群推送脚本
 * 读取 follow-builders 的 feed 数据，格式化为企微 Markdown 消息并推送到群
 *
 * 数据结构说明：
 * - feed-x.json: { generatedAt, x: [{ name, handle, bio, tweets: [{id, text, createdAt}] }], stats }
 * - feed-podcasts.json: { podcasts: [{ source, name, title, url, publishedAt, transcript }], stats }
 * - feed-blogs.json: { blogs: [...], stats }
 */

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('❌ 错误: 未设置 WECHAT_WEBHOOK_URL 环境变量');
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

  // 获取日期
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  let content = `### 🤖 AI Builders 每日摘要\n`;
  content += `> **${today}**\n\n`;

  let hasContent = false;

  // X/Twitter 动态 - 数据在 feedX.x[].tweets[]
  if (feedX && feedX.x && Array.isArray(feedX.x) && feedX.x.length > 0) {
    content += `#### 📱 X/Twitter 热门动态\n\n`;
    let postCount = 0;

    feedX.forEach(builder => {
      if (!builder.tweets || !Array.isArray(builder.tweets)) return;
      const author = builder.name || builder.handle || '未知';

      builder.tweets.slice(0, 2).forEach(tweet => {
        if (postCount >= 8) return;
        const text = (tweet.text || '').substring(0, 150);
        const tweetUrl = tweet.id ? `https://x.com/${builder.handle}/status/${tweet.id}` : '';
        postCount++;
        content += `${postCount}. **${author}**: ${text}${text.length >= 150 ? '...' : ''}\n`;
        if (tweetUrl) content += `   🔗 [查看原文](${tweetUrl})\n`;
      });
    });

    if (postCount > 0) {
      content += `\n`;
      hasContent = true;
    }
  }

  // 播客更新 - 数据在 feedPodcasts.podcasts[]
  if (feedPodcasts && feedPodcasts.podcasts && Array.isArray(feedPodcasts.podcasts) && feedPodcasts.podcasts.length > 0) {
    content += `#### 🎙️ 播客更新\n\n`;

    feedPodcasts.podcasts.slice(0, 5).forEach((podcast, i) => {
      const title = podcast.title || '未知标题';
      const show = podcast.name || '';
      const summary = (podcast.transcript || '').substring(0, 120).replace(/\n/g, ' ');
      const url = podcast.url || '';

      content += `${i + 1}. **${title}** ${show ? `(${show})` : ''}\n`;
      if (summary) content += `   > ${summary}${summary.length >= 120 ? '...' : ''}\n`;
      if (url) content += `   🔗 [收听](${url})\n`;
    });

    content += `\n`;
    hasContent = true;
  }

  // 博客文章 - 数据可能在 feedBlogs.blogs[] 或直接是数组
  let blogsData = null;
  if (feedBlogs) {
    if (Array.isArray(feedBlogs)) {
      blogsData = feedBlogs;
    } else if (feedBlogs.blogs && Array.isArray(feedBlogs.blogs)) {
      blogsData = feedBlogs.blogs;
    } else if (feedBlogs.articles && Array.isArray(feedBlogs.articles)) {
      blogsData = feedBlogs.articles;
    }
  }

  if (blogsData && blogsData.length > 0) {
    content += `#### 📝 博客精选\n\n`;

    blogsData.slice(0, 5).forEach((blog, i) => {
      const title = blog.title || '未知标题';
      const source = blog.source || blog.blog || blog.author || '';
      const summary = (blog.summary || blog.description || blog.excerpt || blog.content || '').substring(0, 120).replace(/\n/g, ' ');
      const url = blog.url || blog.link || '';

      content += `${i + 1}. **${title}** ${source ? `(${source})` : ''}\n`;
      if (summary) content += `   > ${summary}${summary.length >= 120 ? '...' : ''}\n`;
      if (url) content += `   🔗 [阅读](${url})\n`;
    });

    content += `\n`;
    hasContent = true;
  }

  // 统计信息
  const stats = [];
  let xTweetCount = 0;
  if (feedX?.x) {
    feedX.x.forEach(b => { if (b.tweets) xTweetCount += b.tweets.length; });
  }
  if (xTweetCount) stats.push(`X动态 ${xTweetCount} 条`);
  if (feedPodcasts?.podcasts?.length) stats.push(`播客 ${feedPodcasts.podcasts.length} 期`);
  if (blogsData?.length) stats.push(`博客 ${blogsData.length} 篇`);

  if (stats.length > 0) {
    content += `---\n📊 今日统计: ${stats.join(' | ')}`;
  }

  content += `\n\n> 由 **Follow Builders** 自动生成`;

  return { content, hasContent };
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
  console.log(markdownContent.substring(0, 600) + '...');
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

  const { content, hasContent } = formatDigest();

  if (!hasContent) {
    console.warn('⚠️  没有找到可推送的内容，跳过');
    process.exit(0);
  }

  await pushToWechat(content);
}

main();
