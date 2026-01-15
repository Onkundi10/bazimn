// Dashboard logic for buyers, sellers and admins

async function initDashboard() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  const content = document.getElementById('dashboard-content');
  if (!token || !role) {
    content.innerHTML = '<p>You must be logged in to view the dashboard. <a href="/index.html">Return home</a>.</p>';
    return;
  }
  if (role === 'admin') {
    await loadAdminDashboard(token);
  } else {
    await loadUserDashboard(token, role);
  }
}

async function loadUserDashboard(token, role) {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = '<p>Loading your orders…</p>';
  try {
    // Fetch orders
    const ordersRes = await fetch('/api/orders', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const ordersData = await ordersRes.json();
    if (!ordersRes.ok) {
      content.innerHTML = `<p>Error loading orders: ${ordersData.error}</p>`;
      return;
    }
    const orders = ordersData.orders || [];
    // Fetch all gigs for mapping titles
    const gigsRes = await fetch('/api/gigs');
    const gigsData = await gigsRes.json();
    const gigsMap = {};
    if (gigsRes.ok) {
      gigsData.gigs.forEach(gig => { gigsMap[gig.id] = gig; });
    }
    if (orders.length === 0) {
      content.innerHTML = '<p>No orders yet.</p>';
      return;
    }
    // Create orders list
    const list = document.createElement('div');
    list.className = 'orders';
    orders.forEach(order => {
      const card = document.createElement('div');
      card.className = 'gig-card';
      const title = gigsMap[order.gigId] ? gigsMap[order.gigId].title : 'Custom Order';
      card.innerHTML = `<h3>Order #${order.id}</h3>` +
                       `<p><strong>Gig:</strong> ${title}</p>` +
                       `<p><strong>Amount:</strong> $${order.amount}</p>` +
                       `<p><strong>Status:</strong> ${order.status}</p>`;
      // Buttons container
      const actionsDiv = document.createElement('div');
      // Mark complete button if not completed
      if (order.status !== 'completed') {
        const completeBtn = document.createElement('button');
        completeBtn.textContent = 'Mark Complete';
        completeBtn.addEventListener('click', async () => {
          await completeOrder(token, order.id);
        });
        actionsDiv.appendChild(completeBtn);
      }
      // Dispute button
      const disputeBtn = document.createElement('button');
      disputeBtn.textContent = 'Open Dispute';
      disputeBtn.addEventListener('click', async () => {
        const reason = prompt('Describe the reason for the dispute:');
        if (reason) {
          await openDispute(token, order.id, reason);
        }
      });
      actionsDiv.appendChild(disputeBtn);
      // Messages button
      const messagesBtn = document.createElement('button');
      messagesBtn.textContent = 'Messages';
      messagesBtn.addEventListener('click', () => {
        showMessagesSection(order.id, token);
      });
      actionsDiv.appendChild(messagesBtn);
      card.appendChild(actionsDiv);
      list.appendChild(card);
    });
    // Messages section placeholder
    const messagesSection = document.createElement('div');
    messagesSection.id = 'messages-section';
    messagesSection.className = 'hidden';
    content.innerHTML = '';
    content.appendChild(list);
    content.appendChild(messagesSection);
  } catch (err) {
    content.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

async function completeOrder(token, orderId) {
  try {
    const res = await fetch('/api/complete-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ orderId })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Order completed');
      initDashboard();
    } else {
      alert('Error: ' + (data.error || 'Could not complete order'));
    }
  } catch (err) {
    alert('Network error');
  }
}

async function openDispute(token, orderId, reason) {
  try {
    const res = await fetch('/api/disputes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({ orderId, reason })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Dispute created');
    } else {
      alert('Error: ' + (data.error || 'Could not create dispute'));
    }
  } catch (err) {
    alert('Network error');
  }
}

// Display messages for an order and allow sending
async function showMessagesSection(orderId, token) {
  const section = document.getElementById('messages-section');
  section.classList.remove('hidden');
  section.innerHTML = `<h3>Messages for Order #${orderId}</h3><p>Loading…</p>`;
  try {
    const res = await fetch(`/api/messages?orderId=${orderId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (res.ok) {
      const messages = data.messages || [];
      const list = document.createElement('div');
      messages.forEach(msg => {
        const p = document.createElement('p');
        const sender = msg.senderId === localStorage.getItem('userId') ? 'You' : 'Other';
        const date = new Date(msg.timestamp).toLocaleString();
        p.textContent = `[${date}] ${sender}: ${msg.text}`;
        list.appendChild(p);
      });
      // Form to send new message
      const form = document.createElement('form');
      form.innerHTML = '<label>New message:<br><input type="text" name="text" required style="width:100%"></label><button type="submit">Send</button>';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.elements['text'].value.trim();
        if (!text) return;
        const sendRes = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({ orderId, text })
        });
        const sendData = await sendRes.json();
        if (sendRes.ok) {
          form.reset();
          showMessagesSection(orderId, token);
        } else {
          alert('Error sending message: ' + (sendData.error || 'Unknown'));
        }
      });
      section.innerHTML = '';
      section.appendChild(list);
      section.appendChild(form);
    } else {
      section.innerHTML = `<p>Error loading messages: ${data.error}</p>`;
    }
  } catch (err) {
    section.innerHTML = `<p>Network error</p>`;
  }
}

// Admin dashboard
async function loadAdminDashboard(token) {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = '<p>Loading admin data…</p>';
  try {
    const [usersRes, gigsRes, ordersRes, disputesRes] = await Promise.all([
      fetch('/api/adm/users', { headers: { Authorization: 'Bearer ' + token } }),
      fetch('/api/adm/gigs', { headers: { Authorization: 'Bearer ' + token } }),
      fetch('/api/adm/orders', { headers: { Authorization: 'Bearer ' + token } }),
      fetch('/api/adm/disputes', { headers: { Authorization: 'Bearer ' + token } })
    ]);
    const usersData = await usersRes.json();
    const gigsData = await gigsRes.json();
    const ordersData = await ordersRes.json();
    const disputesData = await disputesRes.json();
    if (!usersRes.ok || !gigsRes.ok || !ordersRes.ok || !disputesRes.ok) {
      content.innerHTML = '<p>Error loading admin data.</p>';
      return;
    }
    // Build admin interface
    const usersList = document.createElement('div');
    usersList.innerHTML = '<h3>Users</h3>';
    usersData.users.forEach(u => {
      const p = document.createElement('p');
      p.textContent = `${u.id} – ${u.username} (${u.role})`;
      if (u.role !== 'admin') {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (confirm('Delete user ' + u.username + '?')) {
            await adminDeleteUser(token, u.id);
          }
        });
        p.appendChild(delBtn);
      }
      usersList.appendChild(p);
    });
    const gigsList = document.createElement('div');
    gigsList.innerHTML = '<h3>Gigs</h3>';
    gigsData.gigs.forEach(g => {
      const p = document.createElement('p');
      p.textContent = `${g.id} – ${g.title} (Seller ${g.sellerId})`;
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (confirm('Delete gig ' + g.title + '?')) {
          await adminDeleteGig(token, g.id);
        }
      });
      p.appendChild(delBtn);
      gigsList.appendChild(p);
    });
    const ordersList = document.createElement('div');
    ordersList.innerHTML = '<h3>Orders</h3>';
    ordersData.orders.forEach(o => {
      const p = document.createElement('p');
      p.textContent = `${o.id}: buyer ${o.buyerId}, seller ${o.sellerId}, gig ${o.gigId}, status ${o.status}`;
      ordersList.appendChild(p);
    });
    const disputesList = document.createElement('div');
    disputesList.innerHTML = '<h3>Disputes</h3>';
    disputesData.disputes.forEach(d => {
      const p = document.createElement('p');
      p.textContent = `${d.id}: order ${d.orderId}, status ${d.status}, reason: ${d.reason}`;
      if (d.status === 'open') {
        const resolveBtn = document.createElement('button');
        resolveBtn.textContent = 'Resolve';
        resolveBtn.addEventListener('click', async () => {
          const resolution = prompt('Resolution description:');
          const releaseToSeller = confirm('Release funds to seller? OK for yes, Cancel for refund to buyer');
          await adminResolveDispute(token, d.id, resolution, releaseToSeller);
        });
        p.appendChild(resolveBtn);
      }
      disputesList.appendChild(p);
    });
    content.innerHTML = '';
    content.appendChild(usersList);
    content.appendChild(gigsList);
    content.appendChild(ordersList);
    content.appendChild(disputesList);
  } catch (err) {
    content.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}

async function adminDeleteGig(token, gigId) {
  const res = await fetch('/api/adm/delete-gig', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ gigId })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Gig deleted');
    initDashboard();
  } else {
    alert('Error: ' + (data.error || 'Could not delete gig'));
  }
}

async function adminDeleteUser(token, userId) {
  const res = await fetch('/api/adm/delete-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ userId })
  });
  const data = await res.json();
  if (res.ok) {
    alert('User deleted');
    initDashboard();
  } else {
    alert('Error: ' + (data.error || 'Could not delete user'));
  }
}

async function adminResolveDispute(token, disputeId, resolution, releaseToSeller) {
  const res = await fetch('/api/adm/resolve-dispute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ disputeId, resolution, releaseToSeller })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Dispute resolved');
    initDashboard();
  } else {
    alert('Error: ' + (data.error || 'Could not resolve dispute'));
  }
}

document.addEventListener('DOMContentLoaded', initDashboard);