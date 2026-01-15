const http = require('http');
const fs = require('fs');
const path = require('path');

/*
 * Bazimn marketplace MVP server
 *
 * This file implements a very simple HTTP server without external dependencies.
 * It supports a handful of API endpoints to register/login users, create gigs
 * and orders, and mark orders as complete. Data is stored in JSON files
 * under the `data` directory. For a real production system you would use
 * a database and proper authentication, but this MVP demonstrates the
 * core flows described in the marketplace plan.
 */

// Directory paths
const DATA_DIR = __dirname;
const PUBLIC_DIR = __dirname;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to read a JSON file, returns an array or object
function readJSON(file, defaultValue) {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return defaultValue;
  }
}

// Helper to write data back to JSON file
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Generate a simple token (not secure) based on timestamp and random number
function generateToken() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

// In-memory token store: token -> userId mapping
const tokenStore = {};

// Load or initialize persistent data
let users = readJSON('users.json', []);
let gigs = readJSON('gigs.json', []);
let orders = readJSON('orders.json', []);
let disputes = readJSON('disputes.json', []);

// Ensure there is at least one admin account for management. On first run,
// if no admin exists, create a default admin user with a known password.
if (!users.some(u => u.role === 'admin')) {
  const adminUser = {
    id: (users.length + 1).toString(),
    username: 'admin',
    email: 'admin@bazimn.local',
    password: 'admin',
    role: 'admin',
    wallet: 0,
    verificationLevel: 'trusted',
    createdAt: Date.now()
  };
  users.push(adminUser);
  writeJSON('users.json', users);
}

// Persist data on server exit
function persistData() {
  writeJSON('users.json', users);
  writeJSON('gigs.json', gigs);
  writeJSON('orders.json', orders);
  writeJSON('disputes.json', disputes);
}

// Graceful shutdown to persist data
process.on('SIGINT', () => {
  persistData();
  process.exit();
});

// Parse JSON body from incoming request
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Limit body size to 1MB to prevent abuse
      if (body.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Send a JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Serve static files from PUBLIC_DIR
function serveStatic(req, res) {
  let filePath = req.url;
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }
  const ext = path.extname(filePath);
  const contentTypeMap = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };
  const contentType = contentTypeMap[ext] || 'text/plain';
  const fullPath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'File not found' });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// Main request handler
async function handleRequest(req, res) {
  const { method, url } = req;
  // Extract pathname from URL to handle possible query strings
  const pathname = new URL(req.url, 'http://localhost').pathname;
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }
  // API endpoints start with /api
  if (pathname.startsWith('/api')) {
    try {
      // Parse token from Authorization header if present
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace('Bearer ', '');
      let userId = null;
      if (tokenStore[token]) {
        userId = tokenStore[token];
      }

      // Registration
      if (method === 'POST' && pathname === '/api/register') {
        const data = await parseRequestBody(req);
        const { username, email, password, role } = data;
        if (!username || !email || !password || !role) {
          return sendJson(res, 400, { error: 'Missing fields' });
        }
        if (users.find(u => u.email === email)) {
          return sendJson(res, 400, { error: 'Email already exists' });
        }
        const id = (users.length + 1).toString();
        const newUser = {
          id,
          username,
          email,
          password, // NOTE: storing plain password – do not use in production
          role, // 'buyer' or 'seller'
          wallet: 0,
          verificationLevel: 'basic',
          createdAt: Date.now()
        };
        users.push(newUser);
        writeJSON('users.json', users);
        return sendJson(res, 201, { message: 'User registered', userId: id });
      }
      // Login
      if (method === 'POST' && pathname === '/api/login') {
        const data = await parseRequestBody(req);
        const { email, password } = data;
        if (!email || !password) {
          return sendJson(res, 400, { error: 'Missing credentials' });
        }
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
          return sendJson(res, 401, { error: 'Invalid email or password' });
        }
        const token = generateToken();
        tokenStore[token] = user.id;
        return sendJson(res, 200, { message: 'Logged in', token, role: user.role, userId: user.id });
      }
      // List gigs
      if (method === 'GET' && pathname === '/api/gigs') {
        return sendJson(res, 200, { gigs });
      }
      // Create gig (seller only)
      if (method === 'POST' && pathname === '/api/gigs') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const seller = users.find(u => u.id === userId);
        if (!seller || seller.role !== 'seller') {
          return sendJson(res, 403, { error: 'Only sellers can create gigs' });
        }
        const data = await parseRequestBody(req);
        const { title, description, price, category } = data;
        if (!title || !description || !price) {
          return sendJson(res, 400, { error: 'Missing fields' });
        }
        const id = (gigs.length + 1).toString();
        const newGig = {
          id,
          sellerId: seller.id,
          title,
          description,
          price: parseFloat(price),
          category: category || 'General',
          createdAt: Date.now()
        };
        gigs.push(newGig);
        writeJSON('gigs.json', gigs);
        return sendJson(res, 201, { message: 'Gig created', gig: newGig });
      }
      // Get single gig
      if (method === 'GET' && pathname.startsWith('/api/gigs/')) {
        const parts = url.split('/');
        const gigId = parts[3];
        const gig = gigs.find(g => g.id === gigId);
        if (!gig) {
          return sendJson(res, 404, { error: 'Gig not found' });
        }
        return sendJson(res, 200, { gig });
      }
      // List orders (for buyer or seller)
      if (method === 'GET' && pathname === '/api/orders') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const userOrders = orders.filter(o => o.buyerId === userId || o.sellerId === userId);
        return sendJson(res, 200, { orders: userOrders });
      }
      // Create order (buyer only)
      if (method === 'POST' && pathname === '/api/orders') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const buyer = users.find(u => u.id === userId);
        if (!buyer || buyer.role !== 'buyer') {
          return sendJson(res, 403, { error: 'Only buyers can place orders' });
        }
        const data = await parseRequestBody(req);
        const { gigId } = data;
        const gig = gigs.find(g => g.id === gigId);
        if (!gig) {
          return sendJson(res, 404, { error: 'Gig not found' });
        }
        const orderId = (orders.length + 1).toString();
        const newOrder = {
          id: orderId,
          buyerId: buyer.id,
          sellerId: gig.sellerId,
          gigId: gig.id,
          amount: gig.price,
          status: 'in_progress',
          createdAt: Date.now(),
          escrow: gig.price,
          completedAt: null
        };
        orders.push(newOrder);
        writeJSON('orders.json', orders);
        return sendJson(res, 201, { message: 'Order placed', order: newOrder });
      }
      // Complete order (seller or buyer can mark as complete)
      if (method === 'POST' && pathname === '/api/complete-order') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const data = await parseRequestBody(req);
        const { orderId } = data;
        const order = orders.find(o => o.id === orderId);
        if (!order) {
          return sendJson(res, 404, { error: 'Order not found' });
        }
        // Only buyer or seller involved can complete
        if (order.buyerId !== userId && order.sellerId !== userId) {
          return sendJson(res, 403, { error: 'Not authorized for this order' });
        }
        if (order.status === 'completed') {
          return sendJson(res, 400, { error: 'Order already completed' });
        }
        order.status = 'completed';
        order.completedAt = Date.now();
        // Release escrow: credit seller wallet and reset escrow
        const seller = users.find(u => u.id === order.sellerId);
        if (seller) {
          seller.wallet += order.escrow;
        }
        order.escrow = 0;
        writeJSON('orders.json', orders);
        writeJSON('users.json', users);
        return sendJson(res, 200, { message: 'Order completed', order });
      }

      // Fetch messages for an order
      if (method === 'GET' && pathname.startsWith('/api/messages')) {
        const urlObj = new URL(req.url, `http://localhost`);
        const orderId = urlObj.searchParams.get('orderId');
        if (!orderId) {
          return sendJson(res, 400, { error: 'orderId required' });
        }
        const order = orders.find(o => o.id === orderId);
        if (!order) {
          return sendJson(res, 404, { error: 'Order not found' });
        }
        // Only participants or admin can view messages
        if (userId !== order.buyerId && userId !== order.sellerId) {
          const requestingUser = users.find(u => u.id === userId);
          if (!requestingUser || requestingUser.role !== 'admin') {
            return sendJson(res, 403, { error: 'Not authorised to view messages' });
          }
        }
        order.messages = order.messages || [];
        return sendJson(res, 200, { messages: order.messages });
      }
      // Post a new message in an order
      if (method === 'POST' && pathname === '/api/messages') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const data = await parseRequestBody(req);
        const { orderId, text } = data;
        if (!orderId || !text) {
          return sendJson(res, 400, { error: 'Missing fields' });
        }
        const order = orders.find(o => o.id === orderId);
        if (!order) {
          return sendJson(res, 404, { error: 'Order not found' });
        }
        // Only buyer, seller or admin may send messages
        if (order.buyerId !== userId && order.sellerId !== userId) {
          const requestingUser = users.find(u => u.id === userId);
          if (!requestingUser || requestingUser.role !== 'admin') {
            return sendJson(res, 403, { error: 'Not authorised to send message' });
          }
        }
        order.messages = order.messages || [];
        order.messages.push({ senderId: userId, text, timestamp: Date.now() });
        writeJSON('orders.json', orders);
        return sendJson(res, 201, { message: 'Message sent' });
      }

      // Create a dispute on an order
      if (method === 'POST' && pathname === '/api/disputes') {
        if (!userId) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }
        const data = await parseRequestBody(req);
        const { orderId, reason } = data;
        if (!orderId || !reason) {
          return sendJson(res, 400, { error: 'Missing fields' });
        }
        const order = orders.find(o => o.id === orderId);
        if (!order) {
          return sendJson(res, 404, { error: 'Order not found' });
        }
        // Only participants can file dispute
        if (order.buyerId !== userId && order.sellerId !== userId) {
          return sendJson(res, 403, { error: 'Not authorised to dispute' });
        }
        const disputeId = (disputes.length + 1).toString();
        const newDispute = {
          id: disputeId,
          orderId,
          initiatorId: userId,
          reason,
          status: 'open',
          resolution: null,
          createdAt: Date.now(),
          resolvedAt: null
        };
        disputes.push(newDispute);
        writeJSON('disputes.json', disputes);
        return sendJson(res, 201, { message: 'Dispute created', dispute: newDispute });
      }

      // Admin endpoints grouped by prefix
      if (pathname.startsWith('/api/adm')) {
        // Determine current user and admin status
        const requestingUser = users.find(u => u.id === userId);
        const isAdmin = requestingUser && requestingUser.role === 'admin';
        if (!isAdmin) {
          return sendJson(res, 403, { error: 'Admin only' });
        }
        // GET endpoints
        if (method === 'GET') {
          if (pathname === '/api/adm/users') {
            return sendJson(res, 200, { users });
          }
          if (pathname === '/api/adm/gigs') {
            return sendJson(res, 200, { gigs });
          }
          if (pathname === '/api/adm/orders') {
            return sendJson(res, 200, { orders });
          }
          if (pathname === '/api/adm/disputes') {
            return sendJson(res, 200, { disputes });
          }
        }
        // POST endpoints
        if (method === 'POST') {
          // Delete gig
          if (pathname === '/api/adm/delete-gig') {
            const data = await parseRequestBody(req);
            const { gigId } = data;
            const index = gigs.findIndex(g => g.id === gigId);
            if (index === -1) {
              return sendJson(res, 404, { error: 'Gig not found' });
            }
            gigs.splice(index, 1);
            writeJSON('gigs.json', gigs);
            return sendJson(res, 200, { message: 'Gig deleted' });
          }
          // Delete user
          if (pathname === '/api/adm/delete-user') {
            const data = await parseRequestBody(req);
            const { userId: uid } = data;
            const index = users.findIndex(u => u.id === uid);
            if (index === -1) {
              return sendJson(res, 404, { error: 'User not found' });
            }
            const [removed] = users.splice(index, 1);
            gigs = gigs.filter(g => g.sellerId !== uid);
            orders = orders.filter(o => o.buyerId !== uid && o.sellerId !== uid);
            writeJSON('users.json', users);
            writeJSON('gigs.json', gigs);
            writeJSON('orders.json', orders);
            return sendJson(res, 200, { message: 'User and related data deleted', user: removed });
          }
          // Resolve dispute
          if (pathname === '/api/adm/resolve-dispute') {
            const data = await parseRequestBody(req);
            const { disputeId, resolution, releaseToSeller } = data;
            const dispute = disputes.find(d => d.id === disputeId);
            if (!dispute) {
              return sendJson(res, 404, { error: 'Dispute not found' });
            }
            if (dispute.status !== 'open') {
              return sendJson(res, 400, { error: 'Dispute already resolved' });
            }
            dispute.status = 'resolved';
            dispute.resolution = resolution;
            dispute.resolvedAt = Date.now();
            const order = orders.find(o => o.id === dispute.orderId);
            if (order) {
              if (releaseToSeller) {
                const seller = users.find(u => u.id === order.sellerId);
                if (seller) {
                  seller.wallet += order.escrow;
                }
              }
              order.escrow = 0;
              order.status = 'completed';
              writeJSON('orders.json', orders);
            }
            writeJSON('disputes.json', disputes);
            writeJSON('users.json', users);
            return sendJson(res, 200, { message: 'Dispute resolved', dispute });
          }
        }
        // Unknown admin endpoint
        return sendJson(res, 404, { error: 'Admin endpoint not found' });
      }
      // Unknown API route
      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('Error handling request:', err);
      return sendJson(res, 500, { error: 'Server error' });
    }
  } else {
    // Non-API route: serve static files
    serveStatic(req, res);
  }
}

// Create HTTP server
const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bazimn server listening on port ${PORT}`);
});