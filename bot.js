const TelegramBot = require('node-telegram-bot-api');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
// ════════════════════════════════════════════════════════════
// PUPPETEER SETUP FOR PTERODACTYL
// ════════════════════════════════════════════════════════════

const puppeteer = require('puppeteer');

// Pterodactyl environment detection (for logging only)
const IS_PTERODACTYL = process.env.PTERODACTYL === 'true' || 
                       process.env.P_SERVER_UUID !== undefined ||
                       require('fs').existsSync('/home/container');

if (IS_PTERODACTYL) {
  console.log('🦕 Running in Pterodactyl environment');
  console.log('🤖 Puppeteer: using bundled Chromium');
}
// Bot Type Configuration
const BOT_TYPE = process.env.BOT_TYPE || 'multi';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const GMAIL_USER = process.env.GMAIL_USER;

const GMAIL_IMAP_DOMAINS = {
  'multi': '@puella.shop,@dressrosa.me,@dressrosa.biz.id,@levisama.my.id,@shanesama.my.id,@natsusensei.my.id,@rachelkun.my.id,@rachelkun.biz.id,@erenkun.my.id,@erenkun.biz.id,@erenkun.web.id,@kirsheebie.my.id',
  'admin': '@deiyn.xyz,@deiyn.shop',
  'paypal': GMAIL_USER ? '@' + GMAIL_USER.split('@')[1] : '@gmail.com'
};

// Get current bot's Gmail domains
// Convert comma-separated string to array for easier use
const CURRENT_GMAIL_DOMAINS = GMAIL_IMAP_DOMAINS[BOT_TYPE] 
  ? GMAIL_IMAP_DOMAINS[BOT_TYPE].split(',').map(d => d.replace('@', ''))
  : [GMAIL_USER ? GMAIL_USER.split('@')[1] : 'gmail.com'];
  
// Gmail domain configuration per bot
const BOT_GMAIL_DOMAINS = {
  'multi': '',
  'admin': '',
  'paypal': GMAIL_USER ? GMAIL_USER.split('@')[1] : 'gmail.com'
};

// Get current bot's Gmail domain
const CURRENT_GMAIL_DOMAIN = BOT_GMAIL_DOMAINS[BOT_TYPE] || (GMAIL_USER ? GMAIL_USER.split('@')[1] : 'gmail.com');
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const BOT_NAME = process.env.BOT_NAME || 'OTP Bot';

const USERS_FILE = process.env.USERS_FILE || './authorized_users.json';
const BANNED_USERS_FILE = './banned_users.json';
const STATS_FILE = './bot_stats.json';

const TEMP_MAIL_DOMAINS = [
  'jxpomup.com',
  'ibolinva.com',
  'wyoxafp.com',
  'osxofulk.com',
  'jkotypc.com',
  'cmhvzylmfc.com',
  'zudpck.com',
  'daouse.com',
  'illubd.com',
  'mkzaso.com',
  'mrotzis.com',
  'xkxkud.com',
  'wnbaldwy.com',
  'bwmyga.com',
  'ozsaip.com'
];

// ════════════════════════════════════════════════════════════
// EMAIL GENERATOR SUPPORT (generator.email API)
// Supports ANY domain that generator.email has
// ════════════════════════════════════════════════════════════

// Get available domains from generator.email
async function getGeneratorDomains() {
  try {
    const response = await fetch('https://generator.email/');
    const text = await response.text();
    
    // Parse domains from the page
    const domainMatch = text.match(/data-mailhost="([^"]+)"/g);
    if (domainMatch) {
      const domains = domainMatch.map(m => m.match(/data-mailhost="([^"]+)"/)[1]);
      return domains;
    }
    
    // Fallback to common generator.email domains
    return [
      'abdcart.shop',
      'capcut.pp.ua',
      '10mail.org',
      'emailnax.com',
      'mail.tm',
      'guerrillamail.com'
    ];
  } catch (err) {
    console.error('Error fetching generator domains:', err);
    return ['abdcart.shop', 'capcut.pp.ua'];
  }
}

// Get verification code from generator.email
async function getCodeFromGenerator(email, domain) {
  try {
    const response = await fetch(`https://generator.email/`, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'cookie': `surl=${domain}%2F${email}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const text = await response.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(text);
    
    // Try multiple selectors to find the code/link
    let result = null;
    
    // Selector 1: OTP code in span
    const codeSpan = $("#email-table > div.e7m.row.list-group-item > div.e7m.col-md-12.ma1 > div.e7m.mess_bodiyy > div > div > div:nth-child(2) > p:nth-child(2) > span").text().trim();
    if (codeSpan) result = codeSpan;
    
    // Selector 2: Look for 6-digit codes
    const bodyText = $(".mess_bodiyy").text();
    const codeMatch = bodyText.match(/\d{6}/);
    if (codeMatch) result = codeMatch[0];
    
    // Selector 3: Look for verification links
    const links = $(".mess_bodiyy a");
    links.each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && (href.includes('verify') || href.includes('confirm') || href.includes('reset'))) {
        result = href;
      }
    });
    
    return result;
  } catch (err) {
    console.error('Error fetching from generator:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// ULTRA-FAST GENERATOR FETCH (5 seconds interval)
// ════════════════════════════════════════════════════════════

// Get verification code/link from generator.email (FAST)
async function getCodeFromGenerator(email, domain) {
  try {
    const response = await fetch(`https://generator.email/`, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'cookie': `surl=${domain}%2F${email}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'cache-control': 'no-cache'
      },
      timeout: 3000 // 3 second timeout
    });
    
    const text = await response.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(text);
    
    // Search entire email body for patterns
    const bodyText = $(".mess_bodiyy").text();
    const fullHtml = $(".mess_bodiyy").html() || '';
    
    // Pattern 1: 6-digit OTP codes
    const sixDigitMatch = bodyText.match(/\d{6}/);
    if (sixDigitMatch) {
      return { type: 'code', value: sixDigitMatch[0] };
    }
    
    // Pattern 2: 4-digit codes
    const fourDigitMatch = bodyText.match(/\d{4}/);
    if (fourDigitMatch) {
      return { type: 'code', value: fourDigitMatch[0] };
    }
    
    // Pattern 3: 8-digit codes
    const eightDigitMatch = bodyText.match(/\d{8}/);
    if (eightDigitMatch) {
      return { type: 'code', value: eightDigitMatch[0] };
    }
    
    // Pattern 4: Verification/Reset links
    const links = $(".mess_bodiyy a");
    let verifyLink = null;
    
    links.each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && (
        href.includes('verify') || 
        href.includes('confirm') || 
        href.includes('reset') ||
        href.includes('activate') ||
        href.includes('auth')
      )) {
        verifyLink = href;
      }
    });
    
    if (verifyLink) {
      return { type: 'link', value: verifyLink };
    }
    
    // Pattern 5: Look for code in specific span/div
    const codeSpan = $("span").filter(function() {
      return /^\d{4,8}$/.test($(this).text().trim());
    }).first().text().trim();
    
    if (codeSpan) {
      return { type: 'code', value: codeSpan };
    }
    
    return null;
  } catch (err) {
    console.error('Generator fetch error:', err.message);
    return null;
  }
}

// Fast parallel fetch from generator
async function fetchFromGenerator(email, maxAttempts = 12, delayMs = 5000) {
  const [username, domain] = email.split('@');
  
  console.log(`[Generator] Starting fast fetch for ${email}`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const startTime = Date.now();
      
      const result = await getCodeFromGenerator(username, domain);
      
      const elapsed = Date.now() - startTime;
      console.log(`[Generator] Attempt ${attempt}/${maxAttempts} - ${elapsed}ms`);
      
      if (result) {
        if (result.type === 'code') {
          return {
            code: result.value,
            resetLink: null,
            source: 'generator',
            email: email,
            attempts: attempt
          };
        } else if (result.type === 'link') {
          return {
            code: null,
            resetLink: result.value,
            source: 'generator',
            email: email,
            attempts: attempt
          };
        }
      }
      
      if (attempt < maxAttempts) {
        console.log(`[Generator] Waiting ${delayMs}ms before retry...`);
        
        // Update user on progress (every 3 attempts)
        if (attempt % 3 === 0 && progressMsg) {
          try {
            await bot.editMessageText(
              `🎯 Generator fetch in progress...\n\n⏱️ Attempt ${attempt}/${maxAttempts}\n📧 Email: ${email}\n\n📭 No email yet, still checking...`,
              { chat_id: chatId, message_id: progressMsg.message_id }
            );
          } catch (e) {
            // Ignore edit errors
          }
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (err) {
      console.error(`[Generator] Attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Quick retry on error
      }
    }
  }
  
  console.log(`[Generator] No result after ${maxAttempts} attempts`);
  console.log(`[Generator] ❌ NO EMAIL FOUND for ${email}`);
  console.log(`[Generator] Inbox appears empty or email not delivered`);
  return null;
}

// Search for ANY pattern in email (universal search)
async function searchGeneratorEmail(email) {
  const [username, domain] = email.split('@');
  
  try {
    const response = await fetch(`https://generator.email/`, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'cookie': `surl=${domain}%2F${email}`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 4000
    });
    
    const text = await response.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(text);
    
    // Get all email content
    const emails = [];
    
    $("#email-table .list-group-item").each((i, elem) => {
      const subject = $(elem).find(".e7m.col-md-4").text().trim();
      const body = $(elem).find(".mess_bodiyy").text().trim();
      const html = $(elem).find(".mess_bodiyy").html() || '';
      
      if (subject || body) {
        // Extract all codes (4-8 digits)
        const codes = body.match(/\d{4,8}/g) || [];
        
        // Extract all links
        const links = [];
        $(elem).find(".mess_bodiyy a").each((j, link) => {
          const href = $(link).attr('href');
          if (href) links.push(href);
        });
        
        emails.push({
          subject,
          codes,
          links,
          body: body.substring(0, 200)
        });
      }
    });
    
    return emails;
  } catch (err) {
    console.error('Search error:', err.message);
    return [];
  }
}

// Generate random email with generator domain
function generateRandomGeneratorEmail(domain) {
  const randomUsername = Math.random().toString(36).substring(2, 10);
  return `${randomUsername}@${domain}`;
}



// ════════════════════════════════════════════════════════════
// TEMP-MAIL.IO API - FOR CAPCUT & GRAMMARLY
// ════════════════════════════════════════════════════════════

// Fetch OTP/link from temp-mail.io (used by CapCut, Grammarly)
async function fetchFromTempMail(email, maxAttempts = 12, delayMs = 5000) {
  const [username, domain] = email.split('@');
  
  console.log(`[TempMail] Starting fetch for ${email}`);
  
  // Check if domain is supported
  if (!TEMP_MAIL_DOMAINS.includes(domain)) {
    console.log(`[TempMail] Domain ${domain} not in temp-mail list, trying generator...`);
    return await fetchFromGenerator(email, maxAttempts, delayMs);
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[TempMail] Attempt ${attempt}/${maxAttempts}`);
      
      // Fetch emails from temp-mail.org API (1secmail.com)
      const response = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${domain}`);
      
      if (response.data && response.data.length > 0) {
        // Get the most recent email
        const latestEmail = response.data[0];
        
        // Fetch full email content
        const emailResponse = await axios.get(
          `https://www.1secmail.com/api/v1/?action=readMessage&login=${username}&domain=${domain}&id=${latestEmail.id}`
        );
        
        const emailData = emailResponse.data;
        
        // Extract code or link
        const code = extractOTP(emailData.textBody || '', emailData.htmlBody || '', emailData.subject || '');
        const resetLink = extractResetLink(emailData.textBody || '', emailData.htmlBody || '');
        
        if (code || resetLink) {
          console.log(`[TempMail] ✅ Found result in ${attempt} attempts`);
          return {
            code: code || null,
            resetLink: resetLink || null,
            from: emailData.from,
            subject: emailData.subject,
            date: new Date(emailData.date),
            source: 'tempmail',
            email: email,
            attempts: attempt,
            timeTaken: Math.round(attempt * delayMs / 1000)
          };
        }
      }
      
      // Wait before next attempt
      if (attempt < maxAttempts) {
        console.log(`[TempMail] Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
    } catch (err) {
      console.error(`[TempMail] Attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.log(`[TempMail] ❌ No email found after ${maxAttempts} attempts`);
  return null;
}



// ════════════════════════════════════════════════════════════
// TEMP-MAIL.IO API - FOR CAPCUT & GRAMMARLY
// ════════════════════════════════════════════════════════════

async function fetchFromTempMail(email, maxAttempts = 12, delayMs = 5000) {
  const [username, domain] = email.split('@');
  
  console.log(`[TempMail] Starting fetch for ${email}`);
  
  if (!TEMP_MAIL_DOMAINS.includes(domain)) {
    console.log(`[TempMail] Domain ${domain} not in temp-mail list, trying generator...`);
    return await fetchFromGenerator(email, maxAttempts, delayMs);
  }
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[TempMail] Attempt ${attempt}/${maxAttempts}`);
      
      const response = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${username}&domain=${domain}`);
      
      if (response.data && response.data.length > 0) {
        const latestEmail = response.data[0];
        
        const emailResponse = await axios.get(
          `https://www.1secmail.com/api/v1/?action=readMessage&login=${username}&domain=${domain}&id=${latestEmail.id}`
        );
        
        const emailData = emailResponse.data;
        
        const code = extractOTP(emailData.textBody || '', emailData.htmlBody || '', emailData.subject || '');
        const resetLink = extractResetLink(emailData.textBody || '', emailData.htmlBody || '');
        
        if (code || resetLink) {
          console.log(`[TempMail] ✅ Found result in ${attempt} attempts`);
          return {
            code: code || null,
            resetLink: resetLink || null,
            from: emailData.from,
            subject: emailData.subject,
            date: new Date(emailData.date),
            source: 'tempmail',
            email: email,
            attempts: attempt,
            timeTaken: Math.round(attempt * delayMs / 1000)
          };
        }
      }
      
      if (attempt < maxAttempts) {
        console.log(`[TempMail] Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
    } catch (err) {
      console.error(`[TempMail] Attempt ${attempt} failed:`, err.message);
      
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.log(`[TempMail] ❌ No email found after ${maxAttempts} attempts`);
  return null;
}
const SPOTIFY_DOMAINS = {
  'multi': [
    'puella.shop',
     'dressrosa.me',
    'dressrosa.biz.id',
    'levisama.my.id',
    'shanesama.my.id',
    'natsusensei.my.id',
    'rachelkun.my.id',
    'rachelkun.biz.id',
    'erenkun.my.id',
    'erenkun.biz.id',
    'erenkun.web.id',
    'kirsheebie.my.id'
  ],
  'admin': ['deiyn.xyz', 'deiyn.shop'],
  'paypal': ['puella.shop']
};

const CURRENT_SPOTIFY_DOMAINS = SPOTIFY_DOMAINS[BOT_TYPE] || ['puella.shop'];
const SPOTIFY_DOMAIN = CURRENT_SPOTIFY_DOMAINS[0];

// Canva domains per bot type
const CANVA_DOMAINS_LIST = {
  'multi': [
    'dressrosa.me',
    'puella.shop',
    'dressrosa.biz.id',
    'levisama.my.id',
    'shanesama.my.id',
    'natsusensei.my.id',
    'rachelkun.my.id',
    'rachelkun.biz.id',
    'erenkun.my.id',
    'erenkun.biz.id',
    'erenkun.web.id'
  ],
  'admin': ['deiyn.xyz', 'deiyn.shop'],
  'paypal': ['canvaotpbot.shop']
};

const CURRENT_CANVA_DOMAINS = CANVA_DOMAINS_LIST[BOT_TYPE] || ['puella.shop'];
const CANVA_DOMAINS = CURRENT_CANVA_DOMAINS; // Keep this name for compatibility

const RATE_LIMITS = {
  requests_per_10min: 20,
  requests_per_day: 100
};

if (!TELEGRAM_TOKEN) {
  console.error('❌ Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

console.log(`🤖 ${BOT_NAME} Started`);
console.log(`📧 Gmail: ${GMAIL_USER || 'Not configured'}`);
console.log(`👤 Admin: ${ADMIN_USER_ID || 'Not set'}`);
console.log(`🔧 Type: ${BOT_TYPE}`);
console.log(`📅 ${new Date().toISOString().replace('T', ' ').split('.')[0]} UTC\n`);

let authorizedUsers = {};
let bannedUsers = {};
let userSessions = {};
let botStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  serviceStats: {
    paypal: { total: 0, success: 0, avgTime: 0 },
    canva: { total: 0, success: 0, avgTime: 0 },
    capcut: { total: 0, success: 0, avgTime: 0 },
    spotify: { total: 0, success: 0, avgTime: 0 },
    spotify_autofull: { total: 0, success: 0, avgTime: 0 }, // ✅ ADD THIS LINE
    hbo: { total: 0, success: 0, avgTime: 0 },
    scribd: { total: 0, success: 0, avgTime: 0 },
    quizlet: { total: 0, success: 0, avgTime: 0 },
    perplexity: { total: 0, success: 0, avgTime: 0 },
    grammarly: { total: 0, success: 0, avgTime: 0 }
  }
};
let bot;

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      authorizedUsers = JSON.parse(data);
      console.log(`✅ Loaded ${Object.keys(authorizedUsers).length} users`);
    } else {
      authorizedUsers = {};
      saveUsers();
    }
  } catch (err) {
    authorizedUsers = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(authorizedUsers, null, 2));
  } catch (err) {}
}

function loadBannedUsers() {
  try {
    if (fs.existsSync(BANNED_USERS_FILE)) {
      const data = fs.readFileSync(BANNED_USERS_FILE, 'utf8');
      bannedUsers = JSON.parse(data);
      console.log(`✅ Loaded ${Object.keys(bannedUsers).length} banned users`);
    } else {
      bannedUsers = {};
      saveBannedUsers();
    }
  } catch (err) {
    bannedUsers = {};
  }
}

function saveBannedUsers() {
  try {
    fs.writeFileSync(BANNED_USERS_FILE, JSON.stringify(bannedUsers, null, 2));
  } catch (err) {}
}

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, 'utf8');
      botStats = JSON.parse(data);
      console.log(`✅ Loaded bot statistics`);
    } else {
      saveStats();
    }
  } catch (err) {}
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(botStats, null, 2));
  } catch (err) {}
}

function addUser(userId, username, firstName, lastName) {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown';
  authorizedUsers[userId] = {
    userId: userId,
    username: username || null,
    fullName: fullName,
    addedDate: new Date().toISOString(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    lastRequest: null,
    requestHistory: [],
    rateLimitData: {
      requests10min: [],
      requestsToday: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    }
  };
  saveUsers();
  console.log(`➕ ${fullName} (@${username}) - ${userId}`);
}

function isAuthorized(userId) {
  return authorizedUsers.hasOwnProperty(userId.toString());
}

function isAdmin(userId) {
  return userId.toString() === ADMIN_USER_ID;
}

function isBanned(userId) {
  return bannedUsers.hasOwnProperty(userId.toString());
}

function banUser(userId, reason = 'No reason provided') {
  if (authorizedUsers[userId]) {
    bannedUsers[userId] = {
      userId: userId,
      username: authorizedUsers[userId].username,
      fullName: authorizedUsers[userId].fullName,
      bannedDate: new Date().toISOString(),
      reason: reason
    };
    saveBannedUsers();
    return true;
  }
  return false;
}

function unbanUser(userId) {
  if (bannedUsers[userId]) {
    delete bannedUsers[userId];
    saveBannedUsers();
    return true;
  }
  return false;
}

function checkRateLimit(userId) {
  if (isAdmin(userId)) return { allowed: true };
  
  const user = authorizedUsers[userId];
  if (!user) return { allowed: false, reason: 'User not found' };
  
  const now = Date.now();
  const tenMinutesAgo = now - (10 * 60 * 1000);
  const today = new Date().toISOString().split('T')[0];
  
  if (user.rateLimitData.lastResetDate !== today) {
    user.rateLimitData.requestsToday = 0;
    user.rateLimitData.lastResetDate = today;
  }
  
  user.rateLimitData.requests10min = user.rateLimitData.requests10min.filter(t => t > tenMinutesAgo);
  
  if (user.rateLimitData.requests10min.length >= RATE_LIMITS.requests_per_10min) {
    const oldestRequest = user.rateLimitData.requests10min[0];
    const waitTime = Math.ceil((oldestRequest + (10 * 60 * 1000) - now) / 1000);
    return { 
      allowed: false, 
      reason: 'rate_limit_10min',
      waitTime: waitTime 
    };
  }
  
  if (user.rateLimitData.requestsToday >= RATE_LIMITS.requests_per_day) {
    return { 
      allowed: false, 
      reason: 'rate_limit_daily'
    };
  }
  
  return { allowed: true };
}

function trackRequest(userId) {
  if (authorizedUsers[userId]) {
    const now = Date.now();
    authorizedUsers[userId].rateLimitData.requests10min.push(now);
    authorizedUsers[userId].rateLimitData.requestsToday++;
    saveUsers();
  }
}

function trackUsage(userId, service, success, timeTaken) {
  if (authorizedUsers[userId]) {
    authorizedUsers[userId].totalRequests++;
    if (success) {
      authorizedUsers[userId].successfulRequests++;
    } else {
      authorizedUsers[userId].failedRequests++;
    }
    authorizedUsers[userId].lastRequest = new Date().toISOString();
    
    authorizedUsers[userId].requestHistory.unshift({
      service: service,
      success: success,
      timestamp: new Date().toISOString(),
      timeTaken: timeTaken
    });
    
    if (authorizedUsers[userId].requestHistory.length > 20) {
      authorizedUsers[userId].requestHistory = authorizedUsers[userId].requestHistory.slice(0, 20);
    }
    
    saveUsers();
  }
  
  botStats.totalRequests++;
  if (success) {
    botStats.successfulRequests++;
  } else {
    botStats.failedRequests++;
  }
  
  if (botStats.serviceStats[service]) {
    botStats.serviceStats[service].total++;
    if (success) {
      botStats.serviceStats[service].success++;
    }
    
    const currentAvg = botStats.serviceStats[service].avgTime;
    const currentTotal = botStats.serviceStats[service].total;
    botStats.serviceStats[service].avgTime = ((currentAvg * (currentTotal - 1)) + timeTaken) / currentTotal;
  }
  
  saveStats();
}

async function deleteMsg(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch (err) {}
}

function extractOTP(text = '', html = '', subject = '') {
  const combined = (subject + '\n' + text + '\n' + html)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Match Spotify format: "529901 – your Spotify login code" or "enter this code 529901"
  const spotifySubjectMatch = combined.match(/^(\d{6})\s*[–-]\s*your Spotify login code/i);
  if (spotifySubjectMatch && spotifySubjectMatch[1]) {
    return spotifySubjectMatch[1];
  }
  
  const spotifyMatch = combined.match(/enter this code[^\d]*(\d{6})/i);
  if (spotifyMatch && spotifyMatch[1]) {
    return spotifyMatch[1];
  }
  
  const canvaMatch = combined.match(/(?:verification code is|your code is|login code is)[:\s]*(\d{6})/i);
  if (canvaMatch && canvaMatch[1]) {
    return canvaMatch[1];
  }
  
  const paypalMatch = combined.match(/your code is[:\s]*(\d{6})/i);
  if (paypalMatch && paypalMatch[1]) {
    return paypalMatch[1];
  }
  
  const grammarlyMatch = combined.match(/(?:verification code|confirmation code)[:\s]*is[:\s]*(\d{6})/i);
  if (grammarlyMatch && grammarlyMatch[1]) {
    return grammarlyMatch[1];
  }

  
  const codeMatch = combined.match(/\bcode[:\s]*(\d{6})\b/i);
  if (codeMatch && codeMatch[1]) {
    return codeMatch[1];
  }
  
  const firstPart = combined.substring(0, 500);
  const digitMatch = firstPart.match(/\b(\d{6})\b/);
  if (digitMatch && digitMatch[1]) {
    return digitMatch[1];
  }
  
  return null;
}

function extractResetLink(text = '', html = '') {
  const combined = text + '\n' + html;
  
  const patterns = [
    // CapCut
    /https:\/\/www\.capcut\.com\/forget-password[^\s<>"]+/i,
    
    // Spotify - Password reset (MUST come before generic pattern)
    /https:\/\/accounts\.spotify\.com\/[^\s<>"']*password-reset[^\s<>"']*/gi,
    
    // Spotify - Generic account links
    /https:\/\/accounts\.spotify\.com\/[^\s<>"]+/i,
    
    // Scribd - Verification link
    /https:\/\/www\.scribd\.com\/[^\s<>"]*(?:verify|confirm|activate)[^\s<>"']*/gi,
    /https:\/\/account\.scribd\.com\/[^\s<>"]+/gi,
    
    // Quizlet - Confirmation link
    /https:\/\/quizlet\.com\/[^\s<>"]*(?:confirm|verify|activate)[^\s<>"']*/gi,
    /https:\/\/www\.quizlet\.com\/[^\s<>"]*(?:confirm|verify|activate)[^\s<>"']*/gi,
    /https:\/\/account\.quizlet\.com\/[^\s<>"]+/gi,
    /https:\/\/www\.quizlet\.com\/[^\s<>"]*(?:confirm|verify|activate)[^\s<>"']*/gi,
    
    // HBO Max
    /https:\/\/auth\.hbomax\.com\/set-new-password[^\s<>"']*/gi,
    /https:\/\/www\.hbomax\.com\/[^\s<>"]*(?:verify|confirm|reset|account)[^\s<>"']*/gi,
    /https:\/\/hbomax\.com\/[^\s<>"]*(?:verify|confirm|reset)[^\s<>"']*/gi,
    /https:\/\/hbomax\.com\/[^\s<>"]*(?:verify|confirm|reset)[^\s<>"']*/gi,
    
    // Perplexity AI
    /https:\/\/www\.perplexity\.ai\/[^\s<>"]*(?:verify|confirm|reset)[^\s<>"']*/gi,
    /https:\/\/perplexity\.ai\/[^\s<>"]*(?:verify|confirm)[^\s<>"']*/gi,
    
    // Generic password reset/recovery/verification
    /https?:\/\/[^\s<>"]+(?:reset|password|recovery|forget|confirm|verify|activate)[^\s<>"']*/gi
  ];
  
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match) return match[0];
  }
  
  return null;
}
// ════════════════════════════════════════════════════════════
// PUPPETEER - SPOTIFY PASSWORD RESET AUTOMATION
// ════════════════════════════════════════════════════════════

/**
 * Reset Spotify password using Puppeteer
 */
async function puppeteerSpotifyReset(email) {
  let browser = null;

  try {
    console.log(`[Puppeteer] 🌐 Starting browser for: ${email}`);

    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
        '--no-zygote',
        '--disable-accelerated-2d-canvas',
        '--no-first-run'
      ]
    };

    // Use custom Chrome path in Pterodactyl
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      console.log(`[Puppeteer] Using Chrome at: ${launchOptions.executablePath}`);
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log(`[Puppeteer] 🔄 Loading Spotify...`);
    await page.goto('https://accounts.spotify.com/en/password-reset', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    console.log(`[Puppeteer] ✍️ Filling email: ${email}`);

    await page.waitForSelector('#email_or_username', { timeout: 15000 });
    await page.click('#email_or_username');
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('email_or_username').value = ''; });
    await page.type('#email_or_username', email, { delay: 80 });
    await page.waitForTimeout(500);

    console.log(`[Puppeteer] 🖱️ Clicking button...`);
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.toLowerCase().includes('send')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);

    const content = await page.content();
    const success = content.toLowerCase().includes('sent') || content.toLowerCase().includes('check');

    await browser.close();

    console.log(`[Puppeteer] ${success ? '✅ SUCCESS' : '⚠️ UNCLEAR'} for ${email}`);
    return { success: success, email: email };

  } catch (error) {
    console.error(`[Puppeteer] ❌ ERROR:`, error.message);
    
    // Check if it's a library missing error
    if (error.message.includes('libatk') || error.message.includes('chrome') || error.message.includes('cannot open shared object')) {
      console.error(`[Puppeteer] 💡 FIX: Install Chrome with: apt-get update && apt-get install -y chromium-browser`);
      console.error(`[Puppeteer] 💡 OR set PUPPETEER_EXECUTABLE_PATH in environment variables`);
    }
    
    if (browser) try { await browser.close(); } catch (e) {}
    return { success: false, email: email, error: error.message };
  }
}

/**
 * Complete auto reset flow: Reset + Fetch email
 */
async function autoResetAndFetch(email, service = 'spotify', progressCallback = null) {
  const startTime = Date.now();
  
  try {
    if (progressCallback) await progressCallback({ step: 1, status: 'Sending reset...' });
    
    const resetResult = await puppeteerSpotifyReset(email);
    if (!resetResult.success) throw new Error('Reset failed');
    
    if (progressCallback) await progressCallback({ step: 2, status: 'Waiting for email...' });
    
    await new Promise(r => setTimeout(r, 5000));
    
    let emailResult = null;
    for (let i = 1; i <= 12; i++) {
      if (progressCallback) await progressCallback({ step: 2, status: `Checking (${i}/12)...`, attempt: i, maxAttempts: 12 });
      emailResult = await fetchFromGmail(service, email, 'reset');
      if (emailResult && emailResult.resetLink) break;
      await new Promise(r => setTimeout(r, 5000));
    }
    
    if (!emailResult || !emailResult.resetLink) throw new Error('No email received');
    
    if (progressCallback) await progressCallback({ step: 3, status: '✅ Done!' });
    
    return {
      success: true,
      email: email,
      resetLink: emailResult.resetLink,
      timeTaken: Math.round((Date.now() - startTime) / 1000)
    };
    
  } catch (error) {
    return {
      success: false,
      email: email,
      error: error.message,
      timeTaken: Math.round((Date.now() - startTime) / 1000)
    };
  }
}

function fetchFromGmail(service = 'paypal', targetEmail = null, fetchType = 'login') {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return Promise.resolve(null);
  }
  
  // Validate targetEmail is provided to prevent cross-user email leakage
  if (!targetEmail) {
    console.error('[Gmail] ERROR: targetEmail is required but not provided');
    console.error(`[Gmail] Service: ${service}, FetchType: ${fetchType}`);
    return Promise.resolve(null);
  }
  
  console.log(`[Gmail] 🔍 Searching for: ${targetEmail} (${service}/${fetchType})`);
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const imap = new Imap({
      user: GMAIL_USER,
      password: GMAIL_APP_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
    
    let result = null;
    let finished = false;
    
    function finish() {
      if (finished) return;
      finished = true;
      try { imap.end(); } catch (e) {}

      if (result) {
        result.timeTaken = Math.round((Date.now() - startTime) / 1000);
      }
      
      resolve(result);
    }
    
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          return finish();
        }
        
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 1);
        
        let searchCriteria = [['SINCE', sinceDate]];
        if (targetEmail) {
          searchCriteria.push(['TO', targetEmail]);
          console.log(`[Gmail] ✓ STRICT FILTERING for recipient: ${targetEmail}`);
        } else {
          console.log('[Gmail] ⚠️ WARNING: No email filter applied - may return wrong user\'s email');
        }
        if (service === 'spotify') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@spotify.com'], ['FROM', 'no-reply@alerts.spotify.com']]);
          
          // Filter by email type
          if (fetchType === 'reset') {
            searchCriteria.push(['SUBJECT', 'Reset your password']);
            console.log('[Spotify] Searching for RESET emails');
          } else if (fetchType === 'otp') {
  searchCriteria.push(['OR', ['SUBJECT', 'login code'], ['SUBJECT', 'Spotify login code']]);
  console.log('[Spotify] Searching for OTP emails (subject contains "login code" or "Spotify login code")');
} else if (fetchType === 'both') {
            console.log('[Spotify] Searching for BOTH (no subject filter)');
          }
        } else if (service === 'canva') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@canva.com'], ['FROM', 'no-reply@account.canva.com']]);
        } else if (service === 'paypal') {
          searchCriteria.push(['FROM', 'service@intl.paypal.com']);
        } else if (service === 'hbo') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@hbomax.com'], ['FROM', 'noreply@hbo.com'], ['FROM', 'no-reply@updates.hbomax.com']]);
        } else if (service === 'scribd') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@scribd.com'], ['FROM', 'accounts@scribd.com'], ['FROM', 'support@scribd.com'], ['FROM', 'support@account.scribd.com']]);
        } else if (service === 'quizlet') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@quizlet.com'], ['FROM', 'account@account.quizlet.com'], ['FROM', 'team@quizlet.com']]);
        } else if (service === 'perplexity') {
          searchCriteria.push(['OR', ['FROM', 'no-reply@perplexity.ai'], ['FROM', 'support@perplexity.ai'], ['FROM', 'team@mail.perplexity.ai'], ['FROM', 'team@perplexity.ai']]);
        } else if (service === 'grammarly') {
          searchCriteria.push(['OR', ['FROM', 'hello@notification.grammarly.com'], ['FROM', 'support@grammarly.com']]);
        } else {
          return finish();
        }
        
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.log(`[Gmail] Search error for ${targetEmail}: ${err.message}`);
            return finish();
          }
          
          console.log(`[Gmail] Found ${results ? results.length : 0} emails in INBOX for ${targetEmail}`);
          
          if (!results || results.length === 0) {
            imap.openBox('[Gmail]/Spam', false, (spamErr) => {
              if (spamErr) {
                return finish();
              }
              
              imap.search(searchCriteria, (spamSearchErr, spamResults) => {
                if (spamSearchErr || !spamResults || spamResults.length === 0) {
                  console.log(`[Gmail] No emails found in SPAM for ${targetEmail}`);
                  return finish();
                }
                
                console.log(`[Gmail] Found ${spamResults.length} emails in SPAM for ${targetEmail}`);
                processEmails(spamResults, 'SPAM');
              });
            });
            return;
          }
          
          processEmails(results, 'INBOX');
        });
        
        function processEmails(results, folder) {
          const recentResults = results.slice(-10);
          const f = imap.fetch(recentResults, { bodies: '', struct: true });
          
          let allEmails = [];
          let processedCount = 0;
          
          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                processedCount++;
                
                if (err) {
                  if (processedCount >= recentResults.length) {
                    finishProcessing();
                  }
                  return;
                }
                
                const emailDate = parsed.date || new Date();
                const code = extractOTP(parsed.text || '', parsed.html || '', parsed.subject || '');
                const resetLink = extractResetLink(parsed.text || '', parsed.html || '');
                
                // Debug for Spotify
                if (service === 'spotify' && fetchType === 'reset') {
                  console.log(`[Spotify Debug] Subject: ${parsed.subject}`);
                  console.log(`[Spotify Debug] Reset link: ${resetLink || 'NONE'}`);
                }
                
                if (code || resetLink) {
                  allEmails.push({
                    code: code || null,
                    resetLink: resetLink || null,
                    from: parsed.from?.text || 'Unknown',
                    subject: parsed.subject || '',
                    date: emailDate,
                    source: 'gmail',
                    folder: folder
                  });
                }
                
                if (processedCount >= recentResults.length) {
                  finishProcessing();
                }
              });
            });
          });
          
          f.once('error', (err) => {
            finish();
          });
          
          f.once('end', () => {
            setTimeout(() => {
              if (processedCount === 0) {
                finish();
              }
            }, 3000);
          });
          
          function finishProcessing() {
            if (allEmails.length === 0) {
              console.log(`[Gmail] No valid emails found for ${targetEmail}`);
              return finish();
            }
            
            allEmails.sort((a, b) => b.date - a.date);
            
            result = allEmails[0];
            console.log(`[Gmail] ✅ Selected email for ${targetEmail}: From=${result.from}, Subject=${result.subject}, Folder=${result.folder}`);
            finish();
          }
        }
      });
    });
    
    imap.once('error', (err) => {
      finish();
    });
    
    imap.connect();
    
    setTimeout(() => {
      if (!finished) {
        finish();
      }
    }, 20000);
  });
}

function initBot() {
  if (typeof bot === 'undefined' || !bot) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { 
      polling: {
        interval: 300,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });

    bot.on('polling_error', (error) => {
      console.error('❌ Polling:', error.code || error.message);
    });
  }

  setupHandlers();
}

function getMainKeyboard(userId) {
  if (BOT_TYPE === 'paypal') {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Get PayPal OTP', callback_data: 'service_paypal' }],
          [{ text: '📊 Stats', callback_data: 'stats' }, { text: '📜 History', callback_data: 'history' }],
          [{ text: '❓ Help', callback_data: 'help' }],
          [{ text: '💬 Message Admin', callback_data: 'message_admin' }]
        ]
      }
    };
  }
  
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎨 Canva', callback_data: 'service_canva' }],
        [{ text: '✂️ CapCut', callback_data: 'service_capcut' }],
        [{ text: '🎵 Spotify', callback_data: 'service_spotify' }],
        [{ text: '📚 Scribd', callback_data: 'service_scribd' }],
        [{ text: '🧠 Quizlet Plus', callback_data: 'service_quizlet' }],
        [{ text: '🤖 Perplexity AI', callback_data: 'service_perplexity' }],
        
        // Admin-only services (Bot 3)
        ...(BOT_TYPE === 'admin' && isAdmin(userId) ? [
          [{ text: '📺 HBO Max (Admin)', callback_data: 'service_hbo' }],
          [{ text: '✍️ Grammarly (Admin)', callback_data: 'service_grammarly' }]
        ] : []),
        [{ text: '📊 Stats', callback_data: 'stats' }, { text: '📜 History', callback_data: 'history' }],
        [{ text: '❓ Help', callback_data: 'help' }],
        [{ text: '💬 Message Admin', callback_data: 'message_admin' }]
      ]
    }
  };
}

function setupHandlers() {
  bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id.toString();
    const username = msg.from.username;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name;
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    
    if (isBanned(userId)) {
      return bot.sendMessage(msg.chat.id, '🚫 You have been banned from using this bot.');
    }
    
    if (!isAuthorized(userId)) {
      addUser(userId, username, firstName, lastName);
      if (ADMIN_USER_ID && ADMIN_USER_ID !== userId) {
        try {
          await bot.sendMessage(ADMIN_USER_ID,
            `🆕 NEW USER\n\n` +
            `👤 ${fullName}\n` +
            `🆔 @${username || 'none'}\n` +
            `🔢 ${userId}\n` +
            `📅 ${new Date().toISOString().replace('T', ' ').split('.')[0]} UTC`
          );
        } catch (err) {}
      }
    }
    
    userSessions[userId] = { 
      email: null, 
      awaitingEmail: false,
      awaitingAdminMessage: false,
      service: null,
      canvaType: null,
      spotifyType: null,
      hboType: null,
      scribdType: null,
      quizletType: null,
      perplexityType: null,
      grammarlyType: null,
      messagesToDelete: []
    };
    
    const gmailDomain = CURRENT_GMAIL_DOMAIN;
    
    let text = `👋 Welcome ${firstName}!\n\n`;
    
    if (BOT_TYPE === 'paypal') {
      text += `🤖 ${BOT_NAME}\n\n`;
      text += `💳 Get PayPal OTP codes instantly\n\n`;
      text += `📧 EMAIL: Temp-mail or Gmail\n\n`;
      text += `⚡ Click the button below to start!`;
      
    } else if (BOT_TYPE === 'multi') {
      text += `🤖 ${BOT_NAME}\n\n`;
      text += `📋 6 Services Available:\n\n`;
      
      text += `🎨 Canva\n`;
      text += `✂️ CapCut\n`;
      text += `🎵 Spotify\n`;
      text += `📚 Scribd\n`;
      text += `🧠 Quizlet Plus\n`;
      text += `🤖 Perplexity AI\n\n`;
      
      text += `📧 EMAIL DOMAINS:\n\n`;
      text += `📬 Temp-mail: 15 domains\n`;
      text += `   • jxpomup.com\n`;
      text += `   • ibolinva.com\n`;
      text += `   • and 13 more...\n\n`;
      
      text += `🎵 Spotify: puella.shop\n`;
      text += `📨 Other services: dressrosa.me, puella.shop\n\n`;
      
      text += `⚡ Select a service below ↓`;
      
    } else if (BOT_TYPE === 'admin') {
      text += `🤖 ${BOT_NAME} - ADMIN BOT\n\n`;
      
      text += `📋 8 PREMIUM SERVICES:\n\n`;
      
      text += `🎨 Canva\n`;
      text += `✂️ CapCut\n`;
      text += `🎵 Spotify\n`;
      text += `📚 Scribd\n`;
      text += `🧠 Quizlet Plus\n`;
      text += `🤖 Perplexity AI\n`;
      text += `📺 HBO Max\n`;
      text += `✍️ Grammarly\n\n`;
      
      text += `📧 EMAIL DOMAINS:\n\n`;
      
      text += `📬 Temp-mail: 15 domains\n`;
      text += `   • jxpomup.com\n`;
      text += `   • ibolinva.com\n`;
      text += `   • and 13 more...\n\n`;
      
      text += `🎵 Spotify: deiyn.xyz, deiyn.shop\n`;
      text += `📨 Other services: deiyn.xyz, deiyn.shop\n\n`;
      
      text += `⚡ FEATURES:\n`;
      text += `   • OTP in 5-15 seconds\n`;
      text += `   • Auto link extraction\n`;
      text += `   • Premium domains\n\n`;
      
      text += `⚡ Select a service below ↓`;
    }
    
    await bot.sendMessage(msg.chat.id, text, getMainKeyboard(userId));
  });

  bot.onText(/\/stats/, async (msg) => {
    const userId = msg.from.id.toString();
    if (!isAuthorized(userId) || isBanned(userId)) return;
    
    const user = authorizedUsers[userId];
    const successRate = user.totalRequests > 0 ? Math.round((user.successfulRequests / user.totalRequests) * 100) : 0;
    
    let statsText = `📊 YOUR STATS\n\n` +
      `👤 ${user.fullName}\n` +
      `🔢 Total: ${user.totalRequests}\n` +
      `✅ Success: ${user.successfulRequests} (${successRate}%)\n` +
      `❌ Failed: ${user.failedRequests}\n` +
      `📅 Member: ${new Date(user.addedDate).toLocaleDateString()}`;
    
    if (isAdmin(userId)) {
      const totalUsers = Object.keys(authorizedUsers).length;
      const totalRequests = botStats.totalRequests;
      const totalSuccess = botStats.successfulRequests;
      const overallRate = totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 0;
      
      statsText += `\n\n🔐 Admin Panel Active\n`;
      statsText += `📧 ${GMAIL_USER}\n`;
      statsText += `🤖 ${BOT_NAME}\n`;
      statsText += `👥 Users: ${totalUsers}\n`;
      statsText += `📊 Total: ${totalRequests}\n`;
      statsText += `✅ Rate: ${overallRate}%\n\n`;
      
      statsText += `Service Stats:\n`;
      const serviceEmojis = { 
        paypal: '💳', canva: '🎨', capcut: '✂️', spotify: '🎵',
        hbo: '📺', scribd: '📚', quizlet: '🧠', perplexity: '🤖'
      };
      Object.keys(botStats.serviceStats).forEach(service => {
        const stats = botStats.serviceStats[service];
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          const emoji = serviceEmojis[service];
          statsText += `${emoji} ${service}: ${stats.total} (${rate}%, ${avg}s)\n`;
        }
      });
    }
    
    await bot.sendMessage(msg.chat.id, statsText);
  });

  bot.onText(/\/history/, async (msg) => {
    const userId = msg.from.id.toString();
    if (!isAuthorized(userId) || isBanned(userId)) return;
    
    const user = authorizedUsers[userId];
    
    if (!user.requestHistory || user.requestHistory.length === 0) {
      return bot.sendMessage(msg.chat.id, `📜 No request history yet.`);
    }
    
    let historyText = `📜 YOUR HISTORY\n\n`;
    
    const serviceEmojis = { 
      paypal: '💳', canva: '🎨', capcut: '✂️', spotify: '🎵',
      hbo: '📺', scribd: '📚', quizlet: '🧠', perplexity: '🤖'
    };
    
    user.requestHistory.slice(0, 10).forEach((req, index) => {
      const emoji = serviceEmojis[req.service] || '📧';
      const status = req.success ? '✅' : '❌';
      const time = new Date(req.timestamp).toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      historyText += `${index + 1}. ${emoji} ${req.service} ${status}\n`;
      historyText += `   ${time} (${req.timeTaken || 0}s)\n\n`;
    });
    
    await bot.sendMessage(msg.chat.id, historyText);
  });

  bot.onText(/\/dashboard/, async (msg) => {
    const userId = msg.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const totalUsers = Object.keys(authorizedUsers).length;
    const bannedCount = Object.keys(bannedUsers).length;
    const totalRequests = botStats.totalRequests;
    const successRate = totalRequests > 0 ? Math.round((botStats.successfulRequests / totalRequests) * 100) : 0;
    
    const topUsers = Object.values(authorizedUsers)
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 5);
    
    let dashText = `📊 ADMIN DASHBOARD\n\n`;
    dashText += `👥 Total Users: ${totalUsers}\n`;
    dashText += `🚫 Banned: ${bannedCount}\n`;
    dashText += `📊 Total Requests: ${totalRequests}\n`;
    dashText += `✅ Success Rate: ${successRate}%\n\n`;
    
    dashText += `Service Performance:\n`;
    const serviceEmojis = { 
      paypal: '💳', canva: '🎨', capcut: '✂️', spotify: '🎵',
      hbo: '📺', scribd: '📚', quizlet: '🧠', perplexity: '🤖'
    };
    Object.keys(botStats.serviceStats).forEach(service => {
      const stats = botStats.serviceStats[service];
      if (stats.total > 0) {
        const rate = Math.round((stats.success / stats.total) * 100);
        const avg = Math.round(stats.avgTime);
        const emoji = serviceEmojis[service];
        dashText += `${emoji} ${service}: ${stats.total} req (${rate}%, ${avg}s)\n`;
      }
    });
    
    dashText += `\nTop 5 Users:\n`;
    topUsers.forEach((user, index) => {
      dashText += `${index + 1}. ${user.fullName} - ${user.totalRequests} req\n`;
    });
    
    await bot.sendMessage(msg.chat.id, dashText);
  });

  bot.onText(/\/ban (.+)/, async (msg, match) => {
    const userId = msg.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const targetUserId = match[1].trim();
    
    if (banUser(targetUserId, 'Banned by admin')) {
      await bot.sendMessage(msg.chat.id, `✅ User ${targetUserId} has been banned.`);
    } else {
      await bot.sendMessage(msg.chat.id, `❌ Failed to ban user ${targetUserId}.`);
    }
  });

  bot.onText(/\/unban (.+)/, async (msg, match) => {
    const userId = msg.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const targetUserId = match[1].trim();
    
    if (unbanUser(targetUserId)) {
      await bot.sendMessage(msg.chat.id, `✅ User ${targetUserId} has been unbanned.`);
    } else {
      await bot.sendMessage(msg.chat.id, `❌ Failed to unban user ${targetUserId}.`);
    }
  });

  bot.onText(/\/banlist/, async (msg) => {
    const userId = msg.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const banned = Object.values(bannedUsers);
    
    if (banned.length === 0) {
      return bot.sendMessage(msg.chat.id, `📋 No banned users.`);
    }
    
    let listText = `🚫 BANNED USERS\n\n`;
    
    banned.forEach((user, index) => {
      listText += `${index + 1}. ${user.fullName}\n`;
      listText += `   ID: ${user.userId}\n`;
      listText += `   Reason: ${user.reason}\n`;
      listText += `   Date: ${new Date(user.bannedDate).toLocaleDateString()}\n\n`;
    });
    
    await bot.sendMessage(msg.chat.id, listText);
  });

  bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const userId = msg.from.id.toString();
    if (!isAdmin(userId)) return;
    
    const message = match[1];
    const users = Object.keys(authorizedUsers);
    
    let sent = 0;
    let failed = 0;
    
    for (const targetUserId of users) {
      if (isBanned(targetUserId)) continue;
      
      try {
        await bot.sendMessage(targetUserId,
          `📢 ANNOUNCEMENT\n\n${message}\n\n- Admin`
        );
        sent++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        failed++;
      }
    }
    
    await bot.sendMessage(msg.chat.id, 
      `✅ Broadcast complete!\n\nSent: ${sent}\nFailed: ${failed}`
    );
  });

  bot.on('callback_query', async (query) => {
  try {
    // Always answer callback query to remove loading state
    await bot.answerCallbackQuery(query.id).catch(() => {});
    

    const userId = query.from.id.toString();
    const chatId = query.message.chat.id;
    const data = query.data;
    
    await bot.answerCallbackQuery(query.id);
    
    if (isBanned(userId)) {
      return bot.sendMessage(chatId, '🚫 You have been banned from using this bot.');
    }
    
    if (!isAuthorized(userId)) {
      return bot.sendMessage(chatId, '❌ Unauthorized! Use /start first.');
    }
    
    if (!userSessions[userId]) {
      userSessions[userId] = { 
        email: null, 
        awaitingEmail: false,
        awaitingAdminMessage: false,
        service: null,
        canvaType: null,
        spotifyType: null,
        hboType: null,
        scribdType: null,
        quizletType: null,
        perplexityType: null,
        messagesToDelete: []
      };
    }
    
    if (data === 'cancel') {
      await deleteMsg(chatId, query.message.message_id);
      
      userSessions[userId] = { 
        email: null, 
        awaitingEmail: false,
        awaitingAdminMessage: false,
        service: null,
        canvaType: null,
        spotifyType: null,
        hboType: null,
        scribdType: null,
        quizletType: null,
        perplexityType: null,
        messagesToDelete: []
      };
      
      await bot.sendMessage(chatId, 
        `❌ Cancelled\n\n⚡ Select service below ↓`,
        getMainKeyboard(userId)
      );
      return;
    }
    
    if (data === 'message_admin') {
      if (isAdmin(userId)) {
        await bot.sendMessage(chatId, `ℹ️ You are the admin!`);
        return;
      }
      
      await deleteMsg(chatId, query.message.message_id);
      
      userSessions[userId].awaitingAdminMessage = true;
      
      const msgPrompt = await bot.sendMessage(chatId,
        `💬 Message Admin\n\nType your message to send to admin:`,
        { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        }
      );
      
      userSessions[userId].messagesToDelete.push(msgPrompt.message_id);
      return;
    }
    
    if (data === 'stats') {
      const user = authorizedUsers[userId];
      const successRate = user.totalRequests > 0 ? Math.round((user.successfulRequests / user.totalRequests) * 100) : 0;
      
      let statsText = `📊 YOUR STATS\n\n` +
        `👤 ${user.fullName}\n` +
        `🔢 Total: ${user.totalRequests}\n` +
        `✅ Success: ${user.successfulRequests} (${successRate}%)\n` +
        `❌ Failed: ${user.failedRequests}`;
      
      if (isAdmin(userId)) {
        const totalUsers = Object.keys(authorizedUsers).length;
        statsText += `\n\n🔐 Admin Panel Active\n`;
        statsText += `📧 ${GMAIL_USER}\n`;
        statsText += `👥 Users: ${totalUsers}\n`;
        statsText += `📊 Total: ${botStats.totalRequests}`;
      }
      
      await bot.sendMessage(chatId, statsText);
      return;
    }
    
    if (data === 'history') {
      const user = authorizedUsers[userId];
      
      if (!user.requestHistory || user.requestHistory.length === 0) {
        return bot.sendMessage(chatId, `📜 No history yet.`);
      }
      
      let historyText = `📜 HISTORY\n\n`;
      
      const serviceEmojis = { 
        paypal: '💳', canva: '🎨', capcut: '✂️', spotify: '🎵',
        hbo: '📺', scribd: '📚', quizlet: '🧠', perplexity: '🤖'
      };
      
      user.requestHistory.slice(0, 10).forEach((req, index) => {
        const emoji = serviceEmojis[req.service];
        const status = req.success ? '✅' : '❌';
        const time = new Date(req.timestamp).toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        historyText += `${index + 1}. ${emoji} ${req.service} ${status} (${req.timeTaken || 0}s)\n`;
        historyText += `   ${time}\n\n`;
      });
      
      await bot.sendMessage(chatId, historyText);
      return;
    }
    
    if (data === 'help') {
      let helpText = `❓ HELP / GUIDE\n\n`;
      
      helpText += `How to use:\n`;
      helpText += `1. Select a service\n`;
      helpText += `2. Enter your email\n`;
      helpText += `3. Request OTP from service\n`;
      helpText += `4. Bot fetches code\n\n`;
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      helpText += `Email Domains:\n`;
      helpText += `✂️ CapCut: temp-mail or generator\n`;
      helpText += `🎨 Canva: ${CANVA_DOMAINS[0]}, ${gmailDomain}\n`;
      helpText += `🎵 Spotify: ${SPOTIFY_DOMAIN}\n`;
      helpText += `📺🧠📚🤖 New services: ${gmailDomain}\n\n`;
      
      helpText += `Features:\n`;
      helpText += `📊 /stats - Your statistics\n`;
      helpText += `📜 /history - Request history\n`;
      helpText += `💬 Message Admin - Contact admin\n\n`;
      
      helpText += `Rate Limits:\n`;
      helpText += `• ${RATE_LIMITS.requests_per_10min} requests per 10 min\n`;
      helpText += `• ${RATE_LIMITS.requests_per_day} requests per day`;
      
      await bot.sendMessage(chatId, helpText);
      return;
    }
    
    if (data.startsWith('service_')) {
      const service = data.replace('service_', '');
      userSessions[userId].service = service;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const serviceEmojis = {
        paypal: '💳',
        canva: '🎨',
        capcut: '✂️',
        spotify: '🎵',
        hbo: '📺',
        scribd: '📚',
        quizlet: '🧠',
        perplexity: '🤖'
      };
      
      const serviceEmoji = serviceEmojis[service];
      const serviceName = service ? service.charAt(0).toUpperCase() + service.slice(1) : 'Unknown';
      
      let emailText = `${serviceEmoji} ${serviceName} Service\n\n`;
      
      if (service === 'paypal') {
        emailText += `📧 Enter your PayPal email:\n\n`;
        emailText += `✅ Request OTP from PayPal first\n`;
        emailText += `✅ Then enter the email below\n\n`;
        
        const stats = botStats.serviceStats.paypal;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        emailText += `Type your PayPal email below ↓`;
        
        const emailPrompt = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
        userSessions[userId].awaitingEmail = true;
        
      } else if (service === 'capcut') {
        emailText += `📧 Enter your CapCut email:\n\n`;
        
        emailText += `⚡ TEMP-MAIL:\n`;
        emailText += `• ${TEMP_MAIL_DOMAINS.slice(0, 3).join('\n• ')}\n`;
        emailText += `• ...and ${TEMP_MAIL_DOMAINS.length - 3} more\n\n`;
        
        emailText += `🔧 GENERATOR:\n`;
        emailText += `• Any custom domain\n\n`;
        
        const stats = botStats.serviceStats.capcut;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        emailText += `Type your email below ↓`;
        
        const emailPrompt = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
        userSessions[userId].awaitingEmail = true;
        
      } else if (service === 'canva') {
        emailText += `🔍 What do you need?\n\n`;
        
        const gmailDomain = CURRENT_GMAIL_DOMAIN;
        
        emailText += `📧 CANVA DOMAINS:\n`;
        emailText += `• ${CANVA_DOMAINS[0]}\n`;
        emailText += `• ${gmailDomain}\n\n`;
        
        const stats = botStats.serviceStats.canva;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        const typeBtn = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
[{ text: '🆕 Signup Code', callback_data: 'canva_signup' }],
[{ text: '🔐 Login Code', callback_data: 'canva_login' }],
[{ text: '🔑 Reset Password', callback_data: 'canva_reset' }],
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
        
      } else if (service === 'spotify') {
        emailText += `🔍 What do you want?\n\n`;
        emailText += `📧 SPOTIFY:\n`;
        emailText += `• ${SPOTIFY_DOMAIN}\n\n`;
        
        const stats = botStats.serviceStats.spotify;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
const typeBtn = await bot.sendMessage(chatId, emailText, { 
  reply_markup: {
    inline_keyboard: [
      [{ text: '🔢 OTP Code Only', callback_data: 'spotify_otp' }],
      [{ text: '🔗 Reset Link Only', callback_data: 'spotify_reset' }],
      [{ text: '🔄 Both (OTP + Link)', callback_data: 'spotify_both' }],
      [{ text: '🤖 Auto Reset + Fetch', callback_data: 'spotify_autofull' }], // ✅ ADD THIS
      [{ text: '❌ Cancel', callback_data: 'cancel' }]
    ]
  }
});
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
        
      } else if (service === 'hbo') {
        // HBO - Admin Bot (Bot 3) only
        if (BOT_TYPE !== 'admin') {
          await bot.sendMessage(chatId, '📺 HBO Max is only available on Bot 3 (Admin Bot)');
          return;
        }
        
        emailText += `🔍 What do you need?\n\n`;
        
        const gmailDomain = CURRENT_GMAIL_DOMAIN;
        emailText += `📧 EMAIL: ${gmailDomain}\n\n`;
        
        const stats = botStats.serviceStats.hbo;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        const typeBtn = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔢 OTP Code', callback_data: 'hbo_otp' }],
              [{ text: '🔗 Reset Link', callback_data: 'hbo_reset' }],
              [{ text: '🔄 Both', callback_data: 'hbo_both' }],
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
        
      } else if (service === 'scribd') {
        emailText += `🔍 What do you need?\n\n`;
        
        const gmailDomain = CURRENT_GMAIL_DOMAIN;
        emailText += `📧 EMAIL: ${gmailDomain}\n\n`;
        
        const stats = botStats.serviceStats.scribd;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        const typeBtn = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔐 Login Code', callback_data: 'scribd_login' }],
              [{ text: '🆕 Signup Code', callback_data: 'scribd_signup' }],
              [{ text: '🔑 Reset Password', callback_data: 'scribd_reset' }],
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
        
      } else if (service === 'quizlet') {
        emailText += `🔍 What do you need?\n\n`;
        
        const gmailDomain = CURRENT_GMAIL_DOMAIN;
        emailText += `📧 EMAIL: ${gmailDomain}\n\n`;
        
        const stats = botStats.serviceStats.quizlet;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        const typeBtn = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Confirmation Link', callback_data: 'quizlet_confirm' }],
              [{ text: '🔑 Reset Password', callback_data: 'quizlet_reset' }],
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
        
      } else if (service === 'perplexity') {
        emailText += `🔍 What do you need?\n\n`;
        
        const gmailDomain = CURRENT_GMAIL_DOMAIN;
        emailText += `📧 EMAIL: ${gmailDomain}\n\n`;
        
        const stats = botStats.serviceStats.perplexity;
        if (stats.total > 0) {
          const rate = Math.round((stats.success / stats.total) * 100);
          const avg = Math.round(stats.avgTime);
          emailText += `📊 Success: ${rate}% | ⏱️ Avg: ${avg}s\n\n`;
        }
        
        const typeBtn = await bot.sendMessage(chatId, emailText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔢 OTP Code', callback_data: 'perplexity_otp' }],
              [{ text: '🔗 Reset Link', callback_data: 'perplexity_reset' }],
              [{ text: '🔄 Both', callback_data: 'perplexity_both' }],
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        });
        
        userSessions[userId].messagesToDelete.push(typeBtn.message_id);
        userSessions[userId].awaitingEmail = false;
      }
      
    } else if (data.startsWith('canva_')) {
      const type = data.replace('canva_', '');
      userSessions[userId].canvaType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const typeText = {
        signup: '🆕 Signup',
        login: '🔐 Login',
        reset: '🔑 Reset'
      }[type];
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      const emailText = `🎨 Canva ${typeText}\n\n` +
        `✉️ Enter email:\n\n` +
        `• ${CANVA_DOMAINS[0]}\n` +
        `• ${gmailDomain}\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
} else if (data.startsWith('spotify_')) {
  const type = data.replace('spotify_', '');
  userSessions[userId].spotifyType = type;
  userSessions[userId].awaitingEmail = true;
  
  await deleteMsg(chatId, query.message.message_id);
  
  const typeText = {
    otp: '🔢 OTP Code',
    reset: '🔗 Reset Link',
    both: '🔄 Both'
  }[type];
  
  const emailText = `🎵 Spotify ${typeText}\n\n` +
    `✉️ Enter email:\n\n` +
    `• username@${SPOTIFY_DOMAIN}\n\n` +
    `Type email below ↓`;
  
  const emailPrompt = await bot.sendMessage(chatId, emailText, { 
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    }
  });
  userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
    } else if (data.startsWith('hbo_')) {
      const type = data.replace('hbo_', '');
      userSessions[userId].hboType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const typeText = {
        confirm: '🔗 Confirmation',
        reset: '🔑 Reset'
      }[type];
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      const emailText = `📺 HBO Max ${typeText}\n\n` +
        `✉️ Enter email:\n\n` +
        `• username@${gmailDomain}\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
    } else if (data.startsWith('scribd_')) {
      const type = data.replace('scribd_', '');
      userSessions[userId].scribdType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const typeText = {
        confirm: '🔗 Confirmation',
        login: '🔐 Login',
        reset: '🔑 Reset'
      }[type];
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      const emailText = `📚 Scribd ${typeText}\n\n` +
        `✉️ Enter email:\n\n` +
        `• username@${gmailDomain}\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
    } else if (data.startsWith('quizlet_')) {
      const type = data.replace('quizlet_', '');
      userSessions[userId].quizletType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const typeText = {
        confirm: '🔗 Confirmation',
        reset: '🔑 Reset'
      }[type];
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      const emailText = `🧠 Quizlet Plus ${typeText}\n\n` +
        `✉️ Enter email:\n\n` +
        `• username@${gmailDomain}\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
    } else if (data.startsWith('perplexity_')) {
      const type = data.replace('perplexity_', '');
      userSessions[userId].perplexityType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const typeText = {
        confirm: '🔗 Confirmation',
        reset: '🔑 Reset'
      }[type];
      
      const gmailDomain = CURRENT_GMAIL_DOMAIN;
      
      const emailText = `🤖 Perplexity AI ${typeText}\n\n` +
        `✉️ Enter email:\n\n` +
        `• username@${gmailDomain}\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);
      
      
    } else if (data.startsWith('grammarly_')) {
      // Admin only
      if (!isAdmin(userId)) {
        await bot.sendMessage(chatId, '🔒 Admin only!');
        return;
      }
      
      const type = data.replace('grammarly_', '');
      userSessions[userId].grammarlyType = type;
      userSessions[userId].awaitingEmail = true;
      
      await deleteMsg(chatId, query.message.message_id);
      
      const emailText = `✍️ Grammarly Verification\n\n` +
        `✉️ Enter email (any temp-mail):\n\n` +
        `Type email below ↓`;
      
      const emailPrompt = await bot.sendMessage(chatId, emailText, { 
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Cancel', callback_data: 'cancel' }]
          ]
        }
      });
      userSessions[userId].messagesToDelete.push(emailPrompt.message_id);

    } else if (data === 'fetch_paypal') {
      await deleteMsg(chatId, query.message.message_id);
      
      // Get email from session (should exist if user came from the email input flow)
      const email = userSessions[userId]?.email;
      if (!email) {
        await bot.sendMessage(chatId, 
          `❌ No email found\n\nPlease use the service menu to enter your email first.\n\n⚡ Select service below ↓`,
          getMainKeyboard(userId)
        );
        return;
      }
      
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        let errorMsg = '⚠️ RATE LIMIT\n\nYou\'ve made too many requests.\nPlease wait';
        if (rateCheck.waitTime) {
          const minutes = Math.ceil(rateCheck.waitTime / 60);
          errorMsg += ` ${minutes} minutes.`;
        } else {
          errorMsg += ' until tomorrow.';
        }
        
        await bot.sendMessage(chatId, errorMsg);
        return;
      }
      
      trackRequest(userId);
      
      const loading = await bot.sendMessage(chatId, 
        `🔍 Searching PayPal\n📧 ${email}\n\n⏳ Please wait...`,
        { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        }
      );
      
      const startTime = Date.now();
      
      try {
        const result = await fetchFromGmail('paypal', email);
        
        await deleteMsg(chatId, loading.message_id);
        
        const timeTaken = result && result.timeTaken ? result.timeTaken : Math.round((Date.now() - startTime) / 1000);
        
        if (!result || !result.code) {
          trackUsage(userId, 'paypal', false, timeTaken);
          
          await bot.sendMessage(chatId, 
            `📭 No results found\n\n` +
            `💡 Request OTP from PayPal\n\n` +
            `⚡ Select service below ↓`,
            getMainKeyboard(userId)
          );
          
          userSessions[userId] = { 
            email: null, 
            awaitingEmail: false, 
            awaitingAdminMessage: false, 
            service: null, 
            canvaType: null, 
            spotifyType: null, 
            hboType: null, 
            scribdType: null, 
            quizletType: null, 
            perplexityType: null, 
            messagesToDelete: [] 
          };
          return;
        }
        
        trackUsage(userId, 'paypal', true, timeTaken);
        
        const minutesAgo = Math.floor((Date.now() - result.date.getTime()) / 1000 / 60);
        
        let responseText = `✅ PAYPAL\n\n`;
        responseText += `🔢 CODE: ${result.code}\n`;
        responseText += `⏰ Received: ${minutesAgo}m ago\n`;
        responseText += `⏱️ Fetched in: ${timeTaken}s\n\n`;
        responseText += `⚡ Select service below ↓`;
        
        await bot.sendMessage(chatId, responseText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Again', callback_data: 'fetch_paypal' }],
              [{ text: '🏠 Menu', callback_data: 'main_menu' }]
            ]
          }
        });
        
        userSessions[userId] = { 
          email: null, 
          awaitingEmail: false, 
          awaitingAdminMessage: false, 
          service: null, 
          canvaType: null, 
          spotifyType: null, 
          hboType: null, 
          scribdType: null, 
          quizletType: null, 
          perplexityType: null, 
          messagesToDelete: [] 
        };
        
      } catch (err) {
        await deleteMsg(chatId, loading.message_id);
        
        const timeTaken = Math.round((Date.now() - startTime) / 1000);
        trackUsage(userId, 'paypal', false, timeTaken);
        
        await bot.sendMessage(chatId, 
          `❌ Failed\n\n⚡ Select service below ↓`,
          getMainKeyboard(userId)
        );
        
        userSessions[userId] = { 
          email: null, 
          awaitingEmail: false, 
          awaitingAdminMessage: false, 
          service: null, 
          canvaType: null, 
          spotifyType: null, 
          hboType: null, 
          scribdType: null, 
          quizletType: null, 
          perplexityType: null, 
          messagesToDelete: [] 
        };
      }
      
    } else if (data === 'main_menu') {
      await deleteMsg(chatId, query.message.message_id);
      await bot.sendMessage(chatId, 
        `⚡ Select service below ↓`,
        getMainKeyboard(userId)
      );
      userSessions[userId] = { 
        email: null, 
        awaitingEmail: false, 
        awaitingAdminMessage: false, 
        service: null, 
        canvaType: null, 
        spotifyType: null, 
        hboType: null, 
        scribdType: null, 
        quizletType: null, 
        perplexityType: null, 
        messagesToDelete: [] 
      };
    }
  } catch (error) {
    console.error("Callback query error:", error);
  }
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = msg.text || '';

    if (text.startsWith('/')) return;
    
    if (isBanned(userId)) {
      return bot.sendMessage(chatId, '🚫 You have been banned from using this bot.');
    }
    
    if (!isAuthorized(userId)) {
      return bot.sendMessage(chatId, '❌ Unauthorized! Use /start first.');
    }

    if (!userSessions[userId]) {
      userSessions[userId] = { 
        email: null, 
        awaitingEmail: false,
        awaitingAdminMessage: false,
        service: null,
        canvaType: null,
        spotifyType: null,
        hboType: null,
        scribdType: null,
        quizletType: null,
        perplexityType: null,
        messagesToDelete: []
      };
    }

    if (userSessions[userId].awaitingAdminMessage) {
      const user = authorizedUsers[userId];
      
      await deleteMsg(chatId, msg.message_id);
      for (const msgId of userSessions[userId].messagesToDelete) {
        await deleteMsg(chatId, msgId);
      }
      userSessions[userId].messagesToDelete = [];
      userSessions[userId].awaitingAdminMessage = false;
      
      try {
        await bot.sendMessage(ADMIN_USER_ID,
          `💬 MESSAGE FROM USER\n\n` +
          `👤 ${user.fullName}\n` +
          `🆔 @${user.username || 'none'}\n` +
          `🔢 ${userId}\n` +
          `📅 ${new Date().toISOString().replace('T', ' ').split('.')[0]} UTC\n\n` +
          `📨 Message:\n${text}`
        );
        
        await bot.sendMessage(chatId,
          `✅ Message sent!\n\n⚡ Select service below ↓`,
          getMainKeyboard(userId)
        );
      } catch (err) {
        await bot.sendMessage(chatId,
          `❌ Failed\n\n⚡ Select service below ↓`,
          getMainKeyboard(userId)
        );
      }
      
      return;
    }

    if (userSessions[userId].awaitingEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(text)) {
        const errMsg = await bot.sendMessage(chatId, '❌ Invalid email format! Try again.');
        setTimeout(() => deleteMsg(chatId, errMsg.message_id), 3000);
        await deleteMsg(chatId, msg.message_id);
        return;
      }
      
      const email = text.trim();
      const service = userSessions[userId].service;
      
      // Validate service exists before proceeding
      if (!service) {
        await bot.sendMessage(chatId, 
          '❌ No service selected\n\nPlease use /start to begin',
          getMainKeyboard(userId)
        );
        return;
      }
      
      // Store email in session for PayPal fetch_paypal handler
      userSessions[userId].email = email;
      
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        await deleteMsg(chatId, msg.message_id);
        
        let errorMsg = '⚠️ RATE LIMIT\n\nYou\'ve made too many requests.\nPlease wait';
        if (rateCheck.waitTime) {
          const minutes = Math.ceil(rateCheck.waitTime / 60);
          errorMsg += ` ${minutes} minutes.`;
        } else {
          errorMsg += ' until tomorrow.';
        }
        
        await bot.sendMessage(chatId, errorMsg);
        return;
      }
      
      trackRequest(userId);
      
if (service === 'spotify') {
  const emailDomain = email.split('@')[1];
  const isValid = CURRENT_SPOTIFY_DOMAINS.includes(emailDomain);
  
  if (!isValid) {
    await deleteMsg(chatId, msg.message_id);
    
    const allowed = CURRENT_SPOTIFY_DOMAINS.map(d => `@${d}`).join('\n• ');
    await bot.sendMessage(chatId, 
      `❌ Invalid domain!\n\n` +
      `✅ Allowed:\n• ${allowed}`
    );
    return;
  }
}
      
      userSessions[userId].awaitingEmail = false;
      
      await deleteMsg(chatId, msg.message_id);
      for (const msgId of userSessions[userId].messagesToDelete) {
        await deleteMsg(chatId, msgId);
      }
      userSessions[userId].messagesToDelete = [];
      
      const serviceEmojis = {
        canva: '🎨',
        capcut: '✂️',
        spotify: '🎵',
        paypal: '💳',
        hbo: '📺',
        scribd: '📚',
        quizlet: '🧠',
        perplexity: '🤖',
        grammarly: '✍️'
      };
      
      const serviceEmoji = serviceEmojis[service];
      const serviceName = service ? service.charAt(0).toUpperCase() + service.slice(1) : 'Unknown';
      
      const loading = await bot.sendMessage(chatId, 
        `🔍 Searching ${serviceName}\n\n⏳ Please wait...`,
        { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel' }]
            ]
          }
        }
      );
      
      const startTime = Date.now();
      
      try {
        let result = null;
        
        if (service === 'capcut') {
          result = await fetchFromTempMail(email);
        } else if (service === 'canva') {
          result = await fetchFromGmail(service, email, userSessions[userId].canvaType);
} else if (service === 'spotify') {
  const spotifyType = userSessions[userId].spotifyType;
  
  // ✅ Auto Reset + Fetch Flow
  if (spotifyType === 'autofull') {
    const progressMsg = await bot.sendMessage(chatId, 
      `🤖 AUTO RESET + FETCH\n\n📧 Email: ${email}\n\n🔄 Step 1/3: Sending reset...\n⏳ Please wait...`
    );
    
    const startTime = Date.now();
    
    const progressCallback = async (progress) => {
      let statusText = `🤖 AUTO RESET + FETCH\n\n📧 Email: ${email}\n\n`;
      
      if (progress.step === 1) {
        statusText += `🔄 Step 1/3: ${progress.status}\n`;
      } else if (progress.step === 2) {
        statusText += `✅ Step 1/3: Complete\n🔄 Step 2/3: ${progress.status}\n`;
      } else if (progress.step === 3) {
        statusText += `✅ Step 1/3: Complete\n✅ Step 2/3: Complete\n🔄 Step 3/3: ${progress.status}\n`;
      }
      
      statusText += `\n⏱️ Elapsed: ${Math.round((Date.now() - startTime) / 1000)}s`;
      
      try {
        await bot.editMessageText(statusText, {
          chat_id: chatId,
          message_id: progressMsg.message_id
        });
      } catch (e) {}
    };
    
    result = await autoResetAndFetch(email, service, progressCallback);
    
    await deleteMsg(chatId, progressMsg.message_id);
    
    const timeTaken = result.timeTaken;
    
    if (!result.success) {
      trackUsage(userId, 'spotify_autofull', false, timeTaken);
      
      await bot.sendMessage(chatId, 
        `❌ AUTO RESET FAILED\n\n📧 Email: ${email}\n⚠️ Error: ${result.error}\n\n⏱️ Time: ${timeTaken}s\n\n⚡ Select service below ↓`,
        getMainKeyboard(userId)
      );
      
      userSessions[userId] = { email: null, awaitingEmail: false, service: null, spotifyType: null, messagesToDelete: [] };
      return;
    }
    
    trackUsage(userId, 'spotify_autofull', true, timeTaken);
    
    let responseText = `✅ SPOTIFY AUTO RESET\n\n📧 Email: ${email}\n\n`;
    
    if (result.resetLink) {
      responseText += `🔗 RESET LINK:\n${result.resetLink}\n\n`;
    }
    
    responseText += `⏱️ Total time: ${timeTaken}s\n\n`;
    responseText += `✅ Steps completed:\n1️⃣ Reset request sent\n2️⃣ Email received\n3️⃣ Link extracted\n\n⚡ Select service below ↓`;
    
    await bot.sendMessage(chatId, responseText, { 
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Reset Another', callback_data: 'spotify_autofull' }],
          [{ text: '🏠 Menu', callback_data: 'main_menu' }]
        ]
      }
    });
    
    userSessions[userId] = { email: null, awaitingEmail: false, service: null, spotifyType: null, messagesToDelete: [] };
    return;
  }
  
  // Original flow
  result = await fetchFromGmail(service, email, spotifyType);
} else if (service === 'hbo') {
      if (BOT_TYPE !== 'admin') {
        await bot.sendMessage(chatId, '📺 HBO Max is only available on Bot 3 (Admin Bot)');
        return;
      }

          const hboType = userSessions[userId].hboType === 'both' ? 'otp+reset' : userSessions[userId].hboType;
          result = await fetchFromGmail(service, email, hboType);
        } else if (service === 'scribd') {
          result = await fetchFromGmail(service, email, userSessions[userId].scribdType);
        } else if (service === 'quizlet') {
          const quizletType = userSessions[userId].quizletType === 'both' ? 'otp+reset' : userSessions[userId].quizletType;
          result = await fetchFromGmail(service, email, quizletType);
        } else if (service === 'perplexity') {
          const perplexityType = userSessions[userId].perplexityType === 'both' ? 'otp+reset' : userSessions[userId].perplexityType;
          result = await fetchFromGmail(service, email, perplexityType);
        } else if (service === 'grammarly') {
          if (!isAdmin(userId)) {
            await bot.sendMessage(chatId, '🔒 Admin only!');
            return;
          }
          result = await fetchFromTempMail(email);

        } else if (service === 'paypal') {
          result = await fetchFromGmail('paypal', email);
        }
        
        await deleteMsg(chatId, loading.message_id);
        
        const timeTaken = result && result.timeTaken ? result.timeTaken : Math.round((Date.now() - startTime) / 1000);
        
        if (!result || (result !== 'INVALID_FORMAT' && !result.code && !result.resetLink)) {
          trackUsage(userId, service, false, timeTaken);
          
          await bot.sendMessage(chatId, 
            `📭 No results found\n\n` +
            `💡 Request OTP first\n\n` +
            `⚡ Select service below ↓`,
            getMainKeyboard(userId)
          );
          
          userSessions[userId] = { 
            email: null, 
            awaitingEmail: false, 
            awaitingAdminMessage: false, 
            service: null, 
            canvaType: null, 
            spotifyType: null, 
            hboType: null, 
            scribdType: null, 
            quizletType: null, 
            perplexityType: null, 
            messagesToDelete: [] 
          };
          return;
        }
        
        trackUsage(userId, service, true, timeTaken);
        
        const minutesAgo = Math.floor((Date.now() - result.date.getTime()) / 1000 / 60);
        
        let responseText = `✅ ${serviceName.toUpperCase()}\n\n`;
        
        if (result.code) {
          responseText += `🔢 CODE: ${result.code}\n`;
        }
        
        if (result.resetLink) {
          responseText += `🔗 RESET LINK:\n${result.resetLink}\n`;
        }
        
        responseText += `⏰ Received: ${minutesAgo}m ago\n`;
        responseText += `⏱️ Fetched in: ${timeTaken}s\n\n`;
        responseText += `⚡ Select service below ↓`;
        
        await bot.sendMessage(chatId, responseText, { 
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Again', callback_data: `service_${service}` }],
              [{ text: '🏠 Menu', callback_data: 'main_menu' }]
            ]
          }
        });
        
        userSessions[userId] = { 
          email: null, 
          awaitingEmail: false, 
          awaitingAdminMessage: false, 
          service: null, 
          canvaType: null, 
          spotifyType: null, 
          hboType: null, 
          scribdType: null, 
          quizletType: null, 
          perplexityType: null, 
          messagesToDelete: [] 
        };
        
      } catch (err) {
        await deleteMsg(chatId, loading.message_id);
        
        const timeTaken = Math.round((Date.now() - startTime) / 1000);
        trackUsage(userId, service, false, timeTaken);
        
        await bot.sendMessage(chatId, 
          `❌ Failed\n\n⚡ Select service below ↓`,
          getMainKeyboard(userId)
        );
        
        userSessions[userId] = { 
          email: null, 
          awaitingEmail: false, 
          awaitingAdminMessage: false, 
          service: null, 
          canvaType: null, 
          spotifyType: null, 
          hboType: null, 
          scribdType: null, 
          quizletType: null, 
          perplexityType: null, 
          messagesToDelete: [] 
        };
      }
    }
  });
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  if (bot) {
    try {
      bot.stopPolling();
    } catch (e) {}
  }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

loadUsers();
loadBannedUsers();
loadStats();
initBot();
console.log(`✅ ${BOT_NAME} is ready and running!`);
console.log(`📅 Started: ${new Date().toISOString().replace('T', ' ').split('.')[0]} UTC\n`);

// ════════════════════════════════════════════════════════════
// IMPROVED POLLING ERROR HANDLER - NO INFINITE LOOPS
// ════════════════════════════════════════════════════════════

let pollingRestarts = 0;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s - exponential backoff

bot.on('polling_error', async (error) => {
  console.error('❌ Polling:', error.code || 'UNKNOWN', '-', error.message || 'No message');

  // ════════════════════════════════════════════════════════════
  // HANDLE 409 CONFLICT - Another instance is already running
  // ════════════════════════════════════════════════════════════
  if (error.code === 'ETELEGRAM' && error.message && error.message.includes('409 Conflict')) {
    console.error('🚨 409 CONFLICT DETECTED!');
    console.error('⚠️  Another bot instance is already polling with this token!');
    console.error('🛑 Shutting down THIS instance to prevent conflicts...\n');
    
    try {
      await bot.stopPolling();
      console.log('✅ Polling stopped cleanly');
    } catch (e) {
      console.error('❌ Error stopping polling:', e.message);
    }
    
    console.log('🔴 Exiting process...');
    process.exit(1); // Exit cleanly - container will restart if needed
  }

  // ════════════════════════════════════════════════════════════
  // HANDLE EFATAL - Network/connection errors with restart limit
  // ════════════════════════════════════════════════════════════
  if (error.code === 'EFATAL') {
    if (pollingRestarts >= MAX_RESTART_ATTEMPTS) {
      console.error(`🚫 Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached.`);
      console.error('🛑 Exiting process. Container will restart with fresh state.');
      
      try {
        await bot.stopPolling();
      } catch (e) {}
      
      process.exit(1); // Let container orchestrator restart
    }

    const delay = RESTART_DELAYS[pollingRestarts] || 30000;
    pollingRestarts++;
    
    console.log(`🔄 Attempting restart ${pollingRestarts}/${MAX_RESTART_ATTEMPTS}`);
    console.log(`⏱️  Waiting ${delay / 1000}s before restart (exponential backoff)...`);

    setTimeout(async () => {
      try {
        console.log('🛑 Stopping polling...');
        await bot.stopPolling();
        
        // Wait 2 seconds before restarting to ensure clean disconnect
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('🔄 Starting polling...');
        await bot.startPolling();
        
        console.log('✅ Polling restarted successfully!');
        pollingRestarts = 0; // Reset counter on successful restart
        
      } catch (restartError) {
        console.error('❌ Restart failed:', restartError.message);
        
        if (pollingRestarts >= MAX_RESTART_ATTEMPTS) {
          console.error('🛑 Max attempts reached. Exiting...');
          process.exit(1);
        }
      }
    }, delay);
  }
});

// Graceful error handling for other errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('   Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('   Stack:', error.stack);
  // Don't exit immediately - let polling error handler manage it
});
