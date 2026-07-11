/**
 * Selahe - Local Static & API Server
 * Serves the website and handles local file storage in the 'v1/data' folder.
 * Zero dependencies, uses only Node.js core modules.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// CORS headers — allow requests from Chrome extensions and localhost
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  // Clean query strings/hash params from path
  const urlPath = req.url.split('?')[0].split('#')[0];

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  // Handle API Endpoints
  if (urlPath.startsWith('/api/')) {
    setCorsHeaders(res);

    const getBody = (callback) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => { callback(body); });
    };

    if (urlPath === '/api/chat' && req.method === 'POST') {
      const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_Selahe;
      const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_Selahe;

      if (!groqKey && !geminiKey) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Server is missing API keys (GEMINI_API_KEY or GROQ_API_KEY) in environment.' }));
        return;
      }

      if (groqKey) {
        // Groq API Mode (Llama 3.1 70B)
        getBody((body) => {
          let payload;
          try {
            payload = JSON.parse(body);
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
          }

          const systemInstructionText = payload.system_instruction?.parts?.[0]?.text || '';
          const messages = [];

          if (systemInstructionText) {
            messages.push({ role: 'system', content: systemInstructionText });
          }

          if (Array.isArray(payload.contents)) {
            payload.contents.forEach(item => {
              const role = item.role === 'model' ? 'assistant' : 'user';
              const text = item.parts?.[0]?.text || '';
              messages.push({ role, content: text });
            });
          }

          const groqPayload = {
            model: 'llama-3.1-70b-versatile',
            messages: messages,
            temperature: 0.1
          };

          const groqReq = https.request('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`
            }
          }, (groqRes) => {
            let resData = '';
            groqRes.on('data', (chunk) => { resData += chunk.toString(); });
            groqRes.on('end', () => {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = groqRes.statusCode;
              if (groqRes.statusCode === 200) {
                try {
                  const data = JSON.parse(resData);
                  const aiText = data.choices[0].message.content;
                  
                  const geminiResponse = {
                    candidates: [
                      {
                        content: {
                          parts: [
                            {
                              text: aiText
                            }
                          ]
                        }
                      }
                    ],
                    usageMetadata: {
                      promptTokenCount: data.usage?.prompt_tokens || 0,
                      candidatesTokenCount: data.usage?.completion_tokens || 0
                    }
                  };
                  res.end(JSON.stringify(geminiResponse));
                } catch (jsonErr) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Failed to parse Groq response' }));
                }
              } else {
                res.end(resData);
              }
            });
          });

          groqReq.on('error', (err) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          });

          groqReq.write(JSON.stringify(groqPayload));
          groqReq.end();
        });
        return;
      }

      // Fallback: Gemini API Mode
      const queryString = req.url.split('?')[1] || '';
      const params = new URLSearchParams(queryString);
      const model = params.get('model') || 'gemini-2.5-flash';

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      getBody((body) => {
        const geminiReq = https.request(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }, (geminiRes) => {
          res.statusCode = geminiRes.statusCode;
          res.setHeader('Content-Type', 'application/json');
          
          geminiRes.on('data', (chunk) => {
            res.write(chunk);
          });
          
          geminiRes.on('end', () => {
            res.end();
          });
        });

        geminiReq.on('error', (err) => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });

        geminiReq.write(body);
        geminiReq.end();
      });
      return;
    }

    if (urlPath === '/api/sessions') {
      const filePath = path.join(DATA_DIR, 'sessions.json');

      if (req.method === 'GET') {
        fs.readFile(filePath, 'utf8', (err, data) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(err ? '{}' : data);
        });
        return;
      }

      if (req.method === 'POST') {
        getBody((body) => {
          fs.writeFile(filePath, body, 'utf8', (err) => {
            res.setHeader('Content-Type', 'application/json');
            if (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            }
          });
        });
        return;
      }
    }

    if (urlPath === '/api/tasks') {
      const filePath = path.join(DATA_DIR, 'tasks.json');

      if (req.method === 'GET') {
        fs.readFile(filePath, 'utf8', (err, data) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(err ? '[]' : data);
        });
        return;
      }

      if (req.method === 'POST') {
        getBody((body) => {
          fs.writeFile(filePath, body, 'utf8', (err) => {
            res.setHeader('Content-Type', 'application/json');
            if (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            }
          });
        });
        return;
      }
    }

    // New endpoint: receive a single card from the browser extension
    if (urlPath === '/api/extension-card' && req.method === 'POST') {
      const filePath = path.join(DATA_DIR, 'tasks.json');
      getBody((body) => {
        let newCard;
        try {
          newCard = JSON.parse(body);
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
          return;
        }

        // Read existing tasks, append new card
        fs.readFile(filePath, 'utf8', (err, data) => {
          const tasks = (!err && data) ? (JSON.parse(data) || []) : [];

          const task = {
            id: 'ext_task_' + Date.now(),
            text: `${newCard.title || 'Action'} (${newCard.timeStart || ''}${newCard.timeStartAmPm || ''} - ${newCard.timeEnd || ''}${newCard.timeEndAmPm || ''} • ${newCard.location || ''})`,
            cardData: newCard,
            date: Date.now(),
            source: 'gemini_extension',
            parentChatUrl: newCard.parentChatUrl || null
          };

          tasks.push(task);

          fs.writeFile(filePath, JSON.stringify(tasks), 'utf8', (writeErr) => {
            res.setHeader('Content-Type', 'application/json');
            if (writeErr) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: writeErr.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, task }));
            }
          });
        });
      });
      return;
    }

    // New endpoint: get tasks by parent Gemini chat URL (for ledger linking)
    if (urlPath.startsWith('/api/tasks-by-url') && req.method === 'GET') {
      const queryString = req.url.split('?')[1] || '';
      const params = new URLSearchParams(queryString);
      const targetUrl = params.get('url');

      const filePath = path.join(DATA_DIR, 'tasks.json');
      fs.readFile(filePath, 'utf8', (err, data) => {
        res.setHeader('Content-Type', 'application/json');
        if (err) {
          res.statusCode = 200;
          res.end('[]');
          return;
        }
        const tasks = JSON.parse(data) || [];
        const matched = tasks.filter(t => t.parentChatUrl && targetUrl && t.parentChatUrl.startsWith(targetUrl));
        res.statusCode = 200;
        res.end(JSON.stringify(matched));
      });
      return;
    }

    // New endpoint: add a ledger update to a specific task (completion log)
    if (urlPath === '/api/ledger-update' && req.method === 'POST') {
      const filePath = path.join(DATA_DIR, 'tasks.json');
      getBody((body) => {
        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const { taskId, dateStr } = payload;

        fs.readFile(filePath, 'utf8', (err, data) => {
          const tasks = (!err && data) ? (JSON.parse(data) || []) : [];
          const taskIndex = tasks.findIndex(t => t.id === taskId);

          if (taskIndex === -1) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
          }

          // Add completion entry
          if (!tasks[taskIndex].completions) tasks[taskIndex].completions = [];
          tasks[taskIndex].completions.push({ date: dateStr, timestamp: Date.now() });

          fs.writeFile(filePath, JSON.stringify(tasks), 'utf8', (writeErr) => {
            res.setHeader('Content-Type', 'application/json');
            if (writeErr) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: writeErr.message }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, task: tasks[taskIndex] }));
            }
          });
        });
      });
      return;
    }

    // Default 404 for other API routes
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
    return;
  }

  // Normalize URL path and map root (and /app/*, /action) to index.html
  let filePath = (urlPath === '/' || urlPath.startsWith('/app/') || urlPath === '/action') ? '/index.html' : urlPath;
  // Resolve absolute path in workspace
  const resolvedPath = path.join(__dirname, filePath);

  // Security: check path is within directory
  if (!resolvedPath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  // Check if file exists
  fs.access(resolvedPath, fs.constants.F_OK, (err) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('File Not Found');
      return;
    }

    // Read and serve file
    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(`Internal Server Error: ${err.code}`);
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Selahe Server is running (Local Storage Active!)`);
  console.log(`  Access the site at: http://localhost:${PORT}`);
  console.log(`  Data stored locally in: ${DATA_DIR}`);
  console.log(`  Extension API endpoints: /api/extension-card, /api/tasks-by-url, /api/ledger-update`);
  console.log(`======================================================\n`);
});
